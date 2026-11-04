/** Shared, identity-bound Codex quota state for one plugin instance. */
import { createHash } from 'node:crypto'
import { readOpenAICodexRequestAuth } from './auth.ts'
import { OpenAICodexRequestAuthError } from './auth-error.ts'
import type { OpenAICodexProxyManager } from './provider-proxy.ts'
import type { OpenAICodexBackendRequests } from './backend-request.ts'
import type { OpenAICodexCredentialStore } from './store.ts'
import { OpenAICodexReauthRequiredError, OpenAICodexUsageHttpError, parseOpenAICodexUsage, readOpenAICodexUsageResponse, type OpenAICodexUsage } from './usage.ts'

/** Account-bound ordinary quota observation from one response. */
export interface OpenAICodexQuotaSnapshot {
  usage: OpenAICodexUsage
  /** Local successful-response observation time, in Unix milliseconds; cache hits preserve it. */
  fetchedAt: number
  authoritySignal: AbortSignal
}

interface Entry {
  /** Revokes observations from this exact snapshot without invalidating other accounts. */
  authority?: AbortController
  snapshot?: OpenAICodexQuotaSnapshot
  error?: Error
  pending?: Promise<OpenAICodexQuotaSnapshot>
  fetchedAt: number
  refreshAt: number
  failures: number
}

function abortable<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (signal === undefined) return promise
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new DOMException('The operation was aborted', 'AbortError'))
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort))
    if (signal.aborted) onAbort()
  })
}

function safeFailure(error: unknown): Error {
  if (error instanceof OpenAICodexReauthRequiredError || error instanceof OpenAICodexUsageHttpError) return error
  if (error instanceof OpenAICodexRequestAuthError) {
    return error.code === 'REAUTH_REQUIRED' ? new OpenAICodexReauthRequiredError() : error
  }
  if (error instanceof Error && /^OpenAI Codex usage request failed with HTTP [1-5][0-9]{2}$/u.test(error.message)) return new Error(error.message)
  return new Error('OpenAI Codex quota is temporarily unavailable')
}

function failureDelay(error: Error, failures: number): number {
  if (error instanceof OpenAICodexReauthRequiredError) return Infinity
  if (error instanceof OpenAICodexUsageHttpError && error.status >= 400 && error.status < 500
    && error.status !== 408 && error.status !== 429) return Infinity
  const backoff = Math.min(15 * 60_000, 60_000 * 2 ** Math.min(failures - 1, 4))
  const jittered = Math.min(15 * 60_000, backoff + Math.floor(Math.random() * backoff * 0.1))
  return Math.max(jittered, error instanceof OpenAICodexUsageHttpError ? error.retryAfterMs ?? 0 : 0)
}

/** Owns ordinary quota caching, request coalescing and bounded failure cooldowns. No background polling. */
export class OpenAICodexQuotaState {
  private readonly cache = new Map<string, Entry>()
  private readonly operations = new Set<Promise<OpenAICodexQuotaSnapshot>>()
  private epoch = new AbortController()
  private configuration: string | undefined
  private disposed = false
  private disposal: Promise<void> | undefined

  constructor(private readonly options: {
    credentials: OpenAICodexCredentialStore
    proxyManager: OpenAICodexProxyManager
    resolveProxyUrl: () => string | undefined
    backendRequests?: OpenAICodexBackendRequests | undefined
  }) {}

  /** Revoke cached authority and abort operations belonging to the old configuration. */
  invalidate(): void {
    this.epoch.abort()
    this.epoch = new AbortController()
    this.cache.clear()
  }

  /** Read a fresh snapshot, coalescing GETs without tying shared work to one caller. */
  read(snapshot?: Pick<OpenAICodexCredentialStore, 'captureActiveAccount'>, signal?: AbortSignal): Promise<OpenAICodexQuotaSnapshot> {
    return this.readSnapshot(snapshot, signal)
  }

  private readSnapshot(snapshot: Pick<OpenAICodexCredentialStore, 'captureActiveAccount'> | undefined, signal: AbortSignal | undefined): Promise<OpenAICodexQuotaSnapshot> {
    if (this.disposed) return Promise.reject(new Error('OpenAI Codex quota state has been disposed'))
    if (signal?.aborted) return Promise.reject(new DOMException('The operation was aborted', 'AbortError'))
    const proxy = this.options.resolveProxyUrl()
    const configuration = JSON.stringify([proxy])
    if (this.configuration !== undefined && this.configuration !== configuration) this.invalidate()
    this.configuration = configuration
    const epoch = this.epoch.signal
    const operation = this.readInternal(snapshot ?? this.options.credentials, proxy, epoch).catch((error: unknown) => {
      epoch.throwIfAborted()
      throw safeFailure(error)
    })
    this.operations.add(operation)
    void operation.then(() => this.operations.delete(operation), () => this.operations.delete(operation))
    return abortable(operation, signal)
  }

  private async readInternal(credentials: Pick<OpenAICodexCredentialStore, 'captureActiveAccount'>,
    proxy: string | undefined, epoch: AbortSignal): Promise<OpenAICodexQuotaSnapshot> {
    const auth = await this.options.proxyManager.run(proxy, () => readOpenAICodexRequestAuth(credentials, epoch))
    epoch.throwIfAborted()
    const fetch = async (authoritySignal = epoch): Promise<OpenAICodexQuotaSnapshot> => {
      const value = this.options.backendRequests === undefined
        ? await this.options.proxyManager.run(proxy, () => readOpenAICodexUsageResponse(auth, authoritySignal))
        : await this.options.backendRequests.run(
            { lane: 'quota', signal: authoritySignal, timeoutMs: 15_000 },
            context => readOpenAICodexUsageResponse(auth, context.signal, context.fetch),
          )
      epoch.throwIfAborted()
      return { usage: parseOpenAICodexUsage(value), fetchedAt: Date.now(), authoritySignal }
    }
    // Renewed credentials do not inherit a rejected session's cooldown; keys never retain raw tokens.
    const key = JSON.stringify([auth.accountId, createHash('sha256').update(auth.access).digest('hex')])
    let entry = this.cache.get(key)
    if (entry === undefined) {
      if (this.cache.size >= 16) {
        const victim = [...this.cache].find(([, value]) => value.pending === undefined)
        if (victim === undefined) throw new Error('OpenAI Codex quota is temporarily unavailable')
        victim[1].authority?.abort()
        this.cache.delete(victim[0])
      }
      entry = { fetchedAt: 0, refreshAt: 0, failures: 0 }
      this.cache.set(key, entry)
    }
    if (entry.pending !== undefined) {
      const result = await entry.pending
      epoch.throwIfAborted()
      return result
    }
    if (Date.now() < entry.refreshAt) {
      if (entry.error !== undefined) throw entry.error
      if (entry.snapshot !== undefined) return entry.snapshot
    }
    const current = entry
    // A refresh (including a failed one) must not leave observations
    // usable by the previous snapshot. Other account entries stay isolated.
    current.authority?.abort()
    const authority = new AbortController()
    current.authority = authority
    const pending = fetch(AbortSignal.any([epoch, authority.signal])).then(result => {
      epoch.throwIfAborted()
      current.snapshot = result
      delete current.error
      current.fetchedAt = result.fetchedAt
      current.failures = 0
      current.refreshAt = current.fetchedAt + 60_000
      return result
    }, (error: unknown) => {
      epoch.throwIfAborted()
      delete current.snapshot
      current.error = safeFailure(error)
      current.failures += 1
      current.refreshAt = Date.now() + failureDelay(current.error, current.failures)
      throw current.error
    }).finally(() => { delete current.pending })
    current.pending = pending
    return pending
  }

  /** Revoke observations and await auth and transport cleanup. */
  dispose(): Promise<void> {
    if (this.disposal !== undefined) return this.disposal
    this.disposed = true
    this.invalidate()
    this.disposal = Promise.allSettled([...this.operations]).then(() => undefined)
    return this.disposal
  }
}
