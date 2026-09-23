/** Phase 1: a real per-task opt-in around the ordinary host loop, not a mandatory model router. */
import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import { createUserMessage, ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, LlmResolvedModelInfo, StreamChunk } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import { ADAPTIVE_TASK_MODELS, ADAPTIVE_TASK_START, ADAPTIVE_TASK_REQUEST_LIMIT, ADAPTIVE_TASK_TOOL,
  allowsTaskRoute, decodeTaskCommand, taskRecord, taskRoute } from './adaptive-task-contract.ts'
import type { AdaptiveTaskCommand, AdaptiveTaskState, TaskCapability, TaskRoute } from './adaptive-task-contract.ts'
import { AdaptiveTaskStore, taskFailure, taskIdentity } from './adaptive-task-store.ts'
import type { TaskDocument } from './adaptive-task-store.ts'
import { currentAdaptiveTaskDispatch, inAdaptiveTaskDispatch } from './adaptive-task-scope.ts'
import type { TaskDispatchScope } from './adaptive-task-scope.ts'
import { portableTaskMessages } from './adaptive-task-context.ts'

export interface TaskRuntimeOptions {
  readonly store: AdaptiveTaskStore
  readonly models: () => Promise<readonly LlmResolvedModelInfo[]>
  /** Explicit v2 composition only; absent in the Phase 1 product. */
  readonly ownsRoot?: (agent: Agent) => Promise<boolean>
}
function selectionSeq(agent: Agent): number {
  return agent.session.snapshotEvents().findLast(event => event.type === 'model/selection')?.seq ?? -1
}
function key(agent: Agent): string {
  const header = agent.session.header
  return taskIdentity(JSON.stringify([header.id, header.createdAt, header.cwd ?? '', header.isSeeded, header.parentSession ?? '']))
}
function currentRoute(agent: Agent): TaskRoute | undefined {
  const config = agent.session.requestHeader()?.config
  return config?.provider === 'openai-codex' && config.reasoningEffort !== undefined
    ? { model: config.model, effort: config.reasoningEffort } : undefined
}
function sameRoute(a: TaskRoute, b: TaskRoute): boolean { return a.model === b.model && a.effort === b.effort }
function isFresh(agent: Agent): boolean {
  return agent.status === 'idle' && agent.inbox.nextTurn.length === 0 && agent.inbox.nextStep.length === 0
    && !agent.session.header.isSeeded && !agent.session.header.parentSession
    && !agent.session.snapshotEvents().some(event => event.type === 'request/header'
      || (event.type === 'user/message' && event.data.source.kind === 'user'))
}
const TASK_MARKER = 'dsh-codex-connect/task-grant'
function hasTaskMarker(agent: Agent): boolean {
  const marked = (message: { source: { kind: string; plugin?: string } }) => message.source.kind === 'dsh-codex-connect' && message.source.plugin === TASK_MARKER
  return agent.session.snapshotEvents().some(event => (event.type === 'user/message' && marked(event.data))
    || (event.type === 'agent/inbox/spliced' && event.data.inserted.some(marked)))
}
function userStopped(agent: Agent): boolean {
  const end = agent.session.snapshotEvents().findLast(event => event.type === 'turn/end')
  return end?.type === 'turn/end' && end.data.reason?.kind === 'aborted' && end.data.reason.reason.kind === 'user'
}
export class AdaptiveTaskRuntime {
  private readonly epoch = taskIdentity(randomUUID())
  private readonly tools = new Map<Agent, () => void>()
  private readonly lifetimes = new Map<Agent, AbortController>()
  private stopped = false
  constructor(private readonly ctx: Context, private readonly options: TaskRuntimeOptions) {
    ctx.on('agent/request', async ({ agent, signal }, next) => {
      const config = await next()
      const task = await this.load(agent)
      if (task === undefined || task.mode === 'manual') return config
      signal.throwIfAborted()
      if (task.mode !== 'auto') taskFailure('TASK_REQUIRES_USER_RESUME')
      if (selectionSeq(agent) !== task.selectionSeq) {
        await options.store.update(agent.id, current => {
          const value = this.verify(agent, current)
          value.mode = 'manual'; value.portable = true; value.handoffSeq = agent.session.seq; value.revision++; return value
        })
        this.withdraw(agent)
        return config
      }
      if (!allowsTaskRoute(await this.capabilities(), task.route)) taskFailure('TASK_MODEL_UNAVAILABLE')
      this.install(agent, task)
      return { ...config, provider: 'openai-codex', model: task.route.model, reasoningEffort: ReasoningEffortId(task.route.effort) }
    }, { prepend: true })
    ctx.on('agent/disposed', ({ agent }) => { this.withdraw(agent); this.lifetimes.delete(agent) })
    ctx.on('agent/status', ({ agent, status }) => {
      if (status === 'idle' && userStopped(agent)) this.withdraw(agent)
    })
    ctx.effect(() => () => this.dispose(), 'Adaptive per-task lifecycle')
  }
  private owner(sessionId: string): Agent {
    const agent = this.ctx.get('agents')?.get(SessionId(sessionId))
    if (agent === undefined || !this.ctx.get('agents')?.roots().includes(agent)
      || this.ctx.get('sessions')?.get(agent.id) !== agent.session) taskFailure('TASK_LIVE_ROOT_REQUIRED')
    return agent
  }
  private verify(agent: Agent, task: TaskDocument | undefined): TaskDocument {
    if (task === undefined || task.sessionKey !== key(agent) || task.sessionId !== agent.id) taskFailure('TASK_SESSION_MISMATCH')
    if (this.ctx.get('agents')?.get(agent.id) !== agent || this.ctx.get('sessions')?.get(agent.id) !== agent.session) taskFailure('TASK_LIVE_ROOT_REQUIRED')
    return task
  }
  private async load(agent: Agent): Promise<TaskDocument | undefined> {
    if (this.options.ownsRoot !== undefined && !await this.options.ownsRoot(agent)) { this.withdraw(agent); return undefined }
    const task = await this.options.store.read(agent.id)
    if (task === undefined) {
      if (hasTaskMarker(agent) || this.lifetimes.has(agent)) taskFailure('TASK_STATE_MISSING')
      return undefined
    }
    this.verify(agent, task)
    // The ordinary Session stop button is also a revocation, including while a tool runs.
    // Read the host's durable cancellation before any new request or resume can be admitted.
    if (task.mode === 'auto' && userStopped(agent)) {
      this.withdraw(agent)
      return this.options.store.update(agent.id, value => {
        const current = this.verify(agent, value)
        if (current.mode === 'auto') { current.mode = 'stopped'; current.revision++ }
        return current
      })
    }
    if (task.mode === 'auto' && task.runtime !== this.epoch) {
      return this.options.store.update(agent.id, value => {
        const current = this.verify(agent, value)
        if (current.mode === 'auto' && current.runtime !== this.epoch) { current.mode = 'interrupted'; current.revision++ }
        return current
      })
    }
    return task
  }
  async capabilities(): Promise<readonly TaskCapability[]> {
    const models = await this.options.models()
    return models.filter(model => model.provider === 'openai-codex'
      && ADAPTIVE_TASK_MODELS.includes(model.id as typeof ADAPTIVE_TASK_MODELS[number]))
      .map(model => ({ model: model.id, efforts: (model.reasoning?.efforts ?? []).map(effort => String(effort.id)) }))
      .filter(model => model.efforts.length > 0)
  }
  async state(sessionId: string, principal: string): Promise<AdaptiveTaskState> {
    const agent = this.owner(sessionId)
    const stored = await this.options.store.read(agent.id)
    if (stored !== undefined && stored.owner !== principal) taskFailure('TASK_OWNER_MISMATCH')
    const task = await this.load(agent)
    if (task !== undefined && task.owner !== principal) taskFailure('TASK_OWNER_MISMATCH')
    const capabilities = task?.capabilities ?? await this.capabilities()
    const current = currentRoute(agent)
    return { mode: task?.mode ?? 'off', revision: task?.revision ?? 0,
      ...(current === undefined ? {} : { current }),
      ...(task?.mode === 'auto' || task?.mode === 'interrupted' ? { requested: task.route } : {}),
      reserved: task?.reserved ?? 0, maximumRequests: task?.maximumRequests ?? ADAPTIVE_TASK_REQUEST_LIMIT,
      capabilities: task?.capabilities ?? capabilities, eligibility: 'not-probed', canStart: task === undefined && isFresh(agent)
        && allowsTaskRoute(capabilities, ADAPTIVE_TASK_START),
      ...(task?.mode === 'stopped' && agent.status !== 'idle' ? { unavailable: 'TASK_STOPPING' } : {}) }
  }
  async command(command: AdaptiveTaskCommand, principal: string): Promise<AdaptiveTaskState> {
    if (decodeTaskCommand(command) === undefined) taskFailure('TASK_COMMAND_INVALID')
    if (!['start', 'manual', 'stop', 'resume'].includes(command.action)) taskFailure('TASK_COMMAND_INVALID')
    if (this.stopped) taskFailure('TASK_RUNTIME_DISPOSED')
    const agent = this.owner(command.sessionId)
    const digest = taskIdentity(JSON.stringify(command))
    const stored = await this.options.store.read(agent.id)
    if (stored !== undefined && stored.owner !== principal) taskFailure('TASK_OWNER_MISMATCH')
    const observed = await this.load(agent)
    if (observed !== undefined) {
      if (observed.owner !== principal) taskFailure('TASK_OWNER_MISMATCH')
      const receipt = observed.receipts.find(item => item.id === command.operationId)
      if (receipt !== undefined) {
        if (receipt.digest !== digest) taskFailure('TASK_OPERATION_CONFLICT')
        return this.state(agent.id, principal)
      }
    }
    // Revocation must remain available when catalog discovery/provider availability fails.
    const capabilities = command.action === 'start' || command.action === 'resume' ? await this.capabilities() : []
    const apply = async (signal?: AbortSignal) => {
      signal?.throwIfAborted()
      await this.options.store.update(agent.id, existing => {
        if (existing !== undefined) {
          const value = this.verify(agent, existing)
          if (value.owner !== principal) taskFailure('TASK_OWNER_MISMATCH')
          const receipt = value.receipts.find(item => item.id === command.operationId)
          if (receipt !== undefined) {
            if (receipt.digest !== digest) taskFailure('TASK_OPERATION_CONFLICT')
            return value
          }
          if (value.revision !== command.revision) taskFailure('TASK_STALE_REVISION')
          if (command.action === 'start') taskFailure('TASK_ALREADY_EXISTS')
          if (command.action === 'resume') {
            if (agent.status !== 'idle' || value.mode !== 'interrupted' || value.reserved >= value.maximumRequests
              || !allowsTaskRoute(capabilities, value.route)) taskFailure('TASK_RESUME_UNAVAILABLE')
            value.runtime = this.epoch; value.mode = 'interrupted'; value.selectionSeq = selectionSeq(agent)
          } else {
            value.mode = command.action === 'stop' ? 'stopped' : 'manual'
            if (command.action === 'manual') { value.portable = true; value.handoffSeq = agent.session.seq }
          }
          value.revision++
          value.receipts.push({ id: command.operationId, digest })
          if (value.receipts.length > 64) value.receipts.shift()
          return value
        }
        if (command.action !== 'start' || command.revision !== 0 || !isFresh(agent)) taskFailure('TASK_NEW_SESSION_REQUIRED')
        const allowed = command.models!.map(model => ({ model, efforts: [...command.efforts![model]!] }))
        if (!allowsTaskRoute(allowed, ADAPTIVE_TASK_START)
          || allowed.some(item => item.efforts.some(effort => !allowsTaskRoute(capabilities, { model: item.model, effort })))) taskFailure('TASK_MODEL_UNAVAILABLE')
        return { version: 1, sessionId: agent.id, sessionKey: key(agent), owner: principal,
          runtime: this.epoch, revision: 1, mode: 'interrupted', route: ADAPTIVE_TASK_START,
          capabilities: allowed, maximumRequests: command.maximumRequests!, reserved: 0,
          selectionSeq: selectionSeq(agent), portable: false, handoffSeq: -1, receipts: [{ id: command.operationId, digest }] }
      })
      if ((command.action === 'start' || command.action === 'resume') && !hasTaskMarker(agent)) {
        agent.inject(createUserMessage({ source: { kind: 'dsh-codex-connect', plugin: TASK_MARKER },
          content: [{ type: 'text', text: 'This task has an explicit model-selection grant held by the host. This notice is not permission; the stored grant and live checks govern every change.' }] }))
      }
      if (command.action === 'start' || command.action === 'resume') {
        const sessions = this.ctx.get('sessions')
        if (sessions === undefined) taskFailure('TASK_LIVE_ROOT_REQUIRED')
        await sessions.flush(agent.session)
        signal?.throwIfAborted()
        await this.options.store.update(agent.id, existing => {
          const value = this.verify(agent, existing)
          signal?.throwIfAborted()
          if (this.stopped || value.mode !== 'interrupted' || value.runtime !== this.epoch
            || value.revision !== command.revision + 1) taskFailure('TASK_ACTIVATION_INTERRUPTED')
          value.mode = 'auto'
          return value
        })
      }
    }
    // The native idle reservation prevents a user prompt from racing the initial task grant.
    if (command.action === 'start' || command.action === 'resume') await agent.runMaintenance(apply)
    else await apply()
    const result = await this.load(agent)
    if (result?.mode === 'auto') this.install(agent, result)
    else {
      this.withdraw(agent)
      if (command.action === 'stop' || command.action === 'manual') agent.cancel({ kind: 'user' })
    }
    return this.state(agent.id, principal)
  }
  private install(agent: Agent, task: TaskDocument): void {
    if (this.stopped || this.tools.has(agent)) return
    const life = this.lifetimes.get(agent)
    if (life === undefined || life.signal.aborted) this.lifetimes.set(agent, new AbortController())
    const remove = agent.ctx.tools.register({
      name: ADAPTIVE_TASK_TOOL,
      description: 'Continue doing the task yourself unless changing the model or effort would help the remaining work. This optional tool requests the next model/effort within the user-approved task scope; no extra approval is needed inside it. No role assignment is mandatory. Consider transfer cost and verification, not just model names. No new file, command, publishing or delegation permission is granted. Preserve user requirements and report actual results. Supported task choices: ' + JSON.stringify(task.capabilities),
      parameters: { type: 'object', additionalProperties: false, required: ['model', 'effort', 'reason'], properties: {
        model: { type: 'string' }, effort: { type: 'string' }, reason: { type: 'string' },
      } },
      output: { schema: { type: 'object' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
      isConcurrencySafe: () => false,
      execute: async (args, execution) => {
        if (execution.agent !== agent) taskFailure('TASK_OWNER_MISMATCH')
        execution.signal.throwIfAborted()
        if (!taskRecord(args) || Object.keys(args).sort().join(',') !== 'effort,model,reason'
          || !taskRoute({ model: args.model, effort: args.effort }) || typeof args.reason !== 'string'
          || args.reason.trim().length === 0 || args.reason.length > 1000) taskFailure('TASK_ACTION_INVALID')
        const target = { model: String(args.model), effort: String(args.effort) }
        const actual = await this.capabilities()
        const updated = await this.options.store.update(agent.id, existing => {
          const value = this.verify(agent, existing)
          execution.signal.throwIfAborted()
          if (this.stopped || value.runtime !== this.epoch || value.mode !== 'auto') taskFailure('TASK_NOT_AUTHORIZED')
          if (selectionSeq(agent) !== value.selectionSeq) taskFailure('TASK_MANUAL_SELECTION_CHANGED')
          if (!allowsTaskRoute(value.capabilities, target) || !allowsTaskRoute(actual, target)) taskFailure('TASK_MODEL_NOT_ALLOWED')
          if (value.reserved >= value.maximumRequests) taskFailure('TASK_REQUEST_LIMIT')
          if (!sameRoute(value.route, target)) {
            // Validate transfer before changing state. Raw journal stays intact and remains the evidence source.
            portableTaskMessages(agent.session, agent.session.deriveMessages(), { afterSeq: agent.session.seq, model: target.model })
            value.portable = true; value.handoffSeq = agent.session.seq; value.route = target; value.revision++
          }
          return value
        })
        return { status: 'requested', model: updated.route.model, effort: updated.route.effort,
          remainingRequests: updated.maximumRequests - updated.reserved,
          message: 'The next recorded request will use this selection. This is not evidence that the provider accepted it or the task succeeded.' }
      },
    })
    this.tools.set(agent, remove)
  }
  private withdraw(agent: Agent): void {
    this.tools.get(agent)?.(); this.tools.delete(agent)
    this.lifetimes.get(agent)?.abort(new Error('Task automation withdrawn'))
  }
  /** Quiescent composition relinquishes only this root, never another task's lifetime. */
  release(agent: Agent): void { this.withdraw(agent) }
  private async reserve(agent: Agent, route?: TaskRoute, revision?: number): Promise<void> {
    if (route !== undefined && !allowsTaskRoute(await this.capabilities(), route)) taskFailure('TASK_MODEL_UNAVAILABLE')
    const updated = await this.options.store.update(agent.id, existing => {
      const value = this.verify(agent, existing)
      if (this.stopped || value.mode !== 'auto' || value.runtime !== this.epoch) taskFailure('TASK_NOT_AUTHORIZED')
      if (selectionSeq(agent) !== value.selectionSeq) taskFailure('TASK_MANUAL_SELECTION_CHANGED')
      if (route !== undefined && (!sameRoute(value.route, route) || value.revision !== revision)) taskFailure('TASK_REQUEST_STALE')
      if (value.reserved >= value.maximumRequests) { value.mode = 'limit'; value.revision++; return value }
      value.reserved++; return value
    })
    if (updated.mode === 'limit') { this.withdraw(agent); taskFailure('TASK_REQUEST_LIMIT') }
  }
  /** Attribute auxiliary backend work only to the actual live initiating root. Never fabricate a task from an id. */
  async reserveAuxiliary(): Promise<void> {
    if (currentAdaptiveTaskDispatch() !== undefined) return
    const registry = this.ctx.get('agents')
    // Standalone adapters may expose only attribution, not a live Agent registry.
    if (typeof registry?.currentInitiator !== 'function' || typeof registry.get !== 'function') return
    const agent = registry.currentInitiator()
    if (agent === undefined || registry.get(agent.id) !== agent) return
    const parent = agent.session.header.parentSession
    if (parent !== undefined) {
      const parentTask = await this.options.store.read(parent)
      if (parentTask !== undefined && parentTask.mode !== 'manual') taskFailure('TASK_DELEGATION_NOT_INCLUDED')
    }
    const task = await this.load(agent)
    if (task?.mode === 'auto') await this.reserve(agent)
    else if (task !== undefined && task.mode !== 'manual') taskFailure('TASK_NOT_AUTHORIZED')
  }
  /** Bound existing adapter iteration and all its retry/compaction HTTP attempts to one task. */
  async *stream(options: GenerateOptions, delegate: (options: GenerateOptions) => AsyncIterable<StreamChunk>): AsyncIterable<StreamChunk> {
    const agent = options.sessionId === undefined ? undefined : this.ctx.get('agents')?.get(options.sessionId)
    if (agent === undefined) { yield* delegate(options); return }
    const parent = agent.session.header.parentSession
    if (parent !== undefined) {
      const parentTask = await this.options.store.read(parent)
      if (parentTask !== undefined && parentTask.mode !== 'manual') taskFailure('TASK_DELEGATION_NOT_INCLUDED')
    }
    const task = await this.load(agent)
    if (task === undefined) { yield* delegate(options); return }
    if (task.mode === 'manual') {
      // Exiting automatic selection must not reintroduce incompatible historical replay bytes.
      yield* delegate(task.portable
        ? { ...options, messages: portableTaskMessages(agent.session, options.messages, { afterSeq: task.handoffSeq, model: options.model }) } : options)
      return
    }
    if (task.mode !== 'auto' || this.stopped) taskFailure('TASK_REQUIRES_USER_RESUME')
    const hostDefault = options.purpose === 'compaction' && options.reasoningEffort === undefined
    const route = { model: options.model, effort: hostDefault ? task.route.effort : String(options.reasoningEffort) }
    if (options.provider !== 'openai-codex' || !sameRoute(route, task.route)) taskFailure('TASK_ROUTE_CHANGED')
    const controller = this.lifetimes.get(agent) ?? new AbortController()
    this.lifetimes.set(agent, controller)
    const signal = options.signal === undefined ? controller.signal : AbortSignal.any([options.signal, controller.signal])
    signal.throwIfAborted()
    const transformed = task.portable
      ? { ...options, messages: portableTaskMessages(agent.session, options.messages, { afterSeq: task.handoffSeq, model: options.model }), signal }
      : { ...options, signal }
    const scope: TaskDispatchScope = { route, cacheKey: `${agent.id}:task:${task.revision}`, signal,
      ...(hostDefault ? { hostDefaultEfforts: task.capabilities.find(item => item.model === route.model)!.efforts } : {}),
      reserve: async () => { signal.throwIfAborted(); await this.reserve(agent, route, task.revision); signal.throwIfAborted() } }
    const iterator = inAdaptiveTaskDispatch(scope, () => delegate(transformed)[Symbol.asyncIterator]())
    try {
      while (true) {
        const part = await inAdaptiveTaskDispatch(scope, () => iterator.next())
        if (part.done) break
        yield part.value
      }
    } finally {
      await inAdaptiveTaskDispatch(scope, () => iterator.return?.())
    }
  }
  dispose(): void {
    if (this.stopped) return
    this.stopped = true
    for (const agent of this.lifetimes.keys()) this.withdraw(agent)
    this.lifetimes.clear()
  }
}
