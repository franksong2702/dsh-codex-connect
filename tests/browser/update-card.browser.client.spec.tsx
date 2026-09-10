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
import { OPENAI_CODEX_UPDATE_PATH } from '../../src/update-paths.ts'

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

describe('Codex Connect plugin update card in Chromium', () => {
  it.each([['English', en], ['Chinese', zh]] as const)('rechecks a plugin overlay through failure and recovery in %s', async (_language, locale) => {
    const currentVersion = '0.1.0-alpha.4.29'
    const latestVersion = '0.1.0-alpha.4.32'
    let state: 'update-available' | 'offline' | 'up-to-date' = 'update-available'
    const fetchMock = vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
      expect(String(input)).toBe(OPENAI_CODEX_UPDATE_PATH)
      if (state === 'offline') throw new Error('offline')
      return json({
        status: state, currentVersion, latestVersion: state === 'up-to-date' ? currentVersion : latestVersion,
        releaseUrl: 'https://github.com/franksong2702/dsh-codex-connect/releases/tag/v' + latestVersion,
        highlights: [], currentDshVersion: '0.1.3-alpha.1',
        compatibility: { status: 'not-yet-compatible', latestDshVersion: '0.1.2-rc.1' },
      })
    })
    vi.stubGlobal('fetch', fetchMock)
    updater = new OpenAICodexUpdateStore(currentVersion)
    await updater.refresh()
    root.render(createElement(OpenAICodexUpdateOverlay, {
      updater,
      t: (key, params = {}) => Object.entries(params).reduce((value, [name, replacement]) => value.replace(`{${name}}`, String(replacement)), locale[key]),
      useSessions: vi.fn() as never, useWorkspaces: vi.fn() as never, useSessionPendingInteraction: vi.fn() as never,
      ...{ usePanelInfo: vi.fn() as never },
    }))
    const overlay = page.getByRole('status', { name: locale.updateHeading })
    await vi.waitFor(() => expect(overlay.element().textContent).toContain(latestVersion))
    expect(overlay.element().textContent).toContain(locale.updateLastChecked.split('{time}')[0])
    expect(overlay.element().textContent).not.toContain('0.1.3-alpha.1')
    expect(overlay.element().textContent).not.toContain('0.1.2-rc.1')
    expect(overlay.element().querySelector('[data-compatibility-status]')).toBeNull()
    await page.viewport(360, 800)
    expect(overlay.element().getBoundingClientRect().right).toBeLessThanOrEqual(window.innerWidth)
    expect(overlay.element().scrollWidth).toBeLessThanOrEqual(overlay.element().clientWidth)
    state = 'offline'
    await page.getByRole('button', { name: locale.recheckAfterUpgrade }).click()
    await vi.waitFor(() => expect(overlay.element().textContent).toContain(locale.updateCheckUnavailable))
    state = 'up-to-date'
    await page.getByRole('button', { name: locale.checkForUpdates }).click()
    await vi.waitFor(() => expect(host.querySelector('[role="status"]')).toBeNull())
    expect(updater.getSnapshot().status).toBe('up-to-date')
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('shows the plugin version once and fits desktop and narrow viewports', async () => {
    const currentVersion = '0.1.0-alpha.4.16'
    const fetchMock = vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
      expect(String(input)).toBe(OPENAI_CODEX_UPDATE_PATH)
      return json({ status: 'up-to-date', currentVersion, latestVersion: currentVersion, currentDshVersion: '0.1.3-alpha.1', compatibility: { status: 'incompatible' } })
    })
    vi.stubGlobal('fetch', fetchMock)
    updater = new OpenAICodexUpdateStore(currentVersion)
    root.render(createElement(OpenAICodexUpdateSettings, { updater, t }))
    await page.getByRole('button', { name: en.checkForUpdates }).click()
    const region = page.getByRole('region', { name: en.updateHeading })
    await vi.waitFor(() => expect(region.element().textContent).toContain(en.upgradeCheckSuccess))
    expect(region.element().textContent?.split(currentVersion)).toHaveLength(2)
    expect(region.element().textContent).not.toContain('0.1.3-alpha.1')
    expect(region.element().scrollWidth).toBeLessThanOrEqual(region.element().clientWidth)
    await page.viewport(360, 800)
    await vi.waitFor(() => {
      expect(region.element().getBoundingClientRect().right).toBeLessThanOrEqual(window.innerWidth)
      expect(region.element().scrollWidth).toBeLessThanOrEqual(region.element().clientWidth)
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(updater.getSnapshot()).not.toHaveProperty('currentDshVersion')
    expect(updater.getSnapshot()).not.toHaveProperty('compatibility')
    expect(localStorage.getItem(OPENAI_CODEX_UPDATE_CACHE_KEY)).toContain('up-to-date')
  })
})
