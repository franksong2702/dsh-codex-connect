import { taskIsOwnedBy } from './adaptive-task-host-ownership.ts'
import { TASK_HOST_RECOVERY_ONLY } from './adaptive-task-host-policy.ts'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import { taskRecord, taskRoute } from './adaptive-task-contract.ts'
import { portableTaskMessages } from './adaptive-task-context.ts'
import type { TaskChildRun, TaskLedgerDocument } from './adaptive-task-delegation-contract.ts'
import type { AdaptiveTaskDelegationLedger, LedgerIdentity, TaskControlReceipt } from './adaptive-task-delegation-ledger.ts'
import { taskHostServices } from './task-recovery-host.ts'
import type { TaskRecoveryHost } from './task-recovery-host.ts'
import { restoreTaskEvidenceManifest, parseTaskFindings } from './adaptive-task-evidence.ts'
import type { TaskFindings } from './adaptive-task-evidence.ts'
import type { TaskDelegationArtifacts } from './adaptive-task-artifacts.ts'
import { taskFailure, taskIdentity } from './adaptive-task-store.ts'

const TASK_DELEGATE_TOOL = 'delegate_task'
interface HistoricalDelegateInput { goal: string; expectedOutput: string; model: string; effort: string; sourceIds: string[] }
interface RootBinding {
  parent: Agent
  identity: LedgerIdentity
  epoch: string
}
interface HistoricalDelegationReceipt {
  runId: string; callId: string; status: TaskChildRun['state']; resultDigest: string | null
  findings?: TaskFindings
}
interface TaskV2RecoveryOptions {
  ledger: AdaptiveTaskDelegationLedger
  host: TaskRecoveryHost
  artifacts(identity: LedgerIdentity): TaskDelegationArtifacts
}
function historicalInput(value: unknown): HistoricalDelegateInput {
  if (!taskRecord(value) || Object.keys(value).sort().join(',') !== 'effort,expectedOutput,goal,model,sourceIds'
    || !taskRoute({ model: value.model, effort: value.effort }) || typeof value.goal !== 'string' || !value.goal.trim()
    || typeof value.expectedOutput !== 'string' || !value.expectedOutput.trim()
    || Buffer.byteLength(JSON.stringify(value)) > 16 * 1024 || !Array.isArray(value.sourceIds)
    || value.sourceIds.length === 0 || value.sourceIds.length > 32 || value.sourceIds.some(id => typeof id !== 'string')
    || new Set(value.sourceIds).size !== value.sourceIds.length) taskFailure('TASK_CHILD_ARGUMENTS_INVALID')
  return { goal: value.goal, expectedOutput: value.expectedOutput, model: String(value.model), effort: String(value.effort), sourceIds: [...value.sourceIds].sort() }
}
const selectionSeq = (parent: Agent): number => parent.session.snapshotEvents().findLast(event => event.type === 'model/selection')?.seq ?? -1


/** Reconciles saved delegation runs and permits the owner to exit a v2 Task. */
export class TaskV2Recovery {
  private get agents() { return taskHostServices(this.ctx).agents }
  private get sessions() { return taskHostServices(this.ctx).sessions }
  private readonly roots = new Map<Agent, RootBinding>()
  constructor(private readonly ctx: Context, private readonly options: TaskV2RecoveryOptions) {
    ctx.on('agent/request', async ({ agent }, next) => {
      const config = await next()
      await this.dispatchState(agent, 'TASK_CHILD_BINDING_MISMATCH')
      return config
    }, { prepend: true })
    ctx.effect(() => () => this.roots.clear(), 'Saved delegation recovery lifecycle')
  }
  private async document(root: RootBinding): Promise<TaskLedgerDocument> {
    this.options.host.assertRoot(root.parent, root.identity)
    let doc = await this.options.ledger.read(root.identity)
    if (doc.version !== 2) taskFailure('TASK_LEDGER_MIGRATION_REQUIRED')
    if (doc.runtime !== root.epoch) taskFailure('TASK_STALE_EPOCH')
    const end = root.parent.session.snapshotEvents().findLast(event => event.type === 'turn/end')
    if (doc.mode === 'auto' && end?.type === 'turn/end'
      && end.data.reason.kind === 'aborted' && end.data.reason.reason.kind === 'user') {
      doc = await this.options.ledger.revoke(root.identity, doc.revision, 'stopped')
    } else if (doc.mode === 'auto' && selectionSeq(root.parent) !== doc.selectionSeq) {
      doc = await this.options.ledger.revoke(root.identity, doc.revision, 'manual', root.parent.session.seq)
    }
    return doc
  }
  /** Follow both durable and live ownership, including descendants of already-disposed run IDs. */
  private async descendant(agent: Agent): Promise<boolean> {
    const live = this.agents.list()
    const pending: string[] = []
    const parents = (id: string) => {
      const header = this.sessions.get(id as Agent['id'])?.header
      if (header?.parentSession !== undefined) pending.push(header.parentSession)
      for (const owner of live) if (taskIsOwnedBy(this.ctx, id as Agent['id'], owner)) pending.push(owner.id)
    }
    parents(agent.id)
    if (pending.length === 0) return false
    const managed = new Set<string>([...this.roots.keys()].map(root => root.id))
    for (const root of this.roots.values()) {
      const doc = await this.options.ledger.read(root.identity)
      if (doc.version === 2) for (const run of doc.delegation.runs) if (run.childSessionId !== null) managed.add(run.childSessionId)
    }
    const visited = new Set<string>()
    while (pending.length > 0) {
      const id = pending.pop()!
      if (managed.has(id)) return true
      if (visited.has(id)) continue
      if (visited.size >= 64) taskFailure('TASK_CHILD_BINDING_MISMATCH')
      visited.add(id); parents(id)
    }
    return false
  }
  private call(root: RootBinding, callId: string) {
    const calls = root.parent.session.snapshotEvents().filter(event => event.type === 'tool/call' && event.data.callId === callId)
    if (calls.length !== 1 || calls[0]!.type !== 'tool/call' || calls[0]!.data.name !== TASK_DELEGATE_TOOL) taskFailure('TASK_PARENT_CALL_REQUIRED')
    return calls[0]!
  }
  private async receipt(root: RootBinding, run: TaskChildRun, callId: string): Promise<HistoricalDelegationReceipt> {
    const receipt: HistoricalDelegationReceipt = { runId: run.id, callId, status: run.state, resultDigest: run.resultDigest }
    if (run.state === 'succeeded' && run.cleanup === 'verified' && run.resultDigest !== null) {
      receipt.findings = parseTaskFindings(await this.options.artifacts(root.identity).get(run.resultDigest))
    }
    return receipt
  }
  /** Only normal host tool-result correlation can acknowledge delivery; an in-memory result cannot. */
  async reconcile(parent: Agent, requireAll = false): Promise<void> {
    const root = this.roots.get(parent)
    if (root === undefined) taskFailure('TASK_LIVE_ROOT_REQUIRED')
    const doc = await this.document(root)
    for (const run of doc.delegation.runs) {
      const missing = () => { if (requireAll) taskFailure('TASK_DELIVERY_UNCONFIRMED') }
      if (run.cleanup !== 'verified' || !['pending', 'unknown', ...(requireAll ? ['recorded'] : [])].includes(run.delivery)) { missing(); continue }
      const calls = parent.session.snapshotEvents().filter(event => event.type === 'tool/call' && taskIdentity(event.data.callId) === run.callId)
      if (calls.length !== 1 || calls[0]!.type !== 'tool/call') { missing(); continue }
      const call = this.call(root, calls[0]!.data.callId)
      if (taskIdentity(JSON.stringify(historicalInput(JSON.parse(call.data.arguments)))) !== run.argumentDigest) taskFailure('TASK_OPERATION_CONFLICT')
      const expected = JSON.stringify(await this.receipt(root, run, call.data.callId))
      const results = parent.session.snapshotEvents().filter(event => event.type === 'tool/result' && event.data.message.source.callId === call.data.callId)
      if (results.length !== 1 || results[0]!.type !== 'tool/result') { missing(); continue }
      const result = results[0]!
      const message = result.data.message
      const block = message.content[0]
      if (result.data.turn !== call.data.turn || result.data.step !== call.data.step || result.data.error !== undefined
        || message.role !== 'tool' || message.toolCallId !== call.data.callId || message.isError === true || block === undefined
        || message.content.length !== 1 || block.type !== 'text' || block.text !== expected) { missing(); continue }
      if (!await this.sessions.flush(parent.session)) { missing(); continue }
      if (run.delivery !== 'recorded') await this.options.ledger.delivery(root.identity, run.id, doc.runtime, run.delivery as 'pending' | 'unknown', 'recorded')
    }
  }
  private async dispatchState(agent: Agent, childFailure: string, reconcile = false): Promise<{ root: RootBinding; doc: TaskLedgerDocument } | undefined> {
    if (this.roots.size === 0) return undefined
    if (await this.descendant(agent)) taskFailure(childFailure)
    const root = this.roots.get(agent)
    if (root === undefined) return undefined
    if (reconcile) await this.reconcile(agent)
    const doc = await this.document(root)
    if (doc.mode !== 'manual') taskFailure(TASK_HOST_RECOVERY_ONLY)
    return { root, doc }
  }
  async *stream(options: GenerateOptions, delegate: (options: GenerateOptions) => AsyncIterable<StreamChunk>): AsyncIterable<StreamChunk> {
    const agent = options.sessionId === undefined ? undefined : this.agents.get(options.sessionId)
    const state = agent === undefined ? undefined : await this.dispatchState(agent, 'TASK_CHILD_BINDING_MISMATCH', true)
    if (state?.doc.delegation.runs.some(run => run.cleanup !== 'verified')) taskFailure('TASK_CHILD_UNRESOLVED')
    yield* delegate(state?.doc.portable
      ? { ...options, messages: portableTaskMessages(state.root.parent.session, options.messages, { afterSeq: state.doc.handoffSeq, model: options.model }) }
      : options)
  }
  async reserveAuxiliary(): Promise<void> {
    const agent = this.agents.currentInitiator()
    if (agent !== undefined) await this.dispatchState(agent, 'TASK_CHILD_AUXILIARY_DENIED')
  }
  async revoke(parent: Agent, expectedRevision: number, mode: 'manual' | 'stopped', operation: TaskControlReceipt): Promise<void> {
    const root = this.roots.get(parent)
    if (root === undefined) taskFailure('TASK_LIVE_ROOT_REQUIRED')
    await this.document(root)
    await this.options.ledger.revoke(root.identity, expectedRevision, mode, parent.session.seq, operation)
    parent.cancel({ kind: 'user' })
    this.assertRevocationCleanup(parent)
  }
  assertRevocationCleanup(parent: Agent): void {
    if (this.options.host.hasLiveChildren(parent)) taskFailure('TASK_CHILD_CLEANUP_UNVERIFIED')
  }
  /** Explicit cold-process reconciliation, bind only the saved state and reconcile verified cleanup. */
  async recover(parent: Agent, identity: LedgerIdentity, expectedRevision: number, oldEpoch: string, newEpoch: string): Promise<void> {
    this.options.host.assertRoot(parent, identity)
    this.options.host.assertNoChildren(parent)
    const doc = await this.options.ledger.recover(identity, expectedRevision, oldEpoch, newEpoch)
    const root: RootBinding = { parent, identity: structuredClone(identity), epoch: newEpoch }
    if (doc.delegation.grant !== null) {
      restoreTaskEvidenceManifest(await this.options.artifacts(identity).get(doc.delegation.grant.sourceManifest), doc.delegation.grant.sourceManifest)
    }
    this.roots.set(parent, root)
    for (const run of doc.delegation.runs) if (run.state === 'interrupted' && run.cleanup !== 'verified') {
      this.options.host.assertNoChildren(parent)
      await this.options.ledger.cleanup(identity, run.id, newEpoch, true)
    }
    await this.reconcile(parent)
  }
  /** The caller holds native idle maintenance during archive or delegation disablement. */
  release(parent: Agent): void {
    this.options.host.assertNoChildren(parent)
    this.roots.delete(parent)
  }
}
