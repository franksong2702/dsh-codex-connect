/** Keyless exact-published-Host composition check; never uses a daily profile or native driver. */
import { cp, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runBoundedCommand } from './bounded-command.mjs'
import { scrubCanaryEnvironment } from './canary-environment.mjs'
import { resolveExactDshOverrides, exactDshFixtureManifest, readDshRegistryManifest } from './exact-dsh-fixture.mjs'
import { prepareLocalHost } from '../host-patches/codex-cua-local.1/prepare-local-host.mjs'
import { assertCuaFixturePackages } from './cua-fixture-packages.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const supplied = process.env.DSH_CUA_FIXTURE
const withLocalPatch = process.argv[2] === '--with-local-patch'
if (process.argv.length > 2 && (!withLocalPatch || process.argv.length !== 3)) throw new Error('usage: check-cua-host.mjs [--with-local-patch]')
const version = process.env.DSH_CUA_HOST_VERSION ?? '0.2.2-alpha.2'
if (!['0.2.2-alpha.2', '0.2.2-alpha.2.codex-cua-local.1', '0.2.2-alpha.2.codex-cua-local.2', '0.2.2-alpha.2.codex-cua-local.3', '0.2.2-alpha.2.codex-cua-local.4', '0.2.2-alpha.2.codex-cua-local.5', '0.2.2-alpha.2.codex-cua-local.6', '0.2.2-alpha.2.codex-cua-local.7'].includes(version) || version !== '0.2.2-alpha.2' && !supplied) throw new Error('Local CUA checks require an explicit isolated candidate fixture')
const fixture = supplied ? resolve(supplied) : await mkdtemp(join(tmpdir(), 'codex-cua-published-host-'))
const configDir = await mkdtemp(join(fixture, 'empty-package-config-'))
await writeFile(join(configDir, 'user.npmrc'), '')
await writeFile(join(configDir, 'global.npmrc'), '')
const env = { ...scrubCanaryEnvironment(process.env), NPM_CONFIG_USERCONFIG: join(configDir, 'user.npmrc'), NPM_CONFIG_GLOBALCONFIG: join(configDir, 'global.npmrc'), DSH_TELEMETRY_MODE: 'DISABLED' }
async function command(binary, args, options = {}) {
  const result = await runBoundedCommand(binary, args, { cwd: options.cwd ?? fixture, env: { ...env, ...options.env }, timeoutMs: 15 * 60 * 1000 })
  if (result.status !== 0 || result.error) throw new Error(`${binary} check failed: ${result.stderr.slice(-4000)}\n${result.stdout.slice(-4000)}`)
  return result
}
try {
  if (!supplied) {
    let hostManifest
    const overrides = await resolveExactDshOverrides(version, async (name, requested) => {
      const manifest = await readDshRegistryManifest(name, requested)
      if (name === '@deepseek-ai/dsh') hostManifest = manifest
      return manifest
    })
    const manifest = exactDshFixtureManifest(overrides)
    // The copied test package imports these directly. A strict pnpm layout
    // does not expose dependencies belonging only to the CLI's virtual store.
    for (const name of ['@deepseek-ai/cordis', '@deepseek-ai/schemastery', '@deepseek-ai/cordis-plugin-loader', '@deepseek-ai/cordis-plugin-include']) {
      const exact = hostManifest.dependencies[name]?.replace(/^~/u, '')
      if (typeof exact !== 'string' || !/^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/u.test(exact)) throw new Error(`Host fixture dependency is not an exact published version: ${name}`)
      manifest.dependencies[name] = exact
    }
    await writeFile(join(fixture, 'package.json'), JSON.stringify(manifest))
    await command('pnpm', ['--ignore-workspace', '--config.minimum-release-age=0', 'install', '--ignore-scripts', '--store-dir', join(fixture, 'store')])
  }
  const require = createRequire(join(fixture, 'package.json'))
  const platformPackages = assertCuaFixturePackages(require, version, JSON.parse(await readFile(join(fixture, 'package.json'), 'utf8')))
  const candidate = await mkdtemp(join(fixture, 'computer-use-candidate-'))
  try {
    await cp(join(root, 'packages/dsh-codex-computer-use'), candidate, { recursive: true })
    const result = await command(process.execPath, ['--test', join(candidate, 'test/host.test.mjs'), join(candidate, 'test/installation.test.mjs')])
    process.stdout.write(result.stdout)
    const report = { schemaVersion: 1, dshVersion: version, ...platformPackages, provider: 'scripted_in_memory', cuaTransport: 'synthetic', realModelRequests: 0, desktopActions: 0, parityAccepted: false }
    process.stdout.write(`${JSON.stringify(report)}\n`)
  } finally { await rm(candidate, { recursive: true, force: true }) }
  if (withLocalPatch) {
    if (version !== '0.2.2-alpha.2') throw new Error('Patch preparation requires the original published fixture')
    const localRoot = await mkdtemp(join(fixture, 'local-patch-'))
    try {
      const local = join(localRoot, 'candidate')
      await prepareLocalHost(fixture, local)
      await command('pnpm', ['--dir', join(local, 'runtime'), '--ignore-workspace', '--config.minimum-release-age=0', 'install', '--ignore-scripts'])
      for (const [script, variables] of [
        [join(root, 'scripts/check-cua-host.mjs'), { DSH_CUA_FIXTURE: join(local, 'runtime'), DSH_CUA_HOST_VERSION: '0.2.2-alpha.2.codex-cua-local.7' }],
        [join(root, 'host-patches/codex-cua-local.1/route.test.mjs'), { DSH_LOCAL_FIXTURE: join(local, 'runtime') }],
      ]) {
        const args = script.endsWith('.test.mjs') ? ['--test', script] : [script]
        const result = await runBoundedCommand(process.execPath, args, { cwd: fixture, env: { ...env, ...variables }, timeoutMs: 60_000 })
        if (result.status !== 0 || result.error) throw new Error(`Local Host composition failed: ${result.stderr.slice(-4000)}\n${result.stdout.slice(-4000)}`)
        process.stdout.write(result.stdout)
      }
      // The local permission candidate also has to preserve ordinary installed
      // Connect behavior. This is a scripted, keyless profile, never a live service.
      const packed = JSON.parse((await command('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', localRoot], { cwd: root })).stdout)
      if (packed.length !== 1 || !/^[a-z0-9.-]+\.tgz$/u.test(packed[0].filename)) throw new Error('Unexpected packed Connect artifact')
      const home = join(localRoot, 'home')
      const localEnv = { DSH_HOME: home }
      await command(process.execPath, [join(local, 'runtime/node_modules/@deepseek-ai/dsh/lib/bin.js'), 'plugin', '--profile', 'web', 'add', join(localRoot, packed[0].filename), '--ignore-scripts'], { env: localEnv })
      const installed = await command(process.execPath, [join(root, 'scripts/check-installed-runtime.mjs'), join(home, 'profiles/web/package.json'), join(local, 'runtime/package.json')], { env: localEnv })
      process.stdout.write(installed.stdout)
    } finally { await rm(localRoot, { recursive: true, force: true }) }
  }
} finally {
  await rm(configDir, { recursive: true, force: true })
  if (!supplied) await rm(fixture, { recursive: true, force: true })
}
