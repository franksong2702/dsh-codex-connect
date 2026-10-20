import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import { openaiCodexProvider } from '@earendil-works/pi-ai/providers/openai-codex'
import * as plugin from '../src/index.ts'
import { loadSettingsPlugin } from './support/settings-loader-fixture.ts'

const model = 'gpt-5.6-sol'
const other = 'gpt-5.6-terra'
const provider = plugin.OPENAI_CODEX_PROVIDER
const ns = plugin.OPENAI_CODEX_SETTINGS_NS
const catalogWindow = openaiCodexProvider().getModels().find(entry => entry.id === model)!.contextWindow
let ctx: Context | undefined
let home: string | undefined

async function boot(config: plugin.Config = {}): Promise<Context> {
  home = await mkdtemp(join(tmpdir(), 'codex-context-window-'))
  vi.stubEnv('DSH_HOME', home)
  ctx = new Context()
  await ctx.plugin(LlmRuntime)
  await loadSettingsPlugin(ctx, home, 'dsh-codex-connect', plugin, config)
  return ctx
}

afterEach(async () => {
  await ctx?.fiber.dispose()
  ctx = undefined
  if (home !== undefined) await rm(home, { recursive: true, force: true })
  home = undefined
  vi.unstubAllEnvs()
})

describe('context windows through the real Host settings and LLM registry', () => {
  it('preserves independent speed defaults and null masks through the real Host settings layers', async () => {
    const runtime = await boot({ newSessionSpeedMode: 'ultrafast', enableNewSessionFastMode: true })
    const settings = () => plugin.decodeOpenAICodexSettings(runtime.settings.describe().find(entry => entry.ns === ns)?.value)
    expect(settings()).toMatchObject({ newSessionSpeedMode: 'ultrafast', newSubagentSpeedMode: undefined })
    await runtime.settings.mutate(ns, [{ op: 'set', path: ['newSubagentSpeedMode'], value: 'fast' }])
    await runtime.settings.mutate(ns, [{ op: 'set', path: ['newSessionSpeedMode'], value: null }])
    expect(settings()).toMatchObject({ newSessionSpeedMode: undefined, newSubagentSpeedMode: 'fast', enableNewSessionFastMode: true })
  })

  it('updates the profile effort through real settings and masks an inherited default with null', async () => {
    const runtime = await boot({ reasoningEffort: 'max' })
    expect((await runtime.llm.resolveModelInfo(provider, 'gpt-6.1-sol')).reasoning?.defaultEffort).toBe('max')
    await runtime.settings.mutate(ns, [{ op: 'set', path: ['reasoningEffort'], value: 'high' }])
    expect((await runtime.llm.resolveModelInfo(provider, 'gpt-6.1-sol')).reasoning?.defaultEffort).toBe('high')
    await runtime.settings.mutate(ns, [{ op: 'set', path: ['reasoningEffort'], value: null }])
    expect((await runtime.llm.resolveModelInfo(provider, 'gpt-6.1-sol')).reasoning?.defaultEffort).toBeUndefined()
    expect(plugin.decodeOpenAICodexSettings(runtime.settings.describe().find(entry => entry.ns === ns)?.value)?.reasoningEffort).toBeUndefined()
  })

  it('uses the calibrated Sol61 default and lets a user override or reset it independently', async () => {
    const runtime = await boot()
    const sol61 = 'gpt-6.1-sol'
    expect((await runtime.llm.resolveModelInfo(provider, sol61)).context?.contextWindow).toBe(500_000)
    await runtime.settings.update(ns, { contextWindowOverrides: { [sol61]: 450_000, [other]: 340_000 } })
    expect((await runtime.llm.resolveModelInfo(provider, sol61)).context?.contextWindow).toBe(450_000)
    await runtime.settings.update(ns, { contextWindowOverrides: { [sol61]: null } })
    expect((await runtime.llm.resolveModelInfo(provider, sol61)).context?.contextWindow).toBe(500_000)
    expect((await runtime.llm.resolveModelInfo(provider, other)).context?.contextWindow).toBe(340_000)
  })
  it('rejects invalid profile budgets before adapter registration', async () => {
    await expect(boot({ contextWindowOverrides: { [model]: 872_001 } }))
      .rejects.toThrow('integer from 1 to 872000')
    expect(ctx!.llm.listProviders().map(entry => entry.id)).not.toContain(provider)
  })

  it('accepts the inclusive ceiling through settings and passes it to DSH without changing output limits', async () => {
    const runtime = await boot()
    const baseline = await runtime.llm.resolveModelInfo(provider, model)
    await runtime.settings.update(ns, { contextWindowOverrides: { [model]: 872_000 } })
    const resolved = await runtime.llm.resolveModelInfo(provider, model)
    expect(resolved).toEqual({ ...baseline, context: { ...baseline.context, contextWindow: 872_000 } })
  })
  it('rejects an unknown profile model before registering the Codex adapter', async () => {
    await expect(boot({ contextWindowOverrides: { 'misspelled-model': 300_000 } }))
      .rejects.toThrow('unknown model id "misspelled-model"')
    expect(ctx!.llm.listProviders().map(entry => entry.id)).not.toContain(provider)
  })

  it('reads persisted overrides on startup, updates live and clears back to catalog without losing other settings', async () => {
    const runtime = await boot({ contextWindowOverrides: { [model]: 350_000 }, models: [model] })
    expect((await runtime.llm.resolveModelInfo(provider, model)).context?.contextWindow).toBe(350_000)
    expect(plugin.decodeOpenAICodexSettings(runtime.settings.describe().find(entry => entry.ns === ns)?.value))
      .toMatchObject({ contextWindowOverrides: { [model]: 350_000 } })
    await runtime.settings.update(ns, { contextWindowOverrides: { [model]: 300_000 } })
    expect((await runtime.llm.resolveModelInfo(provider, model)).context?.contextWindow).toBe(300_000)
    // Host update recursively merges maps; replace the field via a path operation.
    await runtime.settings.mutate(ns, [{ op: 'set', path: ['contextWindowOverrides'], value: null }])
    expect((await runtime.llm.resolveModelInfo(provider, model)).context?.contextWindow).toBe(catalogWindow)
    expect(runtime.settings.describe().find(entry => entry.ns === ns)?.value).toMatchObject({ models: [model], contextWindowOverrides: null })
  })

  it('applies per-model default masks and preserves other settings through the profile form', async () => {
    const runtime = await boot({ contextWindowOverrides: { [other]: 340_000 }, models: [other] })
    await runtime.settings.update(ns, { contextWindowOverrides: { [model]: null } })
    expect((await runtime.llm.resolveModelInfo(provider, model)).context?.contextWindow).toBe(catalogWindow)
    expect((await runtime.llm.resolveModelInfo(provider, other)).context?.contextWindow).toBe(340_000)
    expect((await runtime.llm.listModels(provider)).map(entry => entry.id)).toEqual([other])
  })

  it('resets one model to catalog despite composition overrides while preserving another model and hidden state', async () => {
    const runtime = await boot({ contextWindowOverrides: { [model]: 300_000, [other]: 340_000 }, models: [other] })
    const input = { [model]: null, [other]: 340_000 }
    expect(plugin.Config({ contextWindowOverrides: input }).contextWindowOverrides.get()).toEqual(input)
    await runtime.settings.mutate(ns, [{ op: 'set', path: ['contextWindowOverrides'], value: input }])
    expect((await runtime.llm.resolveModelInfo(provider, model)).context?.contextWindow).toBe(catalogWindow)
    expect((await runtime.llm.resolveModelInfo(provider, other)).context?.contextWindow).toBe(340_000)
    expect((await runtime.llm.listModels(provider)).map(entry => entry.id)).toEqual([other])
    expect(plugin.decodeOpenAICodexSettings(runtime.settings.describe().find(entry => entry.ns === ns)?.value)?.contextWindowOverrides)
      .toEqual({ [other]: 340_000 })
    await expect(runtime.settings.update(ns, { contextWindowOverrides: { 'unknown-model': null } })).rejects.toThrow('unknown model id')
    await runtime.settings.update(ns, { contextWindowOverrides: { [model]: 320_000 } })
    expect((await runtime.llm.resolveModelInfo(provider, model)).context?.contextWindow).toBe(320_000)
  })

  it('retains per-model default masks from the profile config', async () => {
    const runtime = await boot({ contextWindowOverrides: { [model]: null, [other]: 340_000 } })
    expect((await runtime.llm.resolveModelInfo(provider, model)).context?.contextWindow).toBe(catalogWindow)
    expect((await runtime.llm.resolveModelInfo(provider, other)).context?.contextWindow).toBe(340_000)
  })

  it('rejects invalid or unknown-model writes before persistence and retains the last effective budget', async () => {
    const runtime = await boot({ contextWindowOverrides: { [model]: 300_000 } })
    for (const overrides of [{ [model]: 0 }, { [model]: 1.5 }, { [model]: 872_001 }, { 'gpt-5.5': 272_001 }, { 'gpt-5.3-codex-spark': 128_001 }, { 'openai-codex/gpt-5.6-sol': 350_000 }]) {
      await expect(runtime.settings.update(ns, { contextWindowOverrides: overrides })).rejects.toThrow()
      expect((await runtime.llm.resolveModelInfo(provider, model)).context?.contextWindow).toBe(300_000)
      expect(runtime.settings.describe().find(entry => entry.ns === ns)?.value)
        .toMatchObject({ contextWindowOverrides: { [model]: 300_000 } })
    }
  })

  it('removes one stored model override without changing another model or model visibility', async () => {
    const runtime = await boot({ contextWindowOverrides: { [model]: 350_000, [other]: 340_000 }, models: [other] })
    await runtime.settings.mutate(ns, [{ op: 'unset', path: ['contextWindowOverrides', model] }])
    expect((await runtime.llm.resolveModelInfo(provider, model)).context?.contextWindow).toBe(catalogWindow)
    expect((await runtime.llm.resolveModelInfo(provider, other)).context?.contextWindow).toBe(340_000)
    expect((await runtime.llm.listModels(provider)).map(entry => entry.id)).toEqual([other])
  })
})
