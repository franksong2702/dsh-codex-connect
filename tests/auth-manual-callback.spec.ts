import type { Context } from '@deepseek-ai/cordis'
import type { AuthInteraction } from '@earendil-works/pi-ai'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { Readable } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OpenAICodexWebAuth, OPENAI_CODEX_AUTH_CALLBACK_PATH, OPENAI_CODEX_AUTH_LOGIN_PATH, registerOpenAICodexAuthRoutes } from '../src/auth-routes.ts'
import type { OpenAICodexCredentialStore } from '../src/store.ts'
import type { OpenAICodexTrustedOriginsStore } from '../src/trusted-origins.ts'

const mocked = vi.hoisted(() => ({ login: vi.fn(), status: vi.fn(), logout: vi.fn() }))
vi.mock('../src/auth.ts', () => ({ loginOpenAICodex: mocked.login, openAICodexAuthStatus: mocked.status, logoutOpenAICodex: mocked.logout }))
vi.mock('../src/usage.ts', async original => ({ ...await original<typeof import('../src/usage.ts')>(), readOpenAICodexRateLimits: vi.fn() }))
const store = { captureActiveAccount: async () => ({ accounts: async () => [] }) } as unknown as OpenAICodexCredentialStore
const redirect = 'http://localhost:1455/auth/callback'
const callback = `${redirect}?code=test-code&state=test-state`
function challenge(state = 'test-state') {
  return `https://auth.openai.com/authorize?redirect_uri=${encodeURIComponent(redirect)}&state=${state}`
}
let cleanups: Array<() => Promise<void>> = []
let interaction: AuthInteraction
let manualAbort: AbortController
let received: string | undefined
function manualLogin(url = challenge()) {
  mocked.login.mockImplementation(async (value: AuthInteraction) => {
    interaction = value
    manualAbort = new AbortController()
    value.notify({ type: 'auth_url', url })
    received = await value.prompt({ type: 'manual_code', message: 'Continue', signal: manualAbort.signal })
  })
}
function auth(options = {}) {
  const result = new OpenAICodexWebAuth(store, options)
  cleanups.push(() => result.dispose())
  return result
}
beforeEach(() => {
  vi.resetAllMocks()
  received = undefined
  mocked.status.mockResolvedValue({ authenticated: false })
  mocked.logout.mockResolvedValue(undefined)
  manualLogin()
})
afterEach(async () => {
  for (const cleanup of cleanups) await cleanup()
  cleanups = []
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('manual callback state boundary', () => {
  it('accepts a full URL exactly once without fetching it or waiting for login completion', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    mocked.login.mockImplementation(async (value: AuthInteraction) => {
      value.notify({ type: 'auth_url', url: challenge() })
      received = await value.prompt({ type: 'manual_code', message: 'Continue' })
      // Token exchange remains in flight after the manual response has been accepted.
      await new Promise<void>((_resolve, reject) => {
        value.signal!.addEventListener('abort', () => { reject(value.signal!.reason) }, { once: true })
      })
    })
    const instance = auth()
    expect(instance.submitCallback(callback)).toBe(409)
    await instance.signIn()
    expect(instance.submitCallback(callback)).toBe(200)
    expect(instance.submitCallback(callback)).toBe(409)
    await Promise.resolve()
    expect(received).toBe(callback)
    await expect(instance.status()).resolves.toEqual({ status: 'signing-in' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it.each([
    'test-code', 'test-code#test-state', '/auth/callback?code=test-code&state=test-state',
    callback.replace('http:', 'https:'), callback.replace('localhost', '127.0.0.1'),
    callback.replace(':1455', ':1456'), callback.replace('localhost', 'localhost.evil.invalid'),
    callback.replace('localhost', 'user@localhost'), callback.replace('/auth/', '/other/../auth/'),
    callback.replace('/callback?', '/callback/?'), callback.replace('http://', 'http:\\\\'),
    ` ${callback}`, `${callback}\n`, `${callback}#fragment`,
    `${redirect}?code=test-code`, `${redirect}?state=test-state`, `${redirect}?code=&state=test-state`,
    `${redirect}?code=%20&state=test-state`, `${redirect}?code=test-code&state=`,
    callback.replace('test-state', 'wrong-state'), `${callback}&state=test-state`, `${callback}&code=test-code`,
    `${callback}&%73tate=test-state`, `${callback}&%63ode=test-code`,
    `${callback}&error=access_denied`, `${callback}&error=`, `${callback}&error_description=denied`,
    `${callback}&extra=one&extra=two`,
  ])('rejects invalid input without consuming the pending prompt: %s', async invalid => {
    const instance = auth()
    await instance.signIn()
    expect(instance.submitCallback(invalid)).toBe(400)
    expect(received).toBeUndefined()
    expect(instance.submitCallback(callback)).toBe(200)
  })

  it.each([
    'https://auth.openai.com/authorize',
    `${challenge()}&state=test-state`,
    challenge().replace('state=test-state', 'state='),
    challenge().replace(encodeURIComponent(redirect), encodeURIComponent('https://evil.invalid/callback')),
    `${challenge()}&redirect_uri=${encodeURIComponent(redirect)}`,
  ])('fails closed when the current authorization challenge has invalid state/redirect', async url => {
    manualLogin(url)
    const instance = auth()
    await instance.signIn()
    expect(instance.submitCallback(callback)).toBe(400)
    expect(received).toBeUndefined()
  })

  it.each(['cancel', 'signOut', 'dispose'] as const)('invalidates the prompt synchronously on %s', async action => {
    const instance = auth()
    await instance.signIn()
    const finishing = instance[action]()
    expect(instance.submitCallback(callback)).toBe(409)
    await finishing
    expect(received).toBeUndefined()
    expect(instance.submitCallback(callback)).toBe(409)
  })

  it('invalidates prompt abort and keeps automatic callback completion untouched', async () => {
    const instance = auth()
    await instance.signIn()
    manualAbort.abort()
    expect(instance.submitCallback(callback)).toBe(409)
    await instance.cancel()
  })

  it('times out the manual prompt, then validates a retry against its new state', async () => {
    vi.useFakeTimers()
    const instance = auth({ authorizationTimeoutMs: 20 })
    await instance.signIn()
    await vi.advanceTimersByTimeAsync(21)
    expect(instance.submitCallback(callback)).toBe(409)
    manualLogin(challenge('next-state'))
    await instance.signIn()
    expect(instance.submitCallback(callback)).toBe(400)
    expect(instance.submitCallback(callback.replace('test-state', 'next-state'))).toBe(200)
  })

  it('ignores delayed events and prompts from the previous login after retry', async () => {
    const instance = auth()
    await instance.signIn()
    const old = interaction
    await instance.cancel()
    manualLogin(challenge('next-state'))
    await instance.signIn()
    old.notify({ type: 'auth_url', url: challenge() })
    await expect(old.prompt({ type: 'manual_code', message: 'Old' })).rejects.toThrow()
    expect(instance.submitCallback(callback)).toBe(400)
    expect(instance.submitCallback(callback.replace('test-state', 'next-state'))).toBe(200)
  })

  it('rejects duplicate provider prompts without replacing the first pending prompt', async () => {
    const instance = auth()
    await instance.signIn()
    await expect(interaction.prompt({ type: 'manual_code', message: 'Duplicate' })).rejects.toThrow()
    expect(instance.submitCallback(callback)).toBe(200)
    await expect(interaction.prompt({ type: 'manual_code', message: 'After acceptance' })).rejects.toThrow()
  })

  it('rejects submissions after automatic completion even if provider forgot to abort the manual prompt', async () => {
    let complete!: () => void
    let manual!: Promise<string>
    mocked.login.mockImplementation((value: AuthInteraction) => {
      value.notify({ type: 'auth_url', url: challenge() })
      manual = value.prompt({ type: 'manual_code', message: 'Continue' })
      void manual.catch(() => undefined)
      return new Promise<void>(resolve => { complete = resolve })
    })
    const instance = auth()
    await instance.signIn()
    complete()
    await vi.waitFor(() => { expect(instance.submitCallback('invalid')).toBe(409) })
    await expect(manual).rejects.toThrow('manual callback is unavailable')
  })
})

interface Route { path: string; handler(req: IncomingMessage, res: ServerResponse): void | Promise<void> }
function routes(trusted = false) {
  const result: Route[] = []
  const ctx = {
    webServer: { register: (route: Route) => { result.push(route); return () => undefined } },
    effect: (factory: () => () => Promise<void>) => { cleanups.push(factory()) },
  } as unknown as Context
  registerOpenAICodexAuthRoutes(ctx, store, { has: async () => trusted } as unknown as OpenAICodexTrustedOriginsStore)
  return {
    callback: result.find(route => route.path === OPENAI_CODEX_AUTH_CALLBACK_PATH)!,
    login: result.find(route => route.path === OPENAI_CODEX_AUTH_LOGIN_PATH)!,
  }
}
async function call(route: Route, options: {
  method?: string; headers?: Record<string, string>; body?: string | Uint8Array; streamed?: boolean
} = {}) {
  const bytes = options.body ?? JSON.stringify({ callbackUrl: callback })
  const req = Object.assign(options.streamed ? Readable.from([bytes]) : { body: bytes }, {
    method: options.method ?? 'POST',
    headers: { host: 'localhost:3080', origin: 'http://localhost:3080', 'content-type': 'application/json', ...options.headers },
    socket: { remoteAddress: '127.0.0.1' },
  }) as unknown as IncomingMessage
  const result = { status: 0, headers: {} as Record<string, string>, body: '' }
  const res = {
    writeHead: (status: number, headers: Record<string, string>) => { result.status = status; result.headers = headers },
    end: (body: string) => { result.body = body },
  } as unknown as ServerResponse
  await route.handler(req, res)
  expect(result.headers['cache-control']).toBe('no-store')
  expect(result.body).not.toContain('test-code')
  expect(result.body).not.toContain('test-state')
  expect(result.body).not.toContain(redirect)
  return result
}

describe('manual callback HTTP boundary', () => {
  it('returns immediately on acceptance while the client continues polling existing status', async () => {
    const endpoints = routes()
    // Login itself intentionally returns its authorization URL; do not pass through the callback secrecy assertion.
    const loginReq = { method: 'POST', headers: { host: 'localhost:3080' }, socket: { remoteAddress: '127.0.0.1' } } as unknown as IncomingMessage
    await endpoints.login.handler(loginReq, { writeHead: () => undefined, end: () => undefined } as unknown as ServerResponse)
    expect((await call(endpoints.callback, { body: JSON.stringify({ callbackUrl: callback.replace('test-state', 'wrong') }) })).status).toBe(400)
    expect((await call(endpoints.callback, { body: '{' })).status).toBe(400)
    const result = await call(endpoints.callback, { streamed: true })
    expect(result.status).toBe(200)
    expect(JSON.parse(result.body)).toEqual({ ok: true })
    expect((await call(endpoints.callback)).status).toBe(409)
  })

  it.each(['GET', 'PUT', 'DELETE', 'OPTIONS'])('rejects method %s', async method => {
    expect((await call(routes().callback, { method })).status).toBe(405)
  })

  it.each([
    { origin: 'https://evil.invalid' }, { 'sec-fetch-site': 'cross-site' },
    { host: 'remote.example:3080', origin: 'http://remote.example:3080' },
  ])('rejects untrusted origin metadata %j', async headers => {
    expect((await call(routes().callback, { headers })).status).toBe(403)
  })

  it('accepts trusted remote-origin requests but rejects mismatched Origin even when trusted', async () => {
    const endpoint = routes(true).callback
    expect((await call(endpoint, { headers: { host: 'remote.example:3080', origin: 'http://remote.example:3080' } })).status).toBe(409)
    expect((await call(endpoint, { headers: { host: 'remote.example:3080', origin: 'http://other.example:3080' } })).status).toBe(403)
  })

  it.each(['text/plain', 'application/x-www-form-urlencoded', 'application/jsonp', ''])('rejects content type %s', async contentType => {
    expect((await call(routes().callback, { headers: { 'content-type': contentType } })).status).toBe(415)
  })

  it.each(['', '{', 'null', '[]', '{}', '{"callbackUrl":1}', '{"callbackUrl":"a","extra":true}'])('rejects malformed JSON/body %s', async body => {
    expect((await call(routes().callback, { body })).status).toBe(400)
  })

  it('rejects invalid UTF-8 and invalid or oversized content lengths', async () => {
    const endpoint = routes().callback
    expect((await call(endpoint, { body: new Uint8Array([0xff]), streamed: true })).status).toBe(400)
    expect((await call(endpoint, { headers: { 'content-length': '-1' } })).status).toBe(400)
    expect((await call(endpoint, { headers: { 'content-length': '4097' } })).status).toBe(413)
  })

  it.each([false, true])('bounds actual body bytes (streamed=%s)', async streamed => {
    expect((await call(routes().callback, { body: 'x'.repeat(4097), streamed })).status).toBe(413)
  })
})
