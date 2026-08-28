import { createElement, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { OpenAICodexAccountStore } from '../../src/client/account-store.ts'
import { OpenAICodexModelsCard } from '../../src/client/OpenAICodexModelsCard.tsx'
import { OpenAICodexSettings } from '../../src/client/OpenAICodexSettings.tsx'
import { en } from '../../src/client/locales.ts'
import { OPENAI_CODEX_AUTH_CANCEL_PATH, OPENAI_CODEX_AUTH_LOGIN_PATH, OPENAI_CODEX_AUTH_LOGOUT_PATH } from '../../src/auth-paths.ts'

let root: Root | undefined
let host: HTMLDivElement | undefined
let account: OpenAICodexAccountStore | undefined
afterEach(() => { root?.unmount(); host?.remove(); account?.dispose(); vi.unstubAllGlobals() })
const t = (key: keyof typeof en) => en[key]

describe('Models account navigation', () => {
  it('reopens, cancels and retries abandoned authorization from an independent browser store', async () => {
    let pending = false
    let starts = 0
    const popup = vi.spyOn(window, 'open').mockReturnValue(null)
    vi.stubGlobal('fetch', async (path: string) => {
      if (path === OPENAI_CODEX_AUTH_LOGIN_PATH) {
        if (!pending) starts++
        pending = true
        return Response.json({ url: 'https://auth.openai.com/authorize' })
      }
      if (path === OPENAI_CODEX_AUTH_CANCEL_PATH) pending = false
      if (path === OPENAI_CODEX_AUTH_LOGOUT_PATH) throw new Error('Cancellation must not sign out')
      return Response.json({ status: pending ? 'signing-in' : 'signed-out' })
    })
    account = new OpenAICodexAccountStore()
    const second = new OpenAICodexAccountStore()
    const first = account
    function Browsers() {
      const [other, setOther] = useState(false)
      return <>
        <button onClick={() => { setOther(!other) }}>Switch browser</button>
        <OpenAICodexSettings key={String(other)} t={t} account={other ? second : first} embedded accountOnly />
      </>
    }
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    root.render(createElement(Browsers))
    try {
      await page.getByRole('button', { name: en.login, exact: true }).click()
      await expect.element(page.getByRole('link', { name: en.openLoginInBrowser })).toBeVisible()
      await page.getByRole('button', { name: 'Switch browser' }).click()
      await page.getByRole('button', { name: en.reopenAuthorization, exact: true }).click()
      await expect.element(page.getByRole('link', { name: en.openLoginInBrowser })).toBeVisible()
      expect(starts).toBe(1)
      await page.getByRole('button', { name: en.cancelSignIn, exact: true }).click()
      await expect.element(page.getByRole('button', { name: en.login, exact: true })).toBeVisible()
      await page.getByRole('button', { name: 'Switch browser' }).click()
      await page.getByRole('button', { name: en.login, exact: true }).click()
      await expect.element(page.getByRole('link', { name: en.openLoginInBrowser })).toBeVisible()
      expect(starts).toBe(2)
    } finally { second.dispose(); popup.mockRestore() }
  })
  it('keeps the shared signed-out state when switching from Models back to Plugins', async () => {
    let signedIn = true
    let logoutCalls = 0
    vi.stubGlobal('fetch', async (path: string) => {
      if (path === OPENAI_CODEX_AUTH_LOGOUT_PATH) { signedIn = false; logoutCalls++; return Response.json({ ok: true }) }
      return Response.json(signedIn ? { status: 'signed-in', usage: { rateLimits: [] } } : { status: 'signed-out' })
    })
    account = new OpenAICodexAccountStore()
    const shared = account
    function Pages() {
      const [models, setModels] = useState(true)
      return <>
        <button onClick={() => { setModels(!models) }}>Switch page</button>
        {models ? <OpenAICodexModelsCard t={t} account={shared} /> : <OpenAICodexSettings t={t} account={shared} embedded />}
      </>
    }
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    root.render(createElement(Pages))
    await expect.element(page.getByText('Openai-Codex', { exact: true })).toBeVisible()
    await expect.element(page.getByText(en.modelsProviderSupport, { exact: true })).toBeVisible()
    await page.getByRole('button', { name: en.manageAccount, exact: true }).click()
    await expect.element(page.getByText(en.modelsAccountHelp)).toBeVisible()
    await expect.element(page.getByText(en.signedIn, { exact: true })).toBeVisible()
    await page.getByRole('button', { name: en.logout, exact: true }).click()
    await expect.element(page.getByText(en.signedOut, { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Switch page' }).click()
    await expect.element(page.getByRole('button', { name: en.login, exact: true })).toBeVisible()
    expect(logoutCalls).toBe(1)
  })
})
