import { describe, expect, it } from 'vitest'
import { openaiCodexProvider } from '@earendil-works/pi-ai/providers/openai-codex'
import { assertOpenAICodexContextWindowOverrides, openAICodexModelCatalog, withOpenAICodexContextWindowOverrides, withOpenAICodexModels } from '../src/adapter.ts'
import { decodeOpenAICodexModelCatalog, isValidOpenAICodexContextBudget, openAICodexContextLimit, openAICodexContextLimitSource, OPENAI_CODEX_SOL61_CONTEXT_LIMIT_SOURCE, OPENAI_CODEX_TERRA61_CONTEXT_LIMIT_SOURCE, OPENAI_CODEX_CONTEXT_LIMIT_SOURCE } from '../src/model-contract.ts'

describe('model-specific configuration ceilings', () => {
  it('keeps model-specific policy links pinned without changing old provenance', () => {
    expect(OPENAI_CODEX_SOL61_CONTEXT_LIMIT_SOURCE).toBe('https://github.com/openai/codex/blob/d63a9b8344cfe58bc78bbe319b560378fc8756ef/codex-rs/models-manager/models.json')
    expect(OPENAI_CODEX_CONTEXT_LIMIT_SOURCE).toBe('https://github.com/openai/codex/blob/39598ed17885970828acd42a6370131ed0190a98/codex-rs/models-manager/models.json')
    expect(openAICodexContextLimitSource('gpt-6.1-sol')).toBe(OPENAI_CODEX_SOL61_CONTEXT_LIMIT_SOURCE)
    expect(OPENAI_CODEX_TERRA61_CONTEXT_LIMIT_SOURCE).toBe('https://github.com/openai/codex/blob/e8e6a922c0008bc08bacc69dd2ce9b6c3c12944c/codex-rs/models-manager/models.json')
    expect(openAICodexContextLimitSource('gpt-6.1-terra')).toBe(OPENAI_CODEX_TERRA61_CONTEXT_LIMIT_SOURCE)
    for (const id of ['gpt-6-astra', 'gpt-6-sol', 'gpt-6-luna', 'gpt-5.6-sol', 'gpt-5.6-luna']) {
      expect(openAICodexContextLimitSource(id)).toBe(OPENAI_CODEX_CONTEXT_LIMIT_SOURCE)
    }
  })
  it.each([
    ['gpt-6-astra', 272_000, 872_000],
    ['gpt-6.1-sol', 500_000, 872_000],
    ['gpt-6.1-terra', 500_000, 872_000],
    ['gpt-6-sol', 272_000, 872_000],
    ['gpt-6-luna', 272_000, 872_000],
    ['gpt-5.6-sol', 272_000, 872_000],
    ['gpt-5.6-terra', 272_000, 872_000],
    ['gpt-5.6-luna', 272_000, 872_000],
    ['gpt-5.4', 272_000, 1_000_000],
    ['gpt-5.5', 272_000, 272_000],
    ['gpt-5.4-mini', 272_000, 272_000],
    ['gpt-5.3-codex-spark', 128_000, 128_000],
  ])('exposes %s defaults and enforces the ceiling in both browser and adapter validation', (id, contextWindow, maximum) => {
    const model = openAICodexModelCatalog().find(entry => entry.id === id)!
    expect(model).toMatchObject({ contextWindow, maxContextWindow: maximum })
    const catalog = [model]
    for (const budget of [1, contextWindow, maximum]) {
      expect(isValidOpenAICodexContextBudget(budget, maximum)).toBe(true)
      expect(() => assertOpenAICodexContextWindowOverrides({ [id]: budget }, catalog)).not.toThrow()
    }
    for (const budget of [0, -1, 1.5, NaN, Infinity, maximum + 1]) {
      expect(isValidOpenAICodexContextBudget(budget, maximum)).toBe(false)
      expect(() => assertOpenAICodexContextWindowOverrides({ [id]: budget }, catalog)).toThrow('integer from 1 to')
    }
    expect(() => assertOpenAICodexContextWindowOverrides({ [id]: null }, catalog)).not.toThrow()
  })

  it('keeps the calibrated fallback separate from explicit or native budgets', () => {
    const id = 'gpt-6.1-sol'
    const provider = openaiCodexProvider()
    const fallback = withOpenAICodexModels({ ...provider, getModels: () => provider.getModels().filter(model => model.id !== id) })
    const original = fallback.getModels().find(model => model.id === id)!
    expect(original).toMatchObject({ contextWindow: 500_000, maxTokens: 128_000 })
    const overridden = withOpenAICodexContextWindowOverrides(fallback, { [id]: 450_000 })
    expect(overridden.getModels().find(model => model.id === id)).toMatchObject({ contextWindow: 450_000, maxTokens: 128_000 })
    expect(withOpenAICodexContextWindowOverrides(fallback, {}).getModels().find(model => model.id === id)).toBe(original)
    expect(original.contextWindow).toBe(500_000)
    for (const model of fallback.getModels().filter(model => model.id !== id)) {
      expect(overridden.getModels().find(entry => entry.id === model.id)).toBe(model)
    }
    const native = { ...original, name: 'Native provider metadata', contextWindow: 600_000, maxTokens: 96_000 }
    const calibrated = withOpenAICodexModels({ ...provider, getModels: () => [native] })
    expect(calibrated.getModels().find(model => model.id === id)).toMatchObject(native)
    expect(native.contextWindow).toBe(600_000)
  })

  it('uses only installed defaults for unlisted models and newer defaults beyond the pinned ceiling', () => {
    for (const id of ['new-model', 'toString', 'gpt-5.6-sol']) {
      expect(openAICodexContextLimit(id, 1_100_000)).toEqual({ maxContextWindow: 1_100_000, contextLimitSource: 'catalog-default' })
    }
    expect(openAICodexContextLimit('gpt-5.3-codex-spark', 128_000).contextLimitSource).toBe('catalog-default')
  })

  it('rejects provider overrides above the ceiling even without Host settings', () => {
    expect(() => withOpenAICodexContextWindowOverrides(openaiCodexProvider(), { 'gpt-5.6-sol': 872_001 })).toThrow('integer from 1 to 872000')
  })

  it('round-trips detached catalog defaults and refuses incomplete or invalid wire limits', () => {
    const catalog = openAICodexModelCatalog()
    expect(decodeOpenAICodexModelCatalog(catalog)).toEqual(catalog)
    const model = catalog[0]!
    for (const patch of [
      { contextWindow: undefined }, { contextWindow: 0 }, { contextWindow: 1.5 },
      { maxContextWindow: undefined }, { maxContextWindow: model.contextWindow - 1 },
      { maxContextWindow: Number.MAX_SAFE_INTEGER + 1 }, { contextLimitSource: 'verified-server' },
    ]) expect(decodeOpenAICodexModelCatalog([{ ...model, ...patch }])).toBeUndefined()
    expect(decodeOpenAICodexModelCatalog([model, model])).toBeUndefined()
    expect(openAICodexModelCatalog()[0]).not.toBe(model)
  })
})
