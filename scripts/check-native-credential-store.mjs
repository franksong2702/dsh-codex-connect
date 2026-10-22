#!/usr/bin/env node
/**
 * Opt-in native acceptance. Creates only unpredictable, test-owned OS entries.
 * No default credential path, account import, network request or live model.
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir, release } from 'node:os'
import { join } from 'node:path'
import { OpenAICodexCredentialStore, OPENAI_CODEX_PROVIDER } from '../src/store.ts'
import { OSCredentialKeyStore, credentialKey, decryptCredentialDocument, encryptCredentialDocument } from '../src/secure-store.ts'

if (process.argv.slice(2).join(' ') !== '--synthetic-owned-entries-only') {
  throw new Error('Explicit --synthetic-owned-entries-only is required; this check writes native test entries.')
}
if (process.env.DSH_SYNTHETIC_KEYRING !== undefined || process.env.DSH_SYNTHETIC_KEYRING_DIRECTORY !== undefined
  || process.env.NODE_OPTIONS || process.execArgv.some(value => /--(?:import|require|loader)/u.test(value))) {
  throw new Error('Native acceptance refuses synthetic keyring preloads or process hooks.')
}
const nativeBinding = await import('@napi-rs/keyring')
assert.notEqual(nativeBinding.syntheticKeyring, true)
assert.equal(typeof nativeBinding.AsyncEntry, 'function')
const temporaryHome = await realpath(await mkdtemp(join(tmpdir(), 'codex-connect-owned-native-')))
const owned = []
const credential = {
  type: 'oauth', access: 'native-fixture-access-not-a-token', refresh: 'native-fixture-refresh-not-a-token',
  accountId: 'native-fixture-account-not-real', expires: 60000,
}
const result = {
  schemaVersion: 1, platform: process.platform, architecture: process.arch, osRelease: release(),
  node: process.version, keyringVersion: '2.1.0', syntheticCredentials: true,
  nativeBindingUsed: true, realAccountsAccessed: false, networkRequests: 0,
  sourceSha256: {}, steps: [], cleanup: { ownedEntries: 0, entriesAbsent: false, temporaryHomeRemoved: false },
}
for (const file of ['store.ts', 'secure-store.ts', 'secure-path.ts']) {
  result.sourceSha256[file] = createHash('sha256').update(await readFile(new URL('../src/' + file, import.meta.url))).digest('hex')
}
let phase = 'create-owned-locators'
let failed = false
async function ownedStore(name) {
  const directory = join(temporaryHome, name)
  await mkdir(directory, { mode: 0o700 })
  const filename = join(directory, '.openai-codex-auth.json')
  const keys = new OSCredentialKeyStore(filename)
  // An unexpected pre-existing entry is neither used nor deleted.
  assert.equal(await keys.read(), undefined, 'Unexpected pre-existing test locator')
  owned.push(keys)
  return { filename, keys, store: new OpenAICodexCredentialStore(filename) }
}
function freshProcessRead(filename) {
  const source = new URL('../src/store.ts', import.meta.url).href
  const program = 'import assert from "node:assert/strict";'
    + 'import {OpenAICodexCredentialStore,OPENAI_CODEX_PROVIDER} from ' + JSON.stringify(source) + ';'
    + 'assert.deepEqual(await new OpenAICodexCredentialStore(process.argv[1]).read(OPENAI_CODEX_PROVIDER),'
    + JSON.stringify(credential) + ');process.stdout.write("owned-fixture-read-ok");'
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', program, filename], {
    encoding: 'utf8', timeout: 20000, maxBuffer: 65536,
  })
  assert.equal(child.status, 0, 'Fresh-process native readback failed')
  assert.equal(child.stdout, 'owned-fixture-read-ok')
}
try {
  const first = await ownedStore('primary')
  const second = await ownedStore('migration')
  phase = 'native-key-write-readback'
  const key = await credentialKey(first.keys, true)
  const otherKey = await credentialKey(second.keys, true)
  assert.equal(key.length, 32)
  assert.equal(otherKey.length, 32)
  assert.notDeepEqual(key, otherKey)
  assert.notDeepEqual(key, Buffer.from(first.keys.account, 'hex'))
  assert.deepEqual(await new OSCredentialKeyStore(first.filename).read(), key)
  result.steps.push('native-key-write-readback-and-isolation')
  phase = 'encrypted-document-and-process-readback'
  await first.store.modify(OPENAI_CODEX_PROVIDER, async () => credential)
  const text = await readFile(first.filename, 'utf8')
  assert.equal(JSON.parse(text).version, 3)
  for (const value of [credential.access, credential.refresh, credential.accountId]) assert.equal(text.includes(value), false)
  if (process.platform !== 'win32') assert.equal((await stat(first.filename)).mode & 0o777, 0o600)
  freshProcessRead(first.filename)
  result.steps.push('encrypted-file-and-fresh-process-native-readback')
  phase = 'authenticated-envelope'
  const envelope = JSON.parse(encryptCredentialDocument(JSON.stringify(credential), first.filename, key))
  assert.throws(() => decryptCredentialDocument(envelope, second.filename, key), /authenticated/u)
  assert.throws(() => decryptCredentialDocument({ ...envelope, ciphertext: 'eA==' }, first.filename, key), /authenticated/u)
  result.steps.push('pathname-binding-and-tamper-rejection')
  phase = 'test-owned-legacy-migration'
  const legacy = JSON.stringify({ version: 1, credential })
  await writeFile(second.filename, legacy, { mode: 0o600 })
  await writeFile(second.store.version1BackupFilename, legacy, { mode: 0o600 })
  await assert.rejects(second.store.read(OPENAI_CODEX_PROVIDER), /explicit migration/u)
  await assert.rejects(second.store.migrateLegacyStorage({ confirmStopped: false }), /confirm-stopped/u)
  assert.equal(await readFile(second.filename, 'utf8'), legacy)
  await second.store.migrateLegacyStorage({ confirmStopped: true })
  for (const file of [second.filename, second.store.version1BackupFilename]) {
    const migrated = await readFile(file, 'utf8')
    assert.equal(JSON.parse(migrated).version, 3)
    assert.equal(migrated.includes(credential.access), false)
    assert.equal(migrated.includes(credential.refresh), false)
  }
  freshProcessRead(second.filename)
  result.steps.push('owned-synthetic-primary-and-backup-migration')
  phase = 'owned-logout-and-key-deletion'
  const [account] = await first.store.accounts()
  await first.store.removeAccount(account.accountKey)
  assert.equal(await first.keys.read(), undefined)
  await assert.rejects(stat(first.filename), { code: 'ENOENT' })
  await second.store.delete(OPENAI_CODEX_PROVIDER)
  assert.equal(await second.keys.read(), undefined)
  await assert.rejects(stat(second.filename), { code: 'ENOENT' })
  await assert.rejects(stat(second.store.version1BackupFilename), { code: 'ENOENT' })
  result.steps.push('final-account-removal-and-logout-delete-owned-keys')
} catch (error) {
  failed = true
  result.failure = { phase, errorKind: error instanceof Error ? error.name : 'UnknownError' }
} finally {
  result.cleanup.ownedEntries = owned.length
  const failures = []
  for (const [index, keys] of owned.entries()) {
    try {
      if (await keys.read() !== undefined) await keys.delete()
      assert.equal(await keys.read(), undefined)
    } catch {
      failures.push(index)
    }
  }
  result.cleanup.entriesAbsent = failures.length === 0
  if (failures.length === 0) {
    await rm(temporaryHome, { recursive: true, force: true })
    result.cleanup.temporaryHomeRemoved = true
  } else {
    failed = true
    // Recovery data contains only this run's generated locators, never a key or token.
    await writeFile(join(temporaryHome, 'owned-entry-cleanup.json'), JSON.stringify({
      service: 'dsh-codex-connect.oauth-encryption-key.v1',
      accounts: failures.map(index => owned[index].account),
    }) + '\n', { mode: 0o600 })
    result.cleanup.recoveryDirectory = temporaryHome
  }
}
result.passed = !failed
process.stdout.write(JSON.stringify(result, null, 2) + '\n')
process.exitCode = failed ? 1 : 0
