import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { OpenAICodexAccountStore } from '../../src/client/account-store.ts'
import { OpenAICodexModelsCard } from '../../src/client/OpenAICodexModelsCard.tsx'
import { OpenAICodexSettings } from '../../src/client/OpenAICodexSettings.tsx'
import { en, zh } from '../../src/client/locales.ts'
import { OPENAI_CODEX_AUTH_CALLBACK_PATH, OPENAI_CODEX_AUTH_LOGIN_PATH, OPENAI_CODEX_AUTH_STATUS_PATH } from '../../src/auth-paths.ts'

let root: Root | undefined
let host: HTMLDivElement | undefined
let account: OpenAICodexAccountStore | undefined
afterEach(async () => {
  root?.unmount()
  host?.remove()
  account?.dispose()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  await page.viewport(960, 800)
})

it.each([['Models', en], ['Plugins', zh]] as const)('submits a remote callback through the opt-in %s account form', async (entry, messages) => {
  let status = 'signed-out'
  let submissions = 0
  const callbackUrl = 'http://localhost:1455/auth/callback?code=fixture-browser-code&state=fixture-browser-state'
  const current = { accountKey: `acct_${'a'.repeat(43)}`, active: true, displayName: 'Fixture account', profileSource: 'oauth' }
  vi.spyOn(window, 'open').mockReturnValue(null)
  vi.stubGlobal('fetch', async (path: string, init?: RequestInit) => {
    if (path === OPENAI_CODEX_AUTH_LOGIN_PATH) {
      status = 'signing-in'
      return Response.json({ url: 'https://auth.openai.com/authorize' })
    }
    if (path === OPENAI_CODEX_AUTH_CALLBACK_PATH) {
      expect(init?.method).toBe('POST')
      expect(init?.credentials).toBe('same-origin')
      expect(JSON.parse(init?.body as string)).toEqual({ callbackUrl })
      submissions++
      status = 'signed-in'
      return Response.json({ ok: true })
    }
    if (path === OPENAI_CODEX_AUTH_STATUS_PATH) return Response.json(status === 'signed-in'
      ? { status, accounts: [current], usage: { rateLimits: [] } } : { status, accounts: [] })
    throw new Error('Unexpected fixture request')
  })
  account = new OpenAICodexAccountStore()
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  root.render(entry === 'Models'
    ? <OpenAICodexModelsCard t={key => messages[key]} account={account} />
    : <OpenAICodexSettings t={key => messages[key]} account={account} embedded accountOnly />)
  await page.viewport(360, 800)
  await page.getByRole('button', { name: entry === 'Models' ? messages.authorize : messages.login, exact: true }).click()
  const disclosure = page.getByRole('button', { name: messages.manualCallbackToggle, exact: true })
  await expect.element(disclosure).toHaveAttribute('aria-expanded', 'false')
  await expect.element(page.getByRole('textbox', { name: messages.manualCallbackLabel })).not.toBeInTheDocument()
  await disclosure.click()
  const input = page.getByRole('textbox', { name: messages.manualCallbackLabel })
  await expect.element(input).toHaveAttribute('autocomplete', 'off')
  await input.fill(callbackUrl)
  await page.getByRole('button', { name: messages.manualCallbackSubmit, exact: true }).click()
  await expect.element(input).not.toBeInTheDocument()
  await expect.element(page.getByText('Fixture account', { exact: true })).toBeVisible()
  expect(submissions).toBe(1)
  expect(JSON.stringify(account.getSnapshot())).not.toContain('fixture-browser-code')
  expect(host.textContent).not.toContain('fixture-browser-code')
  await expect.element(disclosure).not.toBeInTheDocument()
})
