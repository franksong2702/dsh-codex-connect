import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { en, zh } from '../../src/client/locales.ts'
import { OpenAICodexUpdateOverlay, OpenAICodexUpdateSettings } from '../../src/client/OpenAICodexUpdateNotice.tsx'
import {
  OPENAI_CODEX_UPDATE_CACHE_KEY,
  OPENAI_CODEX_UPDATE_DISMISSED_KEY,
  OpenAICodexUpdateStore,
} from '../../src/client/update-store.ts'
import { OPENAI_CODEX_RUNTIME_PATH, OPENAI_CODEX_UPDATE_PATH } from '../../src/update-paths.ts'

function t(key: keyof typeof en, params: Record<string, unknown> = {}): string {
  return Object.entries(params).reduce(
    (value, [name, replacement]) => value.replace(`{${name}}`, String(replacement)),
    en[key],
  )
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } })
}

let host: HTMLDivElement
let root: Root
let updater: OpenAICodexUpdateStore | undefined

beforeEach(async () => {
  await page.viewport(1280, 800)
  localStorage.removeItem(OPENAI_CODEX_UPDATE_CACHE_KEY)
  localStorage.removeItem(OPENAI_CODEX_UPDATE_DISMISSED_KEY)
  host = document.createElement('div')
  host.style.width = '100%'
  host.style.boxSizing = 'border-box'
  document.body.append(host)
  root = createRoot(host)
})

afterEach(() => {
  updater?.dispose()
  updater = undefined
  root.unmount()
  host.remove()
  localStorage.removeItem(OPENAI_CODEX_UPDATE_CACHE_KEY)
  localStorage.removeItem(OPENAI_CODEX_UPDATE_DISMISSED_KEY)
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('Codex Connect update card in Chromium', () => {
  it.each([['English', en], ['Chinese', zh]] as const)('rechecks a negative overlay through failure and recovery in %s', async (_language, locale) => {
    const currentVersion = '0.1.0-alpha.4.29'
    const currentDshVersion = '0.1.2-rc.1'
    let state: 'not-yet-compatible' | 'offline' | 'compatible' = 'not-yet-compatible'
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
      if (String(input) === OPENAI_CODEX_RUNTIME_PATH) return json({ currentDshVersion })
      if (state === 'offline') throw new Error('offline')
      return json({ status: 'up-to-date', currentVersion, currentDshVersion, latestVersion: currentVersion,
        compatibility: { status: state, latestPluginVersion: currentVersion, latestDshVersion: currentDshVersion } })
    }))
    updater = new OpenAICodexUpdateStore(currentVersion)
    await updater.refresh()
    root.render(createElement(OpenAICodexUpdateOverlay, {
      updater,
      t: (key, params = {}) => Object.entries(params).reduce((value, [name, replacement]) => value.replace(`{${name}}`, String(replacement)), locale[key]),
      useSessions: vi.fn() as never, useWorkspaces: vi.fn() as never, useSessionPendingInteraction: vi.fn() as never,
    }))
    const overlay = page.getByRole('status', { name: locale.updateHeading })
    await vi.waitFor(() => expect(overlay.element().textContent).toContain(locale.compatibilityNotReadyTitle))
    expect(overlay.element().textContent).toContain(locale.updateLastChecked.split('{time}')[0])
    await page.viewport(360, 800)
    expect(overlay.element().getBoundingClientRect().right).toBeLessThanOrEqual(window.innerWidth)
    state = 'offline'
    await page.getByRole('button', { name: locale.checkForUpdates }).click()
    await vi.waitFor(() => expect(overlay.element().textContent).toContain(locale.updateCheckUnavailable))
    expect(overlay.element().textContent).not.toContain(locale.compatibilityNotReadyTitle)
    state = 'compatible'
    await page.getByRole('button', { name: locale.checkForUpdates }).click()
    await vi.waitFor(() => expect(host.querySelector('[role="status"]')).toBeNull())
    expect(updater.getSnapshot().compatibility?.status).toBe('compatible')
  })

  it('checks updates, shows each installed version once, and stays inside desktop and narrow viewports', async () => {
    const currentVersion = '0.1.0-alpha.4.16'
    const currentDshVersion = '0.1.1-rc.2'
    const fetchMock = vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
      const path = String(input)
      if (path === OPENAI_CODEX_RUNTIME_PATH) return json({ currentDshVersion })
      expect(path).toBe(OPENAI_CODEX_UPDATE_PATH)
      return json({
        status: 'up-to-date',
        currentVersion,
        currentDshVersion,
        latestVersion: currentVersion,
        compatibility: {
          status: 'compatible',
          latestPluginVersion: currentVersion,
          latestDshVersion: currentDshVersion,
        },
      })
    })
    vi.stubGlobal('fetch', fetchMock)
    updater = new OpenAICodexUpdateStore(currentVersion)
    root.render(createElement(OpenAICodexUpdateSettings, { updater, t }))

    const region = page.getByRole('region', { name: en.updateHeading })
    await page.getByRole('button', { name: en.checkForUpdates }).click()
    await vi.waitFor(() => {
      expect(region.element().textContent).toContain(en.compatibilityCurrentTitle)
    })

    const desktopRegion = region.element()
    expect(desktopRegion.scrollWidth).toBeLessThanOrEqual(desktopRegion.clientWidth)
    const desktopText = desktopRegion.textContent ?? ''
    expect(desktopText.split(currentVersion)).toHaveLength(2)
    expect(desktopText.split(currentDshVersion)).toHaveLength(2)
    expect(desktopText).toContain(en.compatibilityPluginSame.replace('{version}', currentVersion))
    expect(desktopText).toContain(en.compatibilityDshSame.replace('{version}', currentDshVersion))

    await page.viewport(360, 800)
    await vi.waitFor(() => {
      const narrowRegion = region.element()
      expect(narrowRegion.getBoundingClientRect().right).toBeLessThanOrEqual(window.innerWidth)
      expect(narrowRegion.scrollWidth).toBeLessThanOrEqual(narrowRegion.clientWidth)
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(localStorage.getItem(OPENAI_CODEX_UPDATE_CACHE_KEY)).toContain('up-to-date')
  })
})
