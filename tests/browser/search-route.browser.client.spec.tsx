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

function configScope(): { scope: SettingsScope<OpenAICodexSettingsConfig>; mutate: ReturnType<typeof vi.fn> } {
  let snapshot: SettingsScopeSnapshot<OpenAICodexSettingsConfig> = {
    status: 'ready', value: { ...DEFAULT_OPENAI_CODEX_SETTINGS },
    base: DEFAULT_OPENAI_CODEX_SETTINGS, user: undefined, revision: 1, writable: true, mode: 'host',
  }
  const listeners = new Set<() => void>()
  const mutate = vi.fn<SettingsScope<OpenAICodexSettingsConfig>['mutate']>(async (ops, revision) => {
      if (revision !== snapshot.revision) throw new Error('stale revision')
      const currentUser = typeof snapshot.user === 'object' && snapshot.user !== null ? snapshot.user : {}
      const changed = Object.fromEntries(ops.map(op => [op.path[0]!, op.op === 'set' ? op.value : undefined]))
      snapshot = {
        ...snapshot,
        value: { ...snapshot.value ?? DEFAULT_OPENAI_CODEX_SETTINGS, ...changed },
        user: { ...currentUser, ...changed },
        revision: (snapshot.revision ?? 0) + 1,
      }
      for (const listener of listeners) listener()
    })
  return {
    mutate,
    scope: {
      getSnapshot: () => snapshot,
      subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener) } },
      set: vi.fn(async () => { throw new Error('Use an atomic mutation') }),
      unset: vi.fn(), mutate,
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
    expect(config.mutate).toHaveBeenCalledWith([{ op: 'set', path: ['enableSearch'], value: true }], 1)
  })

  it('stages, validates, saves, and clears the image route hint in Chromium', async () => {
    const t = translator(en)
    vi.stubGlobal('fetch', async (path: string) => Response.json(path === OPENAI_CODEX_MODEL_CATALOG_PATH
      ? modelCatalogFixture([{ id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol' }])
      : {}))
    const config = configScope()
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    root.render(createElement(OpenAICodexConfiguration, { t, scope: config.scope, activeModule: 'capabilities' }))

    const hint = page.getByRole('textbox', { name: /Image route model hint/u })
    const save = page.getByRole('button', { name: en.save })
    await hint.fill('discarded-route')
    expect(config.mutate).not.toHaveBeenCalled()
    await page.getByRole('button', { name: en.discard }).click()
    await expect.element(hint).toHaveValue('')
    await hint.fill('https://invalid.example')
    await expect.element(save).toBeDisabled()
    expect(config.mutate).not.toHaveBeenCalled()
    await hint.fill('browser-image-route')
    expect(config.mutate).not.toHaveBeenCalled()
    await save.click()
    await expect.element(page.getByText(en.settingsSaved, { exact: true })).toBeVisible()
    expect(config.mutate).toHaveBeenCalledWith([{ op: 'set', path: ['imageModelHint'], value: 'browser-image-route' }], 1)
    await hint.fill('')
    await save.click()
    expect(config.mutate).toHaveBeenCalledWith([{ op: 'set', path: ['imageModelHint'], value: '' }], 2)
  })
})
