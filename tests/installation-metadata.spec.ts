import { afterEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { detectCompatibility } from '../src/compatibility.ts'
import {
  DSH_METADATA_PACKAGES,
  readDshInstallationMetadata,
  readInstalledPluginVersion,
  readPluginDependencyVersion,
} from '../src/installation-metadata.ts'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(async root => {
    expect(await realpath(root)).toBe(root)
    await rm(root, { recursive: true, force: true })
  }))
})

async function fixture(): Promise<string> {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'codex-connect-metadata-')))
  roots.push(root)
  return root
}

async function manifest(path: string, name: string, version: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify({ name, version, exports: { import: './must-not-be-loaded.js' } }))
}

async function peers(modules: string, version = '0.2.1-alpha.1'): Promise<void> {
  for (const name of DSH_METADATA_PACKAGES) await manifest(join(modules, name, 'package.json'), name, version)
}

describe('bounded installation metadata', () => {
  it('does not follow shared profile ancestors or their legacy symlinks', async () => {
    const root = await fixture()
    const plugin = join(root, 'profiles', 'desktop', 'node_modules', 'dsh-codex-connect', 'package.json')
    await manifest(plugin, 'dsh-codex-connect', '0.2.0-alpha.4')
    const legacy = join(root, 'legacy', 'node_modules')
    await peers(legacy, '0.1.1-rc.2')
    for (const name of DSH_METADATA_PACKAGES) {
      const link = join(root, 'profiles', 'node_modules', name)
      await mkdir(dirname(link), { recursive: true })
      await symlink(join(legacy, name), link, process.platform === 'win32' ? 'junction' : 'dir')
    }
    await manifest(join(dirname(plugin), 'node_modules', '@earendil-works/pi-ai', 'package.json'), '@earendil-works/pi-ai', '0.85.1')
    const report = await detectCompatibility({ nodeVersion: 'v24.21.0', pluginManifestPath: plugin })
    expect(report.status).toBe('unknown')
    for (const name of DSH_METADATA_PACKAGES) expect(report.packages[name]).toMatchObject({ installed: null, status: 'unknown' })
    expect(report.packages['@earendil-works/pi-ai'].installed).toBe('0.85.1')
    expect(JSON.stringify(report)).not.toContain(root)
    expect(JSON.stringify(report)).not.toContain('0.1.1-rc.2')
  })

  it('uses only the plugin-own root followed by its immediate installation node_modules', async () => {
    const root = await fixture()
    const modules = join(root, 'node_modules')
    const plugin = join(modules, 'dsh-codex-connect', 'package.json')
    await manifest(plugin, 'dsh-codex-connect', '0.2.0-alpha.4')
    await peers(modules)
    await manifest(join(dirname(plugin), 'node_modules', '@earendil-works/pi-ai', 'package.json'), '@earendil-works/pi-ai', '0.85.1')
    expect((await detectCompatibility({ nodeVersion: 'v24.21.0', pluginManifestPath: plugin })).status).toBe('compatible')
    await manifest(join(dirname(plugin), 'node_modules', '@deepseek-ai/dsh-llm', 'package.json'), '@deepseek-ai/dsh-llm', '0.2.1-alpha.1')
    expect(await readPluginDependencyVersion('@deepseek-ai/dsh-llm', plugin)).toBe('0.2.1-alpha.1')
    await manifest(join(dirname(plugin), 'node_modules', '@deepseek-ai/dsh-llm', 'package.json'), 'wrong-package', '0.2.1-alpha.1')
    expect(await readPluginDependencyVersion('@deepseek-ai/dsh-llm', plugin)).toBeUndefined()
  })

  it('allows exact pnpm peer symlinks without broadening lookup to ancestors', async () => {
    const root = await fixture()
    const peerModules = join(root, 'node_modules', '.pnpm', 'dsh-codex-connect@0.2.0-alpha.4', 'node_modules')
    const plugin = join(peerModules, 'dsh-codex-connect', 'package.json')
    await manifest(plugin, 'dsh-codex-connect', '0.2.0-alpha.4')
    for (const name of [...DSH_METADATA_PACKAGES, '@earendil-works/pi-ai']) {
      const version = name === '@earendil-works/pi-ai' ? '0.85.1' : '0.2.1-alpha.1'
      const directory = join(root, 'node_modules', '.pnpm', `${name.replace('/', '+')}@${version}`, 'node_modules', name)
      await manifest(join(directory, 'package.json'), name, version)
      const link = join(peerModules, name)
      await mkdir(dirname(link), { recursive: true })
      await symlink(directory, link, process.platform === 'win32' ? 'junction' : 'dir')
    }
    await peers(join(root, 'node_modules'), '0.1.1-rc.2')
    const logicalPlugin = join(root, 'node_modules', 'dsh-codex-connect')
    await symlink(dirname(plugin), logicalPlugin, process.platform === 'win32' ? 'junction' : 'dir')
    const report = await detectCompatibility({ nodeVersion: 'v24.21.0', pluginManifestPath: join(logicalPlugin, 'package.json') })
    expect(report.status).toBe('compatible')
    expect(report.packages['@deepseek-ai/dsh-llm'].installed).toBe('0.2.1-alpha.1')
  })

  it('requires exact package names and valid versions, never arbitrary paths or text', async () => {
    const root = await fixture()
    const plugin = join(root, 'plugin', 'package.json')
    for (const version of [null, '', ' v0.2.0-alpha.4', '/private/secret', '0.2.0-alpha.04', '9999999999999999999999.0.0']) {
      await manifest(plugin, 'dsh-codex-connect', version)
      expect(await readInstalledPluginVersion(plugin)).toBeUndefined()
    }
    await manifest(plugin, 'unrelated', '0.2.0-alpha.4')
    expect(await readInstalledPluginVersion(plugin)).toBeUndefined()
    await manifest(plugin, 'dsh-codex-connect', '0.2.0-alpha.4')
    expect(await readInstalledPluginVersion(plugin)).toBe('0.2.0-alpha.4')
    expect(await readPluginDependencyVersion('../../private', plugin)).toBeUndefined()
  })

  it('validates selected DSH root metadata and requires all three peers for its version', async () => {
    const root = await fixture()
    const modules = join(root, 'host', 'node_modules')
    const anchor = join(modules, '@deepseek-ai', 'dsh', 'package.json')
    await manifest(anchor, '@deepseek-ai/dsh', '0.2.1-alpha.1')
    await peers(modules)
    expect(await readDshInstallationMetadata(anchor)).toMatchObject({ version: '0.2.1-alpha.1', currentDshVersion: '0.2.1-alpha.1' })
    await manifest(join(modules, '@deepseek-ai/dsh-compaction', 'package.json'), '@deepseek-ai/dsh-compaction', '0.2.1-alpha.2')
    expect(await readDshInstallationMetadata(anchor)).not.toHaveProperty('currentDshVersion')
    const removedPeer = join(modules, '@deepseek-ai/dsh-compaction', 'package.json')
    expect(await realpath(removedPeer)).toBe(removedPeer)
    await rm(removedPeer)
    const unrelated = join(root, 'node_modules')
    await peers(unrelated)
    expect((await readDshInstallationMetadata(anchor))?.packageVersions['@deepseek-ai/dsh-compaction']).toBeUndefined()
    await manifest(anchor, 'not-dsh', '0.2.1-alpha.1')
    expect(await readDshInstallationMetadata(anchor)).toBeUndefined()
    expect(await readDshInstallationMetadata('relative/package.json')).toBeUndefined()
  })

  it('never uses local peers for an invalid explicit anchor and keeps pi-ai plugin-owned', async () => {
    const root = await fixture()
    const plugin = join(root, 'plugin', 'package.json')
    await manifest(plugin, 'dsh-codex-connect', '0.2.0-alpha.4')
    await peers(join(dirname(plugin), 'node_modules'))
    await manifest(join(dirname(plugin), 'node_modules', '@earendil-works/pi-ai', 'package.json'), '@earendil-works/pi-ai', '0.85.1')
    const modules = join(root, 'host', 'node_modules')
    const anchor = join(modules, '@deepseek-ai/dsh', 'package.json')
    await manifest(anchor, 'wrong-dsh', '0.2.1-alpha.1')
    const unknown = await detectCompatibility({ installAnchor: anchor, pluginManifestPath: plugin, nodeVersion: 'v24.21.0' })
    expect(unknown.status).toBe('unknown')
    expect(unknown.packages['@deepseek-ai/dsh-llm'].installed).toBeNull()
    expect(unknown.packages['@earendil-works/pi-ai'].installed).toBe('0.85.1')
    await manifest(anchor, '@deepseek-ai/dsh', '0.2.1-alpha.1')
    await peers(modules)
    await manifest(join(modules, '@earendil-works/pi-ai', 'package.json'), '@earendil-works/pi-ai', '0.87.1')
    const selected = await detectCompatibility({ installAnchor: anchor, pluginManifestPath: plugin, nodeVersion: 'v24.21.0' })
    expect(selected.status).toBe('compatible')
    expect(selected.packages['@earendil-works/pi-ai'].installed).toBe('0.85.1')
  })
})
