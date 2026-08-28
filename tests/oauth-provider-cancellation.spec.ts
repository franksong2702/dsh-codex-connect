import http, { type Server } from 'node:http'
import { EventEmitter } from 'node:events'
import { syncBuiltinESMExports } from 'node:module'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { OpenAICodexWebAuth } from '../src/auth-routes.ts'
import { OpenAICodexCredentialStore } from '../src/store.ts'

it('settles cancellation and expiry through the installed pi-ai browser OAuth implementation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'codex-oauth-cancellation-'))
  let closed = 0
  // Keep the real OAuth state machine, but never bind its fixed callback port or contact OpenAI.
  class CallbackServer extends EventEmitter {
    listen(_port: number, _host: string, ready: () => void) { queueMicrotask(ready); return this }
    close() { closed++; return this }
  }
  const server = vi.spyOn(http, 'createServer').mockImplementation(() => new CallbackServer() as unknown as Server)
  syncBuiltinESMExports()
  const fetch = vi.fn(() => { throw new Error('This cancellation test must not contact a remote service') })
  vi.stubGlobal('fetch', fetch)
  const store = new OpenAICodexCredentialStore(join(root, 'credentials.json'))
  const auth = new OpenAICodexWebAuth(store, { authorizationTimeoutMs: 100 })
  try {
    await auth.signIn()
    await auth.cancel()
    expect(closed).toBe(1)
    await expect(auth.status()).resolves.toEqual({ status: 'signed-out' })
    await auth.signIn()
    await vi.waitFor(async () => {
      expect(await auth.status()).toMatchObject({ status: 'error', message: expect.stringContaining('expired') })
    }, { timeout: 1_000, interval: 10 })
    expect(closed).toBe(2)
    await auth.signIn()
    await auth.dispose()
    expect(closed).toBe(3)
    expect(fetch).not.toHaveBeenCalled()
    await expect(store.read('openai-codex')).resolves.toBeUndefined()
  } finally {
    server.mockRestore()
    syncBuiltinESMExports()
    vi.unstubAllGlobals()
    await rm(root, { recursive: true, force: true })
  }
}, 5_000)
