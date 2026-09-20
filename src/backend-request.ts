/** Runtime request governor for authenticated chatgpt.com/backend-api traffic. */
import type { OpenAICodexProxyManager } from './provider-proxy.ts'
import {
  assertOpenAICodexBackendUrl,
  openAICodexBackendResponseMeta,
  prepareOpenAICodexBackendHeaders,
  type OpenAICodexBackendIdentity,
  type OpenAICodexBackendResponseMeta,
} from './backend-request-policy.ts'

export const OPENAI_CODEX_BACKEND_MAX_CONCURRENT_REQUESTS = 8
export const OPENAI_CODEX_BACKEND_MAX_SERVER_COOLDOWN_MS = 15 * 60_000

export type OpenAICodexBackendLane =
  | 'model'
  | 'search'
  | 'quota'
  | 'image'
  | 'auto-review'

type BackendFetch = typeof globalThis.fetch

interface Waiter {
  readonly signal: AbortSignal
  readonly resolve: (release: () => void) => void
  readonly reject: (error: unknown) => void
  readonly onAbort: () => void
}

export interface OpenAICodexBackendRunOptions {
  readonly lane: OpenAICodexBackendLane
  readonly signal?: AbortSignal | undefined
  readonly timeoutMs?: number | undefined
}

export interface OpenAICodexBackendFetchOptions {
  readonly lane: OpenAICodexBackendLane
  readonly identity?: OpenAICodexBackendIdentity
  readonly fetch?: BackendFetch
  readonly onAttempt?: (meta: Pick<OpenAICodexBackendResponseMeta, 'clientRequestId'>) => void
  readonly onResponse?: (meta: OpenAICodexBackendResponseMeta) => void | Promise<void>
}

export interface OpenAICodexBackendRunContext {
  readonly signal: AbortSignal
  fetch(input: string | URL | Request, init?: RequestInit, options?: Omit<OpenAICodexBackendFetchOptions, 'lane'>): Promise<Response>
}

function abortError(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException('The operation was aborted', 'AbortError')
}

async function waitUntil(deadline: number, signal: AbortSignal): Promise<void> {
  const delay = deadline - Date.now()
  if (delay <= 0) return
  await new Promise<void>((resolve, reject) => {
    if (signal.aborted) { reject(abortError(signal)); return }
    const timer = setTimeout(() => { signal.removeEventListener('abort', onAbort); resolve() }, delay)
    const onAbort = (): void => { clearTimeout(timer); reject(abortError(signal)) }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

function wrapResponseLifecycle(response: Response, release: () => void): Response {
  if (response.body === null) { release(); return response }
  const reader = response.body.getReader()
  let released = false
  const finish = (): void => {
    if (released) return
    released = true
    try { reader.releaseLock() } catch { /* best effort */ }
    release()
  }
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read()
        if (done) { finish(); controller.close(); return }
        controller.enqueue(value)
      } catch (error: unknown) {
        finish()
        controller.error(error)
      }
    },
    async cancel(reason: unknown) {
      try { await reader.cancel(reason) } finally { finish() }
    },
  }, { highWaterMark: 0 })
  const wrapped = new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers })
  for (const key of ['url', 'redirected', 'type'] as const) Object.defineProperty(wrapped, key, { value: response[key] })
  return wrapped
}

/** One plugin instance owns one governor; it never guesses account-level service policy. */
export class OpenAICodexBackendRequests {
  private active = 0
  private readonly waiters: Waiter[] = []
  private readonly cooldowns = new Map<OpenAICodexBackendLane, number>()
  private readonly lifecycle = new AbortController()
  private disposed = false

  constructor(
    private readonly proxyManager?: OpenAICodexProxyManager,
    private readonly resolveProxyUrl: () => string | undefined = () => undefined,
    private readonly maxConcurrent = OPENAI_CODEX_BACKEND_MAX_CONCURRENT_REQUESTS,
  ) {
    if (!Number.isSafeInteger(maxConcurrent) || maxConcurrent < 1) throw new TypeError('maxConcurrent must be a positive safe integer')
  }

  private combinedSignal(signal?: AbortSignal, timeoutMs?: number): AbortSignal {
    const signals = [this.lifecycle.signal, ...(signal === undefined ? [] : [signal])]
    if (timeoutMs !== undefined) {
      if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new TypeError('timeoutMs must be a positive finite number')
      signals.push(AbortSignal.timeout(timeoutMs))
    }
    return signals.length === 1 ? signals[0]! : AbortSignal.any(signals)
  }

  private drain(): void {
    while (!this.disposed && this.active < this.maxConcurrent && this.waiters.length > 0) {
      const waiter = this.waiters.shift()!
      waiter.signal.removeEventListener('abort', waiter.onAbort)
      if (waiter.signal.aborted) { waiter.reject(abortError(waiter.signal)); continue }
      this.active += 1
      waiter.resolve(this.release())
    }
  }

  private release(): () => void {
    let released = false
    return () => {
      if (released) return
      released = true
      this.active -= 1
      this.drain()
    }
  }

  private acquire(signal: AbortSignal): Promise<() => void> {
    if (this.disposed || this.lifecycle.signal.aborted) return Promise.reject(abortError(this.lifecycle.signal))
    if (signal.aborted) return Promise.reject(abortError(signal))
    if (this.active < this.maxConcurrent) {
      this.active += 1
      return Promise.resolve(this.release())
    }
    return new Promise<() => void>((resolve, reject) => {
      const waiter = {} as Waiter
      const onAbort = (): void => {
        const index = this.waiters.indexOf(waiter)
        if (index >= 0) this.waiters.splice(index, 1)
        reject(abortError(signal))
      }
      Object.assign(waiter, { signal, resolve, reject, onAbort })
      signal.addEventListener('abort', onAbort, { once: true })
      this.waiters.push(waiter)
    })
  }

  private async beforeRequest(lane: OpenAICodexBackendLane, signal: AbortSignal): Promise<void> {
    const deadline = this.cooldowns.get(lane) ?? 0
    await waitUntil(deadline, signal)
  }

  private recordResponse(lane: OpenAICodexBackendLane, meta: OpenAICodexBackendResponseMeta): void {
    if ((meta.httpStatus !== 429 && meta.httpStatus !== 503) || meta.retryAfterMs === undefined || meta.retryAfterMs <= 0) return
    const deadline = Date.now() + Math.min(meta.retryAfterMs, OPENAI_CODEX_BACKEND_MAX_SERVER_COOLDOWN_MS)
    this.cooldowns.set(lane, Math.max(this.cooldowns.get(lane) ?? 0, deadline))
  }

  private async fetchAttempt(
    lane: OpenAICodexBackendLane,
    signal: AbortSignal,
    input: string | URL | Request,
    init: RequestInit | undefined,
    options: Omit<OpenAICodexBackendFetchOptions, 'lane'> = {},
  ): Promise<Response> {
    assertOpenAICodexBackendUrl(input)
    signal.throwIfAborted()
    await this.beforeRequest(lane, signal)
    signal.throwIfAborted()
    const { headers, clientRequestId } = prepareOpenAICodexBackendHeaders(
      init?.headers ?? (input instanceof Request ? input.headers : undefined),
      options.identity ?? 'plugin',
    )
    options.onAttempt?.({ clientRequestId })
    const response = await (options.fetch ?? globalThis.fetch)(input, { ...init, headers, signal })
    const meta = openAICodexBackendResponseMeta(response, clientRequestId)
    this.recordResponse(lane, meta)
    await options.onResponse?.(meta)
    return response
  }

  /** Run one logical direct request under one concurrency slot and one proxy scope. */
  async run<T>(
    options: OpenAICodexBackendRunOptions,
    operation: (context: OpenAICodexBackendRunContext) => Promise<T>,
  ): Promise<T> {
    const signal = this.combinedSignal(options.signal, options.timeoutMs)
    await this.beforeRequest(options.lane, signal)
    const release = await this.acquire(signal)
    try {
      const execute = () => operation({
        signal,
        fetch: (input, init, fetchOptions) => {
          const nested = init?.signal
          const fetchSignal = nested == null || nested === signal ? signal : AbortSignal.any([signal, nested])
          return this.fetchAttempt(options.lane, fetchSignal, input, init, fetchOptions)
        },
      })
      try {
        return await (this.proxyManager?.run(this.resolveProxyUrl(), execute) ?? execute())
      } catch (error: unknown) {
        if (signal.aborted) throw abortError(signal)
        throw error
      }
    } finally {
      release()
    }
  }

  /** Wrap provider-owned fetch while preserving provider identity and stream proxy lifetime. */
  wrapFetch(options: OpenAICodexBackendFetchOptions): BackendFetch {
    return async (input, init) => {
      const inputSignal = init?.signal ?? (input instanceof Request ? input.signal : undefined)
      const signal = this.combinedSignal(inputSignal ?? undefined)
      await this.beforeRequest(options.lane, signal)
      const release = await this.acquire(signal)
      try {
        const response = await this.fetchAttempt(options.lane, signal, input, init, options)
        return wrapResponseLifecycle(response, release)
      } catch (error: unknown) {
        release()
        throw error
      }
    }
  }

  /** Keep the existing proxy lease for the complete provider stream. */
  runStream<T extends { result(): Promise<unknown> }>(operation: () => T): T {
    return this.proxyManager?.runStream(this.resolveProxyUrl(), operation) ?? operation()
  }

  /** Abort queued/in-flight managed requests and prevent new admission. */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.lifecycle.abort(new DOMException('OpenAI Codex backend request manager disposed', 'AbortError'))
    for (const waiter of this.waiters.splice(0)) {
      waiter.signal.removeEventListener('abort', waiter.onAbort)
      waiter.reject(abortError(this.lifecycle.signal))
    }
  }
}
