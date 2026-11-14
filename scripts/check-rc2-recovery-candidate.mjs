/** Exact subagent-ownership recovery probe; not a release declaration. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile, copyFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'tsdown'
import { readTaskHostIdentity } from './check-adaptive-task-matrix.mjs'
import { TASK_RUNTIME_PACKAGES } from './adaptive-task-matrix-contract.mjs'
import { isSubagentRecoveryHost, recoveryCases, recoveryRuntimePackages, assertRecoveryCrashes } from './adaptive-task-recovery-contract.mjs'
import { checkRecoveryCrashes } from './check-adaptive-task-recovery-crashes.mjs'
import { runBoundedCommand } from './bounded-command.mjs'
import { scrubCanaryEnvironment } from './canary-environment.mjs'
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

async function main() {
  assert.ok(process.argv.length === 3 || process.argv.length === 4, 'usage: node scripts/check-rc2-recovery-candidate.mjs <isolated-host> [exact-version]')
  const version = process.argv[3] ?? '0.2.2-rc.2'
  assert.ok(isSubagentRecoveryHost(version), 'Unverified subagent ownership Host')
  const host = await realpath(resolve(process.argv[2]))
  const names = [...TASK_RUNTIME_PACKAGES, ...recoveryRuntimePackages(version)]
  const identity = await readTaskHostIdentity(host, version, names)
  const probe = await mkdtemp(join(host, '.codex-connect-rc2-probe-'))
  try {
    const bundle = join(probe, 'tests'); await mkdir(bundle)
    await build({ config: false, entry: {
      'adaptive-task-recovery.fixture': join(ROOT, 'tests/adaptive-task-recovery.fixture.ts'),
      'adaptive-task-rc2.fixture': join(ROOT, 'tests/adaptive-task-rc2.fixture.ts'),
    }, outDir: bundle, platform: 'node', target: 'es2024', format: 'esm', dts: false, clean: true,
      report: false, logLevel: 'silent', deps: { neverBundle: true }, define: { __CODEX_CONNECT_VERSION__: JSON.stringify(JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8')).version) } })
    const hashes = await Promise.all((await readdir(bundle)).sort().map(async name => [name, createHash('sha256').update(await readFile(join(bundle, name))).digest('hex')]))
    const bundleSha256 = createHash('sha256').update(JSON.stringify(hashes)).digest('hex')
    const require = createRequire(join(ROOT, 'package.json')), vitest = dirname(require.resolve('vitest/package.json'))
    await copyFile(join(ROOT, 'scripts/adaptive-task-delegation-network-guard.mjs'), join(probe, 'network-guard.mjs'))
    await writeFile(join(probe, 'vitest.config.mjs'), 'export default ' + JSON.stringify({ root: probe,
      resolve: { alias: [{ find: 'vitest', replacement: join(vitest, 'dist/index.js') }] },
      test: { include: ['tests/*.fixture.mjs'], setupFiles: [join(probe, 'network-guard.mjs')], pool: 'forks', maxWorkers: 1,
        fileParallelism: false, isolate: false, testTimeout: 30000, hookTimeout: 30000 } }))
    const env = { ...scrubCanaryEnvironment(process.env), DSH_HOME: join(probe, 'synthetic-home'), DSH_TELEMETRY_MODE: 'DISABLED',
      OTEL_SDK_DISABLED: 'true', TASK_MATRIX_ROOT: probe, TASK_MATRIX_VERSION: version }
    delete env.NODE_OPTIONS; delete env.NODE_PATH
    const result = await runBoundedCommand(process.execPath, [join(vitest, 'vitest.mjs'), 'run', '--config', join(probe, 'vitest.config.mjs'),
      '--reporter=json', '--outputFile', join(probe, 'tests.json')], { cwd: probe, env, timeoutMs: 180000, maxBuffer: 2 * 1024 * 1024 })
    assert.equal(result.error, undefined); assert.equal(result.cleanupError, undefined)
    assert.equal(result.status, 0, result.stdout + result.stderr)
    const report = JSON.parse(await readFile(join(probe, 'tests.json'), 'utf8'))
    assert.equal(report.success, true); assert.equal(report.numFailedTests, 0); assert.equal(report.numPendingTests, 0); assert.equal(report.numTodoTests, 0)
    const expected = recoveryCases(version).sort(), actual = report.testResults.flatMap(s => s.assertionResults)
    assert.equal(report.numTotalTests, expected.length); assert.equal(report.numPassedTests, expected.length)
    assert.deepEqual(actual.map(t => t.title).sort(), expected); assert.ok(actual.every(t => t.status === 'passed'))
    const network = JSON.parse(await readFile(join(probe, 'network.json'), 'utf8')); assert.equal(network.attempts, 0)
    await mkdir(join(host, 'tests'), { recursive: true })
    const crashes = await checkRecoveryCrashes(host); assertRecoveryCrashes(crashes)
    console.log(JSON.stringify({ schemaVersion: 1, kind: 'subagent-recovery-candidate', version,
      node: process.version, packages: identity.packages, bundleSha256, cases: expected, tests: actual.length, crashes,
      externalNetworkAttempts: 0, realProviderRequests: 0, syntheticOnly: true, publishedCatalogChanged: false }))
  } finally { await rm(probe, { recursive: true, force: true }) }
}
try { await main() } catch (error) { console.error(error); process.exitCode = 1 }
