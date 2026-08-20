/** Browser entrypoint for the optional settings and image Tool result surfaces. */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-tool/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import { CodexImagesPluginCard } from './CodexImagesPluginCard.tsx'
import type { CodexImagesPluginCardInjected } from './CodexImagesPluginCard.tsx'
import { CodexImageToolView } from './CodexImageToolView.tsx'
import type { CodexImageToolViewInjected } from './CodexImageToolView.tsx'
import { en, zh } from './locales.ts'
import type { ImagesLocaleKey } from './locales.ts'
import { decodeImagesSettings, IMAGES_SETTINGS_NAMESPACE } from './settings-contract.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'settings.codex-connect-images': ImagesLocaleKey
  }
}

export const name = 'dsh-codex-connect-images-client'
export const inject = ['slots', 'locale', 'settingsScope', 'sessions']

export function apply(ctx: ClientContext): void {
  const localeNamespace = 'settings.codex-connect-images'
  ctx.effect(() => ctx.locale.register(localeNamespace, { zh, en }), 'dsh-codex-connect-images: browser copy')
  const t = ctx.locale.bind(localeNamespace) as CodexImagesPluginCardInjected['t']
  const settings = ctx.settingsScope.bind({ namespace: IMAGES_SETTINGS_NAMESPACE, decode: decodeImagesSettings })
  ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
    name: 'settings.plugin.item',
    key: IMAGES_SETTINGS_NAMESPACE,
    locale: localeNamespace,
    inject: (): CodexImagesPluginCardInjected => ({ t, settings }),
  }, CodexImagesPluginCard))
  ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({
    name: 'tool.call.toolview',
    key: 'codex_connect_image_generate',
    locale: localeNamespace,
    inject: (): CodexImageToolViewInjected => ({ sessions: ctx.sessions }),
  }, CodexImageToolView))
}
