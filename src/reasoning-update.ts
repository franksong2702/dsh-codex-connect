/** Durable, user-confirmed Astra effort changes carried by DSH plugin messages. */

import { createUserMessage, LlmError } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, Message, UserMessage } from '@deepseek-ai/dsh-llm'

/** Reasoning levels accepted by Astra configuration updates. */
export const ASTRA_REASONING_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const
export type AstraReasoningEffort = typeof ASTRA_REASONING_EFFORTS[number]

/** Persisted approval attached to one identified, model-visible notice. */
export interface AstraReasoningUpdate {
  version: 1
  sessionId: string
  baseEffort: AstraReasoningEffort
  previousEffort: AstraReasoningEffort
  effort: AstraReasoningEffort
}

/** One immutable request's ordered updates, anchored to ordinary user-message positions. */
export interface AstraReasoningPlan {
  baseEffort: AstraReasoningEffort
  effectiveEffort: AstraReasoningEffort
  userCount: number
  updates: ReadonlyArray<{ userIndex: number; text: string; effort: AstraReasoningEffort }>
}

/** Reject unsupported or damaged reasoning state before sending model traffic. */
export function reasoningUpdateError(message: string): never {
  throw new LlmError(message, 'OPENAI_CODEX_REASONING_UPDATE')
}

/** Validate a value read from tool input or durable state. */
export function isAstraReasoningEffort(value: unknown): value is AstraReasoningEffort {
  return typeof value === 'string' && ASTRA_REASONING_EFFORTS.some(effort => effort === value)
}

/** Stable model-visible account of the user's confirmed selection. */
export function reasoningUpdateText(update: AstraReasoningUpdate): string {
  return `The user approved changing Astra reasoning effort from ${update.previousEffort} to ${update.effort} for this conversation. The change applies when this message enters the next request. The original request-level effort remains ${update.baseEffort}; other conversations and defaults are unchanged.`
}

/** Construct only after the DSH human-question provider confirms this exact change. */
export function createReasoningUpdateMessage(update: AstraReasoningUpdate): UserMessage {
  const source = {
    kind: 'plugin' as const,
    plugin: 'dsh-codex-connect',
    form: 'notice' as const,
    summary: `Approved Astra reasoning: ${update.previousEffort} → ${update.effort}`,
    reasoningUpdate: { ...update },
  }
  return createUserMessage({ source, content: [{ type: 'text', text: reasoningUpdateText(update) }] })
}

/** Read structured plugin provenance, never a magic string from user or model text. */
export function readReasoningUpdate(message: Message): AstraReasoningUpdate | undefined {
  const source = message.source
  if (source.kind !== 'plugin' || source.plugin !== 'dsh-codex-connect' || !('reasoningUpdate' in source)) return undefined
  const value: unknown = source.reasoningUpdate
  if (typeof value !== 'object' || value === null || Array.isArray(value)
    || !('version' in value) || value.version !== 1
    || !('sessionId' in value) || typeof value.sessionId !== 'string' || value.sessionId.length === 0
    || !('baseEffort' in value) || !isAstraReasoningEffort(value.baseEffort)
    || !('previousEffort' in value) || !isAstraReasoningEffort(value.previousEffort)
    || !('effort' in value) || !isAstraReasoningEffort(value.effort)
    || Object.keys(value).sort().join(',') !== 'baseEffort,effort,previousEffort,sessionId,version') {
    reasoningUpdateError('The saved Astra reasoning update is invalid or uses an unsupported version. Keep the session unchanged and start a new conversation.')
  }
  const update = value as AstraReasoningUpdate
  if (message.role !== 'user' || source.form !== 'notice'
    || message.content.length !== 1 || message.content[0]?.type !== 'text'
    || message.content[0].text !== reasoningUpdateText(update)) {
    reasoningUpdateError('The saved Astra reasoning notice does not match its confirmed update.')
  }
  return update
}

/**
 * Resolve original-position updates from the exact request messages.
 * Pure tool results do not occupy ordinary user-message positions in pi-ai.
 * Mixed tool-result/content messages are rejected while updates are active.
 */
export function planReasoningUpdates(options: GenerateOptions): AstraReasoningPlan | undefined {
  if (!options.messages.some(message => readReasoningUpdate(message) !== undefined)) return undefined
  if (options.provider !== 'openai-codex' || options.model !== 'gpt-6-astra' || options.purpose !== undefined) {
    reasoningUpdateError('This conversation contains confirmed Astra reasoning updates. Model switching and auxiliary requests are not supported; use a new conversation.')
  }
  if (options.sessionId === undefined || !isAstraReasoningEffort(options.reasoningEffort)) {
    reasoningUpdateError('Confirmed Astra reasoning updates require the original session and an explicit original reasoning level.')
  }
  let userCount = 0
  let effectiveEffort: AstraReasoningEffort = options.reasoningEffort
  const updates: Array<{ userIndex: number; text: string; effort: AstraReasoningEffort }> = []
  const ids = new Set<string>()
  for (const message of options.messages) {
    const update = readReasoningUpdate(message)
    if (update !== undefined) {
      if (update.sessionId !== options.sessionId || update.baseEffort !== options.reasoningEffort
        || update.previousEffort !== effectiveEffort || update.effort === effectiveEffort || ids.has(message.id)) {
        reasoningUpdateError('The Astra reasoning history, original model selection, or session identity changed. Resume the original selection or start a new conversation.')
      }
      ids.add(message.id)
      updates.push({ userIndex: userCount, text: reasoningUpdateText(update), effort: update.effort })
      effectiveEffort = update.effort
    }
    if (message.role === 'assistant') continue
    const results = message.content.filter(block => block.type === 'tool-result')
    if (results.length > 0) {
      if (message.role !== 'user' || message.content.length !== 1 || message.source.kind !== 'tool') {
        reasoningUpdateError('Mixed tool-result messages are not supported with Astra reasoning updates.')
      }
      continue
    }
    userCount++
  }
  return { baseEffort: options.reasoningEffort, effectiveEffort, userCount, updates }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Insert updates without changing the request-level effort or any original input item. */
export function applyReasoningUpdates(payload: unknown, plan: AstraReasoningPlan): unknown {
  if (!record(payload) || payload.model !== 'gpt-6-astra' || !Array.isArray(payload.input)
    || !record(payload.reasoning) || payload.reasoning.effort !== plan.baseEffort) {
    reasoningUpdateError('The Astra request does not preserve its original reasoning level.')
  }
  if (payload.context_management !== undefined || (payload.truncation !== undefined && payload.truncation !== 'disabled')
    || payload.previous_response_id !== undefined || payload.agents !== undefined || payload.agent !== undefined
    || payload.input.some(item => record(item) && ['configuration_update', 'compaction', 'compaction_trigger'].includes(String(item.type)))) {
    reasoningUpdateError('Astra reasoning updates require a complete, uncompacted, single-agent request history.')
  }
  let userIndex = 0
  let updateIndex = 0
  const input: unknown[] = []
  for (const item of payload.input) {
    if (record(item) && item.role === 'user') {
      const update = plan.updates[updateIndex]
      if (update?.userIndex === userIndex) {
        if (!Array.isArray(item.content) || item.content.length !== 1
          || !record(item.content[0]) || item.content[0].type !== 'input_text' || item.content[0].text !== update.text) {
          reasoningUpdateError('The Astra reasoning notice changed position during request conversion.')
        }
        input.push({ type: 'configuration_update', reasoning: { effort: update.effort } })
        updateIndex++
      }
      userIndex++
    }
    input.push(item)
  }
  if (userIndex !== plan.userCount || updateIndex !== plan.updates.length) {
    reasoningUpdateError('The Astra request conversion did not preserve its user-message positions.')
  }
  return { ...payload, input }
}
