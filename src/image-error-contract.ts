/** Node-free, fixed public image failures. Unknown provider/host text is never rendered. */
export const IMAGE_INPUT_FAILURE_REASONS = [
  'shorten the instructions or reference descriptions.',
  'requires valid, bounded image selections.',
  'requires the current session and its image history.',
  'requires complete host image limits.',
  'too many inputs for this deployment.',
  'is unavailable in this session. Select or attach the image again.',
  'is unavailable or does not match a reference in this session. Select or attach the image again.',
  'identifies both an upload and a generated result. Select the uploaded attachment explicitly or choose an exact original image.',
  'matches several original results. Select one exact original image.',
  'only a preview is available. Explicitly choose that preview or attach an original.',
  'has unsupported attachment metadata.',
  "exceeds this deployment's image limits or uses an unsupported format.",
  "exceeds this deployment's total input limit.",
  'the original is unavailable or failed integrity checks; no preview was substituted.',
  'the stored bytes do not match the image reference.',
  'cannot be read or validated. No image request was sent.',
  'is required.',
] as const

export type ImageInputFailureReason = typeof IMAGE_INPUT_FAILURE_REASONS[number]
export type ImageInputLabel = 'Edit instructions' | 'Image editing' | 'Image batch' | 'Target image' | `Reference image ${number}`
export type ImageFailureRecovery = 'input' | 'account' | 'storage'
export interface SafeImageFailure {
  readonly message: string
  readonly retryable: boolean
  readonly recovery?: ImageFailureRecovery
}

export function imageInputFailureMessage(label: ImageInputLabel, reason: ImageInputFailureReason): string {
  return `${label}: ${reason}`
}

const TRANSPORT_MESSAGES = {
  OPENAI_CODEX_SIGNED_OUT: 'Sign in to OpenAI Codex before generating images.',
  OPENAI_CODEX_REAUTH_REQUIRED: 'Renew OpenAI Codex authorization before generating images.',
  OPENAI_CODEX_RATE_LIMITED: 'Image generation is temporarily unavailable. Try again later.',
  OPENAI_CODEX_TIMEOUT: 'Image generation timed out. The request may still be processing.',
  OPENAI_CODEX_CANCELED: 'Image generation was canceled. The request may still be processing.',
  OPENAI_CODEX_NETWORK_ERROR: 'The image generation request lost its network connection. The request may still be processing.',
  OPENAI_CODEX_UPSTREAM_REJECTED: 'The image generation request was rejected.',
  OPENAI_CODEX_UPSTREAM_UNAVAILABLE: 'Image generation is temporarily unavailable.',
  OPENAI_CODEX_RESPONSE_TOO_LARGE: 'The image generation response exceeded the safe size limit.',
  OPENAI_CODEX_MALFORMED_RESPONSE: 'The image generation response was unreadable.',
} as const
const UNKNOWN_TRANSPORT_MESSAGE = 'Image generation failed without exposing private response details.'

export function imageTransportErrorMessage(code: unknown): string {
  return typeof code === 'string' && Object.hasOwn(TRANSPORT_MESSAGES, code)
    ? TRANSPORT_MESSAGES[code as keyof typeof TRANSPORT_MESSAGES] : UNKNOWN_TRANSPORT_MESSAGE
}

const failures = new Map<string, SafeImageFailure>()
function register(message: string, retryable: boolean, recovery?: ImageFailureRecovery): void {
  for (const prefix of ['', 'Error: ']) {
    const text = prefix + message
    failures.set(text, { message: text, retryable, ...(recovery === undefined ? {} : { recovery }) })
  }
}
for (const label of ['Edit instructions', 'Image editing', 'Image batch', 'Target image',
  'Reference image 1', 'Reference image 2', 'Reference image 3', 'Reference image 4'] as const) {
  for (const reason of IMAGE_INPUT_FAILURE_REASONS) register(imageInputFailureMessage(label, reason), false, 'input')
}
for (const [code, message] of Object.entries(TRANSPORT_MESSAGES)) {
  const account = code === 'OPENAI_CODEX_SIGNED_OUT' || code === 'OPENAI_CODEX_REAUTH_REQUIRED'
  register(message, !account, account ? 'account' : undefined)
}
register(UNKNOWN_TRANSPORT_MESSAGE, true)
register('Invalid image request. Editing requires operation=edit, one explicit target and valid references; no generation was attempted.', false, 'input')
register('This Codex Connect transport does not support editing. No generation was attempted.', false, 'input')
register('The Codex Connect image transport is unavailable.', false, 'input')
for (const message of [
  'The generated original images could not be saved.',
  'The generated images could not be saved; no attachment references were returned.',
  'The image stores returned an incomplete image batch.',
]) register(message, false, 'storage')

/** Match complete fixed strings, not prefixes or arbitrary text that merely looks safe. */
export function safeImageFailure(content: readonly unknown[]): SafeImageFailure | undefined {
  for (const block of content.slice(0, 8)) {
    if (typeof block !== 'object' || block === null) continue
    const value = block as { type?: unknown; text?: unknown }
    if (value.type !== 'text' || typeof value.text !== 'string' || value.text.length > 1500) continue
    const safe = failures.get(value.text)
    if (safe !== undefined) return { ...safe }
  }
  return undefined
}
