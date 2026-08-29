/** Non-secret, local display metadata for saved OpenAI Codex accounts. */

import { Buffer } from 'node:buffer'
import { readFile, stat } from 'node:fs/promises'
import { userInfo } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import type { OAuthCredential } from '@earendil-works/pi-ai'

/** Optional account-label document stored next to the OAuth credential file. */
export const OPENAI_CODEX_ACCOUNT_PROFILES_FILENAME = '.openai-codex-account-profiles.json'

const PROFILE_CLAIM = 'https://api.openai.com/profile'
const MAX_PROFILE_FILE_BYTES = 64 * 1024
const MAX_LABEL_LENGTH = 128
const MAX_EMAIL_LENGTH = 320

export type OpenAICodexAccountProfileSource = 'file' | 'oauth' | 'local' | 'generated'

export interface OpenAICodexAccountProfile {
  displayName: string
  email?: string
  source: OpenAICodexAccountProfileSource
}

interface AccountProfileOverride {
  name?: string
  email?: string
}

interface AccountProfilesDocument {
  localUsername?: string
  accounts: Readonly<Record<string, AccountProfileOverride>>
}

function boundedText(value: unknown, maximum: number): string | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.replace(/[\u0000-\u001f\u007f]/gu, '').trim()
  return normalized.length > 0 && normalized.length <= maximum ? normalized : undefined
}

function decodeOauthProfile(access: string): AccountProfileOverride {
  const payload = access.split('.')[1]
  if (payload === undefined || payload.length === 0 || payload.length > MAX_PROFILE_FILE_BYTES) return {}
  try {
    const decoded: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (typeof decoded !== 'object' || decoded === null || Array.isArray(decoded)) return {}
    const profile = (decoded as Record<string, unknown>)[PROFILE_CLAIM]
    if (typeof profile !== 'object' || profile === null || Array.isArray(profile)) return {}
    const record = profile as Record<string, unknown>
    const name = boundedText(record['name'], MAX_LABEL_LENGTH)
    const email = boundedText(record['email'], MAX_EMAIL_LENGTH)
    return {
      ...(name === undefined ? {} : { name }),
      ...(email === undefined ? {} : { email }),
    }
  } catch {
    return {}
  }
}

function parseOverride(value: unknown): AccountProfileOverride | undefined {
  if (typeof value === 'string') {
    const name = boundedText(value, MAX_LABEL_LENGTH)
    return name === undefined ? undefined : { name }
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  if (Object.keys(record).some(key => key !== 'name' && key !== 'email')) return undefined
  const name = boundedText(record['name'], MAX_LABEL_LENGTH)
  const email = boundedText(record['email'], MAX_EMAIL_LENGTH)
  return name === undefined && email === undefined ? undefined : {
    ...(name === undefined ? {} : { name }),
    ...(email === undefined ? {} : { email }),
  }
}

function parseProfilesDocument(value: unknown): AccountProfilesDocument | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  if (record['version'] !== 1 || Object.keys(record).some(key => !['version', 'localUsername', 'accounts'].includes(key))) {
    return undefined
  }
  const localUsername = boundedText(record['localUsername'], MAX_LABEL_LENGTH)
  const rawAccounts = record['accounts']
  if (rawAccounts !== undefined && (typeof rawAccounts !== 'object' || rawAccounts === null || Array.isArray(rawAccounts))) {
    return undefined
  }
  const accounts: Record<string, AccountProfileOverride> = {}
  for (const [key, raw] of Object.entries((rawAccounts ?? {}) as Record<string, unknown>)) {
    const normalizedKey = boundedText(key, MAX_EMAIL_LENGTH)
    const override = parseOverride(raw)
    if (normalizedKey === undefined || override === undefined) return undefined
    accounts[normalizedKey] = override
  }
  return { ...(localUsername === undefined ? {} : { localUsername }), accounts }
}

async function readProfilesDocument(filename: string): Promise<AccountProfilesDocument | undefined> {
  try {
    const metadata = await stat(filename)
    if (!metadata.isFile() || metadata.size > MAX_PROFILE_FILE_BYTES) return undefined
    return parseProfilesDocument(JSON.parse(await readFile(filename, 'utf8')) as unknown)
  } catch {
    // Labels are optional: malformed or absent metadata must never block auth.
    return undefined
  }
}

/** Resolve the conventional profile file next to an OAuth auth document. */
export function openAICodexAccountProfilesPath(authFilename: string): string {
  return resolve(join(dirname(authFilename), OPENAI_CODEX_ACCOUNT_PROFILES_FILENAME))
}

function localUsername(document: AccountProfilesDocument | undefined): string | undefined {
  let operatingSystemUsername: string | undefined
  try {
    operatingSystemUsername = boundedText(userInfo().username, MAX_LABEL_LENGTH)
  } catch {
    operatingSystemUsername = undefined
  }
  return document?.localUsername
    ?? boundedText(process.env['OPENAI_CODEX_LOCAL_USERNAME'], MAX_LABEL_LENGTH)
    ?? operatingSystemUsername
    ?? boundedText(process.env['USERNAME'], MAX_LABEL_LENGTH)
    ?? boundedText(process.env['USER'], MAX_LABEL_LENGTH)
    ?? boundedText(process.env['LOGNAME'], MAX_LABEL_LENGTH)
}

/**
 * Resolve safe browser-facing names without returning or persisting tokens.
 * File overrides may be keyed by account id or OAuth email.
 */
export async function resolveOpenAICodexAccountProfiles(
  credentials: readonly OAuthCredential[],
  profileFilename: string,
): Promise<readonly OpenAICodexAccountProfile[]> {
  const document = await readProfilesDocument(profileFilename)
  const username = localUsername(document)
  return credentials.map((credential, index) => {
    const oauth = decodeOauthProfile(credential.access)
    const accountId = credential.accountId as string
    const override = document?.accounts[accountId]
      ?? (oauth.email === undefined ? undefined : document?.accounts[oauth.email])
    const email = override?.email ?? oauth.email
    const displayName = override?.name
      ?? (override?.email === undefined ? oauth.name : undefined)
      ?? email
      ?? (username === undefined ? undefined : credentials.length > 1 ? `${username} · ${String(index + 1)}` : username)
      ?? `Account ${String(index + 1)}`
    return {
      displayName,
      ...(email === undefined || email === displayName ? {} : { email }),
      source: override !== undefined ? 'file' : oauth.name !== undefined || oauth.email !== undefined
        ? 'oauth'
        : username !== undefined ? 'local' : 'generated',
    }
  })
}
