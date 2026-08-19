import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { apply, Config, IMAGE_GENERATE_TOOL_NAME, name } from '../src/index.ts'

describe('Codex Connect Images PR-1 skeleton', () => {
  it('keeps stable package contracts and an enabled-by-install default', () => {
    expect(name).toBe('llm-openai-codex-images')
    expect(IMAGE_GENERATE_TOOL_NAME).toBe('codex_connect_image_generate')
    expect(Config({})).toEqual({ enabled: true })
  })

  it('registers nothing before the transport and tool PRs', () => {
    const context = new Proxy({}, {
      get() {
        throw new Error('PR-1 apply must not access the Cordis context')
      },
    })
    expect(() => apply(context as never, Config({}))).not.toThrow()
  })

  it('contains no network route or tool registration in Host or browser source', async () => {
    const source = await Promise.all([
      readFile(new URL('../src/index.ts', import.meta.url), 'utf8'),
      readFile(new URL('../src/client/index.tsx', import.meta.url), 'utf8'),
    ]).then(parts => parts.join('\n'))
    expect(source).not.toMatch(/\bfetch\s*\(|https?:\/\/|node:https|undici|chatgpt\.com/u)
    expect(source).not.toMatch(/openaiCodexTransport|registerTool|ctx\.tools|ImageGallery|ImageLightbox/u)
  })

  it('installs only its own config row with images enabled', async () => {
    const patch = await readFile(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
    expect(patch).toContain('id: llm-openai-codex-images')
    expect(patch).toContain('name: dsh-codex-connect-images')
    expect(patch).toContain('enabled: true')
    expect(patch).not.toContain('llm-openai-codex\n')
    expect(patch).not.toMatch(/^- id: agent-default-model/mu)
  })
})
