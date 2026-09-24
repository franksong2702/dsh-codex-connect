/** Codex Connect's decoded view over the Host-owned configuration form. */

import type { ConfigForm, ConfigFormSnapshot, SettingsDescribeFace } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { OpenAICodexSettingsConfig } from '../settings-contract.ts'
import { decodeOpenAICodexSettings, OPENAI_CODEX_SETTINGS_NAMESPACE } from '../settings-contract.ts'

/**
 * The Host form validates its serialized schema in the browser. Codex Connect's
 * Host-only schema transforms cannot be rehydrated there, so read the same
 * accepted Host view through this package's browser-safe decoder. Writes still
 * use the Host form's ordered queue and revision checks.
 */
export class OpenAICodexConfigForm implements ConfigForm<OpenAICodexSettingsConfig> {
  private formSnapshot: ConfigFormSnapshot<OpenAICodexSettingsConfig> | undefined
  private mirrorSnapshot: ReturnType<SettingsDescribeFace['getSnapshot']> | undefined
  private projected: ConfigFormSnapshot<OpenAICodexSettingsConfig> | undefined

  constructor(
    private readonly form: ConfigForm<OpenAICodexSettingsConfig>,
    private readonly mirror: SettingsDescribeFace,
  ) {}

  getSnapshot(): ConfigFormSnapshot<OpenAICodexSettingsConfig> {
    const form = this.form.getSnapshot()
    const mirror = this.mirror.getSnapshot()
    if (form === this.formSnapshot && mirror === this.mirrorSnapshot && this.projected !== undefined) return this.projected
    this.formSnapshot = form
    this.mirrorSnapshot = mirror
    if (form.status !== 'loading') return (this.projected = form)
    if (mirror.view === undefined) return (this.projected = mirror.status === 'unavailable' ? { ...form, status: 'unavailable' } : form)
    const view = mirror.view.namespaces.find(candidate => candidate.ns === OPENAI_CODEX_SETTINGS_NAMESPACE)
    if (view === undefined) return (this.projected = { ...form, status: 'unavailable' })
    const value = decodeOpenAICodexSettings(view.value)
    this.projected = value === undefined ? { ...form, status: 'unavailable' } : {
      status: 'ready', value, base: view.base, user: view.user,
      revision: view.revision, writable: mirror.view.writable, mode: form.mode,
    }
    return this.projected
  }

  subscribe(listener: () => void): () => void {
    const stopForm = this.form.subscribe(listener)
    const stopMirror = this.mirror.subscribe(listener)
    return () => { stopForm(); stopMirror() }
  }

  mutate(ops: Parameters<ConfigForm<OpenAICodexSettingsConfig>['mutate']>[0], expectedRevision?: number): Promise<boolean> {
    return this.form.mutate(ops, expectedRevision)
  }

  set(field: string, value: unknown): Promise<boolean> {
    return this.form.set(field, value)
  }

  unset(field: string): Promise<boolean> {
    return this.form.unset(field)
  }
}
