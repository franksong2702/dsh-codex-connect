import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Provider } from '@earendil-works/pi-ai'
import { createOpenAICodexAdapter } from '../src/adapter.ts'
import type { OpenAICodexCredentialStore } from '../src/store.ts'

const observed = vi.hoisted(() => [] as { contextWindow: number; maxTokens: number | undefined; transport: string | undefined }[])

vi.mock('@earendil-works/pi-ai/providers/openai-codex', async importOriginal => {
  const actual = await importOriginal<typeof import('@earendil-works/pi-ai/providers/openai-codex')>()
  return {
    ...actual,
    openaiCodexProvider: () => {
      const provider: Provider = {
        ...actual.openaiCodexProvider(),
        streamSimple(model, _context, options) {
          observed.push({ contextWindow: model.contextWindow, maxTokens: options?.maxTokens, transport: options?.transport })
          throw new Error('offline stream capture')
        },
      }
      return provider
    },
  }
})

afterEach(() => { observed.length = 0; vi.unstubAllGlobals() })

describe('context-window request snapshots', () => {
  it('streams a prepared call with its captured window while new calls use the updated window and unchanged output budget', async () => {
    vi.stubGlobal('fetch', () => { throw new Error('Network is forbidden in this test') })
    const credentials = {
      read: async () => ({ type: 'oauth', access: 'offline-test-access', refresh: 'offline-test-refresh', expires: Date.now() + 3_600_000 }),
    } as unknown as OpenAICodexCredentialStore
    const overrides = { 'gpt-5.6-sol': 350_000 }
    const adapter = createOpenAICodexAdapter(credentials, () => undefined, undefined, undefined, undefined, undefined, () => overrides)
    const prepared = await adapter.prepareCall('openai-codex', 'gpt-5.6-sol')
    overrides['gpt-5.6-sol'] = 300_000
    const current = await adapter.prepareCall('openai-codex', 'gpt-5.6-sol')
    const options = { provider: 'openai-codex', model: 'gpt-5.6-sol', messages: [], maxTokens: 1024 }
    for (const call of [prepared, current]) {
      const events: unknown[] = []
      for await (const event of call.stream(options)) events.push(event)
      expect(events).toContainEqual({
        type: 'finish', reason: { kind: 'error', failure: { code: 'PI_AI_ERROR', message: 'offline stream capture' } },
      })
    }
    expect(observed).toEqual([
      { contextWindow: 350_000, maxTokens: 1024, transport: 'sse' },
      { contextWindow: 300_000, maxTokens: 1024, transport: 'sse' },
    ])
  })
})
