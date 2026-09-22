#!/usr/bin/env node
/** Exact-host Phase 2 synthetic matrix. This is separate from the Phase 1 matrix. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve, delimiter } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'tsdown'
import { runBoundedCommand } from './bounded-command.mjs'
import { scrubCanaryEnvironment } from './canary-environment.mjs'
import { exactDshFixtureManifest, resolveExactDshOverrides } from './exact-dsh-fixture.mjs'
import { cachedTaskRegistry } from './task-fixture-registry.mjs'
import { readTaskHostIdentity } from './check-adaptive-task-matrix.mjs'
import { assertDelegationMatrix, inspectDelegationMatrixReport } from './adaptive-task-delegation-matrix-contract.mjs'
import { TASK_RUNTIME_PACKAGES } from './adaptive-task-matrix-contract.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const entries = ['adaptive-task-consent.spec', 'adaptive-task-delegation.spec', 'adaptive-task-transitions.spec',
  'adaptive-task-delegation-host.spec', 'adaptive-task-delegation-ledger.spec', 'adaptive-task-evidence.spec']
// Phase 2 reaches the authenticated HTTP and host bridge seams that the Phase 1
// matrix intentionally does not import.
const PHASE2_RUNTIME_PACKAGES = Object.freeze([...TASK_RUNTIME_PACKAGES,
  '@deepseek-ai/dsh-client-connection', '@deepseek-ai/dsh-host-webserver', '@deepseek-ai/dsh-api-session-controller'])

async function main() {
  const argv = process.argv.slice(2)
  assert.ok(argv.length === 0 || (argv.length === 2 && argv[0] === '--report'))
  const reportPath = argv[1] === undefined ? undefined : resolve(ROOT, argv[1])
  if (reportPath) assert.ok(reportPath.startsWith(join(ROOT, 'docs', 'experiments') + '/') && reportPath.endsWith('.json'))
  const pkg = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'))
  const versions = JSON.parse(await readFile(join(ROOT, 'compatibility.json'), 'utf8')).dshPluginApi.versions
  const require = createRequire(join(ROOT, 'package.json')); const vitest = dirname(require.resolve('vitest/package.json'))
  const root = await mkdtemp(join(tmpdir(), 'dsh-task-delegation-matrix-')); const reports = []
  const registry = cachedTaskRegistry(join(ROOT, 'node_modules/.cache/task-matrix/manifests'))
  try {
    const bundle = join(root, 'bundle'); await build({ config: false,
      entry: Object.fromEntries(entries.map(name => [name, join(ROOT, 'tests', `${name}.ts`)])), outDir: bundle,
      platform: 'node', target: 'es2024', format: 'esm', dts: false, clean: true, report: false, logLevel: 'silent', deps: { neverBundle: true },
      define: { __CODEX_CONNECT_VERSION__: JSON.stringify(pkg.version) } })
    const files = (await readdir(bundle)).filter(name => name.endsWith('.mjs')).sort()
    for (const entry of entries) assert.ok(files.includes(`${entry}.mjs`), `missing bundle entry ${entry}`)
    const manifest = await Promise.all(files.map(async name => [name, hash(await readFile(join(bundle, name)))]))
    const bundleDigest = hash(JSON.stringify(manifest))
    for (const version of versions) {
      console.error(`Phase 2 ${process.version} / ${version}: preparing exact runtime`)
      const host = join(root, version); await mkdir(join(host, 'tests'), { recursive: true })
      const overrides = await resolveExactDshOverrides(version, registry)
      for (const name of PHASE2_RUNTIME_PACKAGES) assert.equal(overrides[name], version)
      const metadata = exactDshFixtureManifest(overrides)
      // Keep peer-only roots explicit: npm's auto-peer resolver can otherwise
      // produce conflicting override sets once the authenticated UI peers enter.
      const adapter = await registry('@deepseek-ai/dsh-llm-pi-ai', version)
      metadata.dependencies['@earendil-works/pi-ai'] = adapter.dependencies['@earendil-works/pi-ai']
      metadata.dependencies.undici = pkg.dependencies.undici; metadata.type = 'module'
      await writeFile(join(host, 'package.json'), JSON.stringify(metadata))
      const env = { ...scrubCanaryEnvironment(process.env), PATH: dirname(process.execPath) + delimiter + process.env.PATH, DSH_HOME: join(host, 'synthetic-home'),
        DSH_TELEMETRY_MODE: 'DISABLED', OTEL_SDK_DISABLED: 'true', npm_config_userconfig: join(host, 'empty.npmrc'),
        npm_config_cache: join(ROOT, 'node_modules/.cache/task-matrix/npm'), TASK_MATRIX_ROOT: host, TASK_MATRIX_VERSION: version }
      delete env.NODE_OPTIONS; delete env.NODE_PATH; delete env.CODEX_HOME; await writeFile(env.npm_config_userconfig, '')
      const npm = process.env.MATRIX_NPM_CLI
      const command = npm ? process.execPath : process.platform === 'win32' ? 'npm.cmd' : 'npm'
      const prefix = npm ? [resolve(npm)] : []
      const manager = await runBoundedCommand(command, [...prefix, '--version'], { cwd: host, env, timeoutMs: 10000 })
      assert.equal(manager.status, 0)
      const install = await runBoundedCommand(command, [...prefix, 'install', '--ignore-scripts', '--prefer-offline', '--no-audit', '--no-fund', '--package-lock=false', '--registry=https://registry.npmjs.org'], { cwd: host, env, timeoutMs: 600000 })
      if (install.error || install.cleanupError || install.status !== 0) {
        const failure = join(ROOT, 'node_modules/.cache/task-matrix/phase2-failures', version)
        await mkdir(failure, { recursive: true }); await writeFile(join(failure, 'install.stderr'), install.stderr); await writeFile(join(failure, 'install.stdout'), install.stdout)
        throw new Error(`Task ${version} install failed: ${install.error?.message ?? install.cleanupError?.message ?? install.stderr}`)
      }
      const identity = await readTaskHostIdentity(host, version, [...PHASE2_RUNTIME_PACKAGES, '@earendil-works/pi-ai'])
      for (const name of files) await copyFile(join(bundle, name), join(host, 'tests', name))
      for (const [name, digest] of manifest) assert.equal(hash(await readFile(join(host, 'tests', name))), digest)
      await writeFile(join(host, 'tests/task-host-identity.spec.mjs'), `import {it,expect} from 'vitest'; import {writeFileSync} from 'node:fs';\nit('uses the exact isolated host without a neighboring runtime', async()=>{ const entries=${JSON.stringify(identity.entries)}; for(const [name,path] of Object.entries(entries)){expect(await import(name)).toEqual(await import(path));} writeFileSync(${JSON.stringify(join(host, 'identity.json'))}, JSON.stringify({pid:process.pid,node:process.version,packages:${JSON.stringify(identity.packages)}})); });\n`)
      await copyFile(join(ROOT, 'scripts/adaptive-task-delegation-network-guard.mjs'), join(host, 'network-guard.mjs'))
      const config = { root: host, resolve: { alias: [{ find: 'vitest', replacement: join(vitest, 'dist/index.js') }] }, test: { include: ['tests/*.spec.mjs'], setupFiles: [join(host, 'network-guard.mjs')], pool: 'forks', maxWorkers: 1, fileParallelism: false, isolate: false, testTimeout: 30000, hookTimeout: 30000 } }
      await writeFile(join(host, 'vitest.config.mjs'), `export default ${JSON.stringify(config)}\n`)
      const test = await runBoundedCommand(process.execPath, [join(vitest, 'vitest.mjs'), 'run', '--config', join(host, 'vitest.config.mjs'), '--reporter=json', '--outputFile', join(host, 'tests.json')], { cwd: host, env, timeoutMs: 180000, maxBuffer: 4 * 1024 * 1024 })
      if (test.error || test.cleanupError || test.status !== 0) {
        const failure = join(ROOT, 'node_modules/.cache/task-matrix/phase2-failures', version)
        await mkdir(failure, { recursive: true }); await writeFile(join(failure, 'tests.stderr'), test.stderr); await writeFile(join(failure, 'tests.stdout'), test.stdout)
        try { await copyFile(join(host, 'tests.json'), join(failure, 'tests.json')) } catch {}
        throw new Error(`Task ${version} tests failed: ${test.error?.message ?? test.cleanupError?.message ?? test.stderr.slice(-4000)}`)
      }
      const result = JSON.parse(await readFile(join(host, 'tests.json'), 'utf8')); const cases = inspectDelegationMatrixReport(result)
      const actual = JSON.parse(await readFile(join(host, 'identity.json'), 'utf8'))
      assert.deepEqual(actual.packages, identity.packages); assert.equal(actual.node, process.version)
      const network = JSON.parse(await readFile(join(host, 'network.json'), 'utf8')); assert.equal(network.pid, actual.pid); assert.equal(network.attempts, 0)
      console.error(`Phase 2 ${process.version} / ${version}: ${cases.length} tests passed; verifying crash boundaries`)
      const crash = await runBoundedCommand(process.execPath, [join(ROOT, 'scripts/check-adaptive-task-delegation-crashes.mjs'), '--host', host],
        { cwd: ROOT, env, timeoutMs: 180000, maxBuffer: 4 * 1024 * 1024 })
      if (crash.error || crash.cleanupError || crash.status !== 0) {
        const failure = join(ROOT, 'node_modules/.cache/task-matrix/phase2-failures', version)
        await mkdir(failure, { recursive: true }); await writeFile(join(failure, 'crash.stderr'), crash.stderr)
        await writeFile(join(failure, 'crash.stdout'), crash.stdout)
        throw new Error(`Phase 2 crash ${version}: ${crash.error?.message ?? crash.cleanupError?.message ?? crash.stderr}`)
      }
      const crashes = JSON.parse(crash.stdout.trim().split('\n').at(-1))
      assert.equal(crashes.passed, true); assert.equal(crashes.cases, 18); assert.equal(crashes.freshProcesses, 36)
      assert.equal(crashes.node, actual.node)
      for (const [name, version] of Object.entries(crashes.packages)) assert.equal(version, actual.packages[name])
      reports.push({ version, bundleDigest, cases, tests: result.numTotalTests, pid: actual.pid, node: actual.node, installer: { npm: manager.stdout.trim(), peerChecks: true }, runtimePackages: actual.packages,
        crashes, syntheticOnly: true, realProviderDispatches: 0, externalNetworkAttempts: network.attempts })
      console.error(`Phase 2 ${process.version} / ${version}: passed including 18 crash cases / 36 processes`)
      await rm(host, { recursive: true, force: true })
    }
    const report = assertDelegationMatrix({ schemaVersion: 1, kind: 'adaptive-task-delegation-host-matrix', node: process.version, bundleDigest, syntheticOnly: true, realProviderDispatches: 0, externalNetworkAttempts: 0, reports }, versions, bundleDigest)
    if (reportPath) await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify(report))
  } finally { await rm(root, { recursive: true, force: true }) }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) { try { await main() } catch (error) { console.error(error.stack); process.exitCode = 1 } }
