/** Narrow compatibility seam for billion-context's installed native fetch chain.
 * Local routing state grants authority; response headers never grant it themselves.
 */
const INTERCEPT = Symbol.for('billion-context.native-fetch-intercept')
const CHAIN = Symbol.for('billion-context.native-fetch-chain')
const ACTIVE_STATE = Symbol.for('billion-context.native-intercept-state')
const globals = globalThis as typeof globalThis & Record<symbol, unknown>

interface NativeAuthority {
  readonly fetch: typeof globalThis.fetch
  readonly state: object & { origin: string }
  readonly origin: string
}

function nativeOrigin(value: unknown): string | undefined {
  // Require a literal numeric loopback, HTTP and an explicit port. Do not trust
  // DNS names, alternate IPv4 spellings, credentials, paths, queries or fragments.
  if (typeof value !== 'string' || !/^http:\/\/(?:127\.0\.0\.1|\[::1\]):[0-9]+\/?$/u.test(value)) return
  try { return new URL(value).origin } catch { return }
}

/** Capture anew immediately before each fetch, not at plugin load or stream creation. */
export function captureNativePreflightAuthority(): NativeAuthority | undefined {
  const fetch = globalThis.fetch
  const state = globals[ACTIVE_STATE]
  if (globals[INTERCEPT] !== true || typeof fetch !== 'function'
    || Object.getOwnPropertyDescriptor(fetch, CHAIN)?.value !== true
    || typeof state !== 'object' || state === null || !('origin' in state) || typeof state.origin !== 'string') return
  const origin = nativeOrigin(state.origin)
  return origin === undefined ? undefined : { fetch, state: state as NativeAuthority['state'], origin }
}

/** Reload/replacement revokes this response's authority, including later heartbeat frames. */
export function isCurrentNativePreflightAuthority(authority: NativeAuthority): boolean {
  return globals[INTERCEPT] === true && globalThis.fetch === authority.fetch
    && Object.getOwnPropertyDescriptor(authority.fetch, CHAIN)?.value === true
    && globals[ACTIVE_STATE] === authority.state && nativeOrigin(authority.state.origin) === authority.origin
}

/** Only the exact downstream rewrite of this input can authorize a native preflight response. */
export function isNativePreflightResponse(
  authority: NativeAuthority | undefined, response: Response, input: string | URL | Request,
): boolean {
  if (authority === undefined || !isCurrentNativePreflightAuthority(authority) || response.redirected) return false
  try {
    const url = typeof input === 'string' || input instanceof URL ? String(input) : input.url
    return response.url === new URL(authority.origin + '/bili/' + url).href
  } catch { return false }
}
