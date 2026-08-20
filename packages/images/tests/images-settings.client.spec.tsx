// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SettingsScope, SettingsScopeSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import { CodexImagesPluginCard } from '../src/client/CodexImagesPluginCard.tsx'
import { en, zh } from '../src/client/locales.ts'
import type { ImagesLocaleKey } from '../src/client/locales.ts'
import type { ImagesSettingsConfig } from '../src/client/settings-contract.ts'

function t(key: ImagesLocaleKey, params: Record<string, unknown> = {}): string {
  let value: string = en[key]
  for (const [name, replacement] of Object.entries(params)) value = value.replace(`{${name}}`, String(replacement))
  return value
}

function settingsFixture() {
  let snapshot: SettingsScopeSnapshot<ImagesSettingsConfig> = { status: 'ready', value: { enabled: true }, base: { enabled: true }, user: undefined, revision: 0, writable: true, mode: 'host' }
  const listeners = new Set<() => void>()
  const set = vi.fn(async (_field: string, value: unknown) => {
    snapshot = { ...snapshot, value: { enabled: value === true }, revision: 1 }
    for (const listener of listeners) listener()
  })
  const settings: SettingsScope<ImagesSettingsConfig> = { getSnapshot: () => snapshot, subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener) } }, set, unset: vi.fn() }
  return { settings, set }
}

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('Codex Connect Images settings card', () => {
  it('uses the native chevron, exposes the frozen warnings, auth state, and writes only enabled', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ status: 'signed-in', accountId: 'must-not-render', credentialPath: '/private/must-not-render' }), { status: 200, headers: { 'content-type': 'application/json' } })))
    const { settings, set } = settingsFixture()
    render(<CodexImagesPluginCard t={t} settings={settings} useSessions={vi.fn() as never} useWorkspaces={vi.fn() as never} />)
    const disclosure = screen.getByRole('button', { name: `${en.expand}: ${en.title}` })
    expect(disclosure.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 14 14')
    fireEvent.click(disclosure)
    expect(await screen.findByText(en.signedIn)).toBeTruthy()
    expect(screen.queryByText('must-not-render')).toBeNull()
    expect(screen.queryByText('/private/must-not-render')).toBeNull()
    expect(screen.getByText(en.disclosure)).toBeTruthy()
    expect(screen.getByText(en.quotaWarning)).toBeTruthy()
    expect(screen.getByText(en.alphaWarning)).toBeTruthy()
    fireEvent.click(screen.getByRole('checkbox', { name: en.enabled }))
    await waitFor(() => { expect(set).toHaveBeenCalledWith('enabled', false) })
    expect(zh.disclosure).toContain('本插件不指定、也不作声明')
  })
})
