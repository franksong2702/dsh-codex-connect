/** Codex model catalog shared by the runtime adapter and standalone diagnostics. */

import type { Model, Provider } from '@earendil-works/pi-ai'
import { openaiCodexProvider } from '@earendil-works/pi-ai/providers/openai-codex'
import type { OpenAICodexModelCatalogEntry } from './model-contract.ts'
import { openAICodexContextLimit } from './model-contract.ts'
import { OPENAI_CODEX_PROVIDER } from './store.ts'

/** Official Codex id supplied when the installed pi-ai catalog predates Astra. */
export const OPENAI_CODEX_ASTRA_MODEL_ID = 'gpt-6-astra'

const OPENAI_CODEX_ASTRA_MODEL: Model<'openai-codex-responses'> = {
  id: OPENAI_CODEX_ASTRA_MODEL_ID,
  name: 'GPT-6-Astra',
  api: 'openai-codex-responses',
  provider: OPENAI_CODEX_PROVIDER,
  baseUrl: 'https://chatgpt.com/backend-api',
  reasoning: true,
  input: ['text', 'image'],
  // ChatGPT OAuth usage is read from the server; no authoritative token-price schedule is available here.
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 272_000,
  maxTokens: 128_000,
  thinkingLevelMap: { off: null, minimal: null, xhigh: 'xhigh', max: 'max' },
  compat: {
    supportsOpenAIGrammarTools: true,
    supportsAdditionalTools: true,
    supportsToolSearch: true,
  },
}

/** Preserve native Astra metadata with calibrated effort choices, or add the fallback. */
export function withOpenAICodexAstra(
  provider: Provider<'openai-codex-responses'>,
): Provider<'openai-codex-responses'> {
  const baseline = provider.getModels()
  const models = baseline.some(model => model.id === OPENAI_CODEX_ASTRA_MODEL_ID)
    ? baseline.map(model => model.id === OPENAI_CODEX_ASTRA_MODEL_ID
      ? { ...model, thinkingLevelMap: { ...model.thinkingLevelMap, ...OPENAI_CODEX_ASTRA_MODEL.thinkingLevelMap } }
      : model)
    : [OPENAI_CODEX_ASTRA_MODEL, ...baseline]
  return { ...provider, getModels: () => models }
}

/** Missing Codex catalog entries; never replace upstream capacity, pricing or capabilities. */
export function withOpenAICodexModels(
  provider: Provider<'openai-codex-responses'>,
): Provider<'openai-codex-responses'> {
  const baseline = withOpenAICodexAstra(provider)
  const models = [...baseline.getModels()]
  for (const [id, name] of [['gpt-6-sol', 'GPT-6-Sol'], ['gpt-6-luna', 'GPT-6-Luna']] as const) {
    const index = models.findIndex(model => model.id === id)
    // Ultra is Codex client orchestration, not a pi-ai thinking level.
    const thinkingLevelMap = { off: null, minimal: null, xhigh: 'xhigh', max: 'max' } as const
    if (index === -1) models.push({ ...OPENAI_CODEX_ASTRA_MODEL, id, name, thinkingLevelMap })
    else models[index] = { ...models[index]!, thinkingLevelMap: { ...models[index]!.thinkingLevelMap, ...thinkingLevelMap } }
  }
  return { ...baseline, getModels: () => models }
}

/** Return a detached copy of the effective Codex model catalog. */
export function openAICodexModelCatalog(): readonly OpenAICodexModelCatalogEntry[] {
  return withOpenAICodexModels(openaiCodexProvider()).getModels().map(model => ({
    id: model.id, name: model.name, contextWindow: model.contextWindow,
    ...openAICodexContextLimit(model.id, model.contextWindow),
  }))
}

/** SSE avoids leaving a one-shot Headless process alive through a cached WebSocket. */
export const OPENAI_CODEX_TRANSPORT = 'sse' as const
