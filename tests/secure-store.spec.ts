import { randomBytes } from 'node:crypto'
import { chmod, mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OpenAICodexCredentialStore, OPENAI_CODEX_PROVIDER } from '../src/store.ts'
import { OSCredentialKeyStore, credentialKey, decryptCredentialDocument, encryptCredentialDocument, type CredentialKeyStore } from '../src/secure-store.ts'

let root: string | undefined
afterEach(async () => { vi.restoreAllMocks(); if (root !== undefined) await rm(root, { recursive: true, force: true }); root = undefined })
const credential = { type: 'oauth' as const, access: 'synthetic-access-secret', refresh: 'synthetic-refresh-secret', accountId: 'synthetic-account', expires: 60_000 }
function memoryKeyStore(): CredentialKeyStore {
  let key: Uint8Array | undefined
  return { read: async () => key?.slice(), write: async value => { key = value.slice() }, delete: async () => { key = undefined } }
}
async function filename(): Promise<string> { root = await mkdtemp(join(tmpdir(), 'secure-codex-')); return join(root, 'auth.json') }

describe('OS-protected encrypted storage', () => {
  it('fails closed before OAuth or a token write if the OS store is locked', async () => {
    const path = await filename()
    const fail = async (): Promise<never> => { throw new Error('locked') }
    const store = new OpenAICodexCredentialStore(path, { read: fail, write: fail, delete: fail })
    await expect(store.prepareSecureStorage()).rejects.toThrow('locked')
    await expect(store.modify(OPENAI_CODEX_PROVIDER, async () => credential)).rejects.toThrow('locked')
    await expect(stat(path)).rejects.toMatchObject({ code: 'ENOENT' })
  })
  it('sanitizes native read/write/delete errors without exposing their messages or causes', async () => {
    const { AsyncEntry } = await import('@napi-rs/keyring')
    const store = new OSCredentialKeyStore('/synthetic/auth.json')
    for (const method of ['getSecret', 'setSecret', 'deleteCredential'] as const) {
      const spy = vi.spyOn(AsyncEntry.prototype, method).mockRejectedValue(new Error('native-synthetic-secret'))
      const result = await (method === 'getSecret' ? store.read() : method === 'setSecret' ? store.write(randomBytes(32)) : store.delete()).catch(error => error as unknown)
      expect(String(result)).toContain('plaintext fallback is disabled')
      expect(String(result)).not.toContain('native-synthetic-secret')
      expect(result).not.toHaveProperty('cause')
      spy.mockRestore()
    }
  })
  it('does not create a replacement key when an encrypted document has lost its key', async () => {
    const path = await filename(); const keys = memoryKeyStore()
    const store = new OpenAICodexCredentialStore(path, keys)
    await store.modify(OPENAI_CODEX_PROVIDER, async () => credential)
    const before = await readFile(path, 'utf8')
    await keys.delete()
    await expect(store.read(OPENAI_CODEX_PROVIDER)).rejects.toThrow(/no OS-store key/)
    await expect(store.modify(OPENAI_CODEX_PROVIDER, async () => credential)).rejects.toThrow(/no OS-store key/)
    expect(await readFile(path, 'utf8')).toBe(before)
    expect(await keys.read()).toBeUndefined()
  })
  it('authenticates ciphertext, metadata, pathname and fresh nonces', () => {
    const key = randomBytes(32); const path = '/synthetic/auth.json'
    const text = JSON.stringify(credential)
    const envelope = JSON.parse(encryptCredentialDocument(text, path, key)) as Record<string, unknown>
    expect(decryptCredentialDocument(envelope, path, key)).toBe(text)
    expect(() => decryptCredentialDocument(envelope, '/synthetic/other.json', key)).toThrow(/authenticated/)
    expect(() => decryptCredentialDocument({ ...envelope, ciphertext: 'eA==' }, path, key)).toThrow(/authenticated/)
    expect(() => decryptCredentialDocument({ ...envelope, extra: true }, path, key)).toThrow(/authenticated/)
    expect(() => decryptCredentialDocument({ ...envelope, iv: '!!!!' }, path, key)).toThrow(/authenticated/)
    expect(encryptCredentialDocument(text, path, key)).not.toBe(encryptCredentialDocument(text, path, key))
  })
  it('verifies OS-store writes and never replaces malformed keys', async () => {
    const lost: CredentialKeyStore = { read: async () => undefined, write: async () => {}, delete: async () => {} }
    await expect(credentialKey(lost, true)).rejects.toThrow(/write verification failed/)
    const malformed: CredentialKeyStore = { ...lost, read: async () => new Uint8Array(31) }
    await expect(credentialKey(malformed, true)).rejects.toThrow(/key is invalid/)
  })
  it('encrypts both legacy versions and an existing rollback copy with explicit consent', async () => {
    const path = await filename(); const store = new OpenAICodexCredentialStore(path, memoryKeyStore())
    await writeFile(path, JSON.stringify({ version: 2, activeAccountId: credential.accountId, credentials: [credential] }), { mode: 0o600 })
    await writeFile(store.version1BackupFilename, JSON.stringify({ version: 1, credential }), { mode: 0o600 })
    await expect(store.prepareSecureStorage()).rejects.toThrow(/explicit migration/)
    await store.migrateLegacyStorage({ confirmStopped: true })
    expect(await store.read(OPENAI_CODEX_PROVIDER)).toEqual(credential)
    for (const file of [path, store.version1BackupFilename]) {
      const text = await readFile(file, 'utf8')
      expect(JSON.parse(text)).toMatchObject({ version: 3, cipher: 'aes-256-gcm' })
      expect(text).not.toContain(credential.access)
      expect(text).not.toContain(credential.refresh)
    }
    await store.migrateLegacyStorage({ confirmStopped: true })
    expect(await store.read(OPENAI_CODEX_PROVIDER)).toEqual(credential)
  })
  it('rejects an overlooked plaintext backup and refuses symlink imports', async () => {
    const path = await filename(); const store = new OpenAICodexCredentialStore(path, memoryKeyStore())
    await store.modify(OPENAI_CODEX_PROVIDER, async () => credential)
    await writeFile(store.version1BackupFilename, JSON.stringify({ version: 1, credential }), { mode: 0o600 })
    await expect(store.read(OPENAI_CODEX_PROVIDER)).rejects.toThrow(/explicit migration/)
    await store.migrateLegacyStorage({ confirmStopped: true })
    if (process.platform !== 'win32') {
      await rm(path); await symlink(store.version1BackupFilename, path)
      await expect(store.migrateLegacyStorage({ confirmStopped: true })).rejects.toMatchObject({ code: 'ELOOP' })
    }
  })
  it('deletes the OS key when the final account is removed', async () => {
    const path = await filename(); const keys = memoryKeyStore(); const store = new OpenAICodexCredentialStore(path, keys)
    await store.modify(OPENAI_CODEX_PROVIDER, async () => credential)
    expect(await keys.read()).toHaveLength(32)
    const [account] = await store.accounts(); await store.removeAccount(account!.accountKey)
    expect(await keys.read()).toBeUndefined()
    await expect(stat(path)).rejects.toMatchObject({ code: 'ENOENT' })
  })
  it('rejects writable parent directories and user-controlled directory symlinks before migration', async () => {
    if (process.platform === 'win32') return
    const path = await filename(); const store = new OpenAICodexCredentialStore(path, memoryKeyStore())
    const text = JSON.stringify({ version: 1, credential })
    await writeFile(path, text, { mode: 0o600 })
    await chmod(root!, 0o770)
    await expect(store.migrateLegacyStorage({ confirmStopped: true })).rejects.toThrow(/writable by another user/)
    expect(await readFile(path, 'utf8')).toBe(text)
    await chmod(root!, 0o700)
    const real = join(root!, 'real'); await mkdir(real, { mode: 0o700 })
    await symlink(real, join(root!, 'alias'))
    const linked = new OpenAICodexCredentialStore(join(root!, 'alias', 'auth.json'), memoryKeyStore())
    await expect(linked.modify(OPENAI_CODEX_PROVIDER, async () => credential)).rejects.toThrow(/directory symlinks/)
    await expect(stat(join(real, 'auth.json'))).rejects.toMatchObject({ code: 'ENOENT' })
  })
  it('rejects unsafe backup permissions before writing any migrated file', async () => {
    if (process.platform === 'win32') return
    const path = await filename(); const keys = memoryKeyStore(); const store = new OpenAICodexCredentialStore(path, keys)
    const text = JSON.stringify({ version: 1, credential })
    await writeFile(path, text, { mode: 0o600 })
    await writeFile(store.version1BackupFilename, text, { mode: 0o600 })
    await chmod(store.version1BackupFilename, 0o644)
    await expect(store.migrateLegacyStorage({ confirmStopped: true })).rejects.toThrow(/readable beyond its owner/)
    expect(await readFile(path, 'utf8')).toBe(text)
    expect(await keys.read()).toBeUndefined()
  })
})
