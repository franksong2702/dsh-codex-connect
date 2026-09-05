/**
 * ChatGPT OAuth and Codex models for DeepSeek Harness, with opt-in search and
 * image tooling.
 * @module dsh-codex-connect
 */

import type { Context, Fiber } from '@deepseek-ai/cordis'
import { randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'
import z from '@deepseek-ai/schemastery'
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
import { OPENAI_CODEX_AUTHORIZATION_TIMEOUT_MS, registerOpenAICodexAuthRoutes } from './auth-routes.ts'
import { registerOpenAICodexProxyRoutes } from './proxy-routes.ts'
import { OPENAI_CODEX_TRUSTED_ORIGINS_FILENAME, OpenAICodexTrustedOriginsStore } from './trusted-origins.ts'
import { registerOpenAICodexUpdateRoutes } from './update-routes.ts'
import { registerOpenAICodexModelCatalogRoute } from './model-routes.ts'
import { registerOpenAICodexOriginalImageRoute } from './image-asset-routes.ts'
import {
  checkForOpenAICodexUpdate,
  compareOpenAICodexVersions,
  parseOpenAICodexUpdateResult,
  parseOpenAICodexVersion,
} from './update.ts'
import { CODEX_CONNECT_VERSION } from './version.ts'
import { FastModeRegistry } from './fast-mode.ts'
import { assertNoOpenAICodexProviderConflict } from './doctor.ts'
import { imageGenerateTool } from './image-tool.ts'
import { viewImageTool } from './view-image.ts'
import { OpenAICodexTransport } from './transport.ts'
import type { OpenAICodexTransportV1 } from './transport.ts'
import { OpenAICodexProxyManager } from './provider-proxy.ts'
import { OpenAICodexImageAssetStore } from './image-assets.ts'
import { registerOpenAICodexAutoReview } from './auto-review.ts'
import { selectOpenAICodexSearchRoute } from './search-route-override.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Host-only image transport owned by the Codex Connect core fiber. */
    openaiCodexTransport: OpenAICodexTransportV1
  }
}

export { VIEW_IMAGE_TOOL_NAME } from './view-image.ts'
export { IMAGE_GENERATE_TOOL_NAME } from './image-tool.ts'
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
  OPENAI_CODEX_SETTINGS_NAMESPACE,
  isValidOpenAICodexProxyUrl,
  resolveOpenAICodexProxyUrl,
  resolveOpenAICodexSettings,
  parseOpenAICodexContextWindowOverrides,
} from './settings-contract.ts'

export {
  decodeOpenAICodexSettings,
  DEFAULT_OPENAI_CODEX_PROXY_URL,
  DEFAULT_OPENAI_CODEX_SETTINGS,
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

/** Composite model and standalone-search configuration. */
export interface Config {
  /** Complete interactive OAuth deadline in milliseconds; applies when the plugin loads. */
  oauthTimeoutMs?: number
  /** Model ids advertised in selectors; omitted to advertise the full catalog. */
  models?: string[] | undefined
  /** Route Codex Connect requests through proxyUrl after explicit activation. */
  enableProxy?: boolean
  /** Credential-free HTTP(S) proxy origin. */
  proxyUrl?: string
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
  /** Register the optional image-loading tool. */
  enableImageTool?: boolean
  /** Register the optional prompt-only image generation tool. */
  enableImageGeneration?: boolean
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

export const Config: z<Config> = z.object({
  oauthTimeoutMs: z.number().step(1).min(1_000).max(1_800_000).default(OPENAI_CODEX_AUTHORIZATION_TIMEOUT_MS),
  models: z.union([z.const(undefined), z.array(z.string())]),
  enableProxy: z.boolean().default(false),
  proxyUrl: z.string().default(DEFAULT_OPENAI_CODEX_PROXY_URL),
  contextWindowOverrides: z.transform(
    z.union([z.const(undefined), z.dict(z.union([z.const(null), z.number()]))]),
    parseOpenAICodexContextWindowOverrides,
  ),
  enableSearch: z.boolean().default(false),
  enableImageTool: z.boolean().default(false),
  enableImageGeneration: z.boolean().default(false),
  autoReviewDisclosureAcknowledged: z.boolean().default(false),
  enableAutoReview: z.boolean().default(false),
  searchModel: z.string().default(DEFAULT_OPENAI_CODEX_SEARCH_MODEL),
  searchMode: z.union(['cached', 'indexed', 'live'] as const).default(DEFAULT_OPENAI_CODEX_SEARCH_MODE),
  searchContextSize: z.union(['low', 'medium', 'high'] as const).default(DEFAULT_OPENAI_CODEX_SEARCH_CONTEXT_SIZE),
  searchMaxOutputTokens: z.number().step(1).min(1).default(DEFAULT_OPENAI_CODEX_SEARCH_MAX_OUTPUT_TOKENS),
})

/**
 * Register the `openai-codex` LLM route with one provider-native OAuth store.
 * Search and image tooling are added only when their config flags are true.
 * Selecting this route as the Harness default remains a separate profile choice.
 * @param ctx - plugin context carrying the LLM registry plus optional services.
 * @param config - capability gates and standalone-search tuning.
 */
export function apply(ctx: Context, config: Config): void {
  const catalog = openAICodexModelCatalog()
  const validateSettings = (value: Config): void => {
    resolveOpenAICodexSettings(value)
    assertOpenAICodexContextWindowOverrides(value.contextWindowOverrides ?? undefined, catalog)
  }
  validateSettings(config)
  let current = () => config
  const proxyManager = new OpenAICodexProxyManager()
  const resolveProviderProxyUrl = (): string | undefined => resolveOpenAICodexProxyUrl(resolveOpenAICodexSettings(current()))
  let proxyWasActive = resolveProviderProxyUrl() !== undefined
  const credentials = new OpenAICodexCredentialStore()
  const imageAssets = new OpenAICodexImageAssetStore()
  const trustedOrigins = new OpenAICodexTrustedOriginsStore(
    join(dirname(credentials.filename), OPENAI_CODEX_TRUSTED_ORIGINS_FILENAME),
  )
  const fastMode = new FastModeRegistry()
  assertNoOpenAICodexProviderConflict(ctx.llm.listProviders().map(provider => provider.id))
  new OpenAICodexTransport(ctx, credentials, proxyManager, resolveProviderProxyUrl)
  registerOpenAICodexAutoReview(
    ctx,
    credentials,
    proxyManager,
    resolveProviderProxyUrl,
    () => resolveOpenAICodexSettings(current()).enableAutoReview,
  )
  ctx.llm.registerAdapter(
    [OPENAI_CODEX_PROVIDER],
    createOpenAICodexAdapter(
      credentials,
      () => ctx.get('attachments'),
      fastMode,
      () => resolveOpenAICodexSettings(current()).models,
      proxyManager,
      resolveProviderProxyUrl,
      () => resolveOpenAICodexSettings(current()).contextWindowOverrides,
    ),
  )
  ctx.inject(['webServer'], webCtx => {
    registerOpenAICodexAuthRoutes(webCtx, credentials, trustedOrigins, fastMode, proxyManager, resolveProviderProxyUrl, config.oauthTimeoutMs)
    registerOpenAICodexProxyRoutes(webCtx, trustedOrigins, proxyManager)
    registerOpenAICodexUpdateRoutes(webCtx, { currentVersion: CODEX_CONNECT_VERSION }, trustedOrigins)
    registerOpenAICodexModelCatalogRoute(webCtx, openAICodexModelCatalog, trustedOrigins)
    registerOpenAICodexOriginalImageRoute(webCtx, trustedOrigins, imageAssets)
  })

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

  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.installSection(ctx, OPENAI_CODEX_SETTINGS_NS, Config, config, {
      validate(value) {
        validateSettings(value)
        if (value.enableProxy === true && !isValidOpenAICodexProxyUrl(value.proxyUrl)) {
          throw new TypeError('OpenAI Codex proxyUrl must be an HTTP(S) origin without credentials or a path')
        }
      },
      setSource(source) { current = source },
      onChange() {
        const proxyIsActive = resolveProviderProxyUrl() !== undefined
        if (proxyWasActive && !proxyIsActive) {
          void proxyManager.deactivate().catch((error: unknown) => {
            ctx.logger.error('dsh-codex-connect: could not deactivate the provider proxy')
            ctx.logger.error(error)
          })
        }
        proxyWasActive = proxyIsActive
        scheduleCapabilities()
      },
    })
  })
  scheduleCapabilities()
}
