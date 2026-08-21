import type { Context } from '@deepseek-ai/cordis'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { describe, expect, it, vi } from 'vitest'
import {
  OPENAI_CODEX_UPDATE_PATH,
  registerOpenAICodexUpdateRoutes,
} from '../src/update-routes.ts'
import type { OpenAICodexTrustedOriginsStore } from '../src/trusted-origins.ts'
import { OPENAI_CODEX_NPM_METADATA_URL, OPENAI_CODEX_RELEASE_API_BASE } from '../src/update.ts'

interface CapturedRoute {
  path: string
  handler(req: IncomingMessage, res: ServerResponse): Promise<void> | void
}

const trustedOrigins = { has: async () => false } as unknown as OpenAICodexTrustedOriginsStore

function capture(fetchImpl: (input: string, init?: RequestInit) => Promise<Response>): CapturedRoute {
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
  registerOpenAICodexUpdateRoutes(ctx, { currentVersion: '0.1.0-alpha.4.14', fetchImpl }, trustedOrigins)
  const route = routes.find(candidate => candidate.path === OPENAI_CODEX_UPDATE_PATH)
  if (route === undefined) throw new Error('update route was not registered')
  return route
}

function request(method = 'GET', remoteAddress = '127.0.0.1'): IncomingMessage {
  return {
    method,
    socket: { remoteAddress },
    headers: { host: '127.0.0.1:3081' },
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

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } })
}

describe('Codex Connect update route', () => {
  it('returns a safe update result for trusted loopback GETs', async () => {
    const fetchMock = vi.fn(async (url: string): Promise<Response> => url === OPENAI_CODEX_NPM_METADATA_URL
      ? json({ 'dist-tags': { alpha: '0.1.0-alpha.4.15' } })
      : json({ body: 'Global update reminder', name: 'Alpha 4.15', published_at: '2026-08-21T12:00:00Z' }))
    const route = capture(fetchMock)
    const res = response()
    await route.handler(request(), res)

    expect(res.observed.status).toBe(200)
    expect(JSON.parse(res.observed.body ?? 'null')).toEqual({
      status: 'update-available',
      currentVersion: '0.1.0-alpha.4.14',
      latestVersion: '0.1.0-alpha.4.15',
      releaseUrl: 'https://github.com/franksong2702/dsh-codex-connect/releases/tag/v0.1.0-alpha.4.15',
      releaseName: 'Alpha 4.15',
      releaseNotes: 'Global update reminder',
      publishedAt: '2026-08-21T12:00:00Z',
    })
    expect(JSON.parse(res.observed.body ?? 'null')).not.toHaveProperty('credential')
    expect(fetchMock).toHaveBeenCalledWith(OPENAI_CODEX_RELEASE_API_BASE + '0.1.0-alpha.4.15', expect.anything())
  })

  it('rejects wrong methods and non-loopback peers before public network access', async () => {
    const fetchMock = vi.fn(async (): Promise<Response> => json({ 'dist-tags': { alpha: '0.1.0-alpha.4.15' } }))
    const route = capture(fetchMock)
    const wrongMethod = response()
    await route.handler(request('POST'), wrongMethod)
    expect(wrongMethod.observed.status).toBe(405)
    expect(fetchMock).not.toHaveBeenCalled()

    const remote = response()
    await route.handler(request('GET', '192.168.1.9'), remote)
    expect(remote.observed.status).toBe(403)
    expect(JSON.parse(remote.observed.body ?? 'null')).toEqual({ error: 'remote-web-origin-not-trusted' })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
