import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { OAuthCredential } from '@earendil-works/pi-ai'
import { OpenAICodexCredentialStore, OPENAI_CODEX_PROVIDER } from '../src/store.ts'
import {
  OPENAI_CODEX_USAGE_URL,
  OpenAICodexReauthRequiredError,
  readOpenAICodexRateLimits,
} from '../src/usage.ts'

const stores: Array<{ store: OpenAICodexCredentialStore; root: string }> = []
const servers: ReturnType<typeof createServer>[] = []

afterEach(async () => {
  vi.unstubAllGlobals()
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))))
  await Promise.all(stores.splice(0).map(({ root }) => rm(root, { recursive: true, force: true })))
})

async function authenticatedStore(): Promise<OpenAICodexCredentialStore> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-usage-response-'))
  const store = new OpenAICodexCredentialStore(join(root, 'auth.json'))
  stores.push({ store, root })
  const credential: OAuthCredential = {
    type: 'oauth', access: 'access-secret', refresh: 'refresh-secret',
    expires: Date.now() + 3_600_000, accountId: 'account-1',
  }
  await store.modify(OPENAI_CODEX_PROVIDER, () => Promise.resolve(credential))
  return store
}

describe('OpenAI Codex usage response lifecycle', () => {
  it('cancels an unconsumed error body and releases the local socket promptly', async () => {
    let socketClosed: (() => void) | undefined
    const closed = new Promise<void>(resolve => { socketClosed = resolve })
    const server = createServer((request, response) => {
      request.socket.once('close', () => socketClosed?.())
      response.writeHead(503, { 'content-type': 'application/json' })
      response.write('{"error":"slow"}')
      const interval = setInterval(() => response.write(' '.repeat(1024)), 10)
      response.once('close', () => clearInterval(interval))
    })
    servers.push(server)
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const port = (server.address() as AddressInfo).port
    const realFetch = globalThis.fetch
    vi.stubGlobal('fetch', (input: string | URL | Request, init?: RequestInit) => {
      expect(String(input)).toBe(OPENAI_CODEX_USAGE_URL)
      return realFetch(`http://127.0.0.1:${String(port)}/usage`, init)
    })

    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      await expect(readOpenAICodexRateLimits(await authenticatedStore()))
        .rejects.toThrow('HTTP 503')
      await expect(Promise.race([
        closed.then(() => true),
        new Promise<boolean>(resolve => { timer = setTimeout(() => resolve(false), 1_000) }),
      ])).resolves.toBe(true)
    } finally {
      if (timer !== undefined) clearTimeout(timer)
      server.closeAllConnections()
    }
  })

  it('keeps the HTTP status when body cancellation itself fails', async () => {
    const cancel = vi.fn(async () => { throw new Error('cancel failed') })
    const response = new Response(null, { status: 503 })
    Object.defineProperty(response, 'body', { value: { cancel }, configurable: true })
    vi.stubGlobal('fetch', vi.fn(async () => response))

    await expect(readOpenAICodexRateLimits(await authenticatedStore()))
      .rejects.toThrow('HTTP 503')
    expect(cancel).toHaveBeenCalledOnce()
  })

  it.each([401, 403])('preserves reauthorization semantics for HTTP %s while canceling the body', async status => {
    const cancel = vi.fn(async () => undefined)
    const response = new Response(null, { status })
    Object.defineProperty(response, 'body', { value: { cancel }, configurable: true })
    vi.stubGlobal('fetch', vi.fn(async () => response))

    await expect(readOpenAICodexRateLimits(await authenticatedStore()))
      .rejects.toBeInstanceOf(OpenAICodexReauthRequiredError)
    expect(cancel).toHaveBeenCalledOnce()
  })
})
