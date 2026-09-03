/** Safe browser labels derived locally from OpenAI Codex OAuth credentials. */

import { Buffer } from 'node:buffer'
import type { OAuthCredential } from '@earendil-works/pi-ai'

const PROFILE_CLAIM = 'https://api.openai.com/profile'
const MAX_JWT_PAYLOAD_LENGTH = 64 * 1024
const MAX_LABEL_LENGTH = 128
const MAX_EMAIL_LENGTH = 320

export type OpenAICodexAccountProfileSource = 'oauth' | 'generated'

export interface OpenAICodexAccountProfile {
  displayName: string
  maskedEmail?: string
  source: OpenAICodexAccountProfileSource
}

function boundedText(value: unknown, maximum: number): string | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.replace(/[\u0000-\u001f\u007f]/gu, '').trim()
  return normalized.length > 0 && normalized.length <= maximum ? normalized : undefined
}

function maskEmail(email: string): string {
  const separator = email.lastIndexOf('@')
  if (separator <= 0 || separator === email.length - 1) return '••••'
  const local = email.slice(0, separator)
  const domain = email.slice(separator + 1)
  return `${local.slice(0, Math.min(2, local.length))}••@${domain}`
}

function decodeOauthProfile(access: string): { name?: string; email?: string } {
  const payload = access.split('.')[1]
  if (payload === undefined || payload.length === 0 || payload.length > MAX_JWT_PAYLOAD_LENGTH) return {}
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

/** Resolve display-only labels without network access or provider account identifiers. */
export function resolveOpenAICodexAccountProfiles(
  credentials: readonly OAuthCredential[],
): readonly OpenAICodexAccountProfile[] {
  return credentials.map((credential, index) => {
    const oauth = decodeOauthProfile(credential.access)
    return {
      displayName: oauth.name ?? `ChatGPT account ${String(index + 1)}`,
      ...(oauth.email === undefined ? {} : { maskedEmail: maskEmail(oauth.email) }),
      source: oauth.name === undefined && oauth.email === undefined ? 'generated' : 'oauth',
    }
  })
}
