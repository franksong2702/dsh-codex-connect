import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { SettingsScope, SettingsScopeSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { modelCatalogFixture } from '../model-catalog-fixture.ts'
import { OpenAICodexConfiguration } from '../../src/client/OpenAICodexConfiguration.tsx'
import { en } from '../../src/client/locales.ts'
import { OPENAI_CODEX_MODEL_CATALOG_PATH } from '../../src/model-contract.ts'
import { DEFAULT_OPENAI_CODEX_SETTINGS, resolveOpenAICodexSettings } from '../../src/settings-contract.ts'
import type { OpenAICodexSettingsConfig } from '../../src/settings-contract.ts'

function t(key: keyof typeof en): string {
  return en[key]
}

function settingsScopeFixture(initial: Partial<OpenAICodexSettingsConfig> = {}, writable = true): {
  scope: SettingsScope<OpenAICodexSettingsConfig>
  set: ReturnType<typeof vi.fn>
} {
  let snapshot: SettingsScopeSnapshot<OpenAICodexSettingsConfig> = {
    status: 'ready',
    value: { ...DEFAULT_OPENAI_CODEX_SETTINGS, ...initial },
    base: { ...DEFAULT_OPENAI_CODEX_SETTINGS, ...initial },
    user: undefined,
    revision: 0,
    writable,
    mode: 'host',
  }
  const listeners = new Set<() => void>()
  const set = vi.fn(async (field: string, value: unknown) => {
    const current = snapshot.value
    if (current === undefined) throw new Error('settings unavailable')
    snapshot = { ...snapshot, value: resolveOpenAICodexSettings({ ...current, [field]: value }), revision: (snapshot.revision ?? 0) + 1 }
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
      mutate: vi.fn(async () => { throw new Error('This fixture supports single-field settings writes only.') }),
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
  it('stages per-model budgets, preserves hidden models, discards edits and resets without changing other budgets', async () => {
    const models = [{ id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol' }, { id: 'gpt-5.6-terra', name: 'GPT-5.6 Terra' }]
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(modelCatalogFixture(models)))))
    const { scope, set } = settingsScopeFixture({ contextWindowOverrides: { 'gpt-5.6-sol': 300_000, 'gpt-5.6-terra': 340_000 } })
    root.render(createElement(OpenAICodexConfiguration, { scope, t }))
    const sol = page.getByRole('group', { name: 'GPT-5.6 Sol', exact: true })
    await sol.getByRole('button', { name: en.contextAdjust, exact: true }).click()
    const input = sol.getByRole('spinbutton', { name: en.contextTokens })
    await input.fill('350000')
    expect(set).not.toHaveBeenCalled()
    await page.getByRole('button', { name: en.discard, exact: true }).click()
    await vi.waitFor(() => { expect((input.element() as HTMLInputElement).value).toBe('300000') })
    await input.fill('350000')
    await sol.getByRole('checkbox').click()
    await page.getByRole('button', { name: en.save, exact: true }).click()
    await vi.waitFor(() => {
      expect(scope.getSnapshot().value).toMatchObject({ models: ['gpt-5.6-terra'], contextWindowOverrides: { 'gpt-5.6-sol': 350_000, 'gpt-5.6-terra': 340_000 } })
    })
    await sol.getByRole('button', { name: en.contextReset, exact: true }).click()
    await page.getByRole('button', { name: en.save, exact: true }).click()
    await vi.waitFor(() => {
      expect(set).toHaveBeenCalledWith('contextWindowOverrides', { 'gpt-5.6-sol': null, 'gpt-5.6-terra': 340_000 })
      expect(scope.getSnapshot().value?.contextWindowOverrides).toEqual({ 'gpt-5.6-terra': 340_000 })
      expect((input.element() as HTMLInputElement).value).toBe('272000')
    })
    await page.viewport(360, 800)
    host.style.width = '100%'
    await vi.waitFor(() => { expect(host.scrollWidth).toBeLessThanOrEqual(host.clientWidth) })
  })

  it('blocks empty, fractional, nonpositive and unsafe budgets, and leaves restoring defaults explicit', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(modelCatalogFixture([{ id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol' }]))))
    const { scope, set } = settingsScopeFixture()
    root.render(createElement(OpenAICodexConfiguration, { scope, t }))
    await page.getByRole('button', { name: en.contextAdjust, exact: true }).click()
    const input = page.getByRole('spinbutton', { name: en.contextTokens })
    for (const value of ['0', '-1', '1.5', '872001', '9007199254740992', '']) {
      await input.fill('1000')
      await input.fill(value)
      await vi.waitFor(() => {
        expect((page.getByRole('button', { name: en.save, exact: true }).element() as HTMLButtonElement).disabled).toBe(true)
        expect(input.element().getAttribute('aria-invalid')).toBe('true')
      })
    }
    expect(set).not.toHaveBeenCalled()
    await page.getByRole('button', { name: en.contextReset, exact: true }).click()
    await page.getByRole('button', { name: en.save, exact: true }).click()
    expect(scope.getSnapshot().value?.contextWindowOverrides).toBeUndefined()
  })

  it('does not allow editing budgets in a read-only scope', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(modelCatalogFixture([{ id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol' }]))))
    const { scope, set } = settingsScopeFixture({}, false)
    root.render(createElement(OpenAICodexConfiguration, { scope, t }))
    await vi.waitFor(() => {
      expect(page.getByRole('button', { name: en.contextAdjust, exact: true }).element().matches(':disabled')).toBe(true)
    })
    expect(set).not.toHaveBeenCalled()
  })

  it('shows the full catalog, saves a subset, and stays inside a narrow viewport', async () => {
    const models = [
      { id: 'gpt-5.6-luna', name: 'GPT-5.6 Luna' },
      { id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol' },
      { id: 'gpt-5.6-terra', name: 'GPT-5.6 Terra' },
    ]
    const fetchMock = vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
      expect(String(input)).toBe(OPENAI_CODEX_MODEL_CATALOG_PATH)
      return new Response(JSON.stringify(modelCatalogFixture(models)), { status: 200, headers: { 'content-type': 'application/json' } })
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

  it('synchronizes pointer and keyboard slider edits with exact input, warns above default and restores the numeric default', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(modelCatalogFixture([{ id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol' }]))))
    const { scope, set } = settingsScopeFixture()
    root.render(createElement(OpenAICodexConfiguration, { scope, t }))
    const sol = page.getByRole('group', { name: 'GPT-5.6 Sol', exact: true })
    await expect.element(sol).toHaveTextContent('272,000 tokens')
    await sol.getByRole('button', { name: en.contextAdjust, exact: true }).click()
    const input = sol.getByRole('spinbutton', { name: en.contextTokens })
    const slider = sol.getByRole('slider', { name: en.contextSlider })
    await expect.element(input).toHaveValue(272_000)
    expect(slider.element().getAttribute('max')).toBe('872000')
    await input.fill('350123')
    await expect.element(slider).toHaveValue('350123')
    await expect.element(sol.getByText(en.contextAboveDefault)).toBeVisible()
    await slider.click()
    const pointerBudget = (slider.element() as HTMLInputElement).valueAsNumber
    expect(pointerBudget).toBeGreaterThan(1)
    expect(pointerBudget).toBeLessThan(872_000)
    await expect.element(input).toHaveValue(pointerBudget)
    await userEvent.keyboard('{End}')
    await expect.element(input).toHaveValue(872_000)
    await userEvent.keyboard('{ArrowLeft}')
    await expect.element(input).toHaveValue(871_999)
    expect(set).not.toHaveBeenCalled()
    await page.getByRole('button', { name: en.save, exact: true }).click()
    expect(scope.getSnapshot().value?.contextWindowOverrides).toEqual({ 'gpt-5.6-sol': 871_999 })
    await sol.getByRole('button', { name: en.contextReset, exact: true }).click()
    await expect.element(input).toHaveValue(272_000)
    await expect.element(slider).toHaveValue('272000')
    await expect.element(sol.getByText(en.contextAboveDefault)).not.toBeInTheDocument()
    await page.viewport(360, 800)
    host.style.width = '100%'
    await vi.waitFor(() => { expect(host.scrollWidth).toBeLessThanOrEqual(host.clientWidth) })
  })

  it('uses a fallback model ceiling without claiming a higher official limit', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json([{ id: 'gpt-5.3-codex-spark', name: 'Spark', contextWindow: 128_000, maxContextWindow: 128_000, contextLimitSource: 'catalog-default' }])))
    const { scope } = settingsScopeFixture()
    root.render(createElement(OpenAICodexConfiguration, { scope, t }))
    await page.getByRole('button', { name: en.contextAdjust, exact: true }).click()
    await expect.element(page.getByText(en.contextLimitFallback)).toBeVisible()
    const input = page.getByRole('spinbutton', { name: en.contextTokens })
    await expect.element(input).toHaveValue(128_000)
    await input.fill('128001')
    await expect.element(page.getByRole('button', { name: en.save, exact: true })).toBeDisabled()
    await input.fill('128000')
    await expect.element(page.getByRole('button', { name: en.save, exact: true })).toBeEnabled()
    expect(page.getByRole('slider', { name: en.contextSlider }).element().getAttribute('max')).toBe('128000')
  })
})
