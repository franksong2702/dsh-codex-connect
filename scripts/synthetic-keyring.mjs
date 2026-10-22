/** Installed-host fixtures only: never load or call an OS credential binding. */
import { registerHooks } from 'node:module'

if (process.env.DSH_SYNTHETIC_KEYRING !== '1') {
  throw new Error('Synthetic keyring preload requires the explicit fixture flag')
}
const source = `
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join, sep } from 'node:path';
import { tmpdir } from 'node:os';
export const syntheticKeyring = true;
const entries = new Map();
const directory = process.env.DSH_SYNTHETIC_KEYRING_DIRECTORY;
if (directory !== undefined && !resolve(directory).startsWith(resolve(tmpdir()) + sep)) throw new Error('Fixture keyring must stay under the temporary root');
const stats = globalThis[Symbol.for('codex-connect.synthetic-keyring')] = { reads: 0, writes: 0, deletes: 0 };
export class AsyncEntry {
  constructor(service, account, options) {
    if (service !== 'dsh-codex-connect.oauth-encryption-key.v1' || options?.linux?.store !== 'secret-service') throw new Error('Unexpected fixture keyring request');
    this.id = service + ':' + account;
    this.file = directory === undefined ? undefined : join(directory, createHash('sha256').update(this.id).digest('hex'));
  }
  async getSecret() {
    stats.reads++;
    if (this.file === undefined) { const key = entries.get(this.id); return key === undefined ? null : Array.from(key); }
    try { return Array.from(await readFile(this.file)); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  }
  async setSecret(value) {
    stats.writes++;
    if (this.file === undefined) { entries.set(this.id, value.slice()); return; }
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await writeFile(this.file, value, { mode: 0o600 });
  }
  async deleteCredential() {
    stats.deletes++;
    if (this.file === undefined) return entries.delete(this.id);
    await rm(this.file, { force: true }); return true;
  }
}
`
const url = `data:text/javascript,${encodeURIComponent(source)}`
registerHooks({
  resolve(specifier, context, nextResolve) {
    return specifier === '@napi-rs/keyring' ? { url, shortCircuit: true } : nextResolve(specifier, context)
  },
})
