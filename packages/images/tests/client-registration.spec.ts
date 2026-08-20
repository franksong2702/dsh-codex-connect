import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('Codex Connect Images browser contribution', () => {
  it('registers one namespaced settings card and one keyed Tool view', async () => {
    const source = await readFile(new URL('../src/client/index.tsx', import.meta.url), 'utf8')
    expect(source).toContain("ctx.slots.inject('settings.plugin.item'")
    expect(source).toContain('key: IMAGES_SETTINGS_NAMESPACE')
    expect(source).toContain("ctx.slots.inject('tool.call.toolview'")
    expect(source).toContain("key: 'codex_connect_image_generate'")
    expect(source).not.toContain("conversation.input")
  })

  it('declares every RC7 browser service in the package manifest', async () => {
    const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as { dsh: { client: { inject: string[] } } }
    expect(manifest.dsh.client.inject).toEqual(expect.arrayContaining([
      '@deepseek-ai/dsh-client-runtime',
      '@deepseek-ai/dsh-client-locale',
      '@deepseek-ai/dsh-client-ui-settings',
      '@deepseek-ai/dsh-client-ui-settings-plugins',
      '@deepseek-ai/dsh-client-ui-tool',
      '@deepseek-ai/dsh-client-ui-attachment',
    ]))
  })
})
