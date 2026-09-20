import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  OpenAICodexBackendRequestLayer,
  openAICodexBackendDeadline,
  openAICodexBackendHeaders,
  type OpenAICodexBackendDiagnostic,
} from '../src/backend-request.ts'

const endpoint = 'https://chatgpt.com/backend-api/codex/responses'

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('shared Codex backend request layer', () => {
  it('centralizes honest route identity without impersonating the model client', () => {
    const search = openAICodexBackendHeaders('search', undefined, 'search-attempt')
    expect(search.get('user-agent')).toBe('dsh-codex-connect')
    expect(search.get('originator')).toBe('deepseek-harness')
    expect(search.get('x-client-request-id')).toBe('search-attempt')

    const quota = openAICodexBackendHeaders('quota', { originator: 'caller-supplied' }, 'quota-attempt')
    expect(quota.get('user-agent')).toBe('dsh-codex-connect')
    expect(quota.get('originator')).toBeNull()

    const model = openAICodexBackendHeaders('model', {
      'user-agent': 'pi (fixture)',
      originator: 'pi',
    }, 'model-attempt')
    expect(model.get('user-agent')).toBe('pi (fixture)')
    expect(model.get('originator')).toBe('pi')
    expect(model.get('x-client-request-id')).toBe('model-attempt')
  })

  it('shares one concurrency ceiling across routes until response bodies close', async () => {
    const layer = new OpenAICodexBackendRequestLayer(undefined, undefined, 2)
    const controllers: ReadableStreamDefaultController<Uint8Array>[] = []
    const fetch = vi.fn(async () => new Response(new ReadableStream<Uint8Array>({
      start(controller) { controllers.push(controller) },
    }), { headers: { 'content-type': 'application/json' } }))

    const first = await layer.fetch('search', endpoint, undefined, fetch)
    const second = await layer.fetch('quota', endpoint, undefined, fetch)
    const third = layer.fetch('image', endpoint, undefined, fetch)
    await Promise.resolve()
    expect(fetch).toHaveBeenCalledTimes(2)

    await first.body?.cancel()
    const thirdResponse = await third
    expect(fetch).toHaveBeenCalledTimes(3)

    await second.body?.cancel()
    await thirdResponse.body?.cancel()
    expect(controllers).toHaveLength(3)
  })

  it('removes an aborted queued request without dispatching it later', async () => {
    const layer = new OpenAICodexBackendRequestLayer(undefined, undefined, 1)
    const fetch = vi.fn(async () => new Response(new ReadableStream<Uint8Array>({ start() {} })))
    const first = await layer.fetch('model', endpoint, undefined, fetch)
    const controller = new AbortController()
    const queued = layer.fetch('auto-review', endpoint, { signal: controller.signal }, fetch)
    controller.abort(new DOMException('fixture cancellation', 'AbortError'))
    await expect(queued).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetch).toHaveBeenCalledOnce()
    await first.body?.cancel()
    await Promise.resolve()
    expect(fetch).toHaveBeenCalledOnce()
  })

  it('observes bounded SSE diagnostics while forwarding the original bytes', async () => {
    const diagnostics: OpenAICodexBackendDiagnostic[] = []
    const body = 'data: ' + JSON.stringify({
      type: 'error',
      error: { type: 'server_error', code: 'fixture_overloaded', request_id: 'req-fixture' },
      message: 'private text is not retained',
    }) + '\n\n'
    const layer = new OpenAICodexBackendRequestLayer()
    const response = await layer.fetch('auto-review', endpoint, undefined, async () => new Response(body, {
      status: 200,
      headers: {
        'content-type': 'text/event-stream',
        'x-request-id': 'http-fixture',
        'retry-after': '2',
      },
    }), diagnostic => diagnostics.push(diagnostic))
    expect(await response.text()).toBe(body)
    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0]).toMatchObject({
      route: 'auto-review',
      httpStatus: 200,
      httpRequestId: 'http-fixture',
      eventType: 'error',
      errorType: 'server_error',
      errorCode: 'fixture_overloaded',
      sseRequestId: 'req-fixture',
      retryAfterMs: 2000,
    })
    expect(JSON.stringify(diagnostics)).not.toContain('private text')
  })

  it('rejects credential-bearing dispatch to any non-backend-api origin', async () => {
    const fetch = vi.fn()
    const layer = new OpenAICodexBackendRequestLayer()
    await expect(layer.fetch('quota', 'https://example.com/backend-api/wham/usage', undefined, fetch))
      .rejects.toThrow('must target https://chatgpt.com/backend-api/')
    await expect(layer.fetch('quota', 'https://chatgpt.com:8443/backend-api/wham/usage', undefined, fetch))
      .rejects.toThrow('must target https://chatgpt.com/backend-api/')
    await expect(layer.fetch('quota', 'https://user:pass@chatgpt.com/backend-api/wham/usage', undefined, fetch))
      .rejects.toThrow('must target https://chatgpt.com/backend-api/')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('uses disposable fake-timer-compatible deadlines and distinguishes caller cancellation', async () => {
    vi.useFakeTimers()
    const deadline = openAICodexBackendDeadline(undefined, 1000)
    expect(deadline.timedOut()).toBe(false)
    await vi.advanceTimersByTimeAsync(1000)
    expect(deadline.signal.aborted).toBe(true)
    expect(deadline.signal.reason).toMatchObject({ name: 'TimeoutError' })
    expect(deadline.timedOut()).toBe(true)
    deadline.dispose()

    const caller = new AbortController()
    const combined = openAICodexBackendDeadline(caller.signal, 1000)
    caller.abort(new DOMException('caller', 'AbortError'))
    expect(combined.signal.aborted).toBe(true)
    expect(combined.timedOut()).toBe(false)
    combined.dispose()
  })
})
