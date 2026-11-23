import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { expect, it, vi } from 'vitest'
import { OpenAICodexCredentialStore, OPENAI_CODEX_PROVIDER } from '../src/store.ts'
import { readOpenAICodexRateLimits } from '../src/usage.ts'
import { OpenAICodexSearchProvider } from '../src/search.ts'
import { OpenAICodexTransport } from '../src/transport.ts'
import { registerOpenAICodexAuthRoutes, OPENAI_CODEX_AUTH_STATUS_PATH } from '../src/auth-routes.ts'

function access(account: string): string {
  return `eyJhbGciOiJub25lIn0.${Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: account } })).toString('base64')}.fixture`
}

it.each(['usage', 'search', 'images'])('keeps %s on expired account A when B is selected before auth refresh', async kind => {
  const root = await mkdtemp(join(tmpdir(), 'codex-request-account-'))
  const ctx = new Context()
  const store = new OpenAICodexCredentialStore(join(root, 'auth.json'))
  try {
    for (const id of ['b', 'a']) await store.modify(OPENAI_CODEX_PROVIDER, async () => ({
      type: 'oauth', accountId: id, access: access(id), refresh: `fixture-refresh-${id}`,
      expires: id === 'a' ? 1 : Date.now() + 3_600_000,
    }))
    const b = (await store.accounts()).find(account => !account.active)!.accountKey
    const read = store.read.bind(store)
    const capture = store.captureActiveAccount.bind(store)
    // Place the switch after either old or new request snapshot acquisition.
    vi.spyOn(store, 'read').mockImplementation(async provider => {
      const credential = await read(provider)
      await store.activate(b)
      return credential
    })
    vi.spyOn(store, 'captureActiveAccount').mockImplementation(async () => {
      const snapshot = await capture()
      await store.activate(b)
      return snapshot
    })
    const sent: string[] = []
    const refreshes: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      if (String(url).includes('/oauth/token')) {
        refreshes.push(String(init.body))
        return Response.json({ access_token: access('a'), refresh_token: 'fixture-refreshed-a', expires_in: 3600 })
      }
      const headers = new Headers(init.headers)
      sent.push(headers.get('chatgpt-account-id') ?? '')
      expect(headers.get('authorization')).toBe(`Bearer ${access('a')}`)
      return Response.json(kind === 'usage' ? { rate_limit: {} }
        : kind === 'search' ? { output: 'fixture', results: [] } : { data: [{ b64_json: 'aGVsbG8=' }] })
    }))
    if (kind === 'usage') await readOpenAICodexRateLimits(store)
    else if (kind === 'search') await new OpenAICodexSearchProvider({
      credentials: store, model: 'gpt-5.6-sol', mode: 'cached', contextSize: 'medium',
      maxOutputTokens: 100, resolveRequestId: () => 'fixture',
    }).search({ query: 'fixture' })
    else {
      let transport!: OpenAICodexTransport
      await ctx.plugin(context => { transport = new OpenAICodexTransport(context, store) })
      await transport.generateImages({ prompt: 'fixture' }, {})
    }
    expect(sent).toEqual(['a'])
    expect(refreshes).toHaveLength(1)
    expect(refreshes[0]).toContain('fixture-refresh-a')
    expect(await read(OPENAI_CODEX_PROVIDER)).toMatchObject({ accountId: 'b' })
  } finally {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    await ctx.fiber.dispose()
    await rm(root, { recursive: true, force: true })
  }
})

it('returns account labels from the same snapshot as quota during a concurrent switch', async () => {
  const root = await mkdtemp(join(tmpdir(), 'codex-status-snapshot-'))
  const store = new OpenAICodexCredentialStore(join(root, 'auth.json'))
  const ctx = new Context()
  try {
    for (const id of ['b', 'a']) await store.modify(OPENAI_CODEX_PROVIDER, async () => ({
      type: 'oauth', accountId: id, access: access(id), refresh: 'fixture-refresh', expires: Date.now() + 3_600_000,
    }))
    const originalAccounts = await store.accounts()
    const b = originalAccounts.find(account => !account.active)!.accountKey
    let switched!: () => void
    const afterSwitch = new Promise<void>(resolve => { switched = resolve })
    const accounts = store.accounts.bind(store)
    vi.spyOn(store, 'accounts').mockImplementation(async () => { await afterSwitch; return accounts() })
    vi.stubGlobal('fetch', async () => {
      await store.activate(b)
      switched()
      return Response.json({ rate_limit: { primary_window: { used_percent: 17, limit_window_seconds: 18_000 } } })
    })
    const routes: Array<{ path: string; handler(req: IncomingMessage, res: ServerResponse): void | Promise<void> }> = []
    ctx.provide('webServer', { register: (route: typeof routes[number]) => { routes.push(route); return () => {} } } as never)
    // This fixture isolates quota/account snapshot consistency, not Host authentication.
    ctx.provide('connection', { admit: () => ({ peer: {} }) } as never)
    registerOpenAICodexAuthRoutes(ctx, store)
    let body = ''
    const res = { writeHead: () => res, end: (value: string) => { body = value } } as unknown as ServerResponse
    await routes.find(route => route.path === OPENAI_CODEX_AUTH_STATUS_PATH)!.handler({
      method: 'GET', headers: { host: '127.0.0.1:3081' }, socket: { remoteAddress: '127.0.0.1' },
    } as IncomingMessage, res)
    const value = JSON.parse(body) as { accounts: unknown; usage: unknown }
    expect(value.accounts).toEqual(originalAccounts)
    expect(JSON.stringify(value.usage)).toContain('83')
    expect(await store.read(OPENAI_CODEX_PROVIDER)).toMatchObject({ accountId: 'b' })
  } finally {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    await ctx.fiber.dispose()
    await rm(root, { recursive: true, force: true })
  }
})
