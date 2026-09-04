import { describe, expect, it, vi } from 'vitest'
import { CodexCapabilityDiagnostics } from '../src/capability-diagnostics.ts'
import type { CapabilityDiagnosticDependencies, CapabilityRequest } from '../src/capability-diagnostics.ts'
import { evaluateCompatibility } from '../src/compatibility.ts'
import type { OpenAICodexDiagnosticReport } from '../src/doctor.ts'
import type { ResponsesProbeEvidence } from '../src/capability-probe.ts'
import { modelCatalogFixture } from './model-catalog-fixture.ts'

const model = 'gpt-5.6-sol'
const secrets = ['private-access', 'private-account', 'private-refresh', '/private/credential.json']

function fixture() {
  let now = 100_000
  const local: OpenAICodexDiagnosticReport = {
    package: 'dsh-codex-connect', version: '0.1.0-alpha.4.20', node: 'v22.19.0',
    credentialFile: { path: secrets[3]!, state: 'owner-only', mode: '600' },
    capabilities: { modelProvider: true, search: false, imageTool: false, imageGeneration: false, changesHarnessDefaultModel: false, changesHarnessSearchRoute: false },
    providerConflict: false, hints: [],
    compatibility: evaluateCompatibility({ nodeVersion: 'v22.19.0', packageVersions: {
      '@deepseek-ai/dsh-llm': '0.1.2-rc.1', '@deepseek-ai/dsh-llm-pi-ai': '0.1.2-rc.1', '@earendil-works/pi-ai': '0.84.2',
    } }),
  }
  const credential = { type: 'oauth' as const, access: secrets[0]!, accountId: secrets[1]!, refresh: secrets[2]!, expires: 1_000_000 }
  const probe = vi.fn(async (): Promise<ResponsesProbeEvidence> => ({ outcome: 'completed', httpStatus: 200 }))
  const read = vi.fn(async () => credential)
  const readVersion = vi.fn(async (_name: string): Promise<string | undefined> => '0.1.2-rc.1')
  const deps: CapabilityDiagnosticDependencies = {
    diagnose: async () => local, readVersion, catalog: () => modelCatalogFixture([{ id: model, name: model }]),
    credentials: { read }, probe, now: () => now,
  }
  const request: CapabilityRequest = { model, probe: true, proxyUrl: undefined, timeoutMs: 1000 }
  return { local, credential, read, probe, deps, request, readVersion, tick: (delta: number) => { now += delta }, diagnostics: new CodexCapabilityDiagnostics(60_000, deps) }
}

describe('capability evidence', () => {
  it('treats file metadata and catalog membership as unknown without reading credentials or probing', async () => {
    const f = fixture()
    const report = await f.diagnostics.inspect({ ...f.request, probe: false })
    expect(report.checks.runtime.status).toBe('supported')
    for (const id of ['oauth', 'model', 'responses', 'transport', 'contextManagement', 'continuation'] as const) expect(report.checks[id].status).toBe('unknown')
    expect(report.probe.state).toBe('not-requested')
    expect(f.read).not.toHaveBeenCalled()
    expect(f.probe).not.toHaveBeenCalled()
    for (const secret of secrets) expect(JSON.stringify(report)).not.toContain(secret)
  })

  it('gates network work on the complete declared host package set, including session', async () => {
    const f = fixture()
    f.readVersion.mockImplementation(async name => name === '@deepseek-ai/dsh-session' ? '0.1.0-rc.7' : '0.1.2-rc.1')
    const report = await f.diagnostics.inspect(f.request)
    expect(report.checks.runtime).toMatchObject({ status: 'rejected', reason: 'declared-version-mismatch' })
    expect(report.checks.runtime.action).toContain('0.1.0-alpha.4.14')
    expect(report.probe.state).toBe('skipped')
    expect(f.read).not.toHaveBeenCalled()
    expect(f.probe).not.toHaveBeenCalled()
  })

  it.each(['v20.19.0', 'v23.0.0'])('rejects unsupported Node %s', async node => {
    const f = fixture()
    f.local.node = node
    expect((await f.diagnostics.inspect(f.request)).checks.runtime.status).toBe('rejected')
    expect(f.probe).not.toHaveBeenCalled()
  })

  it('keeps missing package evidence unknown and prevents probing', async () => {
    const f = fixture()
    f.readVersion.mockResolvedValue(undefined)
    expect((await f.diagnostics.inspect(f.request)).checks.runtime.status).toBe('unknown')
    expect(f.probe).not.toHaveBeenCalled()
  })

  it.each(['v24.0.0-rc.1', 'private-access'])('does not claim verified Node support for %s', async node => {
    const f = fixture()
    f.local.node = node
    const report = await f.diagnostics.inspect(f.request)
    expect(report.checks.runtime.status).toBe('unknown')
    expect(JSON.stringify(report)).not.toContain('private-access')
    expect(f.probe).not.toHaveBeenCalled()
  })

  it.each(['missing', 'permissions-too-broad', 'not-a-regular-file', 'unreadable-metadata'] as const)('rejects credential metadata state %s', async state => {
    const f = fixture()
    f.local.credentialFile.state = state
    expect((await f.diagnostics.inspect(f.request)).checks.oauth.status).toBe('rejected')
    expect(f.read).not.toHaveBeenCalled()
    expect(f.probe).not.toHaveBeenCalled()
  })

  it('omits unknown model input instead of reflecting arbitrary command text', async () => {
    const f = fixture()
    const report = await f.diagnostics.inspect({ ...f.request, model: 'private-access' })
    expect(report.model).toBeNull()
    expect(report.checks.model.status).toBe('rejected')
    expect(JSON.stringify(report)).not.toContain('private-access')
    expect(f.probe).not.toHaveBeenCalled()
  })

  it('does not expose credential parser details or refresh expired credentials', async () => {
    const f = fixture()
    f.read.mockRejectedValueOnce(new Error(secrets.join(' ')))
    const failed = await f.diagnostics.inspect(f.request)
    expect(failed.checks.oauth.status).toBe('rejected')
    for (const secret of secrets) expect(JSON.stringify(failed)).not.toContain(secret)
    f.credential.expires = 1
    expect((await f.diagnostics.inspect(f.request)).checks.oauth).toMatchObject({ status: 'unknown', reason: 'access-token-expired' })
    expect(f.probe).not.toHaveBeenCalled()
  })

  it.each([
    [{ outcome: 'completed', httpStatus: 200 }, 'supported', 'supported', 'supported'],
    [{ outcome: 'http-rejected', httpStatus: 401 }, 'rejected', 'rejected', 'unknown'],
    [{ outcome: 'http-rejected', httpStatus: 403 }, 'rejected', 'rejected', 'unknown'],
    [{ outcome: 'http-rejected', httpStatus: 400 }, 'rejected', 'unknown', 'unknown'],
    [{ outcome: 'http-rejected', httpStatus: 404 }, 'rejected', 'unknown', 'unknown'],
    [{ outcome: 'transient', httpStatus: 429 }, 'unknown', 'unknown', 'unknown'],
    [{ outcome: 'transient', httpStatus: 503 }, 'unknown', 'unknown', 'unknown'],
    [{ outcome: 'incomplete', httpStatus: 200 }, 'unknown', 'unknown', 'unknown'],
    [{ outcome: 'timeout' }, 'unknown', 'unknown', 'unknown'],
    [{ outcome: 'network-error' }, 'unknown', 'unknown', 'unknown'],
  ] as const)('scopes %j without inferring optional capabilities', async (evidence, responses, oauth, selectedModel) => {
    const f = fixture()
    f.probe.mockResolvedValue(evidence)
    const report = await f.diagnostics.inspect(f.request)
    expect(report.checks.responses.status).toBe(responses)
    expect(report.checks.oauth.status).toBe(oauth)
    expect(report.checks.model.status).toBe(selectedModel)
    expect(report.checks.contextManagement.status).toBe('unknown')
    expect(report.checks.continuation.status).toBe('unknown')
    expect(report.checks.nativeCompaction.status).toBe('rejected')
    expect(report.checks.websocketReuse.status).toBe('rejected')
    expect(report.checks.providerFallback).toMatchObject({ status: 'rejected', reason: 'no-automatic-provider-failover' })
    expect(f.probe).toHaveBeenCalledTimes(1)
    for (const secret of secrets) expect(JSON.stringify(report)).not.toContain(secret)
  })

  it('expires evidence lazily and invalidates it when credentials or network policy change', async () => {
    const f = fixture()
    expect((await f.diagnostics.inspect(f.request)).probe.state).toBe('fresh')
    expect((await f.diagnostics.inspect(f.request)).probe.state).toBe('cached')
    f.tick(60_000)
    expect((await f.diagnostics.inspect(f.request)).probe.state).toBe('fresh')
    f.credential.access = 'rotated-private-access'
    expect((await f.diagnostics.inspect(f.request)).probe.state).toBe('fresh')
    expect((await f.diagnostics.inspect({ ...f.request, proxyUrl: 'http://localhost:7890' })).probe.state).toBe('fresh')
    expect(f.probe).toHaveBeenCalledTimes(4)
  })

  it('clears evidence across sign-out and never caches transient results', async () => {
    const f = fixture()
    await f.diagnostics.inspect(f.request)
    f.local.credentialFile.state = 'missing'
    await f.diagnostics.inspect(f.request)
    f.local.credentialFile.state = 'owner-only'
    f.probe.mockResolvedValue({ outcome: 'transient', httpStatus: 503 })
    await f.diagnostics.inspect(f.request)
    await f.diagnostics.inspect(f.request)
    expect(f.probe).toHaveBeenCalledTimes(3)
  })

  it('does not reuse evidence for another model, account, or incompatible installation', async () => {
    const f = fixture()
    f.deps.catalog = () => modelCatalogFixture([{ id: model, name: model }, { id: 'gpt-5.6-terra', name: 'Terra' }])
    await f.diagnostics.inspect(f.request)
    expect((await f.diagnostics.inspect({ ...f.request, model: 'gpt-5.6-terra' })).probe.state).toBe('fresh')
    f.credential.accountId = 'another-private-account'
    expect((await f.diagnostics.inspect(f.request)).probe.state).toBe('fresh')
    f.readVersion.mockResolvedValue('0.1.0-rc.7')
    expect((await f.diagnostics.inspect(f.request)).probe.state).toBe('skipped')
    f.readVersion.mockResolvedValue('0.1.2-rc.1')
    expect((await f.diagnostics.inspect(f.request)).probe.state).toBe('fresh')
    expect(f.probe).toHaveBeenCalledTimes(4)
  })
})
