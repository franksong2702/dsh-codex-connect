import { afterEach, expect, it, onTestFinished, vi } from 'vitest'
import { createOpenAICodexAdapter } from '../src/adapter.ts'
import type { OpenAICodexCredentialStore } from '../src/store.ts'
import type { OpenAICodexProxyManager } from '../src/provider-proxy.ts'
import { AttachmentId, ImageVariantId } from '@deepseek-ai/dsh-attachment'
import type { AttachmentStore } from '@deepseek-ai/dsh-attachment'
import { createUserMessage } from '@deepseek-ai/dsh-llm'

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks() })
const config = { protocol: 'bili-v1' as const, trustedProxyOrigin: 'http://127.0.0.1:7890', maxDurationMs: 450_000 }
const request = { provider: 'openai-codex', model: 'gpt-5.6-sol', messages: [] }
const headers = { 'content-type': 'text/event-stream', 'x-bili-preflight': 'compressing' }
const heartbeat = ': bili-preflight\n\n'

function syntheticCredentials(): OpenAICodexCredentialStore {
  const token = 'header.' + Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: 'synthetic-review' } })).toString('base64url') + '.signature'
  const credentials = {
    captureActiveAccount: async () => credentials,
    read: async () => ({ type: 'oauth', accountId: 'synthetic-review', access: token, refresh: 'synthetic-only', expires: Date.now() + 3600000 }),
  } as unknown as OpenAICodexCredentialStore
  return credentials
}

function adapter(origin: string | undefined = config.trustedProxyOrigin, enabled = true, credentials = syntheticCredentials(), attachments?: AttachmentStore) {
  const proxy = {
    run: <T>(_origin: string | undefined, operation: () => T): T => operation(),
    runStream: <T>(_origin: string | undefined, operation: () => T): T => operation(),
  } as OpenAICodexProxyManager
  return createOpenAICodexAdapter(credentials, () => attachments, undefined, undefined,
    proxy, () => origin, undefined, undefined, undefined, undefined, undefined, undefined, enabled ? config : undefined)
}

function responseSource(responseHeaders: HeadersInit = headers, cooperative = true, headersReady?: Promise<void>,
  metadata?: { origin: string; redirected?: boolean; url?: string }) {
  const started = Promise.withResolvers<void>()
  const closed = Promise.withResolvers<void>()
  let output: ReadableStreamDefaultController<Uint8Array>
  let signal: AbortSignal | null | undefined
  let finished = false
  const finish = (): void => {
    if (finished) return
    finished = true
    signal?.removeEventListener('abort', onAbort)
    output?.close()
    closed.resolve()
  }
  const onAbort = (): void => {
    if (finished) return
    finished = true
    signal?.removeEventListener('abort', onAbort)
    output.error(signal?.reason)
    closed.resolve()
  }
  const fetch = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
    signal = init?.signal
    const response = new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        output = controller
        if (cooperative) {
          signal?.addEventListener('abort', onAbort, { once: true })
          if (signal?.aborted) onAbort()
        }
        started.resolve()
      },
      cancel() { finished = true; signal?.removeEventListener('abort', onAbort); closed.resolve() },
    }, { highWaterMark: 0 }), { headers: responseHeaders })
    if (metadata !== undefined) Object.defineProperties(response, {
      url: { value: metadata.url ?? metadata.origin + '/bili/' + String(_input) },
      redirected: { value: metadata.redirected ?? false },
    })
    await headersReady
    return response
  })
  onTestFinished(finish)
  const emit = (text: string): void => { output.enqueue(new TextEncoder().encode(text)) }
  const item = { type: 'message', id: 'msg_fixture', role: 'assistant', phase: 'final_answer', status: 'completed',
    content: [{ type: 'output_text', text: 'OK', annotations: [] }] }
  const events = [
    { type: 'response.output_item.added', output_index: 0, item: { ...item, content: [] } },
    { type: 'response.output_text.delta', item_id: item.id, output_index: 0, content_index: 0, delta: 'OK' },
    { type: 'response.output_item.done', output_index: 0, item },
    { type: 'response.completed', response: { id: 'resp_fixture', status: 'completed', output: [item],
      usage: { input_tokens: 10, output_tokens: 2, total_tokens: 12 } } },
  ]
  return { fetch, started: started.promise, closed: closed.promise, emit,
    get signal() { return signal },
    complete() { emit(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('') + 'data: [DONE]\n\n'); finish() },
    firstData() { emit(events.slice(0, 2).map(event => `data: ${JSON.stringify(event)}\n\n`).join('')) },
  }
}

async function collect(stream: AsyncIterable<unknown>) {
  const chunks: unknown[] = []
  try { for await (const chunk of stream) chunks.push(chunk); return { chunks, error: undefined } }
  catch (error) { return { chunks, error } }
}

async function pulse(source: ReturnType<typeof responseSource>, elapsed = 15_000) {
  await vi.advanceTimersByTimeAsync(elapsed)
  source.emit(heartbeat)
  await vi.advanceTimersByTimeAsync(0)
}

it.each(['\n', '\r\n', '\r'])('streams a real Codex SDK response after fragmented authorized heartbeats with %j line endings', async ending => {
  vi.useFakeTimers()
  const source = responseSource()
  vi.stubGlobal('fetch', source.fetch)
  const pending = collect(adapter().stream(request))
  await source.started
  await vi.advanceTimersByTimeAsync(0)
  for (let index = 0; index < 26; index++) {
    await vi.advanceTimersByTimeAsync(15_000)
    for (const byte of ': bili-preflight' + ending + ending) {
      source.emit(byte)
      await vi.advanceTimersByTimeAsync(0)
    }
  }
  expect(source.signal?.aborted).toBe(false)
  source.complete()
  const result = await pending
  expect(result.error).toBeUndefined()
  expect(result.chunks).toContainEqual(expect.objectContaining({ type: 'block-end', block: { type: 'text', text: 'OK' } }))
  expect(result.chunks.at(-1)).toMatchObject({ type: 'finish', reason: { kind: 'stop' } })
  expect(JSON.stringify(result.chunks)).not.toContain('bili-preflight')
  expect(source.fetch).toHaveBeenCalledOnce()
})

it.each(['', ':' + 'x'.repeat(1025) + '\n\n', 'data:\n\n', 'data:\n'])
  ('retains the 450-second absolute deadline after a last-moment heartbeat and non-semantic frame: %j', async suffix => {
    vi.useFakeTimers()
    const source = responseSource()
    vi.stubGlobal('fetch', source.fetch)
    let settled = false
    const pending = collect(adapter().stream(request)).then(result => { settled = true; return result })
    await source.started
    await vi.advanceTimersByTimeAsync(0)
    for (let index = 0; index < 29; index++) await pulse(source)
    await pulse(source, 14_000)
    if (suffix !== '') source.emit(suffix)
    await vi.advanceTimersByTimeAsync(999)
    expect(settled).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(settled).toBe(true)
    expect((await pending).error).toMatchObject({ code: 'TIMEOUT', message: 'Codex preflight timeout after 450000ms' })
    expect(source.signal?.aborted).toBe(true)
    expect(source.fetch).toHaveBeenCalledOnce()
  })

it.each([
  ['direct route', undefined, headers, true],
  ['different proxy', 'http://127.0.0.1:7897', headers, true],
  ['missing header', config.trustedProxyOrigin, { 'content-type': 'text/event-stream' }, true],
  ['default disabled', config.trustedProxyOrigin, headers, false],
] as const)('retains 300-second timeout for %s despite heartbeat-shaped bytes', async (_label, origin, responseHeaders, enabled) => {
  vi.useFakeTimers()
  const source = responseSource(responseHeaders)
  vi.stubGlobal('fetch', source.fetch)
  // Undefined is an intentional direct route, not adapter()'s default test proxy.
  const host = origin === undefined ? createOpenAICodexAdapter(syntheticCredentials(), () => undefined, undefined,
    undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, enabled ? config : undefined) : adapter(origin, enabled)
  const pending = collect(host.stream(request))
  await source.started
  await vi.advanceTimersByTimeAsync(0)
  for (let index = 0; index < 19; index++) await pulse(source)
  await vi.advanceTimersByTimeAsync(15_000)
  expect((await pending).error).toMatchObject({ code: 'TIMEOUT', message: enabled ? 'Codex stream idle timeout after 300000ms' : 'pi-ai stream idle timeout after 300000ms' })
  expect(source.signal?.aborted).toBe(true)
})

it('times out 300 seconds after authorized heartbeats stop, within the absolute cap', async () => {
  vi.useFakeTimers()
  const source = responseSource()
  vi.stubGlobal('fetch', source.fetch)
  const pending = collect(adapter().stream(request))
  await source.started
  await vi.advanceTimersByTimeAsync(0)
  await pulse(source)
  await vi.advanceTimersByTimeAsync(300_000)
  expect((await pending).error).toMatchObject({ code: 'TIMEOUT', message: 'Codex stream idle timeout after 300000ms' })
})

it('settles caller cancellation promptly even when the response body ignores abort', async () => {
  vi.useFakeTimers()
  const source = responseSource(headers, false)
  vi.stubGlobal('fetch', source.fetch)
  const caller = new AbortController()
  const pending = collect(adapter().stream({ ...request, signal: caller.signal }))
  await source.started
  await vi.advanceTimersByTimeAsync(0)
  caller.abort(new Error('synthetic caller cancel'))
  await vi.advanceTimersByTimeAsync(0)
  const result = await pending
  expect(result.error).toBeUndefined()
  expect(result.chunks.at(-1)).toMatchObject({ type: 'finish', reason: { kind: 'aborted' } })
  expect(source.signal?.aborted).toBe(true)
})

it('ends preflight before actual output and does not time out a paused downstream consumer', async () => {
  vi.useFakeTimers()
  const source = responseSource()
  vi.stubGlobal('fetch', source.fetch)
  const iterator = adapter().stream(request)[Symbol.asyncIterator]()
  const first = iterator.next()
  await source.started
  source.firstData()
  expect((await first).done).toBe(false)
  await vi.advanceTimersByTimeAsync(600_000)
  expect(source.signal?.aborted).toBe(false)
  await iterator.return?.()
  expect(source.signal?.aborted).toBe(true)
})

it('keeps two invocations of a captured call independent when one caller cancels', async () => {
  vi.useFakeTimers()
  const first = responseSource()
  const second = responseSource()
  vi.stubGlobal('fetch', vi.fn().mockImplementationOnce(first.fetch).mockImplementationOnce(second.fetch))
  const prepared = await adapter().prepareCall(request.provider, request.model)
  const caller = new AbortController()
  const one = collect(prepared.stream({ ...request, signal: caller.signal }))
  const two = collect(prepared.stream(request))
  await Promise.all([first.started, second.started])
  await vi.advanceTimersByTimeAsync(0)
  expect(first.signal).not.toBe(second.signal)
  caller.abort(new Error('cancel only first'))
  await vi.advanceTimersByTimeAsync(0)
  const cancelled = await one
  expect(cancelled.error).toBeUndefined()
  expect(cancelled.chunks.at(-1)).toMatchObject({ type: 'finish', reason: { kind: 'aborted' } })
  for (let index = 0; index < 26; index++) await pulse(second)
  expect(second.signal?.aborted).toBe(false)
  second.complete()
  expect((await two).error).toBeUndefined()
})

it('does not charge slow credential preparation to the provider idle interval', async () => {
  vi.useFakeTimers()
  const source = responseSource()
  vi.stubGlobal('fetch', source.fetch)
  const gate = Promise.withResolvers<void>()
  const credentials = syntheticCredentials()
  const read = credentials.read.bind(credentials)
  vi.spyOn(credentials, 'read').mockImplementation(async options => { await gate.promise; return read(options) })
  let settled = false
  const pending = collect(adapter(config.trustedProxyOrigin, true, credentials).stream(request)).then(result => { settled = true; return result })
  await vi.advanceTimersByTimeAsync(400_000)
  expect(settled).toBe(false)
  expect(source.fetch).not.toHaveBeenCalled()
  gate.resolve()
  await source.started
  await vi.advanceTimersByTimeAsync(300_000)
  expect((await pending).error).toMatchObject({ code: 'TIMEOUT', message: 'Codex stream idle timeout after 300000ms' })
})

it('does not charge slow Host attachment preparation to the provider idle interval', async () => {
  vi.useFakeTimers()
  const source = responseSource()
  vi.stubGlobal('fetch', source.fetch)
  const gate = Promise.withResolvers<void>()
  const entered = Promise.withResolvers<void>()
  const attachment = { attachmentId: AttachmentId('sha256:' + 'a'.repeat(64)), mediaType: 'image/png' as const,
    width: 1, height: 1, bytes: 3 }
  // Storage is the external boundary under test; the unchanged Host performs the actual context conversion.
  const readImageRequest = vi.fn(async () => {
    entered.resolve()
    await gate.promise
    return { variantId: ImageVariantId('synthetic-variant'), attachment, data: new Uint8Array([1, 2, 3]),
      mediaType: 'image/png' as const, bytes: 3, width: 1, height: 1, depth: 'uchar' as const, space: 'srgb' as const, hasAlpha: false }
  })
  const attachments = { readImageRequest } as unknown as AttachmentStore
  const messages = [createUserMessage({ source: { kind: 'user' }, content: [{ type: 'image', attachment }] })]
  let settled = false
  const pending = collect(adapter(config.trustedProxyOrigin, true, syntheticCredentials(), attachments)
    .stream({ ...request, messages })).then(result => { settled = true; return result })
  await entered.promise
  await vi.advanceTimersByTimeAsync(400_000)
  expect(settled).toBe(false)
  expect(source.fetch).not.toHaveBeenCalled()
  gate.resolve()
  await source.started
  await vi.advanceTimersByTimeAsync(0)
  for (let index = 0; index < 26; index++) await pulse(source)
  source.complete()
  expect((await pending).error).toBeUndefined()
  expect(readImageRequest).toHaveBeenCalledOnce()
})

it('gives a late eligible response its full budget without the inner Host timer winning', async () => {
  vi.useFakeTimers()
  const gate = Promise.withResolvers<void>()
  const source = responseSource(headers, true, gate.promise)
  vi.stubGlobal('fetch', source.fetch)
  let settled = false
  const pending = collect(adapter().stream(request)).then(result => { settled = true; return result })
  await source.started
  await vi.advanceTimersByTimeAsync(299_000)
  gate.resolve()
  source.emit(heartbeat)
  await vi.advanceTimersByTimeAsync(0)
  for (let index = 0; index < 29; index++) await pulse(source)
  await vi.advanceTimersByTimeAsync(14_999)
  expect(settled).toBe(false)
  await vi.advanceTimersByTimeAsync(1)
  expect((await pending).error).toMatchObject({ code: 'TIMEOUT', message: 'Codex preflight timeout after 450000ms' })
})

it.each([': ping\n\n', ': bili-preflight', ': bili-preflight \n\n', ': bili-preflight\n: other\n\n', ': bili-preflightx\n\n'])
  ('does not extend a request for an ordinary or incomplete frame: %j', async frame => {
    vi.useFakeTimers()
    const source = responseSource()
    vi.stubGlobal('fetch', source.fetch)
    const pending = collect(adapter().stream(request))
    await source.started
    await vi.advanceTimersByTimeAsync(0)
    for (let index = 0; index < 19; index++) {
      await vi.advanceTimersByTimeAsync(15_000)
      source.emit(frame)
      await vi.advanceTimersByTimeAsync(0)
    }
    await vi.advanceTimersByTimeAsync(15_000)
    expect((await pending).error).toMatchObject({ code: 'TIMEOUT', message: 'Codex stream idle timeout after 300000ms' })
  })

it('settles its own idle timeout even when the SDK body and queued return ignore abort', async () => {
  vi.useFakeTimers()
  const source = responseSource(headers, false)
  vi.stubGlobal('fetch', source.fetch)
  const pending = collect(adapter().stream(request))
  await source.started
  await vi.advanceTimersByTimeAsync(300_000)
  expect((await pending).error).toMatchObject({ code: 'TIMEOUT' })
  expect(source.signal?.aborted).toBe(true)
})

it('settles its own total timeout even when the SDK body and queued return ignore abort', async () => {
  vi.useFakeTimers()
  const source = responseSource(headers, false)
  vi.stubGlobal('fetch', source.fetch)
  const pending = collect(adapter().stream(request))
  await source.started
  await vi.advanceTimersByTimeAsync(0)
  for (let index = 0; index < 29; index++) await pulse(source)
  await vi.advanceTimersByTimeAsync(15_000)
  expect((await pending).error).toMatchObject({ code: 'TIMEOUT', message: 'Codex preflight timeout after 450000ms' })
  expect(source.signal?.aborted).toBe(true)
  expect(vi.getTimerCount()).toBe(0)
})

it('preserves earlier caller cancellation when the absolute budget expires in the same interval', async () => {
  vi.useFakeTimers()
  const source = responseSource(headers, false)
  vi.stubGlobal('fetch', source.fetch)
  const caller = new AbortController()
  const pending = collect(adapter().stream({ ...request, signal: caller.signal }))
  await source.started
  await vi.advanceTimersByTimeAsync(0)
  for (let index = 0; index < 29; index++) await pulse(source)
  await vi.advanceTimersByTimeAsync(14_999)
  caller.abort(new Error('earlier caller cancel'))
  await vi.advanceTimersByTimeAsync(1)
  const result = await pending
  expect(result.error).toBeUndefined()
  expect(result.chunks.at(-1)).toMatchObject({ type: 'finish', reason: { kind: 'aborted' } })
})

// Native interception uses no Codex proxy-manager origin, but still requires explicit startup authorization.
const nativeOrigin = 'http://127.0.0.1:43123'
const nativeConfig = { ...config, trustedProxyOrigin: nativeOrigin, maxDurationMs: 900_000 }
const nativeStateSymbol = Symbol.for('billion-context.native-intercept-state')
function installNative(source: ReturnType<typeof responseSource>) {
  Object.defineProperty(source.fetch, Symbol.for('billion-context.native-fetch-chain'), { value: true, configurable: true })
  const state = { origin: nativeOrigin }
  vi.stubGlobal('fetch', source.fetch)
  vi.stubGlobal(Symbol.for('billion-context.native-fetch-intercept'), true)
  vi.stubGlobal(nativeStateSymbol, state)
  return state
}
function nativeAdapter(preflight = nativeConfig, enabled = true) {
  return createOpenAICodexAdapter(syntheticCredentials(), () => undefined, undefined, undefined,
    undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, enabled ? preflight : undefined)
}

it('admits explicitly authorized native late headers, then real SDK output beyond five minutes without a Codex proxy manager', async () => {
  vi.useFakeTimers()
  const gate = Promise.withResolvers<void>()
  const source = responseSource(headers, true, gate.promise, { origin: nativeOrigin })
  installNative(source)
  const pending = collect(nativeAdapter().stream(request))
  await source.started
  await vi.advanceTimersByTimeAsync(299_000)
  gate.resolve()
  await vi.advanceTimersByTimeAsync(2_000)
  expect(source.signal?.aborted).toBe(false) // accepted headers renewed the outstanding read
  for (let index = 0; index < 21; index++) await pulse(source, 30_000)
  expect(source.signal?.aborted).toBe(false)
  source.complete()
  const result = await pending
  expect(result.error).toBeUndefined()
  expect(result.chunks).toContainEqual(expect.objectContaining({ type: 'block-end', block: { type: 'text', text: 'OK' } }))
  expect(result.chunks.at(-1)).toMatchObject({ type: 'finish', reason: { kind: 'stop' } })
  expect(vi.getTimerCount()).toBe(0)
})

it('bounds native heartbeats at 900 seconds even for an uncooperative response body', async () => {
  vi.useFakeTimers()
  const source = responseSource(headers, false, undefined, { origin: nativeOrigin })
  installNative(source)
  const pending = collect(nativeAdapter().stream(request))
  await source.started
  await vi.advanceTimersByTimeAsync(0)
  for (let index = 0; index < 29; index++) await pulse(source, 30_000)
  await vi.advanceTimersByTimeAsync(29_999)
  expect(source.signal?.aborted).toBe(false)
  await vi.advanceTimersByTimeAsync(1)
  expect((await pending).error).toMatchObject({ code: 'TIMEOUT', message: 'Codex preflight timeout after 900000ms' })
  expect(source.signal?.aborted).toBe(true)
  expect(vi.getTimerCount()).toBe(0)
})

it.each(['default disabled', 'explicit unrelated proxy', 'upstream URL', 'empty URL', 'redirect', 'no native chain', 'missing header'])
  ('keeps ordinary idle timeout despite native-looking comments: %s', async mode => {
    vi.useFakeTimers()
    const source = responseSource(mode === 'missing header' ? { 'content-type': 'text/event-stream' } : headers,
      true, undefined, { origin: nativeOrigin, ...(mode === 'upstream URL' ? { url: 'https://chatgpt.com/backend-api/codex/responses' }
        : mode === 'empty URL' ? { url: '' } : mode === 'redirect' ? { redirected: true } : {}) })
    installNative(source)
    if (mode === 'no native chain') vi.stubGlobal(Symbol.for('billion-context.native-fetch-intercept'), false)
    const pending = collect(nativeAdapter(mode === 'explicit unrelated proxy' ? config : nativeConfig, mode !== 'default disabled').stream(request))
    await source.started
    await vi.advanceTimersByTimeAsync(0)
    for (let index = 0; index < 9; index++) await pulse(source, 30_000)
    await vi.advanceTimersByTimeAsync(30_000)
    expect((await pending).error).toMatchObject({ code: 'TIMEOUT', message: mode === 'default disabled'
      ? 'pi-ai stream idle timeout after 300000ms' : 'Codex stream idle timeout after 300000ms' })
    expect(source.signal?.aborted).toBe(true)
  })

it.each(['state before headers', 'origin before headers', 'fetch before headers', 'state after headers'])
  ('rejects stale native lifetime authority: %s', async change => {
    vi.useFakeTimers()
    const gate = Promise.withResolvers<void>()
    const source = responseSource(headers, true, gate.promise, { origin: nativeOrigin })
    const state = installNative(source)
    const pending = collect(nativeAdapter().stream(request))
    await source.started
    if (change === 'state before headers') vi.stubGlobal(nativeStateSymbol, { origin: nativeOrigin })
    if (change === 'origin before headers') state.origin = 'http://127.0.0.1:43124'
    if (change === 'fetch before headers') vi.stubGlobal('fetch', vi.fn())
    gate.resolve()
    await vi.advanceTimersByTimeAsync(0)
    if (change === 'state after headers') vi.stubGlobal(nativeStateSymbol, { origin: nativeOrigin })
    for (let index = 0; index < 9; index++) await pulse(source, 30_000)
    await vi.advanceTimersByTimeAsync(30_000)
    expect((await pending).error).toMatchObject({ code: 'TIMEOUT', message: 'Codex stream idle timeout after 300000ms' })
  })

it('preserves native caller cancellation promptly and cleans up owned timers', async () => {
  vi.useFakeTimers()
  const source = responseSource(headers, false, undefined, { origin: nativeOrigin })
  installNative(source)
  const caller = new AbortController()
  const pending = collect(nativeAdapter().stream({ ...request, signal: caller.signal }))
  await source.started
  await vi.advanceTimersByTimeAsync(0)
  await pulse(source, 30_000)
  caller.abort(new Error('native caller cancellation'))
  await vi.advanceTimersByTimeAsync(0)
  const result = await pending
  expect(result.error).toBeUndefined()
  expect(result.chunks.at(-1)).toMatchObject({ type: 'finish', reason: { kind: 'aborted' } })
  expect(source.signal?.aborted).toBe(true)
  expect(vi.getTimerCount()).toBe(0)
})

it('stops native frame recognition at first data even before a converted Host event', async () => {
  vi.useFakeTimers()
  const source = responseSource(headers, true, undefined, { origin: nativeOrigin })
  installNative(source)
  const pending = collect(nativeAdapter().stream(request))
  await source.started
  await vi.advanceTimersByTimeAsync(0)
  source.emit('data: {"type":"response.created","response":{"id":"synthetic"}}\n\n')
  await vi.advanceTimersByTimeAsync(0)
  for (let index = 0; index < 9; index++) await pulse(source, 30_000)
  await vi.advanceTimersByTimeAsync(30_000)
  expect((await pending).error).toMatchObject({ code: 'TIMEOUT', message: 'Codex stream idle timeout after 300000ms' })
})

it('ends native preflight on semantic output, then enforces ordinary semantic idle', async () => {
  vi.useFakeTimers()
  const source = responseSource(headers, true, undefined, { origin: nativeOrigin })
  installNative(source)
  const iterator = nativeAdapter().stream(request)[Symbol.asyncIterator]()
  const first = iterator.next()
  await source.started
  await vi.advanceTimersByTimeAsync(0)
  for (let index = 0; index < 25; index++) await pulse(source, 30_000)
  source.firstData()
  expect((await first).done).toBe(false)
  // Drain the already-produced block-start/text chunks without waiting on the network.
  const drain = (async () => { for (;;) { if ((await iterator.next()).done) return } })().catch(error => error)
  await vi.advanceTimersByTimeAsync(0)
  for (let index = 0; index < 9; index++) await pulse(source, 30_000)
  await vi.advanceTimersByTimeAsync(30_000)
  expect(await drain).toMatchObject({ code: 'TIMEOUT', message: 'Codex stream idle timeout after 300000ms' })
})

it('preserves the unmodified Host aborted finish on cooperative cancellation', async () => {
  vi.useFakeTimers()
  const source = responseSource()
  vi.stubGlobal('fetch', source.fetch)
  const caller = new AbortController()
  const pending = collect(adapter().stream({ ...request, signal: caller.signal }))
  await source.started
  await vi.advanceTimersByTimeAsync(0)
  caller.abort(new Error('cooperative cancellation'))
  await vi.advanceTimersByTimeAsync(0)
  const result = await pending
  expect(result.error).toBeUndefined()
  expect(result.chunks.at(-1)).toMatchObject({ type: 'finish', reason: { kind: 'aborted' } })
})
