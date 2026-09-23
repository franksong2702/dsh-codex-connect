/**
 * DSH 0.1.7+ live settings surface, which replaces the legacy section
 * installer. The locked 0.1.2-rc.1 development types predate it, so the
 * shape lives here and every use is narrowed at runtime.
 */

/** One namespace's live settings scope as provided by DSH 0.1.7 and later. */
export interface DshLiveSettingsScope {
  /** Read the namespace's current resolved settings value. */
  get(): unknown
  /**
   * Observe committed settings changes.
   * @param listener - invoked after each committed update.
   * @returns the disposer removing this listener.
   */
  watch(listener: () => void): () => void
}

/** The DSH 0.1.7+ settings service shape, detected at runtime. */
export interface DshLiveSettingsService {
  /**
   * Register one namespace's schema and receive its live scope.
   * @param namespace - stable settings namespace owned by the caller.
   * @param schema - the namespace's configuration schema.
   * @param options - live application policy for the namespace.
   * @returns the bound live scope.
   */
  register(namespace: string, schema: unknown, options: { applies: 'live' }): DshLiveSettingsScope
}

/**
 * Narrow an injected settings service to the DSH 0.1.7+ surface, or undefined
 * when the running DSH still carries the legacy section installer. DSH 0.1.2
 * itself already exposes both calls: its `register` is the low-level namespace
 * registration that still needs the composition entry passed as `base`, which
 * only `installSection` wires up. The surface without `installSection` is the
 * one whose registration carries the composition base itself.
 * @param settings - the injected settings service.
 * @returns the live-settings surface, or undefined on legacy DSH.
 */
export function liveSettingsOf(settings: unknown): DshLiveSettingsService | undefined {
  if (typeof settings !== 'object' || settings === null) return undefined
  const candidate = settings as { register?: unknown; installSection?: unknown }
  if (typeof candidate.register !== 'function' || typeof candidate.installSection === 'function') return undefined
  return settings as DshLiveSettingsService
}
