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

/** Fully resolved user-editable section presented by Plugin configuration. */
export interface OpenAICodexSettingsConfig {
  enableSearch: boolean
  enableImageTool: boolean
  searchModel: string
  searchMode: OpenAICodexSearchMode
  searchContextSize: OpenAICodexSearchContextSize
  searchMaxOutputTokens: number
  // Proxy configuration for OpenAI requests
  proxyEnabled: boolean
  proxyHost: string
  proxyPort: number
}

export const DEFAULT_OPENAI_CODEX_SETTINGS: Readonly<OpenAICodexSettingsConfig> = Object.freeze({
  enableSearch: false,
  enableImageTool: false,
  searchModel: DEFAULT_OPENAI_CODEX_SEARCH_MODEL,
  searchMode: DEFAULT_OPENAI_CODEX_SEARCH_MODE,
  searchContextSize: DEFAULT_OPENAI_CODEX_SEARCH_CONTEXT_SIZE,
  searchMaxOutputTokens: DEFAULT_OPENAI_CODEX_SEARCH_MAX_OUTPUT_TOKENS,
  // Default proxy settings
  proxyEnabled: false,
  proxyHost: '127.0.0.1',
  proxyPort: 7890,
})

/** Fill the schema defaults even when called without Cordis validation. */
export function resolveOpenAICodexSettings(
  value: Partial<OpenAICodexSettingsConfig>,
): OpenAICodexSettingsConfig {
  return { ...DEFAULT_OPENAI_CODEX_SETTINGS, ...value }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Narrow the redacted settings wire payload before it enters React state. */
export function decodeOpenAICodexSettings(value: unknown): OpenAICodexSettingsConfig | undefined {
  if (!isRecord(value)) return undefined
  const enableSearch = value['enableSearch']
  const enableImageTool = value['enableImageTool']
  const searchModel = value['searchModel']
  const searchMode = value['searchMode']
  const searchContextSize = value['searchContextSize']
  const searchMaxOutputTokens = value['searchMaxOutputTokens']
  const proxyEnabled = value['proxyEnabled']
  const proxyHost = value['proxyHost']
  const proxyPort = value['proxyPort']
  
  if (typeof enableSearch !== 'boolean' || typeof enableImageTool !== 'boolean') return undefined
  if (typeof searchModel !== 'string' || searchModel.trim().length === 0) return undefined
  if (searchMode !== 'cached' && searchMode !== 'indexed' && searchMode !== 'live') return undefined
  if (searchContextSize !== 'low' && searchContextSize !== 'medium' && searchContextSize !== 'high') return undefined
  if (typeof searchMaxOutputTokens !== 'number' || !Number.isInteger(searchMaxOutputTokens) || searchMaxOutputTokens < 1) return undefined
  
  // Validate proxy settings (optional fields)
  if (proxyEnabled !== undefined && typeof proxyEnabled !== 'boolean') return undefined
  if (proxyHost !== undefined && (typeof proxyHost !== 'string' || proxyHost.trim().length === 0)) return undefined
  if (proxyPort !== undefined && (typeof proxyPort !== 'number' || !Number.isInteger(proxyPort) || proxyPort < 1 || proxyPort > 65535)) return undefined
  
  return {
    enableSearch,
    enableImageTool,
    searchModel,
    searchMode,
    searchContextSize,
    searchMaxOutputTokens,
    proxyEnabled: typeof proxyEnabled === 'boolean' ? proxyEnabled : DEFAULT_OPENAI_CODEX_SETTINGS.proxyEnabled,
    proxyHost: typeof proxyHost === 'string' ? proxyHost : DEFAULT_OPENAI_CODEX_SETTINGS.proxyHost,
    proxyPort: typeof proxyPort === 'number' ? proxyPort : DEFAULT_OPENAI_CODEX_SETTINGS.proxyPort,
  }
}
