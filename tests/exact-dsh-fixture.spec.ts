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
    const pins = Object.fromEntries(Object.keys(dependencies).map(name => [name, version]))
    expect(result).toEqual({ overrides: pins, dependencies: pins })
    expect(new Set(seen).size).toBe(seen.length)
  })

  it('pins peer-only packages directly in the temporary host without sharing mutable maps', () => {
    const pins = { '@deepseek-ai/dsh': '0.1.5-alpha.1', '@deepseek-ai/dsh-llm': '0.1.5-alpha.1' }
    const manifest = exactDshFixtureManifest({ overrides: pins, dependencies: pins })
    expect(manifest).toEqual({ private: true, dependencies: pins, overrides: pins })
    expect(manifest.dependencies).not.toBe(pins)
    expect(manifest.overrides).not.toBe(manifest.dependencies)
  })

  it('rejects mixed versions and unrelated dependency pins in the exact host fixture', () => {
    const dependencies = { '@deepseek-ai/dsh': '0.1.5-alpha.1' }
    expect(() => exactDshFixtureManifest({ dependencies, overrides: { ...dependencies, '@deepseek-ai/dsh-llm': '0.1.5-rc.2' } })).toThrow('consistent')
    expect(() => exactDshFixtureManifest({ dependencies, overrides: { ...dependencies, unrelated: '0.1.5-alpha.1' } })).toThrow('DSH-only')
    expect(() => exactDshFixtureManifest(dependencies)).toThrow('classifications')
    expect(() => exactDshFixtureManifest({ dependencies: {}, overrides: dependencies })).toThrow('subset')
    expect(() => exactDshFixtureManifest({ dependencies: { ...dependencies, '@deepseek-ai/dsh-unknown': '0.1.5-alpha.1' }, overrides: dependencies })).toThrow('subset')
  })

  it('keeps platform-optional subtrees pinned without promoting them to direct roots', async () => {
    const version = '0.2.2-alpha.2'
    const graph: Record<string, object> = {
      '@deepseek-ai/dsh': { dependencies: { '@deepseek-ai/dsh-cua-bundle': version } },
      '@deepseek-ai/dsh-cua-bundle': { optionalDependencies: { '@deepseek-ai/dsh-experimental-cua-macos': version } },
      '@deepseek-ai/dsh-experimental-cua-macos': { os: ['darwin'], dependencies: { '@deepseek-ai/dsh-native-helper': '^0.2.2-alpha.1' }, peerDependencies: { '@deepseek-ai/dsh-native-peer': '*' } },
      '@deepseek-ai/dsh-native-helper': {}, '@deepseek-ai/dsh-native-peer': {},
    }
    const resolution = await resolveExactDshOverrides(version, async (name: string) => ({ name, version, ...graph[name] }))
    const manifest = exactDshFixtureManifest(resolution)
    expect(manifest.dependencies).toEqual({ '@deepseek-ai/dsh': version, '@deepseek-ai/dsh-cua-bundle': version })
    expect(manifest.overrides).toEqual(Object.fromEntries(Object.keys(graph).map(name => [name, version])))
    expect(manifest).not.toHaveProperty('optionalDependencies')
  })

  it.each([false, true])('required paths upgrade earlier optional packages and descendants regardless of discovery order (%s)', async optionalFirst => {
    const version = '0.2.2-alpha.2', seen: string[] = []
    const graph: Record<string, object> = {
      '@deepseek-ai/dsh': { dependencies: optionalFirst
        ? { '@deepseek-ai/dsh-optional-route': version, '@deepseek-ai/dsh-route': version }
        : { '@deepseek-ai/dsh-route': version, '@deepseek-ai/dsh-optional-route': version }, optionalDependencies: { '@deepseek-ai/dsh-optional-only': version } },
      '@deepseek-ai/dsh-optional-route': { optionalDependencies: { '@deepseek-ai/dsh-shared': version } },
      '@deepseek-ai/dsh-route': { dependencies: { '@deepseek-ai/dsh-route-deep': version } },
      '@deepseek-ai/dsh-route-deep': { peerDependencies: { '@deepseek-ai/dsh-shared': version } },
      '@deepseek-ai/dsh-shared': { dependencies: { '@deepseek-ai/dsh-child': version }, optionalDependencies: { '@deepseek-ai/dsh-optional-only': version } },
      '@deepseek-ai/dsh-child': { dependencies: { '@deepseek-ai/dsh-shared': version } },
      '@deepseek-ai/dsh-optional-only': {},
    }
    const resolution = await resolveExactDshOverrides(version, async (name: string) => { seen.push(name); return { name, version, ...graph[name] } })
    expect(resolution.dependencies).toEqual(Object.fromEntries(Object.keys(graph).filter(name => name !== '@deepseek-ai/dsh-optional-only').map(name => [name, version])))
    expect(resolution.overrides['@deepseek-ai/dsh-optional-only']).toBe(version)
    expect(seen.indexOf('@deepseek-ai/dsh-shared') < seen.indexOf('@deepseek-ai/dsh-route-deep')).toBe(optionalFirst)
    expect(new Set(seen).size).toBe(seen.length)
  })

  it('leaves optional peers uninstalled while pinning them, and honors optional dependency precedence', async () => {
    const version = '0.2.2-alpha.2'
    const graph: Record<string, object> = {
      '@deepseek-ai/dsh': { dependencies: { '@deepseek-ai/dsh-optional': version },
        peerDependencies: { '@deepseek-ai/dsh-optional': version, '@deepseek-ai/dsh-peer-optional': '*', '@deepseek-ai/dsh-peer-required': '*' },
        peerDependenciesMeta: { '@deepseek-ai/dsh-peer-optional': { optional: true } },
        optionalDependencies: { '@deepseek-ai/dsh-optional': version } },
      '@deepseek-ai/dsh-optional': {},
      '@deepseek-ai/dsh-peer-optional': { dependencies: { '@deepseek-ai/dsh-peer-child': '*' } },
      '@deepseek-ai/dsh-peer-child': {}, '@deepseek-ai/dsh-peer-required': {},
    }
    const manifest = exactDshFixtureManifest(await resolveExactDshOverrides(version, async (name: string) => ({ name, version, ...graph[name] })))
    expect(manifest.dependencies).toEqual({ '@deepseek-ai/dsh': version, '@deepseek-ai/dsh-peer-required': version })
    expect(Object.keys(manifest.overrides)).toHaveLength(5)
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

    const bodyTimeout = () => new Response(new ReadableStream({ start(controller) {
      controller.error(new DOMException('Body deadline expired', 'TimeoutError'))
    } }), { status: 200 })

    it('retries body timeouts after successful headers within the same three-attempt budget', async () => {
      const run = await read([bodyTimeout, bodyTimeout, ok])
      await expect(run.result).resolves.toEqual(manifest)
      expect(run.calls()).toBe(3)
      expect(run.delays).toEqual([1_000, 2_000])
    })

    it('keeps exhausted body deadlines as failures and never starts a fourth attempt', async () => {
      const run = await read([bodyTimeout, bodyTimeout, bodyTimeout, ok])
      await expect(run.result).rejects.toThrow(/after 3 attempts: Body deadline expired/u)
      expect(run.calls()).toBe(3)
    })

    it('does not retry invalid JSON as a transport failure', async () => {
      const run = await read([() => new Response('{invalid', { status: 200 }), ok])
      await expect(run.result).rejects.toBeInstanceOf(SyntaxError)
      expect(run.calls()).toBe(1)
      expect(run.delays).toEqual([])
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
