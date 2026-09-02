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

/**
 * Whether a value is a bounded per-model context-window override map. Keys
 * are nonempty, unpadded model ids; values are positive safe integers or null
 * to restore that model's catalog default. The Host also checks catalog
 * membership and the model-specific configuration ceiling.
 */
export function isValidOpenAICodexContextWindowOverrides(value: unknown): value is Readonly<Record<string, number | null>> {
  if (!isRecord(value)) return false
  const entries = Object.entries(value)
  if (entries.length > 256) return false
  return entries.every(([modelId, window]) => modelId.length > 0 && modelId.trim() === modelId
    && (window === null || (typeof window === 'number' && Number.isSafeInteger(window) && window > 0)))
}

/** Preserve per-model null masks until the Host has merged its settings layers. */
export function parseOpenAICodexContextWindowOverrides(value: unknown): Readonly<Record<string, number | null>> | undefined {
  if (value === undefined || value === null) return undefined
  if (!isValidOpenAICodexContextWindowOverrides(value)) {
    throw new TypeError('OpenAI Codex contextWindowOverrides must contain at most 256 nonempty model ids with positive safe-integer token budgets or null resets')
  }
  return { ...value }
}

/** Resolve merged settings; whole-map or per-model null masks use catalog defaults. */
export function resolveOpenAICodexContextWindowOverrides(value: unknown): Readonly<Record<string, number>> | undefined {
  const overrides = parseOpenAICodexContextWindowOverrides(value)
  if (overrides === undefined) return undefined
  return Object.fromEntries(Object.entries(overrides).filter((entry): entry is [string, number] => entry[1] !== null))
}

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
  /**
   * Per-model context-window overrides keyed by catalog model id. Each value
   * replaces the advertised `contextWindow` for that model inside the adapter
   * profile for client budgeting. It does not change or verify server capacity,
   * output-token limits, or the deployment's compaction policy.
   */
  contextWindowOverrides: Readonly<Record<string, number>> | undefined
  enableSearch: boolean
  enableImageTool: boolean
  enableImageGeneration: boolean
  /** Whether this profile accepted the Auto-review data disclosure. */
  autoReviewDisclosureAcknowledged: boolean
  /** Let the hidden Codex reviewer answer eligible DSH approval requests. */
  enableAutoReview: boolean
  searchModel: string
  searchMode: OpenAICodexSearchMode
  searchContextSize: OpenAICodexSearchContextSize
  searchMaxOutputTokens: number
}

export const DEFAULT_OPENAI_CODEX_SETTINGS: Readonly<OpenAICodexSettingsConfig> = Object.freeze({
  models: undefined,
  enableProxy: false,
  proxyUrl: DEFAULT_OPENAI_CODEX_PROXY_URL,
  contextWindowOverrides: undefined,
  enableSearch: false,
  enableImageTool: false,
  enableImageGeneration: false,
  autoReviewDisclosureAcknowledged: false,
  enableAutoReview: false,
  searchModel: DEFAULT_OPENAI_CODEX_SEARCH_MODEL,
  searchMode: DEFAULT_OPENAI_CODEX_SEARCH_MODE,
  searchContextSize: DEFAULT_OPENAI_CODEX_SEARCH_CONTEXT_SIZE,
  searchMaxOutputTokens: DEFAULT_OPENAI_CODEX_SEARCH_MAX_OUTPUT_TOKENS,
})

/** Input settings allow null to disable overrides inherited from a lower settings layer. */
export interface OpenAICodexSettingsInput extends Partial<Omit<OpenAICodexSettingsConfig, 'contextWindowOverrides'>> {
  contextWindowOverrides?: Readonly<Record<string, number | null>> | null | undefined
}

/** Fill the schema defaults even when called without Cordis validation. */
export function resolveOpenAICodexSettings(
  value: OpenAICodexSettingsInput,
): OpenAICodexSettingsConfig {
  const resolved = { ...DEFAULT_OPENAI_CODEX_SETTINGS, ...value }
  if (!isValidOpenAICodexProxyUrl(resolved.proxyUrl)) {
    throw new TypeError('OpenAI Codex proxyUrl must be an HTTP(S) origin without credentials or a path')
  }
  return { ...resolved, contextWindowOverrides: resolveOpenAICodexContextWindowOverrides(resolved.contextWindowOverrides) }
}

/** Resolve the active proxy without treating a disabled value as a route. */
export function resolveOpenAICodexProxyUrl(
  value: OpenAICodexSettingsInput,
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
  const contextWindowOverrides = value['contextWindowOverrides']
  const enableSearch = value['enableSearch']
  const enableImageTool = value['enableImageTool']
  const enableImageGeneration = value['enableImageGeneration']
  const autoReviewDisclosureAcknowledged = value['autoReviewDisclosureAcknowledged']
  const enableAutoReview = value['enableAutoReview']
  const searchModel = value['searchModel']
  const searchMode = value['searchMode']
  const searchContextSize = value['searchContextSize']
  const searchMaxOutputTokens = value['searchMaxOutputTokens']
  if (models !== undefined && (!Array.isArray(models) || models.some(model => typeof model !== 'string'))) return undefined
  if (enableProxy !== undefined && typeof enableProxy !== 'boolean') return undefined
  if (proxyUrl !== undefined && (typeof proxyUrl !== 'string' || !isValidOpenAICodexProxyUrl(proxyUrl))) return undefined
  if (contextWindowOverrides !== undefined && contextWindowOverrides !== null && !isValidOpenAICodexContextWindowOverrides(contextWindowOverrides)) return undefined
  if (typeof enableSearch !== 'boolean' || typeof enableImageTool !== 'boolean') return undefined
  // Older Host snapshots predate image generation; absence maps to its safe default.
  if (enableImageGeneration !== undefined && typeof enableImageGeneration !== 'boolean') return undefined
  // Older Host snapshots predate the disclosure acknowledgement; absence requires confirmation.
  if (autoReviewDisclosureAcknowledged !== undefined && typeof autoReviewDisclosureAcknowledged !== 'boolean') return undefined
  // Older Host snapshots predate Auto-review; absence maps to its safe default.
  if (enableAutoReview !== undefined && typeof enableAutoReview !== 'boolean') return undefined
  if (typeof searchModel !== 'string' || searchModel.trim().length === 0) return undefined
  if (searchMode !== 'cached' && searchMode !== 'indexed' && searchMode !== 'live') return undefined
  if (searchContextSize !== 'low' && searchContextSize !== 'medium' && searchContextSize !== 'high') return undefined
  if (typeof searchMaxOutputTokens !== 'number' || !Number.isInteger(searchMaxOutputTokens) || searchMaxOutputTokens < 1) return undefined
  const overrides = resolveOpenAICodexContextWindowOverrides(contextWindowOverrides)
  return {
    models: models === undefined ? undefined : [...new Set(models)],
    enableProxy: enableProxy ?? false,
    proxyUrl: proxyUrl === undefined ? DEFAULT_OPENAI_CODEX_PROXY_URL : normalizeOpenAICodexProxyUrl(proxyUrl)!,
    contextWindowOverrides: overrides === undefined ? undefined : Object.freeze(overrides),
    enableSearch,
    enableImageTool,
    enableImageGeneration: enableImageGeneration ?? false,
    autoReviewDisclosureAcknowledged: autoReviewDisclosureAcknowledged ?? false,
    enableAutoReview: enableAutoReview ?? false,
    searchModel,
    searchMode,
    searchContextSize,
    searchMaxOutputTokens,
  }
}
