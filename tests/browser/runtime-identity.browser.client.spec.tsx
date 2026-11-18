import { createElement, StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { OpenAICodexRuntimeIdentity } from '../../src/client/OpenAICodexRuntimeIdentity.tsx'
import { en, zh } from '../../src/client/locales.ts'
import { OPENAI_CODEX_RUNTIME_PATH } from '../../src/update-paths.ts'
import { CODEX_CONNECT_VERSION } from '../../src/version.ts'
import { inconsistentRuntimeReports, runtimeReport } from '../runtime-identity-fixtures.ts'

let host: HTMLDivElement
let root: Root | undefined
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status })
const translate = (locale: typeof en | typeof zh) => (key: keyof typeof en, params: Record<string, unknown> = {}): string =>
  Object.entries(params).reduce((value, [name, replacement]) => value.replace(`{${name}}`, String(replacement)), locale[key])

beforeEach(async () => {
  await page.viewport(1280, 800)
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(() => {
  root?.unmount()
  root = undefined
  host.remove()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('runtime identity in Chromium', () => {
  it.each([['English', en], ['Chinese', zh]] as const)('shows the three identities and a bounded receipt in %s', async (_language, locale) => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe(OPENAI_CODEX_RUNTIME_PATH)
      expect(init).toMatchObject({ method: 'GET', credentials: 'same-origin', cache: 'no-store' })
      return json(runtimeReport(CODEX_CONNECT_VERSION))
    })
    vi.stubGlobal('fetch', fetchMock)
    root!.render(createElement(OpenAICodexRuntimeIdentity, { t: translate(locale) }))
    const region = page.getByRole('region', { name: locale.runtimeHeading })
    await vi.waitFor(() => expect(region.element().textContent).toContain(locale.runtimeVersionsMatch))
    expect(region.element().querySelector('dl')?.textContent).toContain(locale.runtimeClientVersion)
    expect(region.element().querySelector('dl')?.textContent).toContain(locale.runtimeHostVersion)
    expect(region.element().querySelector('dl')?.textContent).toContain(locale.runtimeInstalledVersion)
    expect(region.element().querySelector('dl')?.textContent).toContain('0.2.1-alpha.1')
    expect(region.element().textContent).toContain(locale.runtimeEvidenceBoundary)
    await page.viewport(360, 800)
    await vi.waitFor(() => {
      expect(region.element().getBoundingClientRect().right).toBeLessThanOrEqual(window.innerWidth)
      expect(region.element().scrollWidth).toBeLessThanOrEqual(region.element().clientWidth)
    })
    await page.getByText(locale.runtimeReceipt, { exact: true }).click()
    const receipt = JSON.parse(region.element().querySelector('pre')!.textContent!)
    expect(receipt.client.loadedPluginVersion).toBe(CODEX_CONNECT_VERSION)
    expect(receipt.observation).toBe('same-origin-host-response')
    expect(receipt.limitations).toContain('version-declarations-not-artifact-hashes')
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('clears an earlier match when a fresh recheck is refused and preserves this page version', async () => {
    let allowed = true
    vi.stubGlobal('fetch', vi.fn(async () => json(runtimeReport(CODEX_CONNECT_VERSION), allowed ? 200 : 401)))
    root!.render(createElement(OpenAICodexRuntimeIdentity, { t: translate(en) }))
    const region = page.getByRole('region', { name: en.runtimeHeading })
    await vi.waitFor(() => expect(region.element().textContent).toContain(en.runtimeVersionsMatch))
    allowed = false
    await page.getByRole('button', { name: en.runtimeRecheck }).click()
    await vi.waitFor(() => expect(region.element().textContent).toContain(en.runtimeUnavailable))
    expect(region.element().querySelector('[data-runtime-version-state]')?.getAttribute('data-runtime-version-state')).toBe('unknown')
    expect(region.element().querySelector('dl')?.textContent).toContain(CODEX_CONNECT_VERSION)
    expect(region.element().querySelector('dl')?.textContent).not.toContain('0.2.1-alpha.1')
    const receipt = JSON.parse(region.element().querySelector('pre')!.textContent!)
    expect(receipt.observation).toBe('host-not-observed')
    expect(receipt).not.toHaveProperty('host')
  })

  it.each(inconsistentRuntimeReports().slice(0, 2))('clears a previous match after $name is returned', async ({ report }) => {
    let response = runtimeReport(CODEX_CONNECT_VERSION)
    vi.stubGlobal('fetch', vi.fn(async () => json(response)))
    root!.render(createElement(OpenAICodexRuntimeIdentity, { t: translate(en) }))
    const region = page.getByRole('region', { name: en.runtimeHeading })
    await vi.waitFor(() => expect(region.element().textContent).toContain(en.runtimeVersionsMatch))
    response = report
    await page.getByRole('button', { name: en.runtimeRecheck }).click()
    await vi.waitFor(() => expect(region.element().textContent).toContain(en.runtimeUnavailable))
    expect(region.element().querySelector('[data-runtime-version-state]')?.getAttribute('data-runtime-version-state')).toBe('unknown')
    const receipt = JSON.parse(region.element().querySelector('pre')!.textContent!)
    expect(receipt.observation).toBe('host-not-observed')
    expect(receipt).not.toHaveProperty('host')
    expect(receipt.client.loadedPluginVersion).toBe(CODEX_CONNECT_VERSION)
  })

  it('shows a stale page separately from a changed installation, without auto refresh/restart', async () => {
    const otherVersion = CODEX_CONNECT_VERSION === '0.2.0-alpha.5' ? '0.2.0-alpha.6' : '0.2.0-alpha.5'
    vi.stubGlobal('fetch', vi.fn(async () => json(runtimeReport(otherVersion))))
    root!.render(createElement(OpenAICodexRuntimeIdentity, { t: translate(en) }))
    const region = page.getByRole('region', { name: en.runtimeHeading })
    await vi.waitFor(() => expect(region.element().textContent).toContain(en.runtimeVersionsMismatch))
    expect(region.element().textContent).toContain(en.runtimeMismatchHelp)
    expect(region.element().querySelector('dl')?.textContent).toContain(CODEX_CONNECT_VERSION)
    expect(region.element().querySelector('dl')?.textContent).toContain(otherVersion)
    expect(region.element().querySelector('a')).toBeNull()
  })

  it('does not publish a late response after unmount', async () => {
    let resolve!: (response: Response) => void
    let signal: AbortSignal | undefined
    vi.stubGlobal('fetch', vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      signal = init?.signal as AbortSignal
      return new Promise<Response>(done => { resolve = done })
    }))
    root!.render(createElement(OpenAICodexRuntimeIdentity, { t: translate(en) }))
    await vi.waitFor(() => expect(signal).toBeDefined())
    root!.unmount()
    root = undefined
    expect(signal!.aborted).toBe(true)
    resolve(json(runtimeReport(CODEX_CONNECT_VERSION)))
    await Promise.resolve()
    expect(host.textContent).toBe('')
  })

  it('still obtains fresh evidence under StrictMode effect replay', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(runtimeReport(CODEX_CONNECT_VERSION))))
    root!.render(createElement(StrictMode, null, createElement(OpenAICodexRuntimeIdentity, { t: translate(en) })))
    await vi.waitFor(() => expect(host.textContent).toContain(en.runtimeVersionsMatch))
  })
})
