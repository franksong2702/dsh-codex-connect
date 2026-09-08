/** DSH human-confirmation and request guards for the opt-in Astra effort tool. */

import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import type { GenerateOptions } from '@deepseek-ai/dsh-llm'
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
    const latestSelection = agent.session.snapshotEvents().findLast(event => event.type === 'model/selection')?.data
    if (latestSelection !== undefined) {
      const selected = latestSelection
      if (selected.provider !== config.provider || selected.model !== config.model || selected.reasoningEffort !== config.reasoningEffort) {
        reasoningUpdateError('The model selection changed after the last request. Wait for the selected model to handle the next turn before changing effort.')
      }
    }
    const plan = planReasoningUpdates({ ...config, messages: agent.session.deriveMessages(), sessionId: agent.session.id })
    return { baseEffort: config.reasoningEffort, effectiveEffort: plan?.effectiveEffort ?? config.reasoningEffort, revision: selectionRevision(agent.session) }
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
          detail: `Agent's reason: ${reason}\n\nThis affects later requests in this conversation only. The original level (${before.baseEffort}) stays in the model selector. Cache reuse, response quality, and subscription savings are not guaranteed. Compaction and model switching are not supported while these updates are in the history.`,
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
      return { status: 'queued', effort, message: `The user approved ${effort}. It becomes effective when the queued notice enters the next request; cancellation may discard pending context. The original model-selector level remains ${before.baseEffort}.` }
    } finally {
      busy.delete(agent)
    }
  }

  ctx.tools.register(defineTool({
    name: ASTRA_REASONING_TOOL_NAME,
    description: 'Propose a different Astra reasoning level when the task warrants it. This tool asks the user and changes only this conversation after explicit confirmation. Do not interpret approval in ordinary text as authorization. Requires an explicit initial Astra level and an uncompacted main-agent conversation; no defaults or other conversations are changed.',
    parameters: {
      effort: { type: 'string', enum: ASTRA_REASONING_EFFORTS, required: true, description: 'Requested reasoning level.' },
      reason: { type: 'string', required: true, description: 'Brief task-specific reason for increasing or decreasing reasoning effort.' },
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
