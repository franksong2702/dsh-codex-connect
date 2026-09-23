/**
 * DSH 0.1.7+ browser settings forms, which replace the removed settingsScope
 * service. The locked 0.1.2-rc.1 client types predate the newer service, so
 * its shape lives here and the running surface is narrowed at runtime.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'

/** One namespace's bound form over the shared settings mirror. */
export interface DshClientConfigForm {
  /** @returns the current snapshot, shaped like the legacy settings-scope snapshot. */
  getSnapshot(): unknown
  /**
   * Observe snapshot replacements.
   * @param listener - invoked after each snapshot change.
   * @returns the disposer removing this listener.
   */
  subscribe(listener: () => void): () => void
}

/** The browser config-forms service carried by DSH 0.1.7 and later. */
export interface DshClientConfigForms {
  /**
   * Bind one namespace's form.
   * @param namespace - stable settings namespace owned by this plugin.
   * @returns the bound form scope.
   */
  get(namespace: string): DshClientConfigForm
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** DSH 0.1.7+ settings forms; the locked 0.1.2-rc.1 client types predate this service. */
    configForms: DshClientConfigForms
  }
}

/** Narrow an unknown value to the config-forms service shape. */
function isConfigForms(value: unknown): value is DshClientConfigForms {
  if (typeof value !== 'object' || value === null) return false
  return typeof (value as { get?: unknown }).get === 'function'
}

/**
 * Read the DSH 0.1.7+ config-forms service without creating an injection
 * dependency, or undefined on clients that predate it.
 * @param ctx - the client plugin context.
 * @returns the config-forms service, or undefined on legacy clients.
 */
export function configFormsOf(ctx: ClientContext): DshClientConfigForms | undefined {
  const value = ctx.get('configForms')
  return isConfigForms(value) ? value : undefined
}

/** The legacy browser settings-scope service (DSH 0.1.2 through 0.1.5). */
export interface LegacyClientSettingsScopeService {
  /**
   * Bind one namespace's scope.
   * @param options - namespace identity and optional redacted-payload decoder.
   * @returns the bound scope.
   */
  bind(options: { namespace: string; decode(value: unknown): unknown }): unknown
}

/** Narrow an unknown value to the legacy settings-scope service shape. */
function isLegacySettingsScope(value: unknown): value is LegacyClientSettingsScopeService {
  if (typeof value !== 'object' || value === null) return false
  return typeof (value as { bind?: unknown }).bind === 'function'
}

/**
 * Read the legacy settings-scope service without creating an injection
 * dependency, or undefined on clients that removed it.
 * @param ctx - the client plugin context.
 * @returns the legacy service, or undefined on DSH 0.1.7+ clients.
 */
export function legacySettingsScopeOf(ctx: ClientContext): LegacyClientSettingsScopeService | undefined {
  const value = ctx.get('settingsScope')
  return isLegacySettingsScope(value) ? value : undefined
}
