/** Optional profile reasoning policy; model support remains owned by the Host adapter. */
export const OPENAI_CODEX_REASONING_EFFORTS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const

/** Reasoning levels accepted by the public PiAiAdapter profile. */
export type OpenAICodexReasoningEffort = typeof OPENAI_CODEX_REASONING_EFFORTS[number]

/** Preserve null masks until settings layers have merged; omission retains provider behavior. */
export function parseOpenAICodexReasoningEffort(value: unknown): OpenAICodexReasoningEffort | null | undefined {
  if (value === undefined || value === null) return value
  if (typeof value !== 'string' || !OPENAI_CODEX_REASONING_EFFORTS.some(effort => effort === value)) {
    throw new TypeError('OpenAI Codex reasoningEffort must be off, minimal, low, medium, high, xhigh, max, null or omitted')
  }
  return value as OpenAICodexReasoningEffort
}
