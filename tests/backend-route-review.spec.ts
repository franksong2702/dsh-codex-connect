import { Context } from '@deepseek-ai/cordis'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OpenAICodexBackendRequests } from '../src/backend-request.ts'
import { OpenAICodexSearchProvider } from '../src/search.ts'
import { OpenAICodexTransport } from '../src/transport.ts'
import { OpenAICodexQuotaState } from '../src/quota-state.ts'
import type { OpenAICodexCredentialStore } from '../src/store.ts'

const { auth } = vi.hoisted(() => ({ auth: vi.fn() }))
vi.mock('../src/auth.ts', async original => ({ ...await original<typeof import('../src/auth.ts')>(), readOpenAICodexRequestAuth: auth }))
const token = 'header.' + Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: 'fixture' } })).toString('base64url') + '.signature'
const credentials = { captureActiveAccount: async () => credentials, read: async () => ({ type: 'oauth', access: token, accountId: 'fixture' }) } as unknown as OpenAICodexCredentialStore
const proxy = { run: <T>(_url: unknown, operation: () => T) => operation() }
let requests: OpenAICodexBackendRequests
let occupied: Response
let context: Context | undefined
const endpoint = 'https://chatgpt.com/backend-api/codex/responses'
beforeEach(async () => {
  vi.useFakeTimers(); vi.setSystemTime(0)
  auth.mockResolvedValue({ access: token, accountId: 'fixture' })
  requests = new OpenAICodexBackendRequests(undefined, () => undefined, 1)
  occupied = await requests.wrapFetch({ lane: 'model', fetch: async () => new Response(new ReadableStream<Uint8Array>()) })(endpoint)
  vi.stubGlobal('fetch', vi.fn(async () => { throw Error('No provider call is permitted in queued tests') }))
})
afterEach(async () => {
  requests.dispose(); await occupied.body?.cancel().catch(() => undefined)
  await context?.fiber.dispose(); context = undefined
  vi.unstubAllGlobals(); vi.useRealTimers(); vi.restoreAllMocks()
})
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve() }

describe('managed route queue contracts', () => {
  it('retains WEB_ABORTED when a search is cancelled in the shared queue', async () => {
    const provider = new OpenAICodexSearchProvider({ credentials, model: 'fixture', mode: 'cached', contextSize: 'low', maxOutputTokens: 10, resolveRequestId: () => 'fixture', backendRequests: requests })
    const controller = new AbortController()
    const pending = provider.search({ query: 'fixture' }, controller.signal).catch(error => error)
    await flush(); controller.abort()
    expect(await pending).toMatchObject({ code: 'WEB_ABORTED' })
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('includes queue time in the image deadline and returns the image timeout code', async () => {
    context = new Context()
    let service!: OpenAICodexTransport
    await context.plugin(ctx => { service = new OpenAICodexTransport(ctx, credentials, undefined, undefined, undefined, requests) })
    const pending = service.generateImages({ prompt: 'synthetic fixture' }, {}).catch(error => error)
    await flush()
    await vi.advanceTimersByTimeAsync(120_000)
    expect(await pending).toMatchObject({ code: 'OPENAI_CODEX_TIMEOUT' })
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('bounds a shared quota read while it waits for a backend slot', async () => {
    const quota = new OpenAICodexQuotaState({ credentials, proxyManager: proxy as never, enabled: () => false, resolveProxyUrl: () => undefined, backendRequests: requests })
    const pending = quota.read().catch(error => error)
    await flush()
    await vi.advanceTimersByTimeAsync(15_000)
    expect(await pending).toBeInstanceOf(Error)
    expect(globalThis.fetch).not.toHaveBeenCalled()
    await quota.dispose()
  })
})
