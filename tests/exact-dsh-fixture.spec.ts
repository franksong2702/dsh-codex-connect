import { describe, expect, it } from 'vitest'
// The install checker is plain Node tooling, outside the TypeScript source build.
// @ts-expect-error JavaScript helper has no declaration file.
import { exactDshFixtureManifest, readDshRegistryManifest, resolveExactDshOverrides } from '../scripts/exact-dsh-fixture.mjs'

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

  it('pins peer-only packages directly in the temporary host without sharing mutable maps', () => {
    const pins = { '@deepseek-ai/dsh': '0.1.5-alpha.1', '@deepseek-ai/dsh-llm': '0.1.5-alpha.1' }
    const manifest = exactDshFixtureManifest(pins)
    expect(manifest).toEqual({ private: true, dependencies: pins, overrides: pins })
    expect(manifest.dependencies).not.toBe(pins)
    expect(manifest.overrides).not.toBe(manifest.dependencies)
  })

  it('rejects mixed versions and unrelated dependency pins in the exact host fixture', () => {
    expect(() => exactDshFixtureManifest({ '@deepseek-ai/dsh': '0.1.5-alpha.1', '@deepseek-ai/dsh-llm': '0.1.5-rc.2' })).toThrow('consistent')
    expect(() => exactDshFixtureManifest({ '@deepseek-ai/dsh': '0.1.5-alpha.1', unrelated: '0.1.5-alpha.1' })).toThrow('DSH-only')
  })

  it('rejects a newer manifest instead of silently testing the wrong host', async () => {
    await expect(resolveExactDshOverrides('0.1.5-alpha.1', async (name: string) => ({ name, version: '0.1.5-rc.1' }))).rejects.toThrow('exact')
  })

  describe('registry reader', () => {
    const manifest = { name: '@deepseek-ai/dsh', version: '0.2.1-rc.1' }
    const ok = () => new Response(JSON.stringify(manifest), { status: 200 })
    const status = (code: number) => () => new Response('', { status: code })
    const timeout = () => { throw new DOMException('The operation was aborted due to timeout', 'TimeoutError') }
    const read = async (responses: Array<() => Response>) => {
      const delays: number[] = []
      let calls = 0
      const result = readDshRegistryManifest(manifest.name, manifest.version, {
        fetchImpl: async () => responses[calls++]!(),
        sleep: async (ms: number) => { delays.push(ms) },
      })
      return { result, delays, calls: () => calls }
    }

    it('retries timeouts and transient statuses with backoff before succeeding', async () => {
      const run = await read([timeout, status(503), ok])
      await expect(run.result).resolves.toEqual(manifest)
      expect(run.calls()).toBe(3)
      expect(run.delays).toEqual([1_000, 2_000])
    })

    it('fails at once on a non-transient status', async () => {
      const run = await read([status(404), ok])
      await expect(run.result).rejects.toThrow('HTTP 404')
      expect(run.calls()).toBe(1)
      expect(run.delays).toEqual([])
    })

    it('gives up after three attempts and keeps the last cause', async () => {
      const run = await read([timeout, status(429), timeout])
      await expect(run.result).rejects.toThrow(/after 3 attempts: The operation was aborted due to timeout/u)
      expect(run.calls()).toBe(3)
    })
  })
})
