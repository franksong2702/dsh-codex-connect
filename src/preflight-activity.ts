/** Authorized bili activity over public provider callbacks, with no Host API patch. */
import { AsyncLocalStorage } from 'node:async_hooks'
import type { SimpleStreamOptions } from '@earendil-works/pi-ai'
import { LlmError } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import { timeoutOf } from '@deepseek-ai/dsh-timeout'
import { isValidOpenAICodexProxyUrl, normalizeOpenAICodexProxyUrl } from './settings-contract.ts'
import { createPreflightWatchdog, OPENAI_CODEX_MAX_PREFLIGHT_MS, OPENAI_CODEX_STREAM_IDLE_TIMEOUT_MS,
  PREFLIGHT_IDLE_TIMEOUT, PREFLIGHT_TOTAL_TIMEOUT } from './preflight-watchdog.ts'
import type { PreflightWatchdog } from './preflight-watchdog.ts'
import { captureNativePreflightAuthority, isCurrentNativePreflightAuthority, isNativePreflightResponse } from './native-preflight.ts'

export { OPENAI_CODEX_STREAM_IDLE_TIMEOUT_MS } from './preflight-watchdog.ts'

/** Startup-only authorization for one acquired or installed native proxy route and finite total budget. */
export interface OpenAICodexPreflightConfig {
  protocol: 'bili-v1'
  trustedProxyOrigin: string
  maxDurationMs: number
}

interface Scope {
  controller: AbortController
  upstream: AbortSignal
  activated: ReturnType<typeof Promise.withResolvers<void>>
  demand?: ReturnType<typeof Promise.withResolvers<IteratorResult<StreamChunk>>>
  guarded?: Promise<IteratorResult<StreamChunk>> | undefined
  watchdog?: PreflightWatchdog
  providerSignal?: AbortSignal
  relay?: () => void
  generation: number
  stop?: () => void
  closed: boolean
}

const MAX_PREFLIGHT_FRAME_BYTES = 1024

/** Validate and freeze authorization; reserve room for the Host's finite inner safety timer. */
export function resolveOpenAICodexPreflightConfig(config: unknown): Readonly<OpenAICodexPreflightConfig> {
  if (typeof config !== 'object' || config === null || !('protocol' in config) || config.protocol !== 'bili-v1'
    || !('trustedProxyOrigin' in config) || typeof config.trustedProxyOrigin !== 'string') {
    throw new TypeError('preflightActivity requires protocol bili-v1 and a credential-free HTTP(S) trustedProxyOrigin')
  }
  const origin = normalizeOpenAICodexProxyUrl(config.trustedProxyOrigin)
  if (origin === undefined || !isValidOpenAICodexProxyUrl(origin)) {
    throw new TypeError('preflightActivity requires a credential-free HTTP(S) trustedProxyOrigin')
  }
  if (!('maxDurationMs' in config) || typeof config.maxDurationMs !== 'number'
    || !Number.isSafeInteger(config.maxDurationMs) || config.maxDurationMs <= 0 || config.maxDurationMs > OPENAI_CODEX_MAX_PREFLIGHT_MS) {
    throw new TypeError(`preflightActivity.maxDurationMs must be a positive integer no greater than ${OPENAI_CODEX_MAX_PREFLIGHT_MS}`)
  }
  return Object.freeze({ protocol: 'bili-v1', trustedProxyOrigin: origin, maxDurationMs: config.maxDurationMs })
}

class PreflightFrames {
  private line = ''
  private frame = ''
  private size = 0
  private previousCR = false
  private stopped = false

  constructor(private readonly preflight: PreflightWatchdog['preflight'], private readonly live: () => boolean) {}

  stop(): void {
    this.stopped = true
    this.line = ''; this.frame = ''
  }

  feed(chunk: Uint8Array): void {
    for (const byte of chunk) {
      if (this.stopped || !this.live()) { this.stop(); return }
      if (byte === 10 && this.previousCR) { this.previousCR = false; continue }
      this.previousCR = byte === 13
      if (byte === 10 || byte === 13) {
        if (this.line.startsWith('data:')) { this.stop(); return }
        if (this.line.length === 0) {
          if (this.frame === ': bili-preflight\n') this.preflight.pulse()
          this.frame = ''; this.size = 0
        } else this.frame += this.line + '\n'
        this.line = ''
      } else {
        if (++this.size > MAX_PREFLIGHT_FRAME_BYTES) { this.stop(); return }
        this.line += String.fromCharCode(byte)
      }
    }
  }
}

function observePreflight(response: Response, frames: PreflightFrames): Response {
  const reader = response.body!.getReader()
  let finished = false
  let released = false
  let output: ReadableStreamDefaultController<Uint8Array>
  const release = (): void => { if (!released) { released = true; reader.releaseLock() } }
  const fail = (error: unknown): void => {
    if (finished) return
    finished = true
    frames.stop()
    output.error(error)
    void reader.cancel(error).catch(() => undefined).finally(release)
  }
  const body = new ReadableStream<Uint8Array>({
    start(controller) { output = controller },
    async pull(controller) {
      try {
        const result = await reader.read()
        if (finished) return
        if (result.done) { finished = true; frames.stop(); release(); controller.close(); return }
        frames.feed(result.value)
        controller.enqueue(result.value)
      } catch (error: unknown) { fail(error) }
    },
    async cancel(reason: unknown) {
      if (finished) return
      finished = true
      frames.stop()
      try { await reader.cancel(reason) } finally { release() }
    },
  }, { highWaterMark: 0 })
  void reader.closed.catch(fail)
  const wrapped = new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers })
  for (const key of ['url', 'redirected', 'type'] as const) Object.defineProperty(wrapped, key, { value: response[key] })
  return wrapped
}

/** Allocate timing and authority per iterator, never per account, session or prepared call. */
export class OpenAICodexPreflightActivity {
  readonly config: Readonly<OpenAICodexPreflightConfig>
  readonly hostIdleTimeoutMs: number
  private readonly scopes = new AsyncLocalStorage<Scope>()

  constructor(config: OpenAICodexPreflightConfig) {
    this.config = resolveOpenAICodexPreflightConfig(config)
    this.hostIdleTimeoutMs = OPENAI_CODEX_STREAM_IDLE_TIMEOUT_MS + this.config.maxDurationMs
  }

  /** Activate after Host context preparation, at the existing explicit-key provider callback. */
  activate(signal: AbortSignal): void {
    const scope = this.scopes.getStore()
    if (scope === undefined) return
    if (scope.closed || scope.demand === undefined) throw new LlmError('Codex preflight iterator is no longer active', 'ABORTED')
    if (scope.watchdog !== undefined) {
      if (scope.providerSignal !== signal) throw new LlmError('Codex preflight provider signal changed', 'UNSUPPORTED_OPTION')
      return
    }
    const watchdog = createPreflightWatchdog(scope.upstream)
    scope.watchdog = watchdog
    scope.providerSignal = signal
    scope.relay = () => { scope.controller.abort(watchdog.signal.reason) }
    watchdog.signal.addEventListener('abort', scope.relay, { once: true })
    scope.guarded = watchdog.next({ next: () => scope.demand!.promise })
    scope.activated.resolve()
  }

  /** Own classified expiry outside wrappers that may await an uncooperative underlying return. */
  async *stream(delegate: (options: GenerateOptions) => AsyncIterable<StreamChunk>, options: GenerateOptions): AsyncIterable<StreamChunk> {
    const controller = new AbortController()
    const upstream = options.signal === undefined ? controller.signal : AbortSignal.any([options.signal, controller.signal])
    const scope: Scope = { controller, upstream, activated: Promise.withResolvers<void>(), generation: 0, closed: false }
    const iterator = this.scopes.run(scope, () => delegate({ ...options, signal: upstream })[Symbol.asyncIterator]())
    let exhausted = false
    try {
      while (true) {
        const demand = Promise.withResolvers<IteratorResult<StreamChunk>>()
        scope.demand = demand
        scope.guarded = scope.watchdog?.next({ next: () => demand.promise })
        void this.scopes.run(scope, () => iterator.next()).then(demand.resolve, demand.reject)
        if (scope.guarded === undefined) await Promise.race([demand.promise, scope.activated.promise])
        const result = await (scope.guarded ?? demand.promise)
        if (result.done) { exhausted = true; return }
        yield result.value
      }
    } catch (error: unknown) {
      const signal = scope.watchdog?.signal
      if (signal !== undefined) {
        const total = timeoutOf(signal, PREFLIGHT_TOTAL_TIMEOUT)
        if (total !== undefined) throw new LlmError(`Codex preflight timeout after ${total.timeoutMs}ms`, 'TIMEOUT', { cause: error })
        if (timeoutOf(signal, PREFLIGHT_IDLE_TIMEOUT) !== undefined) {
          throw new LlmError(`Codex stream idle timeout after ${OPENAI_CODEX_STREAM_IDLE_TIMEOUT_MS}ms`, 'TIMEOUT', { cause: error })
        }
        if (options.signal?.aborted) throw new LlmError('Codex request aborted by caller', 'ABORTED', { cause: error })
      }
      throw error
    } finally {
      scope.closed = true
      scope.stop?.()
      if (scope.relay !== undefined) scope.watchdog!.signal.removeEventListener('abort', scope.relay)
      scope.watchdog?.[Symbol.dispose]()
      controller.abort('Codex preflight consumer stopped')
      if (!exhausted) {
        // Cancellation owns the outcome; an abandoned iterator may never settle its queued return.
        const drain = this.scopes.run(scope, () => iterator.return?.())
        void drain?.catch(() => undefined)
      }
    }
  }

  /** Observe only an explicitly authorized acquired/native route, preserving SDK bytes and request policy. */
  wrap(options: SimpleStreamOptions | undefined, actualProxyOrigin: string | undefined): SimpleStreamOptions {
    const scope = this.scopes.getStore()
    const signal = options?.signal
    if (scope === undefined || scope.closed || scope.watchdog === undefined || signal === undefined || signal !== scope.providerSignal) {
      throw new LlmError('Codex preflight requires the request-scoped public provider callback', 'UNSUPPORTED_OPTION')
    }
    const config = this.config
    if (actualProxyOrigin !== undefined
      && normalizeOpenAICodexProxyUrl(actualProxyOrigin) !== config.trustedProxyOrigin) return options!
    const fetch = options?.fetch ?? globalThis.fetch
    const watchdog = scope.watchdog
    return { ...options, fetch: async (input, init) => {
      const generation = ++scope.generation
      scope.stop?.()
      const authority = actualProxyOrigin === undefined ? captureNativePreflightAuthority() : undefined
      const response = await fetch(input, init)
      // Public adapter fetch hooks (diagnostics/governor) wrap the installed chain;
      // their function identity is not the native route's authority.
      if (actualProxyOrigin === undefined && (authority?.origin !== config.trustedProxyOrigin
        || !isNativePreflightResponse(authority, response, input))) return response
      const mediaType = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase()
      if (scope.closed || signal.aborted || generation !== scope.generation || !response.ok || response.body === null
        || mediaType !== 'text/event-stream' || response.headers.get('x-bili-preflight') !== 'compressing'
        || !watchdog.preflight.begin(config.maxDurationMs)) return response
      // Early headers count once, but only exact subsequent frames renew idle time.
      watchdog.preflight.pulse()
      const frames = new PreflightFrames(watchdog.preflight, () => !scope.closed && !signal.aborted
        && generation === scope.generation && (actualProxyOrigin !== undefined
          || authority !== undefined && isCurrentNativePreflightAuthority(authority)))
      scope.stop = () => { frames.stop() }
      return observePreflight(response, frames)
    } }
  }
}
