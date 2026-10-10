import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { OpenAICodexAccountStore } from '../../src/client/account-store.ts'
import { isOfficialDesktopShell } from '../../src/client/browser-launch.ts'
import { OpenAICodexModelsCard } from '../../src/client/OpenAICodexModelsCard.tsx'
import { OpenAICodexSettings } from '../../src/client/OpenAICodexSettings.tsx'
import { en, zh } from '../../src/client/locales.ts'
import { OPENAI_CODEX_AUTH_CANCEL_PATH, OPENAI_CODEX_AUTH_LOGIN_PATH, OPENAI_CODEX_AUTH_STATUS_PATH } from '../../src/auth-paths.ts'

// Chromium's runner has an HTTP origin. Strict Desktop location detection is
// exercised by account-store-desktop; here only the shell selection is mocked.
vi.mock('../../src/client/browser-launch.ts', () => ({ isOfficialDesktopShell: vi.fn() }))

const CHALLENGE_URL = 'https://auth.openai.com/authorize?state=synthetic-desktop'
let root: Root | undefined
let host: HTMLDivElement | undefined
let account: OpenAICodexAccountStore | undefined
beforeEach(() => { vi.mocked(isOfficialDesktopShell).mockReturnValue(true) })
afterEach(() => {
  root?.unmount(); account?.dispose(); host?.remove()
  root = undefined; account = undefined; host = undefined
  vi.restoreAllMocks(); vi.unstubAllGlobals()
})

function mount() {
  account = new OpenAICodexAccountStore()
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  return { root, account }
}

describe('Desktop OAuth account UI', () => {
  it.each([['English', en], ['Chinese', zh]] as const)('keeps manual recovery, reopening and cancellation usable after Electron null (%s)', async (_locale, messages) => {
    let pending = false
    let finish!: (response: Response) => void
    let loginRequests = 0
    const fetchMock = vi.fn((path: string) => {
      if (path === OPENAI_CODEX_AUTH_LOGIN_PATH) {
        pending = true
        loginRequests += 1
        return loginRequests === 1
          ? new Promise<Response>(resolve => { finish = resolve })
          : Promise.resolve(Response.json({ url: CHALLENGE_URL }))
      }
      if (path === OPENAI_CODEX_AUTH_CANCEL_PATH) {
        pending = false
        return Promise.resolve(Response.json({ ok: true }))
      }
      expect(path).toBe(OPENAI_CODEX_AUTH_STATUS_PATH)
      return Promise.resolve(Response.json({ status: pending ? 'signing-in' : 'signed-out', accounts: [] }))
    })
    vi.stubGlobal('fetch', fetchMock)
    const popup = vi.spyOn(window, 'open').mockImplementation((url) => {
      if (url === 'about:blank') throw new Error('Electron rejects about:blank')
      expect(new URL(String(url)).protocol).toBe('https:')
      return null // shell.openExternal does not create a retained Window.
    })
    const mounted = mount()
    mounted.root.render(<OpenAICodexSettings t={key => messages[key]} account={mounted.account} embedded accountOnly />)
    await page.getByRole('button', { name: messages.login, exact: true }).click()
    await expect.element(page.getByRole('button', { name: messages.cancelSignIn, exact: true })).toBeDisabled()
    expect(popup).not.toHaveBeenCalled()
    finish(Response.json({ url: CHALLENGE_URL }))
    const link = page.getByRole('link', { name: messages.openLoginInBrowser, exact: true })
    await expect.element(link).toBeVisible()
    await expect.element(link).toHaveAttribute('href', CHALLENGE_URL)
    await expect.element(link).toHaveAttribute('target', '_blank')
    await expect.element(link).toHaveAttribute('rel', 'noopener noreferrer')
    await expect.element(page.getByRole('button', { name: messages.manualCallbackToggle, exact: true })).toBeVisible()
    expect(popup).toHaveBeenCalledExactlyOnceWith(CHALLENGE_URL, '_blank', 'noopener,noreferrer')

    await page.getByRole('button', { name: messages.reopenAuthorization, exact: true }).click()
    await vi.waitFor(() => { expect(popup).toHaveBeenCalledTimes(2) })
    expect(popup.mock.calls[1]).toEqual([CHALLENGE_URL, '_blank', 'noopener,noreferrer'])
    await page.getByRole('button', { name: messages.cancelSignIn, exact: true }).click()
    await expect.element(page.getByRole('button', { name: messages.login, exact: true })).toBeEnabled()
    await expect.element(link).not.toBeInTheDocument()
    expect(fetchMock.mock.calls.filter(([path]) => path === OPENAI_CODEX_AUTH_LOGIN_PATH)).toHaveLength(2)
    expect(fetchMock.mock.calls.filter(([path]) => path === OPENAI_CODEX_AUTH_CANCEL_PATH)).toHaveLength(1)
    expect(fetchMock.mock.calls.some(([path]) => path.endsWith('/logout'))).toBe(false)
  })

  it.each([['English', en], ['Chinese', zh]] as const)('shows restart/diagnostics guidance in both account entries, without a Web trust command (%s)', async (_locale, messages) => {
    const fetchMock = vi.fn(async (path: string) => {
      expect(path).toBe(OPENAI_CODEX_AUTH_STATUS_PATH)
      return Response.json({ error: 'remote-web-origin-not-trusted' }, { status: 403 })
    })
    vi.stubGlobal('fetch', fetchMock)
    const popup = vi.spyOn(window, 'open').mockReturnValue(null)
    const mounted = mount()
    mounted.root.render(<>
      <section aria-label="Models accounts"><OpenAICodexModelsCard t={key => messages[key]} account={mounted.account} /></section>
      <section aria-label="Plugin accounts"><OpenAICodexSettings t={key => messages[key]} account={mounted.account} embedded accountOnly /></section>
    </>)
    for (const name of ['Models accounts', 'Plugin accounts']) {
      const entry = page.getByRole('region', { name, exact: true })
      await expect.element(entry.getByText(messages.desktopOriginTitle, { exact: true })).toBeVisible()
      await expect.element(entry.getByText(messages.desktopOriginDescription, { exact: true })).toBeVisible()
      await expect.element(entry.getByText(messages.desktopOriginDiagnosticsHelp, { exact: true })).toBeVisible()
      await expect.element(entry.getByRole('button', { name: messages.remoteOriginCopy, exact: true })).not.toBeInTheDocument()
    }
    expect(host?.querySelector('code')).toBeNull()
    expect(host?.textContent).not.toContain('trust-origin dsh-app:')
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(popup).not.toHaveBeenCalled()
  })

  it('preserves the Web trust-origin command and copy action outside Desktop', async () => {
    vi.mocked(isOfficialDesktopShell).mockReturnValue(false)
    vi.stubGlobal('fetch', async () => Response.json({ error: 'remote-web-origin-not-trusted' }, { status: 403 }))
    const mounted = mount()
    mounted.root.render(<OpenAICodexSettings t={key => en[key]} account={mounted.account} embedded accountOnly />)
    await expect.element(page.getByText(en.remoteOriginDescription, { exact: true })).toBeVisible()
    await expect.element(page.getByText(`dsh plugin --profile web exec dsh-codex-connect trust-origin ${window.location.origin}`, { exact: true })).toBeVisible()
    await expect.element(page.getByRole('button', { name: en.remoteOriginCopy, exact: true })).toBeEnabled()
    await expect.element(page.getByText(en.desktopOriginDescription, { exact: true })).not.toBeInTheDocument()
  })
})
