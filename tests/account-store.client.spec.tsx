// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OpenAICodexAccountStore } from '../src/client/account-store.ts'
import { OpenAICodexModelsCard } from '../src/client/OpenAICodexModelsCard.tsx'
import { OpenAICodexSettings } from '../src/client/OpenAICodexSettings.tsx'
import { en } from '../src/client/locales.ts'
import { OPENAI_CODEX_AUTH_LOGIN_PATH, OPENAI_CODEX_AUTH_LOGOUT_PATH } from '../src/auth-paths.ts'

const t = (key: keyof typeof en) => en[key]
const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200 })
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('shared Models and Plugin account state', () => {
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
    expect(models.getByText(en.modelsAccountHelp)).toBeTruthy()
    expect(models.queryByRole('checkbox')).toBeNull()
    fireEvent.click(models.getByRole('button', { name: en.logout }))
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
    fireEvent.click(await screen.findByRole('button', { name: en.login }))
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
})
