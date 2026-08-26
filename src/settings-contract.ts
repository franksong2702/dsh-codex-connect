/** Node-free settings contract shared by the Host plugin and browser card. */

/** Stable Harness settings namespace owned by this plugin. */
export const OPENAI_CODEX_SETTINGS_NAMESPACE = 'llm-openai-codex'

/** Suggested local HTTP proxy shown by the settings UI; it is never enabled by default. */
export const DEFAULT_OPENAI_CODEX_PROXY_URL = 'http://127.0.0.1:7890'

/**
 * Normalize the credential-free HTTP proxy URL accepted by Codex Connect.
 * Paths, query strings, fragments, and embedded credentials are rejected so
 * the value remains an origin rather than an opaque request target.
 */
export function normalizeOpenAICodexProxyUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.trim().length === 0) return undefined
  try {
    const parsed = new URL(value.trim())
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return undefined
    if (parsed.username !== '' || parsed.password !== '') return undefined
    if (parsed.pathname !== '/' || parsed.search !== '' || parsed.hash !== '') return undefined
    if (parsed.hostname.length === 0) return undefined
    if (parsed.port !== '' && (!/^\d+$/u.test(parsed.port) || Number(parsed.port) < 1 || Number(parsed.port) > 65_535)) return undefined
    return parsed.origin
  } catch {
    return undefined
  }
}

/** Whether a value is a supported, canonical HTTP(S) proxy origin. */
export function isValidOpenAICodexProxyUrl(value: unknown): value is string {
  return normalizeOpenAICodexProxyUrl(value) !== undefined
}

/** Search modes accepted by the Codex standalone search endpoint. */
export type OpenAICodexSearchMode = 'cached' | 'indexed' | 'live'

/** Search-context sizes accepted by the Codex standalone search endpoint. */
export type OpenAICodexSearchContextSize = 'low' | 'medium' | 'high'

/** Default model used by the standalone search endpoint. */
export const DEFAULT_OPENAI_CODEX_SEARCH_MODEL = 'gpt-5.6-sol'
/** Default search mode, matching the official local Codex client. */
export const DEFAULT_OPENAI_CODEX_SEARCH_MODE: OpenAICodexSearchMode = 'cached'
/** Default provider search-context size. */
export const DEFAULT_OPENAI_CODEX_SEARCH_CONTEXT_SIZE: OpenAICodexSearchContextSize = 'medium'
/** Default output budget for the standalone search response. */
export const DEFAULT_OPENAI_CODEX_SEARCH_MAX_OUTPUT_TOKENS = 10_000

/** Fully resolved user-editable section presented by Plugin configuration. */
export interface OpenAICodexSettingsConfig {
  /** Model ids advertised in selectors; undefined advertises the full catalog. */
  models: string[] | undefined
  /** Route Codex Connect requests through the explicitly configured proxy. */
  enableProxy: boolean
  /** Credential-free HTTP(S) proxy origin; inactive while enableProxy is false. */
  proxyUrl: string
  enableSearch: boolean
  enableImageTool: boolean
  enableImageGeneration: boolean
  searchModel: string
  searchMode: OpenAICodexSearchMode
  searchContextSize: OpenAICodexSearchContextSize
  searchMaxOutputTokens: number
}

export const DEFAULT_OPENAI_CODEX_SETTINGS: Readonly<OpenAICodexSettingsConfig> = Object.freeze({
  models: undefined,
  enableProxy: false,
  proxyUrl: DEFAULT_OPENAI_CODEX_PROXY_URL,
  enableSearch: false,
  enableImageTool: false,
  enableImageGeneration: false,
  searchModel: DEFAULT_OPENAI_CODEX_SEARCH_MODEL,
  searchMode: DEFAULT_OPENAI_CODEX_SEARCH_MODE,
  searchContextSize: DEFAULT_OPENAI_CODEX_SEARCH_CONTEXT_SIZE,
  searchMaxOutputTokens: DEFAULT_OPENAI_CODEX_SEARCH_MAX_OUTPUT_TOKENS,
})

/** Fill the schema defaults even when called without Cordis validation. */
export function resolveOpenAICodexSettings(
  value: Partial<OpenAICodexSettingsConfig>,
): OpenAICodexSettingsConfig {
  const resolved = { ...DEFAULT_OPENAI_CODEX_SETTINGS, ...value }
  if (!isValidOpenAICodexProxyUrl(resolved.proxyUrl)) {
    throw new TypeError('OpenAI Codex proxyUrl must be an HTTP(S) origin without credentials or a path')
  }
  return resolved
}

/** Resolve the active proxy without treating a disabled value as a route. */
export function resolveOpenAICodexProxyUrl(
  value: Partial<OpenAICodexSettingsConfig>,
): string | undefined {
  const resolved = resolveOpenAICodexSettings(value)
  return resolved.enableProxy ? normalizeOpenAICodexProxyUrl(resolved.proxyUrl) : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Narrow the redacted settings wire payload before it enters React state. */
export function decodeOpenAICodexSettings(value: unknown): OpenAICodexSettingsConfig | undefined {
  if (!isRecord(value)) return undefined
  const models = value['models']
  const enableProxy = value['enableProxy']
  const proxyUrl = value['proxyUrl']
  const enableSearch = value['enableSearch']
  const enableImageTool = value['enableImageTool']
  const enableImageGeneration = value['enableImageGeneration']
  const searchModel = value['searchModel']
  const searchMode = value['searchMode']
  const searchContextSize = value['searchContextSize']
  const searchMaxOutputTokens = value['searchMaxOutputTokens']
  if (models !== undefined && (!Array.isArray(models) || models.some(model => typeof model !== 'string'))) return undefined
  if (enableProxy !== undefined && typeof enableProxy !== 'boolean') return undefined
  if (proxyUrl !== undefined && (typeof proxyUrl !== 'string' || !isValidOpenAICodexProxyUrl(proxyUrl))) return undefined
  if (typeof enableSearch !== 'boolean' || typeof enableImageTool !== 'boolean') return undefined
  // Older Host snapshots predate image generation; absence maps to its safe default.
  if (enableImageGeneration !== undefined && typeof enableImageGeneration !== 'boolean') return undefined
  if (typeof searchModel !== 'string' || searchModel.trim().length === 0) return undefined
  if (searchMode !== 'cached' && searchMode !== 'indexed' && searchMode !== 'live') return undefined
  if (searchContextSize !== 'low' && searchContextSize !== 'medium' && searchContextSize !== 'high') return undefined
  if (typeof searchMaxOutputTokens !== 'number' || !Number.isInteger(searchMaxOutputTokens) || searchMaxOutputTokens < 1) return undefined
  return {
    models: models === undefined ? undefined : [...new Set(models)],
    enableProxy: enableProxy ?? false,
    proxyUrl: proxyUrl === undefined ? DEFAULT_OPENAI_CODEX_PROXY_URL : normalizeOpenAICodexProxyUrl(proxyUrl)!,
    enableSearch,
    enableImageTool,
    enableImageGeneration: enableImageGeneration ?? false,
    searchModel,
    searchMode,
    searchContextSize,
    searchMaxOutputTokens,
  }
}
