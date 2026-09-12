#!/usr/bin/env node
/** Independent Split matrix. Does not relabel Remember coverage or install into any active profile. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runBoundedCommand } from './bounded-command.mjs'
import { scrubCanaryEnvironment } from './canary-environment.mjs'
import { exactDshFixtureManifest, readDshRegistryManifest, resolveExactDshOverrides } from './exact-dsh-fixture.mjs'
import { SPLIT_HOST_SCENARIOS } from './split-host-fixture.mjs'
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const hash = value => createHash('sha256').update(value).digest('hex')
export const SPLIT_RUNTIME_PACKAGES = Object.freeze(['@deepseek-ai/dsh-agent', '@deepseek-ai/dsh-agent-loop', '@deepseek-ai/dsh-tools', '@deepseek-ai/dsh-subagent', '@deepseek-ai/dsh-subagent-spawn-in-process', '@deepseek-ai/dsh-subagent-in-process-driver', '@deepseek-ai/dsh-llm-pi-ai'])
export function validateSplitMatrix(reports, versions) {
  assert.ok(versions.length > 0 && new Set(versions).size === versions.length)
  assert.equal(reports.length, versions.length)
  const digests = new Set()
  const pids = new Set()
  for (const [index, report] of reports.entries()) {
    assert.equal(report.schemaVersion, 1)
    assert.equal(report.kind, 'split-internal-experiment')
    assert.equal(report.dshVersion, versions[index])
    assert.equal(report.syntheticOnly, true)
    assert.equal(report.realProviderDispatches, 0)
    assert.equal(report.productionEntryEnabled, false)
    assert.equal(report.freshProcesses, 1)
    assert.ok(Number.isSafeInteger(report.pid) && report.pid > 0)
    assert.ok(/^[a-f0-9]{64}$/u.test(report.bundleDigest))
    assert.ok(report.exactDshPackages >= 7)
    assert.deepEqual(Object.keys(report.runtimePackages).sort(), [...SPLIT_RUNTIME_PACKAGES].sort())
    assert.ok(Object.values(report.runtimePackages).every(value => value === report.dshVersion))
    assert.deepEqual(report.scenarios.map(result => result.scenario), SPLIT_HOST_SCENARIOS)
    assert.ok(report.scenarios.every(result => result.passed === true && result.syntheticOnly === true))
    digests.add(report.bundleDigest); pids.add(report.pid)
  }
  assert.equal(digests.size, 1, 'all hosts must exercise identical internal bundle bytes')
  assert.equal(pids.size, versions.length, 'every host must run in a distinct process')
}
async function main() {
  const argv = process.argv.slice(2)
  assert.ok(argv.length === 0 || (argv.length === 2 && argv[0] === '--report'), 'usage: check-split-matrix [--report relative-path]')
  const reportPath = argv[1] === undefined ? undefined : resolve(ROOT, argv[1])
  if (reportPath) assert.ok(reportPath.startsWith(`${ROOT}/docs/experiments/`) && reportPath.endsWith('.json'))
  const compatibility = JSON.parse(await readFile(join(ROOT, 'compatibility.json'), 'utf8'))
  const pkg = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'))
  const versions = compatibility.dshPluginApi.versions
  const root = await mkdtemp(join(tmpdir(), 'dsh-split-matrix-'))
  const reports = []
  try {
    const bundleRoot = join(root, 'bundle')
    const { build } = await import('tsdown')
    await build({ config: false, entry: { experiment: join(ROOT, 'scripts/split-experiment-entry.ts') }, outDir: bundleRoot,
      platform: 'node', target: 'es2024', format: 'esm', dts: false, clean: true, report: false, logLevel: 'silent',
      deps: { neverBundle: true }, define: { __CODEX_CONNECT_VERSION__: JSON.stringify(pkg.version) } })
    const names = (await readdir(bundleRoot)).sort()
    assert.ok(names.length > 0 && names.every(name => /\.m?js$/u.test(name)))
    const bundleManifest = []
    for (const name of names) bundleManifest.push([name, hash(await readFile(join(bundleRoot, name)))])
    const bundleDigest = hash(JSON.stringify(bundleManifest))
    for (const version of versions) {
      process.stderr.write(`Checking Split on exact DSH ${version}\n`)
      const host = join(root, version)
      await mkdir(host)
      const overrides = await resolveExactDshOverrides(version, readDshRegistryManifest)
      const manifest = exactDshFixtureManifest(overrides)
      // Pin the experiment's direct provider import to the exact host adapter's declared dependency.
      const adapter = await readDshRegistryManifest('@deepseek-ai/dsh-llm-pi-ai', version)
      const piRange = adapter.dependencies?.['@earendil-works/pi-ai']
      assert.equal(typeof piRange, 'string')
      manifest.dependencies['@earendil-works/pi-ai'] = piRange
      manifest.dependencies.undici = pkg.dependencies.undici
      process.stderr.write(`Resolved ${Object.keys(overrides).length} exact DSH packages; installing ${version}\n`)
      await writeFile(join(host, 'package.json'), JSON.stringify(manifest))
      const env = { ...scrubCanaryEnvironment(process.env), HOME: join(host, 'home'), DSH_HOME: join(host, 'synthetic-home'),
        DSH_TELEMETRY_MODE: 'DISABLED', OTEL_SDK_DISABLED: 'true', npm_config_userconfig: join(host, 'empty.npmrc'), npm_config_cache: join(root, 'npm-cache') }
      delete env.NODE_OPTIONS; delete env.NODE_PATH; delete env.CODEX_HOME
      await mkdir(env.HOME)
      await writeFile(env.npm_config_userconfig, '')
      const installed = await runBoundedCommand(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false', '--registry=https://registry.npmjs.org'], { cwd: host, env, timeoutMs: 10 * 60 * 1000 })
      if (installed.error || installed.status !== 0) throw new Error(`Split ${version} isolated install failed: ${installed.error?.message ?? installed.stderr.slice(-2000)}`)
      process.stderr.write(`Installed ${version}; running ${SPLIT_HOST_SCENARIOS.length} Split scenarios\n`)
      await mkdir(join(host, 'experiment'))
      for (const name of names) await copyFile(join(bundleRoot, name), join(host, 'experiment', name))
      const result = await runBoundedCommand(process.execPath, ['--experimental-import-meta-resolve', join(ROOT, 'scripts/check-split-host.mjs'), join(host, 'package.json'), version, bundleDigest], { cwd: host, env, timeoutMs: 90000, maxBuffer: 2 * 1024 * 1024 })
      if (result.error || result.status !== 0) throw new Error(`Split ${version} failed: ${result.error?.message ?? result.stderr.slice(-5000)}`)
      reports.push(JSON.parse(result.stdout.trim()))
      process.stderr.write(`Passed Split ${version}: ${SPLIT_HOST_SCENARIOS.length} scenarios in one fresh process\n`)
      await rm(host, { recursive: true, force: true })
    }
    validateSplitMatrix(reports, versions)
    const report = { schemaVersion: 1, kind: 'split-internal-experiment-matrix', sameBundle: true, bundleDigest,
      realProviderDispatches: 0, freshProcesses: reports.length, scenarioExecutions: reports.length * SPLIT_HOST_SCENARIOS.length, reports }
    if (reportPath) await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`)
    console.log(JSON.stringify(report))
  } finally { await rm(root, { recursive: true, force: true }) }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await main() } catch (error) { console.error(error.stack); process.exitCode = 1 }
}
