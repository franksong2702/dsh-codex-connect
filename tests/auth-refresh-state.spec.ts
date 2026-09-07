import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inspect } from 'node:util'
import { afterEach, expect, it, vi } from 'vitest'
import { OpenAICodexWebAuth } from '../src/auth-routes.ts'
import { OpenAICodexCredentialStore, OPENAI_CODEX_PROVIDER } from '../src/store.ts'
import { OPENAI_CODEX_REAUTH_REQUIRED_MESSAGE } from '../src/usage.ts'

let root: string | undefined
afterEach(async () => {
  vi.unstubAllGlobals()
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

it.each([
  ['revoked grant', () => Response.json({ error: 'invalid_grant', error_description: 'fixture-private-detail' }, { status: 400 }), 'reauth-required'],
  ['unauthorized grant', () => Response.json({ error: 'invalid_grant' }, { status: 401 }), 'reauth-required'],
  ['server failure', () => Response.json({ error: 'invalid_grant' }, { status: 503 }), 'signed-in'],
  ['rate limit', () => Response.json({ error: 'invalid_grant' }, { status: 429 }), 'signed-in'],
  ['client configuration', () => Response.json({ error: 'invalid_client' }, { status: 400 }), 'signed-in'],
  ['malformed failure', () => new Response('invalid_grant fixture-private-detail', { status: 400 }), 'signed-in'],
  ['network failure', () => { throw new TypeError('fixture-private-detail') }, 'signed-in'],
  ['timeout', () => { throw new DOMException('fixture-private-detail', 'TimeoutError') }, 'signed-in'],
] as const)('projects %s from a real refresh without deleting credentials', async (_name, response, expected) => {
  root = await mkdtemp(join(tmpdir(), 'codex-refresh-state-'))
  const store = new OpenAICodexCredentialStore(join(root, 'auth.json'))
  const saved = { type: 'oauth' as const, accountId: 'fixture-account', access: 'fixture-access', refresh: 'fixture-refresh', expires: 1 }
  await store.modify(OPENAI_CODEX_PROVIDER, async () => saved)
  const requests: string[] = []
  vi.stubGlobal('fetch', async (url: string) => { requests.push(String(url)); return response() })
  const auth = new OpenAICodexWebAuth(store)
  try {
    const state = await auth.status()
    expect(state.status).toBe(expected)
    if (expected === 'reauth-required') expect(state).toEqual({ status: expected, message: OPENAI_CODEX_REAUTH_REQUIRED_MESSAGE })
    else expect(state).toMatchObject({ status: expected, usage: { rateLimits: [] }, quotaError: expect.any(String) })
    expect(requests).toHaveLength(1)
    expect(requests[0]).toContain('/oauth/token')
    expect(await store.read(OPENAI_CODEX_PROVIDER)).toEqual(saved)
    expect(inspect(state, { depth: null })).not.toContain('fixture-private-detail')
  } finally { await auth.dispose() }
})
