/** Request-local, bounded diagnostics for Codex HTTP/SSE failures. Never logs payloads. */
import { AsyncLocalStorage } from 'node:async_hooks'
import type { SimpleStreamOptions } from '@earendil-works/pi-ai'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import type { OpenAICodexBackendRequests } from './backend-request.ts'
import {
  prepareOpenAICodexBackendRequest,
  openAICodexBackendResponseMeta,
  prepareOpenAICodexBackendHeaders,
} from './backend-request-policy.ts'

interface SafeDiagnostic {
  clientRequestId: string
  httpStatus?: number
  httpRequestId?: string
  sseRequestId?: string
  eventType?: 'error' | 'response.failed'
  errorCode?: string
  errorType?: string
  retryAfterMs?: number
}
export interface CodexLimitObservation {
  resetAt: number
  diagnosticSuffix: string
}
interface RequestScope {
  current?: SafeDiagnostic
  observeLimit?: (observation: CodexLimitObservation) => void
  limit?: { request: SafeDiagnostic; resetAt: number }
}
const requestScope = new AsyncLocalStorage<RequestScope>()
const MAX_FRAME_CHARS = 16 * 1024
const MIN_LIMIT_RESET_MS = 5 * 60_000
const MAX_LIMIT_RESET_MS = 6 * 60 * 60_000

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requestId(value: unknown): string | undefined {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u.test(value)
    && !/^(?:eyJ|sk-|Bearer)/iu.test(value) ? value : undefined
}

function errorCode(value: unknown): string | undefined {
  return typeof value === 'string' && /^[a-z][a-z0-9_]{0,79}$/u.test(value) ? value : undefined
}

/** Observe bounded frames only while their attribution is unambiguous; never scan past a terminal. */
class ErrorFrameObserver {
  private readonly decoder = new TextDecoder()
  private line = ''
  private data = ''
  private size = 0
  private stopped = false
  private previousCR = false
  private lineHasText = false

  constructor(private readonly diagnostic: SafeDiagnostic) {}

  feed(chunk: Uint8Array): void {
    // Slicing bounds temporary decoding even when a custom fetch returns a very large chunk.
    for (let offset = 0; !this.stopped && offset < chunk.byteLength; offset += 4096) {
      this.text(this.decoder.decode(chunk.subarray(offset, offset + 4096), { stream: true }))
    }
  }

  finish(): void {
    this.text(this.decoder.decode())
    // Unterminated/malformed frames are left to the provider parser, never guessed here.
    this.line = ''; this.data = ''; this.size = 0
  }

  private stop(): void {
    this.stopped = true
    this.line = ''; this.data = ''; this.size = 0
  }

  private text(text: string): void {
    for (const character of text) {
      if (this.stopped) return
      if (character === '\n' && this.previousCR) { this.previousCR = false; continue }
      this.previousCR = character === '\r'
      if (character === '\r' || character === '\n') {
        this.completeLine()
      } else {
        this.lineHasText = true
        this.size += 1
        if (this.size > MAX_FRAME_CHARS) { this.stop(); return }
        this.line += character
      }
    }
  }

  private completeLine(): void {
    if (!this.lineHasText) {
      if (this.data) this.observe(this.data)
      this.data = ''; this.size = 0
    } else if (this.line.startsWith('data:')) {
      this.data += this.line.slice(5).replace(/^ /u, '') + '\n'
      // Empty data lines still consume memory, so count their separators too.
      this.size += 1
      if (this.size > MAX_FRAME_CHARS) this.stop()
    }
    this.line = ''; this.lineHasText = false
  }

  private observe(data: string): void {
    if (data.trim() === '[DONE]') { this.stop(); return }
    let event: unknown
    try { event = JSON.parse(data) } catch { this.stop(); return }
    if (!record(event)) { this.stop(); return }
    // Diagnostic observation must not coerce untrusted JSON or interrupt the consumer.
    const eventType = event['type']
    if (typeof eventType !== 'string') { this.stop(); return }
    if (['response.completed', 'response.done', 'response.incomplete'].includes(eventType)) { this.stop(); return }
    if (event['type'] !== 'error' && event['type'] !== 'response.failed') return
    this.stop()
    const response = record(event['response']) ? event['response'] : undefined
    const nested = record(event['error']) ? event['error'] : response !== undefined && record(response['error']) ? response['error'] : undefined
    this.diagnostic.eventType = event['type']
    const code = errorCode(event['code']) ?? errorCode(nested?.['code'])
    const type = errorCode(nested?.['type'])
    const id = requestId(event['request_id']) ?? requestId(nested?.['request_id'])
    if (code !== undefined) this.diagnostic.errorCode = code
    if (type !== undefined) this.diagnostic.errorType = type
    if (id !== undefined) this.diagnostic.sseRequestId = id
  }
}

/** Capture a bounded structured 429 during the provider's normal consumption of its body. */
function limitResponseObserver(onReset: (resetAt: number) => void, receivedAt = Date.now()) {
  const decoder = new TextDecoder()
  let bytes = 0
  let body = ''
  return {
    feed(chunk: Uint8Array): void {
      bytes += chunk.byteLength
      if (bytes <= MAX_FRAME_CHARS) body += decoder.decode(chunk, { stream: true })
      else body = ''
    },
    finish(): void {
      if (bytes > MAX_FRAME_CHARS) return
      let value: unknown
      try { value = JSON.parse(body + decoder.decode()) } catch { return }
      if (!record(value) || !record(value['error'])) return
      const error = value['error']
      if (error['type'] !== 'usage_limit_reached') return
      const window = error['window_seconds']
      if (window !== undefined && window !== 18_000) return
      const absolute = error['resets_at']
      const seconds = absolute ?? error['resets_in_seconds']
      if (typeof seconds !== 'number' || !Number.isSafeInteger(seconds)) return
      const resetAt = (absolute === undefined || absolute === null ? receivedAt : 0) + seconds * 1000
      const delay = resetAt - receivedAt
      if (delay >= MIN_LIMIT_RESET_MS && delay <= MAX_LIMIT_RESET_MS) onReset(resetAt)
    },
  }
}

function observeResponse(response: Response, diagnostic: SafeDiagnostic, scope: RequestScope): Response {
  if (response.body === null) return response
  const sse = response.headers.get('content-type')?.toLowerCase().includes('text/event-stream') === true
  const observer = response.status === 429 && !sse && !response.redirected && scope.observeLimit !== undefined
    ? limitResponseObserver(resetAt => { if (scope.current === diagnostic) scope.limit = { request: diagnostic, resetAt } })
    : sse ? new ErrorFrameObserver(diagnostic) : undefined
  if (observer === undefined) return response
  const reader = response.body.getReader()
  let released = false
  let finished = false
  let output: ReadableStreamDefaultController<Uint8Array>
  const release = (): void => {
    if (!released) { released = true; reader.releaseLock() }
  }
  const fail = (error: unknown): void => {
    if (finished) return
    finished = true
    output.error(error)
    // Cancellation is harmless for an already errored reader; it also closes an
    // unread upstream if an unexpected local observation error caused the failure.
    void reader.cancel(error).catch(() => undefined)
    release()
  }
  const body = new ReadableStream<Uint8Array>({
    start(controller) { output = controller },
    async pull(controller) {
      try {
        const { done, value } = await reader.read()
        if (finished) return
        if (done) { observer.finish(); finished = true; release(); controller.close(); return }
        observer.feed(value)
        controller.enqueue(value)
      } catch (error: unknown) { fail(error) }
    },
    async cancel(reason: unknown) {
      if (finished) return
      finished = true
      try { await reader.cancel(reason) } finally { release() }
    },
  }, { highWaterMark: 0 })
  // Error/cancellation must be observable even when the consumer never reads again.
  // Normal release/cancel is already terminal, so its reader.closed rejection is ignored.
  void reader.closed.catch(fail)
  const wrapped = new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers })
  for (const key of ['url', 'redirected', 'type'] as const) {
    Object.defineProperty(wrapped, key, { value: response[key] })
  }
  return wrapped
}

/** Inject a request-local fetch seam, preserving existing provider hooks and dispatchers. */
export function withCodexDiagnosticFetch(
  options?: SimpleStreamOptions,
  requests?: OpenAICodexBackendRequests,
): SimpleStreamOptions | undefined {
  const scope = requestScope.getStore()
  const fetch = options?.fetch ?? globalThis.fetch
  if (scope === undefined) return requests === undefined ? options : {
    ...options, fetch: requests.wrapFetch({ lane: 'model', responseFormat: 'sse', identity: 'preserve', fetch }),
  }
  if (requests !== undefined) {
    const governed = requests.wrapFetch({
      lane: 'model',
      responseFormat: 'sse',
      identity: 'preserve',
      fetch,
      onAttempt(meta) { scope.current = { clientRequestId: meta.clientRequestId } },
      onResponse(meta) {
        if (scope.current?.clientRequestId !== meta.clientRequestId) return
        scope.current.httpStatus = meta.httpStatus
        if (meta.httpRequestId !== undefined) scope.current.httpRequestId = meta.httpRequestId
        if (meta.retryAfterMs !== undefined) scope.current.retryAfterMs = meta.retryAfterMs
      },
    })
    return {
      ...options,
      async fetch(input, init) {
        const response = await governed(input, init)
        return scope.current === undefined ? response : observeResponse(response, scope.current, scope)
      },
    }
  }
  return {
    ...options,
    async fetch(input, init) {
      const prepared = prepareOpenAICodexBackendRequest(input, init)
      const { headers, clientRequestId } = prepareOpenAICodexBackendHeaders(
        prepared.init.headers,
        'preserve',
      )
      const diagnostic: SafeDiagnostic = { clientRequestId }
      scope.current = diagnostic
      const response = await fetch(prepared.input, { ...prepared.init, headers })
      const meta = openAICodexBackendResponseMeta(response, clientRequestId)
      diagnostic.httpStatus = meta.httpStatus
      if (meta.httpRequestId !== undefined) diagnostic.httpRequestId = meta.httpRequestId
      if (meta.retryAfterMs !== undefined) diagnostic.retryAfterMs = meta.retryAfterMs
      return observeResponse(response, diagnostic, scope)
    },
  }
}

/** Append diagnostics after DSH has classified the error; request ids must not affect that classification. */
export function streamWithCodexRequestDiagnostics(
  stream: (options: GenerateOptions) => AsyncIterable<StreamChunk>, options: GenerateOptions,
  observeLimit?: (observation: CodexLimitObservation) => void,
): AsyncIterable<StreamChunk> {
  return {
    async *[Symbol.asyncIterator]() {
      const scope: RequestScope = observeLimit === undefined ? {} : { observeLimit }
      const iterator = requestScope.run(scope, () => stream(options)[Symbol.asyncIterator]())
      try {
        while (true) {
          const next = await requestScope.run(scope, () => iterator.next())
          if (next.done) return
          const chunk = next.value
          if (chunk.type === 'finish' && chunk.reason.kind === 'error' && chunk.reason.failure !== undefined && scope.current !== undefined) {
            const diagnosticSuffix = '\n[Codex diagnostics: ' + JSON.stringify(scope.current) + ']'
            if (!options.signal?.aborted && scope.limit?.request === scope.current) {
              scope.observeLimit?.({ resetAt: scope.limit.resetAt, diagnosticSuffix })
            }
            yield { ...chunk, reason: { ...chunk.reason, failure: {
              ...chunk.reason.failure,
              message: chunk.reason.failure.message + diagnosticSuffix,
            } } }
          } else yield chunk
        }
      } finally {
        try { await requestScope.run(scope, () => iterator.return?.()) } finally { delete scope.current; delete scope.limit }
      }
    },
  }
}
