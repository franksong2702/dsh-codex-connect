import { describe, expect, it, vi } from 'vitest'
import { OpenAICodexPreflightActivity, resolveOpenAICodexPreflightConfig } from '../src/preflight-activity.ts'
import { OPENAI_CODEX_MAX_PREFLIGHT_MS, OPENAI_CODEX_STREAM_IDLE_TIMEOUT_MS } from '../src/preflight-watchdog.ts'
import { createOpenAICodexAdapter, createOpenAICodexProfile } from '../src/adapter.ts'
import { openaiCodexProvider } from '@earendil-works/pi-ai/providers/openai-codex'
import { Config } from '../src/index.ts'
import { OpenAICodexBackendRequests } from '../src/backend-request.ts'
import type { OpenAICodexProxyManager } from '../src/provider-proxy.ts'
import type { OpenAICodexCredentialStore } from '../src/store.ts'

const config = { protocol: 'bili-v1' as const, trustedProxyOrigin: 'http://127.0.0.1:7890', maxDurationMs: 450_000 }

describe('preflight startup configuration', () => {
  it.each([0, -1, 1.5, Number.NaN, Infinity, OPENAI_CODEX_MAX_PREFLIGHT_MS + 1])('rejects unsafe budgets including inner-timer overflow: %s', maxDurationMs => {
    expect(() => resolveOpenAICodexPreflightConfig({ ...config, maxDurationMs })).toThrow('positive integer')
    expect(() => Config({ preflightActivity: { ...config, maxDurationMs } })).toThrow()
  })

  it.each(['', 'socks5://127.0.0.1:1080', 'http://user:password@127.0.0.1:7890', 'http://127.0.0.1:7890/path'])
    ('refuses a non-origin or credential-bearing proxy authorization: %s', trustedProxyOrigin => {
      expect(() => resolveOpenAICodexPreflightConfig({ ...config, trustedProxyOrigin })).toThrow('trustedProxyOrigin')
    })

  it('is absent by default and freezes a detached authorization', () => {
    expect(Config({}).preflightActivity).toBeUndefined()
    expect(Config({ preflightActivity: config }).preflightActivity).toEqual(config)
    const input = { ...config }
    const activity = new OpenAICodexPreflightActivity(input)
    input.maxDurationMs = 1
    input.trustedProxyOrigin = 'http://127.0.0.1:7897'
    expect(activity.config).toEqual(config)
    expect(Object.isFrozen(activity.config)).toBe(true)
    expect(activity.hostIdleTimeoutMs).toBe(750_000)
  })

  it('preserves the ordinary profile and constructs on the unchanged development SDK', async () => {
    expect(createOpenAICodexProfile(openaiCodexProvider()).streamIdleTimeoutMs).toBe(OPENAI_CODEX_STREAM_IDLE_TIMEOUT_MS)
    const captureActiveAccount = vi.fn()
    const credentials = { captureActiveAccount } as unknown as OpenAICodexCredentialStore
    const host = createOpenAICodexAdapter(credentials, () => undefined, undefined, undefined, undefined,
      undefined, undefined, undefined, undefined, undefined, undefined, undefined, config)
    expect(await host.listModels('openai-codex')).not.toHaveLength(0)
    expect(captureActiveAccount).not.toHaveBeenCalled()
  })

  it('reports only the proxy acquired for this stream and reads it once', async () => {
    const origins: (string | undefined)[] = []
    const resolveProxy = vi.fn(() => config.trustedProxyOrigin)
    const proxy = { runStream(origin: string | undefined, operation: () => { result(): Promise<void> }) {
      origins.push(origin)
      resolveProxy.mockReturnValue('http://127.0.0.1:7897')
      return operation()
    } } as OpenAICodexProxyManager
    const requests = new OpenAICodexBackendRequests(proxy, resolveProxy)
    try {
      await requests.runStream(origin => {
        expect(origin).toBe(config.trustedProxyOrigin)
        return { result: async () => {} }
      }).result()
      expect(origins).toEqual([config.trustedProxyOrigin])
      expect(resolveProxy).toHaveBeenCalledOnce()
    } finally { requests.dispose() }
  })

  it('never claims an acquired proxy when no manager exists', () => {
    const resolveProxy = vi.fn(() => config.trustedProxyOrigin)
    const requests = new OpenAICodexBackendRequests(undefined, resolveProxy)
    try {
      requests.runStream(origin => { expect(origin).toBeUndefined(); return { result: async () => {} } })
      expect(resolveProxy).not.toHaveBeenCalled()
    } finally { requests.dispose() }
  })
})
