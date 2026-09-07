import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inspect } from 'node:util'
import { afterEach, expect, it, vi } from 'vitest'
import { createOpenAICodexAdapter } from '../src/adapter.ts'
import { readOpenAICodexRequestAuth } from '../src/auth.ts'
import { OpenAICodexCredentialStore, OPENAI_CODEX_PROVIDER } from '../src/store.ts'

let root: string | undefined
afterEach(async () => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

function access(id: string): string {
  return `eyJhbGciOiJub25lIn0.${Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: id } })).toString('base64')}.fixture`
}

function credential(id: string, expired = false) {
  return { type: 'oauth' as const, accountId: id, access: access(id), refresh: `fixture-refresh-${id}`, expires: expired ? 1 : Date.now() + 3_600_000 }
}

async function store() {
  root = await mkdtemp(join(tmpdir(), 'codex-adapter-auth-'))
  return new OpenAICodexCredentialStore(join(root, 'auth.json'))
}

async function runAdapter(credentials: OpenAICodexCredentialStore) {
  const adapter = createOpenAICodexAdapter(credentials, () => undefined)
  const events: unknown[] = []
  try {
    for await (const event of adapter.stream({ provider: OPENAI_CODEX_PROVIDER, model: 'gpt-5.6-sol', messages: [] })) events.push(event)
    return { events, error: undefined }
  } catch (error: unknown) {
    return { events, error }
  }
}

it.each(['remove', 'logout-and-login'])('does not authenticate again after captured A disappears through %s', async action => {
  const credentials = await store()
  const bCredential = credential('b')
  await credentials.modify(OPENAI_CODEX_PROVIDER, async () => bCredential)
  await credentials.modify(OPENAI_CODEX_PROVIDER, async () => credential('a', true))
  const accounts = await credentials.accounts()
  const a = accounts.find(account => account.active)!.accountKey
  const b = accounts.find(account => !account.active)!.accountKey
  const capture = credentials.captureActiveAccount.bind(credentials)
  vi.spyOn(credentials, 'captureActiveAccount').mockImplementation(async () => {
    const snapshot = await capture()
    if (action === 'remove') await credentials.removeAccount(a, b)
    else {
      await credentials.delete(OPENAI_CODEX_PROVIDER)
      await credentials.modify(OPENAI_CODEX_PROVIDER, async () => bCredential)
    }
    return snapshot
  })
  const fetchMock = vi.fn(async () => new Response('offline fixture', { status: 400 }))
  vi.stubGlobal('fetch', fetchMock)
  const result = await runAdapter(credentials)
  expect(fetchMock).not.toHaveBeenCalled()
  expect(result.error).toMatchObject({ code: 'MISSING_CREDENTIAL' })
  expect(result.events).toEqual([])
  expect(await credentials.read(OPENAI_CODEX_PROVIDER)).toEqual(bCredential)
  expect(await credentials.accounts()).toHaveLength(1)
})

it.each(['adapter', 'shared-auth'])('contains real refresh failures at the %s exit', async consumer => {
  const credentials = await store()
  const saved = credential('a', true)
  await credentials.modify(OPENAI_CODEX_PROVIDER, async () => saved)
  const secrets = ['opaque-fixture-secret', access('secret-account')]
  const logging = [vi.spyOn(console, 'log'), vi.spyOn(console, 'warn'), vi.spyOn(console, 'error')]
  for (const response of [
    () => Response.json({ refresh_token: secrets[0], nested: { access_token: secrets[1] } }),
    () => new Response(`refresh_token=${secrets[0]} ${secrets[1]}`, { status: 401 }),
    () => { throw new Error(secrets[0], { cause: new Error(secrets[1]) }) },
  ]) {
    const fetchMock = vi.fn(async () => response())
    vi.stubGlobal('fetch', fetchMock)
    const result = consumer === 'adapter'
      ? await runAdapter(credentials)
      : { events: [], error: await readOpenAICodexRequestAuth(credentials).catch((error: unknown) => error) }
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result.error).toMatchObject({ code: 'AUTH_FAILED', message: 'OpenAI Codex operation failed. Please try again.' })
    expect(result.error).not.toHaveProperty('cause')
    const output = inspect(result, { depth: null }) + JSON.stringify(result)
      + JSON.stringify(logging.map(logger => logger.mock.calls))
    for (const secret of secrets) expect(output).not.toContain(secret)
    expect(await credentials.read(OPENAI_CODEX_PROVIDER)).toEqual(saved)
  }
})

it('refreshes captured A and sends its token even when B becomes active', async () => {
  const credentials = await store()
  const bCredential = credential('b')
  await credentials.modify(OPENAI_CODEX_PROVIDER, async () => bCredential)
  await credentials.modify(OPENAI_CODEX_PROVIDER, async () => credential('a', true))
  const b = (await credentials.accounts()).find(account => !account.active)!.accountKey
  const capture = credentials.captureActiveAccount.bind(credentials)
  vi.spyOn(credentials, 'captureActiveAccount').mockImplementation(async () => {
    const snapshot = await capture()
    await credentials.activate(b)
    return snapshot
  })
  const requests: Headers[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    if (String(url).includes('/oauth/token')) {
      expect(String(init.body)).toContain('fixture-refresh-a')
      return Response.json({ access_token: access('a'), refresh_token: 'fixture-rotated-a', expires_in: 3600 })
    }
    requests.push(new Headers(init.headers))
    return new Response('offline fixture', { status: 400 })
  }))
  await runAdapter(credentials)
  expect(requests).toHaveLength(1)
  expect(requests[0]!.get('authorization')).toBe(`Bearer ${access('a')}`)
  expect(requests[0]!.get('chatgpt-account-id')).toBe('a')
  expect(await credentials.read(OPENAI_CODEX_PROVIDER)).toEqual(bCredential)
})

it('reports missing credentials without sending a request', async () => {
  const credentials = await store()
  const fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  const result = await runAdapter(credentials)
  expect(result.error).toMatchObject({ code: 'MISSING_CREDENTIAL' })
  expect(fetchMock).not.toHaveBeenCalled()
})

it('does not expose a caller cancellation reason', async () => {
  const credentials = await store()
  const controller = new AbortController()
  controller.abort(new Error('fixture-private-cancellation'))
  const error = await readOpenAICodexRequestAuth(credentials, controller.signal).catch((error: unknown) => error)
  expect(error).toMatchObject({ code: 'ABORTED', name: 'AbortError' })
  expect(inspect(error, { depth: null })).not.toContain('fixture-private-cancellation')
  expect(error).not.toHaveProperty('cause')
})
