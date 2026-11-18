import { taskLiveRoots } from './adaptive-task-host-ownership.ts'
import { TASK_HOST_RECOVERY_ONLY } from './adaptive-task-host-policy.ts'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import { ADAPTIVE_TASK_REQUEST_LIMIT } from './adaptive-task-contract.ts'
import type { AdaptiveTaskCommand, AdaptiveTaskState, TaskRoute } from './adaptive-task-contract.ts'
import type { AdaptiveTaskStore, TaskDocument } from './adaptive-task-store.ts'
import { taskFailure, taskIdentity } from './adaptive-task-store.ts'
import { portableTaskMessages } from './adaptive-task-context.ts'

interface TaskV1RecoveryOptions {
  readonly store: AdaptiveTaskStore
  readonly ownsRoot: (agent: Agent) => Promise<boolean>
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
const TASK_MARKER = 'dsh-codex-connect/task-grant'
export function hasTaskMarker(session: Agent['session']): boolean {
  const marked = (message: { source: { kind: string; plugin?: string } }) => message.source.kind === 'dsh-codex-connect' && message.source.plugin === TASK_MARKER
  return session.snapshotEvents().some(event => (event.type === 'user/message' && marked(event.data))
    || (event.type === 'agent/inbox/spliced' && event.data.inserted.some(marked)))
}
function userStopped(agent: Agent): boolean {
  const end = agent.session.snapshotEvents().findLast(event => event.type === 'turn/end')
  return end?.type === 'turn/end' && end.data.reason?.kind === 'aborted' && end.data.reason.reason.kind === 'user'
}

/** Reads historical v1 grants and permits their authenticated safety exits. */
export class TaskV1Recovery {
  private stopped = false
  constructor(private readonly ctx: Context, private readonly options: TaskV1RecoveryOptions) {
    ctx.on('agent/request', async ({ agent }, next) => {
      const task = await this.load(agent)
      if (task !== undefined && task.mode !== 'manual') taskFailure(TASK_HOST_RECOVERY_ONLY)
      return next()
    }, { prepend: true })
    ctx.effect(() => () => { this.stopped = true }, 'Saved v1 Task recovery lifecycle')
  }
  private owner(sessionId: string): Agent {
    const agent = this.ctx.get('agents')?.get(SessionId(sessionId))
    if (agent === undefined || !taskLiveRoots(this.ctx).includes(agent)
      || this.ctx.get('sessions')?.get(agent.id) !== agent.session) taskFailure('TASK_LIVE_ROOT_REQUIRED')
    return agent
  }
  private verify(agent: Agent, task: TaskDocument | undefined): TaskDocument {
    if (task === undefined || task.sessionKey !== key(agent) || task.sessionId !== agent.id) taskFailure('TASK_SESSION_MISMATCH')
    if (this.ctx.get('agents')?.get(agent.id) !== agent || this.ctx.get('sessions')?.get(agent.id) !== agent.session) taskFailure('TASK_LIVE_ROOT_REQUIRED')
    return task
  }
  private async load(agent: Agent): Promise<TaskDocument | undefined> {
    if (!await this.options.ownsRoot(agent)) return undefined
    const task = await this.options.store.read(agent.id)
    if (task === undefined) {
      if (hasTaskMarker(agent.session)) taskFailure('TASK_STATE_MISSING')
      return undefined
    }
    this.verify(agent, task)
    if (!taskLiveRoots(this.ctx).includes(agent)) taskFailure('TASK_LIVE_ROOT_REQUIRED')
    // The ordinary Session stop button is also a revocation, including while a tool runs.
    // Read the host's durable cancellation before any new request or resume can be admitted.
    if (task.mode === 'auto' && userStopped(agent)) {
      return this.options.store.update(agent.id, value => {
        const current = this.verify(agent, value)
        if (current.mode === 'auto') { current.mode = 'stopped'; current.revision++ }
        return current
      })
    }
    if (task.mode === 'auto') {
      return this.options.store.update(agent.id, value => {
        const current = this.verify(agent, value)
        if (current.mode === 'auto') { current.mode = 'interrupted'; current.revision++ }
        return current
      })
    }
    return task
  }
  async state(sessionId: string, principal: string): Promise<AdaptiveTaskState> {
    const agent = this.owner(sessionId)
    const stored = await this.options.store.read(agent.id)
    if (stored !== undefined && stored.owner !== principal) taskFailure('TASK_OWNER_MISMATCH')
    const task = await this.load(agent)
    if (task !== undefined && task.owner !== principal) taskFailure('TASK_OWNER_MISMATCH')
    const current = currentRoute(agent)
    return { mode: task?.mode ?? 'off', revision: task?.revision ?? 0,
      ...(current === undefined ? {} : { current }),
      ...(task?.mode === 'auto' || task?.mode === 'interrupted' ? { requested: task.route } : {}),
      reserved: task?.reserved ?? 0, maximumRequests: task?.maximumRequests ?? ADAPTIVE_TASK_REQUEST_LIMIT,
      capabilities: task?.capabilities ?? [], eligibility: 'not-probed', canStart: false,
      ...(task?.mode === 'stopped' && agent.status !== 'idle' ? { unavailable: 'TASK_STOPPING' }
        : task !== undefined ? { unavailable: TASK_HOST_RECOVERY_ONLY } : {}) }
  }
  async command(command: AdaptiveTaskCommand, principal: string): Promise<void> {
    if (command.action !== 'stop' && command.action !== 'manual') taskFailure(TASK_HOST_RECOVERY_ONLY)
    if (this.stopped) taskFailure('TASK_RUNTIME_DISPOSED')
    const agent = this.owner(command.sessionId)
    const stored = await this.options.store.read(agent.id)
    if (stored !== undefined && stored.owner !== principal) taskFailure('TASK_OWNER_MISMATCH')
    await this.load(agent)
    const digest = taskIdentity(JSON.stringify(command))
    let accepted = false
    await this.options.store.update(agent.id, existing => {
      if (this.stopped) taskFailure('TASK_RUNTIME_DISPOSED')
      if (existing === undefined) taskFailure('TASK_STATE_MISSING')
      const value = this.verify(agent, existing)
      if (value.owner !== principal) taskFailure('TASK_OWNER_MISMATCH')
      const receipt = value.receipts.find(item => item.id === command.operationId)
      if (receipt !== undefined) {
        if (receipt.digest !== digest) taskFailure('TASK_OPERATION_CONFLICT')
        return value
      }
      if (value.revision !== command.revision) taskFailure('TASK_STALE_REVISION')
      value.mode = command.action === 'stop' ? 'stopped' : 'manual'
      if (command.action === 'manual') {
        value.portable = true
        value.handoffSeq = agent.session.seq
      }
      value.revision++
      value.receipts.push({ id: command.operationId, digest })
      if (value.receipts.length > 64) value.receipts.shift()
      accepted = true
      return value
    })
    if (accepted) agent.cancel({ kind: 'user' })
  }
  private async dispatchState(agent: Agent): Promise<TaskDocument | undefined> {
    const parent = agent.session.header.parentSession
    if (parent !== undefined) {
      const parentTask = await this.options.store.read(parent)
      if (parentTask !== undefined && parentTask.mode !== 'manual') taskFailure('TASK_DELEGATION_NOT_INCLUDED')
    }
    const task = await this.load(agent)
    if (task !== undefined && task.mode !== 'manual') taskFailure(TASK_HOST_RECOVERY_ONLY)
    return task
  }
  async reserveAuxiliary(): Promise<void> {
    const registry = this.ctx.get('agents')
    if (typeof registry?.currentInitiator !== 'function' || typeof registry.get !== 'function') return
    const agent = registry.currentInitiator()
    if (agent !== undefined && registry.get(agent.id) === agent) await this.dispatchState(agent)
  }
  async *stream(options: GenerateOptions, delegate: (options: GenerateOptions) => AsyncIterable<StreamChunk>): AsyncIterable<StreamChunk> {
    const agent = options.sessionId === undefined ? undefined : this.ctx.get('agents')?.get(options.sessionId)
    const task = agent === undefined ? undefined : await this.dispatchState(agent)
    yield* delegate(agent !== undefined && task?.portable
      ? { ...options, messages: portableTaskMessages(agent.session, options.messages, { afterSeq: task.handoffSeq, model: options.model }) }
      : options)
  }
}
