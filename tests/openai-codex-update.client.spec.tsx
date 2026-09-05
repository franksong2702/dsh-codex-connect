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
import { OPENAI_CODEX_RUNTIME_PATH, OPENAI_CODEX_UPDATE_PATH } from '../src/update-paths.ts'

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
      if (input === OPENAI_CODEX_RUNTIME_PATH) return json({ currentDshVersion: '0.1.1-rc.1' })
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
    expect(document.querySelector('[data-compatibility-status="plugin-update-required"]')).toBeTruthy()
    const initialStatusText = screen.getByRole('status').textContent ?? ''
    expect(initialStatusText).toContain(en.compatibilityPluginUpdateTitle)
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
    await waitFor(() => { expect(fetchMock).toHaveBeenCalledTimes(4) })
    expect(screen.getByRole('status').textContent).toContain(en.upgradeStillAvailable.replace('{version}', '0.1.0-alpha.4.14'))

    fireEvent.click(screen.getByRole('button', { name: en.dismissUpdate }))
    expect(screen.queryByRole('status')).toBeNull()
    expect(browserStorage.getItem(OPENAI_CODEX_UPDATE_DISMISSED_KEY)).toBe('0.1.0-alpha.4.14:0.1.0-alpha.4.15:0.1.1-rc.1:0.1.1-rc.2:plugin-update-required:no-report')
    updater.dispose()
  })

  it('shows each current version once when DSH and Codex Connect are up to date', async () => {
    const fetchMock = vi.fn(async (input: string): Promise<Response> => {
      if (input === OPENAI_CODEX_RUNTIME_PATH) return json({ currentDshVersion: '0.1.1-rc.2' })
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

    await waitFor(() => { expect(screen.getByRole('region').textContent).toContain(en.compatibilityCurrentTitle) })
    expect(document.querySelector('[data-compatibility-status="compatible"]')).toBeTruthy()
    const cardText = screen.getByRole('region').textContent ?? ''
    expect(cardText).toContain(en.compatibilityDshSame.replace('{version}', '0.1.1-rc.2'))
    expect(cardText).toContain(en.compatibilityPluginSame.replace('{version}', '0.1.0-alpha.4.14'))
    expect(cardText.split('0.1.1-rc.2')).toHaveLength(2)
    expect(cardText.split('0.1.0-alpha.4.14')).toHaveLength(2)
    expect(cardText).not.toContain(en.upToDate.replace('{version}', '0.1.0-alpha.4.14'))
    expect(cardText).not.toContain(en.currentVersion.replace('{version}', '0.1.0-alpha.4.14'))
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(zh.dismissUpdate).toBe('稍后提醒')
    expect(browserStorage.getItem(OPENAI_CODEX_UPDATE_CACHE_KEY)).toContain('up-to-date')
    updater.dispose()
  })

  it('shows a separate prefilled maintainer report when the latest DSH has no verified plugin', async () => {
    const browserStorage = storageFixture()
    vi.stubGlobal('localStorage', browserStorage)
    vi.stubGlobal('fetch', vi.fn(async (input: string): Promise<Response> => input === OPENAI_CODEX_RUNTIME_PATH
      ? json({ currentDshVersion: '0.1.1-rc.3' })
      : json({
      status: 'up-to-date',
      currentVersion: '0.1.0-alpha.4.15',
      currentDshVersion: '0.1.1-rc.3',
      latestVersion: '0.1.0-alpha.4.15',
      compatibility: {
        status: 'not-yet-compatible',
        latestPluginVersion: '0.1.0-alpha.4.15',
        latestDshVersion: '0.1.1-rc.3',
        reportCompatibilityGap: true,
      },
    })))
    const updater = new OpenAICodexUpdateStore('0.1.0-alpha.4.15')
    await act(async () => { await updater.refresh(true) })

    render(<OpenAICodexUpdateOverlay updater={updater} t={t} useSessions={vi.fn() as never} useWorkspaces={vi.fn() as never} useSessionPendingInteraction={vi.fn() as never} />)
    expect(document.querySelector('[data-compatibility-status="not-yet-compatible"]')).toBeTruthy()
    expect(screen.getByRole('status').textContent).toContain(en.compatibilityNotReadyBody)
    const reminder = screen.getByRole('link', { name: en.compatibilityReport }) as HTMLAnchorElement
    const issueUrl = new URL(reminder.href)
    expect(issueUrl.origin + issueUrl.pathname).toBe(`${OPENAI_CODEX_REPOSITORY_URL}/issues/new`)
    expect(issueUrl.searchParams.get('title')).toContain('DSH 0.1.1-rc.3')
    expect(issueUrl.searchParams.get('body')).toContain('0.1.0-alpha.4.15')
    expect(issueUrl.searchParams.get('body')).toContain('DSH 0.1.1-rc.3')
    expect(issueUrl.searchParams.get('body')).toContain('does not claim')
    updater.dispose()
  })

  it('opens the canonical compatibility tracker when the server finds one', async () => {
    const browserStorage = storageFixture()
    vi.stubGlobal('localStorage', browserStorage)
    vi.stubGlobal('fetch', vi.fn(async (input: string): Promise<Response> => input === OPENAI_CODEX_RUNTIME_PATH
      ? json({ currentDshVersion: '0.1.2-alpha.6' })
      : json({
          status: 'up-to-date',
          currentVersion: '0.1.0-alpha.4.24',
          currentDshVersion: '0.1.2-alpha.6',
          latestVersion: '0.1.0-alpha.4.24',
          compatibility: {
            status: 'not-yet-compatible',
            latestPluginVersion: '0.1.0-alpha.4.24',
            latestDshVersion: '0.1.2-alpha.5',
            reportCompatibilityGap: true,
            trackerUrl: 'https://github.com/franksong2702/dsh-codex-connect/issues/123',
          },
        })))
    const updater = new OpenAICodexUpdateStore('0.1.0-alpha.4.24')
    await act(async () => { await updater.refresh(true) })

    render(<OpenAICodexUpdateOverlay updater={updater} t={t} useSessions={vi.fn() as never} useWorkspaces={vi.fn() as never} useSessionPendingInteraction={vi.fn() as never} />)
    const tracker = screen.getByRole('link', { name: en.compatibilityViewTracker }) as HTMLAnchorElement
    expect(tracker.href).toBe('https://github.com/franksong2702/dsh-codex-connect/issues/123')
    expect(screen.queryByRole('link', { name: en.compatibilityReport })).toBeNull()
    updater.dispose()
  })

  it('recommends updating DSH instead of asking the user to report a known upgrade path', async () => {
    const browserStorage = storageFixture()
    vi.stubGlobal('localStorage', browserStorage)
    vi.stubGlobal('fetch', vi.fn(async (input: string): Promise<Response> => input === OPENAI_CODEX_RUNTIME_PATH
      ? json({ currentDshVersion: '0.1.2-alpha.2' })
      : json({
          status: 'up-to-date',
          currentVersion: '0.1.0-alpha.4.24',
          currentDshVersion: '0.1.2-alpha.2',
          latestVersion: '0.1.0-alpha.4.24',
          compatibility: {
            status: 'dsh-update-required',
            latestPluginVersion: '0.1.0-alpha.4.24',
            latestDshVersion: '0.1.2-alpha.5',
          },
        })))
    const updater = new OpenAICodexUpdateStore('0.1.0-alpha.4.24')
    await act(async () => { await updater.refresh(true) })

    render(<OpenAICodexUpdateOverlay updater={updater} t={t} useSessions={vi.fn() as never} useWorkspaces={vi.fn() as never} useSessionPendingInteraction={vi.fn() as never} />)
    const notice = screen.getByRole('status')
    expect(document.querySelector('[data-compatibility-status="dsh-update-required"]')).toBeTruthy()
    expect(notice.textContent).toContain(en.compatibilityDshUpdateTitle)
    expect(notice.textContent).toContain('This exact Codex Connect and DSH combination has not been verified')
    expect(screen.queryByRole('link', { name: en.compatibilityReport })).toBeNull()
    const dshRelease = screen.getByRole('link', { name: 'Open DSH 0.1.2-alpha.5 release' }) as HTMLAnchorElement
    expect(dshRelease.href).toBe('https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.2-alpha.5')
    updater.dispose()
  })

  it('keeps a historical exact pair green while still showing the latest DSH version', async () => {
    const browserStorage = storageFixture()
    vi.stubGlobal('localStorage', browserStorage)
    vi.stubGlobal('fetch', vi.fn(async (input: string): Promise<Response> => input === OPENAI_CODEX_RUNTIME_PATH
      ? json({ currentDshVersion: '0.1.0-rc.7' })
      : json({
          status: 'up-to-date',
          currentVersion: '0.1.0-alpha.4.14',
          currentDshVersion: '0.1.0-rc.7',
          latestVersion: '0.1.0-alpha.4.14',
          compatibility: {
            status: 'compatible',
            latestPluginVersion: '0.1.0-alpha.4.14',
            latestDshVersion: '0.1.1-rc.2',
          },
        })))
    const updater = new OpenAICodexUpdateStore('0.1.0-alpha.4.14')
    await act(async () => { await updater.refresh(true) })

    render(<OpenAICodexUpdateSettings updater={updater} t={t} />)
    expect(document.querySelector('[data-compatibility-status="compatible"]')).toBeTruthy()
    expect(screen.getByRole('region').textContent).toContain(en.compatibilityCurrentTitle)
    expect(screen.getByRole('region').textContent).toContain(en.compatibilityDshDifferent
      .replace('{current}', '0.1.0-rc.7')
      .replace('{latest}', '0.1.1-rc.2'))
    updater.dispose()
  })

  it('shows gray instead of claiming compatibility when the public record is unavailable', async () => {
    const browserStorage = storageFixture()
    vi.stubGlobal('localStorage', browserStorage)
    vi.stubGlobal('fetch', vi.fn(async (input: string): Promise<Response> => input === OPENAI_CODEX_RUNTIME_PATH
      ? json({ currentDshVersion: '0.1.1-rc.2' })
      : json({
      status: 'up-to-date',
      currentVersion: '0.1.0-alpha.4.15',
      currentDshVersion: '0.1.1-rc.2',
      latestVersion: '0.1.0-alpha.4.15',
      compatibility: {
        status: 'unverified',
        latestPluginVersion: '0.1.0-alpha.4.15',
      },
    })))
    const updater = new OpenAICodexUpdateStore('0.1.0-alpha.4.15')
    await act(async () => { await updater.refresh(true) })

    render(<OpenAICodexUpdateSettings updater={updater} t={t} />)
    expect(document.querySelector('[data-compatibility-status="unverified"]')).toBeTruthy()
    expect(screen.getByRole('region').textContent).toContain(en.compatibilityUnverifiedBody)
    expect(screen.getByRole('region').textContent).not.toContain('Canary')
    updater.dispose()
  })

  it('shows an unknown current DSH state instead of presenting the remote version as installed', async () => {
    const browserStorage = storageFixture()
    vi.stubGlobal('localStorage', browserStorage)
    vi.stubGlobal('fetch', vi.fn(async (input: string): Promise<Response> => input === OPENAI_CODEX_RUNTIME_PATH
      ? json({})
      : json({
      status: 'up-to-date',
      currentVersion: '0.1.0-alpha.4.15',
      latestVersion: '0.1.0-alpha.4.15',
      compatibility: {
        status: 'unverified',
        latestPluginVersion: '0.1.0-alpha.4.15',
        latestDshVersion: '0.1.1-rc.2',
      },
    })))
    const updater = new OpenAICodexUpdateStore('0.1.0-alpha.4.15')
    await act(async () => { await updater.refresh(true) })

    render(<OpenAICodexUpdateSettings updater={updater} t={t} />)
    expect(document.querySelector('[data-compatibility-status="unverified"]')).toBeTruthy()
    expect(screen.getByRole('region').textContent).toContain(en.compatibilityCurrentDshUnknownTitle)
    expect(screen.getByRole('region').textContent).toContain(en.compatibilityDshLatestOnly.replace('{latest}', '0.1.1-rc.2'))
    updater.dispose()
  })

  it('rechecks compatibility when the running DSH version differs from the cached result', async () => {
    const browserStorage = storageFixture()
    browserStorage.setItem(OPENAI_CODEX_UPDATE_CACHE_KEY, JSON.stringify({
      checkedAt: Date.now(),
      result: {
        status: 'up-to-date',
        currentVersion: '0.1.0-alpha.4.15',
        currentDshVersion: '0.1.1-rc.1',
        latestVersion: '0.1.0-alpha.4.15',
        compatibility: {
          status: 'compatible',
          latestPluginVersion: '0.1.0-alpha.4.15',
          latestDshVersion: '0.1.1-rc.2',
        },
      },
    }))
    const fetchMock = vi.fn(async (input: string): Promise<Response> => {
      if (input === OPENAI_CODEX_RUNTIME_PATH) return json({ currentDshVersion: '0.1.1-rc.2' })
      expect(input).toBe(OPENAI_CODEX_UPDATE_PATH)
      return json({
        status: 'up-to-date',
        currentVersion: '0.1.0-alpha.4.15',
        currentDshVersion: '0.1.1-rc.2',
        latestVersion: '0.1.0-alpha.4.15',
        compatibility: {
          status: 'compatible',
          latestPluginVersion: '0.1.0-alpha.4.15',
          latestDshVersion: '0.1.1-rc.2',
        },
      })
    })
    vi.stubGlobal('localStorage', browserStorage)
    vi.stubGlobal('fetch', fetchMock)
    const updater = new OpenAICodexUpdateStore('0.1.0-alpha.4.15')

    await act(async () => { await updater.refresh() })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(updater.getSnapshot().currentDshVersion).toBe('0.1.1-rc.2')
    expect(updater.getSnapshot().compatibility?.status).toBe('compatible')
    updater.dispose()
  })

  it('rechecks compatibility after the installed plugin version changes', async () => {
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
      if (input === OPENAI_CODEX_RUNTIME_PATH) return json({ currentDshVersion: '0.1.1-rc.2' })
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

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(updater.getSnapshot().currentVersion).toBe('0.1.0-alpha.4.16')
    expect(updater.getSnapshot().compatibility?.status).toBe('compatible')
    updater.dispose()
  })

  it('does not reuse a legacy green cache entry that has no DSH identity', async () => {
    const browserStorage = storageFixture()
    browserStorage.setItem(OPENAI_CODEX_UPDATE_CACHE_KEY, JSON.stringify({
      checkedAt: Date.now(),
      result: {
        status: 'up-to-date',
        currentVersion: '0.1.0-alpha.4.15',
        latestVersion: '0.1.0-alpha.4.15',
        compatibility: {
          status: 'compatible',
          latestPluginVersion: '0.1.0-alpha.4.15',
          latestDshVersion: '0.1.1-rc.2',
        },
      },
    }))
    const fetchMock = vi.fn(async (input: string): Promise<Response> => input === OPENAI_CODEX_RUNTIME_PATH
      ? json({})
      : json({
          status: 'up-to-date',
          currentVersion: '0.1.0-alpha.4.15',
          latestVersion: '0.1.0-alpha.4.15',
          compatibility: {
            status: 'unverified',
            latestPluginVersion: '0.1.0-alpha.4.15',
            latestDshVersion: '0.1.1-rc.2',
          },
        }))
    vi.stubGlobal('localStorage', browserStorage)
    vi.stubGlobal('fetch', fetchMock)
    const updater = new OpenAICodexUpdateStore('0.1.0-alpha.4.15')

    await act(async () => { await updater.refresh() })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(updater.getSnapshot().compatibility?.status).toBe('unverified')
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
