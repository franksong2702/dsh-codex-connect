/** Node-free settings contract shared by the Host plugin and browser card. */

/** Stable Harness settings namespace owned by this plugin. */
export const OPENAI_CODEX_SETTINGS_NAMESPACE = 'llm-openai-codex'

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

/** Default local HTTP CONNECT proxy used for OpenAI Codex provider traffic. */
export const DEFAULT_OPENAI_CODEX_PROXY_URL = 'http://127.0.0.1:7890'

/** Accept one credential-free HTTP(S) proxy origin. */
export function isValidOpenAICodexProxyUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return (url.protocol === 'http:' || url.protocol === 'https:')
      && url.username === ''
      && url.password === ''
      && url.pathname === '/'
      && url.search === ''
      && url.hash === ''
  } catch {
    return false
  }
}

/** Fully resolved user-editable section presented by Plugin configuration. */
export interface OpenAICodexSettingsConfig {
  /** Model ids advertised in selectors; undefined advertises the full catalog. */
  models: string[] | undefined
  /** Route OpenAI Codex provider traffic through the configured proxy. */
  enableProxy: boolean
  /** Credential-free HTTP(S) proxy origin. */
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
  return { ...DEFAULT_OPENAI_CODEX_SETTINGS, ...value }
}

/** Resolve the active proxy URL, or direct transport when proxying is disabled. */
export function resolveOpenAICodexProxyUrl(
  value: Partial<OpenAICodexSettingsConfig>,
): string | undefined {
  const settings = resolveOpenAICodexSettings(value)
  if (!settings.enableProxy) return undefined
  const proxyUrl = settings.proxyUrl.trim()
  if (!isValidOpenAICodexProxyUrl(proxyUrl)) {
    throw new TypeError('OpenAI Codex proxy URL must be a credential-free HTTP(S) origin')
  }
  return proxyUrl
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
  // Older Host snapshots predate proxy settings; absence keeps direct transport.
  if (enableProxy !== undefined && typeof enableProxy !== 'boolean') return undefined
  if (proxyUrl !== undefined && typeof proxyUrl !== 'string') return undefined
  if ((enableProxy ?? false) && proxyUrl !== undefined && !isValidOpenAICodexProxyUrl(proxyUrl)) return undefined
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
    proxyUrl: proxyUrl ?? DEFAULT_OPENAI_CODEX_PROXY_URL,
    enableSearch,
    enableImageTool,
    enableImageGeneration: enableImageGeneration ?? false,
    searchModel,
    searchMode,
    searchContextSize,
    searchMaxOutputTokens,
  }
}
