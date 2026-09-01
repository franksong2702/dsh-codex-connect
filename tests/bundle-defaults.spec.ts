import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('bundle defaults', () => {
  it('installs only its plugin row and leaves Harness routing unchanged', async () => {
    const patch = await readFile(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
    expect(patch).toContain('name: dsh-codex-connect')
    expect(patch).toContain('enableProxy: false')
    expect(patch).toContain('enableSearch: false')
    expect(patch).toContain('enableImageTool: false')
    expect(patch).toContain('enableImageGeneration: false')
    expect(patch).toContain('enableAutoReview: false')
    expect(patch).not.toMatch(/^- id: agent-default-model/mu)
    expect(patch).not.toMatch(/searchProvider:\s*openai-codex/u)
  })
})
