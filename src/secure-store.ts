/** OS-protected encryption keys; credential documents never fall back to plaintext. */
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { resolve } from 'node:path'
import type { AsyncEntry } from '@napi-rs/keyring'

export const CREDENTIAL_ENVELOPE_VERSION = 3
export const CREDENTIAL_ENVELOPE_LIMIT = 1024 * 1024
export const CREDENTIAL_KEY_SERVICE = 'dsh-codex-connect.oauth-encryption-key.v1'

/** Injectable seam for synthetic tests; production always uses the OS credential store. */
export interface CredentialKeyStore {
  read(): Promise<Uint8Array | undefined>
  write(key: Uint8Array): Promise<void>
  delete(): Promise<void>
}

export class CredentialStorageError extends Error {
  constructor(message = 'OS credential storage is unavailable or locked. Unlock/configure macOS Keychain, Windows Credential Manager, or Linux Secret Service; plaintext fallback is disabled.') {
    super(`openai-codex: ${message}`)
    this.name = 'CredentialStorageError'
  }
}

/** Only load the native binding when an authenticated operation needs its key. */
export class OSCredentialKeyStore implements CredentialKeyStore {
  readonly account: string
  private entry: Promise<AsyncEntry> | undefined
  constructor(filename: string) {
    this.account = createHash('sha256').update(resolve(filename)).digest('hex')
  }
  private getEntry(): Promise<AsyncEntry> {
    return this.entry ??= (async () => {
      if (!['darwin', 'win32', 'linux'].includes(process.platform)) throw new CredentialStorageError('This platform has no supported OS credential store; plaintext fallback is disabled.')
      const { AsyncEntry } = await import('@napi-rs/keyring')
      // The library's Linux default can silently use an ephemeral kernel keyring.
      // Require durable Secret Service explicitly instead.
      return new AsyncEntry(CREDENTIAL_KEY_SERVICE, this.account, { linux: { store: 'secret-service' } })
    })().catch(() => { this.entry = undefined; throw new CredentialStorageError() })
  }
  async read(): Promise<Uint8Array | undefined> {
    try { return await (await this.getEntry()).getSecret() } catch { throw new CredentialStorageError() }
  }
  async write(key: Uint8Array): Promise<void> {
    try { await (await this.getEntry()).setSecret(key) } catch { throw new CredentialStorageError() }
  }
  async delete(): Promise<void> {
    try { await (await this.getEntry()).deleteCredential() } catch { throw new CredentialStorageError() }
  }
}

function validKey(key: Uint8Array): Buffer {
  if (key.byteLength !== 32) throw new CredentialStorageError('The OS credential-store key is invalid; do not overwrite it. Restore the key or explicitly sign out before signing in again.')
  return Buffer.from(key)
}

export async function credentialKey(store: CredentialKeyStore, create: boolean): Promise<Buffer> {
  const existing = await store.read()
  if (existing !== undefined) return validKey(existing)
  if (!create) throw new CredentialStorageError('The encrypted credential document has no OS-store key. Restore its key or explicitly sign out before signing in again.')
  const key = randomBytes(32)
  await store.write(key)
  const saved = await store.read()
  if (saved === undefined || saved.byteLength !== key.byteLength || !timingSafeEqual(Buffer.from(saved), key)) {
    throw new CredentialStorageError('OS credential-store write verification failed; no credential document was written.')
  }
  return key
}

function additionalData(filename: string): Buffer {
  return Buffer.from(`dsh-codex-connect\0credential-envelope-v3\0${resolve(filename)}`)
}

export function encryptCredentialDocument(text: string, filename: string, key: Uint8Array): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', validKey(key), iv)
  cipher.setAAD(additionalData(filename))
  const ciphertext = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  return `${JSON.stringify({ version: CREDENTIAL_ENVELOPE_VERSION, cipher: 'aes-256-gcm', iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') })}\n`
}

function decode(value: unknown, expectedLength?: number): Buffer {
  if (typeof value !== 'string' || value.length === 0) throw new Error()
  const bytes = Buffer.from(value, 'base64')
  if (bytes.toString('base64') !== value || (expectedLength !== undefined && bytes.length !== expectedLength)) throw new Error()
  return bytes
}

/** Authenticate metadata, ciphertext and pathname before returning any plaintext. */
export function decryptCredentialDocument(raw: unknown, filename: string, key: Uint8Array): string {
  try {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new Error()
    const envelope = raw as Record<string, unknown>
    if (Object.keys(envelope).sort().join(',') !== 'cipher,ciphertext,iv,tag,version'
      || envelope['version'] !== CREDENTIAL_ENVELOPE_VERSION || envelope['cipher'] !== 'aes-256-gcm') throw new Error()
    const decipher = createDecipheriv('aes-256-gcm', validKey(key), decode(envelope['iv'], 12))
    decipher.setAAD(additionalData(filename))
    decipher.setAuthTag(decode(envelope['tag'], 16))
    return Buffer.concat([decipher.update(decode(envelope['ciphertext'])), decipher.final()]).toString('utf8')
  } catch { throw new CredentialStorageError('The encrypted credential document is invalid or could not be authenticated; no plaintext fallback is allowed.') }
}
