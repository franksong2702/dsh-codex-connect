import { describe, expect, it, vi } from 'vitest'
import type { AssistantMessageEventStream, Context as PiContext, Model, Provider, SimpleStreamOptions } from '@earendil-works/pi-ai'
import { withOpenAICodexFastMode } from '../src/adapter.ts'
import {
  FastModeRegistry,
  OPENAI_CODEX_FAST_MODE_MAX_SESSION_ID_LENGTH,
} from '../src/fast-mode.ts'

function providerFixture(id = 'openai-codex'): {
  provider: Provider
  payloads: unknown[]
  streamSimple: ReturnType<typeof vi.fn>
} {
  const payloads: unknown[] = []
  const streamSimple = vi.fn((_model: Model<'openai-codex-responses'>, _context: PiContext, options?: SimpleStreamOptions) => {
    void Promise.resolve(options?.onPayload?.({ model: 'gpt-5', input: [] }, model(id)))
      .then(payload => { payloads.push(payload) })
    return {} as AssistantMessageEventStream
  })
  return {
    payloads,
    streamSimple,
    provider: {
      id,
      name: id,
      auth: { apiKey: { name: 'test', resolve: async () => undefined } },
      getModels: () => [],
      stream: streamSimple,
      streamSimple,
    } as unknown as Provider,
  }
}

function model(provider: string): Model<'openai-codex-responses'> {
  return { provider, id: 'gpt-5', name: 'GPT-5', api: 'openai-codex-responses', contextWindow: 1, input: ['text'] } as unknown as Model<'openai-codex-responses'>
}

describe('OpenAI Codex Fast Mode registry', () => {
  it('defaults off, isolates sessions, deletes on disable, and evicts oldest safely', () => {
    const registry = new FastModeRegistry(2)
    expect(registry.isEnabled('a')).toBe(false)
    registry.set('a', true)
    registry.set('b', true)
    expect(registry.isEnabled('a')).toBe(true)
    expect(registry.isEnabled('other')).toBe(false)
    registry.set('c', true)
    expect(registry.isEnabled('a')).toBe(true)
    expect(registry.isEnabled('b')).toBe(false)
    expect(registry.isEnabled('c')).toBe(true)
    registry.set('a', false)
    expect(registry.isEnabled('a')).toBe(false)
    expect(registry.size).toBe(1)
    expect(new FastModeRegistry().isEnabled('a')).toBe(false)
  })

  it('rejects empty, non-string, and overlong opaque session ids', () => {
    const registry = new FastModeRegistry()
    expect(registry.isEnabled('')).toBe(false)
    expect(registry.isEnabled('   ')).toBe(false)
    expect(registry.isEnabled(undefined)).toBe(false)
    expect(() => registry.set('', true)).toThrow(TypeError)
    expect(() => registry.set('x'.repeat(OPENAI_CODEX_FAST_MODE_MAX_SESSION_ID_LENGTH + 1), true)).toThrow(TypeError)
  })
})

describe('OpenAI Codex Fast Mode adapter boundary', () => {
  it('adds priority to the wire payload only for enabled OpenAI Codex sessions and preserves off options', async () => {
    const fixture = providerFixture()
    const registry = new FastModeRegistry()
    const wrapped = withOpenAICodexFastMode(fixture.provider, registry)
    const options: SimpleStreamOptions = { sessionId: 'session-a', temperature: 0.2 }
    wrapped.streamSimple(model('openai-codex'), {} as PiContext, options)
    expect(fixture.streamSimple).toHaveBeenCalledWith(expect.anything(), expect.anything(), options)
    registry.set('session-a', true)
    wrapped.streamSimple(model('openai-codex'), {} as PiContext, options)
    const enabledOptions = fixture.streamSimple.mock.lastCall?.[2] as SimpleStreamOptions | undefined
    expect(enabledOptions).toEqual(expect.objectContaining({ sessionId: 'session-a', temperature: 0.2 }))
    expect(enabledOptions?.onPayload).toBeTypeOf('function')
    expect(await enabledOptions?.onPayload?.({ model: 'gpt-5', input: [] }, model('openai-codex')))
      .toEqual({ model: 'gpt-5', input: [], service_tier: 'priority' })
    wrapped.streamSimple(model('openai-codex'), {} as PiContext, { temperature: 0.2 })
    expect(fixture.streamSimple).toHaveBeenLastCalledWith(expect.anything(), expect.anything(), { temperature: 0.2 })
    await Promise.resolve()
    expect(fixture.payloads).toContainEqual({ model: 'gpt-5', input: [], service_tier: 'priority' })
  })

  it('preserves an existing payload replacement before adding priority', async () => {
    const fixture = providerFixture()
    const registry = new FastModeRegistry()
    registry.set('session-a', true)
    const wrapped = withOpenAICodexFastMode(fixture.provider, registry)
    const onPayload = vi.fn(async () => ({ existing: true }))
    wrapped.streamSimple(model('openai-codex'), {} as PiContext, { sessionId: 'session-a', onPayload })
    const options = fixture.streamSimple.mock.lastCall?.[2] as SimpleStreamOptions | undefined
    expect(await options?.onPayload?.({ original: true }, model('openai-codex')))
      .toEqual({ existing: true, service_tier: 'priority' })
    expect(onPayload).toHaveBeenCalledWith({ original: true }, expect.objectContaining({ provider: 'openai-codex' }))
  })

  it('does not inject for a different provider even when the registry is enabled', () => {
    const fixture = providerFixture('other-provider')
    const registry = new FastModeRegistry()
    registry.set('session-a', true)
    const wrapped = withOpenAICodexFastMode(fixture.provider, registry)
    wrapped.streamSimple(model('other-provider'), {} as PiContext, { sessionId: 'session-a' })
    expect(fixture.streamSimple).toHaveBeenCalledWith(expect.anything(), expect.anything(), { sessionId: 'session-a' })
  })
})
