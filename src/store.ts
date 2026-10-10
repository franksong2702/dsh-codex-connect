/**
 * OS-keyring-encrypted persistent OAuth credential storage for the OpenAI Codex bundle.
 * @module dsh-codex-connect/store
 */

import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { mkdir, open, rm } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import type { Credential, CredentialInfo, CredentialStore, OAuthCredential } from '@earendil-works/pi-ai'
import { withFileLock, writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import {
  resolveOpenAICodexAccountProfiles,
  type OpenAICodexAccountProfileSource,
} from './account-profile.ts'
import {
  CREDENTIAL_ENVELOPE_LIMIT, CREDENTIAL_ENVELOPE_VERSION, CredentialStorageError,
  OSCredentialKeyStore, credentialKey, decryptCredentialDocument, encryptCredentialDocument,
  type CredentialKeyStore,
} from './secure-store.ts'
import { assertCredentialParent } from './secure-path.ts'

/** Provider route and pi-ai provider id owned by this bundle. */
export const OPENAI_CODEX_PROVIDER = 'openai-codex'

/** Basename of the OAuth document inside the Harness home. */
export const OPENAI_CODEX_AUTH_FILENAME = '.openai-codex-auth.json'

/** Current multi-account on-disk format. */
const AUTH_FORMAT_VERSION = 2

/** Maximum number of stored OpenAI Codex accounts. */
export const OPENAI_CODEX_ACCOUNT_LIMIT = 16

/** Maximum serialized credential document size. */
export const OPENAI_CODEX_AUTH_DOCUMENT_LIMIT = 512 * 1024

/** Legacy backup path; explicit migration encrypts this in place, never creates a plaintext copy. */
export const OPENAI_CODEX_AUTH_V1_BACKUP_SUFFIX = '.v1-backup'

type StoredOAuthCredential = OAuthCredential & { accountId: string }

interface AuthDocumentV1 {
  version: 1
  credential: StoredOAuthCredential
}

interface AuthDocumentV2 {
  version: typeof AUTH_FORMAT_VERSION
  activeAccountId: string
  credentials: StoredOAuthCredential[]
}

type AuthDocument = AuthDocumentV1 | AuthDocumentV2

export interface OpenAICodexAccountSummary {
  accountKey: string
  displayName: string
  maskedEmail?: string
  profileSource: OpenAICodexAccountProfileSource
  active: boolean
}

/** One request's credentials and browser labels from the same document read. */
export interface CapturedOpenAICodexAccount extends CredentialStore {
  accounts(): Promise<readonly OpenAICodexAccountSummary[]>
  captureActiveAccount(): Promise<CapturedOpenAICodexAccount>
}

function accountSummaries(document: AuthDocument | undefined): readonly OpenAICodexAccountSummary[] {
  if (document === undefined) return []
  const credentials = documentCredentials(document)
  const profiles = resolveOpenAICodexAccountProfiles(credentials)
  const activeAccountId = activeCredential(document).accountId
  return credentials.map((credential, index) => ({
    accountKey: accountKey(credential.accountId),
    displayName: profiles[index]!.displayName,
    ...(profiles[index]!.maskedEmail === undefined ? {} : { maskedEmail: profiles[index]!.maskedEmail }),
    profileSource: profiles[index]!.source,
    active: credential.accountId === activeAccountId,
  }))
}

/** Whether a filesystem error reports an absent path. */
function isENOENT(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | null)?.code === 'ENOENT'
}

/** Reject a credential document readable by another POSIX user. */
function assertOwnerOnly(filename: string, mode: number): void {
  /* v8 ignore next -- native Windows coverage takes the mode-less branch */
  if (process.platform === 'win32') return
  /* v8 ignore start -- POSIX tests cover this branch; Windows cannot express it */
  if ((mode & 0o077) !== 0) {
    throw new Error(
      `openai-codex: ${filename} is readable beyond its owner (mode ${(mode & 0o777).toString(8)});`
      + ` run "chmod 600 ${filename}" before starting again`,
    )
  }
  /* v8 ignore stop */
}

/** Validate one OAuth credential without quoting token-bearing input. */
function parseCredential(raw: unknown, filename: string): StoredOAuthCredential {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error(`openai-codex: ${filename} credential must be an object`)
  }
  const credential = raw as Record<string, unknown>
  if (Object.keys(credential).some(key => !['type', 'access', 'refresh', 'expires', 'accountId'].includes(key))) {
    throw new Error(`openai-codex: ${filename} credential contains an unknown field`)
  }
  if (credential['type'] !== 'oauth') throw new Error(`openai-codex: ${filename} credential type must be oauth`)
  for (const key of ['access', 'refresh', 'accountId'] as const) {
    if (typeof credential[key] !== 'string' || credential[key].length === 0) {
      throw new Error(`openai-codex: ${filename} credential ${key} must be a non-empty string`)
    }
  }
  if (typeof credential['expires'] !== 'number' || !Number.isFinite(credential['expires']) || credential['expires'] <= 0) {
    throw new Error(`openai-codex: ${filename} credential expires must be a positive finite number`)
  }
  return credential as unknown as StoredOAuthCredential
}

/** Validate the strict JSON document without quoting token-bearing input. */
function parseDocument(text: string, filename: string): AuthDocument {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new Error(`openai-codex: ${filename} is not valid JSON`)
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`openai-codex: ${filename} must contain an object`)
  }
  const document = value as Record<string, unknown>
  if (document['version'] === 1) {
    if (Object.keys(document).some(key => key !== 'version' && key !== 'credential')) {
      throw new Error(`openai-codex: ${filename} contains an unknown top-level field`)
    }
    return { version: 1, credential: parseCredential(document['credential'], filename) }
  }
  if (document['version'] !== AUTH_FORMAT_VERSION) {
    throw new Error(`openai-codex: ${filename} has unsupported auth format version ${String(document['version'])}`)
  }
  if (Object.keys(document).some(key => !['version', 'activeAccountId', 'credentials'].includes(key))) {
    throw new Error(`openai-codex: ${filename} contains an unknown top-level field`)
  }
  if (typeof document['activeAccountId'] !== 'string' || document['activeAccountId'].length === 0) {
    throw new Error(`openai-codex: ${filename} activeAccountId must be a non-empty string`)
  }
  if (!Array.isArray(document['credentials']) || document['credentials'].length === 0) {
    throw new Error(`openai-codex: ${filename} credentials must be a non-empty array`)
  }
  if (document['credentials'].length > OPENAI_CODEX_ACCOUNT_LIMIT) {
    throw new Error(`openai-codex: ${filename} exceeds the ${String(OPENAI_CODEX_ACCOUNT_LIMIT)} account limit`)
  }
  const credentials = document['credentials'].map(raw => parseCredential(raw, filename))
  const accountIds = new Set(credentials.map(credential => credential.accountId))
  if (accountIds.size !== credentials.length) {
    throw new Error(`openai-codex: ${filename} contains duplicate accountId values`)
  }
  if (!accountIds.has(document['activeAccountId'])) {
    throw new Error(`openai-codex: ${filename} activeAccountId does not identify a stored credential`)
  }
  return {
    version: AUTH_FORMAT_VERSION,
    activeAccountId: document['activeAccountId'],
    credentials,
  }
}

/** Detach a credential from callers that may mutate provider-owned extras. */
function cloneCredential<T extends OAuthCredential>(credential: T): T {
  return structuredClone(credential)
}

function documentCredentials(document: AuthDocument): readonly StoredOAuthCredential[] {
  return document.version === 1 ? [document.credential] : document.credentials
}

function activeCredential(document: AuthDocument): StoredOAuthCredential {
  if (document.version === 1) return document.credential
  const active = document.credentials.find(credential => credential.accountId === document.activeAccountId)
  if (active === undefined) throw new Error('openai-codex: active credential invariant failed')
  return active
}

function accountKey(accountId: string): string {
  return `acct_${createHash('sha256').update(accountId).digest('base64url')}`
}

function serializeDocument(document: AuthDocument): string {
  const text = `${JSON.stringify(document, null, 2)}\n`
  if (Buffer.byteLength(text) > OPENAI_CODEX_AUTH_DOCUMENT_LIMIT) {
    throw new Error(`openai-codex: credential document exceeds ${String(OPENAI_CODEX_AUTH_DOCUMENT_LIMIT)} bytes`)
  }
  return text
}

/**
 * Resolve the default OAuth document path.
 * @param dshHome - optional Harness-home override.
 * @returns the absolute owner-only document path.
 */
export function openAICodexAuthPath(dshHome?: string): string {
  return resolve(join(resolveDshHome(dshHome), OPENAI_CODEX_AUTH_FILENAME))
}

/** Encrypted pi-ai store scoped to the single OpenAI Codex provider. */
export class OpenAICodexCredentialStore implements CredentialStore {
  /** Absolute credential document path. */
  readonly filename: string

  /** Existing legacy rollback copy, encrypted only by explicit migration. */
  readonly version1BackupFilename: string
  private readonly keyStore: CredentialKeyStore

  /**
   * @param filename - explicit document path, defaulting under `$DSH_HOME`.
   */
  constructor(filename: string = openAICodexAuthPath(), keyStore?: CredentialKeyStore) {
    this.filename = resolve(filename)
    this.version1BackupFilename = join(dirname(this.filename), `${basename(this.filename)}${OPENAI_CODEX_AUTH_V1_BACKUP_SUFFIX}`)
    this.keyStore = keyStore ?? new OSCredentialKeyStore(this.filename)
  }

  /** Read and validate the current document without acquiring the writer lock. */
  private async readDocument(): Promise<AuthDocument | undefined> {
    const document = await this.readDocumentAt(this.filename)
    // An old rollback copy can also contain tokens; do not ignore a plaintext backup.
    await this.readDocumentAt(this.version1BackupFilename)
    return document
  }

  private async readDocumentAt(filename: string, allowLegacy = false): Promise<AuthDocument | undefined> {
    await assertCredentialParent(filename, true)
    let handle
    try {
      handle = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW)
    } catch (error) {
      if (isENOENT(error)) return undefined
      throw error
    }
    try {
      const info = await handle.stat()
      if (!info.isFile()) throw new Error(`openai-codex: ${filename} must be a regular file`)
      if (process.getuid !== undefined && info.uid !== process.getuid()) throw new CredentialStorageError('The credential document is not owned by the current user.')
      assertOwnerOnly(filename, info.mode)
      if (info.size > CREDENTIAL_ENVELOPE_LIMIT) {
        throw new Error(`openai-codex: ${filename} exceeds ${String(CREDENTIAL_ENVELOPE_LIMIT)} bytes`)
      }
      const text = await handle.readFile('utf8')
      let raw: unknown
      try { raw = JSON.parse(text) } catch { throw new CredentialStorageError('The credential document is not valid JSON.') }
      if (typeof raw === 'object' && raw !== null && !Array.isArray(raw) && (raw as Record<string, unknown>)['version'] === CREDENTIAL_ENVELOPE_VERSION) {
        const plaintext = decryptCredentialDocument(raw, filename, await credentialKey(this.keyStore, false))
        if (Buffer.byteLength(plaintext) > OPENAI_CODEX_AUTH_DOCUMENT_LIMIT) throw new CredentialStorageError('The decrypted credential document exceeds the size limit.')
        return parseDocument(plaintext, filename)
      }
      if (!allowLegacy) throw new CredentialStorageError('Legacy plaintext credentials require explicit migration: stop Harness, then run dsh-codex-connect migrate-credentials --confirm-stopped. No credentials were imported or changed.')
      if (Buffer.byteLength(text) > OPENAI_CODEX_AUTH_DOCUMENT_LIMIT) throw new CredentialStorageError('The legacy credential document exceeds the size limit.')
      return parseDocument(text, filename)
    } finally {
      await handle.close()
    }
  }

  private async writeDocument(document: AuthDocumentV2): Promise<void> {
    const text = serializeDocument(document)
    const key = await credentialKey(this.keyStore, true)
    await assertCredentialParent(this.filename)
    await writeFileAtomic(this.filename, encryptCredentialDocument(text, this.filename, key), { mode: 0o600, dirMode: 0o700 })
  }

  /** Fail before opening an OAuth browser when storage or migration is unavailable. */
  async prepareSecureStorage(): Promise<void> {
    await this.prepareDirectory()
    await this.withWriterLock(async () => {
      await this.readDocument()
      await credentialKey(this.keyStore, true)
    })
  }

  /** Explicit, offline migration only. Validate both inputs before writes; never make a plaintext backup. */
  async migrateLegacyStorage(options: { confirmStopped: boolean }): Promise<void> {
    if (options.confirmStopped !== true) throw new CredentialStorageError('Credential migration requires explicit --confirm-stopped confirmation.')
    await this.prepareDirectory()
    await this.withWriterLock(async () => {
      const document = await this.readDocumentAt(this.filename, true)
      const backup = await this.readDocumentAt(this.version1BackupFilename, true)
      if (document === undefined && backup === undefined) return
      const key = await credentialKey(this.keyStore, true)
      // Backup first: a failed primary write leaves the original primary usable for a retry.
      for (const [filename, value] of [[this.version1BackupFilename, backup], [this.filename, document]] as const) {
        if (value === undefined) continue
        const plaintext = serializeDocument(value)
        await assertCredentialParent(filename)
        await writeFileAtomic(filename, encryptCredentialDocument(plaintext, filename, key), { mode: 0o600, dirMode: 0o700 })
        const verified = await this.readDocumentAt(filename)
        if (verified === undefined || serializeDocument(verified) !== plaintext) throw new CredentialStorageError('Encrypted migration readback failed; stop and retain the current files for recovery.')
      }
    })
  }

  /** @inheritdoc */
  async read(providerId: string): Promise<Credential | undefined> {
    if (providerId !== OPENAI_CODEX_PROVIDER) return undefined
    const document = await this.readDocument()
    return document === undefined ? undefined : cloneCredential(activeCredential(document))
  }

  /**
   * Capture the current account for one request's complete auth resolution.
   * Refreshes through the returned store update only that captured account and
   * never change the user's current account selection.
   */
  async captureActiveAccount(): Promise<CapturedOpenAICodexAccount> {
    const document = await this.readDocument()
    const captured = document === undefined ? undefined : cloneCredential(activeCredential(document))
    const capturedAccountId = captured?.accountId
    let requestCredential: StoredOAuthCredential | undefined = captured
    const snapshot: CapturedOpenAICodexAccount = {
      accounts: async () => accountSummaries(document),
      captureActiveAccount: async () => snapshot,
      read: async providerId => providerId === OPENAI_CODEX_PROVIDER && requestCredential !== undefined
        ? cloneCredential(requestCredential)
        : undefined,
      list: async () => requestCredential === undefined
        ? []
        : [{ providerId: OPENAI_CODEX_PROVIDER, type: 'oauth' }],
      modify: async (providerId, fn, options) => {
        options?.signal?.throwIfAborted()
        if (providerId !== OPENAI_CODEX_PROVIDER) {
          throw new Error(`openai-codex: captured credential store does not own provider "${providerId}"`)
        }
        if (capturedAccountId === undefined) return undefined
        requestCredential = await this.modifyCapturedAccount(capturedAccountId, fn, options)
        return requestCredential === undefined ? undefined : cloneCredential(requestCredential)
      },
      delete: async providerId => {
        if (providerId === OPENAI_CODEX_PROVIDER) {
          throw new Error('openai-codex: a captured request credential cannot log out')
        }
      },
    }
    return snapshot
  }

  private async modifyCapturedAccount(
    capturedAccountId: string,
    fn: (current: Credential | undefined) => Promise<Credential | undefined>,
    options?: Parameters<CredentialStore['modify']>[2],
  ): Promise<StoredOAuthCredential | undefined> {
    await this.prepareDirectory()
    return this.withWriterLock(async () => {
      const document = await this.readDocument()
      if (document === undefined) return undefined
      const credentials = [...documentCredentials(document)]
      const capturedIndex = credentials.findIndex(credential => credential.accountId === capturedAccountId)
      if (capturedIndex < 0) return undefined
      const current = cloneCredential(credentials[capturedIndex]!)
      options?.signal?.throwIfAborted()
      const candidate = await fn(current)
      if (candidate === undefined) return current
      const validated = parseCredential(candidate, this.filename)
      if (validated.accountId !== capturedAccountId) {
        throw new Error('openai-codex: a request credential refresh cannot change accountId')
      }
      credentials[capturedIndex] = validated
      await this.writeDocument({
        version: AUTH_FORMAT_VERSION,
        activeAccountId: activeCredential(document).accountId,
        credentials: credentials.map(cloneCredential),
      })
      return cloneCredential(validated)
    })
  }

  /** @inheritdoc */
  async list(): Promise<readonly CredentialInfo[]> {
    return await this.readDocument() === undefined
      ? []
      : [{ providerId: OPENAI_CODEX_PROVIDER, type: 'oauth' }]
  }

  /** List browser-safe account summaries without exposing provider account ids. */
  async accounts(): Promise<readonly OpenAICodexAccountSummary[]> {
    return accountSummaries(await this.readDocument())
  }

  /** Resolve the account id stored with one exact access token. */
  async accountIdForAccess(access: string): Promise<string | undefined> {
    const document = await this.readDocument()
    if (document === undefined) return undefined
    return documentCredentials(document).find(credential => credential.access === access)?.accountId
  }

  /** Select a stored account using its browser-safe key. */
  async activate(selectedAccountKey: string): Promise<OAuthCredential> {
    await this.prepareDirectory()
    return this.withWriterLock(async () => {
      const document = await this.readDocument()
      if (document === undefined) throw new Error('openai-codex: account not found')
      const credentials = documentCredentials(document)
      const selected = credentials.find(credential => accountKey(credential.accountId) === selectedAccountKey)
      if (selected === undefined) throw new Error('openai-codex: account not found')
      await this.writeDocument({
        version: AUTH_FORMAT_VERSION,
        activeAccountId: selected.accountId,
        credentials: credentials.map(cloneCredential),
      })
      return cloneCredential(selected)
    })
  }

  /** Remove one account; active removal requires an explicit stored replacement. */
  async removeAccount(selectedAccountKey: string, replacementAccountKey?: string): Promise<void> {
    await this.prepareDirectory()
    await this.withWriterLock(async () => {
      const document = await this.readDocument()
      if (document === undefined) throw new Error('openai-codex: account not found')
      const credentials = [...documentCredentials(document)]
      const removeIndex = credentials.findIndex(credential => accountKey(credential.accountId) === selectedAccountKey)
      if (removeIndex < 0) throw new Error('openai-codex: account not found')
      const removed = credentials[removeIndex]!
      const active = activeCredential(document)
      const remaining = credentials.filter((_, index) => index !== removeIndex)
      let nextActive = active.accountId
      if (removed.accountId === active.accountId && remaining.length > 0) {
        if (replacementAccountKey === undefined) {
          throw new Error('openai-codex: removing the active account requires replacementAccountKey')
        }
        const replacement = remaining.find(credential => accountKey(credential.accountId) === replacementAccountKey)
        if (replacement === undefined) throw new Error('openai-codex: replacement account not found')
        nextActive = replacement.accountId
      } else if (replacementAccountKey !== undefined) {
        throw new Error('openai-codex: replacementAccountKey is only valid when removing the active account')
      }
      await rm(this.version1BackupFilename, { force: true })
      if (remaining.length === 0) {
        await rm(this.filename, { force: true })
        await this.keyStore.delete()
        return
      }
      await this.writeDocument({
        version: AUTH_FORMAT_VERSION,
        activeAccountId: nextActive,
        credentials: remaining.map(cloneCredential),
      })
    })
  }

  /** @inheritdoc */
  async modify(
    providerId: string,
    fn: (current: Credential | undefined) => Promise<Credential | undefined>,
    options?: Parameters<CredentialStore['modify']>[2],
  ): Promise<Credential | undefined> {
    options?.signal?.throwIfAborted()
    if (providerId !== OPENAI_CODEX_PROVIDER) {
      throw new Error(`openai-codex: credential store does not own provider "${providerId}"`)
    }
    await this.prepareDirectory()
    return this.withWriterLock(async () => {
      const currentDocument = await this.readDocument()
      const current = currentDocument === undefined ? undefined : cloneCredential(activeCredential(currentDocument))
      // pi-ai treats invocation of fn as the commit point and waits for its result.
      options?.signal?.throwIfAborted()
      const candidate = await fn(current)
      if (candidate === undefined) return current
      const validated = parseCredential(candidate, this.filename)
      const credentials = currentDocument === undefined ? [] : [...documentCredentials(currentDocument)]
      const existingIndex = credentials.findIndex(credential => credential.accountId === validated.accountId)
      if (existingIndex >= 0) credentials[existingIndex] = validated
      else credentials.push(validated)
      if (credentials.length > OPENAI_CODEX_ACCOUNT_LIMIT) {
        throw new Error(`openai-codex: credential store accepts at most ${String(OPENAI_CODEX_ACCOUNT_LIMIT)} accounts`)
      }
      await this.writeDocument({
        version: AUTH_FORMAT_VERSION,
        activeAccountId: validated.accountId,
        credentials: credentials.map(cloneCredential),
      })
      return cloneCredential(validated)
    })
  }

  /** @inheritdoc */
  async delete(providerId: string): Promise<void> {
    if (providerId !== OPENAI_CODEX_PROVIDER) return
    await this.prepareDirectory()
    await this.withWriterLock(async () => {
      await rm(this.filename, { force: true })
      await rm(this.version1BackupFilename, { force: true })
      await this.keyStore.delete()
    })
  }

  /** Allow the provider's 15-second refresh plus bounded filesystem completion. */
  private async prepareDirectory(): Promise<void> {
    await assertCredentialParent(this.filename, true)
    await mkdir(dirname(this.filename), { recursive: true, mode: 0o700 })
    await assertCredentialParent(this.filename)
  }

  private withWriterLock<T>(operation: () => Promise<T>): Promise<T> {
    return withFileLock(this.filename, operation, { waitMs: 20_000 })
  }
}
