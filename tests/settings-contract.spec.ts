import { describe, expect, it } from 'vitest'
import {
  DEFAULT_OPENAI_CODEX_PROXY_URL,
  DEFAULT_OPENAI_CODEX_SETTINGS,
  decodeOpenAICodexSettings,
  isValidOpenAICodexContextWindowOverrides,
  resolveOpenAICodexProxyUrl,
} from '../src/settings-contract.ts'

describe('OpenAI Codex proxy settings contract', () => {
  it('keeps fresh and legacy settings on direct connection', () => {
    expect(DEFAULT_OPENAI_CODEX_SETTINGS.enableProxy).toBe(false)
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
    expect(resolveOpenAICodexProxyUrl(legacy ?? {})).toBeUndefined()
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
    expect(isValidOpenAICodexContextWindowOverrides({})).toBe(false)
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
})
