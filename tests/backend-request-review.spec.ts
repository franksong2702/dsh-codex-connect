import { afterEach, describe, expect, it, vi } from 'vitest'
import { OpenAICodexBackendRequests } from '../src/backend-request.ts'
import { assertOpenAICodexBackendUrl } from '../src/backend-request-policy.ts'

const endpoint = 'https://chatgpt.com/backend-api/codex/responses'
const managers: OpenAICodexBackendRequests[] = []
const manager = (slots = 1) => {
  const value = new OpenAICodexBackendRequests(undefined, () => undefined, slots)
  managers.push(value)
  return value
}
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve() }
afterEach(() => { for (const value of managers.splice(0)) value.dispose(); vi.useRealTimers(); vi.restoreAllMocks() })

describe('PR 227 review regressions', () => {
  it('does not execute a logical callback with an already cancelled signal', async () => {
    const requests = manager()
    const controller = new AbortController()
    controller.abort()
    const operation = vi.fn(async () => 'must not run')
    const result = requests.run({ lane: 'search', signal: controller.signal }, operation).catch(error => error)
    expect(await result).toMatchObject({ name: 'AbortError' })
    expect(operation).not.toHaveBeenCalled()
  })

  it('releases a cancelled unread provider body without requiring another read', async () => {
    const requests = manager()
    const cancel = vi.fn()
    const base = vi.fn(async () => new Response(new ReadableStream<Uint8Array>({ cancel })))
    const fetch = requests.wrapFetch({ lane: 'model', fetch: base })
    const controller = new AbortController()
    const first = await fetch(endpoint, { signal: controller.signal })
    const next = fetch(endpoint).catch(error => error)
    controller.abort()
    await flush()
    try {
      expect(cancel).toHaveBeenCalledOnce()
      expect(base).toHaveBeenCalledTimes(2)
      await expect(first.text()).rejects.toMatchObject({ name: 'AbortError' })
    } finally {
      await first.body?.cancel().catch(() => undefined)
      requests.dispose()
      const value = await next
      if (value instanceof Response) await value.body?.cancel().catch(() => undefined)
    }
  })

  it('cancels the response body if a response hook throws', async () => {
    const requests = manager()
    const cancel = vi.fn()
    const raw = new Response(new ReadableStream<Uint8Array>({ cancel }))
    const hookError = new Error('fixture hook error')
    const fetch = requests.wrapFetch({ lane: 'model', fetch: async () => raw, onResponse() { throw hookError } })
    try {
      await expect(fetch(endpoint)).rejects.toBe(hookError)
      expect(cancel).toHaveBeenCalledOnce()
    } finally { await raw.body?.cancel().catch(() => undefined) }
  })

  it('preserves the signal embedded in a Request passed to a logical context', async () => {
    const requests = manager()
    const controller = new AbortController()
    controller.abort()
    const base = vi.fn(async () => new Response(null))
    await expect(requests.run({ lane: 'search' }, context => context.fetch(
      new Request(endpoint, { signal: controller.signal }), undefined, { fetch: base },
    ))).rejects.toMatchObject({ name: 'AbortError' })
    expect(base).not.toHaveBeenCalled()
  })

  it('freezes URL objects before queueing and prevents automatic redirect following', async () => {
    const requests = manager()
    const base = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => new Response(null))
    const source = new URL(endpoint)
    const fetch = requests.wrapFetch({ lane: 'model', fetch: base })
    const pending = fetch(source, { redirect: 'follow' })
    await Promise.resolve()
    source.hostname = 'other.example'
    const response = await pending
    await response.body?.cancel()
    const [sent, init] = base.mock.calls[0]!
    expect(String(sent)).toBe(endpoint)
    expect(init?.redirect).not.toBe('follow')
  })

  it('rejects URL-embedded credentials before calling fetch', () => {
    expect(() => assertOpenAICodexBackendUrl('https://user:password@chatgpt.com/backend-api/test')).toThrow()
  })

  it('rechecks an extended server cooldown before sending waiting requests', async () => {
    vi.useFakeTimers(); vi.setSystemTime(0)
    const requests = manager(3)
    let finishSecond!: (response: Response) => void
    const base = vi.fn().mockResolvedValueOnce(new Response(null, { status: 429, headers: { 'retry-after': '2' } }))
      .mockImplementationOnce(() => new Promise<Response>(resolve => { finishSecond = resolve }))
      .mockResolvedValue(new Response(null))
    const fetch = requests.wrapFetch({ lane: 'search', fetch: base })
    const first = fetch(endpoint)
    const competing = fetch(endpoint)
    await first; await flush()
    const waiting = fetch(endpoint).catch(error => error)
    try {
      await vi.advanceTimersByTimeAsync(1_000)
      finishSecond(new Response(null, { status: 503, headers: { 'retry-after': '10' } }))
      await competing
      await vi.advanceTimersByTimeAsync(1_000)
      expect(base).toHaveBeenCalledTimes(2)
      await vi.advanceTimersByTimeAsync(9_000)
      expect((await waiting).status).toBe(200)
    } finally { requests.dispose(); await waiting }
  })

  it('does not let a newly cooling lane occupy the last slot ahead of another lane', async () => {
    vi.useFakeTimers(); vi.setSystemTime(0)
    const requests = manager()
    let respond!: (response: Response) => void
    const searchBase = vi.fn().mockImplementationOnce(() => new Promise<Response>(resolve => { respond = resolve }))
      .mockResolvedValue(new Response(null))
    const imageBase = vi.fn(async () => new Response(null))
    const search = requests.wrapFetch({ lane: 'search', fetch: searchBase })
    const first = search(endpoint); await flush()
    const second = search(endpoint).catch(error => error)
    const other = requests.wrapFetch({ lane: 'image', fetch: imageBase })(endpoint).catch(error => error)
    await flush()
    respond(new Response(null, { status: 429, headers: { 'retry-after': '10' } }))
    await first; await flush()
    try {
      expect(imageBase).toHaveBeenCalledOnce()
      expect(searchBase).toHaveBeenCalledOnce()
    } finally { requests.dispose(); await Promise.all([second, other]) }
  })

  it('does not shorten a server Retry-After longer than fifteen minutes', async () => {
    vi.useFakeTimers(); vi.setSystemTime(0)
    const requests = manager()
    const base = vi.fn().mockResolvedValueOnce(new Response(null, { status: 429, headers: { 'retry-after': '1800' } }))
      .mockResolvedValue(new Response(null))
    const fetch = requests.wrapFetch({ lane: 'model', fetch: base })
    await fetch(endpoint)
    const waiting = fetch(endpoint).catch(error => error)
    try {
      await vi.advanceTimersByTimeAsync(900_000)
      expect(base).toHaveBeenCalledOnce()
      await vi.advanceTimersByTimeAsync(900_000)
      expect((await waiting).status).toBe(200)
    } finally { requests.dispose(); await waiting }
  })

  it('limits parallel HTTP attempts inside one logical scope rather than counting the scope once', async () => {
    const requests = manager()
    const base = vi.fn(async () => new Response(new ReadableStream<Uint8Array>()))
    await requests.run({ lane: 'search' }, async context => {
      const first = await context.fetch(endpoint, undefined, { fetch: base })
      const second = context.fetch(endpoint, undefined, { fetch: base })
      await flush(); expect(base).toHaveBeenCalledOnce()
      await first.body!.cancel()
      const response = await second
      expect(base).toHaveBeenCalledTimes(2)
      await response.body!.cancel()
    })
  })

  it('discards an unconsumed body when a direct parser exits with an error', async () => {
    const requests = manager()
    const cancel = vi.fn()
    const error = new Error('fixture parser rejected content type')
    await expect(requests.run({ lane: 'image' }, async context => {
      await context.fetch(endpoint, undefined, { fetch: async () => new Response(new ReadableStream({ cancel })) })
      throw error
    })).rejects.toBe(error)
    expect(cancel).toHaveBeenCalledOnce()
    const next = await requests.wrapFetch({ lane: 'model', fetch: async () => new Response(null) })(endpoint)
    expect(next.status).toBe(200)
  })

  it('captures request headers before waiting behind another request', async () => {
    const requests = manager()
    const fetch = requests.wrapFetch({ lane: 'model', fetch: async () => new Response(new ReadableStream()) })
    const active = await fetch(endpoint)
    const headers = new Headers({ authorization: 'Bearer synthetic-first' })
    const base = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => new Response(null))
    const pending = requests.wrapFetch({ lane: 'search', fetch: base })(endpoint, { headers })
    headers.set('authorization', 'Bearer synthetic-second')
    await active.body!.cancel()
    await pending
    expect(new Headers(base.mock.calls[0]?.[1]?.headers).get('authorization')).toBe('Bearer synthetic-first')
  })
})
