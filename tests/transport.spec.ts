import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { OAuthCredential } from '@earendil-works/pi-ai'
import { Context } from '@deepseek-ai/cordis'
import {
  OPENAI_CODEX_IMAGE_GENERATION_URL,
  OPENAI_CODEX_IMAGE_MAX_RESPONSE_BYTES,
  OPENAI_CODEX_IMAGE_REQUEST_TIMEOUT_MS,
  OPENAI_CODEX_TRANSPORT_ERROR_CODES,
  OpenAICodexTransport,
  isOpenAICodexTransportError,
  readOpenAICodexBoundedBody,
} from '../src/transport.ts'
import { OpenAICodexCredentialStore, OPENAI_CODEX_PROVIDER } from '../src/store.ts'

let root: string | undefined
let context: Context | undefined

afterEach(async () => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  await context?.fiber.dispose()
  context = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

function jsonResponse(value: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })
}

async function credentialStore(authenticated = true): Promise<OpenAICodexCredentialStore> {
  root = await mkdtemp(join(tmpdir(), 'dsh-codex-connect-transport-'))
  const store = new OpenAICodexCredentialStore(join(root, 'auth.json'))
  if (authenticated) {
    const credential: OAuthCredential = {
      type: 'oauth',
      access: 'access-secret',
      refresh: 'refresh-secret',
      expires: Date.now() + 3_600_000,
      accountId: 'account-1',
    }
    await store.modify(OPENAI_CODEX_PROVIDER, () => Promise.resolve(credential))
  }
  return store
}

async function transport(authenticated = true): Promise<OpenAICodexTransport> {
  const store = await credentialStore(authenticated)
  const ctx = new Context()
  context = ctx
  let service: OpenAICodexTransport | undefined
  await ctx.plugin((pluginCtx) => {
    service = new OpenAICodexTransport(pluginCtx, store)
  })
  if (service === undefined) throw new Error('transport service did not start')
  return service
}

function expectCode(error: unknown, code: string): void {
  expect(isOpenAICodexTransportError(error)).toBe(true)
  expect(error).toMatchObject({ code })
}

describe('OpenAI Codex image transport', () => {
  it('sends one fixed request and returns a secret-free structured response', async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => (
      jsonResponse({ data: [{ b64_json: 'aGVsbG8=' }] })
    ))
    vi.stubGlobal('fetch', fetchMock)

    const result = await (await transport()).generateImages({ prompt: 'draw a blue square' }, {})

    expect(result).toMatchObject({
      apiVersion: 1,
      images: [{ b64Json: 'aGVsbG8=' }],
    })
    expect(result.traceId).toMatch(/^[0-9a-f-]{36}$/u)
    expect(result.responseBytes).toBeGreaterThan(0)
    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0] ?? []
    expect(url).toBe(OPENAI_CODEX_IMAGE_GENERATION_URL)
    expect(init).toMatchObject({ method: 'POST', redirect: 'manual' })
    expect(JSON.parse(String(init?.body))).toEqual({ model: 'gpt-image-2', prompt: 'draw a blue square' })
    expect(Object.keys(JSON.parse(String(init?.body)))).toEqual(['model', 'prompt'])
    const headers = new Headers(init?.headers)
    expect(headers.get('authorization')).toBe('Bearer access-secret')
    expect(headers.get('chatgpt-account-id')).toBe('account-1')
    expect(JSON.stringify(result)).not.toContain('account-1')
    expect(JSON.stringify(result)).not.toContain('access-secret')
  })

  it.each(['', '   ', 'x'.repeat(32_001)])('rejects an invalid prompt before dispatch', async prompt => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const failure = await (await transport()).generateImages({ prompt }, {}).catch((error: unknown) => error)
    expectCode(failure, OPENAI_CODEX_TRANSPORT_ERROR_CODES.invalidRequest)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('classifies a signed-out store without dispatch', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const failure = await (await transport(false)).generateImages({ prompt: 'test' }, {}).catch((error: unknown) => error)
    expectCode(failure, OPENAI_CODEX_TRANSPORT_ERROR_CODES.signedOut)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([401, 403])('classifies HTTP %s as reauthorization required without leaking body data', async status => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ token: 'upstream-secret' }, status)))
    const failure = await (await transport()).generateImages({ prompt: 'full private prompt' }, {})
      .catch((error: unknown) => error)
    expectCode(failure, OPENAI_CODEX_TRANSPORT_ERROR_CODES.reauthRequired)
    for (const secret of ['upstream-secret', 'access-secret', 'refresh-secret', 'account-1', 'full private prompt']) {
      expect(String(failure)).not.toContain(secret)
      expect(JSON.stringify(failure)).not.toContain(secret)
    }
  })

  it('classifies rate limits, validates retry-after, and never retries', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ error: 'limited' }, 429, { 'retry-after': '30' }))
    vi.stubGlobal('fetch', fetchMock)
    const failure = await (await transport()).generateImages({ prompt: 'test' }, {}).catch((error: unknown) => error)
    expectCode(failure, OPENAI_CODEX_TRANSPORT_ERROR_CODES.rateLimited)
    expect(failure).toMatchObject({ status: 429, retryAfterSeconds: 30 })
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it.each([
    [400, 'upstreamRejected'],
    [503, 'upstreamUnavailable'],
    [302, 'redirectRejected'],
  ] as const)('classifies HTTP %s without retrying', async (status, code) => {
    const fetchMock = vi.fn(async () => new Response(null, { status }))
    vi.stubGlobal('fetch', fetchMock)
    const failure = await (await transport()).generateImages({ prompt: 'test' }, {}).catch((error: unknown) => error)
    expectCode(failure, OPENAI_CODEX_TRANSPORT_ERROR_CODES[code])
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('propagates caller cancellation without dispatch when already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const failure = await (await transport()).generateImages({ prompt: 'test' }, { signal: controller.signal })
      .catch((error: unknown) => error)
    expectCode(failure, OPENAI_CODEX_TRANSPORT_ERROR_CODES.canceled)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('forwards caller cancellation while a request is in flight', async () => {
    const service = await transport()
    const controller = new AbortController()
    let enteredFetch: (() => void) | undefined
    const entered = new Promise<void>((resolve) => { enteredFetch = resolve })
    vi.stubGlobal('fetch', vi.fn((_url: unknown, init?: RequestInit) => {
      enteredFetch?.()
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true })
      })
    }))
    const pending = service.generateImages({ prompt: 'test' }, { signal: controller.signal })
      .catch((error: unknown) => error)
    await entered
    controller.abort()
    const failure = await pending
    expectCode(failure, OPENAI_CODEX_TRANSPORT_ERROR_CODES.canceled)
  })

  it('classifies its bounded deadline as a timeout', async () => {
    const service = await transport()
    vi.useFakeTimers()
    let enteredFetch: (() => void) | undefined
    const entered = new Promise<void>((resolve) => { enteredFetch = resolve })
    vi.stubGlobal('fetch', vi.fn((_url: unknown, init?: RequestInit) => {
      enteredFetch?.()
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true })
      })
    }))
    const pending = service.generateImages({ prompt: 'test' }, {}).catch((error: unknown) => error)
    await entered
    await vi.advanceTimersByTimeAsync(OPENAI_CODEX_IMAGE_REQUEST_TIMEOUT_MS)
    const failure = await pending
    expectCode(failure, OPENAI_CODEX_TRANSPORT_ERROR_CODES.timeout)
  })

  it('rejects declared and streamed success bodies beyond the hard limit', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'content-length': String(OPENAI_CODEX_IMAGE_MAX_RESPONSE_BYTES + 1),
      },
    })))
    const failure = await (await transport()).generateImages({ prompt: 'test' }, {}).catch((error: unknown) => error)
    expectCode(failure, OPENAI_CODEX_TRANSPORT_ERROR_CODES.responseTooLarge)

    const streamed = new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(4))
        controller.enqueue(new Uint8Array(4))
        controller.close()
      },
    }))
    await expect(readOpenAICodexBoundedBody(streamed, 7)).rejects.toMatchObject({
      code: OPENAI_CODEX_TRANSPORT_ERROR_CODES.responseTooLarge,
    })
  })

  it.each([
    new Response('<html>', { headers: { 'content-type': 'text/html' } }),
    jsonResponse({}),
    jsonResponse({ data: [] }),
    jsonResponse({ data: [{}] }),
    jsonResponse({ data: [{ b64_json: '' }] }),
    jsonResponse({ data: Array.from({ length: 5 }, () => ({ b64_json: 'aA==' })) }),
  ])('rejects malformed success responses', async response => {
    vi.stubGlobal('fetch', vi.fn(async () => response.clone()))
    const failure = await (await transport()).generateImages({ prompt: 'test' }, {}).catch((error: unknown) => error)
    expectCode(failure, OPENAI_CODEX_TRANSPORT_ERROR_CODES.malformedResponse)
  })
})
