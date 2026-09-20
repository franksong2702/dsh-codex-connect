/** Shared lifecycle policy for every authenticated chatgpt.com/backend-api request. */
import { randomUUID } from 'node:crypto'
import type { FetchFunction } from '@earendil-works/pi-ai'
import { readRetryAfterMs } from './request-backoff.ts'

/** Conservative per-plugin ceiling for simultaneously open backend responses. */
export const OPENAI_CODEX_BACKEND_MAX_CONCURRENT_REQUESTS = 8
/** Honest plugin identity for plugin-owned HTTP routes. Model identity remains pi-ai-owned. */
export const OPENAI_CODEX_BACKEND_USER_AGENT = 'dsh-codex-connect'

/** Every backend-api route owned or observed by this plugin. */
export type OpenAICodexBackendRoute =
  | 'model'
  | 'search'
  | 'quota'
  | 'image'
  | 'auto-review'
  | 'native-compaction'
  | 'capability-probe'
  | 'auto-review-probe'
  | 'proxy-probe'

/** Safe request metadata. Never contains bearer tokens, account ids, payloads, or generated text. */
export interface OpenAICodexBackendDiagnostic {
  readonly route: OpenAICodexBackendRoute
  readonly clientRequestId: string
  httpStatus?: number
  httpRequestId?: string
  sseRequestId?: string
  eventType?: 'error' | 'response.failed'
  errorCode?: string
  errorType?: string
  retryAfterMs?: number
}

/** Combined caller/timeout signal with explicit timeout classification. */
export interface OpenAICodexBackendDeadline {
  readonly signal: AbortSignal
  readonly timedOut: () => boolean
  readonly dispose: () => void
}

interface BackendProxyScope {
  run<T>(proxyUrl: string | undefined, operation: () => T): T
  runStream<T extends { result(): Promise<unknown> }>(proxyUrl: string | undefined, operation: () => T): T
}

const DIRECT_ORIGINATOR: Partial<Record<OpenAICodexBackendRoute, string>> = {
  // Preserve the already-shipped endpoint identity until OpenAI publishes a third-party contract.
  search: 'deepseek-harness',
  'auto-review': 'deepseek-harness',
  'native-compaction': 'deepseek-harness',
  'capability-probe': 'deepseek-harness',
  'auto-review-probe': 'deepseek-harness',
}
const MAX_FRAME_CHARS = 16 * 1024

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function safeRequestId(value: unknown): string | undefined {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u.test(value)
    && !/^(?:eyJ|sk-|Bearer)/iu.test(value) ? value : undefined
}

function safeErrorCode(value: unknown): string | undefined {
  return typeof value === 'string' && /^[a-z][a-z0-9_]{0,79}$/u.test(value) ? value : undefined
}

function backendUrl(input: string | URL | Request): URL {
  const raw = input instanceof Request ? input.url : input
  const url = raw instanceof URL ? raw : new URL(raw)
  if (url.origin !== 'https://chatgpt.com' || url.username !== '' || url.password !== ''
    || !url.pathname.startsWith('/backend-api/')) {
    throw new TypeError('OpenAI Codex backend request must target https://chatgpt.com/backend-api/')
  }
  return url
}

/** Central route identity policy. It intentionally does not impersonate first-party Codex clients. */
export function openAICodexBackendHeaders(
  route: OpenAICodexBackendRoute,
  initial?: HeadersInit,
  clientRequestId: string = randomUUID(),
): Headers {
  const headers = new Headers(initial)
  headers.set('x-client-request-id', clientRequestId)
  if (route !== 'model') {
    headers.set('user-agent', OPENAI_CODEX_BACKEND_USER_AGENT)
    const originator = DIRECT_ORIGINATOR[route]
    if (originator === undefined) headers.delete('originator')
    else headers.set('originator', originator)
  }
  return headers
}

/** Create one total request deadline without obscuring whether the caller or timeout fired first. */
export function openAICodexBackendDeadline(signal: AbortSignal | undefined, timeoutMs: number): OpenAICodexBackendDeadline {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) throw new TypeError('timeoutMs must be a positive safe integer')
  const timeout = new AbortController()
  let expired = false
  const timer = setTimeout(() => {
    expired = true
    timeout.abort(new DOMException('OpenAI Codex backend request timed out', 'TimeoutError'))
  }, timeoutMs)
  timer.unref?.()
  return {
    signal: signal === undefined ? timeout.signal : AbortSignal.any([signal, timeout.signal]),
    timedOut: () => expired && signal?.aborted !== true,
    dispose: () => clearTimeout(timer),
  }
}

interface RequestGateWaiter {
  readonly signal?: AbortSignal
  readonly resolve: (release: () => void) => void
  readonly reject: (error: unknown) => void
  onAbort?: () => void
}

class RequestGate {
  private active = 0
  private readonly waiters: RequestGateWaiter[] = []

  constructor(private readonly limit: number) {
    if (!Number.isSafeInteger(limit) || limit < 1) throw new TypeError('backend concurrency limit must be a positive safe integer')
  }

  acquire(signal?: AbortSignal): Promise<() => void> {
    if (signal?.aborted === true) return Promise.reject(signal.reason ?? new DOMException('The operation was aborted', 'AbortError'))
    if (this.active < this.limit) {
      this.active += 1
      return Promise.resolve(this.releaseOnce())
    }
    return new Promise<() => void>((resolve, reject) => {
      const waiter: RequestGateWaiter = { resolve, reject, ...(signal === undefined ? {} : { signal }) }
      if (signal !== undefined) {
        waiter.onAbort = () => {
          const index = this.waiters.indexOf(waiter)
          if (index >= 0) this.waiters.splice(index, 1)
          reject(signal.reason ?? new DOMException('The operation was aborted', 'AbortError'))
        }
        signal.addEventListener('abort', waiter.onAbort, { once: true })
      }
      this.waiters.push(waiter)
    })
  }

  private releaseOnce(): () => void {
    let released = false
    return () => {
      if (released) return
      released = true
      this.active -= 1
      while (this.waiters.length > 0 && this.active < this.limit) {
        const waiter = this.waiters.shift()!
        if (waiter.signal?.aborted === true) continue
        if (waiter.onAbort !== undefined) waiter.signal?.removeEventListener('abort', waiter.onAbort)
        this.active += 1
        waiter.resolve(this.releaseOnce())
      }
    }
  }
}

/** Observe bounded frames only while attribution remains unambiguous. */
class ErrorFrameObserver {
  private readonly decoder = new TextDecoder()
  private line = ''
  private data = ''
  private size = 0
  private stopped = false
  private previousCR = false
  private lineHasText = false

  constructor(private readonly diagnostic: OpenAICodexBackendDiagnostic) {}

  feed(chunk: Uint8Array): void {
    for (let offset = 0; !this.stopped && offset < chunk.byteLength; offset += 4096) {
      this.text(this.decoder.decode(chunk.subarray(offset, offset + 4096), { stream: true }))
    }
  }

  finish(): void {
    if (!this.stopped) this.text(this.decoder.decode())
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
      if (character === '\r' || character === '\n') this.completeLine()
      else {
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
    if (['response.completed', 'response.done', 'response.incomplete'].includes(String(event['type']))) { this.stop(); return }
    if (event['type'] !== 'error' && event['type'] !== 'response.failed') return
    this.stop()
    const response = record(event['response']) ? event['response'] : undefined
    const nested = record(event['error']) ? event['error'] : response !== undefined && record(response['error']) ? response['error'] : undefined
    this.diagnostic.eventType = event['type']
    const code = safeErrorCode(event['code']) ?? safeErrorCode(nested?.['code'])
    const type = safeErrorCode(nested?.['type'])
    const id = safeRequestId(event['request_id']) ?? safeRequestId(nested?.['request_id'])
    if (code !== undefined) this.diagnostic.errorCode = code
    if (type !== undefined) this.diagnostic.errorType = type
    if (id !== undefined) this.diagnostic.sseRequestId = id
  }
}

function wrapResponse(response: Response, diagnostic: OpenAICodexBackendDiagnostic, releaseGate: () => void): Response {
  diagnostic.httpStatus = response.status
  const id = safeRequestId(response.headers.get('x-request-id')) ?? safeRequestId(response.headers.get('request-id'))
  if (id !== undefined) diagnostic.httpRequestId = id
  const retry = readRetryAfterMs(response.headers)
  if (retry !== undefined && Number.isFinite(retry)) diagnostic.retryAfterMs = retry
  if (response.body === null) { releaseGate(); return response }
  // Custom FetchFunction tests and host adapters may supply a Response-like body
  // with only cancel(). Preserve that object instead of requiring a Web stream.
  if (typeof (response.body as { getReader?: unknown }).getReader !== 'function') {
    releaseGate()
    return response
  }

  const observer = response.headers.get('content-type')?.toLowerCase().includes('text/event-stream') === true
    ? new ErrorFrameObserver(diagnostic) : undefined
  const reader = response.body.getReader()
  let released = false
  const release = (): void => {
    if (released) return
    released = true
    try { reader.releaseLock() } finally { releaseGate() }
  }
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read()
        if (done) { observer?.finish(); release(); controller.close(); return }
        observer?.feed(value)
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
  for (const key of ['url', 'redirected', 'type'] as const) Object.defineProperty(wrapped, key, { value: response[key] })
  return wrapped
}

/** One plugin instance's request layer: proxy scope, traffic ceiling, attempt identity, and diagnostics. */
export class OpenAICodexBackendRequestLayer {
  private readonly gate: RequestGate

  constructor(
    private readonly proxyManager?: BackendProxyScope,
    private readonly resolveProxyUrl: () => string | undefined = () => undefined,
    maxConcurrent = OPENAI_CODEX_BACKEND_MAX_CONCURRENT_REQUESTS,
  ) {
    this.gate = new RequestGate(maxConcurrent)
  }

  /** Keep authentication, dispatch, and body consumption in the same configured proxy scope. */
  run<T>(operation: () => T, proxyUrl = this.resolveProxyUrl()): T {
    return this.proxyManager?.run(proxyUrl, operation) ?? operation()
  }

  /** Keep a model stream's proxy lease until its final event. */
  runStream<T extends { result(): Promise<unknown> }>(operation: () => T, proxyUrl = this.resolveProxyUrl()): T {
    return this.proxyManager?.runStream(proxyUrl, operation) ?? operation()
  }

  /** Build a fetch function using the shared request policy while preserving the caller's transport. */
  wrapFetch(
    route: OpenAICodexBackendRoute,
    baseFetch: FetchFunction = globalThis.fetch,
    onDiagnostic?: (diagnostic: OpenAICodexBackendDiagnostic) => void,
  ): FetchFunction {
    return async (input, init) => {
      backendUrl(input)
      const sourceSignal = init?.signal ?? (input instanceof Request ? input.signal : undefined)
      const release = await this.gate.acquire(sourceSignal ?? undefined)
      const diagnostic: OpenAICodexBackendDiagnostic = { route, clientRequestId: randomUUID() }
      onDiagnostic?.(diagnostic)
      const headers = openAICodexBackendHeaders(
        route,
        init?.headers ?? (input instanceof Request ? input.headers : undefined),
        diagnostic.clientRequestId,
      )
      try {
        const response = await baseFetch(input, { ...init, headers })
        return wrapResponse(response, diagnostic, release)
      } catch (error: unknown) {
        release()
        throw error
      }
    }
  }

  /** Dispatch one direct request through the shared policy. */
  fetch(
    route: OpenAICodexBackendRoute,
    input: string | URL | Request,
    init?: RequestInit,
    baseFetch?: FetchFunction,
    onDiagnostic?: (diagnostic: OpenAICodexBackendDiagnostic) => void,
  ): Promise<Response> {
    return this.wrapFetch(route, baseFetch ?? globalThis.fetch, onDiagnostic)(input, init)
  }
}

/** Compact suffix safe for user-facing diagnostic text. */
export function formatOpenAICodexBackendDiagnostic(diagnostic: OpenAICodexBackendDiagnostic): string {
  return `[Codex diagnostics: ${JSON.stringify(diagnostic)}]`
}
