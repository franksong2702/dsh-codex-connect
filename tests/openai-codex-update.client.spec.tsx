// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { en, zh } from '../src/client/locales.ts'
import { OpenAICodexUpdateOverlay, OpenAICodexUpdateSettings } from '../src/client/OpenAICodexUpdateNotice.tsx'
import {
  OPENAI_CODEX_UPDATE_CACHE_KEY,
  OPENAI_CODEX_UPDATE_DISMISSED_KEY,
  OPENAI_CODEX_REPOSITORY_URL,
  OpenAICodexUpdateStore,
} from '../src/client/update-store.ts'
import { OPENAI_CODEX_UPDATE_PATH } from '../src/update-paths.ts'

function t(key: keyof typeof en, params: Record<string, unknown> = {}): string {
  return Object.entries(params).reduce(
    (value, [name, replacement]) => value.replace(`{${name}}`, String(replacement)),
    en[key],
  )
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } })
}

function storageFixture(): Storage {
  const values = new Map<string, string>()
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value) },
    removeItem: key => { values.delete(key) },
    clear: () => { values.clear() },
    key: index => [...values.keys()][index] ?? null,
    get length() { return values.size },
  } as Storage
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('Codex Connect global update reminder', () => {
  it('shows release notes and copies the Agent prompt, then remembers dismissal', async () => {
    const fetchMock = vi.fn(async (input: string): Promise<Response> => {
      expect(input).toBe(OPENAI_CODEX_UPDATE_PATH)
      return json({
        status: 'update-available',
        currentVersion: '0.1.0-alpha.4.14',
        currentDshVersion: '0.1.1-rc.1',
        latestVersion: '0.1.0-alpha.4.15',
        compatibility: {
          status: 'plugin-update-required',
          latestPluginVersion: '0.1.0-alpha.4.15',
          latestDshVersion: '0.1.1-rc.2',
        },
        releaseUrl: 'https://github.com/franksong2702/dsh-codex-connect/releases/tag/v0.1.0-alpha.4.15',
        versionsBehind: 1,
        highlights: [
          { version: '0.1.0-alpha.4.12', kind: 'image-generation' },
          { version: '0.1.0-alpha.4.15', kind: 'model-visibility' },
          { version: '0.1.0-alpha.4.20', kind: 'proxy-connection' },
          { version: '0.1.0-alpha.4.22', kind: 'models-account' },
          { version: '0.1.0-alpha.4.22', kind: 'context-budget' },
          { version: '0.1.0-alpha.4.23', kind: 'auto-review-probe' },
          { version: '0.1.0-alpha.4.24', kind: 'auto-review' },
          { version: '0.1.0-alpha.4.27', kind: 'astra-compatibility' },
          { version: '0.1.0-alpha.4.27', kind: 'multi-account' },
          { version: '0.1.0-alpha.4.27', kind: 'search-route' },
          { version: '0.1.0-alpha.4.27', kind: 'proxy-connection' },
        ],
        releaseName: 'Alpha 4.15',
        releaseNotes: '## What changed\n- Manual upgrade command\n\n**Full Changelog**: https://github.com/franksong2702/dsh-codex-connect/compare/v0.1.0-alpha.4.14...v0.1.0-alpha.4.15',
      })
    })
    const writeText = vi.fn(async (): Promise<void> => undefined)
    const browserStorage = storageFixture()
    vi.stubGlobal('localStorage', browserStorage)
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const updater = new OpenAICodexUpdateStore('0.1.0-alpha.4.14')
    await act(async () => { await updater.refresh(true) })

    render(<OpenAICodexUpdateOverlay updater={updater} t={t} useSessions={vi.fn() as never} useWorkspaces={vi.fn() as never} useSessionPendingInteraction={vi.fn() as never} />)
    const initialStatusText = screen.getByRole('status').textContent ?? ''
    expect(initialStatusText).toContain(en.compatibilityPluginDifferent
      .replace('{current}', '0.1.0-alpha.4.14')
      .replace('{latest}', '0.1.0-alpha.4.15'))
    expect(screen.getByRole('status').textContent).toContain(en.versionsBehind.replace('{count}', '1'))
    expect(screen.getByRole('status').textContent).toContain(en.whatMatters)
    expect(screen.getByRole('status').textContent).toContain(en.updateHighlightImageGeneration)
    expect(screen.getByRole('status').textContent).toContain(en.updateHighlightModelVisibility)
    expect(screen.getByRole('status').textContent).toContain(en.updateHighlightProxyConnection)
    expect(screen.getByRole('status').textContent).toContain(en.updateHighlightModelsAccount)
    expect(screen.getByRole('status').textContent).toContain(en.updateHighlightContextBudget)
    expect(screen.getByRole('status').textContent).toContain(en.updateHighlightAutoReviewProbe)
    expect(screen.getByRole('status').textContent).toContain(en.updateHighlightAutoReview)
    expect(screen.getByRole('status').textContent).toContain(en.updateHighlightAstraCompatibility)
    expect(screen.getByRole('status').textContent).toContain(en.updateHighlightMultiAccount)
    expect(screen.getByRole('status').textContent).toContain(en.updateHighlightSearchRoute)
    expect(screen.getByRole('status').textContent).toContain(en.upgradeStepsHeading)
    expect(screen.getByRole('status').textContent).toContain(en.agentUpgradePrompt.replace('{repository}', OPENAI_CODEX_REPOSITORY_URL))
    expect(screen.getByRole('status').textContent).not.toContain('dsh plugin --profile')
    fireEvent.click(screen.getByRole('button', { name: en.viewTechnicalDetails }))
    expect(screen.getByRole('status').textContent).toContain('Manual upgrade command')
    expect(screen.getByRole('heading', { name: en.technicalDetailsHeading })).toBeTruthy()
    expect(screen.getByRole('link', { name: en.viewFullChangelog })).toBeTruthy()
    expect(screen.getByRole('link', { name: en.openReleasePage })).toBeTruthy()
    expect(screen.getAllByRole('listitem')[0]?.textContent).not.toMatch(/^1\./u)
    fireEvent.click(screen.getByRole('button', { name: en.copyForAgent }))
    await waitFor(() => { expect(writeText).toHaveBeenCalledWith(en.agentUpgradePrompt.replace('{repository}', OPENAI_CODEX_REPOSITORY_URL)) })
    expect(screen.getByText(en.agentPromptCopied)).toBeTruthy()

    const recheck = screen.getByRole('button', { name: en.recheckAfterUpgrade }) as HTMLButtonElement
    expect(recheck.style.background).toBe('var(--dsw-alias-button-primary-fill)')
    expect(recheck.style.color).toBe('var(--dsw-alias-label-primary-foreground)')
    fireEvent.click(recheck)
    await waitFor(() => { expect(fetchMock).toHaveBeenCalledTimes(2) })
    expect(screen.getByRole('status').textContent).toContain(en.upgradeStillAvailable.replace('{version}', '0.1.0-alpha.4.14'))

    fireEvent.click(screen.getByRole('button', { name: en.dismissUpdate }))
    expect(screen.queryByRole('status')).toBeNull()
    expect(browserStorage.getItem(OPENAI_CODEX_UPDATE_DISMISSED_KEY)).toBe('0.1.0-alpha.4.14:0.1.0-alpha.4.15')
    updater.dispose()
  })

  it('shows the plugin version once without displaying the host version', async () => {
    const fetchMock = vi.fn(async (input: string): Promise<Response> => {
      expect(input).toBe(OPENAI_CODEX_UPDATE_PATH)
      return json({
        status: 'up-to-date',
        currentVersion: '0.1.0-alpha.4.14',
        currentDshVersion: '0.1.1-rc.2',
        latestVersion: '0.1.0-alpha.4.14',
        compatibility: {
          status: 'compatible',
          latestPluginVersion: '0.1.0-alpha.4.14',
          latestDshVersion: '0.1.1-rc.2',
        },
      })
    })
    const browserStorage = storageFixture()
    vi.stubGlobal('localStorage', browserStorage)
    vi.stubGlobal('fetch', fetchMock)
    const updater = new OpenAICodexUpdateStore('0.1.0-alpha.4.14')
    render(<OpenAICodexUpdateSettings updater={updater} t={t} />)
    fireEvent.click(screen.getByRole('button', { name: en.checkForUpdates }))

    await waitFor(() => { expect(screen.getByRole('region').textContent).toContain(en.upgradeCheckSuccess) })
    const cardText = screen.getByRole('region').textContent ?? ''
    expect(cardText).toContain(en.compatibilityPluginSame.replace('{version}', '0.1.0-alpha.4.14'))
    expect(cardText.split('0.1.0-alpha.4.14')).toHaveLength(2)
    expect(cardText).not.toContain(en.upToDate.replace('{version}', '0.1.0-alpha.4.14'))
    expect(cardText).not.toContain(en.currentVersion.replace('{version}', '0.1.0-alpha.4.14'))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(zh.dismissUpdate).toBe('稍后提醒')
    expect(browserStorage.getItem(OPENAI_CODEX_UPDATE_CACHE_KEY)).toContain('up-to-date')
    updater.dispose()
  })

  it('rechecks release metadata after the installed plugin version changes', async () => {
    const browserStorage = storageFixture()
    browserStorage.setItem(OPENAI_CODEX_UPDATE_CACHE_KEY, JSON.stringify({
      checkedAt: Date.now(),
      result: {
        status: 'up-to-date',
        currentVersion: '0.1.0-alpha.4.15',
        currentDshVersion: '0.1.1-rc.2',
        latestVersion: '0.1.0-alpha.4.15',
        compatibility: {
          status: 'compatible',
          latestPluginVersion: '0.1.0-alpha.4.15',
          latestDshVersion: '0.1.1-rc.2',
        },
      },
    }))
    const fetchMock = vi.fn(async (input: string): Promise<Response> => {
      expect(input).toBe(OPENAI_CODEX_UPDATE_PATH)
      return json({
        status: 'up-to-date',
        currentVersion: '0.1.0-alpha.4.16',
        currentDshVersion: '0.1.1-rc.2',
        latestVersion: '0.1.0-alpha.4.16',
        compatibility: {
          status: 'compatible',
          latestPluginVersion: '0.1.0-alpha.4.16',
          latestDshVersion: '0.1.1-rc.2',
        },
      })
    })
    vi.stubGlobal('localStorage', browserStorage)
    vi.stubGlobal('fetch', fetchMock)
    const updater = new OpenAICodexUpdateStore('0.1.0-alpha.4.16')

    await act(async () => { await updater.refresh() })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(updater.getSnapshot().currentVersion).toBe('0.1.0-alpha.4.16')
    updater.dispose()
  })

  it('aborts an in-flight global check when the client plugin unloads', async () => {
    const browserStorage = storageFixture()
    vi.stubGlobal('localStorage', browserStorage)
    let signal: AbortSignal | undefined
    vi.stubGlobal('fetch', vi.fn((_input: string, init?: RequestInit): Promise<Response> => {
      signal = init?.signal ?? undefined
      return new Promise((_resolve, reject) => {
        signal?.addEventListener('abort', () => { reject(signal?.reason) }, { once: true })
      })
    }))
    const updater = new OpenAICodexUpdateStore('0.1.0-alpha.4.14')
    const pending = updater.refresh(true)
    updater.dispose()
    await expect(pending).resolves.toBeUndefined()
    expect(signal?.aborted).toBe(true)
  })

  it('does not cache a transient unavailable result for a full day', async () => {
    const browserStorage = storageFixture()
    vi.stubGlobal('localStorage', browserStorage)
    vi.stubGlobal('fetch', vi.fn(async (): Promise<Response> => json({ error: 'temporary' }, 503)))
    const updater = new OpenAICodexUpdateStore('0.1.0-alpha.4.14')
    await act(async () => { await updater.refresh(true) })
    expect(updater.getSnapshot().status).toBe('unavailable')
    expect(browserStorage.getItem(OPENAI_CODEX_UPDATE_CACHE_KEY)).toBeNull()
    updater.dispose()
  })
})

describe('Codex Connect plugin update reminder', () => {
  it('checks only plugin update metadata and ignores legacy host fields', async () => {
    const fetchMock = vi.fn(async (input: string): Promise<Response> => {
      expect(input).toBe(OPENAI_CODEX_UPDATE_PATH)
      return json({
        status: 'up-to-date',
        currentVersion: '0.1.0-alpha.4.14',
        latestVersion: '0.1.0-alpha.4.14',
        currentDshVersion: '0.1.3-alpha.1',
        compatibility: { status: 'incompatible' },
      })
    })
    vi.stubGlobal('localStorage', storageFixture())
    vi.stubGlobal('fetch', fetchMock)
    const updater = new OpenAICodexUpdateStore('0.1.0-alpha.4.14')
    await act(async () => { await updater.refresh(true) })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(updater.getSnapshot()).not.toHaveProperty('currentDshVersion')
    expect(updater.getSnapshot()).not.toHaveProperty('compatibility')
    render(<OpenAICodexUpdateSettings updater={updater} t={t} />)
    expect(screen.getByRole('region').textContent).toContain(en.compatibilityPluginSame.replace('{version}', '0.1.0-alpha.4.14'))
    updater.dispose()
  })
})
