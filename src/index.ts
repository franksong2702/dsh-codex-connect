/**
 * ChatGPT OAuth and Codex models for DeepSeek Harness, with opt-in search and
 * image tooling.
 * @module dsh-codex-connect
 */

import './undici-runtime.ts'
import './message-source.ts'
import type { Context, Fiber, Volatile } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import { randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'
import z from '@deepseek-ai/schemastery'
import { RetryPolicySchema, resolveRetryPolicy } from '@deepseek-ai/dsh-llm'
import type { RetryPolicyConfig } from '@deepseek-ai/dsh-llm'
import { deepEqualJson } from '@deepseek-ai/dsh-util-values'
import type {} from '@deepseek-ai/dsh-attachment'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-web'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-fs'
import type {} from '@deepseek-ai/dsh-user-approval'
import { assertOpenAICodexContextWindowOverrides, createOpenAICodexAdapter, openAICodexModelCatalog } from './adapter.ts'
import { resolveOpenAICodexPreflightConfig } from './preflight-activity.ts'
import type { OpenAICodexPreflightConfig } from './preflight-activity.ts'
import { OPENAI_CODEX_AUTHORIZATION_TIMEOUT_MS, registerOpenAICodexAuthRoutes } from './auth-routes.ts'
import { registerOpenAICodexProxyRoutes } from './proxy-routes.ts'
import { OPENAI_CODEX_TRUSTED_ORIGINS_FILENAME, OpenAICodexTrustedOriginsStore } from './trusted-origins.ts'
import { registerOpenAICodexUpdateRoutes } from './update-routes.ts'
import { parseOpenAICodexSpeedDefault } from './speed-mode-contract.ts'
import type { OpenAICodexSpeedMode } from './speed-mode-contract.ts'
import { resolveOpenAICodexModelCatalog } from './model-discovery.ts'
import { parseOpenAICodexReasoningEffort } from './reasoning-contract.ts'
import type { OpenAICodexReasoningEffort } from './reasoning-contract.ts'
import { registerOpenAICodexModelCatalogRoute } from './model-routes.ts'
import { registerOpenAICodexOriginalImageRoute } from './image-asset-routes.ts'
import {
  checkForOpenAICodexUpdate,
  compareOpenAICodexVersions,
  parseOpenAICodexUpdateResult,
  parseOpenAICodexVersion,
} from './update.ts'
import { CODEX_CONNECT_VERSION } from './version.ts'
import { createConversationSpeedRegistry } from './conversation-speed.ts'
import { registerOpenAICodexFastModeDefaults } from './fast-mode-defaults.ts'
import { assertNoOpenAICodexProviderConflict } from './doctor.ts'
import { imageGenerateTool } from './image-tool.ts'
import { quotaTool } from './quota-tool.ts'
import { viewImageTool } from './view-image.ts'
import { OpenAICodexTransport } from './transport.ts'
import type { OpenAICodexTransportV1 } from './transport.ts'
import { OpenAICodexProxyManager } from './provider-proxy.ts'
import { OpenAICodexBackendRequests } from './backend-request.ts'
import { RequestMetrics } from './request-metrics.ts'
import { AdaptiveTaskControlRuntime } from './adaptive-task-control-runtime.ts'
import { reserveAdaptiveTaskAttempt } from './adaptive-task-scope.ts'
import { TaskDelegationArtifacts } from './adaptive-task-artifacts.ts'
import { taskIdentity } from './adaptive-task-store.ts'
import { registerAdaptiveTaskHttp } from './adaptive-task-http.ts'
import { ADAPTIVE_TASK_MODELS } from './adaptive-task-contract.ts'
import { OpenAICodexImageAssetStore } from './image-assets.ts'
import { registerImageHandleBridge } from './image-handle-bridge.ts'
import { registerOpenAICodexAutoReview } from './auto-review.ts'
import { selectOpenAICodexSearchRoute } from './search-route-override.ts'
import { ReserveRequestPermits, ReserveReturnStore } from './reserve-state.ts'
import { registerReserveRouting } from './reserve-routing.ts'
import { OpenAICodexQuotaState } from './quota-state.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Host-only image transport owned by the Codex Connect core fiber. */
    openaiCodexTransport: OpenAICodexTransportV1
  }
}

export { VIEW_IMAGE_TOOL_NAME } from './view-image.ts'
export { IMAGE_GENERATE_TOOL_NAME } from './image-tool.ts'
export { QUOTA_TOOL_NAME } from './quota-tool.ts'
export {
  assertNoOpenAICodexProviderConflict,
  diagnoseOpenAICodex,
  openAICodexConflictMessage,
} from './doctor.ts'
export type {
  OpenAICodexDiagnosticOptions,
  OpenAICodexDiagnosticReport,
} from './doctor.ts'
export {
  assessCompatibility,
  COMPATIBILITY_CONTRACT,
  COMPATIBILITY_PACKAGES,
  COMPATIBILITY_SCHEMA_VERSION,
  detectCompatibility,
  DSH_PLUGIN_API_PACKAGES,
  PI_AI_PACKAGE,
  SUPPORTED_DSH_PLUGIN_API_VERSION,
  SUPPORTED_DSH_PLUGIN_API_VERSIONS,
  SUPPORTED_DSH_PLUGIN_API_RANGE,
  SUPPORTED_NODE_RANGE,
  SUPPORTED_PI_AI_RANGE,
  evaluateCompatibility,
} from './compatibility.ts'
export type {
  CompatibilityDetectionOptions,
  CompatibilityEntry,
  CompatibilityEvaluationInput,
  CompatibilityPackageName,
  CompatibilityReport,
  CompatibilityStatus,
} from './compatibility.ts'
export { OPENAI_CODEX_USAGE_URL, parseOpenAICodexUsage, readOpenAICodexRateLimits } from './usage.ts'
export type {
  OpenAICodexCredits,
  OpenAICodexIndividualLimit,
  OpenAICodexRateLimit,
  OpenAICodexRateLimitWindow,
  OpenAICodexUsage,
} from './usage.ts'
import {
  DEFAULT_OPENAI_CODEX_SEARCH_CONTEXT_SIZE,
  DEFAULT_OPENAI_CODEX_SEARCH_MAX_OUTPUT_TOKENS,
  DEFAULT_OPENAI_CODEX_SEARCH_MODE,
  DEFAULT_OPENAI_CODEX_SEARCH_MODEL,
  OpenAICodexSearchProvider,
} from './search.ts'
import type { OpenAICodexSearchContextSize, OpenAICodexSearchMode } from './search.ts'
import { OpenAICodexCredentialStore, OPENAI_CODEX_PROVIDER } from './store.ts'
import {
  DEFAULT_OPENAI_CODEX_PROXY_URL,
  parseOpenAICodexImageModelHint,
  OPENAI_CODEX_SETTINGS_NAMESPACE,
  resolveOpenAICodexProxyUrl,
  resolveOpenAICodexSettings,
  parseOpenAICodexContextWindowOverrides,
} from './settings-contract.ts'
import type { OpenAICodexSettingsInput } from './settings-contract.ts'

export {
  decodeOpenAICodexSettings,
  DEFAULT_OPENAI_CODEX_PROXY_URL,
  DEFAULT_OPENAI_CODEX_IMAGE_MODEL_HINT,
  DEFAULT_OPENAI_CODEX_SETTINGS,
  isValidOpenAICodexImageModelHint,
  isValidOpenAICodexContextWindowOverrides,
  isValidOpenAICodexProxyUrl,
  OPENAI_CODEX_SETTINGS_NAMESPACE,
  resolveOpenAICodexProxyUrl,
  resolveOpenAICodexSettings,
} from './settings-contract.ts'
export type { OpenAICodexSettingsConfig } from './settings-contract.ts'

export {
  isOpenAICodexTransportError,
  OPENAI_CODEX_IMAGE_GENERATION_URL,
  OPENAI_CODEX_IMAGE_MAX_COUNT,
  OPENAI_CODEX_IMAGE_MAX_ERROR_BYTES,
  OPENAI_CODEX_IMAGE_MAX_RESPONSE_BYTES,
  OPENAI_CODEX_IMAGE_PROMPT_MAX_LENGTH,
  OPENAI_CODEX_IMAGE_REQUEST_TIMEOUT_MS,
  OPENAI_CODEX_TRANSPORT_API_VERSION,
  OPENAI_CODEX_TRANSPORT_ERROR_CODES,
  OPENAI_CODEX_TRANSPORT_SERVICE,
  OpenAICodexTransport,
  OpenAICodexTransportError,
} from './transport.ts'

export {
  detectOpenAICodexProxies,
  listOpenAICodexProxyCandidates,
  OPENAI_CODEX_LOCAL_PROXY_CANDIDATES,
  OPENAI_CODEX_PROXY_CANDIDATE_LIMIT,
  OPENAI_CODEX_PROXY_PROBE_TIMEOUT_MS,
  OPENAI_CODEX_PROXY_PROBE_URL,
  OpenAICodexProxyManager,
} from './provider-proxy.ts'
export type {
  OpenAICodexProxyProbeClassification,
  OpenAICodexProxyProbeResult,
} from './provider-proxy.ts'
export {
  OPENAI_CODEX_PROXY_DETECT_PATH,
  OPENAI_CODEX_PROXY_TEST_PATH,
} from './proxy-paths.ts'
export type {
  GeneratedImagePayload,
  ImageGenerationRequest,
  ImageGenerationResponse,
  ImageRequestContext,
  OpenAICodexTransportErrorCode,
  OpenAICodexTransportV1,
} from './transport.ts'

export { loginOpenAICodex, logoutOpenAICodex, openAICodexAuthStatus } from './auth.ts'
export type { OpenAICodexAuthStatus } from './auth.ts'
export {
  FastModeRegistry,
  OpenAICodexFastModeRegistry,
  isFastModeSessionId,
  OPENAI_CODEX_FAST_MODE_MAX_SESSIONS,
  OPENAI_CODEX_FAST_MODE_MAX_SESSION_ID_LENGTH,
} from './fast-mode.ts'
export { OPENAI_CODEX_FAST_MODE_PATH } from './fast-mode-paths.ts'
export { OPENAI_CODEX_UPDATE_PATH } from './update-paths.ts'
export {
  checkForOpenAICodexUpdate,
  compareOpenAICodexVersions,
  parseOpenAICodexUpdateResult,
  parseOpenAICodexVersion,
} from './update.ts'
export type { OpenAICodexUpdateResult } from './update.ts'
export {
  OpenAICodexCredentialStore,
  OPENAI_CODEX_ACCOUNT_LIMIT,
  OPENAI_CODEX_AUTH_DOCUMENT_LIMIT,
  OPENAI_CODEX_AUTH_FILENAME,
  OPENAI_CODEX_AUTH_V1_BACKUP_SUFFIX,
  OPENAI_CODEX_PROVIDER,
  openAICodexAuthPath,
} from './store.ts'
export type { OpenAICodexAccountSummary } from './store.ts'
export {
  DEFAULT_OPENAI_CODEX_SEARCH_CONTEXT_SIZE,
  DEFAULT_OPENAI_CODEX_SEARCH_MAX_OUTPUT_TOKENS,
  DEFAULT_OPENAI_CODEX_SEARCH_MODE,
  DEFAULT_OPENAI_CODEX_SEARCH_MODEL,
  mapOpenAICodexSearchResponse,
  OpenAICodexSearchProvider,
  OPENAI_CODEX_BASE_URL,
  OPENAI_CODEX_SEARCH_PROVIDER,
  OPENAI_CODEX_SEARCH_URL,
} from './search.ts'
export type {
  OpenAICodexSearchContextSize,
  OpenAICodexSearchMode,
  OpenAICodexSearchProviderOptions,
  OpenAICodexSearchRequestRecord,
} from './search.ts'
export {
  migrateOpenAICodexSearchHistory,
  OPENAI_CODEX_HISTORY_BACKUP_SUFFIX,
  OPENAI_CODEX_SEARCH_MODEL_REQUEST_EVENT,
} from './history-migration.ts'
export type {
  OpenAICodexHistoryMigrationFile,
  OpenAICodexHistoryMigrationOptions,
  OpenAICodexHistoryMigrationResult,
} from './history-migration.ts'

/** Stable Cordis plugin name. */
export const name = 'llm-openai-codex'

/** The model registry required before the provider can register. */
export const inject = ['llm']

/** Branded Host settings namespace for Codex Connect capability configuration. */
export const OPENAI_CODEX_SETTINGS_NS = OPENAI_CODEX_SETTINGS_NAMESPACE

/** Plain configuration accepted by direct Cordis composition and unit tests. */
export interface Config {
  /** Explicit new-session preferences; omitted/null retains the corresponding legacy Fast default. */
  newSessionSpeedMode?: OpenAICodexSpeedMode | null | undefined
  newSubagentSpeedMode?: OpenAICodexSpeedMode | null | undefined
  /** Optional fallback effort; explicit request effort wins. Null resets an inherited value. */
  reasoningEffort?: OpenAICodexReasoningEffort | null | undefined
  /** Optional Host model-request retry policy; omission preserves defaults. Reload to change. */
  retryPolicy?: RetryPolicyConfig | undefined
  /** Opt-in absolute owner-only directory for local request evidence; never uploads telemetry. Restart to change. */
  requestMetricsDirectory?: string | undefined
  /** Per-process journal limit; reaching it stops recording with a warning, not model execution. */
  requestMetricsMaxBytes?: number
  /** Startup-only opt-in to read-only, model-callable shared Codex quota observation. */
  enableQuotaTool?: boolean
  /** Complete interactive OAuth deadline in milliseconds; applies when the plugin loads. */
  oauthTimeoutMs?: number
  /** Model ids advertised in selectors; omitted to advertise the full catalog. */
  models?: string[] | undefined
  /** Route Codex Connect requests through proxyUrl after explicit activation. */
  enableProxy?: boolean
  /** Credential-free HTTP(S) proxy origin. */
  proxyUrl?: string
  /** Explicit startup-only authorization for bounded bili preflight heartbeats; omitted by default. */
  preflightActivity?: OpenAICodexPreflightConfig | undefined
  /**
   * Per-model context-window overrides keyed by catalog model id. Each value
   * replaces the advertised `contextWindow` for that model inside the adapter
   * profile for client budgeting. It does not change or verify server capacity,
   * output-token limits, or the deployment's compaction policy.
   * Whole-map or per-model null disables inherited overrides; omitted keys inherit lower layers.
   */
  contextWindowOverrides?: Record<string, number | null> | null | undefined
  /** Register the optional standalone Codex search provider. */
  enableSearch?: boolean
  /** Automatically follow server-authorized Luna Reserve transitions, never generic rate limits. */
  enableReserveFallback?: boolean
  /** Enable Fast Mode for newly started top-level sessions only. */
  enableNewSessionFastMode?: boolean
  /** Independent opt-in default for newly started subagent sessions. */
  enableNewSubagentFastMode?: boolean
  /** Explicit profile opt-in to Codex native context management; DSH owns automatic triggers. Disabling stops new native compactions, not replay of existing checkpoints. */
  enableNativeCompaction?: boolean
  /** Register the optional image-loading tool. */
  enableImageTool?: boolean
  /** Register the optional prompt-only image generation tool. */
  enableImageGeneration?: boolean
  /** Restrict the image handle bridge to these tool names; omitted processes every tool. */
  imageHandleBridgeTools?: string[] | undefined
  /** Optional profile-scoped image route model hint; empty uses the default route hint. */
  imageModelHint?: string
  /** Record that this profile accepted the Auto-review data disclosure. */
  autoReviewDisclosureAcknowledged?: boolean
  /** Let the hidden Codex reviewer answer eligible DSH approval requests. */
  enableAutoReview?: boolean
  /** Model used for auxiliary standalone searches. */
  searchModel?: string
  /** Cached, indexed, or live web access. */
  searchMode?: OpenAICodexSearchMode
  /** Amount of search context returned by the provider. */
  searchContextSize?: OpenAICodexSearchContextSize
  /** Maximum generated tokens returned by the standalone search endpoint. */
  searchMaxOutputTokens?: number
}

function configValue<T>(value: T | Volatile<T> | undefined): T | undefined {
  return value !== null && typeof value === 'object' && 'get' in value
    ? value.get() as T | undefined
    : value as T | undefined
}

function parseSettingsContextWindowOverrides(
  value: Record<string, number | null> | null | undefined,
): Record<string, number | null> | null | undefined {
  if (value === null || value === undefined) return value
  const parsed = parseOpenAICodexContextWindowOverrides(value)
  assertOpenAICodexContextWindowOverrides(parsed, openAICodexModelCatalog())
  return parsed
}

const configSchema = z.object({
  newSessionSpeedMode: z.transform(z.union([z.const(undefined), z.const(null), z.string()]), parseOpenAICodexSpeedDefault).volatile(),
  newSubagentSpeedMode: z.transform(z.union([z.const(undefined), z.const(null), z.string()]), parseOpenAICodexSpeedDefault).volatile(),
  reasoningEffort: z.transform(z.union([z.const(undefined), z.const(null), z.string()]), parseOpenAICodexReasoningEffort).volatile(),
  retryPolicy: z.transform(z.union([z.const(undefined), RetryPolicySchema]), value => {
    resolveRetryPolicy(value, 'dsh-codex-connect retryPolicy')
    return value
  }).description('Optional Host model-request retry policy. Omit for existing defaults; reload the plugin after changes. More retries can consume more quota. The Host retry plugin executes this policy; cancellation and request accounting remain Host-owned.'),
  requestMetricsDirectory: z.union([z.const(undefined), z.string()]),
  requestMetricsMaxBytes: z.number().step(1).min(4096).max(64 * 1024 * 1024).default(16 * 1024 * 1024),
  enableQuotaTool: z.boolean().default(false).description('Register read-only shared Codex quota observation for models. Reload the plugin after changes. Does not switch models/accounts or schedule work.'),
  oauthTimeoutMs: z.number().step(1).min(1_000).max(1_800_000).default(OPENAI_CODEX_AUTHORIZATION_TIMEOUT_MS),
  models: z.union([z.const(undefined), z.array(z.string())]).volatile(),
  enableProxy: z.boolean().default(false).volatile(),
  proxyUrl: z.string().default(DEFAULT_OPENAI_CODEX_PROXY_URL).volatile(),
  preflightActivity: z.transform(z.union([z.const(undefined), z.object({
    protocol: z.const('bili-v1'), trustedProxyOrigin: z.string(), maxDurationMs: z.number(),
  })]), value => value === undefined ? undefined : resolveOpenAICodexPreflightConfig(value)),
  contextWindowOverrides: z.transform(
    z.union([z.const(undefined), z.const(null), z.dict(z.union([z.const(null), z.number()]))]),
    parseSettingsContextWindowOverrides,
  ).volatile(),
  enableSearch: z.boolean().default(false).volatile(),
  enableReserveFallback: z.boolean().default(false).volatile(),
  enableNewSessionFastMode: z.boolean().default(false).volatile(),
  enableNewSubagentFastMode: z.boolean().default(false).volatile(),
  enableNativeCompaction: z.boolean().default(false).volatile(),
  enableImageTool: z.boolean().default(false).volatile(),
  enableImageGeneration: z.boolean().default(false).volatile(),
  imageHandleBridgeTools: z.union([z.const(undefined), z.array(z.string())]).volatile(),
  imageModelHint: z.transform(z.string(), parseOpenAICodexImageModelHint).default('').volatile(),
  autoReviewDisclosureAcknowledged: z.boolean().default(false).volatile(),
  enableAutoReview: z.boolean().default(false).volatile(),
  searchModel: z.string().default(DEFAULT_OPENAI_CODEX_SEARCH_MODEL).volatile(),
  searchMode: z.union(['cached', 'indexed', 'live'] as const).default(DEFAULT_OPENAI_CODEX_SEARCH_MODE).volatile(),
  searchContextSize: z.union(['low', 'medium', 'high'] as const).default(DEFAULT_OPENAI_CODEX_SEARCH_CONTEXT_SIZE).volatile(),
  searchMaxOutputTokens: z.number().step(1).min(1).default(DEFAULT_OPENAI_CODEX_SEARCH_MAX_OUTPUT_TOKENS).volatile(),
})

/** Runtime configuration exposes each editable field through Cordis's public Volatile type. */
export interface VolatileConfig {
  newSessionSpeedMode: Volatile<OpenAICodexSpeedMode | null | undefined>
  newSubagentSpeedMode: Volatile<OpenAICodexSpeedMode | null | undefined>
  reasoningEffort: Volatile<OpenAICodexReasoningEffort | null | undefined>
  retryPolicy?: RetryPolicyConfig | undefined
  requestMetricsDirectory?: string | undefined
  requestMetricsMaxBytes: number
  enableQuotaTool: boolean
  oauthTimeoutMs: number
  models: Volatile<string[] | undefined>
  enableProxy: Volatile<boolean>
  proxyUrl: Volatile<string>
  preflightActivity?: OpenAICodexPreflightConfig | undefined
  contextWindowOverrides: Volatile<Record<string, number | null> | null | undefined>
  enableSearch: Volatile<boolean>
  enableReserveFallback: Volatile<boolean>
  enableNewSessionFastMode: Volatile<boolean>
  enableNewSubagentFastMode: Volatile<boolean>
  enableNativeCompaction: Volatile<boolean>
  enableImageTool: Volatile<boolean>
  enableImageGeneration: Volatile<boolean>
  imageHandleBridgeTools: Volatile<string[] | undefined>
  imageModelHint: Volatile<string>
  autoReviewDisclosureAcknowledged: Volatile<boolean>
  enableAutoReview: Volatile<boolean>
  searchModel: Volatile<string>
  searchMode: Volatile<OpenAICodexSearchMode>
  searchContextSize: Volatile<OpenAICodexSearchContextSize>
  searchMaxOutputTokens: Volatile<number>
}

export const Config: z<Config, VolatileConfig> = configSchema

/**
 * Register the `openai-codex` LLM route with one provider-native OAuth store.
 * Search and image tooling are added only when their config flags are true.
 * Selecting this route as the Harness default remains a separate profile choice.
 * @param ctx - plugin context carrying the LLM registry plus optional services.
 * @param config - capability gates and standalone-search tuning.
 */
export function apply(ctx: Context, config: Config | VolatileConfig): void {
  const catalog = openAICodexModelCatalog()
  const current = (): OpenAICodexSettingsInput => Object.fromEntries(Object.entries({
    newSessionSpeedMode: configValue(config.newSessionSpeedMode), newSubagentSpeedMode: configValue(config.newSubagentSpeedMode),
    reasoningEffort: configValue(config.reasoningEffort),
    models: configValue(config.models), enableProxy: configValue(config.enableProxy), proxyUrl: configValue(config.proxyUrl),
    contextWindowOverrides: configValue(config.contextWindowOverrides), enableSearch: configValue(config.enableSearch),
    enableReserveFallback: configValue(config.enableReserveFallback), enableNativeCompaction: configValue(config.enableNativeCompaction),
    enableNewSessionFastMode: configValue(config.enableNewSessionFastMode),
    enableNewSubagentFastMode: configValue(config.enableNewSubagentFastMode),
    enableImageTool: configValue(config.enableImageTool), enableImageGeneration: configValue(config.enableImageGeneration),
    imageModelHint: configValue(config.imageModelHint), autoReviewDisclosureAcknowledged: configValue(config.autoReviewDisclosureAcknowledged),
    enableAutoReview: configValue(config.enableAutoReview), searchModel: configValue(config.searchModel), searchMode: configValue(config.searchMode),
    searchContextSize: configValue(config.searchContextSize), searchMaxOutputTokens: configValue(config.searchMaxOutputTokens),
  }).filter(([, value]) => value !== undefined)) as OpenAICodexSettingsInput
  const validateSettings = (value: OpenAICodexSettingsInput): void => {
    resolveOpenAICodexSettings(value)
    assertOpenAICodexContextWindowOverrides(value.contextWindowOverrides ?? undefined, catalog)
  }
  validateSettings(current())
  const proxyManager = new OpenAICodexProxyManager()
  const resolveProviderProxyUrl = (): string | undefined => resolveOpenAICodexProxyUrl(resolveOpenAICodexSettings(current()))
  let taskRuntime: AdaptiveTaskControlRuntime | undefined
  const backendRequests = new OpenAICodexBackendRequests(proxyManager, resolveProviderProxyUrl, undefined,
    async () => { await taskRuntime?.reserveAuxiliary() },
    config.requestMetricsDirectory === undefined ? undefined : new RequestMetrics(config.requestMetricsDirectory, config.requestMetricsMaxBytes),
    reserveAdaptiveTaskAttempt)
  // Also release the journal if a later registration fails before the full teardown is installed.
  ctx.effect(() => () => backendRequests.dispose())
  let proxyWasActive = resolveProviderProxyUrl() !== undefined
  const credentials = new OpenAICodexCredentialStore()
  const imageAssets = new OpenAICodexImageAssetStore()
  const trustedOrigins = new OpenAICodexTrustedOriginsStore(
    join(dirname(credentials.filename), OPENAI_CODEX_TRUSTED_ORIGINS_FILENAME),
  )
  const fastMode = createConversationSpeedRegistry(ctx)
  registerOpenAICodexFastModeDefaults(ctx, fastMode, () => resolveOpenAICodexSettings(current()),
    async () => (await credentials.accounts()).find(account => account.active)?.accountKey)
  const taskDirectory = join(dirname(credentials.filename), 'codex-connect-tasks')
  taskRuntime = new AdaptiveTaskControlRuntime(ctx, {
    directory: taskDirectory,
    artifacts: identity => new TaskDelegationArtifacts(join(taskDirectory,
      taskIdentity(JSON.stringify([identity.owner, identity.sessionKey])) + '-artifacts')),
    models: async () => {
      const models = await ctx.llm.listModels(OPENAI_CODEX_PROVIDER)
      return Promise.all(models.filter(model => ADAPTIVE_TASK_MODELS.some(id => id === model.id))
        .map(model => ctx.llm.resolveModelInfo(OPENAI_CODEX_PROVIDER, model.id)))
    },
  })
  const quota = new OpenAICodexQuotaState({
    credentials,
    proxyManager,
    backendRequests,
    enabled: () => resolveOpenAICodexSettings(current()).enableReserveFallback,
    resolveProxyUrl: resolveProviderProxyUrl,
  })
  if (config.enableQuotaTool === true) {
    ctx.inject(['tools'], toolCtx => toolCtx.tools.register(quotaTool(quota)))
  }
  const reservePermits = new ReserveRequestPermits()
  const stopReserveRouting = registerReserveRouting(ctx, {
    quota,
    returns: new ReserveReturnStore(join(dirname(credentials.filename), 'codex-connect-reserve')),
    permits: reservePermits,
    enabled: () => resolveOpenAICodexSettings(current()).enableReserveFallback,
  })
  assertNoOpenAICodexProviderConflict(ctx.llm.listProviders().map(provider => provider.id))
  new OpenAICodexTransport(
    ctx,
    credentials,
    proxyManager,
    resolveProviderProxyUrl,
    () => resolveOpenAICodexSettings(current()).imageModelHint,
    backendRequests,
  )
  registerOpenAICodexAutoReview(
    ctx,
    credentials,
    proxyManager,
    resolveProviderProxyUrl,
    () => resolveOpenAICodexSettings(current()).enableAutoReview,
    backendRequests,
  )
  const adapter = createOpenAICodexAdapter(
    credentials,
    () => ctx.get('attachments'),
    fastMode,
    () => resolveOpenAICodexSettings(current()).models,
    proxyManager,
    resolveProviderProxyUrl,
    () => resolveOpenAICodexSettings(current()).contextWindowOverrides,
    reservePermits,
    () => resolveOpenAICodexSettings(current()).enableNativeCompaction,
    backendRequests,
    taskRuntime,
    () => resolveOpenAICodexSettings(current()).enableImageGeneration,
    config.preflightActivity,
    config.retryPolicy,
    () => resolveOpenAICodexSettings(current()).reasoningEffort,
  )
  ctx.llm.registerAdapter([OPENAI_CODEX_PROVIDER], adapter)
  registerImageHandleBridge(ctx, {
    // The bridge rides on the image-generation gate: when GPT Image is on,
    // every route gets selection handles, not just the openai-codex adapter.
    enabled: () => configValue(config.enableImageGeneration) === true,
    tools: () => configValue(config.imageHandleBridgeTools),
  })
  // Public catalog/version metadata does not need access to the operator's account or private resources.
  ctx.inject(['webServer'], webCtx => {
    registerOpenAICodexUpdateRoutes(webCtx, { currentVersion: CODEX_CONNECT_VERSION }, trustedOrigins)
    registerOpenAICodexModelCatalogRoute(webCtx, () => resolveOpenAICodexModelCatalog(adapter), trustedOrigins)
  })
  // Protected routes follow Connection's lifetime as well as WebServer's; no unauthenticated fallback.
  ctx.inject(['webServer', 'connection'], webCtx => {
    registerOpenAICodexAuthRoutes(webCtx, credentials, trustedOrigins, fastMode, proxyManager, resolveProviderProxyUrl,
      configValue(config.oauthTimeoutMs) ?? OPENAI_CODEX_AUTHORIZATION_TIMEOUT_MS, quota)
    registerOpenAICodexProxyRoutes(webCtx, trustedOrigins, proxyManager)
    registerOpenAICodexOriginalImageRoute(webCtx, trustedOrigins, imageAssets)
  })

  const tasks = taskRuntime
  ctx.inject(['webServer', 'connection'], webCtx => { registerAdaptiveTaskHttp(webCtx, tasks) })

  let stopped = false
  let searchFiber: Fiber | undefined
  let searchRegistration: object | undefined
  let searchTail = Promise.resolve()
  let imageFiber: Fiber | undefined
  let imageTail = Promise.resolve()
  let imageGenerationFiber: Fiber | undefined
  let imageGenerationTail = Promise.resolve()

  const reconcileSearch = async (): Promise<void> => {
    if (stopped) return
    const resolved = resolveOpenAICodexSettings(current())
    const nextRegistration = resolved.enableSearch
      ? {
          model: resolved.searchModel,
          mode: resolved.searchMode,
          contextSize: resolved.searchContextSize,
          maxOutputTokens: resolved.searchMaxOutputTokens,
        }
      : undefined
    if (deepEqualJson(nextRegistration, searchRegistration)) return
    const previous = searchFiber
    searchFiber = undefined
    searchRegistration = undefined
    if (previous !== undefined) await previous.dispose()
    if (stopped || nextRegistration === undefined) return
    const fiber = ctx.inject(['web'], (webCtx) => {
      const provider = new OpenAICodexSearchProvider({
        credentials,
        model: nextRegistration.model,
        mode: nextRegistration.mode,
        contextSize: nextRegistration.contextSize,
        maxOutputTokens: nextRegistration.maxOutputTokens,
        resolveRequestId: () => String(webCtx.get('agents')?.currentInitiator()?.session.id ?? randomUUID()),
        proxyManager,
        resolveProxyUrl: resolveProviderProxyUrl,
        backendRequests,
      })
      const unregister = webCtx.web.registerSearchProvider(provider)
      try {
        const restoreRoute = selectOpenAICodexSearchRoute(webCtx.web, provider.id)
        return () => {
          try {
            restoreRoute()
          } finally {
            unregister()
          }
        }
      } catch (error) {
        unregister()
        throw error
      }
    })
    searchFiber = fiber
    searchRegistration = nextRegistration
    void Promise.resolve(fiber).catch((error: unknown) => {
      if (searchFiber === fiber) {
        searchFiber = undefined
        searchRegistration = undefined
      }
      ctx.logger.error('dsh-codex-connect: optional search provider failed to activate')
      ctx.logger.error(error)
    })
  }

  const reconcileImageTool = async (): Promise<void> => {
    if (stopped) return
    const enabled = resolveOpenAICodexSettings(current()).enableImageTool
    if (enabled === (imageFiber !== undefined)) return
    const previous = imageFiber
    imageFiber = undefined
    if (previous !== undefined) await previous.dispose()
    if (stopped || !enabled) return
    const fiber = ctx.inject(
      ['tools', 'fs', 'attachments'],
      toolCtx => toolCtx.tools.register(viewImageTool(toolCtx)),
    )
    imageFiber = fiber
    void Promise.resolve(fiber).catch((error: unknown) => {
      if (imageFiber === fiber) imageFiber = undefined
      ctx.logger.error('dsh-codex-connect: optional view_image tool failed to activate')
      ctx.logger.error(error)
    })
  }

  const reconcileImageGeneration = async (): Promise<void> => {
    if (stopped) return
    const enabled = resolveOpenAICodexSettings(current()).enableImageGeneration
    if (enabled === (imageGenerationFiber !== undefined)) return
    const previous = imageGenerationFiber
    imageGenerationFiber = undefined
    if (previous !== undefined) await previous.dispose()
    if (stopped || !enabled) return
    const fiber = ctx.inject(
      ['tools', 'attachments'],
      toolCtx => toolCtx.tools.register(imageGenerateTool(toolCtx, imageAssets)),
    )
    imageGenerationFiber = fiber
    void Promise.resolve(fiber).catch((error: unknown) => {
      if (imageGenerationFiber === fiber) imageGenerationFiber = undefined
      ctx.logger.error('dsh-codex-connect: optional image generation tool failed to activate')
      ctx.logger.error(error)
    })
  }

  const scheduleCapabilities = (): void => {
    searchTail = searchTail.then(reconcileSearch, reconcileSearch).catch((error: unknown) => {
      ctx.logger.error('dsh-codex-connect: could not apply the updated search configuration')
      ctx.logger.error(error)
    })
    imageTail = imageTail.then(reconcileImageTool, reconcileImageTool).catch((error: unknown) => {
      ctx.logger.error('dsh-codex-connect: could not apply the updated image-tool configuration')
      ctx.logger.error(error)
    })
    imageGenerationTail = imageGenerationTail.then(reconcileImageGeneration, reconcileImageGeneration).catch((error: unknown) => {
      ctx.logger.error('dsh-codex-connect: could not apply the updated image-generation configuration')
      ctx.logger.error(error)
    })
  }

  ctx.effect(() => async () => {
    stopped = true
    backendRequests.dispose()
    await stopReserveRouting()
    await quota.dispose()
    await Promise.all([searchTail, imageTail, imageGenerationTail])
    const search = searchFiber
    const image = imageFiber
    const imageGeneration = imageGenerationFiber
    searchFiber = undefined
    imageFiber = undefined
    imageGenerationFiber = undefined
    await Promise.allSettled([
      search?.dispose() ?? Promise.resolve(),
      image?.dispose() ?? Promise.resolve(),
      imageGeneration?.dispose() ?? Promise.resolve(),
    ])
    await proxyManager.dispose()
  }, 'dsh-codex-connect: optional capability lifecycle')

  ctx.on('loader/volatile-update', () => {
    quota.invalidate()
    const proxyIsActive = resolveProviderProxyUrl() !== undefined
    if (proxyWasActive && !proxyIsActive) {
      void proxyManager.deactivate().catch((error: unknown) => {
        ctx.logger.error('dsh-codex-connect: could not deactivate the provider proxy')
        ctx.logger.error(error)
      })
    }
    proxyWasActive = proxyIsActive
    scheduleCapabilities()
  })
  ctx.inject(['settings'], settingsCtx => {
    settingsCtx.effect(() => settingsCtx.settings.configure({ auto: false }, ctx.fiber),
      'dsh-codex-connect: custom settings page policy')
  })
  scheduleCapabilities()
}
