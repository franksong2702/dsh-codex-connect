// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OpenAICodexAccountStore } from '../src/client/account-store.ts'
import { OpenAICodexModelsCard } from '../src/client/OpenAICodexModelsCard.tsx'
import { OpenAICodexSettings } from '../src/client/OpenAICodexSettings.tsx'
import { en, zh } from '../src/client/locales.ts'
import { OPENAI_CODEX_AUTH_ACCOUNTS_PATH, OPENAI_CODEX_AUTH_LOGIN_PATH, OPENAI_CODEX_AUTH_LOGOUT_PATH, OPENAI_CODEX_AUTH_STATUS_PATH } from '../src/auth-paths.ts'

const t = (key: keyof typeof en, params: Record<string, unknown> = {}) => Object.entries(params).reduce(
  (value, [name, replacement]) => value.replace(`{${name}}`, String(replacement)),
  en[key],
)
const ACCOUNT_KEY = `acct_${'a'.repeat(43)}`
const SECOND_ACCOUNT_KEY = `acct_${'b'.repeat(43)}`
const ACTIVE_ACCOUNT = { accountKey: ACCOUNT_KEY, active: true, displayName: 'Work account', maskedEmail: 'wo••@example.com', profileSource: 'oauth' }
const SECOND_ACCOUNT = { accountKey: SECOND_ACCOUNT_KEY, active: false, displayName: 'Personal account', maskedEmail: 'pe••@example.com', profileSource: 'oauth' }
const rawJson = (value: unknown) => new Response(JSON.stringify(value), { status: 200 })
const json = (value: unknown) => {
  const projected = typeof value === 'object' && value !== null && 'status' in value
    ? { ...value, accounts: value.status === 'signed-in' || value.status === 'reauth-required' ? [ACTIVE_ACCOUNT] : [] }
    : value
  return new Response(JSON.stringify(projected), { status: 200 })
}
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('shared Models and Plugin account state', () => {
  it.each([
    [{ status: 'signing-in' }, en.continueAuthorization],
    [{ status: 'reauth-required', message: 'Authorization expired' }, en.reauthorize],
    [{ status: 'error', message: 'Request failed' }, en.reauthorize],
  ])('keeps recovery controls visible for %j without expanding quota', async (status, action) => {
    vi.stubGlobal('fetch', async () => json(status))
    const account = new OpenAICodexAccountStore()
    render(<OpenAICodexModelsCard t={t} account={account} />)
    expect(await screen.findByRole('button', { name: action as string })).toBeTruthy()
    expect(screen.queryByRole('button', { name: en.viewQuota })).toBeNull()
    if ('message' in status) expect(screen.getByText(status.message as string)).toBeTruthy()
    if (status.status === 'signing-in') expect(screen.getByRole('button', { name: en.cancelSignIn })).toBeTruthy()
    account.dispose()
  })

  it('discloses only server quota rows, reset details and errors while preserving one account header', async () => {
    vi.stubGlobal('fetch', async () => json({ status: 'signed-in', quotaError: 'Partial quota response', usage: {
      rateLimits: [
        { id: 'codex', name: 'Codex', windows: [{ windowSeconds: 604800, remainingPercent: 92, resetAt: 1790000000 }] },
        { id: 'spark', name: 'Spark', windows: [{ windowSeconds: 18000, remainingPercent: 100, resetAt: 1790000000 }, { windowSeconds: 604800, remainingPercent: 99, resetAt: 1790000000 }] },
        { id: 'gpt-reserve', windows: [{ windowSeconds: 604800, remainingPercent: 98, resetAt: 1790000000 }] },
      ],
    } }))
    const account = new OpenAICodexAccountStore()
    render(<OpenAICodexModelsCard t={t} account={account} />)
    const view = await screen.findByRole('button', { name: en.viewQuota })
    expect(view.getAttribute('aria-controls')).toBeTruthy()
    expect(screen.queryByRole('progressbar')).toBeNull()
    fireEvent.click(view)
    expect(screen.getAllByRole('progressbar')).toHaveLength(4)
    expect(screen.getByRole('progressbar', { name: 'Codex · Weekly limit' }).getAttribute('aria-valuenow')).toBe('92')
    expect(screen.getAllByText(/^Resets /u)).toHaveLength(4)
    expect(screen.getByText(en.quotaUnavailable)).toBeTruthy()
    expect(screen.getAllByText(en.signedIn)).toHaveLength(1)
    expect(screen.queryByText(en.accountHeading)).toBeNull()
    expect(screen.queryByText(en.usageLimits)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: en.hideQuota }))
    expect(screen.queryByRole('progressbar')).toBeNull()
    account.dispose()
  })
  it.each([['en', en], ['zh', zh]] as const)('renders direct authorization and plugin attribution in %s without duplicate account headings', async (_locale, messages) => {
    vi.stubGlobal('fetch', async () => json({ status: 'signed-out' }))
    const account = new OpenAICodexAccountStore()
    render(<OpenAICodexModelsCard t={key => messages[key]} account={account} />)
    await screen.findByText(messages.signedOut)
    expect(screen.getByText('Openai-Codex', { exact: true })).toBeTruthy()
    expect(screen.getByText(messages.modelsProviderSupport, { exact: true })).toBeTruthy()
    expect(screen.queryByText(messages.title, { exact: true })).toBeNull()
    expect(screen.queryByText(messages.intro)).toBeNull()
    expect(screen.queryByRole('button', { name: messages.login })).toBeNull()
    expect(screen.getByRole('button', { name: messages.authorize })).toBeTruthy()
    expect(screen.queryByText(messages.accountHeading)).toBeNull()
    expect(screen.queryByRole('button', { name: messages.viewQuota })).toBeNull()
    account.dispose()
  })

  it('recovers an abandoned login discovered in another browser with reopen and cancel controls', async () => {
    let pending = true
    const fetchMock = vi.fn(async (path: string) => {
      if (path.endsWith('/cancel')) { pending = false; return json({ status: 'signed-out' }) }
      if (path === OPENAI_CODEX_AUTH_LOGIN_PATH) return json({ url: 'https://auth.openai.com/authorize' })
      return json({ status: pending ? 'signing-in' : 'signed-out' })
    })
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(window, 'open').mockReturnValue(null)
    const account = new OpenAICodexAccountStore()
    render(<OpenAICodexSettings t={t} account={account} embedded />)
    await screen.findByText(en.signingIn)
    fireEvent.click(screen.getByRole('button', { name: 'Reopen authorization' }))
    expect(await screen.findByRole('link', { name: en.openLoginInBrowser })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel sign-in' }))
    expect(await screen.findByRole('button', { name: en.login })).toBeTruthy()
    expect(fetchMock.mock.calls.some(([path]) => path === OPENAI_CODEX_AUTH_LOGOUT_PATH)).toBe(false)
    account.dispose()
  })

  it('refreshes server state when another browser cancels a pending login request', async () => {
    let finishLogin!: (value: Response) => void
    const fetchMock = vi.fn((path: string) => path === OPENAI_CODEX_AUTH_LOGIN_PATH
      ? new Promise<Response>(resolve => { finishLogin = resolve })
      : Promise.resolve(json({ status: 'signed-out' })))
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(window, 'open').mockReturnValue(null)
    const account = new OpenAICodexAccountStore()
    const unsubscribe = account.subscribe(() => {})
    await waitFor(() => { expect(account.getSnapshot().status.status).toBe('signed-out') })
    const login = account.signIn()
    await waitFor(() => { expect(account.getSnapshot().busy).toBe(true) })
    finishLogin(new Response(JSON.stringify({ error: 'OpenAI Codex sign-in cancelled' }), { status: 500 }))
    await login
    expect(account.getSnapshot()).toMatchObject({ status: { status: 'signed-out' }, busy: false })
    expect(fetchMock).toHaveBeenCalledTimes(3)
    unsubscribe()
    account.dispose()
  })

  it('keeps unrelated login failures visible instead of replacing them with server state', async () => {
    const fetchMock = vi.fn((path: string) => Promise.resolve(path === OPENAI_CODEX_AUTH_LOGIN_PATH
      ? new Response(JSON.stringify({ error: 'OAuth is unavailable' }), { status: 503 })
      : json({ status: 'signed-out' })))
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(window, 'open').mockReturnValue(null)
    const account = new OpenAICodexAccountStore()
    const unsubscribe = account.subscribe(() => {})
    await waitFor(() => { expect(account.getSnapshot().status.status).toBe('signed-out') })
    await account.signIn()
    expect(account.getSnapshot()).toMatchObject({
      status: { status: 'error', message: 'OAuth is unavailable' }, busy: false,
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    unsubscribe()
    account.dispose()
  })

  it('retains a newer login popup while an older cancelled login refresh settles', async () => {
    let resolveFirstLogin!: (value: Response) => void
    let resolveSecondLogin!: (value: Response) => void
    let resolveCancellationRefresh!: (value: Response) => void
    let loginRequests = 0
    let statusRequests = 0
    const fetchMock = vi.fn((path: string) => {
      if (path === OPENAI_CODEX_AUTH_ACCOUNTS_PATH) return Promise.resolve(json({ accounts: [] }))
      if (path === OPENAI_CODEX_AUTH_LOGIN_PATH) {
        loginRequests += 1
        return new Promise<Response>(resolve => {
          if (loginRequests === 1) resolveFirstLogin = resolve
          else resolveSecondLogin = resolve
        })
      }
      statusRequests += 1
      return statusRequests === 1
        ? Promise.resolve(json({ status: 'signed-out' }))
        : new Promise<Response>(resolve => { resolveCancellationRefresh = resolve })
    })
    vi.stubGlobal('fetch', fetchMock)
    const firstClose = vi.fn()
    const secondClose = vi.fn()
    const firstPopup = { close: firstClose, location: { replace: vi.fn() } } as unknown as Window
    const secondPopup = { close: secondClose, location: { replace: vi.fn() } } as unknown as Window
    vi.spyOn(window, 'open').mockReturnValueOnce(firstPopup).mockReturnValueOnce(secondPopup)
    const account = new OpenAICodexAccountStore()
    const unsubscribe = account.subscribe(() => {})
    await waitFor(() => { expect(account.getSnapshot().status.status).toBe('signed-out') })
    const firstLogin = account.signIn()
    resolveFirstLogin(new Response(JSON.stringify({ error: 'OpenAI Codex sign-in cancelled' }), { status: 500 }))
    await waitFor(() => { expect(account.getSnapshot().status.status).toBe('error') })
    const secondLogin = account.signIn()
    await waitFor(() => { expect(loginRequests).toBe(2) })
    resolveCancellationRefresh(json({ status: 'signed-out' }))
    await firstLogin
    account.dispose()
    expect(firstClose).toHaveBeenCalledOnce()
    expect(secondClose).toHaveBeenCalledOnce()
    resolveSecondLogin(json({ url: 'https://auth.openai.com/authorize' }))
    await secondLogin
    unsubscribe()
  })

  it('shares one status read, synchronizes logout, and keeps advanced options off Models', async () => {
    const fetchMock = vi.fn(async (path: string) => path === OPENAI_CODEX_AUTH_LOGOUT_PATH
      ? json({ ok: true }) : json({ status: 'signed-in', usage: { rateLimits: [] } }))
    vi.stubGlobal('fetch', fetchMock)
    const account = new OpenAICodexAccountStore()
    const view = render(<>
      <div data-testid="models"><OpenAICodexModelsCard t={t} account={account} /></div>
      <div data-testid="plugins"><OpenAICodexSettings t={t} account={account} embedded /></div>
    </>)
    await waitFor(() => { expect(screen.getAllByText(en.signedIn)).toHaveLength(2) })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const models = within(screen.getByTestId('models'))
    fireEvent.click(models.getByRole('button', { name: en.viewQuota }))
    expect(models.queryByText(en.accountHeading)).toBeNull()
    expect(models.queryByText(en.usageLimits)).toBeNull()
    expect(models.getAllByText(en.signedIn)).toHaveLength(1)
    expect(models.getByText(en.quotaUnavailable)).toBeTruthy()
    expect(models.getByText(en.modelsAccountHelp)).toBeTruthy()
    expect(models.queryByRole('checkbox')).toBeNull()
    fireEvent.click(models.getByRole('button', { name: en.manageAccounts }))
    fireEvent.click(models.getByRole('button', { name: en.signOutAll }))
    await waitFor(() => { expect(screen.getAllByText(en.signedOut)).toHaveLength(2) })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    view.unmount()
    account.dispose()
  })

  it('keeps a single pending login across page switches, including blocked-popup fallback', async () => {
    let resolveLogin!: (value: Response) => void
    const fetchMock = vi.fn((path: string) => path === OPENAI_CODEX_AUTH_LOGIN_PATH
      ? new Promise<Response>(resolve => { resolveLogin = resolve })
      : Promise.resolve(json({ status: 'signed-out' })))
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(window, 'open').mockReturnValue(null)
    const account = new OpenAICodexAccountStore()
    const view = render(<OpenAICodexModelsCard t={t} account={account} />)
    fireEvent.click(await screen.findByRole('button', { name: en.authorize }))
    view.rerender(<OpenAICodexSettings t={t} account={account} embedded />)
    expect((screen.getByRole('button', { name: en.working }) as HTMLButtonElement).disabled).toBe(true)
    await act(async () => { await account.signIn() })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await act(async () => { resolveLogin(json({ url: 'https://auth.openai.com/authorize' })) })
    expect(await screen.findByRole('link', { name: en.openLoginInBrowser })).toBeTruthy()
    view.unmount()
    account.dispose()
  })

  it('does not let an older status response undo logout', async () => {
    let resolveStatus!: (value: Response) => void
    let signal: AbortSignal | undefined
    vi.stubGlobal('fetch', vi.fn((path: string, init?: RequestInit) => {
      if (path === OPENAI_CODEX_AUTH_LOGOUT_PATH) return Promise.resolve(json({ ok: true }))
      signal = init?.signal as AbortSignal
      return new Promise<Response>(resolve => { resolveStatus = resolve })
    }))
    const account = new OpenAICodexAccountStore()
    const unsubscribe = account.subscribe(() => {})
    await account.signOut()
    expect(signal?.aborted).toBe(true)
    resolveStatus(json({ status: 'signed-in', usage: { rateLimits: [] } }))
    await Promise.resolve()
    await Promise.resolve()
    expect(account.getSnapshot().status.status).toBe('signed-out')
    unsubscribe()
    account.dispose()
  })

  it('stops polling after the final subscriber leaves and refreshes on return', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn(async () => json({ status: 'signed-in', usage: { rateLimits: [] } }))
    vi.stubGlobal('fetch', fetchMock)
    const account = new OpenAICodexAccountStore()
    const one = account.subscribe(() => {})
    const two = account.subscribe(() => {})
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    one()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    two()
    await vi.advanceTimersByTimeAsync(120_000)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const last = account.subscribe(() => {})
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchMock).toHaveBeenCalledTimes(3)
    account.dispose()
    last()
    await vi.advanceTimersByTimeAsync(120_000)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('closes a pending blank popup when the owning plugin is disposed', async () => {
    const close = vi.fn()
    const replace = vi.fn()
    vi.spyOn(window, 'open').mockReturnValue({ close, opener: null, location: { replace } } as unknown as Window)
    let finish!: (value: Response) => void
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { finish = resolve })))
    const account = new OpenAICodexAccountStore()
    const login = account.signIn()
    account.dispose()
    finish(json({ url: 'https://auth.openai.com/authorize' }))
    await login
    expect(close).toHaveBeenCalled()
    expect(replace).not.toHaveBeenCalled()
    expect(account.getSnapshot().loginUrl).toBeUndefined()
  })

  it('switches accounts and requires an explicit replacement when removing the active account', async () => {
    let accounts = [ACTIVE_ACCOUNT, SECOND_ACCOUNT]
    const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
      if (path === OPENAI_CODEX_AUTH_STATUS_PATH) {
        return rawJson({ status: 'signed-in', usage: { rateLimits: [] }, accounts })
      }
      if (path === OPENAI_CODEX_AUTH_ACCOUNTS_PATH && init?.method === 'POST') {
        const body = JSON.parse(String(init.body)) as { accountKey: string }
        accounts = accounts.map(account => ({ ...account, active: account.accountKey === body.accountKey }))
        return rawJson({ status: 'signed-in', usage: { rateLimits: [] } })
      }
      if (path === OPENAI_CODEX_AUTH_ACCOUNTS_PATH && init?.method === 'DELETE') {
        const body = JSON.parse(String(init.body)) as { accountKey: string; replacementAccountKey?: string }
        expect(body).toEqual({ accountKey: SECOND_ACCOUNT_KEY, replacementAccountKey: ACCOUNT_KEY })
        accounts = accounts.filter(account => account.accountKey !== body.accountKey)
          .map(account => ({ ...account, active: account.accountKey === body.replacementAccountKey }))
        return rawJson({ status: 'signed-in', usage: { rateLimits: [] } })
      }
      if (path === OPENAI_CODEX_AUTH_ACCOUNTS_PATH) return rawJson({ accounts })
      throw new Error(`unexpected request ${path}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    const account = new OpenAICodexAccountStore()
    const unsubscribe = account.subscribe(() => {})
    await waitFor(() => { expect(account.getSnapshot().accounts).toHaveLength(2) })

    await account.activate(SECOND_ACCOUNT_KEY)
    expect(account.getSnapshot().accounts.find(candidate => candidate.active)?.accountKey).toBe(SECOND_ACCOUNT_KEY)
    await account.remove(SECOND_ACCOUNT_KEY, ACCOUNT_KEY)
    expect(account.getSnapshot().accounts).toEqual([{ ...ACTIVE_ACCOUNT, active: true }])
    expect(fetchMock.mock.calls.map(([path]) => path)).not.toContain('https://auth.openai.com/account-id')
    unsubscribe()
    account.dispose()
  })

  it('reconciles a successful mutation after its account-list refresh fails', async () => {
    vi.useFakeTimers()
    let statusReads = 0
    const switched = [
      { ...ACTIVE_ACCOUNT, active: false },
      { ...SECOND_ACCOUNT, active: true },
    ]
    const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
      if (path === OPENAI_CODEX_AUTH_STATUS_PATH) {
        statusReads += 1
        return rawJson({
          status: 'signed-in',
          usage: { rateLimits: [] },
          accounts: statusReads === 1 ? [ACTIVE_ACCOUNT, SECOND_ACCOUNT] : switched,
        })
      }
      if (path === OPENAI_CODEX_AUTH_ACCOUNTS_PATH && init?.method === 'POST') {
        return rawJson({ status: 'signed-in', usage: { rateLimits: [] } })
      }
      if (path === OPENAI_CODEX_AUTH_ACCOUNTS_PATH) {
        return new Response(JSON.stringify({ error: 'temporary failure' }), { status: 503 })
      }
      throw new Error(`unexpected request ${path}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    const account = new OpenAICodexAccountStore()
    const unsubscribe = account.subscribe(() => {})
    await vi.advanceTimersByTimeAsync(0)
    expect(account.getSnapshot().accounts).toHaveLength(2)

    await account.activate(SECOND_ACCOUNT_KEY)
    expect(account.getSnapshot().operationError).toBe('temporary failure')
    await vi.advanceTimersByTimeAsync(4_999)
    expect(statusReads).toBe(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(statusReads).toBe(2)
    expect(account.getSnapshot().accounts).toEqual(switched)
    expect(account.getSnapshot().operationError).toBeUndefined()
    unsubscribe()
    account.dispose()
  })

  it('keeps the current account visible while another account authorization is pending', async () => {
    let resolveLogin!: (value: Response) => void
    vi.stubGlobal('fetch', vi.fn((path: string) => {
      if (path === OPENAI_CODEX_AUTH_STATUS_PATH) {
        return Promise.resolve(rawJson({ status: 'signed-in', usage: { rateLimits: [] }, accounts: [ACTIVE_ACCOUNT] }))
      }
      if (path === OPENAI_CODEX_AUTH_LOGIN_PATH) return new Promise<Response>(resolve => { resolveLogin = resolve })
      throw new Error(`unexpected request ${path}`)
    }))
    vi.spyOn(window, 'open').mockReturnValue(null)
    const account = new OpenAICodexAccountStore()
    render(<OpenAICodexModelsCard t={t} account={account} />)
    await screen.findByText('Work account')
    fireEvent.click(screen.getByRole('button', { name: en.manageAccounts }))
    fireEvent.click(screen.getByRole('button', { name: en.addAccount }))
    expect(screen.getAllByText('Work account').length).toBeGreaterThan(0)
    expect(await screen.findByText(en.addingAccountKeepsCurrent)).toBeTruthy()
    resolveLogin(rawJson({ url: 'https://auth.openai.com/authorize' }))
    await waitFor(() => { expect(account.getSnapshot().operation.kind).toBe('waiting-authorization') })
    account.dispose()
  })

  it('explains the replacement before removing the active account', async () => {
    let accounts = [ACTIVE_ACCOUNT, SECOND_ACCOUNT]
    const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
      if (path === OPENAI_CODEX_AUTH_STATUS_PATH) {
        return rawJson({ status: 'signed-in', usage: { rateLimits: [] }, accounts })
      }
      if (path === OPENAI_CODEX_AUTH_ACCOUNTS_PATH && init?.method === 'DELETE') {
        const body = JSON.parse(String(init.body)) as { accountKey: string; replacementAccountKey?: string }
        expect(body).toEqual({ accountKey: ACCOUNT_KEY, replacementAccountKey: SECOND_ACCOUNT_KEY })
        accounts = [{ ...SECOND_ACCOUNT, active: true }]
        return rawJson({ status: 'signed-in', usage: { rateLimits: [] } })
      }
      if (path === OPENAI_CODEX_AUTH_ACCOUNTS_PATH) return rawJson({ accounts })
      throw new Error(`unexpected request ${path}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    const account = new OpenAICodexAccountStore()
    render(<OpenAICodexModelsCard t={t} account={account} />)
    await screen.findByText('Work account')
    fireEvent.click(screen.getByRole('button', { name: en.manageAccounts }))
    fireEvent.click(screen.getAllByRole('button', { name: en.removeAccount })[0]!)
    expect(screen.getByRole('region', { name: en.removeAccountTitle.replace('{name}', 'Work account') })).toBeTruthy()
    expect(screen.getByText(en.removeActiveAccountCopy.replace('{name}', 'Personal account'))).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: en.confirmRemove }))
    await waitFor(() => { expect(account.getSnapshot().accounts).toEqual([{ ...SECOND_ACCOUNT, active: true }]) })
    account.dispose()
  })
})
