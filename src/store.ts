/**
 * Owner-only persistent OAuth credential storage for the OpenAI Codex bundle.
 * @module dsh-codex-connect/store
 */

import { createHash } from 'node:crypto'
import { mkdir, open, rm } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import type { Credential, CredentialInfo, CredentialStore, OAuthCredential } from '@earendil-works/pi-ai'
import { withFileLock, writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import {
  resolveOpenAICodexAccountProfiles,
  type OpenAICodexAccountProfileSource,
} from './account-profile.ts'

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

/** Suffix used for the one-time version-1 rollback copy. */
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

/** File-backed pi-ai store scoped to the single OpenAI Codex provider. */
export class OpenAICodexCredentialStore implements CredentialStore {
  /** Absolute credential document path. */
  readonly filename: string

  /** Owner-only version-1 rollback copy, created at the first migration write. */
  readonly version1BackupFilename: string

  /**
   * @param filename - explicit document path, defaulting under `$DSH_HOME`.
   */
  constructor(filename: string = openAICodexAuthPath()) {
    this.filename = resolve(filename)
    this.version1BackupFilename = join(dirname(this.filename), `${basename(this.filename)}${OPENAI_CODEX_AUTH_V1_BACKUP_SUFFIX}`)
  }

  /** Read and validate the current document without acquiring the writer lock. */
  private async readDocument(): Promise<AuthDocument | undefined> {
    return this.readDocumentAt(this.filename)
  }

  private async readDocumentAt(filename: string): Promise<AuthDocument | undefined> {
    let handle
    try {
      handle = await open(filename, 'r')
    } catch (error) {
      if (isENOENT(error)) return undefined
      throw error
    }
    try {
      const info = await handle.stat()
      if (!info.isFile()) throw new Error(`openai-codex: ${filename} must be a regular file`)
      assertOwnerOnly(filename, info.mode)
      if (info.size > OPENAI_CODEX_AUTH_DOCUMENT_LIMIT) {
        throw new Error(`openai-codex: ${filename} exceeds ${String(OPENAI_CODEX_AUTH_DOCUMENT_LIMIT)} bytes`)
      }
      return parseDocument(await handle.readFile('utf8'), filename)
    } finally {
      await handle.close()
    }
  }

  private async writeDocument(document: AuthDocumentV2, previous?: AuthDocument): Promise<void> {
    const text = serializeDocument(document)
    if (previous?.version === 1) {
      const existingBackup = await this.readDocumentAt(this.version1BackupFilename)
      if (existingBackup === undefined) {
        await writeFileAtomic(this.version1BackupFilename, serializeDocument(previous), {
          mode: 0o600,
          dirMode: 0o700,
        })
      } else if (existingBackup.version !== 1
        || serializeDocument(existingBackup) !== serializeDocument(previous)) {
        throw new Error(`openai-codex: ${this.version1BackupFilename} rollback copy does not match the current version 1 credential`)
      }
    }
    await writeFileAtomic(this.filename, text, { mode: 0o600, dirMode: 0o700 })
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
  async captureActiveAccount(): Promise<CredentialStore> {
    const document = await this.readDocument()
    const captured = document === undefined ? undefined : cloneCredential(activeCredential(document))
    const capturedAccountId = captured?.accountId
    let requestCredential: StoredOAuthCredential | undefined = captured
    return {
      read: async providerId => providerId === OPENAI_CODEX_PROVIDER && requestCredential !== undefined
        ? cloneCredential(requestCredential)
        : undefined,
      list: async () => requestCredential === undefined
        ? []
        : [{ providerId: OPENAI_CODEX_PROVIDER, type: 'oauth' }],
      modify: async (providerId, fn) => {
        if (providerId !== OPENAI_CODEX_PROVIDER) {
          throw new Error(`openai-codex: captured credential store does not own provider "${providerId}"`)
        }
        if (capturedAccountId === undefined) return undefined
        requestCredential = await this.modifyCapturedAccount(capturedAccountId, fn)
        return requestCredential === undefined ? undefined : cloneCredential(requestCredential)
      },
      delete: async providerId => {
        if (providerId === OPENAI_CODEX_PROVIDER) {
          throw new Error('openai-codex: a captured request credential cannot log out')
        }
      },
    }
  }

  private async modifyCapturedAccount(
    capturedAccountId: string,
    fn: (current: Credential | undefined) => Promise<Credential | undefined>,
  ): Promise<StoredOAuthCredential | undefined> {
    await mkdir(dirname(this.filename), { recursive: true, mode: 0o700 })
    return withFileLock(this.filename, async () => {
      const document = await this.readDocument()
      if (document === undefined) return undefined
      const credentials = [...documentCredentials(document)]
      const capturedIndex = credentials.findIndex(credential => credential.accountId === capturedAccountId)
      if (capturedIndex < 0) return undefined
      const current = cloneCredential(credentials[capturedIndex]!)
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
      }, document)
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
    const document = await this.readDocument()
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

  /** Resolve the account id stored with one exact access token. */
  async accountIdForAccess(access: string): Promise<string | undefined> {
    const document = await this.readDocument()
    if (document === undefined) return undefined
    return documentCredentials(document).find(credential => credential.access === access)?.accountId
  }

  /** Select a stored account using its browser-safe key. */
  async activate(selectedAccountKey: string): Promise<OAuthCredential> {
    await mkdir(dirname(this.filename), { recursive: true, mode: 0o700 })
    return withFileLock(this.filename, async () => {
      const document = await this.readDocument()
      if (document === undefined) throw new Error('openai-codex: account not found')
      const credentials = documentCredentials(document)
      const selected = credentials.find(credential => accountKey(credential.accountId) === selectedAccountKey)
      if (selected === undefined) throw new Error('openai-codex: account not found')
      await this.writeDocument({
        version: AUTH_FORMAT_VERSION,
        activeAccountId: selected.accountId,
        credentials: credentials.map(cloneCredential),
      }, document)
      return cloneCredential(selected)
    })
  }

  /** Remove one account; active removal requires an explicit stored replacement. */
  async removeAccount(selectedAccountKey: string, replacementAccountKey?: string): Promise<void> {
    await mkdir(dirname(this.filename), { recursive: true, mode: 0o700 })
    await withFileLock(this.filename, async () => {
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
  ): Promise<Credential | undefined> {
    if (providerId !== OPENAI_CODEX_PROVIDER) {
      throw new Error(`openai-codex: credential store does not own provider "${providerId}"`)
    }
    await mkdir(dirname(this.filename), { recursive: true, mode: 0o700 })
    return withFileLock(this.filename, async () => {
      const currentDocument = await this.readDocument()
      const current = currentDocument === undefined ? undefined : cloneCredential(activeCredential(currentDocument))
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
      }, currentDocument)
      return cloneCredential(validated)
    })
  }

  /** @inheritdoc */
  async delete(providerId: string): Promise<void> {
    if (providerId !== OPENAI_CODEX_PROVIDER) return
    await mkdir(dirname(this.filename), { recursive: true, mode: 0o700 })
    await withFileLock(this.filename, async () => {
      await rm(this.filename, { force: true })
      await rm(this.version1BackupFilename, { force: true })
    })
  }
}
