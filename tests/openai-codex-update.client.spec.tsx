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
        latestVersion: '0.1.0-alpha.4.15',
        releaseUrl: 'https://github.com/franksong2702/dsh-codex-connect/releases/tag/v0.1.0-alpha.4.15',
        versionsBehind: 1,
        highlights: [{ version: '0.1.0-alpha.4.12', kind: 'image-generation' }],
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

    render(<OpenAICodexUpdateOverlay updater={updater} t={t} useSessions={vi.fn() as never} useWorkspaces={vi.fn() as never} />)
    const initialStatusText = screen.getByRole('status').textContent ?? ''
    expect(initialStatusText).toContain(en.newVersionAvailable.replace('{version}', '0.1.0-alpha.4.15'))
    expect(initialStatusText.match(/0\.1\.0-alpha\.4\.15/gu)?.length).toBe(1)
    expect(screen.getByRole('status').textContent).toContain(en.versionSummary
      .replace('{current}', '0.1.0-alpha.4.14')
      .replace('{latest}', '0.1.0-alpha.4.15')
      .replace('{count}', '1'))
    expect(screen.getByRole('status').textContent).toContain(en.whatMatters)
    expect(screen.getByRole('status').textContent).toContain(en.updateHighlightImageGeneration)
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

    fireEvent.click(screen.getByRole('button', { name: en.recheckAfterUpgrade }))
    await waitFor(() => { expect(fetchMock).toHaveBeenCalledTimes(2) })
    expect(screen.getByRole('status').textContent).toContain(en.upgradeStillAvailable.replace('{version}', '0.1.0-alpha.4.14'))

    fireEvent.click(screen.getByRole('button', { name: en.dismissUpdate }))
    expect(screen.queryByRole('status')).toBeNull()
    expect(browserStorage.getItem(OPENAI_CODEX_UPDATE_DISMISSED_KEY)).toBe('0.1.0-alpha.4.15')
    updater.dispose()
  })

  it('renders current version in settings and reports when no update is available', async () => {
    const fetchMock = vi.fn(async (input: string): Promise<Response> => {
      expect(input).toBe(OPENAI_CODEX_UPDATE_PATH)
      return json({
        status: 'up-to-date',
        currentVersion: '0.1.0-alpha.4.14',
        latestVersion: '0.1.0-alpha.4.14',
      })
    })
    const browserStorage = storageFixture()
    vi.stubGlobal('localStorage', browserStorage)
    vi.stubGlobal('fetch', fetchMock)
    const updater = new OpenAICodexUpdateStore('0.1.0-alpha.4.14')
    render(<OpenAICodexUpdateSettings updater={updater} t={t} />)
    fireEvent.click(screen.getByRole('button', { name: en.checkForUpdates }))

    expect(await screen.findByText(en.upToDate.replace('{version}', '0.1.0-alpha.4.14'))).toBeTruthy()
    expect(screen.getByText(en.currentVersion.replace('{version}', '0.1.0-alpha.4.14'))).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(zh.dismissUpdate).toBe('稍后提醒')
    expect(browserStorage.getItem(OPENAI_CODEX_UPDATE_CACHE_KEY)).toContain('up-to-date')
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
