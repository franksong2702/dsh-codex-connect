/** Request-local, bounded diagnostics for Codex HTTP/SSE failures. Never logs payloads. */
import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'
import type { SimpleStreamOptions } from '@earendil-works/pi-ai'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import { readRetryAfterMs } from './request-backoff.ts'

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
interface RequestScope { current?: SafeDiagnostic }
const requestScope = new AsyncLocalStorage<RequestScope>()
const MAX_FRAME_CHARS = 16 * 1024

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

/** Observe only complete bounded frames, discarding oversized frames until the next blank line. */
class ErrorFrameObserver {
  private readonly decoder = new TextDecoder()
  private line = ''
  private data = ''
  private size = 0
  private skip = false
  private previousCR = false
  private lineHasText = false

  constructor(private readonly diagnostic: SafeDiagnostic) {}

  feed(chunk: Uint8Array): void {
    // Slicing bounds temporary decoding even when a custom fetch returns a very large chunk.
    for (let offset = 0; offset < chunk.byteLength; offset += 4096) {
      this.text(this.decoder.decode(chunk.subarray(offset, offset + 4096), { stream: true }))
    }
  }

  finish(): void {
    this.text(this.decoder.decode())
    // Unterminated/malformed frames are left to the provider parser, never guessed here.
    this.line = ''; this.data = ''; this.size = 0
  }

  private text(text: string): void {
    for (const character of text) {
      if (character === '\n' && this.previousCR) { this.previousCR = false; continue }
      this.previousCR = character === '\r'
      if (character === '\r' || character === '\n') {
        this.completeLine()
      } else {
        this.lineHasText = true
        this.size += 1
        if (this.size > MAX_FRAME_CHARS) { this.skip = true; this.line = ''; this.data = '' }
        if (!this.skip) this.line += character
      }
    }
  }

  private completeLine(): void {
    if (!this.lineHasText) {
      if (!this.skip && this.data) this.observe(this.data)
      this.data = ''; this.size = 0; this.skip = false
    } else if (!this.skip && this.line.startsWith('data:')) {
      this.data += this.line.slice(5).replace(/^ /u, '') + '\n'
      // Empty data lines still consume memory, so count their separators too.
      this.size += 1
      if (this.size > MAX_FRAME_CHARS) { this.skip = true; this.data = '' }
    }
    this.line = ''; this.lineHasText = false
  }

  private observe(data: string): void {
    if (this.diagnostic.eventType !== undefined) return // Match the first terminal error the provider consumes.
    let event: unknown
    try { event = JSON.parse(data) } catch { return }
    if (!record(event) || (event['type'] !== 'error' && event['type'] !== 'response.failed')) return
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

function observeResponse(response: Response, diagnostic: SafeDiagnostic): Response {
  if (response.body === null || !response.headers.get('content-type')?.toLowerCase().includes('text/event-stream')) return response
  const observer = new ErrorFrameObserver(diagnostic)
  const reader = response.body.getReader()
  let released = false
  const release = (): void => {
    if (!released) { released = true; reader.releaseLock() }
  }
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read()
        if (done) { observer.finish(); release(); controller.close(); return }
        observer.feed(value)
        controller.enqueue(value)
      } catch (error: unknown) {
        release()
        controller.error(error)
      }
    },
    async cancel(reason: unknown) {
      try { await reader.cancel(reason) } finally { release() }
    },
  }, { highWaterMark: 0 })
  const wrapped = new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers })
  for (const key of ['url', 'redirected', 'type'] as const) {
    Object.defineProperty(wrapped, key, { value: response[key] })
  }
  return wrapped
}

/** Inject a request-local fetch seam, preserving existing provider hooks and dispatchers. */
export function withCodexDiagnosticFetch(options?: SimpleStreamOptions): SimpleStreamOptions | undefined {
  const scope = requestScope.getStore()
  if (scope === undefined) return options
  const fetch = options?.fetch ?? globalThis.fetch
  return {
    ...options,
    async fetch(input, init) {
      const diagnostic: SafeDiagnostic = { clientRequestId: randomUUID() }
      scope.current = diagnostic
      const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
      // Correlate each HTTP attempt independently; never change session affinity or client identity.
      headers.set('x-client-request-id', diagnostic.clientRequestId)
      const response = await fetch(input, { ...init, headers })
      diagnostic.httpStatus = response.status
      const id = requestId(response.headers.get('x-request-id')) ?? requestId(response.headers.get('request-id'))
      if (id !== undefined) diagnostic.httpRequestId = id
      const retry = readRetryAfterMs(response.headers)
      if (retry !== undefined && Number.isFinite(retry)) diagnostic.retryAfterMs = retry
      return observeResponse(response, diagnostic)
    },
  }
}

/** Append diagnostics after DSH has classified the error; request ids must not affect that classification. */
export function streamWithCodexRequestDiagnostics(
  stream: (options: GenerateOptions) => AsyncIterable<StreamChunk>, options: GenerateOptions,
): AsyncIterable<StreamChunk> {
  return {
    async *[Symbol.asyncIterator]() {
      const scope: RequestScope = {}
      const iterator = requestScope.run(scope, () => stream(options)[Symbol.asyncIterator]())
      try {
        while (true) {
          const next = await requestScope.run(scope, () => iterator.next())
          if (next.done) return
          const chunk = next.value
          if (chunk.type === 'finish' && chunk.reason.kind === 'error' && chunk.reason.failure !== undefined && scope.current !== undefined) {
            yield { ...chunk, reason: { ...chunk.reason, failure: {
              ...chunk.reason.failure,
              message: chunk.reason.failure.message + '\n[Codex diagnostics: ' + JSON.stringify(scope.current) + ']',
            } } }
          } else yield chunk
        }
      } finally {
        try { await requestScope.run(scope, () => iterator.return?.()) } finally { delete scope.current }
      }
    },
  }
}
