import { Buffer } from 'node:buffer'
import { describe, expect, it } from 'vitest'
import type { OAuthCredential } from '@earendil-works/pi-ai'
import { resolveOpenAICodexAccountProfiles } from '../src/account-profile.ts'

function token(profile: unknown): string {
  const payload = Buffer.from(JSON.stringify({ 'https://api.openai.com/profile': profile })).toString('base64url')
  return `header.${payload}.signature`
}

function credential(access: string): OAuthCredential {
  return { type: 'oauth', access, refresh: 'refresh', expires: 1, accountId: 'account' }
}

describe('OpenAI Codex account profiles', () => {
  it('uses bounded OAuth profile labels and masks email addresses', () => {
    expect(resolveOpenAICodexAccountProfiles([
      credential(token({ name: ' Ada Lovelace ', email: 'ada@example.com' })),
    ])).toEqual([{ displayName: 'Ada Lovelace', maskedEmail: 'ad••@example.com', source: 'oauth' }])
  })

  it('falls back to neutral generated labels for malformed or unusable claims', () => {
    const oversized = `header.${'a'.repeat(64 * 1024 + 1)}.signature`
    expect(resolveOpenAICodexAccountProfiles([
      credential('not-a-jwt'),
      credential(oversized),
      credential(token({ name: '\u0000', email: 'invalid' })),
      credential(token(null)),
    ])).toEqual([
      { displayName: 'ChatGPT account 1', source: 'generated' },
      { displayName: 'ChatGPT account 2', source: 'generated' },
      { displayName: 'ChatGPT account 3', maskedEmail: '••••', source: 'oauth' },
      { displayName: 'ChatGPT account 4', source: 'generated' },
    ])
  })

  it('ignores profile fields outside their display limits', () => {
    expect(resolveOpenAICodexAccountProfiles([
      credential(token({ name: 'n'.repeat(129), email: 'e'.repeat(321) })),
    ])).toEqual([{ displayName: 'ChatGPT account 1', source: 'generated' }])
  })
})
