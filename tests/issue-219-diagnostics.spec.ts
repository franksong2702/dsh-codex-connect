import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import { createOpenAICodexAdapter, createOpenAICodexProfile } from '../src/adapter.ts'
import { openaiCodexProvider } from '@earendil-works/pi-ai/providers/openai-codex'
import type { OpenAICodexCredentialStore } from '../src/store.ts'
import { streamWithCodexRequestDiagnostics, withCodexDiagnosticFetch } from '../src/request-diagnostics.ts'
import { readRetryAfterMs } from '../src/request-backoff.ts'
import { OpenAICodexBackendRequests } from '../src/backend-request.ts'

const token = 'header.' + Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: 'fixture-account' } })).toString('base64url') + '.signature'
const credentials = {
  captureActiveAccount: async () => credentials,
  read: async () => ({ type: 'oauth', accountId: 'fixture-account', access: token, refresh: 'fixture-refresh', expires: Date.now() + 3_600_000 }),
} as unknown as OpenAICodexCredentialStore
const options: GenerateOptions = { provider: 'openai-codex', model: 'gpt-5.6-sol', messages: [] }
const overloaded = 'Our servers are currently overloaded. Please try again later.'
const code = 'fixture_overloaded'
const failure: StreamChunk = { type: 'finish', reason: { kind: 'error', failure: { code: 'PI_AI_ERROR', message: overloaded } } }
const eventResponse = (event: unknown, headers: Record<string, string> = {}) => new Response('data: ' + JSON.stringify(event) + '\n\n', { status: 200, headers: { 'content-type': 'text/event-stream', 'x-request-id': 'req-401-429-500', ...headers } })
async function collect(stream: AsyncIterable<StreamChunk>): Promise<StreamChunk[]> {
  const chunks: StreamChunk[] = []; for await (const chunk of stream) chunks.push(chunk); return chunks
}
function error(chunks: StreamChunk[]) {
  const finish = chunks.find(chunk => chunk.type === 'finish')
  if (finish?.reason.kind !== 'error' || finish.reason.failure === undefined) throw new Error('Expected terminal failure')
  return finish.reason.failure
}
function diagnostic(chunks: StreamChunk[]): Record<string, unknown> {
  const text = error(chunks).message
  const match = /\[Codex diagnostics: (.+)\]$/u.exec(text)
  if (match?.[1] === undefined) throw new Error('Missing diagnostic: ' + text)
  return JSON.parse(match[1]) as Record<string, unknown>
}
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('issue 219 provider-to-DSH diagnostics', () => {
  it.each([
    { type: 'error', code, message: overloaded, request_id: 'req-sse-flat' },
    { type: 'error', error: { type: 'server_error', code, message: overloaded, request_id: 'req-sse-nested' } },
    { type: 'response.failed', request_id: 'req-sse-response', response: { error: { type: 'server_error', code, message: overloaded } } },
  ])('preserves safe metadata without altering host classification ($type)', async event => {
    const fetch = vi.fn(async (_input: unknown, _init?: RequestInit) => eventResponse(event, { 'retry-after': '120' }))
    vi.stubGlobal('fetch', fetch)
    const adapter = createOpenAICodexAdapter(credentials, () => undefined)
    const chunks = await collect(adapter.stream(options))
    expect(error(chunks).code).toBe('PI_AI_ERROR')
    expect(error(chunks).message).toContain(overloaded)
    expect(diagnostic(chunks)).toMatchObject({ httpStatus: 200, httpRequestId: 'req-401-429-500', errorCode: code, eventType: event.type, retryAfterMs: 120_000 })
    expect(diagnostic(chunks)['sseRequestId']).toMatch(/^req-sse-/u)
    expect(fetch).toHaveBeenCalledTimes(1)
    const headers = new Headers(fetch.mock.calls[0]?.[1]?.headers)
    expect(headers.get('authorization')).toBe('Bearer ' + token)
    expect(headers.get('originator')).toBe('pi')
    expect(headers.get('x-client-request-id')).toBe(diagnostic(chunks)['clientRequestId'])
    expect(JSON.stringify(chunks)).not.toContain(token)
    expect(JSON.stringify(chunks)).not.toContain('fixture-refresh')
  })

  it('isolates simultaneous failures and creates unique attempt ids', async () => {
    let release!: (value: Response) => void
    const gate = new Promise<Response>(resolve => { release = resolve })
    const fetch = vi.fn().mockReturnValueOnce(gate).mockResolvedValueOnce(eventResponse({ type: 'error', code: 'second_failure', message: overloaded }, { 'x-request-id': 'req-second' }))
    vi.stubGlobal('fetch', fetch)
    const adapter = createOpenAICodexAdapter(credentials, () => undefined)
    const first = collect(adapter.stream(options))
    void first.catch(() => undefined) // Still asserted below; avoid an unhandled rejection while observing the second call.
    await vi.waitFor(() => { expect(fetch).toHaveBeenCalledTimes(1) })
    const second = await collect(adapter.stream(options))
    release(eventResponse({ type: 'error', code: 'first_failure', message: overloaded }, { 'x-request-id': 'req-first' }))
    const a = diagnostic(await first); const b = diagnostic(second)
    expect(a).toMatchObject({ errorCode: 'first_failure', httpRequestId: 'req-first' })
    expect(b).toMatchObject({ errorCode: 'second_failure', httpRequestId: 'req-second' })
    expect(a['clientRequestId']).not.toBe(b['clientRequestId'])
  })

  it('preserves custom fetch and response hooks, session affinity, and SSE retry behavior', async () => {
    const custom = vi.fn(async (_input: unknown, _init?: RequestInit) => eventResponse({ type: 'error', code, message: overloaded }))
    const hook = vi.fn()
    const payload = vi.fn()
    const provider = createOpenAICodexProfile(openaiCodexProvider()).piProvider
    const model = provider.getModels().find(item => item.id === options.model)!
    await collect(streamWithCodexRequestDiagnostics(async function* () {
      for await (const event of provider.streamSimple(model, { messages: [] }, {
        apiKey: token, transport: 'sse', sessionId: 'fixture-session', fetch: custom, onResponse: hook, onPayload: payload, maxRetries: 2,
      })) { if (event.type === 'error') yield failure }
    }, options))
    expect(custom).toHaveBeenCalledTimes(1)
    expect(hook).toHaveBeenCalledTimes(1)
    expect(payload).toHaveBeenCalledTimes(1)
    const headers = new Headers(custom.mock.calls[0]?.[1]?.headers)
    expect(headers.get('session-id')).toBe('fixture-session')
    expect(headers.get('x-client-request-id')).not.toBe('fixture-session')
  })

  it('keeps pi-ai identity while routing the model HTTP attempt through the shared governor', async () => {
    const fetch = vi.fn(async (_input: unknown, _init?: RequestInit) => eventResponse({ type: 'error', code, message: overloaded }))
    vi.stubGlobal('fetch', fetch)
    const requests = new OpenAICodexBackendRequests()
    try {
      const adapter = createOpenAICodexAdapter(
        credentials, () => undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, requests,
      )
      const chunks = await collect(adapter.stream(options))
      expect(error(chunks).code).toBe('PI_AI_ERROR')
      const headers = new Headers(fetch.mock.calls[0]?.[1]?.headers)
      expect(headers.get('originator')).toBe('pi')
      expect(headers.get('user-agent')).toContain('pi')
      expect(headers.get('x-client-request-id')).toBe(diagnostic(chunks)['clientRequestId'])
    } finally { requests.dispose() }
  })
})

describe('issue 219 diagnostic attribution boundaries', () => {
  it.each([
    ['malformed JSON', 'data: broken\n\n'],
    ['oversized first error', 'data: ' + JSON.stringify({ type: 'error', code: 'actual_first_error', message: overloaded, extra: 'x'.repeat(100_000) }) + '\n\n'],
    ['completed empty response', 'data: ' + JSON.stringify({ type: 'response.completed', response: { status: 'completed', output: [] } }) + '\n\n'],
  ])('never attributes an unread later error after %s', async (_name, first) => {
    const raw = first + 'data: ' + JSON.stringify({ type: 'error', code: 'unread_later_error', message: overloaded, request_id: 'req-unread' }) + '\n\n'
    vi.stubGlobal('fetch', vi.fn(async () => new Response(raw, { headers: { 'content-type': 'text/event-stream', 'x-request-id': 'req-http-boundary' } })))
    const chunks = await collect(createOpenAICodexAdapter(credentials, () => undefined).stream(options))
    expect(diagnostic(chunks)).toMatchObject({ httpStatus: 200, httpRequestId: 'req-http-boundary' })
    expect(diagnostic(chunks)['eventType']).toBeUndefined()
    expect(diagnostic(chunks)['errorCode']).toBeUndefined()
    expect(diagnostic(chunks)['sseRequestId']).toBeUndefined()
  })
})

describe('bounded non-destructive SSE observation', () => {
  async function observe(text: string, oneByte = false) {
    const bytes = new TextEncoder().encode(text)
    const raw = new Response(new ReadableStream<Uint8Array>({ start(controller) {
      if (oneByte) for (let i = 0; i < bytes.length; i++) controller.enqueue(bytes.subarray(i, i + 1))
      else controller.enqueue(bytes)
      controller.close()
    } }), { headers: { 'content-type': 'text/event-stream', 'x-request-id': 'sk-secret-header' } })
    const fetch = vi.fn(async () => raw)
    let preserved = ''
    const chunks = await collect(streamWithCodexRequestDiagnostics(async function* () {
      const wrapped = withCodexDiagnosticFetch({ fetch })!
      const result = await wrapped.fetch!('https://chatgpt.com/backend-api/codex/responses')
      preserved = await result.text()
      yield failure
    }, options))
    expect(preserved).toBe(text)
    return diagnostic(chunks)
  }

  it('handles split UTF-8, CRLF and multi-line frames without retaining text or arbitrary fields', async () => {
    const text = ': comment\r\nevent: error\r\ndata: {"type":"error",\r\ndata: "code":"server_error","message":"秘密", "request_id":"req-safe", "token":"private-body"}\r\n\r\n'
    const result = await observe(text, true)
    expect(result).toMatchObject({ eventType: 'error', errorCode: 'server_error', sseRequestId: 'req-safe' })
    expect(result['httpRequestId']).toBeUndefined()
    expect(JSON.stringify(result)).not.toMatch(/private-body|秘密|sk-secret/u)
  })

  it('stops SSE attribution after oversized or malformed frames while preserving bytes', async () => {
    const text = 'data: ' + JSON.stringify({ type: 'error', code: 'ignored', extra: 'x'.repeat(100_000) })
      + '\n\ndata: broken\n\ndata: {"type":"error","code":"recovered","request_id":"eyJfake_token"}\n\n'
    expect((await observe(text))['errorCode']).toBeUndefined()
    expect((await observe(text))['sseRequestId']).toBeUndefined()
  })

  it('keeps the first terminal error when multiple frames share one network chunk', async () => {
    const result = await observe('data: {"type":"error","code":"first_error","request_id":"req-first"}\n\ndata: {"type":"error","code":"later_error","request_id":"req-later"}\n\n')
    expect(result).toMatchObject({ errorCode: 'first_error', sseRequestId: 'req-first' })
  })

  it('ignores incomplete frames and untrusted code values', async () => {
    expect((await observe('data: {"type":"error","code":"incomplete"}'))['eventType']).toBeUndefined()
    expect((await observe('data: {"type":"error","code":"Bearer secret"}\n\n'))['errorCode']).toBeUndefined()
  })

  it('preserves backpressure, body cancellation, and response metadata', async () => {
    const cancelled = vi.fn(); const pull = vi.fn(controller => { controller.enqueue(new TextEncoder().encode(': heartbeat\n\n')) })
    const raw = new Response(new ReadableStream<Uint8Array>({ pull, cancel: cancelled }, { highWaterMark: 0 }), { headers: { 'content-type': 'text/event-stream' } })
    Object.defineProperty(raw, 'url', { value: 'https://chatgpt.com/backend-api/codex/responses' })
    await collect(streamWithCodexRequestDiagnostics(async function* () {
      const wrapped = withCodexDiagnosticFetch({ fetch: async () => raw })!
      const result = await wrapped.fetch!(raw.url)
      expect(result.url).toBe(raw.url); expect(pull).not.toHaveBeenCalled()
      const reader = result.body!.getReader()
      expect((await reader.read()).value).toEqual(new TextEncoder().encode(': heartbeat\n\n'))
      await reader.cancel('fixture-cancel'); reader.releaseLock()
      expect(cancelled).toHaveBeenCalledWith('fixture-cancel')
      expect(raw.body!.locked).toBe(false)
      yield failure
    }, options))
  })

  it('cleans up the underlying iterator when the consumer stops early', async () => {
    let returned = false
    const source = streamWithCodexRequestDiagnostics(async function* () {
      try { yield failure; yield failure } finally { returned = true }
    }, options)
    for await (const _chunk of source) break
    expect(returned).toBe(true)
    const original = { apiKey: 'unused-fixture' }
    expect(withCodexDiagnosticFetch(original)).toBe(original)
  })
})

describe('Retry-After parsing', () => {
  it.each([
    [{ 'retry-after': '120' }, 120_000],
    [{ 'retry-after': '1.5' }, 1500],
    [{ 'retry-after': '120', 'retry-after-ms': '2500' }, 2500],
    [{ 'retry-after': 'Thu, 01 Jan 1970 00:02:00 GMT' }, 120_000],
    [{ 'retry-after': '-1' }, undefined],
    [{ 'retry-after': 'NaN' }, undefined],
    [{ 'retry-after': '999999999999999999' }, Infinity],
  ])('reads bounded retry semantics (%j)', (headers, expected) => {
    expect(readRetryAfterMs(new Headers(headers), 0)).toBe(expected)
  })
})
