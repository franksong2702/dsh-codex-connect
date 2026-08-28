import { createElement, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { OpenAICodexAccountStore } from '../../src/client/account-store.ts'
import { OpenAICodexModelsCard } from '../../src/client/OpenAICodexModelsCard.tsx'
import { OpenAICodexSettings } from '../../src/client/OpenAICodexSettings.tsx'
import { en } from '../../src/client/locales.ts'
import { OPENAI_CODEX_AUTH_LOGOUT_PATH } from '../../src/auth-paths.ts'

let root: Root | undefined
let host: HTMLDivElement | undefined
let account: OpenAICodexAccountStore | undefined
afterEach(() => { root?.unmount(); host?.remove(); account?.dispose(); vi.unstubAllGlobals() })
const t = (key: keyof typeof en) => en[key]

describe('Models account navigation', () => {
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
    await expect.element(page.getByText(en.modelsAccountHelp)).toBeVisible()
    await expect.element(page.getByText(en.signedIn, { exact: true })).toBeVisible()
    await page.getByRole('button', { name: en.logout, exact: true }).click()
    await expect.element(page.getByText(en.signedOut, { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Switch page' }).click()
    await expect.element(page.getByRole('button', { name: en.login, exact: true })).toBeVisible()
    expect(logoutCalls).toBe(1)
  })
})
