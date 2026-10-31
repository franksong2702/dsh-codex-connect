import { describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import {
  detectCompatibility,
  evaluateCompatibility,
  SUPPORTED_DSH_PLUGIN_API_VERSION,
  SUPPORTED_DSH_PLUGIN_API_RANGE,
  COMPATIBILITY_CONTRACT,
  SUPPORTED_NODE_RANGE,
  SUPPORTED_PI_AI_RANGE,
} from '../src/compatibility.ts'

const compatiblePackages = {
  '@deepseek-ai/dsh-llm': SUPPORTED_DSH_PLUGIN_API_VERSION,
  '@deepseek-ai/dsh-llm-pi-ai': SUPPORTED_DSH_PLUGIN_API_VERSION,
  '@deepseek-ai/dsh-compaction': SUPPORTED_DSH_PLUGIN_API_VERSION,
  '@earendil-works/pi-ai': '0.85.1',
} as const

describe('compatibility contract', () => {
  it('evaluates the declared Node, DSH API, and pi-ai versions as compatible', () => {
    const report = evaluateCompatibility({ nodeVersion: 'v22.19.0', packageVersions: compatiblePackages })
    expect(report).toEqual({
      schemaVersion: 1,
      status: 'compatible',
      node: { supported: SUPPORTED_NODE_RANGE, installed: 'v22.19.0', status: 'compatible' },
      packages: {
        '@deepseek-ai/dsh-llm': { supported: SUPPORTED_DSH_PLUGIN_API_RANGE, installed: SUPPORTED_DSH_PLUGIN_API_VERSION, status: 'compatible' },
        '@deepseek-ai/dsh-llm-pi-ai': { supported: SUPPORTED_DSH_PLUGIN_API_RANGE, installed: SUPPORTED_DSH_PLUGIN_API_VERSION, status: 'compatible' },
        '@deepseek-ai/dsh-compaction': { supported: SUPPORTED_DSH_PLUGIN_API_RANGE, installed: SUPPORTED_DSH_PLUGIN_API_VERSION, status: 'compatible' },
        '@earendil-works/pi-ai': { supported: SUPPORTED_PI_AI_RANGE, installed: '0.85.1', status: 'compatible' },
      },
    })
  })

  it('checks every mandatory DSH peer and does not require an absent optional command service', async () => {
    const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as {
      peerDependencies: Record<string, string>; peerDependenciesMeta: Record<string, { optional?: boolean }>
    }
    const mandatory = Object.keys(pkg.peerDependencies).filter(name => name.startsWith('@deepseek-ai/dsh-')
      && pkg.peerDependenciesMeta[name]?.optional !== true).sort()
    expect([...COMPATIBILITY_CONTRACT.dshPluginApi.packages].sort()).toEqual(mandatory)
    expect(COMPATIBILITY_CONTRACT.dshPluginApi.packages).not.toContain('@deepseek-ai/dsh-commands')
    for (const [name, range] of Object.entries(pkg.peerDependencies)) {
      if (name.startsWith('@deepseek-ai/dsh-')) expect(range).toBe(SUPPORTED_DSH_PLUGIN_API_RANGE)
    }
  })

  it('retains the legacy invariant export without requiring its retired host package', async () => {
    const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as {
      peerDependencies: Record<string, string>; devDependencies: Record<string, string>; exports: Record<string, unknown>
    }
    expect(pkg.peerDependencies).not.toHaveProperty('@deepseek-ai/dsh-invariants')
    expect(pkg.devDependencies['@deepseek-ai/dsh-invariants']).toBe('0.1.7-rc.1')
    expect(pkg.exports['./invariant']).toBeDefined()
    expect(COMPATIBILITY_CONTRACT.dshPluginApi.packages).not.toContain('@deepseek-ai/dsh-invariants')
  })

  it('keeps the packaged compatibility metadata identical to the runtime declaration', async () => {
    expect(JSON.parse(await readFile(new URL('../compatibility.json', import.meta.url), 'utf8'))).toEqual(COMPATIBILITY_CONTRACT)
  })

  it('accepts the exact declared host pair without inferring support for older or future versions', () => {
    expect(evaluateCompatibility({ nodeVersion: 'v24.15.0', packageVersions: compatiblePackages }).status).toBe('compatible')
    for (const packages of [
      { ...compatiblePackages, '@deepseek-ai/dsh-llm': '0.1.5-rc.2', '@deepseek-ai/dsh-llm-pi-ai': '0.1.5-rc.2', '@deepseek-ai/dsh-compaction': '0.1.5-rc.2' },
      { ...compatiblePackages, '@deepseek-ai/dsh-llm-pi-ai': '0.1.7-alpha.1', '@deepseek-ai/dsh-compaction': '0.1.7-alpha.1' },
      { ...compatiblePackages, '@deepseek-ai/dsh-compaction': '0.1.7-alpha.1' },
      { ...compatiblePackages, '@earendil-works/pi-ai': '0.85.2' },
      { ...compatiblePackages, '@earendil-works/pi-ai': '0.84.4' },
      { ...compatiblePackages, '@deepseek-ai/dsh-llm': '0.1.7-alpha.3', '@deepseek-ai/dsh-llm-pi-ai': '0.1.7-alpha.3', '@deepseek-ai/dsh-compaction': '0.1.7-alpha.3' },
    ]) expect(evaluateCompatibility({ nodeVersion: 'v24.15.0', packageVersions: packages }).status).toBe('unverified')
  })

  it.each(['0.1.7-rc.1', '0.1.7-rc.2', '0.2.0-rc.1', '0.2.0-rc.2', '0.2.1-alpha.1', '0.2.1-alpha.2', '0.2.1-alpha.3', '0.2.1-alpha.4', '0.2.1-alpha.5', '0.2.1-rc.1', '0.2.1-rc.2', '0.2.1-rc.3', '0.2.1-rc.4', '0.2.1-rc.5'])('accepts exact consistent %s and pi-ai 0.85.1', version => {
    const packages = { ...compatiblePackages, '@deepseek-ai/dsh-llm': version,
      '@deepseek-ai/dsh-llm-pi-ai': version, '@deepseek-ai/dsh-compaction': version }
    expect(evaluateCompatibility({ nodeVersion: 'v24.15.0', packageVersions: packages }).status).toBe('compatible')
  })

  it.each(['@deepseek-ai/dsh-llm', '@deepseek-ai/dsh-llm-pi-ai', '@deepseek-ai/dsh-compaction'] as const)(
    'does not accept mixed rc.1/rc.2 or missing %s metadata', name => {
      const rc2 = { ...compatiblePackages, '@deepseek-ai/dsh-llm': '0.1.7-rc.2',
        '@deepseek-ai/dsh-llm-pi-ai': '0.1.7-rc.2', '@deepseek-ai/dsh-compaction': '0.1.7-rc.2' }
      expect(evaluateCompatibility({ nodeVersion: 'v24.15.0', packageVersions: { ...rc2, [name]: '0.1.7-rc.1' } }).status).toBe('unverified')
      expect(evaluateCompatibility({ nodeVersion: 'v24.15.0', packageVersions: { ...rc2, [name]: undefined } }).status).toBe('unknown')
    },
  )

  it.each(['@deepseek-ai/dsh-llm', '@deepseek-ai/dsh-llm-pi-ai', '@deepseek-ai/dsh-compaction'] as const)(
    'does not accept mixed alpha.2/alpha.3 or missing %s metadata', name => {
      const alpha3 = { ...compatiblePackages, '@deepseek-ai/dsh-llm': '0.2.1-alpha.3',
        '@deepseek-ai/dsh-llm-pi-ai': '0.2.1-alpha.3', '@deepseek-ai/dsh-compaction': '0.2.1-alpha.3' }
      expect(evaluateCompatibility({ nodeVersion: 'v24.13.0', packageVersions: { ...alpha3, [name]: '0.2.1-alpha.2' } }).status).toBe('unverified')
      expect(evaluateCompatibility({ nodeVersion: 'v24.13.0', packageVersions: { ...alpha3, [name]: undefined } }).status).toBe('unknown')
    },
  )

  it('does not infer later prereleases, stable releases, or a new pi-ai pair from declared support', () => {
    for (const version of ['0.1.7-rc.3', '0.1.7-alpha.2', '0.2.0-rc.3', '0.2.0', '0.2.1-alpha.6', '0.2.1-rc.6', '0.2.1', '0.2.2-alpha.1']) {
      const packages = { ...compatiblePackages, '@deepseek-ai/dsh-llm': version,
        '@deepseek-ai/dsh-llm-pi-ai': version, '@deepseek-ai/dsh-compaction': version }
      expect(evaluateCompatibility({ nodeVersion: 'v24.15.0', packageVersions: packages }).status).toBe('unverified')
    }
    expect(evaluateCompatibility({ nodeVersion: 'v24.15.0', packageVersions: {
      '@deepseek-ai/dsh-llm': '0.1.7-rc.2', '@deepseek-ai/dsh-llm-pi-ai': '0.1.7-rc.2',
      '@deepseek-ai/dsh-compaction': '0.1.7-rc.2', '@earendil-works/pi-ai': '0.85.2',
    } }).status).toBe('unverified')
  })

  it.each(['@deepseek-ai/dsh-llm', '@deepseek-ai/dsh-llm-pi-ai', '@deepseek-ai/dsh-compaction'] as const)(
    'does not accept mixed alpha.3/alpha.4 or missing %s metadata', name => {
      const alpha4 = { ...compatiblePackages, '@deepseek-ai/dsh-llm': '0.2.1-alpha.4',
        '@deepseek-ai/dsh-llm-pi-ai': '0.2.1-alpha.4', '@deepseek-ai/dsh-compaction': '0.2.1-alpha.4' }
      expect(evaluateCompatibility({ nodeVersion: 'v24.15.0', packageVersions: { ...alpha4, [name]: '0.2.1-alpha.3' } }).status).toBe('unverified')
      expect(evaluateCompatibility({ nodeVersion: 'v24.15.0', packageVersions: { ...alpha4, [name]: undefined } }).status).toBe('unknown')
    },
  )

  it.each(['0.2.1-alpha.5', '0.2.1-rc.1'])('rejects mixed or missing diagnostic peers for %s', version => {
    const names = ['@deepseek-ai/dsh-llm', '@deepseek-ai/dsh-llm-pi-ai', '@deepseek-ai/dsh-compaction'] as const
    const packages = { ...compatiblePackages, ...Object.fromEntries(names.map(name => [name, version])) }
    for (const name of names) {
      expect(evaluateCompatibility({ nodeVersion: 'v24.15.0', packageVersions: { ...packages, [name]: '0.2.1-alpha.4' } }).status).toBe('unverified')
      expect(evaluateCompatibility({ nodeVersion: 'v24.15.0', packageVersions: { ...packages, [name]: undefined } }).status).toBe('unknown')
    }
  })

  it('keeps rc.2 mixed or missing peers and later versions unverified', () => {
    const names = ['@deepseek-ai/dsh-llm', '@deepseek-ai/dsh-llm-pi-ai', '@deepseek-ai/dsh-compaction'] as const
    const packages = { ...compatiblePackages, ...Object.fromEntries(names.map(name => [name, '0.2.1-rc.2'])) }
    for (const name of names) {
      expect(evaluateCompatibility({ nodeVersion: 'v24.19.0', packageVersions: { ...packages, [name]: '0.2.1-rc.1' } }).status).toBe('unverified')
      expect(evaluateCompatibility({ nodeVersion: 'v24.19.0', packageVersions: { ...packages, [name]: undefined } }).status).toBe('unknown')
    }
    for (const version of ['0.2.1-rc.6', '0.2.1']) {
      expect(evaluateCompatibility({ nodeVersion: 'v24.19.0', packageVersions: {
        ...compatiblePackages, ...Object.fromEntries(names.map(name => [name, version])),
      } }).status).toBe('unverified')
    }
  })

  it.each(['v22.19.0', 'v24.15.0'])('admits exact rc.3 while preserving peer isolation on %s', nodeVersion => {
    const names = ['@deepseek-ai/dsh-llm', '@deepseek-ai/dsh-llm-pi-ai', '@deepseek-ai/dsh-compaction'] as const
    const packages = { ...compatiblePackages, ...Object.fromEntries(names.map(name => [name, '0.2.1-rc.3'])) }
    expect(evaluateCompatibility({ nodeVersion, packageVersions: packages }).status).toBe('compatible')
    for (const name of names) {
      expect(evaluateCompatibility({ nodeVersion, packageVersions: { ...packages, [name]: '0.2.1-rc.2' } }).status).toBe('unverified')
      expect(evaluateCompatibility({ nodeVersion, packageVersions: { ...packages, [name]: undefined } }).status).toBe('unknown')
    }
    expect(evaluateCompatibility({ nodeVersion, packageVersions: { ...packages, '@earendil-works/pi-ai': '0.85.2' } }).status).toBe('unverified')
  })

  it.each(['v22.19.0', 'v24.13.0'])('admits exact rc.4 while retaining rc.3 isolation and future-version refusal on %s', nodeVersion => {
    const names = ['@deepseek-ai/dsh-llm', '@deepseek-ai/dsh-llm-pi-ai', '@deepseek-ai/dsh-compaction'] as const
    const packages = { ...compatiblePackages, ...Object.fromEntries(names.map(name => [name, '0.2.1-rc.4'])) }
    expect(evaluateCompatibility({ nodeVersion, packageVersions: packages }).status).toBe('compatible')
    for (const name of names) {
      expect(evaluateCompatibility({ nodeVersion, packageVersions: { ...packages, [name]: '0.2.1-rc.3' } }).status).toBe('unverified')
      expect(evaluateCompatibility({ nodeVersion, packageVersions: { ...packages, [name]: undefined } }).status).toBe('unknown')
    }
    expect(evaluateCompatibility({ nodeVersion, packageVersions: { ...packages, '@earendil-works/pi-ai': '0.85.2' } }).status).toBe('unverified')
    for (const version of ['0.2.1-rc.6', '0.2.1']) {
      expect(evaluateCompatibility({ nodeVersion, packageVersions: {
        ...packages, ...Object.fromEntries(names.map(name => [name, version])),
      } }).status).toBe('unverified')
    }
  })

  it.each(['v22.19.0', 'v24.13.0'])('admits exact rc.5 while retaining rc.4 isolation and future-version refusal on %s', nodeVersion => {
    const names = ['@deepseek-ai/dsh-llm', '@deepseek-ai/dsh-llm-pi-ai', '@deepseek-ai/dsh-compaction'] as const
    const packages = { ...compatiblePackages, ...Object.fromEntries(names.map(name => [name, '0.2.1-rc.5'])) }
    expect(evaluateCompatibility({ nodeVersion, packageVersions: packages }).status).toBe('compatible')
    for (const name of names) {
      expect(evaluateCompatibility({ nodeVersion, packageVersions: { ...packages, [name]: '0.2.1-rc.4' } }).status).toBe('unverified')
      expect(evaluateCompatibility({ nodeVersion, packageVersions: { ...packages, [name]: undefined } }).status).toBe('unknown')
    }
    expect(evaluateCompatibility({ nodeVersion, packageVersions: { ...packages, '@earendil-works/pi-ai': '0.85.2' } }).status).toBe('unverified')
    for (const version of ['0.2.1-rc.6', '0.2.1']) {
      expect(evaluateCompatibility({ nodeVersion, packageVersions: {
        ...packages, ...Object.fromEntries(names.map(name => [name, version])),
      } }).status).toBe('unverified')
    }
  })

  it('marks a declared package mismatch unverified rather than incompatible', () => {
    const report = evaluateCompatibility({
      nodeVersion: 'v24.0.0',
      packageVersions: { ...compatiblePackages, '@earendil-works/pi-ai': '0.82.2' },
    })
    expect(report.status).toBe('unverified')
    expect(report.packages['@earendil-works/pi-ai']).toMatchObject({ installed: '0.82.2', status: 'unverified' })
  })

  it('requires the pi-ai version paired with the declared DSH API', () => {
    expect(evaluateCompatibility({ nodeVersion: 'v24.0.0', packageVersions: compatiblePackages }).status).toBe('compatible')
    expect(evaluateCompatibility({
      nodeVersion: 'v24.0.0',
      packageVersions: { ...compatiblePackages, '@earendil-works/pi-ai': '0.85.0' },
    }).status).toBe('unverified')
    expect(evaluateCompatibility({
      nodeVersion: 'v24.0.0',
      packageVersions: { ...compatiblePackages, '@earendil-works/pi-ai': '0.84.5-beta.1' },
    }).status).toBe('unverified')
  })

  it('keeps missing metadata unknown rather than claiming compatibility', () => {
    const report = evaluateCompatibility({ nodeVersion: 'not-a-node-version', packageVersions: {} })
    expect(report.status).toBe('unknown')
    expect(report.node.status).toBe('unknown')
    expect(report.packages['@deepseek-ai/dsh-llm'].installed).toBeNull()
  })

  it('keeps a newer DSH unverified and prioritizes missing metadata or a known engine mismatch', () => {
    const packageVersions = { ...compatiblePackages, '@deepseek-ai/dsh-llm': '0.1.3-alpha.1', '@deepseek-ai/dsh-llm-pi-ai': '0.1.3-alpha.1' }
    expect(evaluateCompatibility({ nodeVersion: 'v24.18.0', packageVersions }).status).toBe('unverified')
    expect(evaluateCompatibility({ nodeVersion: 'unknown', packageVersions }).status).toBe('unknown')
    expect(evaluateCompatibility({ nodeVersion: 'v20.0.0', packageVersions }).status).toBe('incompatible')
  })

  it('supports injected package metadata without reading paths or credentials', async () => {
    const report = await detectCompatibility({
      nodeVersion: 'v24.0.1',
      readPackageVersion: async name => compatiblePackages[name],
    })
    expect(report.status).toBe('compatible')
    expect(JSON.stringify(report)).not.toMatch(/node_modules|Users|token|credential/iu)
  })

  it('does not certify a coherent peer triple against a different selected DSH root', async () => {
    const root = await mkdtemp(join(tmpdir(), 'codex-connect-root-mismatch-'))
    const modules = join(root, 'host', 'node_modules')
    const anchor = join(modules, '@deepseek-ai/dsh', 'package.json')
    try {
      for (const name of ['@deepseek-ai/dsh', '@deepseek-ai/dsh-llm', '@deepseek-ai/dsh-llm-pi-ai', '@deepseek-ai/dsh-compaction']) {
        const manifest = join(modules, name, 'package.json')
        await mkdir(dirname(manifest), { recursive: true })
        await writeFile(manifest, JSON.stringify({ name, version: name === '@deepseek-ai/dsh' ? '0.2.0-rc.2' : SUPPORTED_DSH_PLUGIN_API_VERSION }))
      }
      expect((await detectCompatibility({ nodeVersion: 'v24.21.0', installAnchor: anchor })).status).toBe('unverified')
      expect((await detectCompatibility({ nodeVersion: 'v20.0.0', installAnchor: anchor })).status).toBe('incompatible')
      expect((await detectCompatibility({ nodeVersion: 'not-a-node-version', installAnchor: anchor })).status).toBe('unknown')
      expect(evaluateCompatibility({ nodeVersion: 'v24.21.0', packageVersions: compatiblePackages }).status).toBe('compatible')
      await rm(join(modules, '@deepseek-ai/dsh-compaction', 'package.json'))
      expect((await detectCompatibility({ nodeVersion: 'v24.21.0', installAnchor: anchor })).status).toBe('unknown')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('reads exact host package versions from an explicit DSH installation without loading peers', async () => {
    const root = await mkdtemp(join(tmpdir(), 'codex-connect-host-anchor-'))
    const host = join(root, 'host')
    const anchor = join(host, 'node_modules', '@deepseek-ai', 'dsh', 'package.json')
    try {
      await mkdir(dirname(anchor), { recursive: true })
      await writeFile(anchor, JSON.stringify({ name: '@deepseek-ai/dsh', version: SUPPORTED_DSH_PLUGIN_API_VERSION }))
      for (const [name, version] of Object.entries(compatiblePackages)) {
        const manifest = join(host, 'node_modules', name, 'package.json')
        await mkdir(dirname(manifest), { recursive: true })
        await writeFile(manifest, JSON.stringify({ name, version, exports: { import: './index.js' } }))
      }
      const report = await detectCompatibility({ nodeVersion: 'v22.19.0', installAnchor: anchor })
      expect(report.status).toBe('compatible')
      expect(JSON.stringify(report)).not.toContain(root)

      const hostPi = join(host, 'node_modules', '@earendil-works', 'pi-ai', 'package.json')
      await writeFile(hostPi, JSON.stringify({ name: '@earendil-works/pi-ai', version: '0.87.1' }))
      const ownedReport = await detectCompatibility({ nodeVersion: 'v22.19.0', installAnchor: anchor })
      expect(ownedReport.status).toBe('compatible')
      expect(ownedReport.packages['@earendil-works/pi-ai'].installed).toBe('0.85.1')

      const llmManifest = join(host, 'node_modules', '@deepseek-ai', 'dsh-llm', 'package.json')
      await writeFile(llmManifest,
        JSON.stringify({ name: '@deepseek-ai/dsh-llm', version: '0.1.7-rc.2' }))
      expect((await detectCompatibility({ nodeVersion: 'v22.19.0', installAnchor: anchor })).status).toBe('unverified')

      await rm(llmManifest)
      const unrelated = join(root, 'node_modules', '@deepseek-ai', 'dsh-llm', 'package.json')
      await mkdir(dirname(unrelated), { recursive: true })
      await writeFile(unrelated, JSON.stringify({ name: '@deepseek-ai/dsh-llm', version: SUPPORTED_DSH_PLUGIN_API_VERSION }))
      expect((await detectCompatibility({ nodeVersion: 'v22.19.0', installAnchor: anchor })).status).toBe('unknown')

      await writeFile(anchor, JSON.stringify({ name: 'not-dsh', version: SUPPORTED_DSH_PLUGIN_API_VERSION }))
      expect((await detectCompatibility({ nodeVersion: 'v22.19.0', installAnchor: anchor })).status).toBe('unknown')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
