/** Parse server retry hints without allowing invalid or overflowing timer delays. */
export function readRetryAfterMs(headers: Headers, now = Date.now()): number | undefined {
  const milliseconds = headers.get('retry-after-ms')
  const seconds = headers.get('retry-after')
  const numeric = (value: string | null): number | undefined => {
    if (value === null || !/^\d+(?:\.\d+)?$/u.test(value.trim())) return undefined
    const result = Number(value)
    return Number.isFinite(result) && result >= 0 ? result : undefined
  }
  const ms = numeric(milliseconds)
  const delay = numeric(seconds)
  const date = seconds !== null && /[A-Za-z]/u.test(seconds) ? Date.parse(seconds) : NaN
  const result = ms ?? (delay === undefined ? (Number.isFinite(date) ? Math.max(0, date - now) : undefined) : delay * 1_000)
  // Never turn a delay outside the timer range into an immediate retry.
  return result === undefined ? undefined : result > 2_147_483_647 ? Infinity : Math.ceil(result)
}

/** Shared exponential backoff primitive; route policy supplies its own base/cap. */
export function openAICodexBackoffDelay(
  attempt: number,
  options: {
    readonly baseMs: number
    readonly maxMs: number
    readonly retryAfterMs?: number
    readonly jitterRatio?: number
  },
): number {
  if (!Number.isSafeInteger(attempt) || attempt < 0) throw new TypeError('attempt must be a non-negative safe integer')
  if (!Number.isFinite(options.baseMs) || options.baseMs < 0
    || !Number.isFinite(options.maxMs) || options.maxMs < options.baseMs) {
    throw new TypeError('backoff bounds are invalid')
  }
  const ratio = options.jitterRatio ?? 0
  if (!Number.isFinite(ratio) || ratio < 0 || ratio > 1) throw new TypeError('jitterRatio must be between 0 and 1')
  const base = Math.min(options.maxMs, options.baseMs * 2 ** Math.min(attempt, 30))
  const jittered = Math.min(options.maxMs, base + Math.floor(Math.random() * base * ratio))
  const retryAfter = options.retryAfterMs
  if (retryAfter === Infinity) return Infinity
  return Math.max(jittered, retryAfter === undefined || !Number.isFinite(retryAfter) ? 0 : retryAfter)
}

/** Abort-aware wait used by routes that explicitly opt into retries. */
export async function waitForOpenAICodexBackoff(delayMs: number, signal?: AbortSignal): Promise<void> {
  if (!Number.isFinite(delayMs) || delayMs < 0) throw new TypeError('delayMs must be a finite non-negative number')
  await new Promise<void>((resolve, reject) => {
    if (signal?.aborted === true) { reject(signal.reason); return }
    const finish = (): void => {
      signal?.removeEventListener('abort', abort)
      resolve()
    }
    const timer = setTimeout(finish, delayMs)
    const abort = (): void => {
      clearTimeout(timer)
      reject(signal?.reason)
    }
    signal?.addEventListener('abort', abort, { once: true })
  })
}
