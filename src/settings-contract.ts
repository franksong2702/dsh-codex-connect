/** Node-free settings contract shared by the Host plugin and browser card. */

/** Stable Harness settings namespace owned by this plugin. */
export const OPENAI_CODEX_SETTINGS_NAMESPACE = 'llm-openai-codex'

/** Suggested local HTTP proxy shown by the settings UI; it is never enabled by default. */
export const DEFAULT_OPENAI_CODEX_PROXY_URL = 'http://127.0.0.1:7890'

/** Empty profile setting, which makes image requests use the default route hint. */
export const DEFAULT_OPENAI_CODEX_IMAGE_MODEL_HINT = ''

/** Validate an optional bounded ASCII image route model hint. */
export function isValidOpenAICodexImageModelHint(value: unknown): value is string {
  return typeof value === 'string' && (value === '' || /^(?=.{1,128}$)[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(value))
}

/** Parse an image route model hint without exposing malformed input. */
export function parseOpenAICodexImageModelHint(value: unknown): string {
  if (!isValidOpenAICodexImageModelHint(value)) {
    throw new TypeError('OpenAI Codex imageModelHint must be empty or a bounded ASCII model slug')
  }
  return value
}

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

/**
 * Maximum extended context the switch applies. The official Codex model pages
 * publish a 1,050,000-token window with a 922,000-token maximum input, while
 * the Codex client catalog ships a 272,000 default and an 872,000 configuration
 * ceiling. The switch declares that official input ceiling as this profile's
 * local budget so one deployment can measure where the account or route clamps.
 */
export const OPENAI_CODEX_EXTENDED_CONTEXT_MAX = 922_000

/** Official source of the extended ceiling: the current Codex model page (maximum input tokens). */
export const OPENAI_CODEX_EXTENDED_CONTEXT_SOURCE = 'https://developers.openai.com/api/docs/models/gpt-6-astra'

/** Released behavior is unchanged unless a profile opts in. */
export const DEFAULT_OPENAI_CODEX_ENABLE_EXTENDED_CONTEXT = false

/**
 * Output-detail level accepted by the Codex Responses API (`text.verbosity`),
 * matching the official ChatGPT "output verbosity" choices. `default` omits
 * the wire field entirely so the model preset decides.
 */
export type OpenAICodexOutputVerbosity = 'default' | 'low' | 'medium' | 'high'

/** Official default: send the model's `default_verbosity` (low for every listed model). */
export const DEFAULT_OPENAI_CODEX_OUTPUT_VERBOSITY: OpenAICodexOutputVerbosity = 'default'

/**
 * Reasoning-summary detail accepted by the Codex Responses API
 * (`reasoning.summary`), matching the official ChatGPT reasoning-summary
 * choices including `none` (codex-rs serializes the enum lowercase).
 */
export type OpenAICodexReasoningSummarySetting = 'auto' | 'concise' | 'detailed' | 'none'

/** Official default: every catalog model sets `default_reasoning_summary` to `none`, so no summary is sent. */
export const DEFAULT_OPENAI_CODEX_REASONING_SUMMARY: OpenAICodexReasoningSummarySetting = 'none'

/** Whether a value is one of the official output-detail levels. */
export function isValidOpenAICodexOutputVerbosity(value: unknown): value is OpenAICodexOutputVerbosity {
  return value === 'default' || value === 'low' || value === 'medium' || value === 'high'
}

/** Whether a value is one of the official reasoning-summary levels. */
export function isValidOpenAICodexReasoningSummary(value: unknown): value is OpenAICodexReasoningSummarySetting {
  return value === 'auto' || value === 'concise' || value === 'detailed' || value === 'none'
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
  /**
   * Opt-in switch: when on, every catalog model whose default budget is
   * smaller advertises the official maximum input (922,000 tokens) instead,
   * above the model's Codex catalog ceiling when needed. This changes client
   * budgeting and compaction only; it neither grants nor verifies server
   * capacity, and requests can still be rejected by the account or route.
   */
  enableExtendedContext: boolean
  enableSearch: boolean
  /** Follow explicit server-authorized Luna Reserve transitions for agent requests. */
  enableReserveFallback: boolean
  /** Default Fast Mode for newly started top-level sessions; existing sessions are unchanged. */
  enableNewSessionFastMode: boolean
  /** Independent default for newly started subagent sessions. */
  enableNewSubagentFastMode: boolean
  /** Use provider-native Responses V2 compaction when DSH requests compaction. */
  enableNativeCompaction: boolean
  enableImageTool: boolean
  enableImageGeneration: boolean
  /** Optional profile-scoped model hint for image generation; empty uses the route default. */
  imageModelHint: string
  /** Whether this profile accepted the Auto-review data disclosure. */
  autoReviewDisclosureAcknowledged: boolean
  /** Let the hidden Codex reviewer answer eligible DSH approval requests. */
  enableAutoReview: boolean
  /**
   * Opt-in composer pill showing the Codex rate-limit windows. Off by default:
   * the composer tool row is shared, and another plugin may own that surface.
   */
  enableComposerQuotaPill: boolean
  searchModel: string
  searchMode: OpenAICodexSearchMode
  searchContextSize: OpenAICodexSearchContextSize
  searchMaxOutputTokens: number
  /** Output-detail level sent as `text.verbosity`; `default` omits the wire field. */
  outputVerbosity: OpenAICodexOutputVerbosity
  /** Reasoning-summary detail sent as `reasoning.summary`; effective only on explicit-effort requests. */
  reasoningSummary: OpenAICodexReasoningSummarySetting
}

export const DEFAULT_OPENAI_CODEX_SETTINGS: Readonly<OpenAICodexSettingsConfig> = Object.freeze({
  models: undefined,
  enableProxy: false,
  proxyUrl: DEFAULT_OPENAI_CODEX_PROXY_URL,
  contextWindowOverrides: undefined,
  enableExtendedContext: DEFAULT_OPENAI_CODEX_ENABLE_EXTENDED_CONTEXT,
  enableSearch: false,
  enableReserveFallback: false,
  enableNewSessionFastMode: false,
  enableNewSubagentFastMode: false,
  enableNativeCompaction: false,
  enableImageTool: false,
  enableImageGeneration: false,
  imageModelHint: DEFAULT_OPENAI_CODEX_IMAGE_MODEL_HINT,
  autoReviewDisclosureAcknowledged: false,
  enableAutoReview: false,
  enableComposerQuotaPill: false,
  searchModel: DEFAULT_OPENAI_CODEX_SEARCH_MODEL,
  searchMode: DEFAULT_OPENAI_CODEX_SEARCH_MODE,
  searchContextSize: DEFAULT_OPENAI_CODEX_SEARCH_CONTEXT_SIZE,
  searchMaxOutputTokens: DEFAULT_OPENAI_CODEX_SEARCH_MAX_OUTPUT_TOKENS,
  outputVerbosity: DEFAULT_OPENAI_CODEX_OUTPUT_VERBOSITY,
  reasoningSummary: DEFAULT_OPENAI_CODEX_REASONING_SUMMARY,
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
  if (typeof resolved.enableReserveFallback !== 'boolean') {
    throw new TypeError('OpenAI Codex enableReserveFallback must be a boolean')
  }
  if (typeof resolved.enableNewSessionFastMode !== 'boolean' || typeof resolved.enableNewSubagentFastMode !== 'boolean') {
    throw new TypeError('OpenAI Codex new-session Fast Mode defaults must be booleans')
  }
  if (typeof resolved.enableNativeCompaction !== 'boolean') {
    throw new TypeError('OpenAI Codex enableNativeCompaction must be a boolean')
  }
  if (!isValidOpenAICodexProxyUrl(resolved.proxyUrl)) {
    throw new TypeError('OpenAI Codex proxyUrl must be an HTTP(S) origin without credentials or a path')
  }
  parseOpenAICodexImageModelHint(resolved.imageModelHint)
  if (typeof resolved.enableExtendedContext !== 'boolean') {
    throw new TypeError('OpenAI Codex enableExtendedContext must be a boolean')
  }
  if (!isValidOpenAICodexOutputVerbosity(resolved.outputVerbosity)) {
    throw new TypeError('OpenAI Codex outputVerbosity must be default, low, medium, or high')
  }
  if (!isValidOpenAICodexReasoningSummary(resolved.reasoningSummary)) {
    throw new TypeError('OpenAI Codex reasoningSummary must be auto, concise, detailed, or none')
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

/**
 * Resolve the extended-context budget for the adapter, or undefined when the
 * switch is off. Per-model `contextWindowOverrides` stay authoritative; this
 * value only raises models that have no explicit override.
 */
export function resolveOpenAICodexExtendedContextWindow(value: OpenAICodexSettingsInput): number | undefined {
  const resolved = resolveOpenAICodexSettings(value)
  return resolved.enableExtendedContext ? OPENAI_CODEX_EXTENDED_CONTEXT_MAX : undefined
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
  const enableExtendedContext = value['enableExtendedContext']
  const enableSearch = value['enableSearch']
  const enableReserveFallback = value['enableReserveFallback']
  const enableNewSessionFastMode = value['enableNewSessionFastMode']
  const enableNewSubagentFastMode = value['enableNewSubagentFastMode']
  const enableNativeCompaction = value['enableNativeCompaction']
  const enableImageTool = value['enableImageTool']
  const enableImageGeneration = value['enableImageGeneration']
  const imageModelHint = value['imageModelHint']
  const autoReviewDisclosureAcknowledged = value['autoReviewDisclosureAcknowledged']
  const enableAutoReview = value['enableAutoReview']
  const enableComposerQuotaPill = value['enableComposerQuotaPill']
  const searchModel = value['searchModel']
  const searchMode = value['searchMode']
  const searchContextSize = value['searchContextSize']
  const searchMaxOutputTokens = value['searchMaxOutputTokens']
  const outputVerbosity = value['outputVerbosity']
  const reasoningSummary = value['reasoningSummary']
  if (models !== undefined && (!Array.isArray(models) || models.some(model => typeof model !== 'string'))) return undefined
  if (enableProxy !== undefined && typeof enableProxy !== 'boolean') return undefined
  if (proxyUrl !== undefined && (typeof proxyUrl !== 'string' || !isValidOpenAICodexProxyUrl(proxyUrl))) return undefined
  if (contextWindowOverrides !== undefined && contextWindowOverrides !== null && !isValidOpenAICodexContextWindowOverrides(contextWindowOverrides)) return undefined
  if (typeof enableSearch !== 'boolean' || typeof enableImageTool !== 'boolean') return undefined
  if (enableReserveFallback !== undefined && typeof enableReserveFallback !== 'boolean') return undefined
  if (enableNewSessionFastMode !== undefined && typeof enableNewSessionFastMode !== 'boolean') return undefined
  if (enableNewSubagentFastMode !== undefined && typeof enableNewSubagentFastMode !== 'boolean') return undefined
  if (enableNativeCompaction !== undefined && typeof enableNativeCompaction !== 'boolean') return undefined
  // Older Host snapshots predate the maximum-extended-context switch; absence maps to its safe default.
  if (enableExtendedContext !== undefined && typeof enableExtendedContext !== 'boolean') return undefined
  // Older Host snapshots predate image generation; absence maps to its safe default.
  if (enableImageGeneration !== undefined && typeof enableImageGeneration !== 'boolean') return undefined
  if (imageModelHint !== undefined && !isValidOpenAICodexImageModelHint(imageModelHint)) return undefined
  // Older Host snapshots predate the disclosure acknowledgement; absence requires confirmation.
  if (autoReviewDisclosureAcknowledged !== undefined && typeof autoReviewDisclosureAcknowledged !== 'boolean') return undefined
  // Older Host snapshots predate Auto-review; absence maps to its safe default.
  if (enableAutoReview !== undefined && typeof enableAutoReview !== 'boolean') return undefined
  // Older Host snapshots predate the composer quota pill; absence maps to its safe default.
  if (enableComposerQuotaPill !== undefined && typeof enableComposerQuotaPill !== 'boolean') return undefined
  if (typeof searchModel !== 'string' || searchModel.trim().length === 0) return undefined
  if (searchMode !== 'cached' && searchMode !== 'indexed' && searchMode !== 'live') return undefined
  if (searchContextSize !== 'low' && searchContextSize !== 'medium' && searchContextSize !== 'high') return undefined
  if (typeof searchMaxOutputTokens !== 'number' || !Number.isInteger(searchMaxOutputTokens) || searchMaxOutputTokens < 1) return undefined
  // Older Host snapshots predate the output-style choices; absence maps to the released behavior.
  if (outputVerbosity !== undefined && !isValidOpenAICodexOutputVerbosity(outputVerbosity)) return undefined
  if (reasoningSummary !== undefined && !isValidOpenAICodexReasoningSummary(reasoningSummary)) return undefined
  const overrides = resolveOpenAICodexContextWindowOverrides(contextWindowOverrides)
  return {
    models: models === undefined ? undefined : [...new Set(models)],
    enableProxy: enableProxy ?? false,
    proxyUrl: proxyUrl === undefined ? DEFAULT_OPENAI_CODEX_PROXY_URL : normalizeOpenAICodexProxyUrl(proxyUrl)!,
    contextWindowOverrides: overrides === undefined ? undefined : Object.freeze(overrides),
    enableExtendedContext: enableExtendedContext ?? DEFAULT_OPENAI_CODEX_ENABLE_EXTENDED_CONTEXT,
    enableSearch,
    enableReserveFallback: enableReserveFallback ?? false,
    enableNewSessionFastMode: enableNewSessionFastMode ?? false,
    enableNewSubagentFastMode: enableNewSubagentFastMode ?? false,
    enableNativeCompaction: enableNativeCompaction ?? false,
    enableImageTool,
    enableImageGeneration: enableImageGeneration ?? false,
    imageModelHint: imageModelHint ?? DEFAULT_OPENAI_CODEX_IMAGE_MODEL_HINT,
    autoReviewDisclosureAcknowledged: autoReviewDisclosureAcknowledged ?? false,
    enableAutoReview: enableAutoReview ?? false,
    enableComposerQuotaPill: enableComposerQuotaPill ?? false,
    searchModel,
    searchMode,
    searchContextSize,
    searchMaxOutputTokens,
    outputVerbosity: outputVerbosity ?? DEFAULT_OPENAI_CODEX_OUTPUT_VERBOSITY,
    reasoningSummary: reasoningSummary ?? DEFAULT_OPENAI_CODEX_REASONING_SUMMARY,
  }
}
