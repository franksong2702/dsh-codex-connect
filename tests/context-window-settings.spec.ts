import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context, type Fiber } from '@deepseek-ai/cordis'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import SettingsProvider, { type SettingsNamespace } from '@deepseek-ai/dsh-settings'
import { openaiCodexProvider } from '@earendil-works/pi-ai/providers/openai-codex'
import * as plugin from '../src/index.ts'

const model = 'gpt-5.6-sol'
const other = 'gpt-5.6-terra'
const provider = plugin.OPENAI_CODEX_PROVIDER
const ns = plugin.OPENAI_CODEX_SETTINGS_NS
const catalogWindow = openaiCodexProvider().getModels().find(entry => entry.id === model)!.contextWindow
let initial: Record<string, unknown> = {}
let ctx: Context | undefined
let home: string | undefined
let settingsFiber: Fiber | undefined
const createdFibers: Fiber[] = []

class StoredSettings extends SettingsProvider {
  readonly writable = true
  private storedDocument: Record<string, unknown> = { [ns]: initial }
  protected load() { return Promise.resolve(structuredClone(this.storedDocument)) }
  protected persist(namespace: SettingsNamespace, section: Record<string, unknown>) {
    this.storedDocument[namespace] = structuredClone(section)
    return Promise.resolve()
  }
}

async function boot(config: plugin.Config = {}, withSettings = true): Promise<Context> {
  home = await mkdtemp(join(tmpdir(), 'codex-context-window-'))
  vi.stubEnv('DSH_HOME', home)
  ctx = new Context()
  ctx.on('internal/plugin', fiber => { if (fiber.uid !== null) createdFibers.push(fiber) })
  await ctx.plugin(LlmRuntime)
  if (withSettings) settingsFiber = await ctx.plugin(StoredSettings)
  await ctx.plugin(plugin, config)
  return ctx
}

afterEach(async () => {
  await ctx?.fiber.dispose()
  ctx = undefined
  settingsFiber = undefined
  if (home !== undefined) await rm(home, { recursive: true, force: true })
  home = undefined
  initial = {}
  createdFibers.length = 0
  vi.unstubAllEnvs()
})

describe('context windows through the real Host settings and LLM registry', () => {
  it('rejects composition budgets above the configuration ceiling before adapter registration', async () => {
    await expect(boot({ contextWindowOverrides: { [model]: 872_001 } }, false))
      .rejects.toThrow('integer from 1 to 872000')
    expect(ctx!.llm.listProviders().map(entry => entry.id)).not.toContain(provider)
  })

  it('rejects an over-limit persisted budget instead of silently changing it', async () => {
    initial = { contextWindowOverrides: { [model]: 872_001 } }
    const runtime = await boot()
    expect(runtime.settings.describe().find(entry => entry.ns === ns)).toBeUndefined()
    const results = await Promise.allSettled(createdFibers.map(fiber => fiber.await()))
    const errors = results.filter(result => result.status === 'rejected').map(result => result.reason as Error)
    expect(errors).toHaveLength(1)
    expect(errors[0]?.message).toContain('integer from 1 to 872000')
  })

  it('accepts the inclusive ceiling through settings and passes it to DSH without changing output limits', async () => {
    const runtime = await boot()
    const baseline = await runtime.llm.resolveModelInfo(provider, model)
    await runtime.settings.update(ns, { contextWindowOverrides: { [model]: 872_000 } })
    const resolved = await runtime.llm.resolveModelInfo(provider, model)
    expect(resolved).toEqual({ ...baseline, context: { ...baseline.context, contextWindow: 872_000 } })
  })
  it('rejects an unknown composition model before registering the Codex adapter', async () => {
    await expect(boot({ contextWindowOverrides: { 'misspelled-model': 300_000 } }, false))
      .rejects.toThrow('unknown model id "misspelled-model"')
    expect(ctx!.llm.listProviders().map(entry => entry.id)).not.toContain(provider)
  })

  it('rejects an unknown model already stored when the settings section registers', async () => {
    initial = { contextWindowOverrides: { 'misspelled-model': 300_000 } }
    const runtime = await boot()
    expect(runtime.settings.describe().find(entry => entry.ns === ns)).toBeUndefined()
    const results = await Promise.allSettled(createdFibers.map(fiber => fiber.await()))
    const errors = results.filter(result => result.status === 'rejected').map(result => result.reason as Error)
    expect(errors).toHaveLength(1)
    expect(errors[0]?.message).toContain('unknown model id "misspelled-model"')
  })

  it('reads persisted overrides on startup, updates live and clears back to catalog without losing other settings', async () => {
    initial = { contextWindowOverrides: { [model]: 350_000 }, models: [model] }
    const runtime = await boot()
    expect((await runtime.llm.resolveModelInfo(provider, model)).context?.contextWindow).toBe(350_000)
    expect(plugin.decodeOpenAICodexSettings(runtime.settings.describe().find(entry => entry.ns === ns)?.value))
      .toMatchObject({ contextWindowOverrides: { [model]: 350_000 } })
    await runtime.settings.update(ns, { contextWindowOverrides: { [model]: 300_000 } })
    expect((await runtime.llm.resolveModelInfo(provider, model)).context?.contextWindow).toBe(300_000)
    // Host update recursively merges maps; replace the field via a path operation.
    await runtime.settings.mutate(ns, [{ op: 'set', path: ['contextWindowOverrides'], value: {} }])
    expect((await runtime.llm.resolveModelInfo(provider, model)).context?.contextWindow).toBe(catalogWindow)
    expect(runtime.settings.describe().find(entry => entry.ns === ns)?.value).toMatchObject({ models: [model], contextWindowOverrides: {} })
  })

  it('inherits composition overrides when the persisted field is unset and falls back when Settings is unloaded', async () => {
    initial = { contextWindowOverrides: { [model]: 350_000 } }
    const runtime = await boot({ contextWindowOverrides: { [model]: 300_000 } })
    expect((await runtime.llm.resolveModelInfo(provider, model)).context?.contextWindow).toBe(350_000)
    await runtime.settings.mutate(ns, [{ op: 'unset', path: ['contextWindowOverrides'] }])
    expect((await runtime.llm.resolveModelInfo(provider, model)).context?.contextWindow).toBe(300_000)
    await runtime.settings.update(ns, { contextWindowOverrides: { [model]: 340_000 } })
    expect((await runtime.llm.resolveModelInfo(provider, model)).context?.contextWindow).toBe(340_000)
    await runtime.settings.update(ns, { contextWindowOverrides: null })
    expect((await runtime.llm.resolveModelInfo(provider, model)).context?.contextWindow).toBe(catalogWindow)
    expect(plugin.decodeOpenAICodexSettings(runtime.settings.describe().find(entry => entry.ns === ns)?.value)?.contextWindowOverrides).toBeUndefined()
    await settingsFiber!.dispose()
    expect((await runtime.llm.resolveModelInfo(provider, model)).context?.contextWindow).toBe(300_000)
  })

  it('honors composition config without a Settings service and supports a later Settings source', async () => {
    const runtime = await boot({ contextWindowOverrides: { [model]: 300_000 } }, false)
    expect((await runtime.llm.resolveModelInfo(provider, model)).context?.contextWindow).toBe(300_000)
    initial = { contextWindowOverrides: { [model]: 350_000 } }
    settingsFiber = await runtime.plugin(StoredSettings)
    expect((await runtime.llm.resolveModelInfo(provider, model)).context?.contextWindow).toBe(350_000)
    const baseline = openaiCodexProvider().getModels().find(entry => entry.id === other)!
    expect((await runtime.llm.resolveModelInfo(provider, other)).context?.contextWindow).toBe(baseline.contextWindow)
  })

  it('resets one model to catalog despite composition overrides while preserving another model and hidden state', async () => {
    initial = { contextWindowOverrides: { [model]: 350_000 }, models: [other] }
    const runtime = await boot({ contextWindowOverrides: { [model]: 300_000, [other]: 340_000 } })
    const input = { [model]: null, [other]: 340_000 }
    expect(plugin.Config({ contextWindowOverrides: input }).contextWindowOverrides).toEqual(input)
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

  it('retains persisted per-model default masks when starting with composition overrides', async () => {
    initial = { contextWindowOverrides: { [model]: null, [other]: 340_000 } }
    const runtime = await boot({ contextWindowOverrides: { [model]: 300_000 } })
    expect((await runtime.llm.resolveModelInfo(provider, model)).context?.contextWindow).toBe(catalogWindow)
    expect((await runtime.llm.resolveModelInfo(provider, other)).context?.contextWindow).toBe(340_000)
  })

  it('rejects invalid or unknown-model writes before persistence and retains the last effective budget', async () => {
    initial = { contextWindowOverrides: { [model]: 300_000 } }
    const runtime = await boot()
    for (const overrides of [{ [model]: 0 }, { [model]: 1.5 }, { [model]: 872_001 }, { 'gpt-5.5': 272_001 }, { 'gpt-5.3-codex-spark': 128_001 }, { 'openai-codex/gpt-5.6-sol': 350_000 }]) {
      await expect(runtime.settings.update(ns, { contextWindowOverrides: overrides })).rejects.toThrow()
      expect((await runtime.llm.resolveModelInfo(provider, model)).context?.contextWindow).toBe(300_000)
      expect(runtime.settings.describe().find(entry => entry.ns === ns)?.value)
        .toMatchObject({ contextWindowOverrides: { [model]: 300_000 } })
    }
  })

  it('removes one stored model override without changing another model or model visibility', async () => {
    initial = { contextWindowOverrides: { [model]: 350_000, [other]: 340_000 }, models: [other] }
    const runtime = await boot()
    await runtime.settings.mutate(ns, [{ op: 'unset', path: ['contextWindowOverrides', model] }])
    expect((await runtime.llm.resolveModelInfo(provider, model)).context?.contextWindow).toBe(catalogWindow)
    expect((await runtime.llm.resolveModelInfo(provider, other)).context?.contextWindow).toBe(340_000)
    expect((await runtime.llm.listModels(provider)).map(entry => entry.id)).toEqual([other])
  })
})
