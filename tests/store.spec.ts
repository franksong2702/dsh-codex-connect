import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { CredentialStore, OAuthCredential } from '@earendil-works/pi-ai'
import {
  OpenAICodexCredentialStore,
  OPENAI_CODEX_ACCOUNT_LIMIT,
  OPENAI_CODEX_AUTH_DOCUMENT_LIMIT,
  OPENAI_CODEX_PROVIDER,
} from '../src/store.ts'

let root: string | undefined

afterEach(async () => {
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

function credential(access = 'access-secret', accountId = 'account-1'): OAuthCredential {
  return {
    type: 'oauth',
    access,
    refresh: 'refresh-secret',
    expires: Date.now() + 60_000,
    accountId,
  }
}

async function store(): Promise<OpenAICodexCredentialStore> {
  root = await mkdtemp(join(tmpdir(), 'dsh-openai-codex-'))
  return new OpenAICodexCredentialStore(join(root, 'auth.json'))
}

describe('OpenAICodexCredentialStore', () => {
  it.each(['active', 'captured'] as const)('does not mutate the %s store after cancellation while another writer holds the real file lock', async (kind) => {
    const auth = await store()
    await auth.modify(OPENAI_CODEX_PROVIDER, async () => credential('a', 'account-a'))
    const target: CredentialStore = kind === 'active' ? auth : await auth.captureActiveAccount()
    let release!: () => void
    let entered!: () => void
    const holding = new Promise<void>(resolve => { entered = resolve })
    const gate = new Promise<void>(resolve => { release = resolve })
    const writer = auth.modify(OPENAI_CODEX_PROVIDER, async () => { entered(); await gate; return undefined })
    await holding
    const abort = new AbortController()
    let called = false
    const queued = target.modify(OPENAI_CODEX_PROVIDER, async () => {
      called = true
      return credential('b', 'account-a')
    }, { signal: abort.signal }).then(() => 'committed', () => 'cancelled')
    abort.abort()
    release()
    await writer
    expect(await queued).toBe('cancelled')
    expect(called).toBe(false)
    expect(await auth.read(OPENAI_CODEX_PROVIDER)).toMatchObject({ access: 'a', accountId: 'account-a' })
    expect(await target.read(OPENAI_CODEX_PROVIDER)).toMatchObject({ access: 'a', accountId: 'account-a' })
  })

  it('awaits a mutation already started when cancellation arrives', async () => {
    const auth = await store()
    const abort = new AbortController()
    const result = await (auth as CredentialStore).modify(OPENAI_CODEX_PROVIDER, async () => {
      abort.abort()
      return credential('b', 'account-b')
    }, { signal: abort.signal })
    expect(result).toMatchObject({ accountId: 'account-b' })
    expect(await auth.read(OPENAI_CODEX_PROVIDER)).toEqual(result)
  })
  it('persists, lists, detaches, and removes all OAuth credentials owner-only', async () => {
    const auth = await store()
    expect(await auth.read(OPENAI_CODEX_PROVIDER)).toBeUndefined()

    await auth.modify(OPENAI_CODEX_PROVIDER, () => Promise.resolve(credential()))
    expect(await auth.list()).toEqual([{ providerId: OPENAI_CODEX_PROVIDER, type: 'oauth' }])
    const first = await auth.read(OPENAI_CODEX_PROVIDER)
    expect(first).toMatchObject({ type: 'oauth', accountId: 'account-1' })
    if (first?.type !== 'oauth') throw new Error('expected OAuth credential')
    first.access = 'mutated-only-in-caller'
    expect(await auth.read(OPENAI_CODEX_PROVIDER)).toMatchObject({ access: 'access-secret' })
    if (process.platform !== 'win32') expect((await stat(auth.filename)).mode & 0o777).toBe(0o600)

    await auth.delete(OPENAI_CODEX_PROVIDER)
    expect(await auth.list()).toEqual([])
  })

  it('serializes cross-instance refresh writes so each sees the prior value', async () => {
    const first = await store()
    const second = new OpenAICodexCredentialStore(first.filename)
    await first.modify(OPENAI_CODEX_PROVIDER, () => Promise.resolve(credential('zero')))
    const seen: string[] = []
    await Promise.all([
      first.modify(OPENAI_CODEX_PROVIDER, async (current) => {
        seen.push(current?.type === 'oauth' ? current.access : 'missing')
        await new Promise(resolve => setTimeout(resolve, 20))
        return credential('one')
      }),
      second.modify(OPENAI_CODEX_PROVIDER, async (current) => {
        seen.push(current?.type === 'oauth' ? current.access : 'missing')
        return credential('two')
      }),
    ])
    expect(seen[0]).toBe('zero')
    expect(seen[1]).toMatch(/one|two/)
    expect(seen[1]).not.toBe('zero')
  })

  it('rejects malformed and over-broad documents without echoing their contents', async () => {
    const auth = await store()
    await writeFile(auth.filename, '{"version":1,"credential":{"type":"oauth","access":"leaked-secret"}}', { mode: 0o600 })
    await expect(auth.read(OPENAI_CODEX_PROVIDER)).rejects.toThrow(/explicit migration/)
    const failure = await auth.migrateLegacyStorage({ confirmStopped: true }).catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(Error)
    expect(String(failure)).toContain('refresh')
    expect(String(failure)).not.toContain('leaked-secret')

    if (process.platform !== 'win32') {
      await writeFile(auth.filename, JSON.stringify({ version: 1, credential: credential() }), { mode: 0o644 })
      await chmod(auth.filename, 0o644)
      await expect(auth.read(OPENAI_CODEX_PROVIDER)).rejects.toThrow(/readable beyond its owner/)
    }
  })

  it('writes the multi-account document and refuses provider ids it does not own', async () => {
    const auth = await store()
    await auth.modify(OPENAI_CODEX_PROVIDER, () => Promise.resolve(credential()))
    expect(JSON.parse(await readFile(auth.filename, 'utf8'))).toMatchObject({
      version: 3,
      cipher: 'aes-256-gcm',
    })
    expect(await readFile(auth.filename, 'utf8')).not.toContain('access-secret')
    expect(await readFile(auth.filename, 'utf8')).not.toContain('refresh-secret')
    expect(await readFile(auth.filename, 'utf8')).not.toContain('account-1')
    await expect(auth.modify('other', () => Promise.resolve(credential())))
      .rejects.toThrow(/does not own provider/)
    expect(await auth.read('other')).toBeUndefined()
  })

  it('requires explicit version 1 migration and never creates a plaintext rollback copy', async () => {
    const auth = await store()
    const original = `${JSON.stringify({ version: 1, credential: credential('old') }, null, 2)}\n`
    await writeFile(auth.filename, original, { mode: 0o600 })

    await expect(auth.modify(OPENAI_CODEX_PROVIDER, () => Promise.resolve(credential('new', 'account-2')))).rejects.toThrow(/explicit migration/)
    expect(await readFile(auth.filename, 'utf8')).toBe(original)
    await expect(auth.migrateLegacyStorage({ confirmStopped: false })).rejects.toThrow(/confirm-stopped/)
    await auth.migrateLegacyStorage({ confirmStopped: true })
    await auth.modify(OPENAI_CODEX_PROVIDER, () => Promise.resolve(credential('new', 'account-2')))

    expect(JSON.parse(await readFile(auth.filename, 'utf8'))).toMatchObject({
      version: 3,
      cipher: 'aes-256-gcm',
    })
    expect(await auth.read(OPENAI_CODEX_PROVIDER)).toMatchObject({ accountId: 'account-2' })
    expect(await auth.accounts()).toHaveLength(2)
    await expect(stat(auth.version1BackupFilename)).rejects.toMatchObject({ code: 'ENOENT' })

    await auth.modify(OPENAI_CODEX_PROVIDER, () => Promise.resolve(credential('newer', 'account-3')))
    await expect(stat(auth.version1BackupFilename)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('does not change either legacy file when its rollback copy is malformed', async () => {
    const auth = await store()
    const original = `${JSON.stringify({ version: 1, credential: credential('old') }, null, 2)}\n`
    const unrelated = '{"version":1,"credential":{"access":"synthetic-backup-secret"}}'
    await writeFile(auth.filename, original, { mode: 0o600 })
    await writeFile(auth.version1BackupFilename, unrelated, { mode: 0o600 })

    await expect(auth.migrateLegacyStorage({ confirmStopped: true }))
      .rejects.toThrow(/type must be oauth/u)
    expect(await readFile(auth.filename, 'utf8')).toBe(original)
    expect(await readFile(auth.version1BackupFilename, 'utf8')).toBe(unrelated)
  })

  it('lists opaque account summaries and activates a selected account', async () => {
    const auth = await store()
    await auth.modify(OPENAI_CODEX_PROVIDER, () => Promise.resolve(credential('one', 'provider-account-one')))
    await auth.modify(OPENAI_CODEX_PROVIDER, () => Promise.resolve(credential('two', 'provider-account-two')))

    const accounts = await auth.accounts()
    expect(accounts).toHaveLength(2)
    expect(accounts.map(account => account.accountKey)).not.toContain('provider-account-one')
    expect(JSON.stringify(accounts)).not.toContain('provider-account')
    expect(accounts.map(account => account.active)).toEqual([false, true])
    expect(accounts.map(account => account.displayName)).toEqual(['ChatGPT account 1', 'ChatGPT account 2'])
    expect(await auth.accountIdForAccess('one')).toBe('provider-account-one')
    expect(await auth.accountIdForAccess('missing')).toBeUndefined()

    await auth.activate(accounts[0]!.accountKey)
    expect(await auth.read(OPENAI_CODEX_PROVIDER)).toMatchObject({ accountId: 'provider-account-one' })
    expect((await auth.accounts()).map(account => account.active)).toEqual([true, false])
    const restarted = new OpenAICodexCredentialStore(auth.filename)
    expect(await restarted.read(OPENAI_CODEX_PROVIDER)).toMatchObject({ accountId: 'provider-account-one' })
    await expect(auth.activate('acct_0000000000000000000000000000000000000000000')).rejects.toThrow(/account not found/u)
  })

  it('refreshes a captured request account without switching or overwriting the current account', async () => {
    const auth = await store()
    await auth.modify(OPENAI_CODEX_PROVIDER, () => Promise.resolve(credential('one', 'account-1')))
    const captured = await auth.captureActiveAccount()
    await auth.modify(OPENAI_CODEX_PROVIDER, () => Promise.resolve(credential('two', 'account-2')))

    const refreshed = await captured.modify(OPENAI_CODEX_PROVIDER, async current => {
      expect(current).toMatchObject({ access: 'one', accountId: 'account-1' })
      return credential('one-refreshed', 'account-1')
    })

    expect(refreshed).toMatchObject({ access: 'one-refreshed', accountId: 'account-1' })
    expect(await captured.read(OPENAI_CODEX_PROVIDER)).toMatchObject({ access: 'one-refreshed', accountId: 'account-1' })
    expect(await auth.read(OPENAI_CODEX_PROVIDER)).toMatchObject({ access: 'two', accountId: 'account-2' })
    const accounts = await auth.accounts()
    expect(accounts.map(account => account.active)).toEqual([false, true])
    await auth.activate(accounts[0]!.accountKey)
    expect(await auth.read(OPENAI_CODEX_PROVIDER)).toMatchObject({ access: 'one-refreshed', accountId: 'account-1' })
  })

  it('requires an explicit replacement when removing the active account', async () => {
    const auth = await store()
    await auth.modify(OPENAI_CODEX_PROVIDER, () => Promise.resolve(credential('one', 'account-1')))
    await auth.modify(OPENAI_CODEX_PROVIDER, () => Promise.resolve(credential('two', 'account-2')))
    const accounts = await auth.accounts()
    const first = accounts[0]!
    const second = accounts[1]!

    await expect(auth.removeAccount(second.accountKey)).rejects.toThrow(/requires replacementAccountKey/u)
    await expect(auth.removeAccount(first.accountKey, second.accountKey)).rejects.toThrow(/only valid/u)
    await expect(auth.removeAccount(second.accountKey, 'acct_0000000000000000000000000000000000000000000'))
      .rejects.toThrow(/replacement account not found/u)
    await auth.removeAccount(second.accountKey, first.accountKey)
    expect(await auth.read(OPENAI_CODEX_PROVIDER)).toMatchObject({ accountId: 'account-1' })
    await expect(auth.removeAccount(second.accountKey)).rejects.toThrow(/account not found/u)
    await auth.removeAccount(first.accountKey)
    expect(await auth.read(OPENAI_CODEX_PROVIDER)).toBeUndefined()
  })

  it('removes a non-active account without changing the active account', async () => {
    const auth = await store()
    await auth.modify(OPENAI_CODEX_PROVIDER, () => Promise.resolve(credential('one', 'account-1')))
    await auth.modify(OPENAI_CODEX_PROVIDER, () => Promise.resolve(credential('two', 'account-2')))
    const accounts = await auth.accounts()
    await auth.removeAccount(accounts[0]!.accountKey)
    expect(await auth.read(OPENAI_CODEX_PROVIDER)).toMatchObject({ accountId: 'account-2' })
    expect(await auth.accounts()).toHaveLength(1)
  })

  it('enforces account and serialized document limits', async () => {
    const auth = await store()
    for (let index = 0; index < OPENAI_CODEX_ACCOUNT_LIMIT; index++) {
      await auth.modify(OPENAI_CODEX_PROVIDER, () => Promise.resolve(credential(`token-${String(index)}`, `account-${String(index)}`)))
    }
    await expect(auth.modify(OPENAI_CODEX_PROVIDER, () => Promise.resolve(credential('overflow', 'overflow'))))
      .rejects.toThrow(/at most 16 accounts/u)

    await writeFile(auth.filename, ' '.repeat(1024 * 1024 + 1), { mode: 0o600 })
    await expect(auth.read(OPENAI_CODEX_PROVIDER)).rejects.toThrow(/exceeds 1048576 bytes/u)
    await rm(auth.filename)
    await expect(auth.modify(OPENAI_CODEX_PROVIDER, () => Promise.resolve(credential('x'.repeat(OPENAI_CODEX_AUTH_DOCUMENT_LIMIT)))))
      .rejects.toThrow(/credential document exceeds/u)
  })

  it('rejects non-regular credential paths and clears migration backup on logout', async () => {
    const auth = await store()
    await mkdir(auth.filename)
    await expect(auth.read(OPENAI_CODEX_PROVIDER)).rejects.toThrow(/regular file/u)
    await rm(auth.filename, { recursive: true })
    await writeFile(auth.filename, JSON.stringify({ version: 1, credential: credential() }), { mode: 0o600 })
    await auth.migrateLegacyStorage({ confirmStopped: true })
    await auth.activate((await auth.accounts())[0]!.accountKey)
    await auth.delete(OPENAI_CODEX_PROVIDER)
    await expect(stat(auth.filename)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(stat(auth.version1BackupFilename)).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
