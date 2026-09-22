/** Own and kill one writer at a time, then verify recovery in a distinct, naturally exiting process. */
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, realpath, rm } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { build } from 'tsdown'
import { scrubCanaryEnvironment } from './canary-environment.mjs'
import { runBoundedCommand } from './bounded-command.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const args = process.argv.slice(2)
assert.ok(args.length === 0 || (args.length === 2 && args[0] === '--host'), 'usage: check-adaptive-task-delegation-crashes [--host isolated-host]')
const runtimeRoot = args[1] === undefined ? root : await realpath(args[1])
if (args[1] !== undefined) assert.equal(JSON.parse(await readFile(join(runtimeRoot, 'package.json'), 'utf8')).private, true, 'Requires a private disposable host')
const cache = join(runtimeRoot, 'node_modules/.cache')
await mkdir(cache, { recursive: true })
const directory = await realpath(await mkdtemp(join(cache, 'task-crash-matrix-')))
const stages = ['prepared', 'host-created-before-ledger-publish', 'published', 'child-reserved-before-fetch',
  'result-artifact-before-settle', 'settled-before-cleanup', 'cleaned-before-parent-tool-result',
  'parent-result-flushed-before-delivery', 'delivery-recorded']
const environment = scrubCanaryEnvironment(process.env), reports = []

async function killAtBarrier(entry, profile, stage, env) {
  const child = spawn(process.execPath, [entry, profile, 'write', stage], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] })
  let stdout = '', stderr = '', observed = false, failure, done = false
  // Install every lifecycle handler before a barrier can arrive, including the close promise.
  const closed = new Promise(resolve => {
    child.once('error', error => { failure = error })
    child.once('close', (code, signal) => { done = true; resolve({ code, signal }) })
  })
  const stop = () => { if (!done && child.pid !== undefined) child.kill('SIGKILL') }
  const timer = setTimeout(() => { failure = new Error(`Writer timed out at ${stage}`); stop() }, 20000)
  child.stderr.on('data', chunk => { stderr += chunk; if (stderr.length > 1024 * 1024) { failure = new Error('Writer stderr overflow'); stop() } })
  child.stdout.on('data', chunk => {
    stdout += chunk
    if (stdout.length > 1024 * 1024) { failure = new Error('Writer stdout overflow'); stop(); return }
    if (observed) return
    for (const line of stdout.split('\n').slice(0, -1)) {
      try {
        const value = JSON.parse(line)
        if (value.barrier !== stage || value.pid !== child.pid) continue
        observed = true; stop(); return
      } catch { /* host logs are not control messages */ }
    }
  })
  try {
    const result = await closed
    assert.equal(failure, undefined, failure?.message)
    assert.equal(observed, true, `Writer missed ${stage}: ${stderr}\n${stdout}`)
    assert.equal(result.signal, 'SIGKILL', `${stage}: ${stderr}`)
    return { pid: child.pid, signal: result.signal }
  } finally { clearTimeout(timer); stop(); await closed }
}

try {
  await build({ config: false, entry: { fixture: join(root, 'scripts/adaptive-task-delegation-crash-fixture.ts') },
    outDir: directory, platform: 'node', format: 'esm', target: 'es2024', dts: false,
    report: false, logLevel: 'silent', deps: { neverBundle: true } })
  const entry = join(directory, 'fixture.mjs')
  const bundleSha256 = createHash('sha256').update(await readFile(entry)).digest('hex')
  for (const compression of ['none', 'zstd']) for (const [index, stage] of stages.entries()) {
    const profile = await realpath(await mkdtemp(join(directory, `${compression}-${index}-`)))
    const env = { ...environment, DSH_HOME: join(profile, 'home'), OTEL_SDK_DISABLED: 'true', CRASH_COMPRESSION: compression }
    const writer = await killAtBarrier(entry, profile, stage, env)
    const recovery = await runBoundedCommand(process.execPath, [entry, profile, 'recover', stage], { cwd: root, env, timeoutMs: 20000 })
    assert.equal(recovery.error, undefined); assert.equal(recovery.cleanupError, undefined)
    assert.equal(recovery.status, 0, `${compression}/${stage}: ${recovery.stderr}`)
    const report = JSON.parse(recovery.stdout.trim().split('\n').at(-1))
    assert.equal(report.passed, true); assert.equal(report.stage, stage)
    assert.equal(report.writerPid, writer.pid); assert.notEqual(report.pid, writer.pid)
    assert.equal(report.node, process.version)
    assert.equal(report.recoveryFetches, 0); assert.equal(report.recoveryChildCreates, 0)
    assert.equal(report.oldEpochRejected, true); assert.equal(report.cleanup, 'verified')
    assert.equal(report.reserved, index < 3 ? 1 : index === 3 ? 2 : 3)
    assert.equal(report.attempts, index < 3 ? 0 : index === 3 ? 1 : 2)
    assert.equal(report.writerFetches, index <= 3 ? 1 : 3) // One reserved child attempt may never have reached transport.
    assert.equal(report.writerChildCreates, index === 0 ? 0 : 1)
    assert.equal(report.writerParentResults, index < 7 ? 0 : 1)
    assert.equal(report.beforeState, index < 2 ? 'prepared' : index < 5 ? 'running' : index === 5 ? 'settling' : 'succeeded')
    assert.equal(report.beforeDelivery, index < 6 ? 'none' : index < 8 ? 'pending' : 'recorded')
    assert.equal(report.state, index < 6 ? 'interrupted' : 'succeeded')
    assert.equal(report.delivery, index < 6 ? 'none' : index === 6 ? 'unknown' : 'recorded')
    reports.push({ compression, writerSignal: writer.signal, ...report })
  }
  const packages = {}
  for (const name of ['@deepseek-ai/dsh-agent-loop', '@deepseek-ai/dsh-session-persistence-jsonl', '@earendil-works/pi-ai']) {
    packages[name] = JSON.parse(await readFile(join(runtimeRoot, 'node_modules', name, 'package.json'), 'utf8')).version
  }
  console.log(JSON.stringify({ kind: 'task-delegation-independent-crash-matrix', passed: true, bundleSha256,
    node: process.version, packages, stages: stages.length, encodings: 2, cases: reports.length,
    freshProcesses: reports.length * 2, syntheticOnly: true, reports }))
} finally { await rm(directory, { recursive: true, force: true }) }
