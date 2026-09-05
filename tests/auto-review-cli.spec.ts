import { describe, expect, it, vi } from 'vitest'
import { runAutoReviewProbeCommand } from '../src/auto-review-cli.ts'
import type { AutoReviewProbeDependencies } from '../src/auto-review-cli.ts'
import { evaluateCompatibility } from '../src/compatibility.ts'

const secret = 'private-access'

function fixture(): AutoReviewProbeDependencies {
  return {
    diagnose: async () => ({
      package: 'dsh-codex-connect', version: '0.1.0-alpha.4.27', node: 'v22.19.0',
      credentialFile: { path: '/private/credential.json', state: 'owner-only', mode: '600' },
      capabilities: { modelProvider: true, search: false, imageTool: false, imageGeneration: false, changesHarnessDefaultModel: false, changesHarnessSearchRoute: false },
      providerConflict: false, hints: [],
      compatibility: evaluateCompatibility({ nodeVersion: 'v22.19.0', packageVersions: {
        '@deepseek-ai/dsh-llm': '0.1.2-rc.1', '@deepseek-ai/dsh-llm-pi-ai': '0.1.2-rc.1', '@earendil-works/pi-ai': '0.84.4',
      } }),
    }),
    credentials: { read: async () => ({ type: 'oauth', access: secret, refresh: 'private-refresh', accountId: 'private-account', expires: 10_000 }) },
    probe: async () => ({ outcome: 'completed', httpStatus: 200 }),
    now: () => 1000,
  }
}

describe('auto-review capability command', () => {
  it('reports only allowlisted evidence for the fixed reviewer route', async () => {
    let output = ''
    vi.spyOn(process.stdout, 'write').mockImplementation(chunk => { output += String(chunk); return true })
    expect(await runAutoReviewProbeCommand(['--json'], fixture())).toBe(0)
    expect(JSON.parse(output)).toMatchObject({
      scope: 'auto-review-route-only', model: 'codex-auto-review', probe: { state: 'fresh', httpStatus: 200 },
      checks: { runtime: { status: 'supported' }, oauth: { status: 'supported' }, reviewer: { status: 'supported' } },
    })
    expect(output).not.toContain('private-')
  })

  it.each([
    [{ outcome: 'http-rejected', httpStatus: 404 }, 1, 'rejected'],
    [{ outcome: 'incomplete', httpStatus: 200 }, 2, 'unknown'],
    [{ outcome: 'timeout' }, 2, 'unknown'],
    [{ outcome: 'cancelled' }, 2, 'unknown'],
  ] as const)('fails closed for %j', async (evidence, code, status) => {
    const deps = fixture()
    deps.probe = async () => evidence
    let output = ''
    vi.spyOn(process.stdout, 'write').mockImplementation(chunk => { output += String(chunk); return true })
    expect(await runAutoReviewProbeCommand(['--json'], deps)).toBe(code)
    expect(JSON.parse(output).checks.reviewer.status).toBe(status)
  })

  it('turns an unexpected transport throw into unknown evidence without leaking it', async () => {
    const deps = fixture()
    deps.probe = async () => { throw new Error('private-transport-error') }
    let output = ''
    vi.spyOn(process.stdout, 'write').mockImplementation(chunk => { output += String(chunk); return true })
    expect(await runAutoReviewProbeCommand(['--json'], deps)).toBe(2)
    expect(JSON.parse(output).checks.reviewer).toMatchObject({ status: 'unknown', reason: 'network-or-stream-error' })
    expect(output).not.toContain('private-')
  })

  it.each([
    ['--timeout-ms', '0'], ['--timeout-ms', '60001'], ['--proxy', 'https://user:private-password@example.test'], ['--json', '--json'], ['--model', 'private-model'],
  ])('rejects unsafe or unknown flags without echoing values: %j', async (...args) => {
    let output = ''
    vi.spyOn(process.stderr, 'write').mockImplementation(chunk => { output += String(chunk); return true })
    expect(await runAutoReviewProbeCommand(args, fixture())).toBe(2)
    expect(output).toContain('Usage:')
    expect(output).not.toContain('private-')
  })
})
