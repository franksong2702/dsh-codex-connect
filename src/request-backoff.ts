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
