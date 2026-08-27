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
