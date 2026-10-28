/** Node-free model catalog contract shared by the Host route and browser card. */

/** Same-origin endpoint exposing the complete Codex model catalog. */
export const OPENAI_CODEX_MODEL_CATALOG_PATH = '/plugins/dsh-codex-connect/models'

/** Versioned official-client override policy, not a measured endpoint capacity. */
export const OPENAI_CODEX_CONTEXT_LIMIT_SOURCE = 'https://github.com/openai/codex/blob/39598ed17885970828acd42a6370131ed0190a98/codex-rs/models-manager/models.json'

/** Sol61 provenance refresh; the immutable catalog's default/override limits are unchanged. */
export const OPENAI_CODEX_SOL61_CONTEXT_LIMIT_SOURCE = 'https://github.com/openai/codex/blob/d63a9b8344cfe58bc78bbe319b560378fc8756ef/codex-rs/models-manager/models.json'

/** Terra61 default and override policy from the official Codex client, not API limits. */
export const OPENAI_CODEX_TERRA61_CONTEXT_LIMIT_SOURCE = 'https://github.com/openai/codex/blob/e8e6a922c0008bc08bacc69dd2ce9b6c3c12944c/codex-rs/models-manager/models.json'

/** Preserve historical provenance for existing models. */
export function openAICodexContextLimitSource(id: string): string {
  if (id === 'gpt-6.1-terra') return OPENAI_CODEX_TERRA61_CONTEXT_LIMIT_SOURCE
  return id === 'gpt-6.1-sol' ? OPENAI_CODEX_SOL61_CONTEXT_LIMIT_SOURCE : OPENAI_CODEX_CONTEXT_LIMIT_SOURCE
}

const CONFIGURATION_LIMITS: Readonly<Record<string, number>> = Object.freeze({
  'gpt-6.1-sol': 872_000,
  'gpt-6.1-terra': 872_000,
  'gpt-6-astra': 872_000,
  'gpt-6-sol': 872_000,
  'gpt-6-luna': 872_000,
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
  /** Effective base default before user overrides; a known bundled Sol61 snapshot is calibrated. */
  contextWindow: number
  /** Local configuration ceiling; account/route capacity can differ. */
  maxContextWindow: number
  contextLimitSource: 'codex-catalog' | 'catalog-default'
  /** Actual Host-advertised choices; absent for models without reasoning support. */
  reasoning?: { efforts: { id: string; name: string }[]; defaultEffort?: string }
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
    const reasoning = decodeReasoning(record['reasoning'])
    if (record['reasoning'] !== undefined && reasoning === undefined) return undefined
    ids.add(id)
    catalog.push({ id, name, contextWindow, maxContextWindow, contextLimitSource, ...(reasoning === undefined ? {} : { reasoning }) })
  }
  return catalog
}

function decodeReasoning(value: unknown): OpenAICodexModelCatalogEntry['reasoning'] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  const choices = record['efforts']
  if (!Array.isArray(choices) || choices.length === 0 || choices.length > 64) return undefined
  const efforts: { id: string; name: string }[] = []
  const ids = new Set<string>()
  for (const choice of choices) {
    if (typeof choice !== 'object' || choice === null || Array.isArray(choice)) return undefined
    const item = choice as Record<string, unknown>
    if (typeof item['id'] !== 'string' || item['id'].length === 0 || item['id'].length > 128 || ids.has(item['id'])
      || typeof item['name'] !== 'string' || item['name'].length === 0 || item['name'].length > 256) return undefined
    ids.add(item['id'])
    efforts.push({ id: item['id'], name: item['name'] })
  }
  const defaultEffort = record['defaultEffort']
  if (defaultEffort !== undefined && (typeof defaultEffort !== 'string' || !ids.has(defaultEffort))) return undefined
  return { efforts, ...(defaultEffort === undefined ? {} : { defaultEffort }) }
}
