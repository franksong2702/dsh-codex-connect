import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const mocked = vi.hoisted(() => ({
  diagnose: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  authPath: vi.fn(() => '/Users/fixture/.dsh/openai-codex-auth.json'),
  authStatus: vi.fn(),
}))

vi.mock('../src/index.ts', () => ({
  diagnoseOpenAICodex: mocked.diagnose,
  loginOpenAICodex: mocked.login,
  logoutOpenAICodex: mocked.logout,
  openAICodexAuthPath: mocked.authPath,
  openAICodexAuthStatus: mocked.authStatus,
}))

import { run } from '../src/bin.ts'

let root: string | undefined

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

afterEach(async () => {
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

describe('dsh-codex-connect CLI', () => {
  it('trusts, lists, and untrusts exact origins through the server CLI', async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-codex-connect-bin-'))
    vi.stubEnv('DSH_HOME', root)
    let output = ''
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
      output += String(chunk)
      return true
    })

    await expect(run(['trust-origin', 'HTTP://LAN.example:80/'])).resolves.toBe(0)
    expect(output).toContain('Trusted browser origin: http://lan.example')
    output = ''
    await expect(run(['trust-origin', 'http://lan.example'])).resolves.toBe(0)
    await expect(run(['trusted-origins'])).resolves.toBe(0)
    expect(output).toContain('http://lan.example')
    output = ''
    await expect(run(['untrust-origin', 'http://lan.example'])).resolves.toBe(0)
    output = ''
    await expect(run(['trusted-origins', '--json'])).resolves.toBe(0)
    expect(JSON.parse(output)).toEqual({ schemaVersion: 1, origins: [] })
    await expect(readFile(join(root, '.openai-codex-trusted-origins.json'), 'utf8')).resolves.toContain('origins')
  })

  it('documents doctor and uses the package executable name', async () => {
    let output = ''
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
      output += String(chunk)
      return true
    })
    await expect(run(['--help'])).resolves.toBe(0)
    expect(output).toContain('Usage: dsh-codex-connect <doctor|login|logout|status>')
    expect(output).toContain('dsh-codex-connect trust-origin <origin>')
    expect(output).toContain('dsh-codex-connect trusted-origins [--json]')
    expect(output).toContain('doctor         inspect secret-free')
  })

  it('uses a consistent error prefix', async () => {
    let output = ''
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Uint8Array) => {
      output += String(chunk)
      return true
    })
    await expect(run(['doctor', '--device-code'])).resolves.toBe(1)
    expect(output).toMatch(/^dsh-codex-connect:/)
    expect(output).not.toContain('dsh-openai-codex:')
  })

  it('emits one secret-free JSON document for doctor', async () => {
    const credentialPath = '/Users/fixture/.dsh/openai-codex-auth.json'
    mocked.diagnose.mockResolvedValue({
      package: 'dsh-codex-connect',
      version: '0.1.0-alpha.4.8',
      node: 'v22.19.0',
      credentialFile: { path: credentialPath, state: 'owner-only', mode: '600' },
      capabilities: {
        modelProvider: true,
        search: false,
        imageTool: false,
        changesHarnessDefaultModel: false,
        changesHarnessSearchRoute: false,
      },
      providerConflict: false,
      compatibility: {
        schemaVersion: 1,
        status: 'compatible',
        node: { supported: '^22.19.0 || >=24.0.0', installed: 'v22.19.0', status: 'compatible' },
        packages: {
          '@deepseek-ai/dsh-llm': { supported: '0.1.0-rc.6', installed: '0.1.0-rc.6', status: 'compatible' },
          '@deepseek-ai/dsh-llm-pi-ai': { supported: '0.1.0-rc.6', installed: '0.1.0-rc.6', status: 'compatible' },
          '@earendil-works/pi-ai': { supported: '0.82.1', installed: '0.82.1', status: 'compatible' },
        },
      },
      hints: ['Safe diagnostic hint'],
    })
    let output = ''
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
      output += String(chunk)
      return true
    })

    await expect(run(['doctor', '--json'])).resolves.toBe(0)
    const parsed: unknown = JSON.parse(output)
    expect(parsed).toMatchObject({
      schemaVersion: 1,
      package: 'dsh-codex-connect',
      version: '0.1.0-alpha.4.8',
      node: 'v22.19.0',
      credentialFile: { state: 'owner-only', mode: '600' },
      capabilities: {
        modelProvider: true,
        search: false,
        imageTool: false,
        changesHarnessDefaultModel: false,
        changesHarnessSearchRoute: false,
      },
      providerConflict: false,
      hints: ['Safe diagnostic hint'],
    })
    expect(parsed).not.toHaveProperty('credentialFile.path')
    expect(parsed).toMatchObject({ compatibility: { schemaVersion: 1, status: 'compatible' } })
    for (const secret of [
      credentialPath,
      'https://auth.openai.com/oauth/authorize?fixture=secret',
      'fixture-access-token',
      'fixture-refresh-token',
      'fixture-account-id',
      '2099-01-01T00:00:00.000Z',
    ]) {
      expect(output).not.toContain(secret)
    }
  })

  it('returns exit 1 and a JSON compatibility status for an incompatible doctor report', async () => {
    mocked.diagnose.mockResolvedValue({
      package: 'dsh-codex-connect',
      version: '0.1.0-alpha.4.8',
      node: 'v22.19.0',
      credentialFile: { path: '/Users/fixture/.dsh/openai-codex-auth.json', state: 'missing' },
      capabilities: {
        modelProvider: true,
        search: false,
        imageTool: false,
        changesHarnessDefaultModel: false,
        changesHarnessSearchRoute: false,
      },
      providerConflict: false,
      compatibility: {
        schemaVersion: 1,
        status: 'incompatible',
        node: { supported: '^22.19.0 || >=24.0.0', installed: 'v22.19.0', status: 'compatible' },
        packages: {
          '@deepseek-ai/dsh-llm': { supported: '0.1.0-rc.6', installed: '0.1.0-rc.5', status: 'incompatible' },
          '@deepseek-ai/dsh-llm-pi-ai': { supported: '0.1.0-rc.6', installed: '0.1.0-rc.5', status: 'incompatible' },
          '@earendil-works/pi-ai': { supported: '0.82.1', installed: '0.82.1', status: 'compatible' },
        },
      },
      hints: ['Compatibility mismatch'],
    })
    let output = ''
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
      output += String(chunk)
      return true
    })
    await expect(run(['doctor', '--json'])).resolves.toBe(1)
    expect(JSON.parse(output)).toMatchObject({ compatibility: { status: 'incompatible' } })
    expect(output).not.toContain('/Users/fixture')
  })

  it.each([
    [true, 'signed-in', 0],
    [false, 'signed-out', 1],
  ] as const)('emits secret-free JSON status for %s authentication', async (authenticated, expectedStatus, expectedCode) => {
    mocked.authStatus.mockResolvedValue({
      authenticated,
      expiresAt: new Date('2099-01-01T00:00:00.000Z'),
      accountId: 'fixture-account-id',
      access: 'fixture-access-token',
      refresh: 'fixture-refresh-token',
    })
    let output = ''
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
      output += String(chunk)
      return true
    })

    await expect(run(['status', '--json'])).resolves.toBe(expectedCode)
    const parsed: unknown = JSON.parse(output)
    expect(parsed).toMatchObject({
      schemaVersion: 1,
      package: 'dsh-codex-connect',
      status: expectedStatus,
    })
    expect(parsed).not.toHaveProperty('expiresAt')
    expect(parsed).not.toHaveProperty('accountId')
    expect(parsed).not.toHaveProperty('access')
    expect(parsed).not.toHaveProperty('refresh')
    for (const secret of [
      'fixture-account-id',
      'fixture-access-token',
      'fixture-refresh-token',
      '2099-01-01T00:00:00.000Z',
    ]) {
      expect(output).not.toContain(secret)
    }
  })

  it.each([
    ['login', '--json'],
    ['logout', '--json'],
    ['doctor', '--device-code'],
    ['status', '--device-code'],
    ['login', '--device-code', '--json'],
  ] as const)('rejects unsupported flags for %s', async (...argv) => {
    let output = ''
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Uint8Array) => {
      output += String(chunk)
      return true
    })

    await expect(run(argv)).resolves.toBe(1)
    expect(output).toMatch(/^dsh-codex-connect: invalid options for /)
  })
})
