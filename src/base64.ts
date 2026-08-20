/** Strict base64 helpers used before allocating decoded image bytes. */

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/u

function base64Value(character: string): number {
  return BASE64_ALPHABET.indexOf(character)
}

/** Return the exact decoded length for canonical base64, or undefined when invalid. */
export function estimateBase64Bytes(value: string): number | undefined {
  if (value.length === 0 || value.length % 4 !== 0 || !BASE64_PATTERN.test(value)) return undefined
  const firstPadding = value.indexOf('=')
  if (firstPadding >= 0 && firstPadding < value.length - 2) return undefined
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0
  if (padding === 2 && (base64Value(value[value.length - 3] ?? '') & 0x0f) !== 0) return undefined
  if (padding === 1 && (base64Value(value[value.length - 2] ?? '') & 0x03) !== 0) return undefined
  const bytes = (value.length / 4) * 3 - padding
  return Number.isSafeInteger(bytes) ? bytes : undefined
}

/** Decode canonical base64 after strict syntax and tail-bit validation. */
export function decodeStrictBase64(value: string): Uint8Array | undefined {
  const expected = estimateBase64Bytes(value)
  if (expected === undefined) return undefined
  const decoded = Buffer.from(value, 'base64')
  return decoded.byteLength === expected ? new Uint8Array(decoded) : undefined
}
