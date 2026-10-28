import { expect, it } from 'vitest'
import { isOpenAICodexSpeedMode, supportsOpenAICodexUltrafast, projectOpenAICodexSpeedPayload } from '../src/speed-mode-contract.ts'

it.each(['gpt-6-astra', 'gpt-6.1-sol'])('accepts only the documented exact Codex model %s', model => {
  expect(supportsOpenAICodexUltrafast('openai-codex', model)).toBe(true)
  expect(supportsOpenAICodexUltrafast('other-provider', model)).toBe(false)
  const payload = { model, input: [], reasoning: { effort: 'max' }, max_output_tokens: 1234 }
  expect(projectOpenAICodexSpeedPayload(payload, 'openai-codex', model, 'ultrafast'))
    .toEqual({ ...payload, service_tier: 'ultrafast' })
  expect(payload).not.toHaveProperty('service_tier')
})
it.each(['gpt-6.1-terra', 'gpt-6-sol', 'gpt-6-luna', 'gpt-5.6-sol', 'gpt-6.1-sol-preview', 'gpt-6-astra-extra', 'GPT-6-ASTRA'])('refuses Ultrafast for %s without fuzzy matching', model => {
  expect(supportsOpenAICodexUltrafast('openai-codex', model)).toBe(false)
  expect(() => projectOpenAICodexSpeedPayload({ model }, 'openai-codex', model, 'ultrafast')).toThrow('ULTRAFAST_MODEL_UNSUPPORTED')
  expect(projectOpenAICodexSpeedPayload({ model, service_tier: 'ultrafast' }, 'openai-codex', model, 'standard')).toEqual({ model })
})
it('keeps Standard, Fast and Ultrafast mutually exclusive while preserving effort/output fields', () => {
  const payload = { model: 'gpt-6.1-sol', service_tier: 'ultrafast', reasoning: { effort: 'low' }, max_output_tokens: 2048 }
  const standard = { model: payload.model, reasoning: payload.reasoning, max_output_tokens: payload.max_output_tokens }
  expect(projectOpenAICodexSpeedPayload(payload, 'openai-codex', payload.model, 'standard')).toEqual(standard)
  expect(projectOpenAICodexSpeedPayload(payload, 'openai-codex', payload.model, 'fast')).toEqual({ ...standard, service_tier: 'priority' })
  expect(payload.service_tier).toBe('ultrafast')
})
it.each([{}, { model: 'gpt-6-astra' }, { model: 'gpt-5.6-sol' }])('refuses a previous callback changing the actual Ultrafast payload model', payload => {
  expect(() => projectOpenAICodexSpeedPayload(payload, 'openai-codex', 'gpt-6.1-sol', 'ultrafast')).toThrow('ULTRAFAST_PAYLOAD_MODEL_MISMATCH')
})
it('preserves Fast callback replacements and leaves unrelated providers alone', () => {
  expect(projectOpenAICodexSpeedPayload({ existing: true }, 'openai-codex', 'gpt-5.6-sol', 'fast')).toEqual({ existing: true, service_tier: 'priority' })
  const payload = { existing: true }
  expect(projectOpenAICodexSpeedPayload(payload, 'other-provider', 'gpt-6.1-sol', 'standard')).toBe(payload)
  expect(() => projectOpenAICodexSpeedPayload(payload, 'other-provider', 'gpt-6.1-sol', 'ultrafast')).toThrow('ULTRAFAST_MODEL_UNSUPPORTED')
})
it('accepts only the three explicit mode values', () => {
  for (const value of ['standard', 'fast', 'ultrafast']) expect(isOpenAICodexSpeedMode(value)).toBe(true)
  for (const value of [true, false, 'priority', 'UltraFast', '', null, undefined]) expect(isOpenAICodexSpeedMode(value)).toBe(false)
})
