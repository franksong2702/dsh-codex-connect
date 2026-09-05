/** Client-safe contract for the Harness web search route. */

/** Stable provider id written to the Host-owned `web.searchProvider` field. */
export const OPENAI_CODEX_SEARCH_ROUTE_PROVIDER = 'openai-codex'

/** Fields Codex Connect reads from the Host-owned web settings section. */
export interface OpenAICodexSearchRouteConfig {
  /** Profile-wide provider selected for `web_search`; absent delegates to Harness selection. */
  searchProvider?: string
}

/**
 * Narrow the Host-owned web settings section without accepting an invalid route value.
 * @param value - Resolved settings section from the shared browser mirror.
 * @returns the search route used by the Codex Connect settings UI, or undefined when invalid.
 */
export function decodeOpenAICodexSearchRouteConfig(value: unknown): OpenAICodexSearchRouteConfig | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const searchProvider = (value as Record<string, unknown>)['searchProvider']
  if (searchProvider !== undefined && (typeof searchProvider !== 'string' || searchProvider.length === 0)) return undefined
  return searchProvider === undefined ? {} : { searchProvider }
}
