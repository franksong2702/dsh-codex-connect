/** Shared, in-memory OAuth UI state. No token or browser storage is used here. */
import type { OpenAICodexUsage } from '../usage.ts'
import {
  OPENAI_CODEX_AUTH_ACCOUNTS_PATH,
  OPENAI_CODEX_AUTH_CANCEL_PATH,
  OPENAI_CODEX_AUTH_LOGIN_PATH,
  OPENAI_CODEX_AUTH_LOGOUT_PATH,
  OPENAI_CODEX_AUTH_STATUS_PATH,
} from '../auth-paths.ts'

export interface AccountSummary {
  accountKey: string
  active: boolean
  displayName: string
  maskedEmail?: string
  profileSource: 'oauth' | 'generated'
}

export type AccountOperation =
  | { kind: 'idle' }
  | { kind: 'starting-authorization' }
  | { kind: 'waiting-authorization' }
  | { kind: 'cancelling-authorization' }
  | { kind: 'activating'; accountKey: string }
  | { kind: 'removing'; accountKey: string }
  | { kind: 'signing-out' }

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
  accounts: readonly AccountSummary[]
  operation: AccountOperation
  loginUrl?: string
  operationError?: string
}

class AccountRequestError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseUsage(value: unknown): OpenAICodexUsage {
  if (!isRecord(value) || !Array.isArray(value['rateLimits'])) throw new AccountRequestError('Invalid account response')
  const rateLimits = value['rateLimits'].map((candidate) => {
    if (!isRecord(candidate)
      || typeof candidate['id'] !== 'string'
      || candidate['id'].length === 0
      || candidate['id'].length > 128
      || (candidate['name'] !== undefined && (typeof candidate['name'] !== 'string' || candidate['name'].length > 128))
      || !Array.isArray(candidate['windows'])) throw new AccountRequestError('Invalid account response')
    const windows = candidate['windows'].map((window) => {
      if (!isRecord(window)
        || typeof window['remainingPercent'] !== 'number'
        || !Number.isFinite(window['remainingPercent'])
        || window['remainingPercent'] < 0
        || window['remainingPercent'] > 100
        || typeof window['windowSeconds'] !== 'number'
        || !Number.isSafeInteger(window['windowSeconds'])
        || window['windowSeconds'] <= 0
        || (window['resetAt'] !== undefined
          && (typeof window['resetAt'] !== 'number' || !Number.isSafeInteger(window['resetAt']) || window['resetAt'] <= 0))) {
        throw new AccountRequestError('Invalid account response')
      }
      return {
        remainingPercent: window['remainingPercent'],
        windowSeconds: window['windowSeconds'],
        ...(typeof window['resetAt'] === 'number' ? { resetAt: window['resetAt'] } : {}),
      }
    })
    return {
      id: candidate['id'],
      ...(typeof candidate['name'] === 'string' ? { name: candidate['name'] } : {}),
      windows,
    }
  })
  const credits = value['credits']
  if (credits !== undefined && (!isRecord(credits)
    || typeof credits['unlimited'] !== 'boolean'
    || (credits['balance'] !== undefined && typeof credits['balance'] !== 'string'))) {
    throw new AccountRequestError('Invalid account response')
  }
  const individual = value['individualLimit']
  if (individual !== undefined && (!isRecord(individual)
    || typeof individual['limit'] !== 'string'
    || typeof individual['used'] !== 'string'
    || typeof individual['remaining'] !== 'string'
    || typeof individual['remainingPercent'] !== 'number'
    || !Number.isFinite(individual['remainingPercent'])
    || individual['remainingPercent'] < 0
    || individual['remainingPercent'] > 100)) {
    throw new AccountRequestError('Invalid account response')
  }
  return {
    rateLimits,
    ...(isRecord(credits) ? { credits: {
      unlimited: credits['unlimited'] as boolean,
      ...(typeof credits['balance'] === 'string' ? { balance: credits['balance'] } : {}),
    } } : {}),
    ...(isRecord(individual) ? { individualLimit: {
      limit: individual['limit'] as string,
      used: individual['used'] as string,
      remaining: individual['remaining'] as string,
      remainingPercent: individual['remainingPercent'] as number,
    } } : {}),
  }
}

function parseStatus(value: unknown): AccountStatus {
  if (!isRecord(value) || typeof value['status'] !== 'string') throw new AccountRequestError('Invalid account response')
  if (value['status'] === 'signed-out' || value['status'] === 'signing-in') return { status: value['status'] }
  if (value['status'] === 'signed-in') {
    if (value['quotaError'] !== undefined && typeof value['quotaError'] !== 'string') throw new AccountRequestError('Invalid account response')
    return {
      status: 'signed-in',
      usage: parseUsage(value['usage']),
      ...(typeof value['quotaError'] === 'string' ? { quotaError: value['quotaError'] } : {}),
    }
  }
  if (value['status'] === 'reauth-required' || value['status'] === 'error') {
    if (typeof value['message'] !== 'string') throw new AccountRequestError('Invalid account response')
    return { status: value['status'], message: value['message'] }
  }
  throw new AccountRequestError('Invalid account response')
}

function parseAccounts(value: unknown): readonly AccountSummary[] {
  if (!isRecord(value) || !Array.isArray(value['accounts'])) throw new AccountRequestError('Invalid account response')
  if (value['accounts'].length > 16) throw new AccountRequestError('Invalid account response')
  const accounts = value['accounts'].map((candidate): AccountSummary => {
    if (!isRecord(candidate)
      || typeof candidate['accountKey'] !== 'string'
      || !/^acct_[A-Za-z0-9_-]{43}$/u.test(candidate['accountKey'])
      || typeof candidate['active'] !== 'boolean'
      || typeof candidate['displayName'] !== 'string'
      || candidate['displayName'].length === 0
      || candidate['displayName'].length > 128
      || (candidate['maskedEmail'] !== undefined && typeof candidate['maskedEmail'] !== 'string')
      || (typeof candidate['maskedEmail'] === 'string' && candidate['maskedEmail'].length > 320)
      || (candidate['profileSource'] !== 'oauth' && candidate['profileSource'] !== 'generated')) {
      throw new AccountRequestError('Invalid account response')
    }
    return {
      accountKey: candidate['accountKey'],
      active: candidate['active'],
      displayName: candidate['displayName'],
      ...(typeof candidate['maskedEmail'] === 'string' ? { maskedEmail: candidate['maskedEmail'] } : {}),
      profileSource: candidate['profileSource'],
    }
  })
  if (new Set(accounts.map(account => account.accountKey)).size !== accounts.length
    || accounts.filter(account => account.active).length !== (accounts.length === 0 ? 0 : 1)) {
    throw new AccountRequestError('Invalid account response')
  }
  return accounts
}

function parseChallenge(value: unknown): { url: string } {
  if (!isRecord(value) || typeof value['url'] !== 'string') throw new AccountRequestError('Invalid account response')
  let url: URL
  try { url = new URL(value['url']) } catch { throw new AccountRequestError('Invalid account response') }
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '') throw new AccountRequestError('Invalid account response')
  return { url: url.href }
}

async function request(path: string, method = 'GET', signal?: AbortSignal, body?: unknown): Promise<unknown> {
  const response = await fetch(path, {
    method,
    headers: { accept: 'application/json', ...body === undefined ? {} : { 'content-type': 'application/json' } },
    credentials: 'same-origin',
    ...signal === undefined ? {} : { signal },
    ...body === undefined ? {} : { body: JSON.stringify(body) },
  })
  const value: unknown = await response.json().catch(() => undefined)
  if (!response.ok) {
    const message = typeof value === 'object' && value !== null && 'error' in value && typeof value.error === 'string'
      ? value.error : `HTTP ${response.status}`
    throw new AccountRequestError(message)
  }
  return value
}

/** One account state per browser-plugin instance; subscribers share requests and timers. */
export class OpenAICodexAccountStore {
  private snapshot: AccountSnapshot = {
    status: { status: 'loading' }, busy: false, accounts: [], operation: { kind: 'idle' },
  }
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

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Account request failed'
  }

  private stopPolling(): void {
    clearTimeout(this.timer)
    this.timer = undefined
    this.controller?.abort()
    this.controller = undefined
  }

  private schedule(): void {
    clearTimeout(this.timer)
    const interval = this.snapshot.operation.kind === 'waiting-authorization' || this.snapshot.status.status === 'signing-in' ? 1_000
      : this.snapshot.operationError !== undefined && this.snapshot.accounts.length > 0 ? 5_000
        : this.snapshot.status.status === 'signed-in' ? 60_000
          : this.snapshot.status.status === 'error' && this.snapshot.accounts.length > 0 ? 5_000 : undefined
    if (!this.disposed && this.listeners.size > 0 && interval !== undefined) {
      this.timer = setTimeout(() => { void this.refresh() }, interval)
    }
  }

  private async readServerState(signal?: AbortSignal): Promise<{ status: AccountStatus; accounts: readonly AccountSummary[] }> {
    const response = await request(OPENAI_CODEX_AUTH_STATUS_PATH, 'GET', signal)
    return { status: parseStatus(response), accounts: parseAccounts(response) }
  }

  private stableStatus(status: AccountStatus, accounts: readonly AccountSummary[]): AccountStatus {
    if (status.status !== 'signing-in' || accounts.length === 0) return status
    return this.snapshot.status.status === 'signed-in' || this.snapshot.status.status === 'reauth-required'
      ? this.snapshot.status
      : status
  }

  /** Refresh only while observed, without overlapping status reads or OAuth mutations. */
  async refresh(): Promise<void> {
    if (this.disposed || this.snapshot.busy || this.controller !== undefined || this.listeners.size === 0) return
    const controller = new AbortController()
    this.controller = controller
    try {
      const server = await this.readServerState(controller.signal)
      if (!controller.signal.aborted) this.publish({
        status: this.stableStatus(server.status, server.accounts),
        accounts: server.accounts,
        busy: false,
        operation: server.status.status === 'signing-in' ? { kind: 'waiting-authorization' } : { kind: 'idle' },
        ...server.status.status === 'signing-in' && this.snapshot.loginUrl !== undefined ? { loginUrl: this.snapshot.loginUrl } : {},
      })
    } catch (error: unknown) {
      if (!controller.signal.aborted) this.publish({
        status: this.failure(error), busy: false, accounts: this.snapshot.accounts, operation: { kind: 'idle' },
      })
    } finally {
      if (this.controller === controller) {
        this.controller = undefined
        this.schedule()
      }
    }
  }

  /** Start or reopen the server-owned authorization from a user click, retaining popup permission. */
  async signIn(): Promise<void> {
    if (this.disposed || this.snapshot.busy) return
    this.stopPolling()
    const popup = window.open('about:blank', '_blank')
    this.popup = popup
    if (popup !== null) popup.opener = null
    const retained = this.snapshot.status.status === 'signed-in' || this.snapshot.status.status === 'reauth-required'
      ? this.snapshot.status : { status: 'signing-in' } as const
    this.publish({ status: retained, busy: true, accounts: this.snapshot.accounts, operation: { kind: 'starting-authorization' } })
    try {
      const challenge = parseChallenge(await request(OPENAI_CODEX_AUTH_LOGIN_PATH, 'POST'))
      if (this.disposed) { popup?.close(); return }
      if (popup !== null) popup.location.replace(challenge.url)
      this.publish({
        status: retained, busy: false, accounts: this.snapshot.accounts,
        operation: { kind: 'waiting-authorization' }, loginUrl: challenge.url,
      })
    } catch (error: unknown) {
      popup?.close()
      this.publish(this.snapshot.accounts.length === 0
        ? { status: this.failure(error), busy: false, accounts: [], operation: { kind: 'idle' } }
        : { status: retained, busy: false, accounts: this.snapshot.accounts, operation: { kind: 'idle' }, operationError: this.errorMessage(error) })
      if (error instanceof AccountRequestError && error.message === 'OpenAI Codex sign-in cancelled') {
        // Another browser can cancel the shared server operation while this login request is pending.
        await this.refresh()
      }
    } finally {
      if (this.popup === popup) this.popup = null
      this.schedule()
    }
  }

  /** Cancel only the pending authorization, preserving an already signed-in account. */
  async cancel(): Promise<void> {
    if (this.disposed || this.snapshot.busy) return
    this.stopPolling()
    this.publish({ ...this.snapshot, busy: true, operation: { kind: 'cancelling-authorization' } })
    try {
      const status = parseStatus(await request(OPENAI_CODEX_AUTH_CANCEL_PATH, 'POST'))
      this.publish({ status, busy: false, accounts: this.snapshot.accounts, operation: { kind: 'idle' } })
    } catch (error: unknown) {
      this.publish(this.snapshot.accounts.length === 0
        ? { status: this.failure(error), busy: false, accounts: [], operation: { kind: 'idle' } }
        : { status: this.snapshot.status, busy: false, accounts: this.snapshot.accounts, operation: { kind: 'idle' }, operationError: this.errorMessage(error) })
    } finally {
      this.schedule()
    }
  }

  /** Sign out once for all mounted account views and invalidate older status reads. */
  async signOut(): Promise<void> {
    if (this.disposed || this.snapshot.busy) return
    this.stopPolling()
    this.publish({ ...this.snapshot, busy: true, operation: { kind: 'signing-out' } })
    try {
      await request(OPENAI_CODEX_AUTH_LOGOUT_PATH, 'POST')
      this.publish({ status: { status: 'signed-out' }, busy: false, accounts: [], operation: { kind: 'idle' } })
    } catch (error: unknown) {
      this.publish({
        status: this.snapshot.status, busy: false, accounts: this.snapshot.accounts,
        operation: { kind: 'idle' }, operationError: this.errorMessage(error),
      })
    }
  }

  /** Select one stored account and refresh account-specific status and quota. */
  async activate(accountKey: string): Promise<void> {
    if (this.disposed || this.snapshot.busy || this.snapshot.accounts.some(account => account.accountKey === accountKey && account.active)) return
    await this.mutateAccount('activating', accountKey, 'POST', { accountKey })
  }

  /** Remove one stored account, naming the replacement when the active account is removed. */
  async remove(accountKey: string, replacementAccountKey?: string): Promise<void> {
    if (this.disposed || this.snapshot.busy) return
    await this.mutateAccount('removing', accountKey, 'DELETE', {
      accountKey,
      ...(replacementAccountKey === undefined ? {} : { replacementAccountKey }),
    })
  }

  private async mutateAccount(
    kind: 'activating' | 'removing',
    accountKey: string,
    method: 'POST' | 'DELETE',
    body: unknown,
  ): Promise<void> {
    this.stopPolling()
    this.publish({ ...this.snapshot, busy: true, operation: { kind, accountKey } })
    try {
      const status = parseStatus(await request(OPENAI_CODEX_AUTH_ACCOUNTS_PATH, method, undefined, body))
      const accounts = parseAccounts(await request(OPENAI_CODEX_AUTH_ACCOUNTS_PATH))
      this.publish({ status, accounts, busy: false, operation: { kind: 'idle' } })
    } catch (error: unknown) {
      this.publish({
        status: this.snapshot.status, accounts: this.snapshot.accounts, busy: false,
        operation: { kind: 'idle' }, operationError: this.errorMessage(error),
      })
    } finally {
      this.schedule()
    }
  }

  /** Stop local observation on plugin unload; do not log out the server account. */
  dispose(): void {
    this.disposed = true
    this.stopPolling()
    this.popup?.close()
    this.popup = null
    this.listeners.clear()
    this.snapshot = { status: { status: 'loading' }, busy: false, accounts: [], operation: { kind: 'idle' } }
  }
}
