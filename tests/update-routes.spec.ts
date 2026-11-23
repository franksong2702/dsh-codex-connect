import type { IncomingMessage, ServerResponse } from 'node:http'
import { describe, expect, it, vi } from 'vitest'
import { httpRouteTestContext, rejectedHttpAdmissions } from './http-route-test-context.ts'
import { evaluateCompatibility } from '../src/compatibility.ts'
import { CODEX_CONNECT_VERSION } from '../src/version.ts'
import type { OpenAICodexRuntimeReport } from '../src/runtime-identity.ts'
import type { CapturedHttpRoute, TestHttpAdmission } from './http-route-test-context.ts'
import {
  OPENAI_CODEX_UPDATE_PATH,
  OPENAI_CODEX_RUNTIME_PATH,
  registerOpenAICodexUpdateRoutes,
} from '../src/update-routes.ts'
import type { OpenAICodexTrustedOriginsStore } from '../src/trusted-origins.ts'
import {
  OPENAI_CODEX_NPM_METADATA_URL,
  OPENAI_CODEX_RELEASE_API_BASE,
  OPENAI_CODEX_UPDATE_HIGHLIGHTS_URL,
  OPENAI_CODEX_VERIFIED_COMPATIBILITY_URL,
} from '../src/update.ts'

const trustedOrigins = { has: async () => false } as unknown as OpenAICodexTrustedOriginsStore

function runtimeReport(): OpenAICodexRuntimeReport {
  return {
    schemaVersion: 1,
    identity: {
      scope: 'host',
      loadedPluginVersion: CODEX_CONNECT_VERSION,
      installedPluginVersion: CODEX_CONNECT_VERSION,
      pluginVersionState: 'match',
      dshMetadataSource: 'host-install-anchor',
    },
    currentDshVersion: '0.2.1-alpha.1',
    compatibility: evaluateCompatibility({ nodeVersion: 'v24.21.0', packageVersions: {
      '@deepseek-ai/dsh-llm': '0.2.1-alpha.1', '@deepseek-ai/dsh-llm-pi-ai': '0.2.1-alpha.1',
      '@deepseek-ai/dsh-compaction': '0.2.1-alpha.1', '@earendil-works/pi-ai': '0.85.1',
    } }),
  }
}

function capture(
  fetchImpl: (input: string, init?: RequestInit) => Promise<Response>,
  resolveRuntimeReport: () => Promise<OpenAICodexRuntimeReport> = async () => runtimeReport(),
  path = OPENAI_CODEX_UPDATE_PATH,
  admission: TestHttpAdmission = 'allow',
): CapturedHttpRoute {
  const { ctx, routes } = httpRouteTestContext({ admission })
  registerOpenAICodexUpdateRoutes(ctx, { currentVersion: '0.1.0-alpha.4.14', fetchImpl, resolveRuntimeReport }, trustedOrigins)
  const route = [...routes.values()].find(candidate => candidate.path === path)
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
  it.each(rejectedHttpAdmissions)('authenticates Host runtime before metadata reads when Connection is $admission', async ({ admission, status, error }) => {
    const fixture = httpRouteTestContext({ admission })
    const fetchImpl = vi.fn(async () => json({}, 503))
    const resolveRuntimeReport = vi.fn(async () => runtimeReport())
    registerOpenAICodexUpdateRoutes(fixture.ctx, { currentVersion: '0.1.0-alpha.4.14', fetchImpl, resolveRuntimeReport }, trustedOrigins)
    const res = response()
    await fixture.routes.get(`exact:${OPENAI_CODEX_RUNTIME_PATH}`)!.handler(request(), res)
    expect(res.observed.status).toBe(status)
    expect(JSON.parse(res.observed.body ?? 'null')).toEqual({ error })
    expect(resolveRuntimeReport).not.toHaveBeenCalled()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it.each(rejectedHttpAdmissions)('leaves the public update route Origin-only when Connection is $admission', async ({ admission }) => {
    const fixture = httpRouteTestContext({ admission })
    const fetchImpl = vi.fn(async () => json({}, 503))
    const resolveRuntimeReport = vi.fn(async () => runtimeReport())
    registerOpenAICodexUpdateRoutes(fixture.ctx, { currentVersion: '0.1.0-alpha.4.14', fetchImpl, resolveRuntimeReport }, trustedOrigins)
    const res = response()
    await fixture.routes.get(`exact:${OPENAI_CODEX_UPDATE_PATH}`)!.handler(request(), res)
    expect(res.observed.status).toBe(200)
    expect(resolveRuntimeReport).not.toHaveBeenCalled()
    expect(fetchImpl).toHaveBeenCalled()
    expect(fixture.admit).not.toHaveBeenCalled()
  })

  it.each([1, 2])('rolls back failed update registration %s and preserves unrelated routes', async nth => {
    const fixture = httpRouteTestContext({ failRegistrationAt: nth + 1 })
    const unrelated: CapturedHttpRoute = { kind: 'exact', path: '/unrelated', handler: () => undefined }
    fixture.webServer.register(unrelated)
    const fetchImpl = vi.fn()
    const resolveRuntimeReport = vi.fn()
    expect(() => registerOpenAICodexUpdateRoutes(fixture.ctx, { currentVersion: '0.1.0-alpha.4.14', fetchImpl, resolveRuntimeReport }, trustedOrigins))
      .toThrow('synthetic HTTP route registration failure')
    expect([...fixture.routes.values()]).toEqual([unrelated])
    await fixture.ctx.fiber.dispose()
    expect([...fixture.routes.values()]).toEqual([unrelated])
    expect(fixture.disposedPaths).toEqual([OPENAI_CODEX_RUNTIME_PATH, OPENAI_CODEX_UPDATE_PATH].slice(0, nth - 1).reverse())
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(resolveRuntimeReport).not.toHaveBeenCalled()
  })

  it('rolls back runtime registration without removing an unrelated update route owner', async () => {
    const fixture = httpRouteTestContext()
    const occupied: CapturedHttpRoute = { kind: 'exact', path: OPENAI_CODEX_UPDATE_PATH, handler: () => undefined }
    fixture.webServer.register(occupied)
    expect(() => registerOpenAICodexUpdateRoutes(fixture.ctx, { currentVersion: '0.1.0-alpha.4.14' }, trustedOrigins)).toThrow(/duplicate HTTP route/u)
    expect([...fixture.routes.values()]).toEqual([occupied])
    await fixture.ctx.fiber.dispose()
    expect([...fixture.routes.values()]).toEqual([occupied])
    expect(fixture.disposedPaths).toEqual([OPENAI_CODEX_RUNTIME_PATH])
  })

  it('releases update routes in reverse order on normal disposal', async () => {
    const fixture = httpRouteTestContext()
    const unrelated: CapturedHttpRoute = { kind: 'exact', path: '/unrelated', handler: () => undefined }
    fixture.webServer.register(unrelated)
    registerOpenAICodexUpdateRoutes(fixture.ctx, { currentVersion: '0.1.0-alpha.4.14' }, trustedOrigins)
    await fixture.ctx.fiber.dispose()
    expect([...fixture.routes.values()]).toEqual([unrelated])
    expect(fixture.disposedPaths).toEqual([OPENAI_CODEX_UPDATE_PATH, OPENAI_CODEX_RUNTIME_PATH])
  })

  it('returns a safe update result for trusted loopback GETs', async () => {
    const fetchMock = vi.fn(async (url: string): Promise<Response> => {
      if (url === OPENAI_CODEX_NPM_METADATA_URL) return json({ alpha: '0.1.0-alpha.4.15' })
      if (url === OPENAI_CODEX_UPDATE_HIGHLIGHTS_URL) return json({ schemaVersion: 1, releases: [] })
      if (url === OPENAI_CODEX_VERIFIED_COMPATIBILITY_URL) return json({
        schemaVersion: 1,
        checkedAt: '2026-08-23',
        latestDshVersion: '0.1.1-rc.2',
        pluginVersions: [{ version: '0.1.0-alpha.4.15', verifiedDshVersions: ['0.1.1-rc.2'] }],
      })
      return json({ body: 'Global update reminder', name: 'Alpha 4.15', published_at: '2026-08-21T12:00:00Z' })
    })
    const resolveRuntimeReport = vi.fn(async () => runtimeReport())
    const route = capture(fetchMock, resolveRuntimeReport)
    const res = response()
    await route.handler(request(), res)

    expect(res.observed.status).toBe(200)
    expect(JSON.parse(res.observed.body ?? 'null')).toEqual({
      status: 'update-available',
      currentVersion: '0.1.0-alpha.4.14',
      latestVersion: '0.1.0-alpha.4.15',
      releaseUrl: 'https://github.com/franksong2702/dsh-codex-connect/releases/tag/v0.1.0-alpha.4.15',
      highlights: [],
      releaseName: 'Alpha 4.15',
      releaseNotes: 'Global update reminder',
      publishedAt: '2026-08-21T12:00:00Z',
    })
    expect(JSON.parse(res.observed.body ?? 'null')).not.toHaveProperty('credential')
    expect(fetchMock).toHaveBeenCalledWith(OPENAI_CODEX_RELEASE_API_BASE + '0.1.0-alpha.4.15', expect.anything())
    expect(resolveRuntimeReport).not.toHaveBeenCalled()
  })

  it.each(['throw', 'reject'] as const)('fails closed before metadata/network when a remote Origin store lookup will %s', async mode => {
    const fixture = httpRouteTestContext()
    const resolveRuntimeReport = vi.fn(async () => runtimeReport())
    const fetchImpl = vi.fn()
    const has = vi.fn(mode === 'throw'
      ? () => { throw new Error('/private/origin-store') }
      : async () => { throw new Error('/private/origin-store') })
    registerOpenAICodexUpdateRoutes(fixture.ctx, { currentVersion: CODEX_CONNECT_VERSION, fetchImpl, resolveRuntimeReport }, { has } as unknown as OpenAICodexTrustedOriginsStore)
    const req = request('GET', '192.168.1.9')
    req.headers.host = '192.168.1.8:3081'
    req.headers.origin = 'http://192.168.1.8:3081'
    const res = response()
    await fixture.routes.get(`exact:${OPENAI_CODEX_RUNTIME_PATH}`)!.handler(req, res)
    expect(has).toHaveBeenCalledWith('http://192.168.1.8:3081')
    expect(res.observed.status).toBe(403)
    expect(JSON.parse(res.observed.body ?? 'null')).toEqual({ error: 'forbidden' })
    expect(resolveRuntimeReport).not.toHaveBeenCalled()
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(res.observed.body).not.toContain('/private')
  })

  it('reports allowlisted Host identity and coherent installation metadata without network access', async () => {
    const fetchMock = vi.fn(async (): Promise<Response> => json({ error: 'unexpected' }, 500))
    const route = capture(fetchMock, async () => ({ ...runtimeReport(), credentialPath: '/private/must-not-leak' }), OPENAI_CODEX_RUNTIME_PATH)
    const res = response()
    await route.handler(request(), res)

    expect(JSON.parse(res.observed.body ?? 'null')).toEqual(runtimeReport())
    expect(res.observed.body).not.toContain('must-not-leak')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('omits the current DSH version when local package detection fails', async () => {
    const fetchMock = vi.fn(async (url: string): Promise<Response> => url === OPENAI_CODEX_NPM_METADATA_URL
      ? json({ alpha: '0.1.0-alpha.4.14' })
      : json({
          schemaVersion: 1,
          checkedAt: '2026-08-23',
          latestDshVersion: '0.1.1-rc.2',
          pluginVersions: [{ version: '0.1.0-alpha.4.14', verifiedDshVersions: ['0.1.1-rc.2'] }],
        }))
    const route = capture(fetchMock, async () => { throw new Error('/private/package metadata unavailable') }, OPENAI_CODEX_RUNTIME_PATH)
    const res = response()
    await route.handler(request(), res)

    expect(JSON.parse(res.observed.body ?? 'null')).not.toHaveProperty('currentDshVersion')
    expect(JSON.parse(res.observed.body ?? 'null')).toMatchObject({
      schemaVersion: 1,
      identity: { scope: 'host', loadedPluginVersion: CODEX_CONNECT_VERSION, installedPluginVersion: null, pluginVersionState: 'unknown', dshMetadataSource: 'unknown' },
      compatibility: { schemaVersion: 1, status: 'unknown' },
    })
    expect(res.observed.body).not.toContain('/private')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(res.observed.status).toBe(200)
  })

  it.each([OPENAI_CODEX_UPDATE_PATH, OPENAI_CODEX_RUNTIME_PATH])('rejects wrong methods and non-loopback peers before metadata/network access at %s', async path => {
    const fetchMock = vi.fn(async (): Promise<Response> => json({ alpha: '0.1.0-alpha.4.15' }))
    const resolveRuntimeReport = vi.fn(async () => runtimeReport())
    const route = capture(fetchMock, resolveRuntimeReport, path)
    const wrongMethod = response()
    await route.handler(request('POST'), wrongMethod)
    expect(wrongMethod.observed.status).toBe(405)
    expect(fetchMock).not.toHaveBeenCalled()

    const remote = response()
    await route.handler(request('GET', '192.168.1.9'), remote)
    expect(remote.observed.status).toBe(403)
    expect(JSON.parse(remote.observed.body ?? 'null')).toEqual({ error: 'remote-web-origin-not-trusted' })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(resolveRuntimeReport).not.toHaveBeenCalled()
  })
})
