import http, { type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { EventEmitter } from 'node:events'
import { createHash } from 'node:crypto'
import { syncBuiltinESMExports } from 'node:module'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { OpenAICodexWebAuth } from '../src/auth-routes.ts'
import { OpenAICodexCredentialStore, OPENAI_CODEX_PROVIDER } from '../src/store.ts'
import { OPENAI_CODEX_USAGE_URL } from '../src/usage.ts'

let cleanup: (() => Promise<void>) | undefined

afterEach(async () => {
  await cleanup?.()
  cleanup = undefined
  vi.restoreAllMocks()
  syncBuiltinESMExports()
  vi.unstubAllGlobals()
})

/** Real pi-ai/vendored OAuth flow, with synthetic tokens and no sockets or external requests. */
async function fixture(portUnavailable = false) {
  const root = await mkdtemp(join(tmpdir(), 'codex-manual-oauth-'))
  let callback!: (req: IncomingMessage, res: ServerResponse) => void
  let closed = 0
  class CallbackServer extends EventEmitter {
    listen(_port: number, _host: string, ready: () => void) {
      queueMicrotask(() => portUnavailable ? this.emit('error', new Error('fixture port unavailable')) : ready())
      return this
    }
    close(done?: () => void) { closed++; done?.(); return this }
    closeAllConnections() { return this }
  }
  vi.spyOn(http, 'createServer').mockImplementation((handler: any) => {
    callback = handler
    return new CallbackServer() as unknown as Server
  })
  syncBuiltinESMExports()
  const payload = Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: 'fixture-manual-account' } })).toString('base64url')
  const access = `eyJhbGciOiJub25lIn0.${payload}.fixture`
  const tokenRequests: URLSearchParams[] = []
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    if (String(input) === 'https://auth.openai.com/oauth/token') {
      tokenRequests.push(new URLSearchParams(init?.body as URLSearchParams))
      return Response.json({ access_token: access, refresh_token: 'fixture-refresh', expires_in: 3600 })
    }
    if (String(input) === OPENAI_CODEX_USAGE_URL) return Response.json({})
    throw new Error('Unexpected request in fixture OAuth flow')
  })
  vi.stubGlobal('fetch', fetchMock)
  const store = new OpenAICodexCredentialStore(join(root, 'auth.json'))
  const auth = new OpenAICodexWebAuth(store)
  cleanup = async () => { await auth.dispose(); await rm(root, { recursive: true, force: true }) }
  const challenge = new URL((await auth.signIn()).url)
  const url = new URL(challenge.searchParams.get('redirect_uri')!)
  url.searchParams.set('state', challenge.searchParams.get('state')!)
  url.searchParams.set('code', 'fixture-authorization-code')
  return { auth, store, challenge, url, tokenRequests, fetchMock, closed: () => closed, automatic: () => {
    const res = { statusCode: 0, setHeader: vi.fn(), end: vi.fn() }
    callback({ url: `${url.pathname}${url.search}` } as IncomingMessage, res as unknown as ServerResponse)
    expect(res.statusCode).toBe(200)
  } }
}

it.each([false, true])('completes the real provider manual flow with PKCE (port unavailable: %s)', async portUnavailable => {
  const { auth, store, challenge, url, tokenRequests, fetchMock, closed } = await fixture(portUnavailable)
  const invalid = new URL(url)
  invalid.searchParams.delete('state')
  expect(auth.submitCallback(invalid.href)).toBe(400)
  invalid.searchParams.set('state', 'fixture-unrelated-state')
  expect(auth.submitCallback(invalid.href)).toBe(400)
  expect(tokenRequests).toHaveLength(0)
  expect(auth.submitCallback(url.href)).toBe(200)
  expect(auth.submitCallback(url.href)).toBe(409)
  await vi.waitFor(async () => expect(await store.read(OPENAI_CODEX_PROVIDER)).toMatchObject({ accountId: 'fixture-manual-account' }))
  await vi.waitFor(() => expect(closed()).toBe(1))
  expect(tokenRequests).toHaveLength(1)
  const body = tokenRequests[0]!
  expect(body.get('code')).toBe('fixture-authorization-code')
  expect(body.get('grant_type')).toBe('authorization_code')
  expect(body.get('redirect_uri')).toBe('http://localhost:1455/auth/callback')
  expect(body.get('code_verifier')).toBeTruthy()
  expect(createHash('sha256').update(body.get('code_verifier')!).digest('base64url')).toBe(challenge.searchParams.get('code_challenge'))
  expect(fetchMock.mock.calls.every(([input]) => String(input) === 'https://auth.openai.com/oauth/token' || String(input) === OPENAI_CODEX_USAGE_URL)).toBe(true)
  expect(JSON.stringify(await auth.status())).not.toContain('fixture-authorization-code')
})

it('keeps automatic callback login working and closes the unused manual prompt', async () => {
  const { auth, store, url, automatic, tokenRequests, closed } = await fixture()
  automatic()
  await vi.waitFor(async () => expect(await store.read(OPENAI_CODEX_PROVIDER)).toMatchObject({ accountId: 'fixture-manual-account' }))
  await vi.waitFor(() => expect(closed()).toBe(1))
  expect(auth.submitCallback(url.href)).toBe(409)
  expect(tokenRequests).toHaveLength(1)
})

it('rejects cancelled callbacks across a new real provider login', async () => {
  const { auth, url, tokenRequests, store } = await fixture()
  await auth.cancel()
  expect(auth.submitCallback(url.href)).toBe(409)
  const next = new URL((await auth.signIn()).url)
  expect(next.searchParams.get('state')).not.toBe(url.searchParams.get('state'))
  expect(auth.submitCallback(url.href)).toBe(400)
  expect(tokenRequests).toHaveLength(0)
  await auth.cancel()
  expect(await store.read(OPENAI_CODEX_PROVIDER)).toBeUndefined()
})
