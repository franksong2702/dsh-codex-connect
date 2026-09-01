/** Browser half: OpenAI Codex account management inside Plugin configuration. */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings-models/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-tool/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
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
import { OpenAICodexFastModeToggle } from './OpenAICodexFastModeToggle.tsx'
import type { OpenAICodexFastModeToggleInjected } from './OpenAICodexFastModeToggle.tsx'
import { en, zh } from './locales.ts'
import type { OpenAICodexSettingsKey } from './locales.ts'
import { CodexImageToolView } from './CodexImageToolView.tsx'
import type { CodexImageToolViewInjected } from './CodexImageToolView.tsx'
import { OpenAICodexUpdateOverlay } from './OpenAICodexUpdateNotice.tsx'
import { OpenAICodexUpdateStore } from './update-store.ts'
import { CODEX_CONNECT_VERSION } from '../version.ts'
import { OpenAICodexAccountStore } from './account-store.ts'
import { OpenAICodexModelsCard } from './OpenAICodexModelsCard.tsx'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** OpenAI Codex account page copy. */
    'settings.openai-codex': OpenAICodexSettingsKey
  }
}

/** Stable browser-plugin name. */
export const name = 'dsh-codex-connect-client'
/** Client services required by the Plugin configuration contribution. */
export const inject = ['slots', 'locale', 'connection', 'remote', 'remote.session', 'settingsScope', 'sessions']

/** Register account copy and the OpenAI Codex card under Plugin configuration. */
export function apply(ctx: ClientContext): void {
  const namespace = 'settings.openai-codex'
  const updater = new OpenAICodexUpdateStore(CODEX_CONNECT_VERSION)
  const account = new OpenAICodexAccountStore()
  ctx.effect(() => () => { account.dispose() }, 'dsh-codex-connect: account observation')
  ctx.effect(() => {
    void updater.refresh()
    return () => { updater.dispose() }
  }, 'dsh-codex-connect: update checker')
  ctx.effect(() => ctx.locale.register(namespace, { zh, en }), 'dsh-codex-connect: settings copy')
  const t = ctx.locale.bind(namespace) as OpenAICodexPluginCardInjected['t']
  const configScope = ctx.settingsScope.bind({
    namespace: OPENAI_CODEX_SETTINGS_NAMESPACE,
    decode: decodeOpenAICodexSettings,
  })
  ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
    name: 'settings.plugin.item',
    key: OPENAI_CODEX_SETTINGS_NAMESPACE,
    inject: (): OpenAICodexPluginCardInjected => ({ t, configScope, updater, account }),
  }, OpenAICodexPluginCard))

  ctx.slots.inject('settings.models.footer', () => ctx.slots.register({
    name: 'settings.models.footer',
    id: 'dsh-codex-connect-account',
    order: 100,
    inject: () => ({ t, account, configScope }),
  }, OpenAICodexModelsCard))

  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'dsh-codex-connect-update',
    order: 40,
    locale: namespace,
    inject: (): { updater: OpenAICodexUpdateStore } => ({ updater }),
  }, OpenAICodexUpdateOverlay))

  ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({
    name: 'tool.call.toolview',
    key: 'codex_connect_image_generate',
    locale: namespace,
    inject: (): CodexImageToolViewInjected => ({ sessions: ctx.sessions }),
  }, CodexImageToolView))

  ctx.inject(['slots', 'modelDirectories'], (scope: ClientContext) => {
    scope.slots.inject('conversation.input.right', () => scope.slots.register({
      name: 'conversation.input.right',
      id: 'openai-codex-fast-mode',
      order: 10,
      locale: namespace,
      inject: (sessionId): OpenAICodexFastModeToggleInjected => ({
        directory: scope.modelDirectories.directoryFor(sessionId).store,
      }),
    }, OpenAICodexFastModeToggle))
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
