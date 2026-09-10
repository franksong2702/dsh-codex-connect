/** Shared, identity-bound Codex quota state for one plugin instance. */
import { readOpenAICodexRequestAuth } from './auth.ts'
import { OpenAICodexRequestAuthError } from './auth-error.ts'
import type { OpenAICodexProxyManager } from './provider-proxy.ts'
import { parseReserveUsage, reserveIdentity, type ReserveIdentity, type ReserveUsageDecision } from './reserve-usage.ts'
import type { OpenAICodexCredentialStore } from './store.ts'
import { OpenAICodexReauthRequiredError, parseOpenAICodexUsage, readOpenAICodexUsageResponse, type OpenAICodexUsage } from './usage.ts'

/** Public usage and private routing authority from the same response. */
export interface OpenAICodexQuotaSnapshot {
  usage: OpenAICodexUsage
  identity?: ReserveIdentity
  decision: ReserveUsageDecision
  authoritySignal: AbortSignal
}

interface Entry {
  snapshot?: OpenAICodexQuotaSnapshot
  error?: Error
  pending?: Promise<OpenAICodexQuotaSnapshot>
  fetchedAt: number
  refreshAt: number
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
  if (error instanceof OpenAICodexReauthRequiredError) return error
  if (error instanceof OpenAICodexRequestAuthError) {
    return error.code === 'REAUTH_REQUIRED' ? new OpenAICodexReauthRequiredError() : error
  }
  if (error instanceof Error && /^OpenAI Codex usage request failed with HTTP [1-5][0-9]{2}$/u.test(error.message)) return new Error(error.message)
  return new Error('OpenAI Codex quota is temporarily unavailable')
}

function refreshDeadline(snapshot: OpenAICodexQuotaSnapshot, model: string | undefined, fetchedAt: number): number {
  const windows = snapshot.usage.rateLimits.filter(limit => limit.id === 'codex' || (model !== undefined && limit.name === model)
    || ((snapshot.decision.kind === 'reserve' || snapshot.decision.kind === 'exhausted') && limit.name === 'gpt-reserve'))
    .flatMap(limit => limit.windows)
  const highest = Math.max(0, ...windows.map(window => 100 - window.remainingPercent))
  const interval = highest >= 99 ? 5_000 : highest >= 90 ? 15_000 : highest >= 75 ? 30_000 : 60_000
  const resets = windows.flatMap(window => window.resetAt !== undefined && window.resetAt * 1_000 > fetchedAt ? [window.resetAt * 1_000 + 1_000] : [])
  return Math.max(fetchedAt + 1_000, Math.min(fetchedAt + interval, ...resets))
}

/** Owns quota cache, Reserve negotiation, and lazy adaptive background refresh. */
export class OpenAICodexQuotaState {
  private readonly cache = new Map<string, Entry>()
  private readonly operations = new Set<Promise<OpenAICodexQuotaSnapshot>>()
  private epoch = new AbortController()
  private configuration: string | undefined
  private timer: ReturnType<typeof setTimeout> | undefined
  private timerAt = Infinity
  private model: string | undefined
  private disposed = false
  private disposal: Promise<void> | undefined

  constructor(private readonly options: {
    credentials: OpenAICodexCredentialStore
    proxyManager: OpenAICodexProxyManager
    resolveProxyUrl: () => string | undefined
    enabled: () => boolean
  }) {}

  /** Revoke cached authority and abort operations belonging to the old configuration. */
  invalidate(): void {
    this.epoch.abort()
    this.epoch = new AbortController()
    this.cache.clear()
    if (this.timer !== undefined) clearTimeout(this.timer)
    this.timer = undefined
    this.timerAt = Infinity
  }

  private schedule(at: number): void {
    if (this.disposed || !this.options.enabled() || this.timerAt <= at) return
    if (this.timer !== undefined) clearTimeout(this.timer)
    this.timerAt = at
    this.timer = setTimeout(() => {
      this.timer = undefined
      this.timerAt = Infinity
      void this.read(undefined, undefined, this.model).catch(() => undefined)
    }, Math.max(0, at - Date.now()))
    this.timer.unref?.()
  }

  /** Read a fresh snapshot, coalescing GETs without tying shared work to one caller. */
  read(snapshot?: Pick<OpenAICodexCredentialStore, 'captureActiveAccount'>, signal?: AbortSignal, model?: string): Promise<OpenAICodexQuotaSnapshot> {
    if (this.disposed) return Promise.reject(new Error('OpenAI Codex quota state has been disposed'))
    if (signal?.aborted) return Promise.reject(new DOMException('The operation was aborted', 'AbortError'))
    const enabled = this.options.enabled()
    const proxy = this.options.resolveProxyUrl()
    const configuration = JSON.stringify([enabled, proxy])
    if (this.configuration !== undefined && this.configuration !== configuration) this.invalidate()
    this.configuration = configuration
    if (model !== undefined) this.model = model
    const epoch = this.epoch.signal
    const operation = this.readInternal(snapshot ?? this.options.credentials, enabled, proxy, epoch, model).catch((error: unknown) => {
      epoch.throwIfAborted()
      throw safeFailure(error)
    })
    this.operations.add(operation)
    void operation.then(() => this.operations.delete(operation), () => this.operations.delete(operation))
    return abortable(operation, signal)
  }

  private async readInternal(credentials: Pick<OpenAICodexCredentialStore, 'captureActiveAccount'>, enabled: boolean,
    proxy: string | undefined, epoch: AbortSignal, model: string | undefined): Promise<OpenAICodexQuotaSnapshot> {
    const auth = await this.options.proxyManager.run(proxy, () => readOpenAICodexRequestAuth(credentials, epoch))
    epoch.throwIfAborted()
    const candidate = enabled ? reserveIdentity(auth.access) : undefined
    const identity = candidate?.accountId === auth.accountId ? candidate : undefined
    const fetch = async (): Promise<OpenAICodexQuotaSnapshot> => {
      const value = await this.options.proxyManager.run(proxy, () => readOpenAICodexUsageResponse(auth, epoch, enabled && identity !== undefined))
      epoch.throwIfAborted()
      return { usage: parseOpenAICodexUsage(value), ...(identity === undefined ? {} : { identity }),
        decision: identity === undefined ? { kind: 'unavailable' } : parseReserveUsage(value, identity), authoritySignal: epoch }
    }
    if (!enabled) return fetch()
    const key = JSON.stringify([auth.accountId, identity?.key])
    let entry = this.cache.get(key)
    if (entry === undefined) {
      if (this.cache.size >= 16) {
        const victim = [...this.cache].find(([, value]) => value.pending === undefined)
        if (victim === undefined) throw new Error('OpenAI Codex quota is temporarily unavailable')
        this.cache.delete(victim[0])
      }
      entry = { fetchedAt: 0, refreshAt: 0 }
      this.cache.set(key, entry)
    }
    if (entry.pending !== undefined) {
      const result = await entry.pending
      epoch.throwIfAborted()
      entry.refreshAt = Math.min(entry.refreshAt, refreshDeadline(result, model, entry.fetchedAt))
      this.schedule(entry.refreshAt)
      return result
    }
    if (entry.snapshot !== undefined) entry.refreshAt = Math.min(entry.refreshAt, refreshDeadline(entry.snapshot, model, entry.fetchedAt))
    if (Date.now() < entry.refreshAt) {
      this.schedule(entry.refreshAt)
      if (entry.error !== undefined) throw entry.error
      if (entry.snapshot !== undefined) return entry.snapshot
    }
    const current = entry
    const pending = fetch().then(result => {
      epoch.throwIfAborted()
      current.snapshot = result
      delete current.error
      current.fetchedAt = Date.now()
      current.refreshAt = refreshDeadline(result, model, current.fetchedAt)
      this.schedule(current.refreshAt)
      return result
    }, (error: unknown) => {
      epoch.throwIfAborted()
      delete current.snapshot
      current.error = safeFailure(error)
      current.refreshAt = Date.now() + 5_000
      this.schedule(current.refreshAt)
      throw current.error
    }).finally(() => { delete current.pending })
    current.pending = pending
    return pending
  }

  /** Stop polling, revoke authority, and await auth and transport cleanup. */
  dispose(): Promise<void> {
    if (this.disposal !== undefined) return this.disposal
    this.disposed = true
    this.invalidate()
    this.disposal = Promise.allSettled([...this.operations]).then(() => undefined)
    return this.disposal
  }
}
