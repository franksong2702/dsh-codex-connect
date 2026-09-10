import { describe, expect, it } from 'vitest'
import {
  DEFAULT_OPENAI_CODEX_PROXY_URL,
  DEFAULT_OPENAI_CODEX_SETTINGS,
  decodeOpenAICodexSettings,
  isValidOpenAICodexImageModelHint,
  isValidOpenAICodexContextWindowOverrides,
  resolveOpenAICodexProxyUrl,
  resolveOpenAICodexSettings,
} from '../src/settings-contract.ts'
import { Config } from '../src/index.ts'

describe('OpenAI Codex proxy settings contract', () => {
  it.each(['gpt-image-2\n', 'gpt-image-2\r', 'gpt-image-2\u2028', 'gpt-image-2\u2029', 'a'.repeat(129), 'model\tname'])('rejects padded or oversized image hints on Host and browser: %j', imageModelHint => {
    expect(isValidOpenAICodexImageModelHint(imageModelHint)).toBe(false)
    expect(() => Config({ imageModelHint })).toThrow()
    expect(() => resolveOpenAICodexSettings({ imageModelHint })).toThrow()
    expect(decodeOpenAICodexSettings({ ...DEFAULT_OPENAI_CODEX_SETTINGS, imageModelHint })).toBeUndefined()
  })

  it('validates and defaults the optional image model hint', () => {
    expect(DEFAULT_OPENAI_CODEX_SETTINGS.imageModelHint).toBe('')
    expect(isValidOpenAICodexImageModelHint('gpt-image-2')).toBe(true)
    expect(isValidOpenAICodexImageModelHint('')).toBe(true)
    expect(isValidOpenAICodexImageModelHint('https://evil.example')).toBe(false)
    expect(isValidOpenAICodexImageModelHint('bad value')).toBe(false)
    expect(decodeOpenAICodexSettings({ ...DEFAULT_OPENAI_CODEX_SETTINGS, imageModelHint: 'custom_model' })?.imageModelHint).toBe('custom_model')
    expect(decodeOpenAICodexSettings({ ...DEFAULT_OPENAI_CODEX_SETTINGS, imageModelHint: 'bad value' })).toBeUndefined()
  })
  it('keeps fresh and legacy settings on direct connection', () => {
    expect(DEFAULT_OPENAI_CODEX_SETTINGS.enableProxy).toBe(false)
    expect(DEFAULT_OPENAI_CODEX_SETTINGS.autoReviewDisclosureAcknowledged).toBe(false)
    expect(DEFAULT_OPENAI_CODEX_SETTINGS.enableAutoReview).toBe(false)
    expect(DEFAULT_OPENAI_CODEX_SETTINGS.proxyUrl).toBe(DEFAULT_OPENAI_CODEX_PROXY_URL)
    const legacy = decodeOpenAICodexSettings({
      enableSearch: false,
      enableImageTool: false,
      searchModel: 'gpt-5.6-sol',
      searchMode: 'cached',
      searchContextSize: 'medium',
      searchMaxOutputTokens: 10_000,
    })
    expect(legacy?.enableProxy).toBe(false)
    expect(legacy?.proxyUrl).toBe(DEFAULT_OPENAI_CODEX_PROXY_URL)
    expect(legacy?.autoReviewDisclosureAcknowledged).toBe(false)
    expect(legacy?.enableAutoReview).toBe(false)
    expect(resolveOpenAICodexProxyUrl(legacy ?? {})).toBeUndefined()
  })

  it('rejects non-boolean Auto-review settings while preserving the default-off legacy value', () => {
    expect(decodeOpenAICodexSettings({
      ...DEFAULT_OPENAI_CODEX_SETTINGS,
      enableAutoReview: 'yes',
    })).toBeUndefined()
    expect(resolveOpenAICodexSettings({}).enableAutoReview).toBe(false)
    expect(decodeOpenAICodexSettings({
      ...DEFAULT_OPENAI_CODEX_SETTINGS,
      autoReviewDisclosureAcknowledged: 'yes',
    })).toBeUndefined()
    expect(Config({
      autoReviewDisclosureAcknowledged: true,
      enableAutoReview: true,
    })).toMatchObject({
      autoReviewDisclosureAcknowledged: true,
      enableAutoReview: true,
    })
  })

  it('rejects unsafe active proxy values while preserving explicit activation semantics', () => {
    expect(decodeOpenAICodexSettings({
      enableProxy: true,
      proxyUrl: 'http://user:password@127.0.0.1:7890',
      enableSearch: false,
      enableImageTool: false,
      searchModel: 'gpt-5.6-sol',
      searchMode: 'cached',
      searchContextSize: 'medium',
      searchMaxOutputTokens: 10_000,
    })).toBeUndefined()
    expect(resolveOpenAICodexProxyUrl({ enableProxy: true, proxyUrl: 'http://127.0.0.1:7890' }))
      .toBe('http://127.0.0.1:7890')
  })

  it('defaults context-window overrides to undefined', () => {
    expect(DEFAULT_OPENAI_CODEX_SETTINGS.contextWindowOverrides).toBeUndefined()
    const legacy = decodeOpenAICodexSettings({
      enableSearch: false,
      enableImageTool: false,
      searchModel: 'gpt-5.6-sol',
      searchMode: 'cached',
      searchContextSize: 'medium',
      searchMaxOutputTokens: 10_000,
    })
    expect(legacy?.contextWindowOverrides).toBeUndefined()
  })

  it('accepts and detaches valid context-window overrides', () => {
    expect(isValidOpenAICodexContextWindowOverrides({ 'gpt-5.6-sol': 1_050_000 })).toBe(true)
    const decoded = decodeOpenAICodexSettings({
      contextWindowOverrides: { 'gpt-5.6-sol': 1_050_000, 'gpt-5.6-terra': 1_050_000 },
      enableSearch: false,
      enableImageTool: false,
      searchModel: 'gpt-5.6-sol',
      searchMode: 'cached',
      searchContextSize: 'medium',
      searchMaxOutputTokens: 10_000,
    })
    expect(decoded?.contextWindowOverrides).toEqual({ 'gpt-5.6-sol': 1_050_000, 'gpt-5.6-terra': 1_050_000 })
  })

  it('rejects malformed context-window overrides', () => {
    expect(isValidOpenAICodexContextWindowOverrides({})).toBe(true)
    expect(isValidOpenAICodexContextWindowOverrides({ 'gpt-5.6-sol': 0 })).toBe(false)
    expect(isValidOpenAICodexContextWindowOverrides({ 'gpt-5.6-sol': -1 })).toBe(false)
    expect(isValidOpenAICodexContextWindowOverrides({ 'gpt-5.6-sol': 1.5 })).toBe(false)
    expect(isValidOpenAICodexContextWindowOverrides({ '': 100 })).toBe(false)
    expect(isValidOpenAICodexContextWindowOverrides([])).toBe(false)
    expect(decodeOpenAICodexSettings({
      contextWindowOverrides: { 'gpt-5.6-sol': 0 },
      enableSearch: false,
      enableImageTool: false,
      searchModel: 'gpt-5.6-sol',
      searchMode: 'cached',
      searchContextSize: 'medium',
      searchMaxOutputTokens: 10_000,
    })).toBeUndefined()
  })

  it.each([
    {}, { 'gpt-5.6-sol': 1 }, { 'gpt-5.6-sol': Number.MAX_SAFE_INTEGER },
    Object.fromEntries(Array.from({ length: 256 }, (_, index) => [`model-${index}`, 300_000])),
  ])('accepts the same structural map on Host and browser: %j', overrides => {
    expect(isValidOpenAICodexContextWindowOverrides(overrides)).toBe(true)
    const config = Config({ contextWindowOverrides: overrides })
    expect(decodeOpenAICodexSettings(config)?.contextWindowOverrides).toEqual(overrides)
    expect(resolveOpenAICodexSettings(config).contextWindowOverrides).toEqual(overrides)
  })

  it.each([
    [], '300000', { '': 1 }, { ' gpt-5.6-sol': 1 }, { 'gpt-5.6-sol': '300000' },
    { 'gpt-5.6-sol': 0 }, { 'gpt-5.6-sol': -1 }, { 'gpt-5.6-sol': 1.5 },
    { 'gpt-5.6-sol': Number.MAX_SAFE_INTEGER + 1 }, { 'gpt-5.6-sol': Infinity }, { 'gpt-5.6-sol': NaN },
    Object.fromEntries(Array.from({ length: 257 }, (_, index) => [`model-${index}`, 300_000])),
  ])('rejects the same malformed map on Host and browser: %j', overrides => {
    expect(isValidOpenAICodexContextWindowOverrides(overrides)).toBe(false)
    expect(() => Config({ contextWindowOverrides: overrides } as never)).toThrow()
    expect(decodeOpenAICodexSettings({ ...DEFAULT_OPENAI_CODEX_SETTINGS, contextWindowOverrides: overrides })).toBeUndefined()
    expect(() => resolveOpenAICodexSettings({ contextWindowOverrides: overrides } as never)).toThrow()
  })

  it('preserves the Host null sentinel and resolves it as disabled in both consumers', () => {
    const host = Config({ contextWindowOverrides: null })
    expect(host.contextWindowOverrides).toBeNull()
    expect(resolveOpenAICodexSettings(host).contextWindowOverrides).toBeUndefined()
    expect(decodeOpenAICodexSettings({ ...DEFAULT_OPENAI_CODEX_SETTINGS, contextWindowOverrides: null })?.contextWindowOverrides).toBeUndefined()
    expect(resolveOpenAICodexSettings({ contextWindowOverrides: null }).contextWindowOverrides).toBeUndefined()
  })

  it('preserves per-model null masks on Host and removes them only in resolved settings', () => {
    const input = { 'gpt-5.6-sol': null, 'gpt-5.6-terra': 300_000 }
    const host = Config({ contextWindowOverrides: input })
    expect(host.contextWindowOverrides).toEqual(input)
    expect(host.contextWindowOverrides).not.toBe(input)
    expect(resolveOpenAICodexSettings(host).contextWindowOverrides).toEqual({ 'gpt-5.6-terra': 300_000 })
    expect(decodeOpenAICodexSettings(host)?.contextWindowOverrides).toEqual({ 'gpt-5.6-terra': 300_000 })
    expect(isValidOpenAICodexContextWindowOverrides({ '': null })).toBe(false)
    expect(isValidOpenAICodexContextWindowOverrides(Object.fromEntries(Array.from({ length: 257 }, (_, i) => [`model-${i}`, null])))).toBe(false)
  })
})
