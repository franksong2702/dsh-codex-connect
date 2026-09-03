import { createElement, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { modelCatalogFixture } from '../model-catalog-fixture.ts'
import type { SettingsScope, SettingsScopeSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'
import { DEFAULT_OPENAI_CODEX_SETTINGS, resolveOpenAICodexSettings, type OpenAICodexSettingsConfig } from '../../src/settings-contract.ts'
import { OPENAI_CODEX_MODEL_CATALOG_PATH } from '../../src/model-contract.ts'
import { OpenAICodexConfiguration } from '../../src/client/OpenAICodexConfiguration.tsx'
import { OpenAICodexAccountStore } from '../../src/client/account-store.ts'
import { OpenAICodexModelsCard } from '../../src/client/OpenAICodexModelsCard.tsx'
import { OpenAICodexSettings } from '../../src/client/OpenAICodexSettings.tsx'
import { en } from '../../src/client/locales.ts'
import { OPENAI_CODEX_AUTH_ACCOUNTS_PATH, OPENAI_CODEX_AUTH_CANCEL_PATH, OPENAI_CODEX_AUTH_LOGIN_PATH, OPENAI_CODEX_AUTH_LOGOUT_PATH, OPENAI_CODEX_AUTH_STATUS_PATH } from '../../src/auth-paths.ts'

let root: Root | undefined
let host: HTMLDivElement | undefined
let account: OpenAICodexAccountStore | undefined
afterEach(() => { root?.unmount(); host?.remove(); account?.dispose(); vi.unstubAllGlobals() })
const t = (key: keyof typeof en) => en[key]

describe('Models account navigation', () => {
  it('shares saved configuration with the plugin entry, discards modal drafts and contains keyboard focus', async () => {
    let snapshot: SettingsScopeSnapshot<OpenAICodexSettingsConfig> = {
      status: 'ready', value: { ...DEFAULT_OPENAI_CODEX_SETTINGS }, base: { ...DEFAULT_OPENAI_CODEX_SETTINGS },
      user: undefined, revision: 0, writable: true, mode: 'host',
    }
    const listeners = new Set<() => void>()
    const set = vi.fn(async (field: string, value: unknown) => {
      snapshot = { ...snapshot, value: resolveOpenAICodexSettings({ ...snapshot.value!, [field]: value }), revision: (snapshot.revision ?? 0) + 1 }
      for (const listener of listeners) listener()
    })
    const scope: SettingsScope<OpenAICodexSettingsConfig> = {
      getSnapshot: () => snapshot, subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener) } },
      set, unset: vi.fn(), mutate: vi.fn(),
    }
    vi.stubGlobal('fetch', async (path: string) => Response.json(path === OPENAI_CODEX_MODEL_CATALOG_PATH
      ? modelCatalogFixture([{ id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol' }, { id: 'gpt-5.6-luna', name: 'GPT-5.6 Luna' }])
      : { status: 'signed-out', accounts: [] }))
    account = new OpenAICodexAccountStore()
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    root.render(<>
      <OpenAICodexModelsCard t={t} account={account} configScope={scope} />
      <section aria-label="Plugin configuration"><OpenAICodexConfiguration t={t} scope={scope} /></section>
    </>)
    const parentEscape = vi.fn((event: KeyboardEvent) => { if (event.key === 'Escape') throw new Error('Escape escaped the nested dialog') })
    document.addEventListener('keydown', parentEscape)
    try {
      await page.viewport(360, 800)
      const more = page.getByRole('button', { name: en.moreSettings, exact: true })
      await more.click()
      const dialog = page.getByRole('dialog', { name: en.moreSettingsTitle })
      await expect.element(dialog).toBeVisible()
      expect((dialog.element() as HTMLDialogElement).matches(':modal')).toBe(true)
      const bounds = dialog.element().getBoundingClientRect()
      expect(bounds.left).toBeGreaterThanOrEqual(0)
      expect(bounds.right).toBeLessThanOrEqual(window.innerWidth)
      expect(dialog.element().scrollWidth).toBeLessThanOrEqual(dialog.element().clientWidth)
      expect(dialog.element().contains(document.activeElement)).toBe(true)
      await userEvent.keyboard('{Shift>}{Tab}{/Shift}')
      expect(dialog.element().contains(document.activeElement)).toBe(true)
      const sol = dialog.getByRole('checkbox', { name: /GPT-5\.6 Sol/u })
      await sol.click()
      await dialog.getByRole('button', { name: en.save, exact: true }).click()
      await vi.waitFor(() => { expect(set).toHaveBeenCalledWith('models', ['gpt-5.6-luna']) })
      await dialog.getByRole('button', { name: en.closeSettings, exact: true }).click()
      await expect.element(more).toHaveFocus()
      const plugin = page.getByRole('region', { name: 'Plugin configuration' })
      await expect.element(plugin.getByRole('checkbox', { name: /GPT-5\.6 Sol/u })).not.toBeChecked()
      await plugin.getByRole('checkbox', { name: /GPT-5\.6 Sol/u }).click()
      await plugin.getByRole('button', { name: en.save, exact: true }).click()
      await vi.waitFor(() => { expect(set).toHaveBeenCalledTimes(2) })
      await more.click()
      await expect.element(sol).toBeChecked()
      await sol.click()
      await dialog.getByRole('button', { name: en.discard, exact: true }).click()
      await expect.element(sol).toBeChecked()
      await sol.click()
      await userEvent.keyboard('{Escape}')
      await expect.element(dialog).not.toBeInTheDocument()
      await expect.element(more).toHaveFocus()
      await more.click()
      await expect.element(sol).toBeChecked()
      expect(set).toHaveBeenCalledTimes(2)
      const modalModel = dialog.getByRole('group', { name: 'GPT-5.6 Sol', exact: true })
      await modalModel.getByRole('button', { name: en.contextAdjust, exact: true }).click()
      await modalModel.getByRole('spinbutton', { name: en.contextTokens }).fill('350000')
      await dialog.getByRole('button', { name: en.save, exact: true }).click()
      await vi.waitFor(() => { expect(snapshot.value?.contextWindowOverrides).toEqual({ 'gpt-5.6-sol': 350_000 }) })
      await dialog.getByRole('button', { name: en.closeSettings, exact: true }).click()
      const pluginModel = plugin.getByRole('group', { name: 'GPT-5.6 Sol', exact: true })
      await pluginModel.getByRole('button', { name: en.contextAdjust, exact: true }).click()
      await expect.element(pluginModel.getByRole('spinbutton', { name: en.contextTokens })).toHaveValue(350_000)
      await pluginModel.getByRole('button', { name: en.contextReset, exact: true }).click()
      await plugin.getByRole('button', { name: en.save, exact: true }).click()
      await vi.waitFor(() => { expect(snapshot.value?.contextWindowOverrides).toEqual({}) })
      await more.click()
      await modalModel.getByRole('button', { name: en.contextAdjust, exact: true }).click()
      await expect.element(modalModel.getByRole('spinbutton', { name: en.contextTokens })).toHaveValue(272_000)
      expect(set).toHaveBeenCalledTimes(4)
      await dialog.getByRole('button', { name: en.closeSettings, exact: true }).click()
    } finally {
      document.removeEventListener('keydown', parentEscape)
      await page.viewport(960, 800)
    }
  })
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
      return Response.json({ status: pending ? 'signing-in' : 'signed-out', accounts: [] })
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
    const current = { accountKey: `acct_${'a'.repeat(43)}`, active: true, displayName: 'Work account', maskedEmail: 'wo••@example.com', profileSource: 'oauth' }
    vi.stubGlobal('fetch', async (path: string) => {
      if (path === OPENAI_CODEX_AUTH_LOGOUT_PATH) { signedIn = false; logoutCalls++; return Response.json({ ok: true }) }
      return Response.json(signedIn
        ? { status: 'signed-in', usage: { rateLimits: [] }, accounts: [current] }
        : { status: 'signed-out', accounts: [] })
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
    await page.getByRole('button', { name: en.viewQuota, exact: true }).click()
    await expect.element(page.getByText(en.modelsAccountHelp)).toBeVisible()
    await expect.element(page.getByText(en.signedIn, { exact: true })).toBeVisible()
    await page.getByRole('button', { name: en.manageAccounts, exact: true }).click()
    await page.getByRole('button', { name: en.signOutAll, exact: true }).click()
    await expect.element(page.getByText(en.signedOut, { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Switch page' }).click()
    await expect.element(page.getByRole('button', { name: en.login, exact: true })).toBeVisible()
    expect(logoutCalls).toBe(1)
  })

  it('switches saved accounts without exposing raw account ids', async () => {
    const firstKey = `acct_${'a'.repeat(43)}`
    const secondKey = `acct_${'b'.repeat(43)}`
    let accounts = [
      { accountKey: firstKey, active: true, displayName: 'Work account', maskedEmail: 'wo••@example.com', profileSource: 'oauth' },
      { accountKey: secondKey, active: false, displayName: 'Personal account', maskedEmail: 'pe••@example.com', profileSource: 'oauth' },
    ]
    vi.stubGlobal('fetch', async (path: string, init?: RequestInit) => {
      if (path === OPENAI_CODEX_AUTH_STATUS_PATH) return Response.json({ status: 'signed-in', usage: { rateLimits: [] }, accounts })
      if (path === OPENAI_CODEX_AUTH_ACCOUNTS_PATH && init?.method === 'POST') {
        const body = JSON.parse(String(init.body)) as { accountKey: string }
        accounts = accounts.map(item => ({ ...item, active: item.accountKey === body.accountKey }))
        return Response.json({ status: 'signed-in', usage: { rateLimits: [] } })
      }
      if (path === OPENAI_CODEX_AUTH_ACCOUNTS_PATH) return Response.json({ accounts })
      throw new Error(`unexpected request ${path}`)
    })
    account = new OpenAICodexAccountStore()
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    root.render(<OpenAICodexModelsCard t={t} account={account} />)

    await expect.element(page.getByText('Work account', { exact: true }).first()).toBeVisible()
    await page.getByRole('button', { name: en.manageAccounts, exact: true }).click()
    expect(document.body.textContent).not.toContain('openai-account-id')
    await page.getByRole('button', { name: en.useAccount, exact: true }).click()
    await expect.element(page.getByText('Personal account', { exact: true }).first()).toBeVisible()
    await vi.waitFor(() => { expect(accounts.find(item => item.active)?.accountKey).toBe(secondKey) })
  })
})
