/** Real upstream command/materializer regressions with owned synthetic packages and subprocesses. */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const fromHost = createRequire(resolve(process.argv[2]))
const { initProfile } = await import(pathToFileURL(fromHost.resolve('@deepseek-ai/dsh-app-boot')).href)
const { runPluginCommand } = await import(pathToFileURL(fromHost.resolve('@deepseek-ai/dsh-plugin-manager/operations')).href)
const baseline = process.argv[3] === '--baseline'
const root = await mkdtemp(join(tmpdir(), 'issue211-command-regression-'))
const cases = []
const peerName = 'issue211-shared-peer'
const exists = async path => { try { await lstat(path); return true } catch (e) { if (e.code === 'ENOENT') return false; throw e } }
const loadJson = async path => JSON.parse(await readFile(path, 'utf8'))

async function packageAt(parent, marker) {
  const dir = join(parent, 'node_modules', peerName)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'package.json'), JSON.stringify({ name: peerName, version: '1.0.0', type: 'module',
    exports: { import: './index.mjs', require: './index.cjs' } }))
  await writeFile(join(dir, 'index.mjs'), `export const marker=${JSON.stringify(marker)}; export const identity={};\n`)
  await writeFile(join(dir, 'index.cjs'), `exports.marker=${JSON.stringify(marker)}; exports.identity={};\n`)
  return dir
}

async function fixture(name, application = false) {
  const home = join(root, name)
  const installation = join(home, 'installation')
  await mkdir(installation, { recursive: true })
  const installAnchor = join(installation, 'package.json')
  await writeFile(installAnchor, JSON.stringify({ name: 'issue211-host', version: '1.0.0', dependencies: { [peerName]: '1.0.0' } }))
  const hostPeer = await packageAt(installation, 'host')
  const dir = application ? join(home, 'application-profile') : join(home, 'profiles', 'test')
  initProfile(dir, [])
  const plugin = join(dir, 'node_modules', 'issue211-plugin')
  await mkdir(plugin, { recursive: true })
  await writeFile(join(plugin, 'package.json'), JSON.stringify({ name: 'issue211-plugin', version: '1.0.0', type: 'module', peerDependencies: { [peerName]: '1.0.0' } }))
  const manifestPath = join(dir, 'package.json')
  const manifest = await loadJson(manifestPath)
  manifest.dependencies = { 'issue211-plugin': 'file:./node_modules/issue211-plugin' }
  await writeFile(manifestPath, JSON.stringify(manifest))
  const reportPath = join(home, 'child-result.json')
  const child = join(plugin, 'child.mjs')
  await writeFile(child, `import {writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const req=createRequire(import.meta.url);
try {
  const esm=await import(${JSON.stringify(peerName)});const cjs=req(${JSON.stringify(peerName)});
  const hostEsm=await import(pathToFileURL(${JSON.stringify(join(hostPeer, 'index.mjs'))}).href);
  const hostCjs=req(${JSON.stringify(join(hostPeer, 'index.cjs'))});
  writeFileSync(${JSON.stringify(reportPath)},JSON.stringify({ok:true,esm:esm.marker,cjs:cjs.marker,
    sameEsm:esm.identity===hostEsm.identity,sameCjs:cjs.identity===hostCjs.identity}));
} catch(error) {writeFileSync(${JSON.stringify(reportPath)},JSON.stringify({ok:false,code:error.code}));process.exitCode=42;}
`)
  const context = { profile: 'test', home, installAnchor, cwd: home, ...(application ? { dir } : {}) }
  const options = { command: process.execPath, args: [child], execution: 'cli', outputBytes: 1024, activateNewBundles: false,
    env: { DSH_HOME: home, DSH_TELEMETRY_MODE: 'DISABLED', OTEL_SDK_DISABLED: 'true' } }
  return { home, dir, hostPeer, context, options, reportPath, manifestPath }
}

try {
  const first = await fixture('ordinary')
  const before = await readFile(first.manifestPath, 'utf8')
  const result = await runPluginCommand(first.context, ['exec'], first.options)
  if (baseline) {
    assert.equal(result.exitCode, 42)
    assert.deepEqual(await loadJson(first.reportPath), { ok: false, code: 'ERR_MODULE_NOT_FOUND' })
    cases.push('unpatched-cli-exec-fails-on-missing-peer')
  } else {
    assert.equal(result.exitCode, 0, 'patched cli exec must prepare peers before spawning')
    assert.deepEqual(await loadJson(first.reportPath), { ok: true, esm: 'host', cjs: 'host', sameEsm: true, sameCjs: true })
    assert.equal(await readFile(first.manifestPath, 'utf8'), before)
    assert.equal(await exists(join(first.home, 'profiles', 'node_modules')), false, 'no shared-home fallback')
    cases.push('cli-exec-keeps-host-esm-and-cjs-identity')
    const projected = await realpath(join(first.dir, 'node_modules', peerName))
    assert.equal(projected, await realpath(first.hostPeer))
    await rm(first.reportPath)
    assert.equal((await runPluginCommand(first.context, ['exec'], first.options)).exitCode, 0)
    assert.equal(await realpath(join(first.dir, 'node_modules', peerName)), projected)
    cases.push('repeat-exec-is-idempotent')

    const local = await fixture('local-precedence')
    const localPeer = await packageAt(local.dir, 'local')
    assert.equal((await runPluginCommand(local.context, ['exec'], local.options)).exitCode, 0)
    assert.deepEqual(await loadJson(local.reportPath), { ok: true, esm: 'local', cjs: 'local', sameEsm: false, sameCjs: false })
    assert.equal((await lstat(localPeer)).isSymbolicLink(), false)
    cases.push('profile-owned-package-is-not-overwritten')

    const broken = await fixture('broken-user-patch')
    const patch = join(broken.dir, 'cordis.patch.yml')
    await writeFile(patch, ': [ deliberately invalid yaml')
    assert.equal((await runPluginCommand(broken.context, ['exec'], broken.options)).exitCode, 0)
    assert.equal(await readFile(patch, 'utf8'), ': [ deliberately invalid yaml')
    cases.push('diagnostic-does-not-parse-or-rewrite-user-patch')

    for (const [name, args, execution] of [['non-exec', ['root'], 'cli'], ['service', ['exec'], 'service']]) {
      const target = await fixture(name)
      assert.equal((await runPluginCommand(target.context, args, { ...target.options, execution })).exitCode, 42)
      assert.equal(await exists(join(target.dir, 'node_modules', peerName)), false)
      cases.push(`${name}-does-not-materialize-peers`)
    }

    const cancelled = await fixture('cancelled')
    await assert.rejects(runPluginCommand(cancelled.context, ['exec'], { ...cancelled.options, signal: AbortSignal.abort(new Error('fixture-cancelled')) }), /fixture-cancelled/)
    assert.equal(await exists(cancelled.reportPath), false)
    assert.equal(await exists(join(cancelled.dir, 'node_modules', peerName)), false)
    cases.push('cancelled-command-never-spawns-or-projects')

    const app = await fixture('application', true)
    assert.equal((await runPluginCommand(app.context, ['exec'], app.options)).exitCode, 0)
    assert.equal(await exists(join(app.home, 'profiles')), false)
    cases.push('explicit-application-profile-stays-scoped')
  }
  console.log(JSON.stringify({ status: 'passed', mode: baseline ? 'unpatched-control' : 'repaired', cases, realProviderRequests: 0 }))
} finally { await rm(root, { recursive: true, force: true }) }
