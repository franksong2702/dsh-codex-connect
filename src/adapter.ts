/** OpenAI Codex adapter assembled from public dsh-llm-pi-ai extension points. */

import type { OpenAICodexReasoningEffort } from './reasoning-contract.ts'
import { defaultProviderAuthContext, InMemoryCredentialStore } from '@earendil-works/pi-ai'
import type { Context as PiContext, Provider, SimpleStreamOptions } from '@earendil-works/pi-ai'
import { openaiCodexProvider } from '@earendil-works/pi-ai/providers/openai-codex'
import { codexProviderContext } from './pi-context.ts'
import { resolveRetryPolicy } from '@deepseek-ai/dsh-llm'
import type { ContentBlock, GenerateOptions, PreparedAdapterCall, ResolvedRetryPolicy, RetryPolicyConfig, StreamChunk } from '@deepseek-ai/dsh-llm'
import { deepEqualJson } from '@deepseek-ai/dsh-util-values'
import { PiAiAdapter } from '@deepseek-ai/dsh-llm-pi-ai'
import type { ResolvedPiAiProviderProfile } from '@deepseek-ai/dsh-llm-pi-ai'
import type { AttachmentStore } from '@deepseek-ai/dsh-attachment'
import type { OpenAICodexCredentialStore } from './store.ts'
import { readOpenAICodexRequestAuth } from './auth.ts'
import { ConversationSpeedRegistry } from './conversation-speed.ts'
import { currentCapturedSpeed, currentSpeedRequestAccount, recordSpeedRequestAccount, streamWithSpeedRequestScope } from './speed-request-scope.ts'
import { projectOpenAICodexSpeedPayload } from './speed-mode-contract.ts'
import { OPENAI_CODEX_PROVIDER } from './store.ts'
import type { FastModeRegistry } from './fast-mode.ts'
import type { OpenAICodexModelCatalogEntry } from './model-contract.ts'
import { isValidOpenAICodexContextBudget, openAICodexContextLimit } from './model-contract.ts'
import { OPENAI_CODEX_TRANSPORT, withOpenAICodexModels } from './model-catalog.ts'
import type { OpenAICodexProxyManager } from './provider-proxy.ts'
import type { OpenAICodexBackendRequests } from './backend-request.ts'
import type { ReserveRequestPermits } from './reserve-state.ts'
import { OPENAI_CODEX_RESERVE_MODEL, OPENAI_CODEX_RESERVE_NORMAL_MODEL } from './reserve-usage.ts'
import { streamWithNativeCompactionScope, withOpenAICodexNativeCompaction } from './native-compaction.ts'
import { streamWithCodexRequestDiagnostics, withCodexDiagnosticFetch } from './request-diagnostics.ts'
import { imageSelectionHandleText } from './image-input-contract.ts'
import { OpenAICodexPreflightActivity, OPENAI_CODEX_STREAM_IDLE_TIMEOUT_MS } from './preflight-activity.ts'
import type { OpenAICodexPreflightConfig } from './preflight-activity.ts'

export { OPENAI_CODEX_ASTRA_MODEL_ID, OPENAI_CODEX_TRANSPORT, openAICodexModelCatalog, withOpenAICodexAstra, withOpenAICodexModels } from './model-catalog.ts'

/** Omission preserves ordinary dispatch; authority stays with the live task runtime. */
export interface OpenAICodexTaskDispatch {
  /** Explicit legacy-task provider policy; ordinary profiles do not import it. */
  wrapProvider?: (provider: Provider) => Provider
  stream(options: GenerateOptions, delegate: (next: GenerateOptions) => AsyncIterable<StreamChunk>): AsyncIterable<StreamChunk>
}

export { OPENAI_CODEX_STREAM_IDLE_TIMEOUT_MS } from './preflight-activity.ts'

/** rc.2 default maximum base64 image payload retained in one request. */
export const OPENAI_CODEX_MAX_REQUEST_IMAGE_BYTES = 20 * 1024 * 1024
/** rc.2 default total-pixel budget for one deterministic inline image version. */
export const OPENAI_CODEX_REQUEST_IMAGE_PIXEL_BUDGET = 2048 * 2048
/** rc.2 default raw encoded-byte cap for one deterministic inline image version. */
export const OPENAI_CODEX_REQUEST_IMAGE_MAX_BYTES = 1024 * 1024

/**
 * Give the generic dsh adapter a request-scoped bearer-token entry without
 * changing the provider's user-facing OAuth flow. The resolver accepts only
 * the explicit override supplied by this plugin; it never discovers an API
 * key from the environment or persistent api-key credentials.
 */
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
      const scoped = fastMode instanceof ConversationSpeedRegistry
        && provider.id === OPENAI_CODEX_PROVIDER && model.provider === OPENAI_CODEX_PROVIDER
      const captured = scoped ? currentCapturedSpeed() ?? fastMode.captureSpeed(sessionId) : undefined
      const requestedMode = scoped && captured !== undefined ? fastMode.confirmCapturedSpeed(sessionId, captured, {
        workspace: fastMode.workspaceFor(sessionId), accountKey: currentSpeedRequestAccount(), provider: model.provider, model: model.id,
      }) : enabled ? 'fast' : 'standard'
      const mode = model.id === OPENAI_CODEX_RESERVE_MODEL ? 'standard' : requestedMode
      if (mode === 'standard' && (!scoped || options?.onPayload === undefined)) return streamSimple.call(provider, model, context, options)
      const previousOnPayload = options?.onPayload
      const nextOptions: SimpleStreamOptions = {
        ...options,
        async onPayload(payload, payloadModel) {
          const replaced = await previousOnPayload?.(payload, payloadModel)
          const nextPayload = replaced === undefined ? payload : replaced
          return projectOpenAICodexSpeedPayload(nextPayload, model.provider, model.id, mode)
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
  backendRequests?: OpenAICodexBackendRequests,
  wrapProvider?: (provider: Provider) => Provider,
  preflight?: OpenAICodexPreflightActivity,
): Provider {
  const ordinary = withOpenAICodexFastMode(withOpenAICodexNativeCompaction(provider), fastMode)
  const configured = wrapProvider === undefined ? ordinary : wrapProvider(ordinary)
  const streamSimple = configured.streamSimple
  return {
    ...configured,
    streamSimple(model, context: PiContext, options?: SimpleStreamOptions) {
      const operation = (actualProxyOrigin: string | undefined) => {
        const diagnosticOptions = withCodexDiagnosticFetch(options, backendRequests)
        const requestOptions = preflight === undefined ? diagnosticOptions : preflight.wrap(diagnosticOptions, actualProxyOrigin)
        return streamSimple.call(configured, model, codexProviderContext(context), requestOptions)
      }
      if (backendRequests !== undefined) return backendRequests.runStream(operation)
      const proxyUrl = resolveProxyUrl?.()
      return proxyManager?.runStream(proxyUrl, () => operation(proxyUrl)) ?? operation(undefined)
    },
    auth: {
      ...provider.auth,
      apiKey: {
        name: 'OpenAI Codex OAuth bearer token',
        async resolve({ credential, signal }) {
          const apiKey = credential?.key
          if (apiKey !== undefined && apiKey.length > 0) preflight?.activate(signal)
          return apiKey === undefined || apiKey.length === 0
            ? undefined
            : { auth: { apiKey }, source: 'OAuth' }
        },
      },
    },
  }
}

/** Build the pi-ai profile with the model-error index required by DSH 0.1.7-rc.1. */
export function createOpenAICodexProfile(
  provider: Provider,
  fastMode?: FastModeRegistry,
  proxyManager?: OpenAICodexProxyManager,
  resolveProxyUrl?: () => string | undefined,
  contextWindowOverrides?: Readonly<Record<string, number>> | undefined,
  backendRequests?: OpenAICodexBackendRequests,
  wrapProvider?: (provider: Provider) => Provider,
  preflight?: OpenAICodexPreflightActivity,
  retryPolicy: ResolvedRetryPolicy = resolveRetryPolicy(undefined, 'dsh-codex-connect retryPolicy'),
  reasoningEffort?: OpenAICodexReasoningEffort,
): ResolvedPiAiProviderProfile & { piProvider: Provider } {
  const effectiveProvider = contextWindowOverrides === undefined
    ? provider
    : withOpenAICodexContextWindowOverrides(provider, contextWindowOverrides)
  const profile = {
    provider: OPENAI_CODEX_PROVIDER,
    displayName: 'OpenAI Codex',
    transport: OPENAI_CODEX_TRANSPORT,
    streamIdleTimeoutMs: preflight?.hostIdleTimeoutMs ?? OPENAI_CODEX_STREAM_IDLE_TIMEOUT_MS,
    maxRequestImageBytes: OPENAI_CODEX_MAX_REQUEST_IMAGE_BYTES,
    requestImagePixelBudget: OPENAI_CODEX_REQUEST_IMAGE_PIXEL_BUDGET,
    requestImageMaxBytes: OPENAI_CODEX_REQUEST_IMAGE_MAX_BYTES,
    retryPolicy,
    ...(reasoningEffort === undefined ? {} : { reasoning: reasoningEffort }),
    configuredMaxTokens: new Map(),
    modelErrors: new Map<string, string>(),
    piProvider: requestProvider(effectiveProvider, fastMode, proxyManager, resolveProxyUrl, backendRequests, wrapProvider, preflight),
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
/** Add stable selection handles next to request images without mutating durable messages. */
export function withOpenAICodexImageSelectionHandles(options: GenerateOptions): GenerateOptions {
  let changed = false
  const messages = options.messages.map(message => {
    let imageIndex = 0
    let contentChanged = false
    const content: ContentBlock[] = []
    for (const block of message.content) {
      content.push(block)
      if (block.type !== 'image') continue
      imageIndex += 1
      content.push({ type: 'text', text: imageSelectionHandleText(imageIndex, block.attachment) })
      contentChanged = true
    }
    if (!contentChanged) return message
    changed = true
    return { ...message, content }
  })
  return changed ? { ...options, messages } : options
}

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
  backendRequests?: OpenAICodexBackendRequests,
  taskDispatch?: OpenAICodexTaskDispatch,
  imageEditingEnabled?: () => boolean,
  preflightActivity?: OpenAICodexPreflightConfig,
  retryPolicyConfig?: RetryPolicyConfig,
  resolveReasoningEffort?: () => OpenAICodexReasoningEffort | undefined,
): PiAiAdapter {
  if (retryPolicyConfig === null) throw new TypeError('dsh-codex-connect retryPolicy must be an object or omitted')
  const retryPolicy = resolveRetryPolicy(retryPolicyConfig, 'dsh-codex-connect retryPolicy')
  const preflight = preflightActivity === undefined ? undefined : new OpenAICodexPreflightActivity(preflightActivity)
  const baseline = withOpenAICodexModels(openaiCodexProvider(), 'bundled-static')
  const provider = reservePermits === undefined ? baseline : withOpenAICodexReserve(baseline, reservePermits)
  let profiles: Map<string, ResolvedPiAiProviderProfile> | undefined
  let previousOverrides: Readonly<Record<string, number>> | undefined
  let previousReasoningEffort: OpenAICodexReasoningEffort | undefined
  const currentProfiles = (): Map<string, ResolvedPiAiProviderProfile> => {
    const overrides = contextWindowOverrides?.()
    const reasoningEffort = resolveReasoningEffort?.()
    if (profiles === undefined || previousReasoningEffort !== reasoningEffort || !deepEqualJson(previousOverrides, overrides)) {
      const profile = createOpenAICodexProfile(provider, fastMode, proxyManager, resolveProxyUrl, overrides, backendRequests, taskDispatch?.wrapProvider, preflight, retryPolicy, reasoningEffort)
      previousReasoningEffort = reasoningEffort
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
      const dispatch = (request: GenerateOptions) => {
        const projected = imageEditingEnabled?.() === true ? withOpenAICodexImageSelectionHandles(request) : request
        const observed = (nextOptions: GenerateOptions) => streamWithCodexRequestDiagnostics(next => {
          const native = (request: GenerateOptions) => streamWithNativeCompactionScope(stream, request, nativeCompactionEnabled?.() === true)
          return preflight === undefined ? native(next) : preflight.stream(native, next)
        }, nextOptions)
        return backendRequests?.metrics?.stream(observed, projected) ?? observed(projected)
      }
      const execute = (request: GenerateOptions) => taskDispatch?.stream(request, dispatch) ?? dispatch(request)
      return fastMode instanceof ConversationSpeedRegistry
        ? streamWithSpeedRequestScope(execute, options, () => {
          const captured = fastMode.captureSpeed(options.sessionId)
          // Auxiliary compaction/title calls do not inherit a paid conversation choice.
          return options.purpose !== undefined && captured.mode === 'ultrafast' ? { mode: 'standard' } : captured
        })
        : execute(options)
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
      // Codex advertises a static catalog even while signed out. alpha.3's
      // generic Host listing resolves credentials; only request dispatch may
      // capture/refresh our account. Project our current provider metadata here.
      const provider = currentProfiles().get(providerId)?.piProvider
      if (provider === undefined) return super.listModels(providerId)
      const catalog = provider.getModels().filter(model => model.id !== OPENAI_CODEX_RESERVE_MODEL)
        .map(model => ({ provider: providerId, id: model.id, name: model.name, inputModalities: [...model.input] }))
      const configured = visibleModelIds?.()
      if (configured === undefined) return catalog
      const visible = new Set(configured)
      return catalog.filter(model => visible.has(model.id))
    }
  }
  return new OpenAICodexAdapter({
    profiles: currentProfiles,
    resolveApiKey: async () => {
      const operation = async () => {
        const auth = await readOpenAICodexRequestAuth(credentials)
        recordSpeedRequestAccount(auth.accountId)
        return auth.access
      }
      return proxyManager?.run(resolveProxyUrl?.(), operation) ?? operation()
    },
    // Host-side auth accepts only the explicit bearer token resolved above.
    auth: { credentials: new InMemoryCredentialStore(), authContext: defaultProviderAuthContext() },
    resolveAttachments,
  })
}
