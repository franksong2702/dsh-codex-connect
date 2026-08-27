import { describe, expect, it } from 'vitest'
import {
  decodeOpenAICodexSettings,
  DEFAULT_OPENAI_CODEX_PROXY_URL,
  resolveOpenAICodexProxyUrl,
} from '../src/settings-contract.ts'

const legacySettings = {
  models: undefined,
  enableSearch: false,
  enableImageTool: false,
  enableImageGeneration: false,
  searchModel: 'gpt-5.6-sol',
  searchMode: 'cached',
  searchContextSize: 'medium',
  searchMaxOutputTokens: 10_000,
}

describe('OpenAI Codex proxy settings contract', () => {
  it('upgrades older snapshots to the direct-connection default', () => {
    expect(decodeOpenAICodexSettings(legacySettings)).toMatchObject({
      enableProxy: false,
      proxyUrl: DEFAULT_OPENAI_CODEX_PROXY_URL,
    })
  })

  it('accepts direct mode without requiring a populated proxy URL', () => {
    const decoded = decodeOpenAICodexSettings({
      ...legacySettings,
      enableProxy: false,
      proxyUrl: '',
    })
    expect(decoded).toMatchObject({ enableProxy: false, proxyUrl: '' })
    expect(resolveOpenAICodexProxyUrl(decoded ?? {})).toBeUndefined()
  })

  it('rejects credentials and non-HTTP proxy schemes', () => {
    expect(decodeOpenAICodexSettings({
      ...legacySettings,
      enableProxy: true,
      proxyUrl: 'http://user:secret@127.0.0.1:7890',
    })).toBeUndefined()
    expect(() => resolveOpenAICodexProxyUrl({
      enableProxy: true,
      proxyUrl: 'socks5://127.0.0.1:7890',
    })).toThrow(/credential-free HTTP\(S\) origin/u)
  })
})
