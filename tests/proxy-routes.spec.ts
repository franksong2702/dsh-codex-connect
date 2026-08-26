import type { Context } from '@deepseek-ai/cordis'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  OPENAI_CODEX_PROXY_DETECT_PATH,
  OPENAI_CODEX_PROXY_TEST_PATH,
  registerOpenAICodexProxyRoutes,
} from '../src/proxy-routes.ts'
import type { OpenAICodexProxyManager } from '../src/provider-proxy.ts'
import type { OpenAICodexTrustedOriginsStore } from '../src/trusted-origins.ts'

interface CapturedRoute {
  path: string
  handler(req: IncomingMessage, res: ServerResponse): Promise<void> | void
}

const trustedOrigins = { has: async () => false } as unknown as OpenAICodexTrustedOriginsStore

function response(): ServerResponse & { status?: number; body?: string } {
  const observed: { status?: number; body?: string } = {}
  return {
    writeHead(status: number) {
      observed.status = status
      return this
    },
    end(body?: string) {
      if (body !== undefined) observed.body = body
    },
    get status() { return observed.status },
    get body() { return observed.body },
  } as unknown as ServerResponse & { status?: number; body?: string }
}

function request(method: string, url = '/'): IncomingMessage {
  return {
    method,
    url,
    socket: { remoteAddress: '127.0.0.1' },
    headers: { host: '127.0.0.1:3081' },
  } as unknown as IncomingMessage
}

function capture(manager: OpenAICodexProxyManager): CapturedRoute[] {
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
  registerOpenAICodexProxyRoutes(ctx, trustedOrigins, manager)
  return routes
}

afterEach(() => { vi.unstubAllEnvs() })

describe('OpenAI Codex proxy routes', () => {
  it('detects bounded candidates without a settings mutation', async () => {
    vi.stubEnv('HTTPS_PROXY', '')
    vi.stubEnv('HTTP_PROXY', '')
    vi.stubEnv('ALL_PROXY', '')
    const probe = vi.fn(async (proxyUrl: string) => ({
      proxyUrl,
      reachable: proxyUrl.endsWith(':7890'),
      classification: proxyUrl.endsWith(':7890') ? 'reachable' as const : 'connection-refused' as const,
      ...(proxyUrl.endsWith(':7890') ? { status: 401 } : {}),
    }))
    const manager = { probe } as unknown as OpenAICodexProxyManager
    const route = capture(manager).find(candidate => candidate.path === OPENAI_CODEX_PROXY_DETECT_PATH)
    if (route === undefined) throw new Error('detect route was not registered')
    const res = response()
    await route.handler(request('POST'), res)

    expect(res.status).toBe(200)
    expect(JSON.parse(res.body ?? 'null')).toMatchObject({
      candidates: [{ proxyUrl: 'http://127.0.0.1:7890', status: 401 }],
    })
    expect(probe).toHaveBeenCalledTimes(3)
  })

  it('tests only the draft URL and rejects missing input without probing', async () => {
    const probe = vi.fn(async (proxyUrl: string) => ({
      proxyUrl,
      reachable: true,
      classification: 'reachable' as const,
      status: 401,
    }))
    const manager = { probe } as unknown as OpenAICodexProxyManager
    const route = capture(manager).find(candidate => candidate.path === OPENAI_CODEX_PROXY_TEST_PATH)
    if (route === undefined) throw new Error('test route was not registered')
    const invalid = response()
    await route.handler(request('POST'), invalid)
    expect(invalid.status).toBe(400)
    expect(probe).not.toHaveBeenCalled()

    const valid = response()
    await route.handler(request('POST', `${OPENAI_CODEX_PROXY_TEST_PATH}?proxyUrl=${encodeURIComponent('http://127.0.0.1:7897')}`), valid)
    expect(valid.status).toBe(200)
    expect(probe).toHaveBeenCalledWith('http://127.0.0.1:7897')
  })
})
