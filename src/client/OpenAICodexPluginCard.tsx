/** OpenAI Codex settings page contributed to the Harness Plugins tab. */

import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import { OpenAICodexSettings } from './OpenAICodexSettings.tsx'
import type { OpenAICodexSettingsInjected } from './OpenAICodexSettings.tsx'

/** Dependencies injected by the browser-plugin registration. */
export type OpenAICodexPluginCardInjected = OpenAICodexSettingsInjected

/** Props delivered by the Codex Connect Plugins settings tab. */
export type OpenAICodexPluginCardProps =
  PropsRuntime<'settings.plugins.tab'>
  & OpenAICodexPluginCardInjected

/** Render the complete Codex Connect settings page in its dedicated Plugins tab. */
export function OpenAICodexPluginCard({ t, configScope, updater, account }: OpenAICodexPluginCardProps) {
  return <OpenAICodexSettings
    t={t}
    configScope={configScope}
    {...updater === undefined ? {} : { updater }}
    {...account === undefined ? {} : { account }}
    embedded
  />
}
