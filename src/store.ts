/**
 * Owner-only persistent OAuth credential storage for the OpenAI Codex bundle.
 * @module dsh-codex-connect/store
 */

import { mkdir, readFile, rm, stat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import type { Credential, CredentialInfo, CredentialStore, OAuthCredential } from '@earendil-works/pi-ai'
import { withFileLock, writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'

/** Provider route and pi-ai provider id owned by this bundle. */
export const OPENAI_CODEX_PROVIDER = 'openai-codex'

/** Basename of the OAuth document inside the Harness home. */
export const OPENAI_CODEX_AUTH_FILENAME = '.openai-codex-auth.json'

/** Current on-disk format. Version 1 is migrated in memory on first read. */
const AUTH_FORMAT_VERSION = 2

interface AuthDocument {
  version: typeof AUTH_FORMAT_VERSION
  activeAccountId: string
  accounts: OAuthCredential[]
}

/** Non-secret account metadata safe for the trusted local browser UI. */
export interface OpenAICodexAccountSummary {
  accountId: string
  active: boolean
  expires: number
}

/** Whether a filesystem error reports an absent path. */
function isENOENT(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | null)?.code === 'ENOENT'
}

/** Reject a credential document readable by another POSIX user. */
async function assertOwnerOnly(filename: string): Promise<void> {
  let mode: number
  try {
    mode = (await stat(filename)).mode
  } catch (error) {
    if (isENOENT(error)) return
    throw error
  }
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
function parseCredential(raw: unknown, filename: string, location = 'credential'): OAuthCredential {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error(`openai-codex: ${filename} ${location} must be an object`)
  }
  const credential = raw as Record<string, unknown>
  if (Object.keys(credential).some(key => !['type', 'access', 'refresh', 'expires', 'accountId'].includes(key))) {
    throw new Error(`openai-codex: ${filename} ${location} contains an unknown field`)
  }
  if (credential['type'] !== 'oauth') throw new Error(`openai-codex: ${filename} ${location} type must be oauth`)
  for (const key of ['access', 'refresh', 'accountId'] as const) {
    if (typeof credential[key] !== 'string' || credential[key].length === 0) {
      throw new Error(`openai-codex: ${filename} ${location} ${key} must be a non-empty string`)
    }
  }
  if (typeof credential['expires'] !== 'number' || !Number.isFinite(credential['expires']) || credential['expires'] <= 0) {
    throw new Error(`openai-codex: ${filename} ${location} expires must be a positive finite number`)
  }
  return credential as unknown as OAuthCredential
}

/** Validate and normalize both the legacy single-account and current document. */
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
    const credential = parseCredential(document['credential'], filename)
    return {
      version: AUTH_FORMAT_VERSION,
      activeAccountId: credential.accountId as string,
      accounts: [credential],
    }
  }
  if (document['version'] !== AUTH_FORMAT_VERSION) {
    throw new Error(`openai-codex: ${filename} has unsupported auth format version ${String(document['version'])}`)
  }
  if (Object.keys(document).some(key => !['version', 'activeAccountId', 'accounts'].includes(key))) {
    throw new Error(`openai-codex: ${filename} contains an unknown top-level field`)
  }
  const activeAccountId = document['activeAccountId']
  if (typeof activeAccountId !== 'string' || activeAccountId.length === 0) {
    throw new Error(`openai-codex: ${filename} activeAccountId must be a non-empty string`)
  }
  if (!Array.isArray(document['accounts']) || document['accounts'].length === 0) {
    throw new Error(`openai-codex: ${filename} accounts must be a non-empty array`)
  }
  const accounts = document['accounts'].map((account, index) => parseCredential(account, filename, `accounts[${String(index)}]`))
  const accountIds = accounts.map(account => account.accountId as string)
  if (new Set(accountIds).size !== accountIds.length) {
    throw new Error(`openai-codex: ${filename} contains duplicate account ids`)
  }
  if (!accountIds.includes(activeAccountId)) {
    throw new Error(`openai-codex: ${filename} activeAccountId does not reference a stored account`)
  }
  return { version: AUTH_FORMAT_VERSION, activeAccountId, accounts }
}

/** Detach credentials from callers that may mutate provider-owned values. */
function cloneDocument(document: AuthDocument): AuthDocument {
  return structuredClone(document)
}

/**
 * Resolve the default OAuth document path.
 * @param dshHome - optional Harness-home override.
 * @returns the absolute owner-only document path.
 */
export function openAICodexAuthPath(dshHome?: string): string {
  return resolve(join(resolveDshHome(dshHome), OPENAI_CODEX_AUTH_FILENAME))
}

/** File-backed pi-ai store with one active credential and durable account history. */
export class OpenAICodexCredentialStore implements CredentialStore {
  /** Absolute credential document path. */
  readonly filename: string

  /**
   * @param filename - explicit document path, defaulting under `$DSH_HOME`.
   */
  constructor(filename: string = openAICodexAuthPath()) {
    this.filename = resolve(filename)
  }

  /** Read and validate the current document without acquiring the writer lock. */
  private async readDocument(): Promise<AuthDocument | undefined> {
    await assertOwnerOnly(this.filename)
    let text: string
    try {
      text = await readFile(this.filename, 'utf8')
    } catch (error) {
      if (isENOENT(error)) return undefined
      throw error
    }
    return cloneDocument(parseDocument(text, this.filename))
  }

  /** Persist a validated version-2 document while the caller owns the file lock. */
  private async writeDocument(document: AuthDocument): Promise<AuthDocument> {
    const validated = parseDocument(JSON.stringify(document), this.filename)
    await writeFileAtomic(this.filename, `${JSON.stringify(validated, null, 2)}\n`, {
      mode: 0o600,
      dirMode: 0o700,
    })
    return cloneDocument(validated)
  }

  private activeCredential(document: AuthDocument | undefined): OAuthCredential | undefined {
    return document?.accounts.find(account => account.accountId === document.activeAccountId)
  }

  /** Enumerate stored accounts without returning tokens. */
  async accounts(): Promise<readonly OpenAICodexAccountSummary[]> {
    const document = await this.readDocument()
    return document?.accounts.map(account => ({
      accountId: account.accountId as string,
      active: account.accountId === document.activeAccountId,
      expires: account.expires,
    })) ?? []
  }

  /** Resolve the owning account internally without exposing any stored token. */
  async accountIdForAccessToken(access: string): Promise<string | undefined> {
    if (access.length === 0) return undefined
    const document = await this.readDocument()
    return document?.accounts.find(account => account.access === access)?.accountId as string | undefined
  }

  /**
   * Atomically select the next saved account after a failed credential.
   * Accounts already attempted by the caller are skipped, preventing loops.
   */
  async activateNext(
    failedAccountId: string,
    attemptedAccountIds: readonly string[] = [],
  ): Promise<OpenAICodexAccountSummary | undefined> {
    if (failedAccountId.length === 0 || failedAccountId.length > 256) {
      throw new TypeError('openai-codex: account id is invalid')
    }
    const attempted = new Set(attemptedAccountIds)
    attempted.add(failedAccountId)
    await mkdir(dirname(this.filename), { recursive: true, mode: 0o700 })
    return withFileLock(this.filename, async () => {
      const document = await this.readDocument()
      if (document === undefined || document.accounts.length < 2) return undefined
      const failedIndex = document.accounts.findIndex(account => account.accountId === failedAccountId)
      const start = failedIndex === -1
        ? document.accounts.findIndex(account => account.accountId === document.activeAccountId)
        : failedIndex
      for (let offset = 1; offset <= document.accounts.length; offset += 1) {
        const account = document.accounts[(Math.max(0, start) + offset) % document.accounts.length]
        if (account === undefined) continue
        const accountId = account.accountId
        if (typeof accountId !== 'string' || attempted.has(accountId)) continue
        if (document.activeAccountId !== accountId) {
          await this.writeDocument({ ...document, activeAccountId: accountId })
        }
        return { accountId, active: true, expires: account.expires }
      }
      return undefined
    })
  }

  /** Select the credential used by every subsequent Codex request. */
  async activate(accountId: string): Promise<OpenAICodexAccountSummary> {
    if (accountId.length === 0 || accountId.length > 256) throw new TypeError('openai-codex: account id is invalid')
    await mkdir(dirname(this.filename), { recursive: true, mode: 0o700 })
    return withFileLock(this.filename, async () => {
      const document = await this.readDocument()
      const account = document?.accounts.find(candidate => candidate.accountId === accountId)
      if (document === undefined || account === undefined) throw new Error('openai-codex: account was not found')
      if (document.activeAccountId !== accountId) {
        await this.writeDocument({ ...document, activeAccountId: accountId })
      }
      return { accountId, active: true, expires: account.expires }
    })
  }

  /** @inheritdoc */
  async read(providerId: string): Promise<Credential | undefined> {
    if (providerId !== OPENAI_CODEX_PROVIDER) return undefined
    const credential = this.activeCredential(await this.readDocument())
    return credential === undefined ? undefined : structuredClone(credential)
  }

  /** @inheritdoc */
  async list(): Promise<readonly CredentialInfo[]> {
    return await this.read(OPENAI_CODEX_PROVIDER) === undefined
      ? []
      : [{ providerId: OPENAI_CODEX_PROVIDER, type: 'oauth' }]
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
      const document = await this.readDocument()
      const current = this.activeCredential(document)
      const candidate = await fn(current === undefined ? undefined : structuredClone(current))
      if (candidate === undefined) return current === undefined ? undefined : structuredClone(current)
      const validated = parseCredential(candidate, this.filename)
      const nextAccounts = document?.accounts.map(account => structuredClone(account)) ?? []
      const existing = nextAccounts.findIndex(account => account.accountId === validated.accountId)
      if (existing === -1) nextAccounts.push(validated)
      else nextAccounts[existing] = validated
      const next = await this.writeDocument({
        version: AUTH_FORMAT_VERSION,
        activeAccountId: validated.accountId as string,
        accounts: nextAccounts,
      })
      const active = this.activeCredential(next)
      return active === undefined ? undefined : structuredClone(active)
    })
  }

  /** Remove only the active account, selecting the next saved account if any. */
  async delete(providerId: string): Promise<void> {
    if (providerId !== OPENAI_CODEX_PROVIDER) return
    await mkdir(dirname(this.filename), { recursive: true, mode: 0o700 })
    await withFileLock(this.filename, async () => {
      const document = await this.readDocument()
      if (document === undefined) return
      const accounts = document.accounts.filter(account => account.accountId !== document.activeAccountId)
      if (accounts.length === 0) {
        await rm(this.filename, { force: true })
        return
      }
      await this.writeDocument({
        version: AUTH_FORMAT_VERSION,
        activeAccountId: accounts[0]!.accountId as string,
        accounts,
      })
    })
  }
}
