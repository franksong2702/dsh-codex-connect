/** OpenAI Codex adapter assembled from public dsh-llm-pi-ai extension points. */

import { defaultProviderAuthContext, InMemoryCredentialStore } from '@earendil-works/pi-ai'
import type { Context as PiContext, Model, Provider, SimpleStreamOptions } from '@earendil-works/pi-ai'
import { openaiCodexProvider } from '@earendil-works/pi-ai/providers/openai-codex'
import { resolveRetryPolicy } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, PreparedAdapterCall, StreamChunk } from '@deepseek-ai/dsh-llm'
import { deepEqualJson } from '@deepseek-ai/dsh-util-values'
import { PiAiAdapter } from '@deepseek-ai/dsh-llm-pi-ai'
import type { ResolvedPiAiProviderProfile } from '@deepseek-ai/dsh-llm-pi-ai'
import type { AttachmentStore } from '@deepseek-ai/dsh-attachment'
import type { OpenAICodexCredentialStore } from './store.ts'
import { readOpenAICodexRequestAuth } from './auth.ts'
import { OPENAI_CODEX_PROVIDER } from './store.ts'
import type { FastModeRegistry } from './fast-mode.ts'
import type { OpenAICodexModelCatalogEntry } from './model-contract.ts'
import { isValidOpenAICodexContextBudget, openAICodexContextLimit } from './model-contract.ts'
import type { OpenAICodexProxyManager } from './provider-proxy.ts'
import type { ReserveRequestPermits } from './reserve-state.ts'
import { OPENAI_CODEX_RESERVE_MODEL, OPENAI_CODEX_RESERVE_NORMAL_MODEL } from './reserve-usage.ts'
import { streamWithNativeCompactionScope, withOpenAICodexNativeCompaction } from './native-compaction.ts'

/** Official Codex id supplied when the installed pi-ai catalog predates Astra. */
export const OPENAI_CODEX_ASTRA_MODEL_ID = 'gpt-6-astra'

const OPENAI_CODEX_ASTRA_MODEL: Model<'openai-codex-responses'> = {
  id: OPENAI_CODEX_ASTRA_MODEL_ID,
  name: 'GPT-6-Astra',
  api: 'openai-codex-responses',
  provider: OPENAI_CODEX_PROVIDER,
  baseUrl: 'https://chatgpt.com/backend-api',
  reasoning: true,
  input: ['text', 'image'],
  // ChatGPT OAuth usage is read from the server; no authoritative token-price schedule is available here.
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 272_000,
  maxTokens: 128_000,
  thinkingLevelMap: { off: null, minimal: null, xhigh: 'xhigh', max: 'max' },
  compat: {
    supportsOpenAIGrammarTools: true,
    supportsAdditionalTools: true,
    supportsToolSearch: true,
  },
}

/** Preserve native Astra metadata with calibrated effort choices, or add the fallback. */
export function withOpenAICodexAstra(
  provider: Provider<'openai-codex-responses'>,
): Provider<'openai-codex-responses'> {
  const baseline = provider.getModels()
  const models = baseline.some(model => model.id === OPENAI_CODEX_ASTRA_MODEL_ID)
    ? baseline.map(model => model.id === OPENAI_CODEX_ASTRA_MODEL_ID
      ? { ...model, thinkingLevelMap: { ...model.thinkingLevelMap, ...OPENAI_CODEX_ASTRA_MODEL.thinkingLevelMap } }
      : model)
    : [OPENAI_CODEX_ASTRA_MODEL, ...baseline]
  return { ...provider, getModels: () => models }
}

/** Return a detached copy of the effective Codex model catalog. */
export function openAICodexModelCatalog(): readonly OpenAICodexModelCatalogEntry[] {
  return withOpenAICodexAstra(openaiCodexProvider()).getModels().map(model => ({
    id: model.id, name: model.name, contextWindow: model.contextWindow,
    ...openAICodexContextLimit(model.id, model.contextWindow),
  }))
}

/** Provider idle ceiling used by the composite route. */
export const OPENAI_CODEX_STREAM_IDLE_TIMEOUT_MS = 300_000

/** rc.2 default maximum base64 image payload retained in one request. */
export const OPENAI_CODEX_MAX_REQUEST_IMAGE_BYTES = 20 * 1024 * 1024
/** rc.2 default total-pixel budget for one deterministic inline image version. */
export const OPENAI_CODEX_REQUEST_IMAGE_PIXEL_BUDGET = 2048 * 2048
/** rc.2 default raw encoded-byte cap for one deterministic inline image version. */
export const OPENAI_CODEX_REQUEST_IMAGE_MAX_BYTES = 1024 * 1024

/**
 * Use the finite SSE response path for Codex requests. The automatic
 * WebSocket path keeps a session connection for prompt-cache reuse, which
 * can leave one-shot Headless processes alive after their final answer.
 */
export const OPENAI_CODEX_TRANSPORT = 'sse' as const

/**
 * Give the generic dsh adapter a request-scoped bearer-token entry without
 * changing the provider's user-facing OAuth flow. The resolver accepts only
 * the explicit override supplied by this plugin; it never discovers an API
 * key from the environment or persistent api-key credentials.
 */
function isPayloadRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Add the request-scoped Fast Mode hint without changing auth or other options. */
export function withOpenAICodexFastMode(
  provider: Provider,
  fastMode: FastModeRegistry | undefined,
): Provider {
  const streamSimple = provider.streamSimple
  return {
    ...provider,
    streamSimple(model, context: PiContext, options?: SimpleStreamOptions) {
      const sessionId = options?.sessionId
      const enabled = provider.id === OPENAI_CODEX_PROVIDER
        && model.provider === OPENAI_CODEX_PROVIDER
        && model.id !== OPENAI_CODEX_RESERVE_MODEL
        && fastMode !== undefined
        && fastMode.isEnabled(sessionId)
      if (!enabled) return streamSimple.call(provider, model, context, options)
      const previousOnPayload = options?.onPayload
      const nextOptions: SimpleStreamOptions = {
        ...options,
        async onPayload(payload, payloadModel) {
          const replaced = await previousOnPayload?.(payload, payloadModel)
          const nextPayload = replaced === undefined ? payload : replaced
          return isPayloadRecord(nextPayload)
            ? { ...nextPayload, service_tier: 'priority' }
            : nextPayload
        },
      }
      return streamSimple.call(provider, model, context, nextOptions)
    },
  }
}

/** Add an internal Luna route whose dispatch requires one fresh agent-request permit. */
export function withOpenAICodexReserve(provider: Provider, permits: ReserveRequestPermits): Provider {
  const models = provider.getModels().filter(model => model.id !== OPENAI_CODEX_RESERVE_MODEL)
  const luna = models.find(model => model.id === OPENAI_CODEX_RESERVE_NORMAL_MODEL)
  if (luna === undefined) throw new Error('Codex Reserve requires the Luna model catalog')
  const reserve = { ...luna, id: OPENAI_CODEX_RESERVE_MODEL, name: 'Luna Reserve' }
  return {
    ...provider,
    getModels: () => [...models, reserve],
    streamSimple(model, context, options) {
      if (model.id === OPENAI_CODEX_RESERVE_MODEL) permits.consume(options?.sessionId, options?.apiKey)
      return provider.streamSimple(model, context, options)
    },
  }
}

function requestProvider(
  provider: Provider,
  fastMode?: FastModeRegistry,
  proxyManager?: OpenAICodexProxyManager,
  resolveProxyUrl?: () => string | undefined,
): Provider {
  const configured = withOpenAICodexFastMode(withOpenAICodexNativeCompaction(provider), fastMode)
  const streamSimple = configured.streamSimple
  return {
    ...configured,
    streamSimple(model, context: PiContext, options?: SimpleStreamOptions) {
      const proxyUrl = resolveProxyUrl?.()
      const operation = () => streamSimple.call(configured, model, context, options)
      return proxyManager?.runStream(proxyUrl, operation) ?? operation()
    },
    auth: {
      ...provider.auth,
      apiKey: {
        name: 'OpenAI Codex OAuth bearer token',
        async resolve({ credential }) {
          const apiKey = credential?.key
          return apiKey === undefined || apiKey.length === 0
            ? undefined
            : { auth: { apiKey }, source: 'OAuth' }
        },
      },
    },
  }
}

/** Build the pi-ai profile with the model-error index required by DSH 0.1.5-rc.1. */
export function createOpenAICodexProfile(
  provider: Provider,
  fastMode?: FastModeRegistry,
  proxyManager?: OpenAICodexProxyManager,
  resolveProxyUrl?: () => string | undefined,
  contextWindowOverrides?: Readonly<Record<string, number>> | undefined,
): ResolvedPiAiProviderProfile & { piProvider: Provider } {
  const effectiveProvider = contextWindowOverrides === undefined
    ? provider
    : withOpenAICodexContextWindowOverrides(provider, contextWindowOverrides)
  const profile = {
    provider: OPENAI_CODEX_PROVIDER,
    displayName: 'OpenAI Codex',
    transport: OPENAI_CODEX_TRANSPORT,
    streamIdleTimeoutMs: OPENAI_CODEX_STREAM_IDLE_TIMEOUT_MS,
    maxRequestImageBytes: OPENAI_CODEX_MAX_REQUEST_IMAGE_BYTES,
    requestImagePixelBudget: OPENAI_CODEX_REQUEST_IMAGE_PIXEL_BUDGET,
    requestImageMaxBytes: OPENAI_CODEX_REQUEST_IMAGE_MAX_BYTES,
    retryPolicy: resolveRetryPolicy(undefined, 'dsh-codex-connect retryPolicy'),
    configuredMaxTokens: new Map(),
    modelErrors: new Map<string, string>(),
    piProvider: requestProvider(effectiveProvider, fastMode, proxyManager, resolveProxyUrl),
  }
  return profile
}

/**
 * Detach one provider and replace the advertised context window for the
 * configured model ids. Request streaming itself is unaffected: pi-ai streams
 * the caller-supplied model, so only the metadata Harness reads for context
 * budgeting and compaction changes.
 */
export function withOpenAICodexContextWindowOverrides(
  provider: Provider,
  overrides: Readonly<Record<string, number>>,
): Provider {
  const baselineModels = provider.getModels()
  assertOpenAICodexContextWindowOverrides(overrides, baselineModels)
  const replaced = baselineModels.map(model => {
    const contextWindow = overrides[model.id]
    return contextWindow === undefined ? model : { ...model, contextWindow }
  })
  return { ...provider, getModels: () => replaced }
}

/** Reject unknown ids and out-of-range budgets before accepting settings or requests. */
export function assertOpenAICodexContextWindowOverrides(
  overrides: Readonly<Record<string, number | null>> | undefined,
  catalog: readonly Pick<OpenAICodexModelCatalogEntry, 'id' | 'contextWindow'>[],
): void {
  const models = new Map(catalog.map(model => [model.id, model]))
  for (const [id, budget] of Object.entries(overrides ?? {})) {
    const model = models.get(id)
    if (model === undefined) throw new TypeError(`OpenAI Codex contextWindowOverrides contains unknown model id "${id}"`)
    const { maxContextWindow } = openAICodexContextLimit(id, model.contextWindow)
    if (budget !== null && !isValidOpenAICodexContextBudget(budget, maxContextWindow)) {
      throw new TypeError(`OpenAI Codex contextWindowOverrides for "${id}" must be an integer from 1 to ${maxContextWindow} tokens; use null to restore the catalog default`)
    }
  }
}

/**
 * Create the Codex subscription adapter without requiring a dsh fork. The
 * public pi-ai adapter owns Harness message conversion, image attachment
 * resolution, streaming, reasoning metadata, and compaction behavior; this
 * plugin supplies its provider-native OAuth token for each request.
 */
export function createOpenAICodexAdapter(
  credentials: OpenAICodexCredentialStore,
  resolveAttachments: () => AttachmentStore | undefined,
  fastMode?: FastModeRegistry,
  visibleModelIds?: () => readonly string[] | undefined,
  proxyManager?: OpenAICodexProxyManager,
  resolveProxyUrl?: () => string | undefined,
  contextWindowOverrides?: () => Readonly<Record<string, number>> | undefined,
  reservePermits?: ReserveRequestPermits,
  nativeCompactionEnabled?: () => boolean,
): PiAiAdapter {
  const baseline = withOpenAICodexAstra(openaiCodexProvider())
  const provider = reservePermits === undefined ? baseline : withOpenAICodexReserve(baseline, reservePermits)
  let profiles: Map<string, ResolvedPiAiProviderProfile> | undefined
  let previousOverrides: Readonly<Record<string, number>> | undefined
  const currentProfiles = (): Map<string, ResolvedPiAiProviderProfile> => {
    const overrides = contextWindowOverrides?.()
    if (profiles === undefined || !deepEqualJson(previousOverrides, overrides)) {
      const profile = createOpenAICodexProfile(provider, fastMode, proxyManager, resolveProxyUrl, overrides)
      previousOverrides = overrides === undefined ? undefined : { ...overrides }
      // PiAiAdapter keys snapshots by map identity; captured calls keep the old map.
      profiles = new Map([[OPENAI_CODEX_PROVIDER, profile]])
    }
    return profiles
  }
  class OpenAICodexAdapter extends PiAiAdapter {
    private streamPrepared(
      stream: (options: GenerateOptions) => AsyncIterable<StreamChunk>,
      options: GenerateOptions,
    ): AsyncIterable<StreamChunk> {
      return streamWithNativeCompactionScope(stream, options, nativeCompactionEnabled?.() === true)
    }

    override async prepareCall(providerId: string, model: string, signal?: AbortSignal): Promise<PreparedAdapterCall> {
      const prepared = await super.prepareCall(providerId, model, signal)
      return {
        model: prepared.model,
        stream: options => this.streamPrepared(prepared.stream, options),
      }
    }

    override stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
      return this.streamPrepared(next => super.stream(next), options)
    }

    override async listModels(providerId: string) {
      const catalog = (await super.listModels(providerId)).filter(model => model.id !== OPENAI_CODEX_RESERVE_MODEL)
      const configured = visibleModelIds?.()
      if (configured === undefined) return catalog
      const visible = new Set(configured)
      return catalog.filter(model => visible.has(model.id))
    }
  }
  return new OpenAICodexAdapter({
    profiles: currentProfiles,
    resolveApiKey: async () => {
      const operation = async () => (await readOpenAICodexRequestAuth(credentials)).access
      return proxyManager?.run(resolveProxyUrl?.(), operation) ?? operation()
    },
    // Host-side auth accepts only the explicit bearer token resolved above.
    auth: { credentials: new InMemoryCredentialStore(), authContext: defaultProviderAuthContext() },
    resolveAttachments,
  })
}
