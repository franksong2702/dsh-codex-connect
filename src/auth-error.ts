/** Public diagnostics never include arbitrary provider messages or nested causes. */
const REQUEST_AUTH_MESSAGES = {
  MISSING_CREDENTIAL: 'OpenAI Codex request account is unavailable. Please select an account or sign in again.',
  AUTH_FAILED: 'OpenAI Codex operation failed. Please try again.',
  REAUTH_REQUIRED: 'OpenAI Codex authorization must be renewed',
  ABORTED: 'OpenAI Codex request cancelled.',
} as const

/** Safe request-authentication failure with no upstream message or nested cause. */
export class OpenAICodexRequestAuthError extends Error {
  constructor(readonly code: keyof typeof REQUEST_AUTH_MESSAGES) {
    super(REQUEST_AUTH_MESSAGES[code])
    this.name = code === 'ABORTED' ? 'AbortError' : 'OpenAICodexRequestAuthError'
  }
}

const PUBLIC_MESSAGES = new Set([
  ...Object.values(REQUEST_AUTH_MESSAGES),
  'ChatGPT authorization expired. Please sign in again.',
  'OpenAI Codex sign-in cancelled',
  'OpenAI Codex plugin disposed',
  'openai-codex: account not found',
  'openai-codex: replacement account not found',
  'openai-codex: removing the active account requires replacementAccountKey',
  'openai-codex: replacementAccountKey is only valid when removing the active account',
])

/** Return a bounded diagnostic from a closed vocabulary, never upstream response text. */
export function publicAuthError(error: unknown): string {
  const message = error instanceof Error ? error.message : ''
  if (PUBLIC_MESSAGES.has(message)) return message
  if (/^OpenAI Codex usage request failed with HTTP [1-5][0-9]{2}$/u.test(message)) return message
  return 'OpenAI Codex operation failed. Please try again.'
}

/** Stable public discriminant for an expired or revoked Codex OAuth session. */
export const OPENAI_CODEX_REAUTH_REQUIRED_CODE = 'OPENAI_CODEX_REAUTH_REQUIRED' as const
