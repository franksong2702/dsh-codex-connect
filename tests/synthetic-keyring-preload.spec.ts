import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'

const preload = fileURLToPath(new URL('../scripts/synthetic-keyring.mjs', import.meta.url))
it('fails before loading a binding without explicit synthetic authorization', () => {
  const env = { ...process.env }
  delete env['DSH_SYNTHETIC_KEYRING']
  const child = spawnSync(process.execPath, ['--import', preload, '-e', ''], { env, encoding: 'utf8', timeout: 5000 })
  expect(child.status).not.toBe(0)
  expect(child.stderr).toContain('explicit fixture flag')
})
it('intercepts native keyring imports and keeps keys only in the fixture process', () => {
  const code = `const m = await import('@napi-rs/keyring');
    if (!m.syntheticKeyring) throw new Error('Native binding reached');
    const entry = new m.AsyncEntry('dsh-codex-connect.oauth-encryption-key.v1', 'synthetic', {linux:{store:'secret-service'}});
    if (await entry.getSecret() !== null) throw new Error('Unexpected existing key');
    await entry.setSecret(new Uint8Array(32).fill(7));
    const key = await entry.getSecret();
    if (!Array.isArray(key) || key.length !== 32 || key[0] !== 7) throw new Error('Fixture key lost');
    await entry.deleteCredential();
    if (await entry.getSecret() !== null) throw new Error('Fixture key retained');
    console.log(JSON.stringify(globalThis[Symbol.for('codex-connect.synthetic-keyring')]));`
  const child = spawnSync(process.execPath, ['--import', preload, '--input-type=module', '-e', code], {
    env: { ...process.env, DSH_SYNTHETIC_KEYRING: '1' }, encoding: 'utf8', timeout: 5000,
  })
  expect(child.status).toBe(0)
  expect(JSON.parse(child.stdout)).toEqual({ reads: 3, writes: 1, deletes: 1 })
})
it('retains only synthetic keys between fresh fixture processes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'synthetic-keyring-restart-'))
  try {
    const prefix = `const { AsyncEntry } = await import('@napi-rs/keyring'); const entry = new AsyncEntry('dsh-codex-connect.oauth-encryption-key.v1', 'restart-fixture', {linux:{store:'secret-service'}});`
    const run = (code: string) => spawnSync(process.execPath, ['--import', preload, '--input-type=module', '-e', prefix + code], {
      env: { ...process.env, DSH_SYNTHETIC_KEYRING: '1', DSH_SYNTHETIC_KEYRING_DIRECTORY: root }, encoding: 'utf8', timeout: 5000,
    })
    expect(run('await entry.setSecret(new Uint8Array(32).fill(7));').status).toBe(0)
    const resumed = run('const key = await entry.getSecret(); if (!Array.isArray(key) || key.length !== 32 || key[0] !== 7) throw new Error("Synthetic key lost");')
    expect(resumed.status).toBe(0)
    expect(run('await entry.deleteCredential();').status).toBe(0)
    expect(run('if (await entry.getSecret() !== null) throw new Error("Synthetic key retained");').status).toBe(0)
  } finally { await rm(root, { recursive: true, force: true }) }
})
