// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OpenAICodexAccountStore } from '../src/client/account-store.ts'
import { isOfficialDesktopShell } from '../src/client/browser-launch.ts'
import { BROWSER_REQUEST_TIMEOUT_MS } from '../src/client/request-json.ts'
import { OPENAI_CODEX_AUTH_LOGIN_PATH, OPENAI_CODEX_AUTH_STATUS_PATH } from '../src/auth-paths.ts'

const CHALLENGE_URL = 'https://auth.openai.com/authorize?state=synthetic-desktop'
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status })
let account: OpenAICodexAccountStore | undefined

afterEach(() => { account?.dispose(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

/** Mock Electron's denied blank popup and externally opened HTTPS (null Window). */
function desktopWindow() {
  const open = vi.fn<typeof window.open>((url) => {
    if (url === 'about:blank') throw new Error('Electron rejects about:blank')
    expect(new URL(String(url)).protocol).toBe('https:')
    return null
  })
  vi.stubGlobal('window', { location: new URL('dsh-app://app/index.html'), open })
  return open
}

describe('official Desktop OAuth browser launch', () => {
  it.each([
    ['dsh-app:', 'app', true],
    ['dsh-app:', 'other', false],
    ['dsh-app:', 'app.example.com', false],
    ['dsh-app:', 'APP', false],
    ['https:', 'app', false],
    ['http:', 'localhost', false],
    ['electron:', 'app', false],
    ['file:', '', false],
  ] as const)('selects Desktop only for protocol %s and hostname %s', (protocol, hostname, desktop) => {
    expect(isOfficialDesktopShell({ protocol, hostname })).toBe(desktop)
  })

  it('waits for a validated challenge, dispatches it once, and accepts Electron null', async () => {
    const open = desktopWindow()
    let finish!: (response: Response) => void
    const fetchMock = vi.fn((path: string, init?: RequestInit) => {
      expect(path).toBe(OPENAI_CODEX_AUTH_LOGIN_PATH)
      expect(init).toMatchObject({ method: 'POST', credentials: 'same-origin' })
      return new Promise<Response>(resolve => { finish = resolve })
    })
    vi.stubGlobal('fetch', fetchMock)
    account = new OpenAICodexAccountStore()
    const login = account.signIn()
    expect(account.getSnapshot()).toMatchObject({ busy: true, operation: { kind: 'starting-authorization' } })
    expect(open).not.toHaveBeenCalled()
    await account.signIn()
    await account.cancel()
    expect(fetchMock).toHaveBeenCalledOnce()

    finish(json({ url: CHALLENGE_URL }))
    await login
    expect(open).toHaveBeenCalledExactlyOnceWith(CHALLENGE_URL, '_blank', 'noopener,noreferrer')
    expect(account.getSnapshot()).toMatchObject({
      status: { status: 'signing-in' }, busy: false,
      operation: { kind: 'waiting-authorization' }, loginUrl: CHALLENGE_URL,
    })
    expect(account.getSnapshot().operationError).toBeUndefined()
  })

  it('retains the pending authorization and manual link if external dispatch throws', async () => {
    const open = desktopWindow().mockImplementation(() => { throw new Error('External browser unavailable') })
    vi.stubGlobal('fetch', async () => json({ url: CHALLENGE_URL }))
    account = new OpenAICodexAccountStore()
    await account.signIn()
    expect(open).toHaveBeenCalledExactlyOnceWith(CHALLENGE_URL, '_blank', 'noopener,noreferrer')
    expect(account.getSnapshot()).toMatchObject({
      status: { status: 'signing-in' }, busy: false,
      operation: { kind: 'waiting-authorization' }, loginUrl: CHALLENGE_URL,
    })
    expect(account.getSnapshot().operationError).toBeUndefined()
  })

  it.each([
    { url: 'http://auth.openai.com/authorize' },
    { url: 'javascript:alert(1)' },
    { url: 'dsh-app://app/authorize' },
    { url: 'https://user@auth.openai.com/authorize' },
    { url: 'https://user:password@auth.openai.com/authorize' },
    { url: 'not a URL' },
    { url: 123 },
    {},
  ])('never dispatches an invalid challenge %j', async challenge => {
    const open = desktopWindow()
    vi.stubGlobal('fetch', async () => json(challenge))
    account = new OpenAICodexAccountStore()
    await account.signIn()
    expect(open).not.toHaveBeenCalled()
    expect(account.getSnapshot()).toMatchObject({
      status: { status: 'error', message: 'Invalid account response' }, busy: false, operation: { kind: 'idle' },
    })
    expect(account.getSnapshot().loginUrl).toBeUndefined()
  })

  it('leaves a pending request failure visible without launching a browser', async () => {
    const open = desktopWindow()
    let finish!: (response: Response) => void
    vi.stubGlobal('fetch', () => new Promise<Response>(resolve => { finish = resolve }))
    account = new OpenAICodexAccountStore()
    const login = account.signIn()
    expect(open).not.toHaveBeenCalled()
    finish(json({ error: 'OAuth is unavailable' }, 503))
    await login
    expect(open).not.toHaveBeenCalled()
    expect(account.getSnapshot()).toMatchObject({
      status: { status: 'error', message: 'OAuth is unavailable' }, busy: false, operation: { kind: 'idle' },
    })
  })

  it.each(['challenge', 'failure'] as const)('does not dispatch or resurrect state after disposal and a late %s', async outcome => {
    const open = desktopWindow()
    let finish!: (response: Response) => void
    let signal: AbortSignal | null | undefined
    const fetchMock = vi.fn((_path: string, init?: RequestInit) => {
      signal = init?.signal
      return new Promise<Response>(resolve => { finish = resolve })
    })
    vi.stubGlobal('fetch', fetchMock)
    account = new OpenAICodexAccountStore()
    const login = account.signIn()
    account.dispose()
    await login // Disposal settles even a transport that ignores its abort signal.
    expect(signal?.aborted).toBe(true)
    finish(outcome === 'challenge' ? json({ url: CHALLENGE_URL }) : json({ error: 'OAuth is unavailable' }, 503))
    await account.signIn()
    expect(open).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(account.getSnapshot()).toEqual({ status: { status: 'loading' }, busy: false, accounts: [], operation: { kind: 'idle' } })
  })

  it('reconciles cancellation from another browser without dispatching a failed challenge', async () => {
    vi.useFakeTimers()
    const open = desktopWindow()
    let finish!: (response: Response) => void
    const fetchMock = vi.fn((path: string) => {
      if (path === OPENAI_CODEX_AUTH_LOGIN_PATH) return new Promise<Response>(resolve => { finish = resolve })
      expect(path).toBe(OPENAI_CODEX_AUTH_STATUS_PATH)
      return Promise.resolve(json({ status: 'signed-out', accounts: [] }))
    })
    vi.stubGlobal('fetch', fetchMock)
    account = new OpenAICodexAccountStore()
    const unsubscribe = account.subscribe(() => {})
    await vi.advanceTimersByTimeAsync(0)
    const login = account.signIn()
    finish(json({ error: 'OpenAI Codex sign-in cancelled' }, 500))
    await login
    expect(open).not.toHaveBeenCalled()
    expect(account.getSnapshot()).toMatchObject({ status: { status: 'signed-out' }, busy: false, operation: { kind: 'idle' } })
    expect(fetchMock.mock.calls.map(([path]) => path)).toEqual([
      OPENAI_CODEX_AUTH_STATUS_PATH, OPENAI_CODEX_AUTH_LOGIN_PATH, OPENAI_CODEX_AUTH_STATUS_PATH,
    ])
    unsubscribe()
  })

  it('never launches a late challenge after a timed-out request is reconciled', async () => {
    vi.useFakeTimers()
    const open = desktopWindow()
    let finish!: (response: Response) => void
    let signal: AbortSignal | null | undefined
    const fetchMock = vi.fn((path: string, init?: RequestInit) => {
      if (path === OPENAI_CODEX_AUTH_LOGIN_PATH) {
        signal = init?.signal
        return new Promise<Response>(resolve => { finish = resolve })
      }
      return Promise.resolve(json({ status: 'signing-in', accounts: [] }))
    })
    vi.stubGlobal('fetch', fetchMock)
    account = new OpenAICodexAccountStore()
    const unsubscribe = account.subscribe(() => {})
    await vi.advanceTimersByTimeAsync(0)
    const login = account.signIn()
    await vi.advanceTimersByTimeAsync(BROWSER_REQUEST_TIMEOUT_MS)
    await login
    expect(signal?.aborted).toBe(true)
    expect(account.getSnapshot()).toMatchObject({ busy: false, operation: { kind: 'waiting-authorization' } })
    finish(json({ url: CHALLENGE_URL }))
    await vi.advanceTimersByTimeAsync(0)
    expect(open).not.toHaveBeenCalled()
    expect(account.getSnapshot().loginUrl).toBeUndefined()
    expect(fetchMock.mock.calls.filter(([path]) => path === OPENAI_CODEX_AUTH_LOGIN_PATH)).toHaveLength(1)
    unsubscribe()
  })
})

describe('ordinary Web authorization remains unchanged', () => {
  it.each(['https://localhost:3000', 'https://app', 'dsh-app://other', 'dsh-app://app.example.com'])('preopens and detaches the popup synchronously on %s', async location => {
    const replace = vi.fn()
    const popup = { close: vi.fn(), opener: {}, location: { replace } } as unknown as Window
    const open = vi.fn(() => popup)
    vi.stubGlobal('window', { location: new URL(location), open })
    let finish!: (response: Response) => void
    vi.stubGlobal('fetch', () => new Promise<Response>(resolve => { finish = resolve }))
    account = new OpenAICodexAccountStore()
    const login = account.signIn()
    expect(open).toHaveBeenCalledExactlyOnceWith('about:blank', '_blank')
    expect(popup.opener).toBeNull()
    expect(replace).not.toHaveBeenCalled()
    finish(json({ url: CHALLENGE_URL }))
    await login
    expect(replace).toHaveBeenCalledExactlyOnceWith(CHALLENGE_URL)
    expect(open).toHaveBeenCalledOnce()
    expect(account.getSnapshot().loginUrl).toBe(CHALLENGE_URL)
  })
})
