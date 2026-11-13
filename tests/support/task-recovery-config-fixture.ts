import type { ConfigForm, ConfigFormSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'
import { DEFAULT_OPENAI_CODEX_SETTINGS } from '../../src/settings-contract.ts'
import type { OpenAICodexSettingsConfig } from '../../src/settings-contract.ts'

/** Observable accepted settings, independent of the editor's unsaved draft. */
export function taskRecoveryConfigFixture(initial: Partial<ConfigFormSnapshot<OpenAICodexSettingsConfig>> = {}) {
  let snapshot: ConfigFormSnapshot<OpenAICodexSettingsConfig> = {
    status: 'ready', value: { ...DEFAULT_OPENAI_CODEX_SETTINGS }, base: undefined,
    user: undefined, revision: 0, writable: true, mode: 'host', ...initial,
  }
  const listeners = new Set<() => void>()
  const scope: ConfigForm<OpenAICodexSettingsConfig> = {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener) } },
    mutate: async () => { throw new Error('Recovery visibility must not write settings') },
    set: async () => { throw new Error('Recovery visibility must not write settings') },
    unset: async () => { throw new Error('Recovery visibility must not write settings') },
  }
  return {
    scope,
    update(patch: Partial<ConfigFormSnapshot<OpenAICodexSettingsConfig>>) {
      snapshot = { ...snapshot, ...patch }
      for (const listener of listeners) listener()
    },
    show(showTaskRecoveryControls: boolean) {
      snapshot = { ...snapshot, status: 'ready', value: { ...DEFAULT_OPENAI_CODEX_SETTINGS, showTaskRecoveryControls } }
      for (const listener of listeners) listener()
    },
  }
}
