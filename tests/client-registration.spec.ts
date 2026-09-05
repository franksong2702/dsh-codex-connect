import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('OpenAI Codex browser contribution', () => {
  it('adds an optional Models footer using the same account owner as Plugins', async () => {
    const client = await readFile(new URL('../src/client/index.tsx', import.meta.url), 'utf8')
    expect(client).toContain("ctx.slots.inject('settings.models.footer'")
    expect(client).toContain("id: 'dsh-codex-connect-account'")
    expect(client).toContain('({ t, configScope, updater, account })')
    expect(client).toContain('inject: () => ({ t, account, configScope })')
    expect(client).toContain('account.dispose()')
    expect(client.match(/new OpenAICodexAccountStore\(\)/g)).toHaveLength(1)
    expect(client).not.toContain("ctx.slots.inject('settings.models.provider-card'")
  })
  it('registers as a Plugin configuration card instead of adding a tab or section', async () => {
    const client = await readFile(new URL('../src/client/index.tsx', import.meta.url), 'utf8')
    expect(client).toContain("ctx.slots.inject('settings.plugin.item'")
    expect(client).toContain("name: 'settings.plugin.item'")
    expect(client).toContain('key: OPENAI_CODEX_SETTINGS_NAMESPACE')
    expect(client).not.toContain("id: 'openai-codex'")
    expect(client).not.toContain('order: 30')
    expect(client).toContain('ctx.settingsScope.bind')
    expect(client).toContain('OPENAI_CODEX_SETTINGS_NAMESPACE')
    expect(client).not.toContain("namespace: 'web'")
    expect(client).not.toContain("ctx.slots.inject('settings.plugins.tab'")
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

  it('renders a Codex Connect card and uses OpenAI Codex for the Composer provider', async () => {
    const [clientCard, locales, adapter] = await Promise.all([
      readFile(new URL('../src/client/OpenAICodexPluginCard.tsx', import.meta.url), 'utf8'),
      readFile(new URL('../src/client/locales.ts', import.meta.url), 'utf8'),
      readFile(new URL('../src/adapter.ts', import.meta.url), 'utf8'),
    ])
    expect(clientCard).toContain('<li style={{ ...cardStyle, background:')
    expect(clientCard).toContain('aria-expanded={open}')
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
    const parsed = JSON.parse(manifest) as { dsh: { client: { inject: string[] } } }
    expect(parsed.dsh.client.inject).not.toContain('@deepseek-ai/dsh-client-ui-slots')
    expect(parsed.dsh.client.inject).not.toContain('@deepseek-ai/dsh-client-ui-attachment')
  })
})
