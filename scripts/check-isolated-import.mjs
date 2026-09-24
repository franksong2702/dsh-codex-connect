#!/usr/bin/env node

import { cp, mkdir, mkdtemp, readFile, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runBoundedCommand } from './bounded-command.mjs'
import { scrubCanaryEnvironment } from './canary-environment.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const missingHostPeers = new Set(['@deepseek-ai/schemastery', '@earendil-works/pi-ai'])
const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
const fixture = await mkdtemp(join(tmpdir(), 'codex-connect-isolated-import-'))

async function linkPackage(nodeModules, name) {
  const target = join(root, 'node_modules', name)
  const location = join(nodeModules, name)
  await mkdir(dirname(location), { recursive: true })
  await symlink(target, location, process.platform === 'win32' ? 'junction' : 'dir')
}

try {
  const profileNodeModules = join(fixture, 'node_modules')
  const pluginRoot = join(profileNodeModules, packageJson.name)
  await mkdir(pluginRoot, { recursive: true })
  await cp(join(root, 'package.json'), join(pluginRoot, 'package.json'))
  await cp(join(root, 'lib'), join(pluginRoot, 'lib'), { recursive: true })

  // The host exposes its declared API peers, but not these two libraries.
  for (const name of Object.keys(packageJson.peerDependencies ?? {})) {
    if (!missingHostPeers.has(name)) await linkPackage(profileNodeModules, name)
  }
  // The plugin installer provides every direct dependency from its manifest.
  const pluginNodeModules = join(pluginRoot, 'node_modules')
  for (const name of Object.keys(packageJson.dependencies ?? {})) {
    await linkPackage(pluginNodeModules, name)
  }

  const env = scrubCanaryEnvironment(process.env)
  delete env.NODE_OPTIONS
  delete env.NODE_PATH
  const result = await runBoundedCommand(process.execPath,
    ['--input-type=module', '--eval', "await import('dsh-codex-connect'); console.log('imported')"],
    { cwd: fixture, env, timeoutMs: 15_000, maxBuffer: 8192 })
  if (result.error || result.cleanupError || result.status !== 0 || result.stdout.trim() !== 'imported') {
    const missing = result.stderr.match(/Cannot find package '([^'\r\n]+)'/u)?.[1]
    const outdated = result.stderr.includes('volatile is not a function')
    throw new Error(`isolated plugin import failed (exit=${result.status ?? 'unknown'}, missing=${missing ?? 'none'}, outdatedSchema=${outdated})`)
  }
  process.stdout.write('isolated plugin import passed without host schemastery or pi-ai peers\n')
} finally {
  await rm(fixture, { recursive: true, force: true })
}
