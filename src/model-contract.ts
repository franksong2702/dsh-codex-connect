/** Node-free model catalog contract shared by the Host route and browser card. */

/** Same-origin endpoint exposing the complete Codex model catalog. */
export const OPENAI_CODEX_MODEL_CATALOG_PATH = '/plugins/dsh-codex-connect/models'

/** One model available from the complete provider catalog. */
export interface OpenAICodexModelCatalogEntry {
  id: string
  name: string
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
    if (typeof id !== 'string' || id.length === 0 || typeof name !== 'string' || name.length === 0 || ids.has(id)) return undefined
    ids.add(id)
    catalog.push({ id, name })
  }
  return catalog
}
