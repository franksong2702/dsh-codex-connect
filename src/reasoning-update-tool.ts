/** DSH human-confirmation and request guards for the opt-in Astra effort tool. */

import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import type { GenerateOptions } from '@deepseek-ai/dsh-llm'
import { createUserMessage, ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import type { Session } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-user-questions'
import { defineTool } from '@deepseek-ai/dsh-tools'
import {
  ASTRA_REASONING_EFFORTS,
  createReasoningUpdateMessage,
  isAstraReasoningEffort,
  planReasoningUpdates,
  readReasoningUpdate,
  reasoningUpdateError,
} from './reasoning-update.ts'
import type { AstraReasoningEffort } from './reasoning-update.ts'

/** Model-facing tool; every actual change requires a fresh human answer. */
export const ASTRA_REASONING_TOOL_NAME = 'codex_connect_set_reasoning_effort'

function pendingUpdates(agent: Agent): boolean {
  return [...agent.inbox.nextStep, ...agent.inbox.nextTurn].some(message => readReasoningUpdate(message) !== undefined)
}

function selectionRevision(session: Session): number {
  return session.snapshotEvents().findLast(event => event.type === 'model/selection')?.seq ?? -1
}

function pendingSelection(session: Session) {
  const events = session.snapshotEvents()
  const selection = events.findLast(event => event.type === 'model/selection')
  if (selection === undefined) return undefined
  const admitted = events.some(event => event.seq > selection.seq && event.type === 'user/message'
    && readReasoningUpdate(event.data) !== undefined
    && event.data.source.kind === 'plugin' && 'reasoningSelectionSeq' in event.data.source
    && event.data.source.reasoningSelectionSeq === selection.seq)
  if (admitted) return undefined
  // A later in-flight request may still use the old selection; only a matching header consumes the choice.
  const consumed = events.some(event => event.seq > selection.seq && event.type === 'request/header'
    && event.data.header.config.provider === selection.data.provider
    && event.data.header.config.model === selection.data.model
    && event.data.header.config.reasoningEffort === selection.data.reasoningEffort)
  return consumed ? undefined : { ...selection.data, seq: selection.seq }
}

/** Reject dropped updates and auxiliary/model-switch requests even outside the Codex adapter. */
export function assertReasoningUpdateSession(options: GenerateOptions, session: Session | undefined, pending: boolean): void {
  const recorded = session?.snapshotEvents().filter(event => event.type === 'user/message'
    && readReasoningUpdate(event.data) !== undefined) ?? []
  if (recorded.length === 0 && !pending) {
    planReasoningUpdates(options)
    return
  }
  if (options.purpose !== undefined || (session !== undefined && session.surface.replaceGeneration !== 0)) {
    reasoningUpdateError('Compaction and auxiliary requests are not supported in conversations with confirmed Astra reasoning updates. Start a new conversation when compaction is needed.')
  }
  const ids = new Set(options.messages.filter(message => readReasoningUpdate(message) !== undefined).map(message => message.id))
  for (const event of recorded) {
    if (event.type === 'user/message' && !ids.has(event.data.id)) {
      reasoningUpdateError('A confirmed Astra reasoning update is missing from this request history. Keep the original history or start a new conversation.')
    }
  }
  planReasoningUpdates(options)
}

/** Guards remain installed when new proposals are disabled, so existing approvals still replay. */
export function registerReasoningUpdateGuard(ctx: Context): void {
  ctx.on('agent/request', async ({ agent, signal }, next) => {
    const config = await next()
    signal.throwIfAborted()
    const messages = agent.session.deriveMessages()
    const base = messages.map(readReasoningUpdate).find(update => update !== undefined)?.baseEffort
    const options = { ...config, ...(base === undefined ? {} : { reasoningEffort: ReasoningEffortId(base) }), sessionId: agent.session.id, messages }
    assertReasoningUpdateSession(options, agent.session, pendingUpdates(agent))
    const plan = planReasoningUpdates(options)
    if (plan === undefined) return config
    const pending = pendingSelection(agent.session)
    if (pending !== undefined && (pending.provider !== config.provider || pending.model !== config.model
      || pending.reasoningEffort !== plan.effectiveEffort)) {
      reasoningUpdateError('The model selection changed outside the confirmed Astra update. Start a new conversation or restore the confirmed level.')
    }
    return { ...config, reasoningEffort: ReasoningEffortId(plan.effectiveEffort) }
  }, { prepend: true })
  ctx.on('llm/stream', (options, next) => {
    const session = options.sessionId === undefined ? undefined : ctx.get('sessions')?.get(options.sessionId)
    const agent = options.sessionId === undefined ? undefined : ctx.get('agents')?.get(options.sessionId)
    assertReasoningUpdateSession(options, session, agent !== undefined && pendingUpdates(agent))
    return next()
  }, { prepend: true })
}

interface Selection {
  baseEffort: AstraReasoningEffort
  effectiveEffort: AstraReasoningEffort
  revision: number
}

/** Install one disposable tool contribution, including cancellation of open questions. */
export function registerReasoningUpdateTool(ctx: Context, enabled: () => boolean): void {
  const lifetime = new AbortController()
  const busy = new WeakSet<Agent>()
  const operations = new Set<Promise<unknown>>()

  // Pre-step additions enter the ordinary durable message surface before dispatch.
  ctx.on('agent/pre-step', async ({ agent }, next) => {
    const decision = await next()
    if (decision.kind !== 'enter' || lifetime.signal.aborted
      || !ctx.get('agents')?.roots().includes(agent)) return decision
    const header = agent.session.requestHeader()
    const selected = pendingSelection(agent.session)
    const config = selected ?? header?.config ?? agent.options
    if (config.provider !== 'openai-codex' || config.model !== 'gpt-6-astra') return decision
    const history = agent.session.deriveMessages()
    const messages = [...history, ...decision.messages]
    const base = messages.map(readReasoningUpdate).find(update => update !== undefined)?.baseEffort
    if (!enabled() && base === undefined) return decision
    const additions = [...decision.messages]
    if (selected !== undefined && base !== undefined && isAstraReasoningEffort(selected.reasoningEffort)) {
      const previous = planReasoningUpdates({ provider: config.provider, model: config.model, reasoningEffort: ReasoningEffortId(base), messages, sessionId: agent.id })!
      if (selected.reasoningEffort !== previous.effectiveEffort) {
        const approved = createReasoningUpdateMessage({ version: 1, sessionId: agent.id, baseEffort: base,
          previousEffort: previous.effectiveEffort, effort: selected.reasoningEffort })
        const notice = { ...approved, source: { ...approved.source, reasoningSelectionSeq: selected.seq } }
        messages.push(notice)
        additions.push(notice)
      }
    }
    const explicit = isAstraReasoningEffort(config.reasoningEffort)
      && !(selected === undefined && header?.adapterDefaults?.reasoningEffort === true)
    const plan = explicit ? planReasoningUpdates({ provider: config.provider, model: config.model, reasoningEffort: ReasoningEffortId(base ?? config.reasoningEffort!), messages, sessionId: agent.id }) : undefined
    const text = explicit
      ? `Astra reasoning state: original request-level effort ${plan?.baseEffort ?? config.reasoningEffort}; effective effort for this request ${plan?.effectiveEffort ?? config.reasoningEffort}. The model selector follows the effective request level. At meaningful task transitions, assess the next phase's uncertainty and failure cost, including whether a lower effort is now sufficient. Follow codex_connect_set_reasoning_effort's guidance; the user decides.`
      : 'Astra reasoning state: no explicit initial effort is selected. Do not propose a reasoning update until the user explicitly selects an initial Astra effort; do not infer it from Default.'
    const previous = history.findLast(message => message.source.kind === 'plugin'
      && message.source.plugin === 'dsh-codex-connect' && message.source.form === 'notice' && message.source.summary === 'Astra reasoning state')
    if (previous?.content[0]?.type === 'text' && previous.content[0].text === text) return { ...decision, messages: additions }
    return { ...decision, messages: [...additions, createUserMessage({
      source: { kind: 'plugin', plugin: 'dsh-codex-connect', form: 'notice', summary: 'Astra reasoning state' },
      content: [{ type: 'text', text }],
    })] }
  })

  function selection(agent: Agent): Selection {
    if (!enabled() || lifetime.signal.aborted) reasoningUpdateError('Astra reasoning updates are disabled.')
    const agents = ctx.get('agents')
    if (agents?.get(agent.id) !== agent || !agents.roots().includes(agent)) {
      reasoningUpdateError('Only the live main agent can ask the user to change this conversation\'s reasoning effort.')
    }
    if (pendingUpdates(agent)) reasoningUpdateError('A confirmed reasoning update is already queued for the next request.')
    if (agent.session.surface.replaceGeneration !== 0) {
      reasoningUpdateError('This first version requires an uncompacted conversation. Start a new Astra conversation before changing effort.')
    }
    const header = agent.session.requestHeader()
    const config = header?.config
    if (config?.provider !== 'openai-codex' || config.model !== 'gpt-6-astra'
      || !isAstraReasoningEffort(config.reasoningEffort) || header?.adapterDefaults?.reasoningEffort === true) {
      reasoningUpdateError('Select GPT-6 Astra and an explicit reasoning level before requesting a change; provider Default is not supported by this tool.')
    }
    const latestSelection = pendingSelection(agent.session)
    if (latestSelection !== undefined) {
      const selected = latestSelection
      if (selected.provider !== config.provider || selected.model !== config.model || selected.reasoningEffort !== config.reasoningEffort) {
        reasoningUpdateError('The model selection changed after the last request. Wait for the selected model to handle the next turn before changing effort.')
      }
    }
    const plan = planReasoningUpdates({ ...config, messages: agent.session.deriveMessages(), sessionId: agent.session.id })
    return { baseEffort: plan?.baseEffort ?? config.reasoningEffort, effectiveEffort: plan?.effectiveEffort ?? config.reasoningEffort, revision: selectionRevision(agent.session) }
  }

  async function change(agent: Agent, effort: string, reason: string, signal?: AbortSignal) {
    if (!isAstraReasoningEffort(effort) || reason.trim().length === 0 || reason.length > 2000) {
      reasoningUpdateError('Choose a supported reasoning level and give a reason of 1–2000 characters.')
    }
    const combined = signal === undefined ? lifetime.signal : AbortSignal.any([signal, lifetime.signal])
    combined.throwIfAborted()
    const before = selection(agent)
    if (before.effectiveEffort === effort) return { status: 'unchanged', effort, message: `Astra reasoning is already ${effort}.` }
    if (busy.has(agent)) reasoningUpdateError('A reasoning-change question is already awaiting this user\'s answer.')
    const questions = ctx.get('userQuestions')
    if (questions === undefined) reasoningUpdateError('The current DSH profile has no human-question service. No reasoning change was made.')
    busy.add(agent)
    try {
      const approve = `Change to ${effort}`
      const answer = await questions.ask({
        agent,
        signal: combined,
        questions: [{
          id: 'astra-reasoning-effort',
          header: 'Astra reasoning',
          question: `Change this conversation from ${before.effectiveEffort} to ${effort}?`,
          detail: `Agent's reason: ${reason}\n\nThis affects later requests in this conversation only. The model selector updates when the approved change enters a request. Cache reuse, response quality, and subscription savings are not guaranteed. Compaction and model switching are not supported while these updates are in the history.`,
          options: [
            { label: approve, description: 'Approve this exact change for subsequent requests.' },
            { label: 'Keep current effort', description: 'Continue without changing the reasoning level.' },
          ],
          multiSelect: false,
        }],
      })
      combined.throwIfAborted()
      const chosen = answer.answers
      if (chosen.length !== 1 || chosen[0]?.id !== 'astra-reasoning-effort'
        || chosen[0].selected.length !== 1 || chosen[0].selected[0] !== approve
        || (chosen[0].custom !== undefined && chosen[0].custom.trim() !== '')) {
        return { status: 'declined', effort: before.effectiveEffort, message: 'No reasoning change was approved.' }
      }
      const after = selection(agent)
      if (after.baseEffort !== before.baseEffort || after.effectiveEffort !== before.effectiveEffort || after.revision !== before.revision) {
        reasoningUpdateError('The conversation changed while the user was deciding. The approval was not applied; request a new confirmation.')
      }
      agent.inject(createReasoningUpdateMessage({
        version: 1, sessionId: agent.session.id, baseEffort: before.baseEffort, previousEffort: before.effectiveEffort, effort,
      }))
      return { status: 'queued', effort, message: `The user approved ${effort}. It becomes effective when the queued notice enters the next request; cancellation may discard pending context. The model selector updates with that request.` }
    } finally {
      busy.delete(agent)
    }
  }

  ctx.tools.register(defineTool({
    name: ASTRA_REASONING_TOOL_NAME,
    description: 'Assess the current effective Astra reasoning effort at meaningful task transitions, using the next phase\'s unresolved questions and cost of error, not the difficulty of work already completed. Proactively use this tool, without waiting for the user to name it, when a change is justified. Consider increasing effort for uncertain root causes, competing designs, consequential decisions, or new evidence that invalidates the plan. Explicitly consider decreasing effort once the cause, approach, scope, and acceptance criteria are clear and the remaining work is bounded implementation, routine verification, or follow-up. A written plan alone does not justify decreasing effort: concurrency, security, and data migration may remain difficult during implementation. Do not prescribe fixed levels by phase, such as Max for every plan or High for every implementation. Tool use alone is not a reason to increase effort. Optimize for completing the task reliably, including rework and user time, rather than minimizing tokens in one request; never promise quality or quota savings. Keeping the current level is valid. Do not ask on every tool call, manufacture changes, or reopen a refusal or manual choice without materially changed work or evidence. If no change is warranted, continue the task without asking. Give a brief reason naming the upcoming work, what changed, and why the requested level is appropriate. This tool asks the user; its proposal takes effect only after explicit human confirmation. Ordinary text and Auto-review do not authorize it. Respect the latest explicit manual selection; do not silently override it. Read the logged Astra reasoning state and approved notices, not the selector alone. Requires an explicit initial Astra level and an uncompacted main-agent conversation; this tool changes no defaults or other conversations.',
    parameters: {
      effort: { type: 'string', enum: ASTRA_REASONING_EFFORTS, required: true, description: 'Requested reasoning level.' },
      reason: { type: 'string', required: true, description: 'Briefly name the upcoming work, the changed uncertainty or risk, and why the requested effort is appropriate.' },
    },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: {
        status: { type: 'string', required: true },
        effort: { type: 'string', required: true },
        message: { type: 'string', required: true },
      } },
      render: (_args, value) => [{ type: 'text', text: value.message }],
    },
    isConcurrencySafe: () => false,
    execute(args, exec) {
      const agent = exec.agent
      if (agent === undefined) reasoningUpdateError('Astra reasoning changes require a live main-agent conversation.')
      const operation = change(agent, args.effort, args.reason, exec.signal)
      operations.add(operation)
      void operation.then(() => operations.delete(operation), () => operations.delete(operation))
      return operation
    },
  }))
  ctx.effect(() => async () => {
    lifetime.abort(new Error('Astra reasoning tool was unloaded'))
    await Promise.allSettled([...operations])
  }, 'Codex Connect reasoning questions')
}
