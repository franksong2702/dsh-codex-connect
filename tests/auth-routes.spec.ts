import type { Context } from '@deepseek-ai/cordis'
import type { AuthInteraction } from '@earendil-works/pi-ai'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  OPENAI_CODEX_AUTH_LOGIN_PATH,
  OPENAI_CODEX_AUTH_LOGOUT_PATH,
  OpenAICodexWebAuth,
  OPENAI_CODEX_AUTH_STATUS_PATH,
  REMOTE_WEB_ORIGIN_NOT_TRUSTED,
  registerOpenAICodexAuthRoutes,
  trustedRequestDecision,
} from '../src/auth-routes.ts'
import type { OpenAICodexCredentialStore } from '../src/store.ts'
import { OpenAICodexTrustedOriginsStore } from '../src/trusted-origins.ts'
import {
  OPENAI_CODEX_REAUTH_REQUIRED_MESSAGE,
  OpenAICodexReauthRequiredError,
} from '../src/usage.ts'

const mocked = vi.hoisted(() => ({
  login: vi.fn(),
  logout: vi.fn(),
  status: vi.fn(),
  usage: vi.fn(),
}))

vi.mock('../src/auth.ts', () => ({
  loginOpenAICodex: mocked.login,
  logoutOpenAICodex: mocked.logout,
  openAICodexAuthStatus: mocked.status,
}))

vi.mock('../src/usage.ts', async importOriginal => ({
  ...await importOriginal<typeof import('../src/usage.ts')>(),
  readOpenAICodexRateLimits: mocked.usage,
}))

const store = {} as OpenAICodexCredentialStore
const emptyTrustedOrigins = {
  has: async () => false,
} as unknown as OpenAICodexTrustedOriginsStore
let root: string | undefined

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function abortableLogin(interaction: AuthInteraction): Promise<void> {
  return new Promise<void>((_resolve, reject) => {
    const signal = interaction.signal
    if (signal === undefined) return reject(new Error('test login requires a cancellation signal'))
    if (signal.aborted) return reject(signal.reason)
    signal.addEventListener('abort', () => { reject(signal.reason) }, { once: true })
  })
}

interface CapturedRoute {
  path: string
  handler(req: IncomingMessage, res: ServerResponse): Promise<void> | void
}

function captureRoutes(trustedOrigins: OpenAICodexTrustedOriginsStore = emptyTrustedOrigins): CapturedRoute[] {
  const routes: CapturedRoute[] = []
  const ctx = {
    webServer: {
      register(route: CapturedRoute) {
        routes.push(route)
        return () => undefined
      },
    },
    effect(factory: () => void | (() => void | Promise<void>)) {
      return factory()
    },
  } as unknown as Context
  registerOpenAICodexAuthRoutes(ctx, store, trustedOrigins)
  return routes
}

function request(options: {
  method?: string
  remoteAddress?: string
  host?: string
  origin?: string
  fetchSite?: string
}): IncomingMessage {
  return {
    method: options.method ?? 'GET',
    socket: { remoteAddress: options.remoteAddress ?? '127.0.0.1' },
    headers: {
      host: options.host ?? '127.0.0.1:3081',
      ...options.origin === undefined ? {} : { origin: options.origin },
      ...options.fetchSite === undefined ? {} : { 'sec-fetch-site': options.fetchSite },
    },
  } as unknown as IncomingMessage
}

function response(): ServerResponse & { observed: { status: number | undefined; body: string | undefined } } {
  const observed: { status: number | undefined; body: string | undefined } = { status: undefined, body: undefined }
  return {
    observed,
    writeHead(status: number) {
      observed.status = status
      return this
    },
    end(body?: string) {
      observed.body = body
      return this
    },
  } as unknown as ServerResponse & { observed: { status: number | undefined; body: string | undefined } }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocked.status.mockResolvedValue({ authenticated: false })
  mocked.logout.mockResolvedValue(undefined)
  mocked.usage.mockResolvedValue({ rateLimits: [] })
})

afterEach(async () => {
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

describe('OpenAI Codex Web OAuth boundary', () => {
  it('returns a stable remote-origin error until the exact effective origin is trusted', async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-auth-routes-'))
    const origins = new OpenAICodexTrustedOriginsStore(join(root, '.openai-codex-trusted-origins.json'))
    const remote = request({
      remoteAddress: '192.168.1.8',
      host: '192.168.1.20:3081',
      origin: 'http://192.168.1.20:3081',
      fetchSite: 'same-origin',
    })
    await expect(trustedRequestDecision(remote, origins)).resolves.toEqual({
      trusted: false,
      error: REMOTE_WEB_ORIGIN_NOT_TRUSTED,
    })

    await origins.trust('http://192.168.1.20:3081')
    await expect(trustedRequestDecision(remote, origins)).resolves.toEqual({ trusted: true })
    await expect(trustedRequestDecision(request({
      remoteAddress: '192.168.1.8',
      host: '192.168.1.20:3081',
      origin: 'http://192.168.1.20:3082',
      fetchSite: 'same-origin',
    }), origins)).resolves.toEqual({ trusted: false, error: 'forbidden' })
    await expect(trustedRequestDecision(request({
      remoteAddress: '192.168.1.8',
      host: '192.168.1.20:3081',
      origin: 'http://192.168.1.20:3081',
      fetchSite: 'cross-site',
    }), origins)).resolves.toEqual({ trusted: false, error: 'forbidden' })
  })

  it.each([
    ['status', OPENAI_CODEX_AUTH_STATUS_PATH, 'GET'],
    ['login', OPENAI_CODEX_AUTH_LOGIN_PATH, 'POST'],
    ['logout', OPENAI_CODEX_AUTH_LOGOUT_PATH, 'POST'],
  ] as const)('applies the remote-origin boundary to %s', async (_label, path, method) => {
    const route = captureRoutes().find(candidate => candidate.path === path)
    if (route === undefined) throw new Error(`${path} route was not registered`)
    const res = response()

    await route.handler(request({
      method,
      remoteAddress: '192.168.1.8',
      host: '192.168.1.20:3081',
      origin: 'http://192.168.1.20:3081',
      fetchSite: 'same-origin',
    }), res)

    expect(res.observed.status).toBe(403)
    expect(JSON.parse(res.observed.body ?? 'null')).toEqual({ error: REMOTE_WEB_ORIGIN_NOT_TRUSTED })
    expect(mocked.status).not.toHaveBeenCalled()
    expect(mocked.login).not.toHaveBeenCalled()
    expect(mocked.logout).not.toHaveBeenCalled()
  })

  it('rejects a DNS-rebinding Host even when the peer and browser Origin agree', async () => {
    const route = captureRoutes().find(candidate => candidate.path === OPENAI_CODEX_AUTH_STATUS_PATH)
    if (route === undefined) throw new Error('status route was not registered')
    const res = response()

    await route.handler(request({
      host: 'attacker.example:3081',
      origin: 'http://attacker.example:3081',
      fetchSite: 'same-origin',
    }), res)

    expect(res.observed.status).toBe(403)
  })

  it.each([
    ['non-loopback peer', { remoteAddress: '192.168.1.8' }],
    ['cross-site browser request', { fetchSite: 'cross-site', origin: 'http://127.0.0.1:3081' }],
    ['different Origin port', { origin: 'http://127.0.0.1:9999', fetchSite: 'same-origin' }],
    ['different Origin scheme', { origin: 'https://127.0.0.1:3081', fetchSite: 'same-origin' }],
  ])('rejects %s', async (_label, options) => {
    const route = captureRoutes().find(candidate => candidate.path === OPENAI_CODEX_AUTH_STATUS_PATH)
    if (route === undefined) throw new Error('status route was not registered')
    const res = response()

    await route.handler(request(options), res)

    expect(res.observed.status).toBe(403)
  })

  it.each([
    ['numeric loopback with exact Origin', { origin: 'http://127.0.0.1:3081', fetchSite: 'same-origin' }],
    ['localhost with exact Origin', { host: 'localhost:3081', origin: 'http://localhost:3081', fetchSite: 'same-origin' }],
    ['local client without browser Origin', {}],
  ])('accepts %s', async (_label, options) => {
    const route = captureRoutes().find(candidate => candidate.path === OPENAI_CODEX_AUTH_STATUS_PATH)
    if (route === undefined) throw new Error('status route was not registered')
    const res = response()

    await route.handler(request(options), res)

    expect(res.observed.status).toBe(200)
    expect(mocked.status).toHaveBeenCalled()
  })

  it('reuses one login operation and one HTTPS challenge across concurrent callers', async () => {
    const completion = deferred<void>()
    let interaction: AuthInteraction | undefined
    mocked.login.mockImplementation((next: AuthInteraction) => {
      interaction = next
      return completion.promise
    })
    const auth = new OpenAICodexWebAuth(store)

    const first = auth.signIn()
    const second = auth.signIn()
    expect(mocked.login).toHaveBeenCalledOnce()
    if (interaction === undefined) throw new Error('login interaction was not captured')
    interaction.notify({ type: 'auth_url', url: 'https://auth.openai.com/authorize' })

    await expect(Promise.all([first, second])).resolves.toEqual([
      { url: 'https://auth.openai.com/authorize' },
      { url: 'https://auth.openai.com/authorize' },
    ])
    await expect(auth.signIn()).resolves.toEqual({ url: 'https://auth.openai.com/authorize' })
    expect(mocked.login).toHaveBeenCalledOnce()
    completion.resolve()
    await completion.promise
    await auth.dispose()
  })

  it('rejects an unsafe authorization URL and cancels the provider login', async () => {
    let observedSignal: AbortSignal | undefined
    mocked.login.mockImplementation((interaction: AuthInteraction) => {
      observedSignal = interaction.signal
      const pending = abortableLogin(interaction)
      interaction.notify({ type: 'auth_url', url: 'http://auth.openai.com/authorize' })
      return pending
    })
    const auth = new OpenAICodexWebAuth(store)

    await expect(auth.signIn()).rejects.toThrow(/unsafe authorization URL/u)
    expect(observedSignal?.aborted).toBe(true)
    await auth.dispose()
  })

  it('logout cancels an in-flight login, rejects its waiter, and deletes the credential', async () => {
    let observedSignal: AbortSignal | undefined
    mocked.login.mockImplementation((interaction: AuthInteraction) => {
      observedSignal = interaction.signal
      return abortableLogin(interaction)
    })
    const auth = new OpenAICodexWebAuth(store)
    const challenge = auth.signIn()

    await auth.signOut()

    await expect(challenge).rejects.toThrow(/sign-in cancelled/u)
    expect(observedSignal?.aborted).toBe(true)
    expect(mocked.logout).toHaveBeenCalledWith(store)
    await expect(auth.status()).resolves.toEqual({ status: 'signed-out' })
  })

  it('dispose cancels the login and settles every pending challenge waiter', async () => {
    let observedSignal: AbortSignal | undefined
    mocked.login.mockImplementation((interaction: AuthInteraction) => {
      observedSignal = interaction.signal
      return abortableLogin(interaction)
    })
    const auth = new OpenAICodexWebAuth(store)
    const first = auth.signIn()
    const second = auth.signIn()

    await auth.dispose()

    await expect(first).rejects.toThrow(/plugin disposed/u)
    await expect(second).rejects.toThrow(/plugin disposed/u)
    expect(observedSignal?.aborted).toBe(true)
  })

  it('settles signIn when the provider finishes without an auth_url event', async () => {
    mocked.login.mockResolvedValue(undefined)
    const auth = new OpenAICodexWebAuth(store)
    const outcome = await Promise.race([
      auth.signIn().then(() => 'resolved', () => 'rejected'),
      new Promise<'pending'>(resolve => { setTimeout(() => { resolve('pending') }, 20) }),
    ])

    expect(outcome).toBe('rejected')
    await auth.dispose()
  })

  it('times out waiting for auth_url and cancels the provider operation', async () => {
    let observedSignal: AbortSignal | undefined
    mocked.login.mockImplementation((interaction: AuthInteraction) => {
      observedSignal = interaction.signal
      return abortableLogin(interaction)
    })
    const auth = new OpenAICodexWebAuth(store, { challengeTimeoutMs: 5 })

    await expect(auth.signIn()).rejects.toThrow(/did not provide an authorization URL/u)
    expect(observedSignal?.aborted).toBe(true)
    await auth.dispose()
  })

  it('reports reauth-required without logging out or starting OAuth', async () => {
    mocked.status.mockResolvedValue({ authenticated: true })
    mocked.usage.mockRejectedValue(new OpenAICodexReauthRequiredError())
    const auth = new OpenAICodexWebAuth(store)

    await expect(auth.status()).resolves.toEqual({
      status: 'reauth-required',
      message: OPENAI_CODEX_REAUTH_REQUIRED_MESSAGE,
    })
    expect(mocked.logout).not.toHaveBeenCalled()
    expect(mocked.login).not.toHaveBeenCalled()
  })

  it('keeps signed-in quotaError fallback for temporary usage failures', async () => {
    mocked.status.mockResolvedValue({ authenticated: true })
    mocked.usage.mockRejectedValue(new Error('OpenAI Codex usage request failed with HTTP 503'))
    const auth = new OpenAICodexWebAuth(store)

    await expect(auth.status()).resolves.toEqual({
      status: 'signed-in',
      usage: { rateLimits: [] },
      quotaError: 'OpenAI Codex usage request failed with HTTP 503',
    })
    expect(mocked.logout).not.toHaveBeenCalled()
  })
})
