import type { OpenAICodexModelCatalogEntry } from '../src/model-contract.ts'

/** Deterministic wire catalog for UI tests; independent of the production limit table. */
export function modelCatalogFixture(models: readonly { id: string; name: string }[]): OpenAICodexModelCatalogEntry[] {
  return models.map(model => ({ ...model, contextWindow: 272_000, maxContextWindow: 872_000, contextLimitSource: 'codex-catalog' }))
}
