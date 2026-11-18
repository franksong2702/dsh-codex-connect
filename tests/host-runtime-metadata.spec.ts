import type { IncomingMessage, ServerResponse } from 'node:http'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { httpRouteTestContext } from './http-route-test-context.ts'
import { DSH_METADATA_PACKAGES } from '../src/installation-metadata.ts'
import { SUPPORTED_DSH_PLUGIN_API_VERSIONS } from '../src/compatibility.ts'
import { parseOpenAICodexRuntimeReport } from '../src/runtime-identity.ts'
import { OPENAI_CODEX_RUNTIME_PATH, registerOpenAICodexUpdateRoutes } from '../src/update-routes.ts'
import type { OpenAICodexTrustedOriginsStore } from '../src/trusted-origins.ts'
import { CODEX_CONNECT_VERSION } from '../src/version.ts'

const roots: string[] = []
afterEach(async () => {
  vi.unstubAllGlobals()
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function manifest(path: string, name: string, version: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify({ name, version }))
}

async function hostInstallation(version: string, peerVersion = version): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'codex-connect-runtime-'))
  roots.push(root)
  const modules = join(root, 'node_modules')
  const anchor = join(modules, '@deepseek-ai/dsh', 'package.json')
  await manifest(anchor, '@deepseek-ai/dsh', version)
  for (const name of DSH_METADATA_PACKAGES) await manifest(join(modules, name, 'package.json'), name, peerVersion)
  // Host-owned pi-ai must not replace the plugin's dependency metadata.
  await manifest(join(modules, '@earendil-works/pi-ai', 'package.json'), '@earendil-works/pi-ai', '0.87.1')
  return anchor
}

async function readRuntime(profile?: unknown) {
  const fixture = httpRouteTestContext()
  if (profile !== undefined) {
    (fixture.ctx as unknown as { provide(name: 'profileContext', value: unknown): void }).provide('profileContext', profile)
  }
  const fetchImpl = vi.fn(async () => { throw new Error('runtime must not fetch') })
  vi.stubGlobal('fetch', fetchImpl)
  const origins = { has: async () => false } as unknown as OpenAICodexTrustedOriginsStore
  registerOpenAICodexUpdateRoutes(fixture.ctx, { currentVersion: '9.9.9-test', fetchImpl }, origins)
  const observed = { status: 0, body: '', headers: {} as Record<string, string> }
  const res = {
    writeHead(status: number, headers: Record<string, string>) { observed.status = status; observed.headers = headers; return this },
    end(body: string) { observed.body = body; return this },
  } as unknown as ServerResponse
  const req = { method: 'GET', headers: { host: '127.0.0.1:3081' }, socket: { remoteAddress: '127.0.0.1' } } as IncomingMessage
  await fixture.routes.get(`exact:${OPENAI_CODEX_RUNTIME_PATH}`)!.handler(req, res)
  expect(fetchImpl).not.toHaveBeenCalled()
  expect(observed.status).toBe(200)
  expect(observed.headers['cache-control']).toBe('no-store')
  const report = parseOpenAICodexRuntimeReport(JSON.parse(observed.body))
  expect(report).toBeDefined()
  return { report: report!, body: observed.body }
}

describe('public Host installation fact', () => {
  it.each(SUPPORTED_DSH_PLUGIN_API_VERSIONS)('reports exact coherent %s without treating the anchor as loaded-module proof', async version => {
    const anchor = await hostInstallation(version)
    const { report, body } = await readRuntime({
      installAnchor: anchor,
      get home() { throw new Error('must not read profile home') },
      get dir() { throw new Error('must not read profile directory') },
      get overlays() { throw new Error('must not read profile configuration') },
      get packageManager() { throw new Error('must not inspect package-manager environment') },
    })
    expect(report.identity).toEqual({
      scope: 'host', loadedPluginVersion: CODEX_CONNECT_VERSION, installedPluginVersion: CODEX_CONNECT_VERSION,
      pluginVersionState: 'match', dshMetadataSource: 'host-install-anchor',
    })
    expect(report.currentDshVersion).toBe(version)
    expect(report.compatibility.status).toBe('compatible')
    for (const name of DSH_METADATA_PACKAGES) expect(report.compatibility.packages[name].installed).toBe(version)
    expect(report.compatibility.packages['@earendil-works/pi-ai'].installed).toBe('0.85.1')
    expect(body).not.toContain(anchor)
    expect(body).not.toContain('9.9.9-test')
    expect(report).not.toHaveProperty('runningDshVersion')
  })

  it.each([
    undefined,
    {},
    { installAnchor: 'relative/private/package.json' },
    { installAnchor: '/private/not-a-manifest' },
    { get installAnchor() { throw new Error('/private/profile failure') } },
  ])('keeps Host DSH unknown without a usable optional anchor', async profile => {
    const { report, body } = await readRuntime(profile)
    expect(report.identity.loadedPluginVersion).toBe(CODEX_CONNECT_VERSION)
    expect(report.identity.dshMetadataSource).toBe('unknown')
    expect(report.compatibility.status).toBe('unknown')
    expect(report).not.toHaveProperty('currentDshVersion')
    for (const name of DSH_METADATA_PACKAGES) expect(report.compatibility.packages[name]).toMatchObject({ installed: null, status: 'unknown' })
    expect(body).not.toContain('/private')
  })

  it('does not fall back to local peers when the launch anchor is invalid', async () => {
    const anchor = await hostInstallation('0.2.1-alpha.1')
    await manifest(anchor, 'not-the-host', '0.2.1-alpha.1')
    const { report } = await readRuntime({ installAnchor: anchor })
    expect(report.compatibility.status).toBe('unknown')
    expect(report.identity.dshMetadataSource).toBe('unknown')
    expect(report).not.toHaveProperty('currentDshVersion')
  })

  it('does not mark a supported peer triple compatible with a different selected root version', async () => {
    const anchor = await hostInstallation('0.2.1-alpha.1', '0.2.1-alpha.2')
    const { report } = await readRuntime({ installAnchor: anchor })
    expect(report.compatibility.status).toBe('unverified')
    expect(report).not.toHaveProperty('currentDshVersion')
    expect(report.compatibility.packages['@deepseek-ai/dsh-llm'].status).toBe('compatible')
  })

  it('keeps missing compaction metadata unknown even when llm and adapter agree', async () => {
    const anchor = await hostInstallation('0.2.1-alpha.1')
    const modules = dirname(dirname(dirname(anchor)))
    await rm(join(modules, '@deepseek-ai/dsh-compaction', 'package.json'))
    const { report } = await readRuntime({ installAnchor: anchor })
    expect(report.compatibility.status).toBe('unknown')
    expect(report).not.toHaveProperty('currentDshVersion')
  })
})
