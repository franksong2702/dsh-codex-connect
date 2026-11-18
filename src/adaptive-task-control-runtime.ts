import { taskDurableAncestors, taskIsOwnedBy, taskLiveRoots, taskVerifiedRuntimeRoot } from './adaptive-task-host-ownership.ts'
import { TASK_HOST_RECOVERY_ONLY } from './adaptive-task-host-policy.ts'
/** Compose v1/v2 safety exits and exact Host ownership for retained Task state. */
import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import { decodeTaskCommand } from './adaptive-task-contract.ts'
import type { AdaptiveTaskCommand, AdaptiveTaskState } from './adaptive-task-contract.ts'
import { TaskV1Recovery, hasTaskMarker } from './task-v1-recovery.ts'
import { publicTaskCommandAllowed } from './adaptive-task-publication.ts'
import { AdaptiveTaskStore, AtomicTaskDocumentStore, taskFailure, taskIdentity } from './adaptive-task-store.ts'
import { childUnresolved, parseTaskLedger } from './adaptive-task-delegation-contract.ts'
import type { TaskLedgerDocument } from './adaptive-task-delegation-contract.ts'
import { AdaptiveTaskDelegationLedger } from './adaptive-task-delegation-ledger.ts'
import type { LedgerIdentity } from './adaptive-task-delegation-ledger.ts'
import { TaskV2Recovery } from './task-v2-recovery.ts'
import { TaskRecoveryHost, taskHostServices } from './task-recovery-host.ts'
import { restoreTaskEvidenceManifest } from './adaptive-task-evidence.ts'
import type { TaskDelegationArtifacts } from './adaptive-task-artifacts.ts'
import { AdaptiveTaskTransitions } from './adaptive-task-transitions.ts'

export interface TaskControlOptions {
  directory: string
  artifacts(identity: LedgerIdentity): TaskDelegationArtifacts
}
export class AdaptiveTaskControlRuntime {
  private readonly store: AtomicTaskDocumentStore<ReturnType<typeof parseTaskLedger>>
  private readonly v1: TaskV1Recovery
  private readonly ledger: AdaptiveTaskDelegationLedger
  private readonly host: TaskRecoveryHost
  private readonly v2: TaskV2Recovery
  private readonly transitions: AdaptiveTaskTransitions
  private readonly bound = new WeakSet<Agent>()
  private readonly attaching = new WeakMap<Agent, Promise<void>>()
  private readonly commands = new Map<string, Promise<unknown>>()
  private stopped = false
  private get agents() { return taskHostServices(this.ctx).agents }
  private get sessions() { return taskHostServices(this.ctx).sessions }
  constructor(private readonly ctx: Context, private readonly options: TaskControlOptions) {
    this.store = new AtomicTaskDocumentStore(options.directory, parseTaskLedger)
    this.ledger = new AdaptiveTaskDelegationLedger(options.directory)
    this.host = new TaskRecoveryHost(ctx)
    this.transitions = new AdaptiveTaskTransitions(options.directory)
    this.v1 = new TaskV1Recovery(ctx, { store: new AdaptiveTaskStore(options.directory),
      ownsRoot: async agent => (await this.store.read(agent.id))?.version !== 2 })
    this.v2 = new TaskV2Recovery(ctx, { ledger: this.ledger, host: this.host, artifacts: options.artifacts })
    ctx.on('agent/request', async ({ agent }, next) => { await this.managed(agent); return next() }, { prepend: true })
    ctx.effect(() => () => { this.stopped = true }, 'Task consent composition lifecycle')
  }
  private root(id: string): Agent {
    const agent = this.agents.get(SessionId(id))
    if (agent === undefined || !taskLiveRoots(this.ctx).includes(agent)) taskFailure('TASK_LIVE_ROOT_REQUIRED')
    return agent
  }
  private identity(agent: Agent, owner: string): LedgerIdentity {
    const h = agent.session.header
    const identity = { sessionId: agent.id, owner,
      sessionKey: taskIdentity(JSON.stringify([h.id, h.createdAt, h.cwd ?? '', h.isSeeded, h.parentSession ?? ''])) }
    this.host.assertRoot(agent, identity)
    return identity
  }
  private async authorized(agent: Agent, owner: string) {
    const doc = await this.store.read(agent.id)
    if (doc !== undefined) {
      if (doc.owner !== owner) taskFailure('TASK_OWNER_MISMATCH')
      if (doc.sessionKey !== this.identity(agent, owner).sessionKey) taskFailure('TASK_SESSION_MISMATCH')
    }
    return doc
  }
  private async ensure(agent: Agent): Promise<void> {
    if (this.bound.has(agent)) { await this.v2.reconcile(agent); return }
    const pending = this.attaching.get(agent)
    if (pending !== undefined) return pending
    const attach = (async () => {
      const doc = await this.store.read(agent.id)
      if (doc?.version !== 2) return
      const identity = this.identity(agent, doc.owner)
      await this.v2.recover(agent, identity, doc.revision, doc.runtime, taskIdentity(randomUUID()))
      this.bound.add(agent)
    })()
    this.attaching.set(agent, attach)
    try { await attach } finally { this.attaching.delete(agent) }
  }
  /** A plugin-owned root can be live in the agent registry without being in the Host's session store. */
  private isSeparateRoot(agent: Agent, session: Agent['session']): boolean {
    const { agents, sessions } = taskHostServices(this.ctx)
    return agents.get(agent.id) === agent && agent.session === session && sessions.get(agent.id) === undefined
      && session.id === agent.id && session.header.id === agent.id
      && session.header.parentSession === undefined && session.header.origin !== 'subagent'
  }
  private recheckLiveAgents(live: readonly Agent[]): void {
    const current = this.agents.list()
    if (current.length !== live.length || current.some((candidate, index) => candidate !== live[index])) taskFailure('TASK_CHILD_BINDING_MISMATCH')
  }
  /** Decline Task authority unless the relevant journals and live registry still describe ordinary work. */
  private async ordinaryWithoutVerifiedOwnership(agent: Agent, ancestry: readonly string[], error: unknown): Promise<false> {
    const live = this.agents.list()
    const related = new Set([agent.id, ...ancestry])
    for (const id of new Set([...related, ...live.map(candidate => candidate.id)])) {
      const doc = await this.store.read(id)
      if (doc?.version === 2) throw error
      if (!related.has(id)) continue
      const session = this.sessions.get(SessionId(id))
      if (doc !== undefined || (session !== undefined && hasTaskMarker(session))) throw error
    }
    if (JSON.stringify(taskDurableAncestors(this.ctx, agent)) !== JSON.stringify(ancestry)) taskFailure('TASK_CHILD_BINDING_MISMATCH')
    this.recheckLiveAgents(live)
    return false
  }
  /** Both durable ancestry and actual live ownership route descendants to the rejecting executor. */
  private async managed(agent: Agent): Promise<boolean> {
    const legacyOwnership = typeof this.agents.roots === 'function' && typeof this.agents.isOwnedBy === 'function'
    const session = agent.session
    if (this.isSeparateRoot(agent, session)) {
      // These plugin-owned roots have no Host session and cannot own Task state.
      const live = this.agents.list()
      if (!live.includes(agent)) taskFailure('TASK_LIVE_ROOT_REQUIRED')
      for (const candidate of live) {
        const state = await this.store.read(candidate.id)
        if (state?.version === 2 || (candidate === agent && state !== undefined)) taskFailure('TASK_LIVE_ROOT_REQUIRED')
      }
      if (!this.isSeparateRoot(agent, session) || live.some(candidate => this.bound.has(candidate) || this.attaching.has(candidate))
        || hasTaskMarker(session)) taskFailure('TASK_LIVE_ROOT_REQUIRED')
      this.recheckLiveAgents(live)
      return false
    }
    if (!legacyOwnership) {
      // Read durable relation only as denial evidence, never as ownership.
      const ancestry = taskDurableAncestors(this.ctx, agent)
      const related = new Set([agent.id, ...ancestry])
      const recheck = () => {
        if (JSON.stringify(taskDurableAncestors(this.ctx, agent)) !== JSON.stringify(ancestry)) taskFailure('TASK_CHILD_BINDING_MISMATCH')
      }
      const records = new Map<string, boolean>()
      const retained = async (id: string) => {
        if (!records.has(id)) records.set(id, (await this.store.read(id))?.version === 2)
        return records.get(id) === true
      }
      for (const id of related) await retained(id)
      let runtimeRoot: Agent
      try { runtimeRoot = taskVerifiedRuntimeRoot(this.ctx, agent) } catch (error) {
        return this.ordinaryWithoutVerifiedOwnership(agent, ancestry, error)
      }
      related.add(runtimeRoot.id)
      let managed = false
      for (const id of related) {
        if (!await retained(id)) continue
        const root = this.agents.get(SessionId(id))
        if (root === undefined || root.session.header.parentSession !== undefined
          || taskVerifiedRuntimeRoot(this.ctx, root) !== root) taskFailure('TASK_CHILD_BINDING_MISMATCH')
        await this.ensure(root); managed = true
      }
      recheck()
      if (taskVerifiedRuntimeRoot(this.ctx, agent) !== runtimeRoot) taskFailure('TASK_CHILD_BINDING_MISMATCH')
      return managed
    }
    const ancestry = taskDurableAncestors(this.ctx, agent)
    let roots: Agent[]
    try { roots = taskLiveRoots(this.ctx) } catch (error) {
      return this.ordinaryWithoutVerifiedOwnership(agent, ancestry, error)
    }
    for (const id of ancestry) if (!roots.some(root => root.id === id) && (await this.store.read(id))?.version === 2) {
      taskFailure('TASK_CHILD_BINDING_MISMATCH')
    }
    for (const root of roots) {
      const belongs = root === agent || taskIsOwnedBy(this.ctx, agent.id, root) || ancestry.includes(root.id)
      if (belongs && (await this.store.read(root.id))?.version === 2) { await this.ensure(root); return true }
    }
    return false
  }
  async *stream(options: GenerateOptions, delegate: (options: GenerateOptions) => AsyncIterable<StreamChunk>): AsyncIterable<StreamChunk> {
    const agent = options.sessionId === undefined ? undefined : this.ctx.get('agents')?.get(options.sessionId)
    if (agent === undefined && options.sessionId !== undefined) {
      const session = this.ctx.get('sessions')?.get(options.sessionId)
      if ((session !== undefined && hasTaskMarker(session)) || await this.store.read(options.sessionId) !== undefined) {
        taskFailure('TASK_LIVE_ROOT_REQUIRED')
      }
    }
    yield* (agent !== undefined && await this.managed(agent) ? this.v2 : this.v1).stream(options, delegate)
  }
  async reserveAuxiliary(): Promise<void> {
    const registry = this.ctx.get('agents')
    const agent = typeof registry?.currentInitiator === 'function' && typeof registry.get === 'function'
      ? registry.currentInitiator() : undefined
    await (agent !== undefined && await this.managed(agent) ? this.v2 : this.v1).reserveAuxiliary()
  }
  async state(sessionId: string, principal: string): Promise<AdaptiveTaskState> {
    const parent = this.root(sessionId)
    const stored = await this.authorized(parent, principal)
    if (stored?.version !== 2) {
      const state = await this.v1.state(sessionId, principal)
      return { ...state, ...(state.mode === 'off' ? {} : { delegation: { version: 1, idle: parent.status === 'idle',
        enabled: false, canDowngrade: false, files: [], routes: [], maxRequests: 6, timeoutMs: 90000, runs: [] } }) }
    }
    await this.ensure(parent)
    const doc = await this.ledger.read(this.identity(parent, principal)) as TaskLedgerDocument
    const grant = doc.delegation.grant
    const manifest = grant === null ? undefined : restoreTaskEvidenceManifest(await this.options.artifacts(doc).get(grant.sourceManifest), grant.sourceManifest)
    const config = parent.session.requestHeader()?.config
    const current = config?.provider === 'openai-codex' && config.reasoningEffort !== undefined
      ? { model: config.model, effort: String(config.reasoningEffort) } : undefined
    return { revision: doc.revision, mode: doc.mode, reserved: doc.reserved, maximumRequests: doc.maximumRequests,
      capabilities: doc.capabilities, canStart: false, eligibility: 'not-probed', ...(current === undefined ? {} : { current }),
      ...(['auto', 'interrupted'].includes(doc.mode) ? { requested: doc.route } : {}),
      ...(doc.mode === 'stopped' && parent.status !== 'idle' ? { unavailable: 'TASK_STOPPING' }
        : { unavailable: TASK_HOST_RECOVERY_ONLY }),
      delegation: { version: 2, idle: parent.status === 'idle', enabled: grant !== null,
        canDowngrade: doc.mode === 'manual' && grant === null && parent.status === 'idle'
          && doc.delegation.runs.every(run => !childUnresolved(run) && run.delivery === 'recorded')
          && !this.host.hasLiveChildren(parent),
        files: manifest?.entries.map(source => source.path) ?? [], routes: grant?.routes ?? [],
        maxRequests: grant?.maxRequests ?? 6, timeoutMs: grant?.timeoutMs ?? 90000,
        runs: doc.delegation.runs.map(run => ({ id: run.id, state: run.state, cleanup: run.cleanup,
          delivery: run.delivery, reserved: run.attempts.length })) } }
  }
  async command(value: AdaptiveTaskCommand, principal: string): Promise<AdaptiveTaskState> {
    const command = structuredClone(value)
    if (decodeTaskCommand(command) === undefined) taskFailure('TASK_COMMAND_INVALID')
    if (!publicTaskCommandAllowed(command.action)) taskFailure(TASK_HOST_RECOVERY_ONLY)
    const previous = this.commands.get(command.sessionId) ?? Promise.resolve()
    const next = previous.catch(() => {}).then(() => this.apply(command, principal))
    this.commands.set(command.sessionId, next)
    try { return await next } finally { if (this.commands.get(command.sessionId) === next) this.commands.delete(command.sessionId) }
  }
  private async apply(command: AdaptiveTaskCommand, principal: string): Promise<AdaptiveTaskState> {
    if (this.stopped) taskFailure('TASK_RUNTIME_DISPOSED')
    const parent = this.root(command.sessionId), identity = this.identity(parent, principal)
    const stored = await this.authorized(parent, principal)
    if (stored === undefined) taskFailure('TASK_STATE_MISSING')
    const operation = { id: command.operationId, digest: taskIdentity(JSON.stringify(command)) }
    const receipt = stored.receipts.find(item => item.id === operation.id)
    if (receipt !== undefined) {
      if (receipt.digest !== operation.digest) taskFailure('TASK_OPERATION_CONFLICT')
      if (stored.version === 2 && (command.action === 'stop' || command.action === 'manual')) this.v2.assertRevocationCleanup(parent)
      return this.state(parent.id, principal)
    }
    if (stored.version !== 2) {
      if (command.action !== 'stop' && command.action !== 'manual') taskFailure('TASK_LEDGER_MIGRATION_REQUIRED')
      await this.v1.command(command, principal)
      return this.state(parent.id, principal)
    }
    await this.ensure(parent)
    const doc = await this.ledger.read(identity)
    if (doc.version !== 2) taskFailure('TASK_LEDGER_MIGRATION_REQUIRED')
    if (doc.revision !== command.revision) taskFailure('TASK_STALE_REVISION')
    if (command.action === 'manual' || command.action === 'stop') {
      await this.v2.revoke(parent, command.revision, command.action === 'manual' ? 'manual' : 'stopped', operation)
    } else {
      await parent.runMaintenance(async signal => {
        const guard = () => {
          signal.throwIfAborted()
          if (this.stopped) taskFailure('TASK_RUNTIME_DISPOSED')
          this.host.assertRoot(parent, identity)
          this.host.assertNoChildren(parent)
        }
        guard()
        if (!await this.sessions.flush(parent.session)) taskFailure('TASK_DURABLE_PARENT_REQUIRED')
        guard()
        const current = await this.ledger.read(identity)
        if (current.version !== 2) taskFailure('TASK_LEDGER_MIGRATION_REQUIRED')
        if (command.action === 'downgrade') {
          await this.v2.reconcile(parent, true)
          await this.transitions.downgrade(identity, command.revision, current.runtime, operation, guard, this.options.artifacts(identity))
          this.v2.release(parent)
          this.bound.delete(parent)
          return
        }
        if (command.action !== 'delegate-disable') taskFailure('TASK_COMMAND_INVALID')
        await this.ledger.configure(identity, command.revision, null, operation)
        this.v2.release(parent)
        this.bound.delete(parent)
        await this.ensure(parent)
      })
    }
    return this.state(parent.id, principal)
  }
}
