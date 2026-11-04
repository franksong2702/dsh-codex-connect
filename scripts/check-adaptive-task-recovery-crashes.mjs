/** Exact alpha.3 recovery boundary profile; never activates Task or sends model requests. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { readFile, mkdir, mkdtemp, rm, copyFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'tsdown'
import { runBoundedCommand } from './bounded-command.mjs'
import { scrubCanaryEnvironment } from './canary-environment.mjs'
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export async function checkRecoveryCrashes(host) {
  const root = await mkdtemp(join(tmpdir(), 'alpha3-recovery-boundaries-')), reports = []
  try {
    const out = join(root, 'bundle')
    await build({ config: false, entry: { worker: join(ROOT, 'scripts/adaptive-task-recovery-crash-fixture.ts') }, outDir: out,
      platform: 'node', target: 'es2024', format: 'esm', dts: false, clean: true, report: false, logLevel: 'silent', deps: { neverBundle: true } })
    const source = join(out, 'worker.mjs'), bundleSha256 = createHash('sha256').update(await readFile(source)).digest('hex')
    const worker = join(host, 'tests', 'recovery-worker.mjs'); await copyFile(source, worker)
    const require = createRequire(join(host, 'package.json'))
    for (const name of ['@deepseek-ai/dsh-agent', '@deepseek-ai/dsh-agent-loop', '@deepseek-ai/dsh-tools', '@deepseek-ai/dsh-tool-executor-native']) {
      assert.equal(JSON.parse(await readFile(require.resolve(name + '/package.json'), 'utf8')).version, '0.2.2-alpha.3')
    }
    for (const version of [1, 2]) for (const compression of ['none', 'zstd']) for (const cut of ['seed', 'stop', 'manual']) {
      const directory = join(root, `${version}-${compression}-${cut}`); await mkdir(directory)
      const phases = []
      for (const phase of ['write', 'read']) {
        const env = { ...scrubCanaryEnvironment(process.env), DSH_HOME: join(directory, 'synthetic-home'), DSH_TELEMETRY_MODE: 'DISABLED', OTEL_SDK_DISABLED: 'true' }
        delete env.NODE_OPTIONS; delete env.NODE_PATH
        const result = await runBoundedCommand(process.execPath, [worker, directory, String(version), compression, cut, phase],
          { cwd: host, env, timeoutMs: 30000, maxBuffer: 1024 * 1024 })
        assert.equal(result.error, undefined, `${phase} command error`); assert.equal(result.cleanupError, undefined)
        assert.equal(result.status, phase === 'write' ? 85 : 0, result.stderr)
        const receipt = JSON.parse(await readFile(join(directory, phase + '-receipt.json'), 'utf8'))
        assert.deepEqual({ version: receipt.version, compression: receipt.compression, cut: receipt.cut, phase: receipt.phase }, { version, compression, cut, phase })
        assert.equal(receipt.passed, true); assert.equal(receipt.calls, 0); assert.equal(receipt.children, 0); assert.equal(receipt.externalNetworkAttempts, 0)
        assert.ok(Number.isSafeInteger(receipt.pid) && receipt.pid > 0)
        if (phase === 'write') assert.equal(receipt.abruptExit, 85)
        phases.push(receipt)
      }
      assert.notEqual(phases[0].pid, phases[1].pid)
      reports.push({ version, compression, cut, phases, passed: true, recoveryFetches: 0, recoveryChildCreates: 0,
        oldEpochRejected: version === 2, cleanup: 'verified' })
    }
    assert.equal(new Set(reports.flatMap(row => row.phases.map(p => p.pid))).size, 24)
    return { profile: 'alpha3-recovery-only', passed: true, syntheticOnly: true, cases: 12, freshProcesses: 24,
      node: process.version, bundleSha256, reports, externalNetworkAttempts: 0, realProviderRequests: 0 }
  } finally { await rm(root, { recursive: true, force: true }) }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { assert.equal(process.argv.length, 3); console.log(JSON.stringify(await checkRecoveryCrashes(resolve(process.argv[2])))) }
  catch (error) { console.error(error); process.exitCode = 1 }
}
