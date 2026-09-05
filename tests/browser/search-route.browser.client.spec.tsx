import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import type { SettingsScope, SettingsScopeSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'
import { OpenAICodexConfiguration } from '../../src/client/OpenAICodexConfiguration.tsx'
import type { OpenAICodexSearchRouteConfig } from '../../src/client/search-route.ts'
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

function configScope(): SettingsScope<OpenAICodexSettingsConfig> {
  let snapshot: SettingsScopeSnapshot<OpenAICodexSettingsConfig> = {
    status: 'ready', value: { ...DEFAULT_OPENAI_CODEX_SETTINGS },
    base: DEFAULT_OPENAI_CODEX_SETTINGS, user: undefined, revision: 1, writable: true, mode: 'host',
  }
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => snapshot,
    subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener) } },
    set: vi.fn(async (field: keyof OpenAICodexSettingsConfig, value: unknown) => {
      const currentUser = typeof snapshot.user === 'object' && snapshot.user !== null ? snapshot.user : {}
      snapshot = {
        ...snapshot,
        value: { ...snapshot.value ?? DEFAULT_OPENAI_CODEX_SETTINGS, [field]: value },
        user: { ...currentUser, [field]: value },
        revision: (snapshot.revision ?? 0) + 1,
      }
      for (const listener of listeners) listener()
    }),
    unset: vi.fn(), mutate: vi.fn(),
  }
}

function routeScope(): { scope: SettingsScope<OpenAICodexSearchRouteConfig>; mutate: ReturnType<typeof vi.fn> } {
  let snapshot: SettingsScopeSnapshot<OpenAICodexSearchRouteConfig> = {
    status: 'ready', value: { searchProvider: 'deepseek' }, base: { searchProvider: 'deepseek' },
    user: undefined, revision: 4, writable: true, mode: 'host',
  }
  const listeners = new Set<() => void>()
  const mutate = vi.fn(async (ops: readonly { op: 'set' | 'unset'; path: string[]; value?: unknown }[], expectedRevision?: number) => {
    expect(expectedRevision).toBe(snapshot.revision)
    const op = ops[0]
    if (op?.op === 'set') {
      snapshot = { ...snapshot, value: { searchProvider: String(op.value) }, user: { searchProvider: String(op.value) }, revision: 5 }
    } else {
      snapshot = { ...snapshot, value: { searchProvider: 'deepseek' }, user: undefined, revision: 6 }
    }
    for (const listener of listeners) listener()
  })
  return {
    mutate,
    scope: {
      getSnapshot: () => snapshot,
      subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener) } },
      set: vi.fn(), unset: vi.fn(), mutate,
    },
  }
}

describe('Codex Search route control', () => {
  it.each([
    ['English', en],
    ['Chinese', zh],
  ] as const)('uses the unchanged capability UI to select the search route in %s', async (_language, messages) => {
    const t = translator(messages)
    vi.stubGlobal('fetch', async (path: string) => Response.json(path === OPENAI_CODEX_MODEL_CATALOG_PATH
      ? modelCatalogFixture([{ id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol' }])
      : {}))
    const route = routeScope()
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    root.render(createElement(OpenAICodexConfiguration, {
      t,
      scope: configScope(),
      searchRouteScope: route.scope,
      activeModule: 'capabilities',
    }))

    await page.getByRole('checkbox', { name: new RegExp(`^${messages.enableSearch}`, 'u') }).click()
    await page.getByRole('button', { name: messages.save }).click()

    await expect.element(page.getByText(messages.settingsSaved, { exact: true })).toBeVisible()
    expect(route.mutate).toHaveBeenCalledWith([{
      op: 'set', path: ['searchProvider'], value: 'openai-codex',
    }], 4)
  })
})
