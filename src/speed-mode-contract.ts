/** Node-free contract for explicit conversation speed selection. */
export const OPENAI_CODEX_SPEED_MODE_PATH = '/plugins/dsh-openai-codex/speed-mode'
export type OpenAICodexSpeedMode = 'standard' | 'fast' | 'ultrafast'
export interface ConversationSpeedState {
  readonly generation: string
  readonly revision: number
  readonly mode: OpenAICodexSpeedMode
  readonly model: string
  readonly modelSupported: boolean
  readonly eligibility: 'unknown'
  readonly hasAccount: boolean
  readonly selectionAvailable: boolean
}
export function readConversationSpeed(value: unknown, model: string): ConversationSpeedState | undefined {
  if (!record(value) || typeof value['generation'] !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/u.test(value['generation'])
    || !Number.isSafeInteger(value['revision']) || Number(value['revision']) < 0 || !isOpenAICodexSpeedMode(value['mode'])
    || value['model'] !== model || typeof value['modelSupported'] !== 'boolean' || value['eligibility'] !== 'unknown'
    || typeof value['hasAccount'] !== 'boolean' || typeof value['selectionAvailable'] !== 'boolean') return undefined
  return value as unknown as ConversationSpeedState
}

export function isOpenAICodexSpeedMode(value: unknown): value is OpenAICodexSpeedMode {
  return value === 'standard' || value === 'fast' || value === 'ultrafast'
}

/** Model support is separate from the account's unknown billing entitlement. */
export function supportsOpenAICodexUltrafast(provider: unknown, model: unknown): boolean {
  return provider === 'openai-codex' && (model === 'gpt-6-astra' || model === 'gpt-6.1-sol')
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/**
 * The selector owns its speed hint, after any previous onPayload replacement.
 * A hint is not confirmation of the tier actually served by the backend.
 */
export function projectOpenAICodexSpeedPayload(
  payload: unknown,
  provider: string,
  model: string,
  mode: OpenAICodexSpeedMode,
): unknown {
  if (mode === 'ultrafast' && !supportsOpenAICodexUltrafast(provider, model)) {
    throw new TypeError('ULTRAFAST_MODEL_UNSUPPORTED')
  }
  if (!record(payload) || provider !== 'openai-codex') return payload
  if (mode === 'ultrafast') {
    if (payload['model'] !== model) throw new TypeError('ULTRAFAST_PAYLOAD_MODEL_MISMATCH')
    return { ...payload, service_tier: 'ultrafast' }
  }
  if (mode === 'fast') return { ...payload, service_tier: 'priority' }
  if (payload['service_tier'] !== 'priority' && payload['service_tier'] !== 'ultrafast') return payload
  const standard = { ...payload }
  delete standard['service_tier']
  return standard
}

/** Preserve an optional new-session preference until settings layers have merged. */
export function parseOpenAICodexSpeedDefault(value: unknown): OpenAICodexSpeedMode | null | undefined {
  if (value === undefined || value === null || isOpenAICodexSpeedMode(value)) return value
  throw new TypeError('OpenAI Codex new-session speed must be standard, fast, ultrafast, null or omitted')
}
