import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import type { SettingsScope, SettingsScopeSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'
import { OpenAICodexConfiguration } from '../../src/client/OpenAICodexConfiguration.tsx'
import { en, zh } from '../../src/client/locales.ts'
import { DEFAULT_OPENAI_CODEX_SETTINGS, type OpenAICodexSettingsConfig } from '../../src/settings-contract.ts'
import { OPENAI_CODEX_MODEL_CATALOG_PATH } from '../../src/model-contract.ts'
import { modelCatalogFixture } from '../model-catalog-fixture.ts'

let root: Root | undefined
let host: HTMLDivElement | undefined
afterEach(() => { root?.unmount(); host?.remove(); vi.unstubAllGlobals() })
function translator(messages: Record<keyof typeof en, string>) {
  return (key: keyof typeof en, params: Record<string, unknown> = {}) => Object.entries(params).reduce(
    (value, [name, replacement]) => value.replace(`{${name}}`, String(replacement)),
    messages[key],
  )
}

function configScope(): { scope: SettingsScope<OpenAICodexSettingsConfig>; set: ReturnType<typeof vi.fn> } {
  let snapshot: SettingsScopeSnapshot<OpenAICodexSettingsConfig> = {
    status: 'ready', value: { ...DEFAULT_OPENAI_CODEX_SETTINGS },
    base: DEFAULT_OPENAI_CODEX_SETTINGS, user: undefined, revision: 1, writable: true, mode: 'host',
  }
  const listeners = new Set<() => void>()
  const set = vi.fn(async (field: keyof OpenAICodexSettingsConfig, value: unknown) => {
      const currentUser = typeof snapshot.user === 'object' && snapshot.user !== null ? snapshot.user : {}
      snapshot = {
        ...snapshot,
        value: { ...snapshot.value ?? DEFAULT_OPENAI_CODEX_SETTINGS, [field]: value },
        user: { ...currentUser, [field]: value },
        revision: (snapshot.revision ?? 0) + 1,
      }
      for (const listener of listeners) listener()
    })
  return {
    set,
    scope: {
      getSnapshot: () => snapshot,
      subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener) } },
      set,
      unset: vi.fn(), mutate: vi.fn(),
    },
  }
}

describe('Codex Search capability control', () => {
  it.each([
    ['English', en],
    ['Chinese', zh],
  ] as const)('uses the unchanged capability UI to save the search switch in %s', async (_language, messages) => {
    const t = translator(messages)
    vi.stubGlobal('fetch', async (path: string) => Response.json(path === OPENAI_CODEX_MODEL_CATALOG_PATH
      ? modelCatalogFixture([{ id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol' }])
      : {}))
    const config = configScope()
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    root.render(createElement(OpenAICodexConfiguration, {
      t,
      scope: config.scope,
      activeModule: 'capabilities',
    }))

    await page.getByRole('checkbox', { name: new RegExp(`^${messages.enableSearch}`, 'u') }).click()
    await page.getByRole('button', { name: messages.save }).click()

    await expect.element(page.getByText(messages.settingsSaved, { exact: true })).toBeVisible()
    expect(config.set).toHaveBeenCalledWith('enableSearch', true)
  })
})
