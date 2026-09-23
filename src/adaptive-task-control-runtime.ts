/** Default-off composition: v1 main-task grants and explicitly upgraded v2 roots have one owner. */
import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import { allowsTaskRoute, decodeTaskCommand } from './adaptive-task-contract.ts'
import type { AdaptiveTaskCommand, AdaptiveTaskState } from './adaptive-task-contract.ts'
import { AdaptiveTaskRuntime } from './adaptive-task-runtime.ts'
import type { TaskRuntimeOptions } from './adaptive-task-runtime.ts'
import { AdaptiveTaskStore, AtomicTaskDocumentStore, taskFailure, taskIdentity } from './adaptive-task-store.ts'
import { childUnresolved, parseTaskLedger } from './adaptive-task-delegation-contract.ts'
import type { TaskLedgerDocument } from './adaptive-task-delegation-contract.ts'
import { AdaptiveTaskDelegationLedger } from './adaptive-task-delegation-ledger.ts'
import type { LedgerIdentity } from './adaptive-task-delegation-ledger.ts'
import { AdaptiveTaskDelegation } from './adaptive-task-delegation.ts'
import { TaskDelegationHost, taskHostServices } from './adaptive-task-delegation-host.ts'
import { TaskEvidenceManifest } from './adaptive-task-evidence.ts'
import type { TaskDelegationArtifacts } from './adaptive-task-artifacts.ts'
import { AdaptiveTaskTransitions } from './adaptive-task-transitions.ts'

export interface TaskControlOptions {
  directory: string
  models: TaskRuntimeOptions['models']
  artifacts(identity: LedgerIdentity): TaskDelegationArtifacts
}
export class AdaptiveTaskControlRuntime {
  private readonly store: AtomicTaskDocumentStore<ReturnType<typeof parseTaskLedger>>
  private readonly legacy: AdaptiveTaskRuntime
  private readonly ledger: AdaptiveTaskDelegationLedger
  private readonly host: TaskDelegationHost
  private readonly execution: AdaptiveTaskDelegation
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
    this.host = new TaskDelegationHost(ctx)
    this.transitions = new AdaptiveTaskTransitions(options.directory)
    this.legacy = new AdaptiveTaskRuntime(ctx, { store: new AdaptiveTaskStore(options.directory), models: options.models,
      ownsRoot: async agent => (await this.store.read(agent.id))?.version !== 2 })
    this.execution = new AdaptiveTaskDelegation(ctx, { ledger: this.ledger, host: this.host, artifacts: options.artifacts })
    ctx.on('agent/request', async ({ agent }, next) => { await this.managed(agent); return next() }, { prepend: true })
    ctx.effect(() => () => { this.stopped = true }, 'Task consent composition lifecycle')
  }
  private root(id: string): Agent {
    const agent = this.agents.get(SessionId(id))
    if (agent === undefined || !this.agents.roots().includes(agent)) taskFailure('TASK_LIVE_ROOT_REQUIRED')
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
    if (this.bound.has(agent)) { await this.execution.reconcile(agent); return }
    const pending = this.attaching.get(agent)
    if (pending !== undefined) return pending
    const attach = (async () => {
      const doc = await this.store.read(agent.id)
      if (doc?.version !== 2) return
      const identity = this.identity(agent, doc.owner)
      this.legacy.release(agent)
      await this.execution.recover(agent, identity, doc.revision, doc.runtime, taskIdentity(randomUUID()))
      this.bound.add(agent)
    })()
    this.attaching.set(agent, attach)
    try { await attach } finally { this.attaching.delete(agent) }
  }
  /** Both durable ancestry and actual live ownership route descendants to the rejecting executor. */
  private async managed(agent: Agent): Promise<boolean> {
    for (const root of this.agents.roots()) {
      let current: Agent | undefined = agent
      const visited = new Set<string>()
      let belongs = root === agent || this.agents.isOwnedBy(agent.id, root)
      while (!belongs && current?.session.header.parentSession !== undefined) {
        const id = current.session.header.parentSession
        if (id === root.id) { belongs = true; break }
        if (visited.has(id) || visited.size >= 64) taskFailure('TASK_CHILD_BINDING_MISMATCH')
        visited.add(id); current = this.agents.get(id)
      }
      if (belongs && (await this.store.read(root.id))?.version === 2) { await this.ensure(root); return true }
    }
    return false
  }
  async *stream(options: GenerateOptions, delegate: (options: GenerateOptions) => AsyncIterable<StreamChunk>): AsyncIterable<StreamChunk> {
    const agent = options.sessionId === undefined ? undefined : this.ctx.get('agents')?.get(options.sessionId)
    yield* (agent !== undefined && await this.managed(agent) ? this.execution : this.legacy).stream(options, delegate)
  }
  async reserveAuxiliary(): Promise<void> {
    const registry = this.ctx.get('agents')
    const agent = typeof registry?.currentInitiator === 'function' && typeof registry.get === 'function'
      ? registry.currentInitiator() : undefined
    await (agent !== undefined && await this.managed(agent) ? this.execution : this.legacy).reserveAuxiliary()
  }
  async state(sessionId: string, principal: string): Promise<AdaptiveTaskState> {
    const parent = this.root(sessionId)
    const stored = await this.authorized(parent, principal)
    if (stored?.version !== 2) {
      const state = await this.legacy.state(sessionId, principal)
      return { ...state, ...(state.mode === 'off' ? {} : { delegation: { version: 1, idle: parent.status === 'idle',
        enabled: false, canDowngrade: false, files: [], routes: [], maxRequests: 6, timeoutMs: 90000, runs: [] } }) }
    }
    await this.ensure(parent)
    const doc = await this.ledger.read(this.identity(parent, principal)) as TaskLedgerDocument
    const grant = doc.delegation.grant
    const manifest = grant === null ? undefined : TaskEvidenceManifest.restore(await this.options.artifacts(doc).get(grant.sourceManifest), grant.sourceManifest)
    const config = parent.session.requestHeader()?.config
    const current = config?.provider === 'openai-codex' && config.reasoningEffort !== undefined
      ? { model: config.model, effort: String(config.reasoningEffort) } : undefined
    return { revision: doc.revision, mode: doc.mode, reserved: doc.reserved, maximumRequests: doc.maximumRequests,
      capabilities: doc.capabilities, canStart: false, eligibility: 'not-probed', ...(current === undefined ? {} : { current }),
      ...(['auto', 'interrupted'].includes(doc.mode) ? { requested: doc.route } : {}),
      ...(doc.mode === 'stopped' && parent.status !== 'idle' ? { unavailable: 'TASK_STOPPING' } : {}),
      delegation: { version: 2, idle: parent.status === 'idle', enabled: grant !== null,
        canDowngrade: doc.mode === 'manual' && grant === null && parent.status === 'idle'
          && doc.delegation.runs.every(run => !childUnresolved(run) && run.delivery === 'recorded'),
        files: manifest?.sources().map(source => source.path) ?? [], routes: grant?.routes ?? [],
        maxRequests: grant?.maxRequests ?? 6, timeoutMs: grant?.timeoutMs ?? 90000,
        runs: doc.delegation.runs.map(run => ({ id: run.id, state: run.state, cleanup: run.cleanup,
          delivery: run.delivery, reserved: run.attempts.length })) } }
  }
  async command(value: AdaptiveTaskCommand, principal: string): Promise<AdaptiveTaskState> {
    const command = structuredClone(value)
    if (decodeTaskCommand(command) === undefined) taskFailure('TASK_COMMAND_INVALID')
    const previous = this.commands.get(command.sessionId) ?? Promise.resolve()
    const next = previous.catch(() => {}).then(() => this.apply(command, principal))
    this.commands.set(command.sessionId, next)
    try { return await next } finally { if (this.commands.get(command.sessionId) === next) this.commands.delete(command.sessionId) }
  }
  private async apply(command: AdaptiveTaskCommand, principal: string): Promise<AdaptiveTaskState> {
    if (this.stopped) taskFailure('TASK_RUNTIME_DISPOSED')
    const parent = this.root(command.sessionId), identity = this.identity(parent, principal)
    let doc = await this.authorized(parent, principal)
    const operation = { id: command.operationId, digest: taskIdentity(JSON.stringify(command)) }
    const receipt = doc?.receipts.find(item => item.id === operation.id)
    if (receipt !== undefined) {
      if (receipt.digest !== operation.digest) taskFailure('TASK_OPERATION_CONFLICT')
      return this.state(parent.id, principal)
    }
    if (doc?.version !== 2 && command.action !== 'upgrade') {
      if (!['start', 'resume', 'stop', 'manual'].includes(command.action)) taskFailure('TASK_LEDGER_MIGRATION_REQUIRED')
      await this.legacy.command(command, principal)
      return this.state(parent.id, principal)
    }
    if (doc === undefined) taskFailure('TASK_STATE_MISSING')
    if (doc.version === 2) { await this.ensure(parent); doc = await this.ledger.read(identity) }
    if (doc.revision !== command.revision) taskFailure('TASK_STALE_REVISION')
    if (command.action === 'manual' || command.action === 'stop') {
      await this.execution.revoke(parent, command.revision, command.action === 'manual' ? 'manual' : 'stopped', operation)
    } else if (command.action === 'resume') {
      await this.execution.resume(parent, identity, command.revision, operation)
    } else {
      await parent.runMaintenance(async signal => {
        const guard = () => { signal.throwIfAborted(); if (this.stopped) taskFailure('TASK_RUNTIME_DISPOSED'); this.host.assertRoot(parent, identity); this.host.assertNoChildren(parent) }
        guard()
        if (!await this.sessions.flush(parent.session)) taskFailure('TASK_DURABLE_PARENT_REQUIRED')
        guard()
        if (command.action === 'upgrade') {
          await this.transitions.migrate(identity, command.revision, operation, guard, this.options.artifacts(identity))
          this.legacy.release(parent)
          await this.ensure(parent)
          return
        }
        const current = await this.ledger.read(identity) as TaskLedgerDocument
        if (current.version !== 2) taskFailure('TASK_LEDGER_MIGRATION_REQUIRED')
        if (command.action === 'downgrade') {
          await this.execution.reconcile(parent, true)
          await this.transitions.downgrade(identity, command.revision, current.runtime, operation, guard, this.options.artifacts(identity))
          this.execution.release(parent); this.bound.delete(parent)
          return
        }
        if (!['delegate-enable', 'delegate-disable'].includes(command.action)) taskFailure('TASK_COMMAND_INVALID')
        let manifest: TaskEvidenceManifest | undefined
        if (command.action === 'delegate-enable') {
          if (!['auto', 'interrupted'].includes(current.mode)) taskFailure('TASK_REQUIRES_USER_RESUME')
          const catalog = await this.legacy.capabilities()
          if (command.routes!.some(route => !allowsTaskRoute(current.capabilities, route) || !allowsTaskRoute(catalog, route))) taskFailure('TASK_MODEL_NOT_ALLOWED')
          if (parent.session.header.cwd === undefined) taskFailure('TASK_EVIDENCE_MANIFEST_INVALID')
          manifest = await TaskEvidenceManifest.approve(parent.session.header.cwd, command.files!)
          if (await this.options.artifacts(identity).put(manifest.serialize()) !== manifest.digest) taskFailure('TASK_EVIDENCE_MANIFEST_INVALID')
        }
        guard()
        const updated = await this.ledger.configure(identity, command.revision, manifest === undefined ? null : {
          routes: [...command.routes!], sourceManifest: manifest.digest, sourceIds: manifest.sources().map(source => source.id),
          maxRequests: command.maxChildRequests!, timeoutMs: command.timeoutMs!,
        }, operation)
        this.execution.release(parent); this.bound.delete(parent)
        if (updated.mode === 'auto') {
          try { await this.execution.install(parent, identity, manifest); this.bound.add(parent) }
          catch (error) { await this.ledger.revoke(identity, updated.revision, 'stopped'); throw error }
        } else await this.ensure(parent)
      })
    }
    return this.state(parent.id, principal)
  }
}
