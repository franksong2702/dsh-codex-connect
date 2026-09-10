import { describe, expect, it } from 'vitest'
// The install checker is plain Node tooling, outside the TypeScript source build.
// @ts-expect-error JavaScript helper has no declaration file.
import { resolveExactDshOverrides } from '../scripts/exact-dsh-fixture.mjs'

describe('exact DSH install fixture', () => {
  it('pins transitive and peer DSH packages despite floating ranges, without pinning third parties', async () => {
    const seen: string[] = []
    const version = '0.1.5-alpha.1'
    const dependencies: Record<string, object> = {
      '@deepseek-ai/dsh': { dependencies: { '@deepseek-ai/dsh-base': '^0.1.5-alpha.1', undici: '^8.0.0' } },
      '@deepseek-ai/dsh-base': { dependencies: { '@deepseek-ai/dsh-llm-pi-ai': '^0.1.5-alpha.1' }, peerDependencies: { '@deepseek-ai/dsh-llm': '^0.1.5-alpha.1' } },
      '@deepseek-ai/dsh-llm-pi-ai': { peerDependencies: { '@deepseek-ai/dsh-llm': '^0.1.5-alpha.1' } },
      '@deepseek-ai/dsh-llm': { dependencies: { '@deepseek-ai/dsh-base': '^0.1.5-alpha.1' } },
    }
    const result = await resolveExactDshOverrides(version, async (name: string, requested: string) => {
      expect(requested).toBe(version)
      seen.push(name)
      return { name, version, ...dependencies[name] }
    })
    expect(result).toEqual(Object.fromEntries(Object.keys(dependencies).map(name => [name, version])))
    expect(new Set(seen).size).toBe(seen.length)
  })

  it('rejects a newer manifest instead of silently testing the wrong host', async () => {
    await expect(resolveExactDshOverrides('0.1.5-alpha.1', async (name: string) => ({ name, version: '0.1.5-rc.1' }))).rejects.toThrow('exact')
  })
})
