/** Shared, secret-free request policy for chatgpt.com/backend-api traffic. */
import { randomUUID } from 'node:crypto'
import { readRetryAfterMs } from './request-backoff.ts'

export const OPENAI_CODEX_BACKEND_ORIGIN = 'https://chatgpt.com'
export const OPENAI_CODEX_BACKEND_PATH_PREFIX = '/backend-api/'
export const OPENAI_CODEX_PLUGIN_ORIGINATOR = 'deepseek-harness'
export const OPENAI_CODEX_PLUGIN_USER_AGENT = 'dsh-codex-connect'

export type OpenAICodexBackendIdentity = 'plugin' | 'preserve' | 'probe'

export interface OpenAICodexBackendResponseMeta {
  readonly clientRequestId: string
  readonly httpStatus: number
  readonly httpRequestId?: string
  readonly retryAfterMs?: number
}

function requestUrl(input: string | URL | Request): URL {
  if (input instanceof URL) return new URL(input.href)
  if (input instanceof Request) return new URL(input.url)
  return new URL(input)
}

/** Fail closed before credentials can be sent to a non-Codex origin. */
export function assertOpenAICodexBackendUrl(input: string | URL | Request): void {
  const url = requestUrl(input)
  if (url.username !== '' || url.password !== '' || url.origin !== OPENAI_CODEX_BACKEND_ORIGIN
    || !url.pathname.startsWith(OPENAI_CODEX_BACKEND_PATH_PREFIX)) {
    throw new TypeError('OpenAI Codex backend request must target chatgpt.com/backend-api')
  }
}

/** Snapshot mutable routing inputs before any queue wait; never follow authenticated redirects. */
export function prepareOpenAICodexBackendRequest(input: string | URL | Request, init?: RequestInit): {
  input: string | Request; init: RequestInit
} {
  const target = input instanceof URL ? input.href : input
  assertOpenAICodexBackendUrl(target)
  const request = target instanceof Request ? target : undefined
  const redirect = init?.redirect ?? request?.redirect
  return { input: target, init: {
    ...init,
    headers: new Headers(init?.headers ?? request?.headers),
    signal: init?.signal ?? request?.signal ?? null,
    redirect: redirect === 'manual' ? 'manual' : 'error',
  } }
}

/** Accept only compact request ids; never retain token-shaped values. */
export function safeOpenAICodexRequestId(value: unknown): string | undefined {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u.test(value)
    && !/^(?:eyJ|sk-|Bearer)/iu.test(value) ? value : undefined
}

/** Apply an honest plugin identity and a fresh per-attempt correlation id. */
export function prepareOpenAICodexBackendHeaders(
  initial: HeadersInit | undefined,
  identity: OpenAICodexBackendIdentity,
  clientRequestId: string = randomUUID(),
): { headers: Headers; clientRequestId: string } {
  const headers = new Headers(initial)
  headers.set('x-client-request-id', clientRequestId)
  if (identity === 'plugin') {
    headers.set('originator', OPENAI_CODEX_PLUGIN_ORIGINATOR)
    headers.set('user-agent', OPENAI_CODEX_PLUGIN_USER_AGENT)
  } else if (identity === 'probe') {
    headers.set('user-agent', OPENAI_CODEX_PLUGIN_USER_AGENT)
  }
  return { headers, clientRequestId }
}

/** Project one response into bounded correlation metadata. */
export function openAICodexBackendResponseMeta(
  response: Response,
  clientRequestId: string,
): OpenAICodexBackendResponseMeta {
  const id = safeOpenAICodexRequestId(response.headers.get('x-request-id'))
    ?? safeOpenAICodexRequestId(response.headers.get('request-id'))
  const retry = readRetryAfterMs(response.headers)
  return {
    clientRequestId,
    httpStatus: response.status,
    ...(id === undefined ? {} : { httpRequestId: id }),
    ...(retry === undefined || !Number.isFinite(retry) ? {} : { retryAfterMs: retry }),
  }
}
