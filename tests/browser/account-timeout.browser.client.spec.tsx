import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { OpenAICodexAccountStore } from '../../src/client/account-store.ts'
import { OpenAICodexModelsCard } from '../../src/client/OpenAICodexModelsCard.tsx'
import { en } from '../../src/client/locales.ts'
import { OPENAI_CODEX_AUTH_CANCEL_PATH, OPENAI_CODEX_AUTH_LOGIN_PATH } from '../../src/auth-paths.ts'

let root: Root | undefined
let host: HTMLDivElement | undefined
let account: OpenAICodexAccountStore | undefined
afterEach(() => {
  root?.unmount(); account?.dispose(); host?.remove()
  vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals()
})

it('restores usable cancellation after a lost login response without logging out', async () => {
  let pending = false
  const fetchMock = vi.fn(async (path: string) => {
    if (path === OPENAI_CODEX_AUTH_LOGIN_PATH) {
      pending = true
      return new Promise<Response>(() => {})
    }
    if (path === OPENAI_CODEX_AUTH_CANCEL_PATH) pending = false
    return Response.json({ status: pending ? 'signing-in' : 'signed-out', accounts: [] })
  })
  vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(window, 'open').mockReturnValue(null)
  account = new OpenAICodexAccountStore()
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  root.render(createElement(OpenAICodexModelsCard, { t: key => en[key], account }))
  await expect.element(page.getByRole('button', { name: en.authorize, exact: true })).toBeEnabled()
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  await page.getByRole('button', { name: en.authorize, exact: true }).click()
  await expect.element(page.getByRole('button', { name: en.cancelSignIn, exact: true })).toBeDisabled()
  await vi.advanceTimersByTimeAsync(45_000)
  await expect.element(page.getByRole('button', { name: en.cancelSignIn, exact: true })).toBeEnabled()
  await page.getByRole('button', { name: en.cancelSignIn, exact: true }).click()
  await expect.element(page.getByRole('button', { name: en.authorize, exact: true })).toBeEnabled()
  expect(fetchMock.mock.calls.filter(([path]) => path === OPENAI_CODEX_AUTH_LOGIN_PATH)).toHaveLength(1)
  expect(fetchMock.mock.calls.some(([path]) => path.endsWith('/logout'))).toBe(false)
})
