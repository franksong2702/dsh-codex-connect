import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('OpenAI Codex browser contribution', () => {
  it('adds an optional Models footer using the same account owner as Plugins', async () => {
    const client = await readFile(new URL('../src/client/index.tsx', import.meta.url), 'utf8')
    expect(client).toContain("ctx.slots.inject('settings.models.footer'")
    expect(client).toContain("id: 'dsh-codex-connect-account'")
    expect(client).toContain('({ t, configScope, updater, account })')
    expect(client).toContain('inject: () => ({ t, account, configScope })')
    expect(client).toContain('const configScope = new OpenAICodexConfigForm(')
    expect(client).toContain('account.dispose()')
    expect(client.match(/new OpenAICodexAccountStore\(\)/g)).toHaveLength(1)
    expect(client).not.toContain("ctx.slots.inject('settings.models.provider-card'")
  })
  it('registers a Plugin settings tab only while the Host serves Codex Connect settings', async () => {
    const client = await readFile(new URL('../src/client/index.tsx', import.meta.url), 'utf8')
    expect(client).toContain('ctx.configForms.whileServed([OPENAI_CODEX_SETTINGS_NAMESPACE]')
    expect(client).toContain("name: 'settings.plugins.tab'")
    expect(client).toContain("id: 'codex-connect'")
    expect(client).toContain("ctx.configForms.get<OpenAICodexSettingsConfig>(OPENAI_CODEX_SETTINGS_NAMESPACE)")
    expect(client).toContain('OPENAI_CODEX_SETTINGS_NAMESPACE')
    expect(client).not.toContain("namespace: 'web'")
    expect(client).not.toContain("settings.plugin.item")
    expect(client).not.toContain("ctx.slots.inject('settings.section'")
  })

  it('registers the weekly quota in the additive right-side Composer list slot', async () => {
    const client = await readFile(new URL('../src/client/index.tsx', import.meta.url), 'utf8')
    expect(client).toContain("scope.slots.inject('conversation.input.right'")
    expect(client).toContain("name: 'conversation.input.right'")
    expect(client).toContain("id: 'openai-codex-quota'")
    expect(client).toContain('order: 20')
    expect(client).toContain("ctx.inject(['slots', 'modelDirectories']")
    expect(client).toContain('scope.modelDirectories.directoryFor(sessionId)')
    expect(client).not.toContain("'settingsScope', 'modelDirectories'")
    expect(client).toContain("'@deepseek-ai/dsh-client-ui-conversation/client'")
    expect(client).toContain("'@deepseek-ai/dsh-client-ui-model-selection/client'")
  })

  it('registers Fast Mode before quota in the same additive Composer slot', async () => {
    const client = await readFile(new URL('../src/client/index.tsx', import.meta.url), 'utf8')
    expect(client).toContain("id: 'openai-codex-fast-mode'")
    expect(client).toContain('order: 10')
    expect(client).toContain("id: 'openai-codex-quota'")
    expect(client).toContain('order: 20')
    expect(client.indexOf("id: 'openai-codex-fast-mode'")).toBeLessThan(client.indexOf("id: 'openai-codex-quota'"))
  })

  it('registers the version reminder in DSH’s frame-wide shell overlay', async () => {
    const [client, manifest] = await Promise.all([
      readFile(new URL('../src/client/index.tsx', import.meta.url), 'utf8'),
      readFile(new URL('../package.json', import.meta.url), 'utf8'),
    ])
    expect(client).toContain("ctx.slots.inject('shell.overlay'")
    expect(client).toContain("id: 'dsh-codex-connect-update'")
    expect(client).toContain("'@deepseek-ai/dsh-client-ui-layout/client'")
    const parsed = JSON.parse(manifest) as { dsh: { client: { inject: string[] } } }
    expect(parsed.dsh.client.inject).toContain('@deepseek-ai/dsh-client-ui-layout')
  })

  it('renders the dedicated Codex Connect settings tab and uses OpenAI Codex for the Composer provider', async () => {
    const [clientCard, settings, locales, adapter] = await Promise.all([
      readFile(new URL('../src/client/OpenAICodexPluginCard.tsx', import.meta.url), 'utf8'),
      readFile(new URL('../src/client/OpenAICodexSettings.tsx', import.meta.url), 'utf8'),
      readFile(new URL('../src/client/locales.ts', import.meta.url), 'utf8'),
      readFile(new URL('../src/adapter.ts', import.meta.url), 'utf8'),
    ])
    expect(clientCard).toContain('<OpenAICodexSettings')
    expect(settings).toContain('aria-expanded={expanded}')
    expect(locales.match(/title: 'Codex Connect'/gu)).toHaveLength(2)
    expect(adapter).toContain("displayName: 'OpenAI Codex'")
  })

  it('registers the image-generation result view independently of the generation toggle', async () => {
    const [client, manifest] = await Promise.all([
      readFile(new URL('../src/client/index.tsx', import.meta.url), 'utf8'),
      readFile(new URL('../package.json', import.meta.url), 'utf8'),
    ])
    expect(client).toContain("ctx.slots.inject('tool.call.toolview'")
    expect(client).toContain("key: 'codex_connect_image_generate'")
    expect(client).toContain("ctx.slots.inject('conversation.chat.turnTail'")
    expect(client).toContain("id: 'codex-connect-generated-images'")
    const parsed = JSON.parse(manifest) as { dsh: { client: { inject: string[] } } }
    expect(parsed.dsh.client.inject).toContain('@deepseek-ai/dsh-client-ui-chat')
    expect(parsed.dsh.client.inject).not.toContain('@deepseek-ai/dsh-client-ui-slots')
    expect(parsed.dsh.client.inject).not.toContain('@deepseek-ai/dsh-client-ui-attachment')
  })
})
