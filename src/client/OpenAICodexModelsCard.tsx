/** Account-only Models footer; advanced configuration remains in Plugins. */
import type { OpenAICodexSettingsInjected } from './OpenAICodexSettings.tsx'
import { OpenAICodexSettings } from './OpenAICodexSettings.tsx'

export type OpenAICodexModelsCardInjected = Required<Pick<OpenAICodexSettingsInjected, 't' | 'account'>>

export function OpenAICodexModelsCard({ t, account }: OpenAICodexModelsCardInjected) {
  return <OpenAICodexSettings t={t} account={account} accountOnly />
}
