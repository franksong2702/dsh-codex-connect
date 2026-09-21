import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  OpenAICodexBackendRequests,
} from '../src/backend-request.ts'
import {
  assertOpenAICodexBackendUrl,
  prepareOpenAICodexBackendHeaders,
} from '../src/backend-request-policy.ts'

const URL = 'https://chatgpt.com/backend-api/codex/responses'

async function flush(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

describe('shared Codex backend request policy', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(0) })
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

  it('fails closed outside chatgpt.com/backend-api and keeps provider identity when requested', () => {
    expect(() => assertOpenAICodexBackendUrl(URL)).not.toThrow()
    for (const invalid of [
      'https://chatgpt.com/other',
      'https://api.openai.com/backend-api/codex/responses',
      'https://evil.example/backend-api/codex/responses',
    ]) expect(() => assertOpenAICodexBackendUrl(invalid)).toThrow('chatgpt.com/backend-api')

    const plugin = prepareOpenAICodexBackendHeaders({ authorization: 'Bearer secret' }, 'plugin', 'req-plugin')
    expect(plugin.headers.get('originator')).toBe('deepseek-harness')
    expect(plugin.headers.get('user-agent')).toBe('dsh-codex-connect')
    expect(plugin.headers.get('x-client-request-id')).toBe('req-plugin')
    expect(plugin.headers.get('authorization')).toBe('Bearer secret')

    const provider = prepareOpenAICodexBackendHeaders({ originator: 'pi', 'user-agent': 'pi' }, 'preserve', 'req-provider')
    expect(provider.headers.get('originator')).toBe('pi')
    expect(provider.headers.get('user-agent')).toBe('pi')
    expect(provider.headers.get('x-client-request-id')).toBe('req-provider')
  })

  it('holds provider concurrency until the response body is consumed or cancelled', async () => {
    const manager = new OpenAICodexBackendRequests(undefined, () => undefined, 1)
    const controllers: ReadableStreamDefaultController<Uint8Array>[] = []
    const base = vi.fn(async () => new Response(new ReadableStream<Uint8Array>({
      start(controller) { controllers.push(controller) },
    }), { headers: { 'content-type': 'text/event-stream' } }))
    const governed = manager.wrapFetch({ lane: 'model', identity: 'preserve', fetch: base })

    const first = await governed(URL)
    const secondPromise = governed(URL)
    await flush()
    expect(base).toHaveBeenCalledTimes(1)

    const reader = first.body!.getReader()
    await reader.cancel('done')
    reader.releaseLock()
    const second = await secondPromise
    expect(base).toHaveBeenCalledTimes(2)
    await second.body!.cancel()
    expect(controllers).toHaveLength(2)
    manager.dispose()
  })

  it('keeps queued network work abortable without dispatching it', async () => {
    const manager = new OpenAICodexBackendRequests(undefined, () => undefined, 1)
    const first = await manager.wrapFetch({ lane: 'model', fetch: async () => new Response(new ReadableStream()) })(URL)
    const controller = new AbortController()
    const secondFetch = vi.fn(async () => new Response(null))
    const second = manager.run({ lane: 'image', signal: controller.signal }, async context => {
      return context.fetch(URL, undefined, { fetch: secondFetch })
    })
    controller.abort(new DOMException('cancelled', 'AbortError'))
    await expect(second).rejects.toMatchObject({ name: 'AbortError' })
    expect(secondFetch).not.toHaveBeenCalled()
    await first.body!.cancel()
    manager.dispose()
  })

  it('applies Retry-After only to the affected lane without occupying a concurrency slot', async () => {
    const manager = new OpenAICodexBackendRequests(undefined, () => undefined, 1)
    const searchBase = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 429, headers: { 'retry-after': '2' } }))
      .mockResolvedValue(new Response(null, { status: 200 }))
    const imageBase = vi.fn(async () => new Response(null, { status: 200 }))
    const search = manager.wrapFetch({ lane: 'search', identity: 'plugin', fetch: searchBase })
    const image = manager.wrapFetch({ lane: 'image', identity: 'plugin', fetch: imageBase })

    await search(URL)
    const delayedSearch = search(URL)
    await flush()
    expect(searchBase).toHaveBeenCalledTimes(1)
    await expect(image(URL)).resolves.toMatchObject({ status: 200 })
    expect(imageBase).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(1_999)
    expect(searchBase).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    await expect(delayedSearch).resolves.toMatchObject({ status: 200 })
    expect(searchBase).toHaveBeenCalledTimes(2)
    manager.dispose()
  })

  it('turns a managed deadline into a TimeoutError and rejects non-backend dispatch before fetch', async () => {
    const manager = new OpenAICodexBackendRequests(undefined, () => undefined, 1)
    const base = vi.fn()
    await expect(manager.run({ lane: 'search' }, context => context.fetch('https://evil.example/backend-api/test', {}, { fetch: base })))
      .rejects.toThrow('chatgpt.com/backend-api')
    expect(base).not.toHaveBeenCalled()

    const pending = manager.run({ lane: 'quota', timeoutMs: 1_000 }, async context => {
      await new Promise<void>((_resolve, reject) => {
        context.signal.addEventListener('abort', () => reject(context.signal.reason), { once: true })
      })
    })
    const rejected = expect(pending).rejects.toMatchObject({ name: 'TimeoutError' })
    await vi.advanceTimersByTimeAsync(1_000)
    await rejected
    manager.dispose()
  })

  it('preserves a route-specific fetch deadline inside a longer logical operation', async () => {
    const manager = new OpenAICodexBackendRequests()
    const base = vi.fn((_input: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true })
    }))
    const pending = manager.run({ lane: 'quota' }, async context => {
      const short = AbortSignal.timeout(250)
      return context.fetch(URL, { signal: short }, { fetch: base })
    })
    await vi.advanceTimersByTimeAsync(250)
    await expect(pending).rejects.toMatchObject({ name: 'TimeoutError' })
    manager.dispose()
  })

  it('disposal aborts active and queued managed work and prevents new admission', async () => {
    const manager = new OpenAICodexBackendRequests(undefined, () => undefined, 1)
    const base = vi.fn(async () => new Response(new ReadableStream<Uint8Array>()))
    const fetch = manager.wrapFetch({ lane: 'model', fetch: base })
    const response = await fetch(URL)
    const active = response.text().catch(error => error)
    const queued = manager.run({ lane: 'search' }, context => context.fetch(URL, undefined, { fetch: base })).catch(error => error)
    await flush()
    manager.dispose()
    expect(await active).toMatchObject({ name: 'AbortError' })
    expect(await queued).toMatchObject({ name: 'AbortError' })
    expect(base).toHaveBeenCalledOnce()
    await expect(manager.run({ lane: 'image' }, async () => undefined)).rejects.toMatchObject({ name: 'AbortError' })
  })
})
