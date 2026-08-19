#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { access, mkdir, mkdtemp, readFile, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const DEFAULT_DSH_VERSION = '0.1.0-rc.7'
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const IMAGES_ROOT = join(REPO_ROOT, 'packages/images')

function commandName(name) {
  return process.platform === 'win32' && (name === 'npm' || name === 'pnpm') ? `${name}.cmd` : name
}

function runCommand(command, args, options) {
  const result = spawnSync(commandName(command), args, {
    cwd: options.cwd,
    env: options.env,
    encoding: 'utf8',
    maxBuffer: 24 * 1024 * 1024,
    windowsHide: true,
  })
  if (result.error !== undefined) {
    throw new Error(`${command} ${args.join(' ')} could not start: ${result.error.message}`)
  }
  return { status: result.status ?? 1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' }
}

function requireSuccess(label, result) {
  if (result.status === 0) return
  const detail = (result.stderr || result.stdout).trim().split(/\r?\n/u).slice(-12).join('\n')
  throw new Error(`${label} failed with exit ${String(result.status)}${detail === '' ? '' : `:\n${detail}`}`)
}

function configBlock(dump, id) {
  const lines = dump.split(/\r?\n/u)
  const start = lines.findIndex(line => line === `- id: ${id}`)
  if (start < 0) throw new Error(`dump-config is missing the ${id} block`)
  let end = lines.length
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^(?:- id: |# ==)/u.test(lines[index] ?? '')) {
      end = index
      break
    }
  }
  while (end > start && lines[end - 1] === '') end -= 1
  return lines.slice(start, end).join('\n')
}

async function assertNoCredential(home) {
  try {
    await access(join(home, '.openai-codex-auth.json'))
  } catch (error) {
    if (error?.code === 'ENOENT') return
    throw error
  }
  throw new Error('isolated plugin installation unexpectedly created an OAuth credential file')
}

async function installScenario({ dshBinary, dshVersion, home, workspace, withImages }) {
  const env = { ...process.env, DSH_HOME: home, DSH_TELEMETRY_MODE: 'DISABLED' }
  const before = runCommand(dshBinary, ['--profile', 'web', '--dump-config'], { cwd: workspace, env })
  requireSuccess('pre-install dump-config', before)
  const original = {
    agentDefaultModel: configBlock(before.stdout, 'agent-default-model'),
    web: configBlock(before.stdout, 'web'),
  }

  const addCore = runCommand(dshBinary, ['plugin', '--profile', 'web', 'add', `link:${REPO_ROOT}`], { cwd: workspace, env })
  requireSuccess('core plugin install', addCore)
  const coreDump = runCommand(dshBinary, ['--profile', 'web', '--dump-config'], { cwd: workspace, env })
  requireSuccess('core-only dump-config', coreDump)
  if (coreDump.stdout.includes('llm-openai-codex-images')
    || coreDump.stdout.includes('dsh-codex-connect-images')
    || coreDump.stdout.includes('codex_connect_image_generate')) {
    throw new Error('core-only installation exposed images package configuration or tools')
  }
  const coreBlock = configBlock(coreDump.stdout, 'llm-openai-codex')
  if (!/^    enableSearch: false$/mu.test(coreBlock) || !/^    enableImageTool: false$/mu.test(coreBlock)) {
    throw new Error('core-only configuration changed opt-in capability defaults')
  }
  if (configBlock(coreDump.stdout, 'agent-default-model') !== original.agentDefaultModel
    || configBlock(coreDump.stdout, 'web') !== original.web) {
    throw new Error('core-only installation changed Harness routing defaults')
  }

  if (!withImages) {
    await assertNoCredential(home)
    return { coreOnlyImageFree: true }
  }

  const addImages = runCommand(dshBinary, ['plugin', '--profile', 'web', 'add', `link:${IMAGES_ROOT}`], { cwd: workspace, env })
  requireSuccess('images plugin install', addImages)
  const imagesDump = runCommand(dshBinary, ['--profile', 'web', '--dump-config'], { cwd: workspace, env })
  requireSuccess('images dump-config', imagesDump)
  const imagesBlock = configBlock(imagesDump.stdout, 'llm-openai-codex-images')
  if (!/^    enabled: true$/mu.test(imagesBlock)) {
    throw new Error('images configuration did not default to enabled:true')
  }
  if (configBlock(imagesDump.stdout, 'agent-default-model') !== original.agentDefaultModel
    || configBlock(imagesDump.stdout, 'web') !== original.web
    || configBlock(imagesDump.stdout, 'llm-openai-codex') !== coreBlock) {
    throw new Error('images installation changed core or Harness routing defaults')
  }
  if (imagesDump.stdout.includes('codex_connect_image_generate')) {
    throw new Error('PR-1 skeleton unexpectedly registered the image generation tool')
  }

  const profileDir = join(home, 'profiles/web')
  const profileManifest = JSON.parse(await readFile(join(profileDir, 'package.json'), 'utf8'))
  if (profileManifest.dependencies?.['dsh-codex-connect'] === undefined
    || profileManifest.dependencies?.['dsh-codex-connect-images'] === undefined) {
    throw new Error('profile manifest is missing the linked core or images package')
  }
  const [repoReal, imagesReal, profileCoreReal, profileImagesReal, workspaceCoreReal] = await Promise.all([
    realpath(REPO_ROOT),
    realpath(IMAGES_ROOT),
    realpath(join(profileDir, 'node_modules/dsh-codex-connect')),
    realpath(join(profileDir, 'node_modules/dsh-codex-connect-images')),
    realpath(join(IMAGES_ROOT, 'node_modules/dsh-codex-connect')),
  ])
  if (profileCoreReal !== repoReal || workspaceCoreReal !== repoReal || profileImagesReal !== imagesReal) {
    throw new Error('profile links did not resolve to one workspace core and one images package')
  }
  await assertNoCredential(home)
  return { coreOnlyImageFree: true, imagesConfigured: true, singleCoreInstance: true }
}

async function main() {
  const requestedDshVersion = process.env.DSH_VERSION
  if (requestedDshVersion !== undefined && requestedDshVersion !== '' && requestedDshVersion !== DEFAULT_DSH_VERSION) {
    throw new Error(`check-dsh-images-install only verifies the declared DSH CLI version ${DEFAULT_DSH_VERSION}`)
  }

  requireSuccess('core build', runCommand('pnpm', ['run', 'build'], { cwd: REPO_ROOT, env: process.env }))
  requireSuccess('images build', runCommand('pnpm', ['--filter', 'dsh-codex-connect-images', 'run', 'build'], { cwd: REPO_ROOT, env: process.env }))

  const tempRoot = await mkdtemp(join(tmpdir(), 'dsh-codex-connect-images-install-'))
  const installRoot = join(tempRoot, 'dsh-install')
  const workspace = join(tempRoot, 'workspace')
  await mkdir(workspace, { recursive: true })
  try {
    const install = runCommand('npm', [
      'install', '--prefix', installRoot, '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false',
      `@deepseek-ai/dsh@${DEFAULT_DSH_VERSION}`,
    ], { cwd: workspace, env: process.env })
    requireSuccess('npm install DSH', install)
    const dshBinary = join(installRoot, 'node_modules', '.bin', process.platform === 'win32' ? 'dsh.cmd' : 'dsh')
    const version = runCommand(dshBinary, ['--version'], { cwd: workspace, env: process.env })
    requireSuccess('dsh --version', version)
    if (version.stdout.trim() !== DEFAULT_DSH_VERSION) throw new Error('isolated DSH version mismatch')

    const coreOnly = await installScenario({
      dshBinary,
      dshVersion: DEFAULT_DSH_VERSION,
      home: join(tempRoot, 'core-only-home'),
      workspace,
      withImages: false,
    })
    const withImages = await installScenario({
      dshBinary,
      dshVersion: DEFAULT_DSH_VERSION,
      home: join(tempRoot, 'images-home'),
      workspace,
      withImages: true,
    })

    process.stdout.write(`${JSON.stringify({
      schemaVersion: 1,
      dshVersion: DEFAULT_DSH_VERSION,
      nodeVersion: process.version,
      package: 'dsh-codex-connect-images',
      coreOnlyImageFree: coreOnly.coreOnlyImageFree,
      imagesConfigured: withImages.imagesConfigured,
      defaultEnabled: true,
      singleCoreInstance: withImages.singleCoreInstance,
      toolRegistered: false,
      credentialsCreated: false,
    })}\n`)
  } finally {
    await rm(tempRoot, { recursive: true, force: true })
  }
}

try {
  await main()
} catch (error) {
  process.stderr.write(`check-dsh-images-install: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
}
