/** Install an immutable candidate and exact stock Web profile in a disposable home. */
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { resolveExactDshOverrides, exactDshFixtureManifest } from './exact-dsh-fixture.mjs'
import { scrubCanaryEnvironment } from './canary-environment.mjs'
import { cachedTaskRegistry } from './task-fixture-registry.mjs'

export async function prepareTaskSession(repo, version = '0.1.2-rc.1') {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'codex-task-session-')))
  const source = join(directory, 'source'), install = join(directory, 'install')
  const workspace = join(directory, 'workspace'), home = join(directory, 'home')
  for (const path of [source, install, workspace, home]) await mkdir(path)
  await writeFile(join(directory, 'fixture-owner.json'), JSON.stringify({ kind: 'codex-task-session-offline' }), { mode: 0o600 })
  const env = { ...scrubCanaryEnvironment(process.env), DSH_HOME: home, DSH_TELEMETRY_MODE: 'DISABLED', OTEL_SDK_DISABLED: 'true' }
  delete env.NODE_OPTIONS
  const npm = process.env.MATRIX_NPM_CLI
  const command = npm ? process.execPath : 'npm', prefix = npm ? [npm] : []
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim()
  // Deliberately do not mislabel working-tree changes as this immutable revision.
  const archive = execFileSync('git', ['archive', head], { cwd: repo, maxBuffer: 40 * 1024 * 1024 })
  assert.equal(spawnSync('tar', ['-x', '-C', source], { input: archive }).status, 0)
  const [pack] = JSON.parse(execFileSync(command, [...prefix, 'pack', '--json', '--ignore-scripts', '--pack-destination', directory], { cwd: source, env, encoding: 'utf8' }))
  const artifact = join(directory, pack.filename)
  console.log(`Preparing exact DSH ${version} full Web profile`)
  const overrides = await resolveExactDshOverrides(version, cachedTaskRegistry(join(repo, 'node_modules/.cache/task-matrix/manifests')))
  await writeFile(join(install, 'package.json'), JSON.stringify(exactDshFixtureManifest(overrides)))
  execFileSync(command, [...prefix, 'install', '--prefix', install, '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false'], {
    cwd: workspace, env, stdio: ['ignore', 'ignore', 'pipe'], timeout: 300000,
  })
  const binary = join(install, 'node_modules/.bin/dsh')
  execFileSync(binary, ['plugin', '--profile', 'web', 'add', 'file:' + artifact], {
    cwd: workspace, env, stdio: ['ignore', 'ignore', 'pipe'], timeout: 180000,
  })
  const fixture = { directory, source, install, workspace, home, binary, artifact, head, version,
    artifactSha256: createHash('sha256').update(await readFile(artifact)).digest('hex') }
  await writeFile(join(directory, 'fixture.json'), JSON.stringify(fixture, null, 2), { mode: 0o600 })
  return fixture
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const fixture = await prepareTaskSession(fileURLToPath(new URL('../', import.meta.url)), process.argv[2])
  console.log(JSON.stringify({ prepared: true, manifest: join(fixture.directory, 'fixture.json'), head: fixture.head, artifactSha256: fixture.artifactSha256 }))
}
