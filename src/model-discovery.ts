/** Credential-free model discovery using the installed Host adapter's reasoning metadata. */
import type { PiAiAdapter } from '@deepseek-ai/dsh-llm-pi-ai'
import { openAICodexModelCatalog } from './model-catalog.ts'
import type { OpenAICodexModelCatalogEntry } from './model-contract.ts'
import { OPENAI_CODEX_PROVIDER } from './store.ts'

/** Project actual supported efforts without guessing per-model capabilities or reading credentials. */
export async function resolveOpenAICodexModelCatalog(adapter: Pick<PiAiAdapter, 'resolveModel'>): Promise<OpenAICodexModelCatalogEntry[]> {
  return Promise.all(openAICodexModelCatalog().map(async entry => {
    const model = await adapter.resolveModel(OPENAI_CODEX_PROVIDER, entry.id)
    return { ...entry, ...(model.reasoning === undefined ? {} : { reasoning: {
      efforts: model.reasoning.efforts.map(effort => ({ id: effort.id, name: effort.name })),
      ...(model.reasoning.defaultEffort === undefined ? {} : { defaultEffort: model.reasoning.defaultEffort }),
    } }) }
  }))
}
