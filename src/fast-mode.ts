/** Process-local, per-session OpenAI Codex Fast Mode state. */

/** Maximum number of enabled sessions retained by one plugin instance. */
export const OPENAI_CODEX_FAST_MODE_MAX_SESSIONS = 256
/** Maximum UTF-16 code units accepted for an opaque DSH session id. */
export const OPENAI_CODEX_FAST_MODE_MAX_SESSION_ID_LENGTH = 256

/**
 * Validate the opaque session identity used by the Fast Mode registry.
 *
 * The registry deliberately does not interpret or normalize session ids.  It
 * only rejects values that cannot safely serve as a bounded map key.
 */
export function isFastModeSessionId(value: unknown): value is string {
  return typeof value === 'string'
    && value.trim().length > 0
    && value.length <= OPENAI_CODEX_FAST_MODE_MAX_SESSION_ID_LENGTH
}

/**
 * In-memory Fast Mode registry.  Entries are positive-only: disabling a
 * session removes its key, and an insertion over the bound evicts the least
 * recently touched key.  A new plugin instance starts with an empty map.
 */
export class FastModeRegistry {
  private readonly enabledSessions = new Map<string, true>()

  constructor(
    private readonly maxSessions = OPENAI_CODEX_FAST_MODE_MAX_SESSIONS,
  ) {
    if (!Number.isSafeInteger(maxSessions) || maxSessions < 1 || maxSessions > OPENAI_CODEX_FAST_MODE_MAX_SESSIONS) {
      throw new RangeError('Fast Mode registry capacity is out of bounds')
    }
  }

  /** Number of currently enabled sessions. */
  get size(): number {
    return this.enabledSessions.size
  }

  /** Read one session without exposing the map or any credential state. */
  isEnabled(sessionId: unknown): boolean {
    if (!isFastModeSessionId(sessionId)) return false
    const enabled = this.enabledSessions.get(sessionId)
    if (enabled === undefined) return false
    // Touch the key so repeated active sessions are retained before eviction.
    this.enabledSessions.delete(sessionId)
    this.enabledSessions.set(sessionId, true)
    return true
  }

  /** Alias useful to callers that model this as a boolean setting. */
  get(sessionId: unknown): boolean {
    return this.isEnabled(sessionId)
  }

  /** Enable or disable exactly one opaque session id. */
  set(sessionId: unknown, enabled: boolean): void {
    if (!isFastModeSessionId(sessionId)) throw new TypeError('Invalid Fast Mode session id')
    if (typeof enabled !== 'boolean') throw new TypeError('Fast Mode enabled must be boolean')
    if (!enabled) {
      this.enabledSessions.delete(sessionId)
      return
    }
    this.enabledSessions.delete(sessionId)
    while (this.enabledSessions.size >= this.maxSessions) {
      const oldest = this.enabledSessions.keys().next().value as string | undefined
      if (oldest === undefined) break
      this.enabledSessions.delete(oldest)
    }
    this.enabledSessions.set(sessionId, true)
  }

  /** Explicitly named alias for callers that avoid boolean-setting verbs. */
  setEnabled(sessionId: unknown, enabled: boolean): void {
    this.set(sessionId, enabled)
  }

  /** Disable one session and forget its key. */
  delete(sessionId: unknown): void {
    if (!isFastModeSessionId(sessionId)) return
    this.enabledSessions.delete(sessionId)
  }

  /** Remove all process-local state during an explicit lifecycle teardown. */
  clear(): void {
    this.enabledSessions.clear()
  }
}

/** Descriptive alias retained for integrations that namespace plugin state. */
export { FastModeRegistry as OpenAICodexFastModeRegistry }
