/** Shared, in-memory OAuth UI state. No token or browser storage is used here. */
import type { OpenAICodexUsage } from '../usage.ts'
import { OPENAI_CODEX_AUTH_LOGIN_PATH, OPENAI_CODEX_AUTH_LOGOUT_PATH, OPENAI_CODEX_AUTH_STATUS_PATH } from '../auth-paths.ts'

export type AccountStatus =
  | { status: 'loading' }
  | { status: 'signed-out' }
  | { status: 'signing-in' }
  | { status: 'reauth-required'; message: string }
  | { status: 'signed-in'; usage: OpenAICodexUsage; quotaError?: string }
  | { status: 'remote-web-origin-not-trusted' }
  | { status: 'error'; message: string }

export interface AccountSnapshot {
  status: AccountStatus
  busy: boolean
  loginUrl?: string
}

class AccountRequestError extends Error {}

async function request<T>(path: string, method = 'GET', signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, {
    method, headers: { accept: 'application/json' }, credentials: 'same-origin',
    ...signal === undefined ? {} : { signal },
  })
  const value: unknown = await response.json().catch(() => undefined)
  if (!response.ok) {
    const message = typeof value === 'object' && value !== null && 'error' in value && typeof value.error === 'string'
      ? value.error : `HTTP ${response.status}`
    throw new AccountRequestError(message)
  }
  return value as T
}

/** One account state per browser-plugin instance; subscribers share requests and timers. */
export class OpenAICodexAccountStore {
  private snapshot: AccountSnapshot = { status: { status: 'loading' }, busy: false }
  private readonly listeners = new Set<() => void>()
  private controller: AbortController | undefined
  private timer: ReturnType<typeof setTimeout> | undefined
  private disposed = false
  private popup: Window | null = null

  getSnapshot = (): AccountSnapshot => this.snapshot

  subscribe = (listener: () => void): (() => void) => {
    if (this.disposed) return () => {}
    this.listeners.add(listener)
    if (this.listeners.size === 1) void this.refresh()
    return () => {
      this.listeners.delete(listener)
      if (this.listeners.size === 0) this.stopPolling()
    }
  }

  private publish(snapshot: AccountSnapshot): void {
    if (this.disposed) return
    this.snapshot = snapshot
    for (const listener of this.listeners) listener()
  }

  private failure(error: unknown): AccountStatus {
    return error instanceof AccountRequestError && error.message === 'remote-web-origin-not-trusted'
      ? { status: 'remote-web-origin-not-trusted' }
      : { status: 'error', message: error instanceof Error ? error.message : 'Account request failed' }
  }

  private stopPolling(): void {
    clearTimeout(this.timer)
    this.timer = undefined
    this.controller?.abort()
    this.controller = undefined
  }

  private schedule(): void {
    clearTimeout(this.timer)
    const interval = this.snapshot.status.status === 'signing-in' ? 1_000
      : this.snapshot.status.status === 'signed-in' ? 60_000 : undefined
    if (!this.disposed && this.listeners.size > 0 && interval !== undefined) {
      this.timer = setTimeout(() => { void this.refresh() }, interval)
    }
  }

  /** Refresh only while observed, without overlapping status reads or OAuth mutations. */
  async refresh(): Promise<void> {
    if (this.disposed || this.snapshot.busy || this.controller !== undefined || this.listeners.size === 0) return
    const controller = new AbortController()
    this.controller = controller
    try {
      const status = await request<AccountStatus>(OPENAI_CODEX_AUTH_STATUS_PATH, 'GET', controller.signal)
      if (!controller.signal.aborted) this.publish({
        status, busy: false,
        ...status.status === 'signing-in' && this.snapshot.loginUrl !== undefined ? { loginUrl: this.snapshot.loginUrl } : {},
      })
    } catch (error: unknown) {
      if (!controller.signal.aborted) this.publish({ status: this.failure(error), busy: false })
    } finally {
      if (this.controller === controller) {
        this.controller = undefined
        this.schedule()
      }
    }
  }

  /** Called synchronously from a user click so popup permission is retained. */
  async signIn(): Promise<void> {
    if (this.disposed || this.snapshot.busy || this.snapshot.status.status === 'signing-in') return
    this.stopPolling()
    const popup = window.open('about:blank', '_blank')
    this.popup = popup
    if (popup !== null) popup.opener = null
    this.publish({ status: { status: 'signing-in' }, busy: true })
    try {
      const challenge = await request<{ url: string }>(OPENAI_CODEX_AUTH_LOGIN_PATH, 'POST')
      if (this.disposed) { popup?.close(); return }
      if (popup !== null) popup.location.replace(challenge.url)
      this.publish({ status: { status: 'signing-in' }, busy: false, ...popup === null ? { loginUrl: challenge.url } : {} })
    } catch (error: unknown) {
      popup?.close()
      this.publish({ status: this.failure(error), busy: false })
    } finally {
      this.popup = null
      this.schedule()
    }
  }

  /** Sign out once for all mounted account views and invalidate older status reads. */
  async signOut(): Promise<void> {
    if (this.disposed || this.snapshot.busy) return
    this.stopPolling()
    this.publish({ status: this.snapshot.status, busy: true })
    try {
      await request<{ ok: true }>(OPENAI_CODEX_AUTH_LOGOUT_PATH, 'POST')
      this.publish({ status: { status: 'signed-out' }, busy: false })
    } catch (error: unknown) {
      this.publish({ status: this.failure(error), busy: false })
    }
  }

  /** Stop local observation on plugin unload; do not log out the server account. */
  dispose(): void {
    this.disposed = true
    this.stopPolling()
    this.popup?.close()
    this.popup = null
    this.listeners.clear()
    this.snapshot = { status: { status: 'loading' }, busy: false }
  }
}
