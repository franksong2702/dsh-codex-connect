// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OpenAICodexAccountStore } from '../src/client/account-store.ts'
import { OpenAICodexModelsCard } from '../src/client/OpenAICodexModelsCard.tsx'
import { OpenAICodexSettings } from '../src/client/OpenAICodexSettings.tsx'
import { en, zh } from '../src/client/locales.ts'
import { OPENAI_CODEX_AUTH_CALLBACK_PATH, OPENAI_CODEX_AUTH_CANCEL_PATH, OPENAI_CODEX_AUTH_LOGIN_PATH, OPENAI_CODEX_AUTH_STATUS_PATH } from '../src/auth-paths.ts'
import { BROWSER_REQUEST_TIMEOUT_MS } from '../src/client/request-json.ts'

// Synthetic, non-functional callback material only.
const CALLBACK = 'http://localhost:1455/auth/callback?code=synthetic-example&state=synthetic-state'
const LOGIN = 'https://auth.openai.com/authorize'
const ACTIVE = { accountKey: `acct_${'a'.repeat(43)}`, active: true, displayName: 'Example account', profileSource: 'oauth' }
const signedIn = { status: 'signed-in', usage: { rateLimits: [] }, accounts: [ACTIVE] }
const stores: OpenAICodexAccountStore[] = []
function store() { const value = new OpenAICodexAccountStore(); stores.push(value); return value }
const t = (key: keyof typeof en) => en[key]
afterEach(() => { cleanup(); stores.forEach(value => value.dispose()); stores.length = 0; vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear() })

describe('manual callback store', () => {
  it('posts the full URL once with JSON and same-origin credentials; polls acceptance to completion', async () => {
    vi.useFakeTimers()
    let finished = false
    let resolveCallback!: (response: Response) => void
    const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
      if (path === OPENAI_CODEX_AUTH_CALLBACK_PATH) return new Promise<Response>(resolve => { resolveCallback = resolve })
      return Response.json(finished ? signedIn : { status: 'signing-in', accounts: [] })
    })
    vi.stubGlobal('fetch', fetchMock)
    const account = store()
    account.subscribe(() => {})
    await vi.advanceTimersByTimeAsync(0)
    const request = account.submitCallback(CALLBACK)
    await account.submitCallback(CALLBACK)
    expect(account.getSnapshot().busy).toBe(true)
    expect(JSON.stringify(account.getSnapshot())).not.toContain('synthetic')
    const requests = fetchMock.mock.calls.filter(([path]) => path === OPENAI_CODEX_AUTH_CALLBACK_PATH)
    expect(requests).toHaveLength(1)
    expect(requests[0]?.[1]).toMatchObject({ method: 'POST', credentials: 'same-origin', headers: { accept: 'application/json', 'content-type': 'application/json' }, body: JSON.stringify({ callbackUrl: CALLBACK }) })
    resolveCallback(Response.json({ ok: true }))
    await request
    expect(account.getSnapshot()).toMatchObject({ busy: false, operation: { kind: 'waiting-authorization' }, callbackFeedback: 'callbackAccepted' })
    const reads = fetchMock.mock.calls.filter(([path]) => path === OPENAI_CODEX_AUTH_STATUS_PATH).length
    await vi.advanceTimersByTimeAsync(1000)
    expect(fetchMock.mock.calls.filter(([path]) => path === OPENAI_CODEX_AUTH_STATUS_PATH)).toHaveLength(reads + 1)
    expect(account.getSnapshot().callbackFeedback).toBe('callbackAccepted')
    finished = true
    await vi.advanceTimersByTimeAsync(1000)
    expect(account.getSnapshot()).toMatchObject({ status: { status: 'signed-in' }, operation: { kind: 'idle' } })
    expect(account.getSnapshot().callbackFeedback).toBeUndefined()
  })

  it.each([400, 409, 413, 415, 500])('keeps active account and login on %s, hides response secrets, and permits retry', async status => {
    vi.useFakeTimers()
    vi.spyOn(window, 'open').mockReturnValue(null)
    let pending = false
    let reject = true
    const fetchMock = vi.fn(async (path: string) => {
      if (path === OPENAI_CODEX_AUTH_LOGIN_PATH) { pending = true; return Response.json({ url: LOGIN }) }
      if (path === OPENAI_CODEX_AUTH_CALLBACK_PATH) return reject ? Response.json({ error: CALLBACK }, { status }) : Response.json({ ok: true })
      return Response.json(pending ? { status: 'signing-in', accounts: [ACTIVE] } : signedIn)
    })
    vi.stubGlobal('fetch', fetchMock)
    const account = store()
    account.subscribe(() => {})
    await vi.advanceTimersByTimeAsync(0)
    await account.signIn()
    await account.submitCallback(CALLBACK)
    const feedback = status === 400 ? 'callbackInvalid' : status === 409 ? 'callbackNoPending' : 'callbackFailed'
    expect(account.getSnapshot()).toMatchObject({ status: { status: 'signed-in' }, accounts: [ACTIVE], loginUrl: LOGIN, busy: false, operation: { kind: 'waiting-authorization' }, callbackFeedback: feedback })
    expect(JSON.stringify(account.getSnapshot())).not.toContain('synthetic')
    await vi.advanceTimersByTimeAsync(1000)
    expect(account.getSnapshot().callbackFeedback).toBe(feedback)
    reject = false
    await account.submitCallback(CALLBACK)
    expect(account.getSnapshot().callbackFeedback).toBe('callbackAccepted')
    expect(fetchMock.mock.calls.filter(([path]) => path === OPENAI_CODEX_AUTH_CALLBACK_PATH)).toHaveLength(2)
  })

  it.each(['network', 'malformed'] as const)('uses fixed feedback for %s failure without reflecting secrets', async failure => {
    vi.stubGlobal('fetch', async (path: string) => {
      if (path !== OPENAI_CODEX_AUTH_CALLBACK_PATH) return Response.json({ status: 'signing-in', accounts: [] })
      if (failure === 'network') throw new Error(CALLBACK)
      return Response.json({ ok: false, error: CALLBACK })
    })
    const account = store()
    account.subscribe(() => {})
    await waitFor(() => expect(account.getSnapshot().operation.kind).toBe('waiting-authorization'))
    await account.submitCallback(CALLBACK)
    expect(account.getSnapshot()).toMatchObject({ callbackFeedback: 'callbackFailed', busy: false, operation: { kind: 'waiting-authorization' } })
    expect(JSON.stringify(account.getSnapshot())).not.toContain('synthetic')
  })

  it('times out an uncooperative transport, then polls without automatically reposting', async () => {
    vi.useFakeTimers()
    let complete = false
    let signal: AbortSignal | null | undefined
    const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
      if (path === OPENAI_CODEX_AUTH_CALLBACK_PATH) { signal = init?.signal; return new Promise<Response>(() => {}) }
      return Response.json(complete ? signedIn : { status: 'signing-in', accounts: [] })
    })
    vi.stubGlobal('fetch', fetchMock)
    const account = store()
    account.subscribe(() => {})
    await vi.advanceTimersByTimeAsync(0)
    const request = account.submitCallback(CALLBACK)
    await vi.advanceTimersByTimeAsync(BROWSER_REQUEST_TIMEOUT_MS)
    await request
    expect(signal?.aborted).toBe(true)
    expect(account.getSnapshot()).toMatchObject({ busy: false, callbackFeedback: 'callbackUnconfirmed' })
    complete = true
    await vi.advanceTimersByTimeAsync(1000)
    expect(account.getSnapshot().status.status).toBe('signed-in')
    expect(fetchMock.mock.calls.filter(([path]) => path === OPENAI_CODEX_AUTH_CALLBACK_PATH)).toHaveLength(1)
  })

  it('does not submit outside authorization and settles disposal without retaining material', async () => {
    const fetchMock = vi.fn(async (path: string) => path === OPENAI_CODEX_AUTH_CALLBACK_PATH ? new Promise<Response>(() => {}) : Response.json({ status: 'signing-in', accounts: [] }))
    vi.stubGlobal('fetch', fetchMock)
    const account = store()
    await account.submitCallback(CALLBACK)
    expect(fetchMock).not.toHaveBeenCalled()
    account.subscribe(() => {})
    await waitFor(() => expect(account.getSnapshot().operation.kind).toBe('waiting-authorization'))
    const request = account.submitCallback(CALLBACK)
    account.dispose()
    await request
    expect(account.getSnapshot()).toEqual({ status: { status: 'loading' }, busy: false, accounts: [], operation: { kind: 'idle' } })
  })
})

describe.each(['models', 'settings'] as const)('%s manual callback entry', entry => {
  function mount(account: OpenAICodexAccountStore, messages = en) {
    return render(entry === 'models' ? <OpenAICodexModelsCard t={key => messages[key]} account={account} /> : <OpenAICodexSettings t={key => messages[key]} account={account} accountOnly />)
  }
  function openInput() {
    fireEvent.click(screen.getByRole('button', { name: en.manualCallbackToggle }))
    return screen.getByRole('textbox', { name: en.manualCallbackLabel }) as HTMLInputElement
  }
  it('requires opt-in, forwards callback, clears submitted input and renders only safe retry feedback', async () => {
    const writes = vi.spyOn(Storage.prototype, 'setItem')
    const fetchMock = vi.fn(async (path: string) => path === OPENAI_CODEX_AUTH_CALLBACK_PATH ? Response.json({ error: CALLBACK }, { status: 400 }) : Response.json({ status: 'signing-in', accounts: [] }))
    vi.stubGlobal('fetch', fetchMock)
    const account = store()
    mount(account)
    const toggle = await screen.findByRole('button', { name: en.manualCallbackToggle })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('textbox')).toBeNull()
    const input = openInput()
    expect(screen.getByText(en.manualCallbackHelp)).toBeTruthy()
    expect(input.getAttribute('autocomplete')).toBe('off')
    expect(input.getAttribute('spellcheck')).toBe('false')
    expect(input.getAttribute('autocapitalize')).toBe('none')
    expect((screen.getByRole('button', { name: en.manualCallbackSubmit }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(input, { target: { value: CALLBACK } })
    fireEvent.click(screen.getByRole('button', { name: en.manualCallbackSubmit }))
    await screen.findByText(en.callbackInvalid)
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(openInput().value).toBe('')
    expect(document.body.textContent).not.toContain('synthetic')
    expect(JSON.stringify(account.getSnapshot())).not.toContain('synthetic')
    expect(writes).not.toHaveBeenCalled()
    expect(fetchMock.mock.calls.filter(([path]) => path === OPENAI_CODEX_AUTH_CALLBACK_PATH)).toHaveLength(1)
  })

  it('clears secrets and disclosure on collapse, cancel, reopen, completion and remount/rejoin', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null)
    let pending = true
    vi.stubGlobal('fetch', async (path: string) => {
      if (path === OPENAI_CODEX_AUTH_LOGIN_PATH) { pending = true; return Response.json({ url: LOGIN }) }
      if (path === OPENAI_CODEX_AUTH_CANCEL_PATH) { pending = false; return Response.json({ ok: true }) }
      return Response.json({ status: pending ? 'signing-in' : 'signed-out', accounts: [] })
    })
    const account = store()
    let view = mount(account)
    await screen.findByRole('button', { name: en.manualCallbackToggle })
    fireEvent.change(openInput(), { target: { value: CALLBACK } })
    fireEvent.click(screen.getByRole('button', { name: en.manualCallbackToggle }))
    expect(openInput().value).toBe('')
    fireEvent.change(screen.getByRole('textbox'), { target: { value: CALLBACK } })
    fireEvent.click(screen.getByRole('button', { name: en.cancel }))
    expect(openInput().value).toBe('')
    fireEvent.change(screen.getByRole('textbox'), { target: { value: CALLBACK } })
    fireEvent.click(screen.getByRole('button', { name: entry === 'models' ? en.continueAuthorization : en.reopenAuthorization }))
    await screen.findByRole('link', { name: en.openLoginInBrowser })
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(openInput().value).toBe('')
    fireEvent.change(screen.getByRole('textbox'), { target: { value: CALLBACK } })
    view.unmount()
    view = mount(account)
    await screen.findByRole('button', { name: en.manualCallbackToggle })
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(openInput().value).toBe('')
    fireEvent.change(screen.getByRole('textbox'), { target: { value: CALLBACK } })
    fireEvent.click(screen.getByRole('button', { name: en.cancelSignIn }))
    await waitFor(() => expect(screen.queryByRole('button', { name: en.manualCallbackToggle })).toBeNull())
    await act(() => account.signIn())
    expect(openInput().value).toBe('')
    fireEvent.change(screen.getByRole('textbox'), { target: { value: CALLBACK } })
    pending = false
    await act(() => account.refresh())
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByRole('button', { name: en.manualCallbackToggle })).toBeNull()
    await act(() => account.signIn())
    expect(openInput().value).toBe('')
    view.unmount()
  })

  it('offers Chinese instructions for an existing pending login without a local login URL', async () => {
    vi.stubGlobal('fetch', async () => Response.json({ status: 'signing-in', accounts: [] }))
    const account = store()
    mount(account, zh)
    fireEvent.click(await screen.findByRole('button', { name: zh.manualCallbackToggle }))
    expect(screen.getByText(zh.manualCallbackHelp)).toBeTruthy()
    expect(screen.getByText(zh.manualCallbackPrivacy)).toBeTruthy()
    expect(screen.getByRole('textbox', { name: zh.manualCallbackLabel })).toBeTruthy()
    expect(screen.queryByRole('link', { name: zh.openLoginInBrowser })).toBeNull()
  })
})

it('clears drafts in both mounted entry points when either submits, sharing one in-flight mutation', async () => {
  let resolveCallback!: (response: Response) => void
  const fetchMock = vi.fn(async (path: string) => path === OPENAI_CODEX_AUTH_CALLBACK_PATH ? new Promise<Response>(resolve => { resolveCallback = resolve }) : Response.json({ status: 'signing-in', accounts: [] }))
  vi.stubGlobal('fetch', fetchMock)
  const account = store()
  render(<><OpenAICodexModelsCard t={t} account={account} /><OpenAICodexSettings t={t} account={account} accountOnly /></>)
  await waitFor(() => expect(screen.getAllByRole('button', { name: en.manualCallbackToggle })).toHaveLength(2))
  screen.getAllByRole('button', { name: en.manualCallbackToggle }).forEach(button => fireEvent.click(button))
  screen.getAllByRole('textbox').forEach(input => fireEvent.change(input, { target: { value: CALLBACK } }))
  fireEvent.click(screen.getAllByRole('button', { name: en.manualCallbackSubmit })[0]!)
  expect(screen.queryByRole('textbox')).toBeNull()
  await account.submitCallback(CALLBACK)
  expect(fetchMock.mock.calls.filter(([path]) => path === OPENAI_CODEX_AUTH_CALLBACK_PATH)).toHaveLength(1)
  await act(async () => { resolveCallback(Response.json({ ok: true })) })
  screen.getAllByRole('button', { name: en.manualCallbackToggle }).forEach(button => fireEvent.click(button))
  screen.getAllByRole('textbox').forEach(input => expect((input as HTMLInputElement).value).toBe(''))
})
