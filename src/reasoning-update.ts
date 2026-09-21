/** Internal Think replay mechanism, extracted from #167; not a registered feature or approval authority. */

import { createUserMessage, LlmError } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, Message, UserMessage } from '@deepseek-ai/dsh-llm'
import { isDeepStrictEqual } from 'node:util'
import type { ThinkCheckpointProjection } from './reasoning-update-checkpoint.ts'

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

/** Structured snapshot section owned by this plugin; text is not parsed from user content. */
export const ASTRA_REASONING_SOURCE = 'dsh-codex-connect/reasoning-update' as const
const SELECTION_SECTION = 'dsh-codex-connect/selection-ordinal'

/** One immutable request's ordered updates, anchored to ordinary user-message positions. */
export interface AstraReasoningPlan {
  baseEffort: AstraReasoningEffort
  requestEffort: AstraReasoningEffort
  effectiveEffort: AstraReasoningEffort
  userCount: number
  checkpoints?: readonly ThinkCheckpointProjection[]
  compaction?: true
  /** Leading history prompt eligible for promotion to the provider's system prompt. */
  leadingSystemText?: string
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

/**
 * Construct after a DSH human answer or a logged explicit model selection.
 * @param update - confirmed effort change.
 * @param selectionOrdinal - one-based count of model/selection events, when acknowledging a manual choice.
 * @returns a model-visible message with migration-safe structured provenance.
 */
export function createReasoningUpdateMessage(update: AstraReasoningUpdate, selectionOrdinal?: number): UserMessage {
  const source = {
    kind: 'plugin' as const,
    plugin: 'dsh-codex-connect' as const,
    form: 'snapshot' as const,
    sections: [{ name: ASTRA_REASONING_SOURCE, text: JSON.stringify(update) },
      ...(selectionOrdinal === undefined ? [] : [{ name: SELECTION_SECTION, text: String(selectionOrdinal) }])],
  }
  const message = createUserMessage({ source, content: [{ type: 'text', text: reasoningUpdateText(update) }] })
  readReasoningUpdate(message)
  return message
}

/** Read structured plugin provenance, never a magic string from user or model text. */
export function readReasoningUpdate(message: Message): AstraReasoningUpdate | undefined {
  const source = message.source
  if (source.kind !== 'plugin' || source.plugin !== 'dsh-codex-connect') return undefined
  let value: unknown
  if ('reasoningUpdate' in source || 'reasoningSelectionSeq' in source) {
    reasoningUpdateError('Legacy Astra reasoning metadata requires a separately reviewed migration; no history was changed.')
  }
  if (source.form === 'snapshot') {
    const sections = source.sections.filter(section => section.name === ASTRA_REASONING_SOURCE)
    if (sections.length === 0) return undefined
    if (sections.length !== 1 || source.sections.some(section => ![ASTRA_REASONING_SOURCE, SELECTION_SECTION].includes(section.name))) {
      reasoningUpdateError('Invalid Astra reasoning snapshot sections.')
    }
    try { value = JSON.parse(sections[0]!.text) } catch { reasoningUpdateError('Invalid Astra reasoning snapshot JSON.') }
    readReasoningSelectionOrdinal(message)
  } else {
    return undefined
  }
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
  if (message.role !== 'user'
    || message.content.length !== 1 || message.content[0]?.type !== 'text'
    || message.content[0].text !== reasoningUpdateText(update)) {
    reasoningUpdateError('The saved Astra reasoning notice does not match its confirmed update.')
  }
  return update
}

/**
 * Read the one-based model-selection ordinal, which survives host event-sequence remapping.
 * @param message - durable plugin snapshot.
 * @returns acknowledged selection ordinal, if present.
 */
export function readReasoningSelectionOrdinal(message: Message): number | undefined {
  const source = message.source
  if (source.kind !== 'plugin' || source.plugin !== 'dsh-codex-connect' || source.form !== 'snapshot') return undefined
  const sections = source.sections.filter(section => section.name === SELECTION_SECTION)
  if (sections.length === 0) return undefined
  const value = Number(sections[0]!.text)
  if (sections.length !== 1 || !Number.isSafeInteger(value) || value < 1 || String(value) !== sections[0]!.text) {
    reasoningUpdateError('Invalid Astra model-selection ordinal.')
  }
  return value
}

/**
 * Resolve original-position updates from the exact request messages.
 * Pure tool results do not occupy ordinary user-message positions in pi-ai.
 * Mixed tool-result/content messages are rejected while updates are active.
 */
export function planReasoningUpdates(options: GenerateOptions): AstraReasoningPlan | undefined {
  const first = options.messages.map(readReasoningUpdate).find(update => update !== undefined)
  if (first === undefined) return undefined
  if (options.provider !== 'openai-codex' || options.model !== 'gpt-6-astra' || options.purpose !== undefined) {
    reasoningUpdateError('This conversation contains confirmed Astra reasoning updates. Model switching and auxiliary requests are not supported; use a new conversation.')
  }
  if (options.sessionId === undefined || !isAstraReasoningEffort(options.reasoningEffort)) {
    reasoningUpdateError('Confirmed Astra reasoning updates require the original session and an explicit original reasoning level.')
  }
  let userCount = 0
  let effectiveEffort: AstraReasoningEffort = first.baseEffort
  let previousEffort: AstraReasoningEffort = first.baseEffort
  const updates: Array<{ userIndex: number; text: string; effort: AstraReasoningEffort }> = []
  const ids = new Set<string>()
  for (const message of options.messages) {
    const update = readReasoningUpdate(message)
    if (update !== undefined) {
      if (update.sessionId !== options.sessionId || update.baseEffort !== first.baseEffort
        || update.previousEffort !== effectiveEffort || update.effort === effectiveEffort || ids.has(message.id)) {
        reasoningUpdateError('The Astra reasoning history, original model selection, or session identity changed. Resume the original selection or start a new conversation.')
      }
      ids.add(message.id)
      updates.push({ userIndex: userCount, text: reasoningUpdateText(update), effort: update.effort })
      previousEffort = effectiveEffort
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
  // Old saved headers retain the base; a newly admitted update starts from the prior effective level.
  if (![first.baseEffort, previousEffort, effectiveEffort].includes(options.reasoningEffort)) {
    reasoningUpdateError('The selected reasoning level does not match the confirmed Astra history.')
  }
  const leading = options.messages[0]
  const leadingSystemText = options.system === undefined && leading?.role === 'system'
    ? leading.content.filter(block => block.type === 'text').map(block => block.text).join('') : undefined
  return Object.freeze({ baseEffort: first.baseEffort, requestEffort: options.reasoningEffort, effectiveEffort, userCount,
    updates: Object.freeze(updates.map(update => Object.freeze(update))),
    ...(leadingSystemText === undefined ? {} : { leadingSystemText }) })
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Serialize the original wire effort and position-preserving updates from the effective DSH config. */
export function applyReasoningUpdates(payload: unknown, plan: AstraReasoningPlan): unknown {
  if (!record(payload) || payload.model !== 'gpt-6-astra' || !Array.isArray(payload.input)
    || !record(payload.reasoning) || payload.reasoning.effort !== plan.requestEffort) {
    reasoningUpdateError('The Astra request does not preserve its original reasoning level.')
  }
  if (payload.context_management !== undefined || (payload.truncation !== undefined && payload.truncation !== 'disabled')
    || payload.previous_response_id !== undefined || payload.agents !== undefined || payload.agent !== undefined
    || payload.input.some(item => record(item) && item.type === 'configuration_update')) {
    reasoningUpdateError('Astra reasoning updates require source-validated, single-agent request history.')
  }
  const checkpoints = plan.checkpoints ?? []
  const native = plan.compaction === true && record(payload.input.at(-1)) && payload.input.at(-1).type === 'compaction_trigger'
  const expectedUsers = plan.userCount - (native ? 1 : 0)
  let userIndex = 0
  let updateIndex = 0
  let checkpointIndex = 0
  const input: unknown[] = []
  for (let i = 0; i < payload.input.length; i += 1) {
    const item: unknown = payload.input[i]
    const checkpoint = checkpoints[checkpointIndex]
    if (checkpoint?.userIndex === userIndex) {
      // DSH's all-text user conversion joins blocks without separators before pi-ai serialization.
      const expected = checkpoint.nativeItems ?? [{ role: 'user', content: [{ type: 'input_text', text: checkpoint.content.map(block => {
        if (block.type !== 'text') reasoningUpdateError('Think checkpoint contains unsupported non-text summary content.')
        return block.text
      }).join('') }] }]
      if (isDeepStrictEqual(payload.input.slice(i, i + expected.length), expected)) {
        input.push(...payload.input.slice(i, i + expected.length))
        if (checkpoint.effort !== undefined) input.push({ type: 'configuration_update', reasoning: { effort: checkpoint.effort } })
        checkpointIndex += 1; userIndex += 1; i += expected.length - 1
        continue
      }
      if (record(item) && (item.role === 'user' || item.type === 'compaction')) {
        reasoningUpdateError('Think checkpoint projection differs from its verified host source.')
      }
    }
    if (record(item) && (item.type === 'compaction' || item.type === 'compaction_trigger')) {
      if (native && i === payload.input.length - 1 && item.type === 'compaction_trigger') { input.push(item); continue }
      reasoningUpdateError('Unverified compaction items cannot carry Think state.')
    }
    if (record(item) && item.role === 'user') {
      const update = plan.updates[updateIndex]
      if (update?.userIndex === userIndex) {
        if (!Array.isArray(item.content) || item.content.length !== 1
          || !record(item.content[0]) || item.content[0].type !== 'input_text' || item.content[0].text !== update.text) {
          reasoningUpdateError('The Astra reasoning notice changed position during request conversion.')
        }
        input.push({ type: 'configuration_update', reasoning: { effort: update.effort } })
        updateIndex += 1
      }
      userIndex += 1
    }
    input.push(item)
  }
  if (userIndex !== expectedUsers || updateIndex !== plan.updates.length || checkpointIndex !== checkpoints.length) {
    reasoningUpdateError('The Astra request conversion did not preserve its user-message positions and checkpoints.')
  }
  return { ...payload, input, reasoning: plan.requestEffort === plan.baseEffort
    ? payload.reasoning : { ...payload.reasoning, effort: plan.baseEffort } }
}
