/** OpenAI Codex settings page contributed to the Harness Settings panel. */

import { OpenAICodexSettings } from './OpenAICodexSettings.tsx'
import type { OpenAICodexSettingsInjected } from './OpenAICodexSettings.tsx'

/** Dependencies injected by the browser-plugin registration. */
export interface OpenAICodexPluginCardInjected extends OpenAICodexSettingsInjected {
  /** Omit the page chrome when the legacy tab supplies it. */
  embedded: boolean
}

/** Render the complete Codex Connect settings page. */
export function OpenAICodexPluginCard({ t, configScope, updater, account, embedded }: OpenAICodexPluginCardInjected) {
  return <OpenAICodexSettings
    t={t}
    configScope={configScope}
    {...updater === undefined ? {} : { updater }}
    {...account === undefined ? {} : { account }}
    embedded={embedded}
  />
}
