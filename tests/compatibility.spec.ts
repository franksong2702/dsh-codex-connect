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
