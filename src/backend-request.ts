/** Runtime request governor for authenticated chatgpt.com/backend-api traffic. */
import type { OpenAICodexProxyManager } from './provider-proxy.ts'
import { readRetryAfterMs } from './request-backoff.ts'
import { reserveAdaptiveTaskAttempt } from './adaptive-task-scope.ts'
import {
  prepareOpenAICodexBackendRequest,
  openAICodexBackendResponseMeta,
  prepareOpenAICodexBackendHeaders,
  type OpenAICodexBackendIdentity,
  type OpenAICodexBackendResponseMeta,
} from './backend-request-policy.ts'

export const OPENAI_CODEX_BACKEND_MAX_CONCURRENT_REQUESTS = 8
// Limit each timer slice, never shorten a service-directed deadline.
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
    const timer = setTimeout(() => { signal.removeEventListener('abort', onAbort); resolve() },
      Math.min(delay, OPENAI_CODEX_BACKEND_MAX_SERVER_COOLDOWN_MS))
    const onAbort = (): void => { clearTimeout(timer); reject(abortError(signal)) }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

function wrapResponseLifecycle(response: Response, release: () => void, signal: AbortSignal): Response {
  if (response.body === null) { release(); return response }
  const reader = response.body.getReader()
  let finished = false
  let output: ReadableStreamDefaultController<Uint8Array>
  const finish = (): void => {
    if (finished) return
    finished = true
    signal.removeEventListener('abort', onAbort)
    try { reader.releaseLock() } catch { /* pending read cleanup is completed by cancel */ }
    release()
  }
  const onAbort = (): void => {
    if (finished) return
    const error = abortError(signal)
    output.error(error)
    void reader.cancel(error).catch(() => undefined)
    finish()
  }
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      output = controller
      signal.addEventListener('abort', onAbort, { once: true })
      if (signal.aborted) onAbort()
    },
    async pull(controller) {
      if (finished) return
      try {
        const { done, value } = await reader.read()
        if (finished) return
        if (done) { finish(); controller.close(); return }
        controller.enqueue(value)
      } catch (error: unknown) {
        if (!finished) { controller.error(error); finish() }
      }
    },
    async cancel(reason: unknown) {
      if (finished) return
      try { await reader.cancel(reason) } finally { finish() }
    },
  }, { highWaterMark: 0 })
  // A paused consumer may never issue another read after a network failure.
  void reader.closed.catch(error => { if (!finished) { output.error(error); finish() } })
  try {
    const wrapped = new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers })
    for (const key of ['url', 'redirected', 'type'] as const) Object.defineProperty(wrapped, key, { value: response[key] })
    return wrapped
  } catch (error: unknown) {
    void reader.cancel(error).catch(() => undefined)
    finish()
    throw error
  }
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
    private readonly beforeAuxiliaryAttempt?: () => Promise<void>,
  ) {
    if (!Number.isSafeInteger(maxConcurrent) || maxConcurrent < 1) throw new TypeError('maxConcurrent must be a positive safe integer')
  }

  private combinedSignal(signal?: AbortSignal): AbortSignal {
    return signal === undefined ? this.lifecycle.signal : AbortSignal.any([this.lifecycle.signal, signal])
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
    while (Date.now() < (this.cooldowns.get(lane) ?? 0)) {
      await waitUntil(this.cooldowns.get(lane)!, signal)
    }
    signal.throwIfAborted()
  }

  private async admit(lane: OpenAICodexBackendLane, signal: AbortSignal): Promise<() => void> {
    while (true) {
      await this.beforeRequest(lane, signal)
      const release = await this.acquire(signal)
      if (signal.aborted) { release(); throw abortError(signal) }
      // The preceding response may have started/extended cooling while we queued.
      if (Date.now() < (this.cooldowns.get(lane) ?? 0)) { release(); continue }
      return release
    }
  }

  private recordResponse(lane: OpenAICodexBackendLane, response: Response): void {
    if (response.status !== 429 && response.status !== 503) return
    const delay = readRetryAfterMs(response.headers)
    if (delay === undefined || delay <= 0) return
    // Overflow is conservative: callers can cancel or reach their own deadline.
    this.cooldowns.set(lane, Math.max(this.cooldowns.get(lane) ?? 0, Date.now() + delay))
  }

  private async fetchAttempt(
    lane: OpenAICodexBackendLane,
    signal: AbortSignal,
    input: string | URL | Request,
    init: RequestInit | undefined,
    options: Omit<OpenAICodexBackendFetchOptions, 'lane'> = {},
  ): Promise<Response> {
    signal.throwIfAborted()
    const { headers, clientRequestId } = prepareOpenAICodexBackendHeaders(
      init?.headers ?? (input instanceof Request ? input.headers : undefined),
      options.identity ?? 'plugin',
    )
    options.onAttempt?.({ clientRequestId })
    signal.throwIfAborted()
    await reserveAdaptiveTaskAttempt()
    await this.beforeAuxiliaryAttempt?.()
    signal.throwIfAborted()
    const response = await (options.fetch ?? globalThis.fetch)(input, { ...init, headers, signal })
    try {
      signal.throwIfAborted()
      const meta = openAICodexBackendResponseMeta(response, clientRequestId)
      this.recordResponse(lane, response)
      await options.onResponse?.(meta)
      signal.throwIfAborted()
      return response
    } catch (error: unknown) {
      // Hook/cancellation failures must not orphan an undispatched response body.
      void response.body?.cancel(error).catch(() => undefined)
      throw error
    }
  }

  /** Own one logical deadline/proxy scope; each HTTP attempt acquires its own slot. */
  async run<T>(
    options: OpenAICodexBackendRunOptions,
    operation: (context: OpenAICodexBackendRunContext) => Promise<T>,
  ): Promise<T> {
    const scope = new AbortController()
    const parent = this.combinedSignal(options.signal)
    const signal = AbortSignal.any([parent, scope.signal])
    let timer: ReturnType<typeof setTimeout> | undefined
    if (options.timeoutMs !== undefined) {
      if (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs <= 0 || options.timeoutMs > 2_147_483_647) {
        throw new TypeError('timeoutMs must be a positive timer-safe integer')
      }
      timer = setTimeout(() => scope.abort(new DOMException('Backend request deadline exceeded', 'TimeoutError')), options.timeoutMs)
    }
    try {
      signal.throwIfAborted()
      const execute = () => operation({
        signal,
        fetch: (input, init, fetchOptions) => {
          const nested = init?.signal ?? (input instanceof Request ? input.signal : undefined)
          const fetchSignal = nested == null || nested === signal ? signal : AbortSignal.any([signal, nested])
          return this.wrapFetch({ lane: options.lane, ...fetchOptions })(input, { ...init, signal: fetchSignal })
        },
      })
      const result = await (this.proxyManager?.run(this.resolveProxyUrl(), execute) ?? execute())
      signal.throwIfAborted()
      return result
    } catch (error: unknown) {
      if (signal.aborted) throw abortError(signal)
      throw error
    } finally {
      clearTimeout(timer)
      // Consumers parse inside this scope. Discarded/partially-read bodies cannot outlive it.
      scope.abort(new DOMException('Backend request scope finished', 'AbortError'))
    }
  }

  /** Wrap provider-owned fetch while preserving provider identity and stream proxy lifetime. */
  wrapFetch(options: OpenAICodexBackendFetchOptions): BackendFetch {
    return async (input, init) => {
      const prepared = prepareOpenAICodexBackendRequest(input, init)
      const signal = this.combinedSignal(prepared.init.signal ?? undefined)
      let release = await this.admit(options.lane, signal)
      // Recheck in this continuation too: another response can arrive after admission resolves.
      while (Date.now() < (this.cooldowns.get(options.lane) ?? 0)) {
        release()
        release = await this.admit(options.lane, signal)
      }
      try {
        const response = await this.fetchAttempt(options.lane, signal, prepared.input, prepared.init, options)
        return wrapResponseLifecycle(response, release, signal)
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
