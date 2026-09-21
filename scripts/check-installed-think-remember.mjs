#!/usr/bin/env node
/** Verify Think + Remember using fresh processes and actual installed package/host identities. */
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { runBoundedCommand } from './bounded-command.mjs'
import { scrubCanaryEnvironment } from './canary-environment.mjs'
import { runThinkRememberPhase } from './think-remember-lifecycle-fixture.mjs'

const SELF = fileURLToPath(import.meta.url)
const PHASES = ['write', 'resume', 'verify', 'faults']
const MODES = ['native', 'fallback']
const ENCODINGS = ['none', 'zstd']
export async function checkInstalledThinkRemember(profilePath, hostPath = profilePath) {
  const root = await mkdtemp(join(tmpdir(), 'think-remember-processes-'))
  const reports = []
  try {
    for (const mode of MODES) for (const compression of ENCODINGS) for (const phase of PHASES) {
      const fixtureRoot = join(root, `${mode}-${compression}`)
      const env = { ...scrubCanaryEnvironment(process.env), DSH_HOME: join(fixtureRoot, 'synthetic-home') }
      delete env.NODE_OPTIONS; delete env.NODE_PATH; delete env.CODEX_HOME
      const result = await runBoundedCommand(process.execPath, [SELF, '--phase', phase, fixtureRoot, compression, mode,
        resolve(profilePath), resolve(hostPath)], { cwd: root, env, timeoutMs: 30000 })
      if (result.error || result.cleanupError || result.status !== 0) throw new Error(`Think/Remember ${mode}/${compression}/${phase}: ${result.error?.message ?? result.cleanupError?.message ?? result.stderr}`)
      const report = JSON.parse(result.stdout.trim())
      assert.equal(report.phase, phase); assert.equal(report.mode, mode); assert.equal(report.compression, compression)
      assert.equal(report.syntheticOnly, true)
      if (phase === 'faults') assert.deepEqual(report.cases.map(item => item.scenario),
        ['cancel-compaction', 'pending-before-compaction', 'manual-after-compaction', 'decline', 'automatic-pressure', 'system-head-refresh'])
      assert.ok(Number.isSafeInteger(report.pid) && report.pid !== process.pid)
      reports.push(report)
    }
    assert.equal(new Set(reports.map(report => report.pid)).size, 16)
    return { syntheticOnly: true, freshProcesses: 16, encodings: ENCODINGS, modes: MODES, phases: PHASES, reports }
  } finally { await rm(root, { recursive: true, force: true }) }
}
if (process.argv[1] !== undefined && resolve(process.argv[1]) === SELF) {
  try {
    if (process.argv[2] === '--phase') {
      const [phase, root, compression, mode, profilePath, hostPath] = process.argv.slice(3)
      assert.ok(PHASES.includes(phase) && root && ENCODINGS.includes(compression) && MODES.includes(mode) && profilePath && hostPath && process.argv.length === 9)
      const from = (path, name) => import(pathToFileURL(createRequire(path).resolve(name)).href)
      const plugin = await from(profilePath, 'dsh-codex-connect')
      const report = await runThinkRememberPhase(phase, { root, mode, compression, plugin, importHost: name => from(hostPath, name) })
      process.stdout.write(`${JSON.stringify({ ...report, mode, compression, pid: process.pid })}\n`)
    } else {
      const defaultPath = resolve(dirname(SELF), '../package.json')
      assert.ok(process.argv.length <= 4, 'usage: check-installed-think-remember [profile-package.json] [host-package.json]')
      process.stdout.write(`${JSON.stringify(await checkInstalledThinkRemember(process.argv[2] ?? defaultPath, process.argv[3] ?? defaultPath))}\n`)
    }
  } catch (error) { process.stderr.write(`check-installed-think-remember: ${error instanceof Error ? error.stack : String(error)}\n`); process.exitCode = 1 }
}
