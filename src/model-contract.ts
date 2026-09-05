/** Node-free model catalog contract shared by the Host route and browser card. */

/** Same-origin endpoint exposing the complete Codex model catalog. */
export const OPENAI_CODEX_MODEL_CATALOG_PATH = '/plugins/dsh-codex-connect/models'

/** Versioned official-client override policy, not a measured endpoint capacity. */
export const OPENAI_CODEX_CONTEXT_LIMIT_SOURCE = 'https://github.com/openai/codex/blob/a97cf1b72eaad05aa49847bc81d09ceac9327754/codex-rs/models-manager/models.json'

const CONFIGURATION_LIMITS: Readonly<Record<string, number>> = Object.freeze({
  'gpt-6-astra': 872_000,
  'gpt-5.6-sol': 872_000,
  'gpt-5.6-terra': 872_000,
  'gpt-5.6-luna': 872_000,
  'gpt-5.4': 1_000_000,
  'gpt-5.5': 272_000,
  'gpt-5.4-mini': 272_000,
})

/** Keep unlisted or newer provider defaults usable without inventing a larger limit. */
export function openAICodexContextLimit(id: string, contextWindow: number): {
  maxContextWindow: number
  contextLimitSource: 'codex-catalog' | 'catalog-default'
} {
  const ceiling = Object.hasOwn(CONFIGURATION_LIMITS, id) ? CONFIGURATION_LIMITS[id] : undefined
  return ceiling === undefined || ceiling < contextWindow
    ? { maxContextWindow: contextWindow, contextLimitSource: 'catalog-default' }
    : { maxContextWindow: ceiling, contextLimitSource: 'codex-catalog' }
}

/** Whether a proposed local token budget fits the model's configuration range. */
export function isValidOpenAICodexContextBudget(value: number, maximum: number): boolean {
  return Number.isSafeInteger(value) && value > 0 && value <= maximum
}

/** One model available from the complete provider catalog. */
export interface OpenAICodexModelCatalogEntry {
  id: string
  name: string
  /** Unmodified provider-catalog default, even when an override is active. */
  contextWindow: number
  /** Local configuration ceiling; account/route capacity can differ. */
  maxContextWindow: number
  contextLimitSource: 'codex-catalog' | 'catalog-default'
}

/** Validate the model catalog before it enters React state. */
export function decodeOpenAICodexModelCatalog(value: unknown): OpenAICodexModelCatalogEntry[] | undefined {
  if (!Array.isArray(value)) return undefined
  const catalog: OpenAICodexModelCatalogEntry[] = []
  const ids = new Set<string>()
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return undefined
    const record = entry as Record<string, unknown>
    const id = record['id']
    const name = record['name']
    const contextWindow = record['contextWindow']
    const maxContextWindow = record['maxContextWindow']
    const contextLimitSource = record['contextLimitSource']
    if (typeof id !== 'string' || id.length === 0 || typeof name !== 'string' || name.length === 0 || ids.has(id)) return undefined
    if (typeof contextWindow !== 'number' || typeof maxContextWindow !== 'number'
      || !isValidOpenAICodexContextBudget(maxContextWindow, Number.MAX_SAFE_INTEGER)
      || !isValidOpenAICodexContextBudget(contextWindow, maxContextWindow)
      || (contextLimitSource !== 'codex-catalog' && contextLimitSource !== 'catalog-default')) return undefined
    ids.add(id)
    catalog.push({ id, name, contextWindow, maxContextWindow, contextLimitSource })
  }
  return catalog
}
