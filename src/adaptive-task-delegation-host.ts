/**
 * Host-owned child bridge for Phase 2 delegation.
 *
 * This adapter only composes an in-process Agent through the installed DSH
 * factory. It owns no ledger state, evidence, artifacts, or model routing
 * decisions; callers must keep those responsibilities in the orchestration
 * layer.
 */
import { Context } from '@deepseek-ai/cordis'
import type { Agent, AgentOptions } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import type { TaskChildRun } from './adaptive-task-delegation-contract.ts'
import type { LedgerIdentity } from './adaptive-task-delegation-ledger.ts'
import { taskIdentity } from './adaptive-task-store.ts'

export interface TaskDelegationControls {
  execute(name: string, args: unknown): unknown | Promise<unknown>
  check(): void
}

export interface OwnedTaskChild {
  readonly agent: Agent
  readonly sessionId: string
  readonly sessionKey: string
  run(brief: string, signal: AbortSignal): Promise<void>
  dispose(): Promise<void>
  isLive(): boolean
}

const allowedTools = new Set(['read_task_evidence', 'submit_task_findings'])
function abortError(): Error {
  const error = new Error('TASK_CHILD_ABORTED')
  error.name = 'AbortError'
  return error
}

function definition(name: string, description: string, parameters: Record<string, unknown>, invoke: (args: unknown, exec: import('@deepseek-ai/dsh-tools').ToolRunContext) => Promise<unknown>): ToolDefinition {
  return {
    name,
    description,
    parameters,
    output: {
      schema: { type: 'object' },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    async execute(args, exec) { return invoke(args, exec) },
  }
}

const readEvidence = (controls: TaskDelegationControls): ToolDefinition => definition(
  'read_task_evidence', 'Read one approved source line range.',
  { type: 'object', additionalProperties: false, required: ['sourceId', 'start', 'end'], properties: {
    sourceId: { type: 'string' }, start: { type: 'integer', minimum: 1 }, end: { type: 'integer', minimum: 1 },
  } },
  async (args) => { controls.check(); return controls.execute('read_task_evidence', args) },
)

const submitFindings = (controls: TaskDelegationControls, markSubmitted: () => void): ToolDefinition => definition(
  'submit_task_findings', 'Submit exactly one bounded findings report with evidence references.',
  { type: 'object', additionalProperties: false, required: ['summary', 'findings'], properties: {
    summary: { type: 'string' }, findings: { type: 'array' },
  } },
  async (args, exec) => {
    controls.check()
    const result = await controls.execute('submit_task_findings', args)
    markSubmitted()
    exec.concludeTurn()
    return result
  },
)

/**
 * Bridges one ledger run to one real host Agent. It deliberately does not
 * register itself in the product runtime; Phase 2 orchestration owns that
 * integration boundary.
 */
export class TaskDelegationHost {
  constructor(private readonly ctx: Context) {}

  assertRoot(parent: Agent, identity: LedgerIdentity): void {
    const header = parent.session.header
    const expectedKey = taskIdentity(JSON.stringify([header.id, header.createdAt, header.cwd ?? '', header.isSeeded, header.parentSession ?? '']))
    if (parent.id !== identity.sessionId || identity.sessionKey !== expectedKey
      || this.ctx.agents.get(parent.id) !== parent || this.ctx.sessions.get(parent.session.id) !== parent.session
      || !this.ctx.agents.roots().includes(parent)
      || header.parentSession !== undefined) throw new Error('TASK_PARENT_NOT_LIVE')
  }

  assertNoChildren(parent: Agent): void {
    for (const candidate of this.ctx.agents.list()) {
      if (candidate === parent) continue
      if (candidate.session.header.parentSession === parent.id || this.ctx.agents.isOwnedBy(candidate.id, parent)) throw new Error('TASK_CHILDREN_LIVE')
    }
  }

  async create(parent: Agent, childRun: TaskChildRun, signal: AbortSignal, controls: TaskDelegationControls): Promise<OwnedTaskChild> {
    if (signal.aborted) throw abortError()
    if (this.ctx.agents.get(parent.id) !== parent) throw new Error('TASK_PARENT_NOT_LIVE')
    controls.check()
    if (childRun.childSessionId !== null || childRun.childSessionKey !== null) throw new Error('TASK_CHILD_ALREADY_BOUND')
    const sessionId = SessionId(`task-child-${childRun.id}`)
    let submitted = false
    let violation = false
    let disposed = false
    let disposing = false
    let disposePromise: Promise<void> | undefined
    const lifetime = new AbortController()
    const childOptions: AgentOptions = { model: childRun.route.model,
      reasoningEffort: childRun.route.effort as NonNullable<AgentOptions['reasoningEffort']>,
      provider: 'openai-codex' }
    const parentDepth = parent.session.header.delegationDepth ?? 0
    // Use the parent's scoped context: the registry records exact runtime
    // ownership only when create() is invoked from that scope.
    const handle = await parent.ctx.agents.create({ sessionId, signal, meta: { parentSession: parent.id, origin: 'subagent', delegationDepth: parentDepth + 1 }, agentOptions: childOptions,
      setup: agentCtx => {
        const agent = agentCtx.agent
        if (agent === undefined) throw new Error('TASK_CHILD_AGENT_CONTEXT_MISSING')
        // `restrict(allow)` only accepts names already present in the inherited
        // global layer. Evidence/tool orchestration normally supplies those
        // definitions; a child-local fallback remains fail-closed through the
        // guard when this bridge is tested in isolation.
        // Empty allow-list hides every inherited/global capability. Native
        // presentation also prevents an inherited PTC `run_code` transport
        // from being reintroduced after restriction resolution.
        agentCtx.tools.restrict({ allow: [] })
        agentCtx.tools.presentAs('native')
        agentCtx.tools.guard(exec => {
          if (submitted) { violation = true; return 'TASK_CHILD_SUBMITTED' }
          if (!allowedTools.has(exec.name)) { violation = true; return 'TASK_CHILD_TOOL_DENIED' }
          controls.check()
          return undefined
        })
        agentCtx.tools.register({ ...readEvidence(controls), isConcurrencySafe: () => false })
        agentCtx.tools.register({ ...submitFindings(controls, () => { submitted = true }), isConcurrencySafe: () => false })
        return { commit: () => { signal.throwIfAborted(); controls.check() } }
      },
    })
    const agent = handle.agent
    if (!this.ctx.agents.isOwnedBy(agent.id, parent)) {
      await handle.dispose()
      throw new Error('TASK_CHILD_OWNER_MISMATCH')
    }
    const executeRun = async (brief: string, runSignal: AbortSignal): Promise<void> => {
      if (disposed || disposing || !this.isLive(agent, sessionId, parent) || runSignal.aborted || lifetime.signal.aborted) throw abortError()
      controls.check()
      const abort = () => agent.cancel({ kind: runSignal.aborted ? 'parent' : 'disposed' })
      runSignal.addEventListener('abort', abort, { once: true })
      lifetime.signal.addEventListener('abort', abort, { once: true })
      try {
        agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: brief }] }))
        await agent.whenIdle()
        if (runSignal.aborted || lifetime.signal.aborted) throw abortError()
        if (violation) throw new Error('TASK_CHILD_TOOL_AFTER_SUBMIT')
        const end = agent.session.snapshotEvents().findLast(event => event.type === 'turn/end')
        if (end?.type !== 'turn/end') throw new Error('TASK_CHILD_TURN_NOT_SETTLED')
        if (end?.type === 'turn/end' && end.data.reason.kind === 'aborted') throw abortError()
        if (end?.type === 'turn/end' && end.data.reason.kind === 'error') throw new Error(`TASK_CHILD_TURN_ERROR:${end.data.reason.error.code}`)
        if (end.data.reason.kind === 'blocked') throw new Error('TASK_CHILD_TURN_BLOCKED')
      } finally {
        runSignal.removeEventListener('abort', abort)
        lifetime.signal.removeEventListener('abort', abort)
      }
    }
    const dispose = async (): Promise<void> => {
      if (disposed) return
      if (disposePromise) return disposePromise
      disposing = true
      disposePromise = (async () => {
        lifetime.abort()
        agent.cancel({ kind: 'disposed' })
        await agent.whenIdle()
        await handle.dispose()
        disposed = true
      })().catch(error => { disposePromise = undefined; disposing = false; throw error })
      return disposePromise
    }
    const header = agent.session.header
    const sessionKey = taskIdentity(JSON.stringify([header.id, header.createdAt, header.cwd ?? '', header.isSeeded, header.parentSession ?? '']))
    return { agent, sessionId, sessionKey, run: executeRun, dispose, isLive: () => !disposed && !disposing && this.isLive(agent, sessionId, parent) }
  }

  private isLive(agent: Agent, sessionId: string, parent: Agent): boolean {
    return agent.id === sessionId && this.ctx.agents.get(SessionId(sessionId)) === agent
      && this.ctx.sessions.get(agent.session.id) === agent.session && this.ctx.agents.isOwnedBy(agent.id, parent)
  }
}
