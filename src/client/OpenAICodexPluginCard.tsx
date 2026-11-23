/** OpenAI Codex settings page contributed as a first-class Harness Settings section. */

import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { OpenAICodexSettings } from './OpenAICodexSettings.tsx'
import type { OpenAICodexSettingsInjected } from './OpenAICodexSettings.tsx'

/** Dependencies injected by the browser-plugin registration. */
export type OpenAICodexPluginCardInjected = OpenAICodexSettingsInjected

/** Props delivered by the Codex Connect Settings section. */
export type OpenAICodexPluginCardProps =
  PropsRuntime<'settings.section'>
  & OpenAICodexPluginCardInjected

/** Render the complete Codex Connect settings page in its Settings section. */
export function OpenAICodexPluginCard({ t, configScope, updater, account }: OpenAICodexPluginCardProps) {
  return <OpenAICodexSettings
    t={t}
    configScope={configScope}
    {...updater === undefined ? {} : { updater }}
    {...account === undefined ? {} : { account }}
    embedded
  />
}
