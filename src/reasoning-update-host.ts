/** Think host integration: saved opt-in permits proposals, never automatic consent. */

import { isDeepStrictEqual } from 'node:util'
import type { Context, Fiber } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { GenerateOptions, UserMessage } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import { ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import type { Session } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-user-questions'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { OpenAICodexRequestReplay } from './adapter.ts'
import { prepareReasoningReplay } from './reasoning-update-history.ts'
import { planCheckpointReasoningAdmission, recordedReasoningBase } from './reasoning-update-checkpoint.ts'
import { AstraReasoningRequestScope } from './reasoning-update-provider.ts'
import {
  ASTRA_REASONING_EFFORTS, createReasoningUpdateMessage, isAstraReasoningEffort,
  readReasoningSelectionOrdinal, readReasoningUpdate, reasoningUpdateError,
} from './reasoning-update.ts'

export const ASTRA_REASONING_TOOL_NAME = 'codex_connect_set_reasoning_effort'

function selectionRevision(session: Session): number {
  return session.snapshotEvents().findLast(event => event.type === 'model/selection')?.seq ?? -1
}

function pendingSelection(session: Session) {
  const events = session.snapshotEvents()
  const selection = events.findLast(event => event.type === 'model/selection')
  if (selection === undefined) return undefined
  const ordinal = events.filter(event => event.type === 'model/selection').length
  const admitted = events.some(event => event.seq > selection.seq && event.type === 'user/message'
    && readReasoningUpdate(event.data) !== undefined && readReasoningSelectionOrdinal(event.data) === ordinal)
  const consumed = events.some(event => event.seq > selection.seq && event.type === 'request/header'
    && event.data.header.config.provider === selection.data.provider
    && event.data.header.config.model === selection.data.model
    && event.data.header.config.reasoningEffort === selection.data.reasoningEffort)
  return admitted || consumed ? undefined : { ...selection.data, ordinal }
}

interface PendingChange {
  generation: number
  notice: UserMessage
  revision: number
  signal: AbortSignal
}
interface PreparedStep {
  turn: number
  step: number
  signal: AbortSignal
  messages: readonly UserMessage[]
  revision: number
  pending?: PendingChange
}

/** Runtime activation driven by the saved product setting or an isolated test. */
export interface ThinkHostIntegration {
  readonly adapterReplay: OpenAICodexRequestReplay
  setEnabled(enabled: boolean): Promise<void>
}

/**
 * Compose native human questions, request admission and the existing model-selection projection.
 * @param ctx - trusted host context containing real Session and live Agent ownership services.
 * @returns an initially disabled integration and optional Codex adapter seam.
 * @remarks The product entry retains replay guards when proposals are disabled. It neither edits defaults nor supplies
 * an automatic proposal policy. Validated prefix compaction is supported; child-agent composition remains separate.
 */
export function registerThinkHostIntegration(ctx: Context): ThinkHostIntegration {
  const scope = new AstraReasoningRequestScope()
  const pending = new Map<Agent, PendingChange>()
  const invalidAdmissions = new WeakSet<Session>()
  const prepared = new WeakMap<Agent, PreparedStep>()
  const busy = new WeakSet<Agent>()
  const operations = new Set<Promise<unknown>>()
  let enabled = false
  let stopped = false
  let questionLifetime = new AbortController()
  let toolFiber: Fiber | undefined
  let activation = Promise.resolve()

  function assertOwner(agent: Agent): void {
    const agents = ctx.get('agents')
    if (agents?.get(agent.id) !== agent || !agents.roots().includes(agent)
      || ctx.get('sessions')?.get(agent.id) !== agent.session) {
      reasoningUpdateError('Think changes require the exact live root Agent and its host-owned Session.')
    }
  }

  ctx.on('agent/pre-step', async ({ agent, turn, step, signal }, next) => {
    prepared.delete(agent)
    const decision = await next()
    if (decision.kind !== 'enter' || signal.aborted || stopped) return decision
    if (invalidAdmissions.has(agent.session)) reasoningUpdateError('Think admission integrity failed; preserve this session for inspection and use a new conversation.')
    const history = agent.session.deriveMessages()
    const base = recordedReasoningBase(agent.session)
    const queued = pending.get(agent)
    if (base === undefined && queued === undefined) return decision
    assertOwner(agent)
    const additions = [...decision.messages]
    // A later manual choice, disable, or cancellation wins over an unadmitted approval.
    if (queued !== undefined) {
      if (enabled && !queued.signal.aborted && queued.revision === selectionRevision(agent.session)
        && queued.generation === agent.session.surface.replaceGeneration) additions.push(queued.notice)
      else pending.delete(agent)
    }
    const selected = pendingSelection(agent.session)
    if (selected !== undefined && base !== undefined) {
      if (selected.provider !== 'openai-codex' || selected.model !== 'gpt-6-astra'
        || !isAstraReasoningEffort(selected.reasoningEffort)) {
        reasoningUpdateError('Think history requires the original Astra route and an explicit effort.')
      }
      const previous = planCheckpointReasoningAdmission({ provider: 'openai-codex', model: 'gpt-6-astra',
        sessionId: agent.id, reasoningEffort: ReasoningEffortId(base), messages: [...history, ...additions] }, agent.session, additions)!
      if (selected.reasoningEffort !== previous.effectiveEffort) additions.push(createReasoningUpdateMessage({
        version: 1, sessionId: agent.id, baseEffort: base,
        previousEffort: previous.effectiveEffort, effort: selected.reasoningEffort,
      }, selected.ordinal))
    }
    const active = pending.get(agent)
    prepared.set(agent, { turn, step, signal, messages: structuredClone(additions), revision: selectionRevision(agent.session),
      ...(active === undefined ? {} : { pending: active }) })
    return { ...decision, messages: additions }
  }, { prepend: true })

  ctx.on('agent/request', async ({ agent, turn, step, signal }, next) => {
    const config = await next()
    signal.throwIfAborted()
    const history = agent.session.deriveMessages()
    const captured = prepared.get(agent)
    const current = captured?.turn === turn && captured.step === step && captured.signal === signal ? captured : undefined
    const ids = new Set(history.map(message => message.id))
    const additions = current?.messages.filter(message => !ids.has(message.id)) ?? []
    const messages = [...history, ...additions]
    const base = recordedReasoningBase(agent.session) ?? messages.map(readReasoningUpdate).find(value => value !== undefined)?.baseEffort
    if (base === undefined) return config
    assertOwner(agent)
    if (stopped) reasoningUpdateError('Think admission is unavailable for this surface.')
    if (current !== undefined && current.revision !== selectionRevision(agent.session)) {
      reasoningUpdateError('Manual selection changed during request admission; no new effort was published.')
    }
    if (current?.pending !== undefined && !ids.has(current.pending.notice.id)
      && (!enabled || current.pending.signal.aborted || pending.get(agent) !== current.pending
          || current.pending.generation !== agent.session.surface.replaceGeneration)) {
      reasoningUpdateError('The pending Think approval was canceled before admission.')
    }
    // T1 still validates the complete durable prefix. Only this exact pre-step batch may be pending.
    prepareReasoningReplay({ ...config, reasoningEffort: ReasoningEffortId(base),
      sessionId: agent.id, messages: history }, agent.session)
    const plan = planCheckpointReasoningAdmission({ ...config, reasoningEffort: ReasoningEffortId(base), sessionId: agent.id, messages }, agent.session, additions)!
    const selected = pendingSelection(agent.session)
    if (selected !== undefined && (selected.provider !== config.provider || selected.model !== config.model
      || selected.reasoningEffort !== plan.effectiveEffort)) {
      reasoningUpdateError('The latest manual selection was not preserved by Think admission.')
    }
    if (current?.pending !== undefined && ids.has(current.pending.notice.id)) pending.delete(agent)
    return { ...config, reasoningEffort: ReasoningEffortId(plan.effectiveEffort) }
  }, { prepend: true })

  function replaySession(options: GenerateOptions): Session | undefined {
    const session = options.sessionId === undefined ? undefined : ctx.get('sessions')?.get(options.sessionId)
    if (session !== undefined && invalidAdmissions.has(session)) reasoningUpdateError('Think admission integrity failed; this live session cannot dispatch further requests.')
    const agent = options.sessionId === undefined ? undefined : ctx.get('agents')?.get(options.sessionId)
    const captured = agent === undefined ? undefined : prepared.get(agent)
    if (options.purpose === undefined && captured !== undefined && !captured.signal.aborted) {
      for (const expected of captured.messages.filter(message => readReasoningUpdate(message) !== undefined)) {
        const actual = options.messages.find(message => message.id === expected.id)
        if (actual === undefined || !isDeepStrictEqual(actual.source, expected.source)
          || !isDeepStrictEqual(actual.content, expected.content)) {
          if (session !== undefined) invalidAdmissions.add(session)
          reasoningUpdateError('The approved Think notice was removed or changed before model dispatch.')
        }
      }
    }
    const plan = prepareReasoningReplay(options, session)
    if (plan !== undefined) {
      if (agent === undefined) reasoningUpdateError('Think replay requires a live root Agent.')
      assertOwner(agent)
      if (stopped) reasoningUpdateError('Think integration was disposed before dispatch.')
      const queued = pending.get(agent)
      if (queued !== undefined && session?.deriveMessages().some(message => message.id === queued.notice.id)) pending.delete(agent)
    }
    return session
  }
  ctx.on('llm/stream', (options, next) => {
    replaySession(options)
    return next()
  }, { prepend: true })
  const forget = ({ agent }: { agent: Agent }) => { pending.delete(agent); prepared.delete(agent) }
  ctx.on('agent/error', forget)
  ctx.on('agent/turn-stopping', forget)
  ctx.on('agent/disposed', forget)

  function selection(agent: Agent) {
    assertOwner(agent)
    if (!enabled || stopped) reasoningUpdateError('Think proposals are disabled.')
    if (pending.has(agent)) reasoningUpdateError('A confirmed Think change is already pending.')
    const header = agent.session.requestHeader()
    const config = header?.config
    if (config?.provider !== 'openai-codex' || config.model !== 'gpt-6-astra'
      || !isAstraReasoningEffort(config.reasoningEffort) || header?.adapterDefaults?.reasoningEffort === true) {
      reasoningUpdateError('Select Astra and an explicit initial effort before proposing a change.')
    }
    const selected = pendingSelection(agent.session)
    if (selected !== undefined && (selected.provider !== config.provider || selected.model !== config.model
      || selected.reasoningEffort !== config.reasoningEffort)) reasoningUpdateError('A newer manual selection must enter a request first.')
    const plan = prepareReasoningReplay({ ...config, sessionId: agent.id, messages: agent.session.deriveMessages() }, agent.session)
    return { baseEffort: plan?.baseEffort ?? config.reasoningEffort,
      effectiveEffort: plan?.effectiveEffort ?? config.reasoningEffort, revision: selectionRevision(agent.session),
      generation: agent.session.surface.replaceGeneration }
  }

  async function change(agent: Agent, effort: string, reason: string, signal?: AbortSignal) {
    if (!isAstraReasoningEffort(effort) || reason.trim().length === 0 || reason.length > 2000) reasoningUpdateError('Provide a supported effort and a reason of 1–2000 characters.')
    const combined = signal === undefined ? questionLifetime.signal : AbortSignal.any([signal, questionLifetime.signal])
    combined.throwIfAborted()
    const before = selection(agent)
    if (effort === before.effectiveEffort) return { status: 'unchanged', effort, message: 'The selected effort is already effective.' }
    if (busy.has(agent)) reasoningUpdateError('A Think decision is already pending for this Agent.')
    const questions = ctx.get('userQuestions')
    if (questions === undefined) reasoningUpdateError('No native human-question service is available.')
    busy.add(agent)
    try {
      const approve = `Change to ${effort}`
      const answer = await questions.ask({ agent, signal: combined, questions: [{ id: 'astra-reasoning-effort',
        header: 'Astra reasoning', question: `Change this conversation from ${before.effectiveEffort} to ${effort}?`,
        detail: `Reason: ${reason}\n\nThis affects later requests in this conversation only. The selector updates with the next recorded request, not this approval. Other conversations and defaults are unchanged. Quality, latency and quota savings are not guaranteed. Source-validated prefix compaction preserves admitted state. Model switches, child inheritance, and unverified history rewrites remain unsupported.`,
        options: [{ label: approve, description: 'Approve this exact change.' },
          { label: 'Keep current effort', description: 'Continue without changing effort.' }], multiSelect: false }] })
      combined.throwIfAborted()
      if (answer.answers.length !== 1 || answer.answers[0]?.id !== 'astra-reasoning-effort'
        || answer.answers[0].selected.length !== 1 || answer.answers[0].selected[0] !== approve
        || (answer.answers[0].custom !== undefined && answer.answers[0].custom.trim() !== '')) {
        return { status: 'declined', effort: before.effectiveEffort, message: 'No reasoning change was approved.' }
      }
      const after = selection(agent)
      if (after.baseEffort !== before.baseEffort || after.effectiveEffort !== before.effectiveEffort || after.revision !== before.revision
        || after.generation !== before.generation) {
        reasoningUpdateError('The conversation changed during the decision; this approval was not applied.')
      }
      pending.set(agent, { generation: before.generation, revision: before.revision, signal: combined, notice: createReasoningUpdateMessage({
        version: 1, sessionId: agent.id, baseEffort: before.baseEffort, previousEffort: before.effectiveEffort, effort,
      }) })
      return { status: 'queued', effort, message: `The user approved ${effort}. It becomes effective only when the next request is recorded; cancellation or a later manual choice can discard this pending change.` }
    } finally { busy.delete(agent) }
  }

  function registerTool(toolCtx: Context): void {
    toolCtx.tools.register(defineTool({ name: ASTRA_REASONING_TOOL_NAME,
      description: 'Propose one reasoning-effort change for the next work in this Astra conversation. Give a concrete reason. The native human-question service must approve the exact change; ordinary text and Auto-review cannot authorize it. Respect refusal and the latest manual choice. No defaults or other sessions change. Requires an explicit initial effort, a host-owned root Agent, and a complete canonical journal. Only verified prefix compaction is supported. Do not promise quality or quota savings.',
      parameters: { effort: { type: 'string', enum: ASTRA_REASONING_EFFORTS, required: true, description: 'Requested effort.' },
        reason: { type: 'string', required: true, description: 'Reason for the next unit of work.' } },
      output: { schema: { type: 'object', additionalProperties: false, properties: {
        status: { type: 'string', required: true }, effort: { type: 'string', required: true }, message: { type: 'string', required: true },
      } }, render: (_args, value) => [{ type: 'text', text: value.message }] },
      isConcurrencySafe: () => false,
      execute(args, exec) {
        if (exec.agent === undefined) reasoningUpdateError('Think requires a live root Agent.')
        const operation = change(exec.agent, args.effort, args.reason, exec.signal)
        operations.add(operation)
        void operation.then(() => operations.delete(operation), () => operations.delete(operation))
        return operation
      },
    }))
  }

  const integration: ThinkHostIntegration = {
    adapterReplay: {
      wrapProvider: provider => scope.wrapProvider(provider),
      stream: (options, delegate) => scope.stream(options, delegate, replaySession(options)),
    },
    setEnabled(value) {
      if (enabled === (value === true && !stopped)) return activation
      enabled = value === true && !stopped
      if (!enabled) { questionLifetime.abort(new Error('Think proposals disabled')); pending.clear() }
      activation = activation.then(async () => {
        const previous = toolFiber
        toolFiber = undefined
        await previous?.dispose()
        if (!enabled || stopped) return
        questionLifetime = new AbortController()
        toolFiber = ctx.inject(['tools'], registerTool)
      })
      return activation
    },
  }
  ctx.effect(() => async () => {
    stopped = true
    await integration.setEnabled(false)
    await Promise.allSettled([...operations])
  }, 'Think native admission lifecycle')
  return integration
}
