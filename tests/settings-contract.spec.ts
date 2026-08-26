import { describe, expect, it } from 'vitest'
import {
  DEFAULT_OPENAI_CODEX_PROXY_URL,
  DEFAULT_OPENAI_CODEX_SETTINGS,
  decodeOpenAICodexSettings,
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
})
