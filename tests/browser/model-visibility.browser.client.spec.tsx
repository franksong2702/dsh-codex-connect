import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { SettingsScope, SettingsScopeSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { OpenAICodexConfiguration } from '../../src/client/OpenAICodexConfiguration.tsx'
import { en } from '../../src/client/locales.ts'
import { OPENAI_CODEX_MODEL_CATALOG_PATH } from '../../src/model-contract.ts'
import { DEFAULT_OPENAI_CODEX_SETTINGS } from '../../src/settings-contract.ts'
import type { OpenAICodexSettingsConfig } from '../../src/settings-contract.ts'

function t(key: keyof typeof en): string {
  return en[key]
}

function settingsScopeFixture(): {
  scope: SettingsScope<OpenAICodexSettingsConfig>
  set: ReturnType<typeof vi.fn>
} {
  let snapshot: SettingsScopeSnapshot<OpenAICodexSettingsConfig> = {
    status: 'ready',
    value: { ...DEFAULT_OPENAI_CODEX_SETTINGS },
    base: { ...DEFAULT_OPENAI_CODEX_SETTINGS },
    user: undefined,
    revision: 0,
    writable: true,
    mode: 'host',
  }
  const listeners = new Set<() => void>()
  const set = vi.fn(async (field: string, value: unknown) => {
    const current = snapshot.value
    if (current === undefined) throw new Error('settings unavailable')
    snapshot = { ...snapshot, value: { ...current, [field]: value }, revision: (snapshot.revision ?? 0) + 1 }
    for (const listener of listeners) listener()
  })
  return {
    set,
    scope: {
      getSnapshot: () => snapshot,
      subscribe(listener) {
        listeners.add(listener)
        return () => { listeners.delete(listener) }
      },
      set,
      unset: vi.fn(async () => undefined),
    },
  }
}

let host: HTMLDivElement
let root: Root

beforeEach(async () => {
  await page.viewport(960, 800)
  host = document.createElement('div')
  host.style.width = '720px'
  document.body.append(host)
  root = createRoot(host)
})

afterEach(() => {
  root.unmount()
  host.remove()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('Codex model visibility in Chromium', () => {
  it('shows the full catalog, saves a subset, and stays inside a narrow viewport', async () => {
    const models = [
      { id: 'gpt-5.6-luna', name: 'GPT-5.6 Luna' },
      { id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol' },
      { id: 'gpt-5.6-terra', name: 'GPT-5.6 Terra' },
    ]
    const fetchMock = vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
      expect(String(input)).toBe(OPENAI_CODEX_MODEL_CATALOG_PATH)
      return new Response(JSON.stringify(models), { status: 200, headers: { 'content-type': 'application/json' } })
    })
    const { scope, set } = settingsScopeFixture()
    vi.stubGlobal('fetch', fetchMock)
    root.render(createElement(OpenAICodexConfiguration, { scope, t }))

    const sol = page.getByRole('checkbox', { name: /GPT-5\.6 Sol/u })
    await vi.waitFor(() => { expect(sol.element()).toBeInstanceOf(HTMLInputElement) })
    await sol.click()
    await page.getByRole('button', { name: en.save }).click()
    await vi.waitFor(() => {
      expect(set).toHaveBeenCalledWith('models', ['gpt-5.6-luna', 'gpt-5.6-terra'])
    })

    await page.viewport(360, 800)
    host.style.width = '100%'
    await vi.waitFor(() => {
      expect(host.scrollWidth).toBeLessThanOrEqual(host.clientWidth)
    })
  })
})
