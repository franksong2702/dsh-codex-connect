import type { Context } from '@deepseek-ai/cordis'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { describe, expect, it, vi } from 'vitest'
import {
  OPENAI_CODEX_CONNECTIVITY_PATH,
  OPENAI_CODEX_PROXY_DETECT_PATH,
  OPENAI_CODEX_PROXY_TEST_PATH,
  registerOpenAICodexProxyRoutes,
} from '../src/proxy-routes.ts'
import type { OpenAICodexTrustedOriginsStore } from '../src/trusted-origins.ts'

interface CapturedRoute {
  path: string
  handler(req: IncomingMessage, res: ServerResponse): Promise<void> | void
}

function capture(options: Parameters<typeof registerOpenAICodexProxyRoutes>[2]): CapturedRoute[] {
  const routes: CapturedRoute[] = []
  const ctx = {
    webServer: { register(route: CapturedRoute) { routes.push(route); return () => undefined } },
    effect(factory: () => void | (() => void | Promise<void>)) { return factory() },
  } as unknown as Context
  const trusted = { has: async () => false } as unknown as OpenAICodexTrustedOriginsStore
  registerOpenAICodexProxyRoutes(ctx, trusted, options)
  return routes
}

function request(method: string, body?: string): IncomingMessage {
  return {
    method,
    socket: { remoteAddress: '127.0.0.1' },
    headers: {
      host: '127.0.0.1:3081',
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body }),
  } as unknown as IncomingMessage
}

function response(): ServerResponse & { status?: number; body?: string } {
  const state: { status?: number; body?: string } = {}
  return {
    writeHead(status: number) { state.status = status; return this },
    end(body?: string) {
      if (body !== undefined) state.body = body
      return this
    },
    get status() { return state.status },
    get body() { return state.body },
  } as unknown as ServerResponse & { status?: number; body?: string }
}

function bodyOf(res: { body?: string }): unknown {
  return JSON.parse(res.body ?? 'null') as unknown
}

describe('OpenAI Codex proxy Detect/Test routes', () => {
  it('reports and briefly caches current-instance connectivity without changing settings', async () => {
    const report = {
      checkedAt: Date.now(),
      mode: 'proxy' as const,
      targets: [{ id: 'codex-api', hostname: 'chatgpt.com', reachable: true, latencyMs: 18, statusCode: 401 }],
    }
    const checkConnectivity = vi.fn(async () => report)
    const routes = capture({ environment: {}, checkConnectivity })
    const route = routes.find(item => item.path === OPENAI_CODEX_CONNECTIVITY_PATH)!
    const first = response()
    const second = response()

    await route.handler(request('GET'), first)
    await route.handler(request('GET'), second)

    expect(first.status).toBe(200)
    expect(bodyOf(first)).toEqual(report)
    expect(bodyOf(second)).toEqual(report)
    expect(checkConnectivity).toHaveBeenCalledOnce()
  })

  it('probes a bounded environment-first candidate set without mutating settings', async () => {
    const testProxy = vi.fn(async (proxyUrl: string) => proxyUrl === 'http://127.0.0.1:8443'
      ? { ok: true as const, statusCode: 401, classification: 'upstream-authentication-required' as const }
      : { ok: false as const, error: 'connection refused', classification: 'connection-refused' as const })
    const routes = capture({
      environment: {
        HTTPS_PROXY: 'http://127.0.0.1:8443',
        HTTP_PROXY: 'http://127.0.0.1:8080',
      },
      testProxy,
    })
    const route = routes.find(item => item.path === OPENAI_CODEX_PROXY_DETECT_PATH)!
    const res = response()
    await route.handler(request('GET'), res)
    expect(res.status).toBe(200)
    expect(bodyOf(res)).toMatchObject({
      environment: {
        detected: true,
        source: 'HTTPS_PROXY',
        valid: true,
        proxyUrl: 'http://127.0.0.1:8443',
      },
      candidates: [{
        source: 'HTTPS_PROXY',
        proxyUrl: 'http://127.0.0.1:8443',
        ok: true,
        statusCode: 401,
      }],
    })
    expect(testProxy.mock.calls.map(([proxyUrl]) => proxyUrl)).toEqual([
      'http://127.0.0.1:8443',
      'http://127.0.0.1:8080',
      'http://127.0.0.1:7890',
      'http://127.0.0.1:7897',
      'http://127.0.0.1:10809',
    ])
  })

  it('retains the three bounded localhost fallbacks when no environment proxy exists', async () => {
    const testProxy = vi.fn(async (proxyUrl: string) => ({
      ok: proxyUrl.endsWith(':7890'),
      ...(proxyUrl.endsWith(':7890') ? { statusCode: 401 } : { error: 'connection refused' }),
    }))
    const routes = capture({ environment: {}, testProxy })
    const route = routes.find(item => item.path === OPENAI_CODEX_PROXY_DETECT_PATH)!
    const res = response()

    await route.handler(request('GET'), res)

    expect(res.status).toBe(200)
    expect(bodyOf(res)).toMatchObject({
      environment: { detected: false },
      candidates: [{ source: 'local', proxyUrl: 'http://127.0.0.1:7890', ok: true }],
    })
    expect(testProxy).toHaveBeenCalledTimes(3)
  })

  it('tests only the posted draft and rejects credentialed proxy URLs', async () => {
    const testProxy = vi.fn(async () => ({ ok: true as const, statusCode: 404 }))
    const routes = capture({ environment: {}, testProxy })
    const route = routes.find(item => item.path === OPENAI_CODEX_PROXY_TEST_PATH)!

    const tested = response()
    await route.handler(request('POST', JSON.stringify({ proxyUrl: 'http://127.0.0.1:7890' })), tested)
    expect(tested.status).toBe(200)
    expect(testProxy).toHaveBeenCalledWith('http://127.0.0.1:7890')
    expect(bodyOf(tested)).toEqual({ ok: true, statusCode: 404 })

    const invalid = response()
    await route.handler(request('POST', JSON.stringify({ proxyUrl: 'http://user:secret@127.0.0.1:7890' })), invalid)
    expect(invalid.status).toBe(400)
    expect(testProxy).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(bodyOf(invalid))).not.toContain('secret')
  })
})
