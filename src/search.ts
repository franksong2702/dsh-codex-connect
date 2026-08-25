/**
 * OpenAI Codex standalone web search over the dsh web provider seam.
 * @module dsh-codex-connect/search
 */

import { createModels } from '@earendil-works/pi-ai'
import type { Models } from '@earendil-works/pi-ai'
import { openaiCodexProvider } from '@earendil-works/pi-ai/providers/openai-codex'
import { WebError } from '@deepseek-ai/dsh-web'
import type {
  WebSearchProvider,
  WebSearchRequest,
  WebSearchResult,
  WebSearchSource,
} from '@deepseek-ai/dsh-web'
import type { OpenAICodexCredentialStore } from './store.ts'
import { OPENAI_CODEX_PROVIDER } from './store.ts'
import { withOpenAICodexProxy } from './provider-proxy.ts'
import {
  DEFAULT_OPENAI_CODEX_SEARCH_CONTEXT_SIZE,
  DEFAULT_OPENAI_CODEX_SEARCH_MAX_OUTPUT_TOKENS,
  DEFAULT_OPENAI_CODEX_SEARCH_MODE,
  DEFAULT_OPENAI_CODEX_SEARCH_MODEL,
} from './settings-contract.ts'
import type { OpenAICodexSearchContextSize, OpenAICodexSearchMode } from './settings-contract.ts'

export {
  DEFAULT_OPENAI_CODEX_SEARCH_CONTEXT_SIZE,
  DEFAULT_OPENAI_CODEX_SEARCH_MAX_OUTPUT_TOKENS,
  DEFAULT_OPENAI_CODEX_SEARCH_MODE,
  DEFAULT_OPENAI_CODEX_SEARCH_MODEL,
} from './settings-contract.ts'
export type { OpenAICodexSearchContextSize, OpenAICodexSearchMode } from './settings-contract.ts'

/** Stable dsh web-provider id selected by the bundle patch. */
export const OPENAI_CODEX_SEARCH_PROVIDER = OPENAI_CODEX_PROVIDER

/** Trusted first-party Codex base; OAuth credentials never cross to a configured origin. */
export const OPENAI_CODEX_BASE_URL = 'https://chatgpt.com/backend-api/codex'

/** Standalone search endpoint used by the official Codex client. */
export const OPENAI_CODEX_SEARCH_URL = `${OPENAI_CODEX_BASE_URL}/alpha/search`

interface SearchRequestBody {
  readonly id: string
  readonly model: string
  readonly input: readonly [{
    readonly type: 'message'
    readonly role: 'user'
    readonly content: readonly [{ readonly type: 'input_text'; readonly text: string }]
  }]
  readonly commands: {
    readonly search_query: readonly [{ readonly q: string }]
  }
  readonly settings: {
    readonly search_context_size: OpenAICodexSearchContextSize
    readonly allowed_callers: readonly ['direct']
    readonly external_web_access: boolean | 'indexed'
  }
  readonly max_output_tokens: number
}

/** Exact secret-free request recorded before a standalone search dispatch. */
export interface OpenAICodexSearchRequestRecord {
  /** Fixed first-party endpoint. */
  readonly endpoint: typeof OPENAI_CODEX_SEARCH_URL
  /** Exact JSON body sent to the provider. */
  readonly body: SearchRequestBody
}

/** Fully resolved provider options. */
export interface OpenAICodexSearchProviderOptions {
  /** Shared persistent OAuth store. */
  readonly credentials: OpenAICodexCredentialStore
  /** Model sent to the standalone search endpoint. */
  readonly model: string
  /** Cached, indexed, or live external-web policy. */
  readonly mode: OpenAICodexSearchMode
  /** Provider-side search context size. */
  readonly contextSize: OpenAICodexSearchContextSize
  /** Upper bound on the standalone endpoint's generated output. */
  readonly maxOutputTokens: number
  /** Resolve the request identity, normally the initiating session id. */
  readonly resolveRequestId: () => string
  /** Resolve the currently active provider proxy for each request. */
  readonly resolveProxyUrl?: () => string | undefined
  /** Record the exact secret-free request before dispatch. */
  readonly recordRequest?: (request: OpenAICodexSearchRequestRecord) => void
}

/** Convert the configured mode to the official endpoint field. */
function externalWebAccess(mode: OpenAICodexSearchMode): boolean | 'indexed' {
  switch (mode) {
    case 'cached': return false
    case 'indexed': return 'indexed'
    case 'live': return true
  }
}

/** Extract the account id paired with one OAuth access token. */
function accountIdFromToken(access: string): string {
  try {
    const parts = access.split('.')
    if (parts.length !== 3 || parts[1] === undefined) throw new Error('invalid JWT')
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as Record<string, unknown>
    const auth = payload['https://api.openai.com/auth']
    if (typeof auth !== 'object' || auth === null || Array.isArray(auth)) throw new Error('missing auth claim')
    const accountId = (auth as Record<string, unknown>)['chatgpt_account_id']
    if (typeof accountId !== 'string' || accountId.length === 0) throw new Error('missing account id')
    return accountId
  } catch (error: unknown) {
    throw new WebError('OpenAI Codex search credential has no usable account id; run "dsh openai-codex login" again', 'WEB_PROVIDER_CREDENTIAL_MISSING', { cause: error })
  }
}

/** Whether an opaque value is a non-array record. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Read an optional non-empty string field. */
function optionalString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

/** Accept only citeable HTTP(S) URLs from opaque result DTOs. */
function citeableUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:' ? value : undefined
  } catch {
    return undefined
  }
}

/**
 * Map the standalone endpoint's forward-compatible result DTOs into the dsh
 * web result. Unknown DTO types and fields are ignored; malformed envelope
 * fields fail at the network boundary.
 * @param value - parsed response JSON.
 * @returns normalized answer and citeable sources.
 */
export function mapOpenAICodexSearchResponse(value: unknown): WebSearchResult {
  if (!isRecord(value) || typeof value['output'] !== 'string') {
    throw new WebError('OpenAI Codex returned a search response without string output', 'WEB_PROVIDER_ERROR')
  }
  const output = value['output']
  const rawResults = value['results']
  if (rawResults !== undefined && !Array.isArray(rawResults)) {
    throw new WebError('OpenAI Codex returned a search response with non-array results', 'WEB_PROVIDER_ERROR')
  }
  const sources: WebSearchSource[] = []
  const seen = new Set<string>()
  for (const item of rawResults ?? []) {
    if (!isRecord(item) || item['type'] !== 'text_result') continue
    const url = citeableUrl(item['url'])
    if (url === undefined || seen.has(url)) continue
    seen.add(url)
    const title = optionalString(item, 'title')
    const snippet = optionalString(item, 'snippet')
    sources.push({
      url,
      ...title === undefined ? {} : { title },
      ...snippet === undefined ? {} : { snippet },
    })
  }
  return {
    ...output.length === 0 ? {} : { content: output },
    sources,
    truncated: false,
  }
}

/** Stable cancellation error for every provider phase. */
function searchAborted(signal?: AbortSignal, fallback?: unknown): WebError {
  return new WebError('OpenAI Codex search aborted', 'WEB_ABORTED', {
    cause: signal?.aborted === true ? signal.reason : fallback,
  })
}

/** Throw the provider's stable cancellation error when the caller already aborted. */
function throwIfSearchAborted(signal?: AbortSignal): void {
  if (signal?.aborted === true) throw searchAborted(signal)
}

/** True for native fetch cancellation. */
function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

/** Race an asynchronous auth refresh against caller cancellation. */
function abortable<T>(operation: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (signal === undefined) return operation
  if (signal.aborted) return Promise.reject(searchAborted(signal))
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => { reject(searchAborted(signal)) }
    signal.addEventListener('abort', onAbort, { once: true })
    void operation.then(
      (value) => {
        signal.removeEventListener('abort', onAbort)
        resolve(value)
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort)
        reject(error)
      },
    )
  })
}

/** Keep provider diagnostics bounded and remove JWT-like material. */
function providerMessage(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined
  const error = value['error']
  const raw = typeof error === 'string'
    ? error
    : isRecord(error) && typeof error['message'] === 'string'
      ? error['message']
      : typeof value['message'] === 'string' ? value['message'] : undefined
  return raw?.replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/gu, '[REDACTED]').slice(0, 1000)
}

/** OpenAI Codex standalone-search provider using the same refreshable OAuth store as the LLM route. */
export class OpenAICodexSearchProvider implements WebSearchProvider {
  readonly id = OPENAI_CODEX_SEARCH_PROVIDER
  private readonly models: Models

  /**
   * @param options - fixed trusted endpoint policy and deployment tunables.
   */
  constructor(private readonly options: OpenAICodexSearchProviderOptions) {
    const models = createModels({ credentials: options.credentials })
    models.setProvider(openaiCodexProvider())
    this.models = models
  }

  /** The local configuration is usable; credential presence is resolved per request. */
  available(): boolean {
    return this.options.model.length > 0
      && Number.isInteger(this.options.maxOutputTokens)
      && this.options.maxOutputTokens > 0
  }

  /** @inheritdoc */
  async search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult> {
    throwIfSearchAborted(signal)
    let auth
    try {
      auth = await abortable(withOpenAICodexProxy(
        this.options.resolveProxyUrl?.(),
        () => this.models.getAuth(OPENAI_CODEX_PROVIDER),
      ), signal)
    } catch (error: unknown) {
      throwIfSearchAborted(signal)
      if (isAbortError(error)) throw searchAborted(signal, error)
      throw new WebError('OpenAI Codex search credential resolution failed', 'WEB_PROVIDER_ERROR', { cause: error })
    }
    const access = auth?.auth.apiKey
    if (access === undefined || access.length === 0) {
      throw new WebError('OpenAI Codex search is signed out; run "dsh openai-codex login"', 'WEB_PROVIDER_CREDENTIAL_MISSING')
    }
    const accountId = accountIdFromToken(access)
    throwIfSearchAborted(signal)

    const body: SearchRequestBody = {
      id: this.options.resolveRequestId(),
      model: this.options.model,
      input: [{
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: request.query }],
      }],
      commands: { search_query: [{ q: request.query }] },
      settings: {
        search_context_size: this.options.contextSize,
        allowed_callers: ['direct'],
        external_web_access: externalWebAccess(this.options.mode),
      },
      max_output_tokens: this.options.maxOutputTokens,
    }
    this.options.recordRequest?.({ endpoint: OPENAI_CODEX_SEARCH_URL, body })
    throwIfSearchAborted(signal)

    let response: Response
    try {
      response = await withOpenAICodexProxy(this.options.resolveProxyUrl?.(), () => fetch(OPENAI_CODEX_SEARCH_URL, {
        method: 'POST',
        redirect: 'error',
        headers: {
          authorization: `Bearer ${access}`,
          'chatgpt-account-id': accountId,
          'content-type': 'application/json',
          accept: 'application/json',
          originator: 'deepseek-harness',
        },
        body: JSON.stringify(body),
        ...signal === undefined ? {} : { signal },
      }))
    } catch (error: unknown) {
      throwIfSearchAborted(signal)
      if (isAbortError(error)) throw searchAborted(signal, error)
      throw new WebError('OpenAI Codex search request failed', 'WEB_PROVIDER_ERROR', { cause: error })
    }

    let payload: unknown
    try {
      payload = await response.json()
    } catch (error: unknown) {
      throwIfSearchAborted(signal)
      if (isAbortError(error)) throw searchAborted(signal, error)
      throw new WebError(`OpenAI Codex returned an unprocessable search response (HTTP ${response.status})`, 'WEB_PROVIDER_ERROR', { cause: error })
    }
    if (!response.ok) {
      const detail = providerMessage(payload)
      const message = detail === undefined
        ? `OpenAI Codex search failed (HTTP ${response.status})`
        : `OpenAI Codex search failed (HTTP ${response.status}): ${detail}`
      throw new WebError(
        response.status === 401 || response.status === 403
          ? `${message}; run "dsh openai-codex login" again`
          : message,
        response.status === 401 || response.status === 403
          ? 'WEB_PROVIDER_CREDENTIAL_MISSING'
          : 'WEB_PROVIDER_ERROR',
      )
    }
    return mapOpenAICodexSearchResponse(payload)
  }
}
