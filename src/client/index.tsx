/** Browser half: OpenAI Codex account management inside Plugin configuration. */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-connection/client'
// Type-only: pulls the conversation input-region SlotMap declaration.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: pulls ctx.modelDirectories and its session directory contract.
import type {} from '@deepseek-ai/dsh-client-ui-model-selection/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import {
  decodeOpenAICodexSettings,
  OPENAI_CODEX_SETTINGS_NAMESPACE,
} from '../settings-contract.ts'
import { OpenAICodexPluginCard } from './OpenAICodexPluginCard.tsx'
import type { OpenAICodexPluginCardInjected } from './OpenAICodexPluginCard.tsx'
import { OpenAICodexQuotaIndicator } from './OpenAICodexQuotaIndicator.tsx'
import type { OpenAICodexQuotaIndicatorInjected } from './OpenAICodexQuotaIndicator.tsx'
import { en, zh } from './locales.ts'
import type { OpenAICodexSettingsKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** OpenAI Codex account page copy. */
    'settings.openai-codex': OpenAICodexSettingsKey
  }
}

/** Stable browser-plugin name. */
export const name = 'dsh-codex-connect-client'
/** Client services required by the Plugin configuration contribution. */
export const inject = ['slots', 'locale', 'connection', 'remote', 'settingsScope']

/** Register account copy and the OpenAI Codex card under Plugin configuration. */
export function apply(ctx: ClientContext): void {
  const namespace = 'settings.openai-codex'
  ctx.effect(() => ctx.locale.register(namespace, { zh, en }), 'dsh-codex-connect: settings copy')
  const t = ctx.locale.bind(namespace) as OpenAICodexPluginCardInjected['t']
  const configScope = ctx.settingsScope.bind({
    namespace: OPENAI_CODEX_SETTINGS_NAMESPACE,
    decode: decodeOpenAICodexSettings,
  })
  ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
    name: 'settings.plugin.item',
    id: 'openai-codex',
    order: 30,
    inject: (): OpenAICodexPluginCardInjected => ({ t, configScope }),
  }, OpenAICodexPluginCard))

  ctx.inject(['slots', 'modelDirectories'], (scope: ClientContext) => {
    scope.slots.inject('conversation.input.right', () => scope.slots.register({
      name: 'conversation.input.right',
      id: 'openai-codex-quota',
      order: 20,
      locale: namespace,
      inject: (sessionId): OpenAICodexQuotaIndicatorInjected => ({
        directory: scope.modelDirectories.directoryFor(sessionId).store,
      }),
    }, OpenAICodexQuotaIndicator))
  })
}
