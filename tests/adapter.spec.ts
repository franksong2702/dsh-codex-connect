import { describe, expect, it } from 'vitest'
import { openaiCodexProvider } from '@earendil-works/pi-ai/providers/openai-codex'
import {
  createOpenAICodexAdapter,
  createOpenAICodexProfile,
  openAICodexModelCatalog,
  OPENAI_CODEX_MAX_REQUEST_IMAGE_BYTES,
  OPENAI_CODEX_REQUEST_IMAGE_MAX_BYTES,
  OPENAI_CODEX_REQUEST_IMAGE_PIXEL_BUDGET,
  OPENAI_CODEX_TRANSPORT,
  withOpenAICodexContextWindowOverrides,
} from '../src/adapter.ts'
import type { OpenAICodexCredentialStore } from '../src/store.ts'
import { OPENAI_CODEX_PROVIDER } from '../src/store.ts'
import { Config } from '../src/index.ts'

describe('OpenAI Codex rc.2 adapter profile', () => {
  it('distinguishes an omitted model list from an explicitly empty list', () => {
    expect(Config({}).models).toBeUndefined()
    expect(Config({ models: [] }).models).toEqual([])
  })

  it('supplies all request-image defaults required by ResolvedPiAiProviderProfile', () => {
    const profile = createOpenAICodexProfile(openaiCodexProvider())

    expect(profile.maxRequestImageBytes).toBe(OPENAI_CODEX_MAX_REQUEST_IMAGE_BYTES)
    expect(profile.requestImagePixelBudget).toBe(OPENAI_CODEX_REQUEST_IMAGE_PIXEL_BUDGET)
    expect(profile.requestImageMaxBytes).toBe(OPENAI_CODEX_REQUEST_IMAGE_MAX_BYTES)
    expect(profile.maxRequestImageBytes).toBe(20 * 1024 * 1024)
    expect(profile.requestImagePixelBudget).toBe(2048 * 2048)
    expect(profile.requestImageMaxBytes).toBe(1024 * 1024)
  })

  it('uses the finite SSE transport for completed one-shot requests', () => {
    const profile = createOpenAICodexProfile(openaiCodexProvider())

    expect(profile.transport).toBe(OPENAI_CODEX_TRANSPORT)
    expect(profile.transport).toBe('sse')
  })

  it('filters discovery while keeping a hidden model resolvable', async () => {
    const catalog = openAICodexModelCatalog()
    expect(catalog.length).toBeGreaterThan(2)
    const adapter = createOpenAICodexAdapter(
      {} as OpenAICodexCredentialStore,
      () => undefined,
      undefined,
      () => [catalog[1]!.id, catalog[0]!.id, catalog[1]!.id],
    )

    const listed = await adapter.listModels(OPENAI_CODEX_PROVIDER)
    expect(listed.map(model => model.id)).toEqual([catalog[0]!.id, catalog[1]!.id])
    await expect(adapter.resolveModel(OPENAI_CODEX_PROVIDER, catalog[2]!.id)).resolves.toMatchObject({
      provider: OPENAI_CODEX_PROVIDER,
      id: catalog[2]!.id,
    })
  })

  it('advertises the full catalog when no visible-model list is configured', async () => {
    const adapter = createOpenAICodexAdapter(
      {} as OpenAICodexCredentialStore,
      () => undefined,
    )
    await expect(adapter.listModels(OPENAI_CODEX_PROVIDER)).resolves.toHaveLength(openAICodexModelCatalog().length)
  })
})

describe('context-window overrides', () => {
  it('keeps the advertised catalog when no overrides are configured', () => {
    const baseline = openaiCodexProvider().getModels()
    const profile = createOpenAICodexProfile(openaiCodexProvider())

    const listed = profile.piProvider.getModels()
    expect(listed).toHaveLength(baseline.length)
    for (const model of listed) {
      expect(model.contextWindow).toBe(baseline.find(entry => entry.id === model.id)?.contextWindow)
    }
  })

  it('replaces only the configured model context windows', () => {
    const baseline = openaiCodexProvider().getModels()
    const target = baseline.find(model => model.id.includes('gpt-5.6')) ?? baseline[0]!
    const other = baseline.find(model => model.id !== target.id)!
    const overrides = { [target.id]: 1_050_000 }
    const profile = createOpenAICodexProfile(openaiCodexProvider(), undefined, undefined, undefined, overrides)

    const listed = profile.piProvider.getModels()
    expect(listed.find(model => model.id === target.id)?.contextWindow).toBe(1_050_000)
    expect(listed.find(model => model.id === other.id)?.contextWindow).toBe(other.contextWindow)
  })

  it('accepts a contextWindowOverrides config section', () => {
    expect(Config({ contextWindowOverrides: { 'gpt-5.6-sol': 1_050_000 } }).contextWindowOverrides)
      .toEqual({ 'gpt-5.6-sol': 1_050_000 })
    expect(Config({}).contextWindowOverrides).toBeUndefined()
  })

  it('withOpenAICodexContextWindowOverrides does not mutate the baseline provider', () => {
    const provider = openaiCodexProvider()
    const baseline = provider.getModels()
    const overridden = withOpenAICodexContextWindowOverrides(provider, { [baseline[0]!.id]: 999_999 })

    expect(overridden.getModels()[0]!.contextWindow).toBe(999_999)
    expect(provider.getModels()[0]!.contextWindow).toBe(baseline[0]!.contextWindow)
  })

  it('refreshes resolved budgets without changing an already prepared call or output limits', async () => {
    const target = 'gpt-5.6-sol'
    let overrides: Record<string, number> | undefined = { [target]: 350_000 }
    const adapter = createOpenAICodexAdapter({} as OpenAICodexCredentialStore, () => undefined,
      undefined, undefined, undefined, undefined, () => overrides)
    const first = await adapter.prepareCall(OPENAI_CODEX_PROVIDER, target)
    expect(first.model.context?.contextWindow).toBe(350_000)
    overrides[target] = 300_000
    const next = await adapter.prepareCall(OPENAI_CODEX_PROVIDER, target)
    expect(next.model.context?.contextWindow).toBe(300_000)
    expect(first.model.context?.contextWindow).toBe(350_000)
    overrides = undefined
    const baseline = openaiCodexProvider().getModels().find(model => model.id === target)!
    expect((await adapter.resolveModel(OPENAI_CODEX_PROVIDER, target)).context?.contextWindow).toBe(baseline.contextWindow)
    const profile = createOpenAICodexProfile(openaiCodexProvider(), undefined, undefined, undefined, { [target]: 350_000 })
    expect(profile.piProvider.getModels().find(model => model.id === target)?.maxTokens).toBe(baseline.maxTokens)
    expect(profile.configuredMaxTokens.size).toBe(0)
    expect(profile.transport).toBe('sse')
  })

  it('reports unknown catalog ids instead of silently ignoring the override', () => {
    expect(() => createOpenAICodexProfile(openaiCodexProvider(), undefined, undefined, undefined, { 'misspelled-model': 300_000 }))
      .toThrow('unknown model id "misspelled-model"')
  })
})
