import { chmod, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  OPENAI_CODEX_TRUSTED_ORIGINS_FILENAME,
  OpenAICodexTrustedOriginsStore,
  normalizeTrustedOrigin,
} from '../src/trusted-origins.ts'

let root: string | undefined

afterEach(async () => {
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

async function store(): Promise<OpenAICodexTrustedOriginsStore> {
  root = await mkdtemp(join(tmpdir(), 'dsh-trusted-origins-'))
  return new OpenAICodexTrustedOriginsStore(join(root, OPENAI_CODEX_TRUSTED_ORIGINS_FILENAME))
}

describe('OpenAICodexTrustedOriginsStore', () => {
  it.each([
    ['HTTP://Example.test:80/', 'http://example.test'],
    ['https://Example.test:443', 'https://example.test'],
    ['http://[::1]:3081/', 'http://[::1]:3081'],
  ])('normalizes %s', (raw, expected) => {
    expect(normalizeTrustedOrigin(raw)).toBe(expected)
  })

  it.each([
    'ftp://example.test',
    'http://user:pass@example.test',
    'http://example.test/path',
    'http://example.test/?query=1',
    'http://example.test/#fragment',
    'http://*.example.test',
    'http://10.0.0.0/24',
  ])('rejects non-exact origin %s', raw => {
    expect(() => normalizeTrustedOrigin(raw)).toThrow()
  })

  it('persists a strict owner-only document and keeps add/remove idempotent', async () => {
    const origins = await store()
    await expect(origins.list()).resolves.toEqual([])
    await expect(origins.trust('HTTP://LAN.example:80/')).resolves.toEqual(['http://lan.example'])
    await expect(origins.trust('http://lan.example')).resolves.toEqual(['http://lan.example'])
    await expect(origins.trust('https://lan.example:9443')).resolves.toEqual([
      'http://lan.example',
      'https://lan.example:9443',
    ])
    await expect(origins.untrust('http://lan.example')).resolves.toEqual(['https://lan.example:9443'])
    await expect(origins.untrust('http://lan.example')).resolves.toEqual(['https://lan.example:9443'])
    expect(JSON.parse(await readFile(origins.filename, 'utf8'))).toEqual({
      version: 1,
      mode: 'allowlist',
      origins: ['https://lan.example:9443'],
    })
    if (process.platform !== 'win32') expect((await stat(origins.filename)).mode & 0o777).toBe(0o600)
  })

  it('rejects unknown fields, unsupported mode, and broad permissions', async () => {
    const origins = await store()
    await writeFile(origins.filename, JSON.stringify({ version: 1, mode: 'allowlist', origins: [], extra: true }), { mode: 0o600 })
    await expect(origins.list()).rejects.toThrow(/unknown top-level field/u)
    await writeFile(origins.filename, JSON.stringify({ version: 1, mode: 'deny-all', origins: [] }), { mode: 0o600 })
    await expect(origins.list()).rejects.toThrow(/unsupported trusted-origins mode/u)
    if (process.platform !== 'win32') {
      await writeFile(origins.filename, JSON.stringify({ version: 1, mode: 'allowlist', origins: [] }), { mode: 0o644 })
      await chmod(origins.filename, 0o644)
      await expect(origins.list()).rejects.toThrow(/readable beyond its owner/u)
    }
  })

  it('serializes concurrent writers without losing entries', async () => {
    const origins = await store()
    await Promise.all([
      origins.trust('http://one.example'),
      origins.trust('http://two.example'),
    ])
    await expect(origins.list()).resolves.toEqual(['http://one.example', 'http://two.example'])
  })
})
