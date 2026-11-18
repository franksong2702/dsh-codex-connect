/** Ordinary transport must work without loading any task scope implementation. */
import { expect, it, vi } from 'vitest'
import { openaiCodexProvider } from '@earendil-works/pi-ai/providers/openai-codex'
import { createOpenAICodexProfile } from '../src/adapter.ts'
import { OpenAICodexBackendRequests } from '../src/backend-request.ts'

const endpoint = 'https://chatgpt.com/backend-api/codex/responses'

it('dispatches an ordinary profile without task services or rewriting its retry/session policy', () => {
  const provider = openaiCodexProvider()
  const stream = vi.fn(() => { throw new Error('synthetic provider reached') })
  const profile = createOpenAICodexProfile({ ...provider, streamSimple: stream })
  const options = { sessionId: 'ordinary-session', maxRetries: 2 }
  expect(() => profile.piProvider.streamSimple(provider.getModels()[0]!, { messages: [] }, options))
    .toThrow('synthetic provider reached')
  expect(stream).toHaveBeenCalledOnce()
  expect(stream.mock.calls[0]).toEqual([provider.getModels()[0], { messages: [] }, expect.objectContaining(options)])
})

it('uses a provider policy only when the owner explicitly supplies it', () => {
  const provider = openaiCodexProvider()
  const stream = vi.fn(() => { throw new Error('explicit policy reached') })
  const wrap = vi.fn(value => ({ ...value, streamSimple: stream }))
  const profile = createOpenAICodexProfile(provider, undefined, undefined, undefined, undefined, undefined, wrap)
  expect(wrap).toHaveBeenCalledOnce()
  expect(() => profile.piProvider.streamSimple(provider.getModels()[0]!, { messages: [] }))
    .toThrow('explicit policy reached')
})

it('keeps ordinary governor requests independent of optional accounting', async () => {
  const governor = new OpenAICodexBackendRequests()
  const fetch = vi.fn(async () => new Response('synthetic'))
  try {
    const response = await governor.wrapFetch({ lane: 'model', fetch })(endpoint)
    expect(await response.text()).toBe('synthetic')
    expect(fetch).toHaveBeenCalledOnce()
  } finally { governor.dispose() }
})

it('reserves before auxiliary checks and refuses dispatch on a failed reservation', async () => {
  const order: string[] = []
  let deny = false
  const governor = new OpenAICodexBackendRequests(undefined, undefined, 1,
    async () => { order.push('auxiliary') }, undefined,
    async () => { order.push('reserve'); if (deny) throw new Error('budget denied') })
  const fetch = vi.fn(async () => { order.push('fetch'); return new Response(null) })
  const request = governor.wrapFetch({ lane: 'model', fetch })
  try {
    await request(endpoint)
    expect(order).toEqual(['reserve', 'auxiliary', 'fetch'])
    deny = true
    await expect(request(endpoint)).rejects.toThrow('budget denied')
    expect(fetch).toHaveBeenCalledOnce()
    deny = false
    await request(endpoint)
    expect(fetch).toHaveBeenCalledTimes(2)
  } finally { governor.dispose() }
})
