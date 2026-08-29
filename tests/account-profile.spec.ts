import { Buffer } from 'node:buffer'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { OAuthCredential } from '@earendil-works/pi-ai'
import {
  OPENAI_CODEX_ACCOUNT_PROFILES_FILENAME,
  resolveOpenAICodexAccountProfiles,
} from '../src/account-profile.ts'

let root: string | undefined

afterEach(async () => {
  vi.unstubAllEnvs()
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

function access(name?: string, email?: string): string {
  const profile = {
    ...(name === undefined ? {} : { name }),
    ...(email === undefined ? {} : { email }),
  }
  const payload = Buffer.from(JSON.stringify({ 'https://api.openai.com/profile': profile })).toString('base64url')
  return `header.${payload}.signature`
}

function credential(accountId: string, token: string): OAuthCredential {
  return {
    type: 'oauth',
    access: token,
    refresh: `refresh-${accountId}`,
    expires: Date.now() + 60_000,
    accountId,
  }
}

async function profileFile(): Promise<string> {
  root = await mkdtemp(join(tmpdir(), 'dsh-codex-profiles-'))
  return join(root, OPENAI_CODEX_ACCOUNT_PROFILES_FILENAME)
}

describe('OpenAI Codex local account profiles', () => {
  it('extracts a friendly name and email from the local OAuth JWT without network access', async () => {
    const filename = await profileFile()

    await expect(resolveOpenAICodexAccountProfiles([
      credential('opaque-account-id', access('Ada Lovelace', 'ada@example.com')),
    ], filename)).resolves.toEqual([
      { displayName: 'Ada Lovelace', email: 'ada@example.com', source: 'oauth' },
    ])
  })

  it('lets the local file override profiles by email or account id', async () => {
    const filename = await profileFile()
    await writeFile(filename, JSON.stringify({
      version: 1,
      accounts: {
        'work@example.com': 'Work account',
        'account-2': { name: 'Personal', email: 'personal@example.net' },
      },
    }))

    await expect(resolveOpenAICodexAccountProfiles([
      credential('account-1', access('OAuth Name', 'work@example.com')),
      credential('account-2', access('Second Name', 'second@example.com')),
    ], filename)).resolves.toEqual([
      { displayName: 'Work account', email: 'work@example.com', source: 'file' },
      { displayName: 'Personal', email: 'personal@example.net', source: 'file' },
    ])
  })

  it('uses the configured local username before generated labels', async () => {
    const filename = await profileFile()
    await writeFile(filename, JSON.stringify({ version: 1, localUsername: 'Burning', accounts: {} }))

    await expect(resolveOpenAICodexAccountProfiles([
      credential('account-1', 'not-a-jwt'),
      credential('account-2', 'also-not-a-jwt'),
    ], filename)).resolves.toEqual([
      { displayName: 'Burning · 1', source: 'local' },
      { displayName: 'Burning · 2', source: 'local' },
    ])
  })

  it('ignores malformed metadata and never exposes an opaque id as the label', async () => {
    const filename = await profileFile()
    await writeFile(filename, '{"version":1,"accounts":{"opaque-id":{"unknown":"secret"}}}')
    for (const key of ['OPENAI_CODEX_LOCAL_USERNAME', 'USERNAME', 'USER', 'LOGNAME']) vi.stubEnv(key, '')

    const [profile] = await resolveOpenAICodexAccountProfiles([
      credential('opaque-id', 'not-a-jwt'),
    ], filename)
    expect(profile?.displayName).not.toBe('opaque-id')
    expect(profile?.source).toMatch(/local|generated/u)
  })
})
