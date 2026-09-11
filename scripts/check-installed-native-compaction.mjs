#!/usr/bin/env node
/** Exercise installed native checkpoints across genuinely separate Node processes. */
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { runBoundedCommand } from './bounded-command.mjs'
import { runNativeLifecyclePhase } from './native-compaction-lifecycle-fixture.mjs'

const SELF = fileURLToPath(import.meta.url)
const PHASES = ['write', 'resume-fork', 'verify-child', 'failure-paths']

/** Test both physical JSONL encodings, with no memory shared across lifecycle transitions. */
export async function checkInstalledNativeCompaction(profilePath, hostPath = profilePath) {
  const root = await mkdtemp(join(tmpdir(), 'codex-installed-native-lifecycle-'))
  const reports = []
  try {
    for (const compression of ['none', 'zstd']) {
      for (const phase of PHASES) {
        const fixtureRoot = join(root, compression)
        const result = await runBoundedCommand(process.execPath, [SELF, '--phase', phase, fixtureRoot, compression, resolve(profilePath), resolve(hostPath)], {
          cwd: root, env: { ...process.env, DSH_HOME: join(fixtureRoot, 'synthetic-home') }, timeoutMs: 30_000,
        })
        if (result.error !== undefined || result.status !== 0) {
          throw new Error(`native lifecycle ${compression}/${phase} failed: ${result.error?.message ?? result.stderr ?? 'child failed'}`)
        }
        const report = JSON.parse(result.stdout.trim())
        assert.equal(report.phase, phase)
        assert.equal(report.compression, compression)
        assert.ok(Number.isSafeInteger(report.pid) && report.pid !== process.pid)
        reports.push(report)
      }
    }
    assert.equal(new Set(reports.map(report => report.pid)).size, reports.length)
    return { syntheticOnly: true, freshProcesses: reports.length, encodings: ['none', 'zstd'], phases: PHASES, reports }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === SELF) {
  try {
    if (process.argv[2] === '--phase') {
      const [phase, root, compression, profilePath, hostPath] = process.argv.slice(3)
      assert.ok(PHASES.includes(phase) && root && ['none', 'zstd'].includes(compression) && profilePath && hostPath && process.argv.length === 8)
      const from = (path, specifier) => import(pathToFileURL(createRequire(path).resolve(specifier)).href)
      const plugin = await from(profilePath, 'dsh-codex-connect')
      const report = await runNativeLifecyclePhase(phase, { root, compression, plugin, importHost: specifier => from(hostPath, specifier) })
      process.stdout.write(`${JSON.stringify({ ...report, compression, pid: process.pid })}\n`)
    } else {
      assert.ok(process.argv[2] && process.argv.length <= 4, 'usage: check-installed-native-compaction <profile-package.json> [host-package.json]')
      process.stdout.write(`${JSON.stringify(await checkInstalledNativeCompaction(process.argv[2], process.argv[3]))}\n`)
    }
  } catch (error) {
    process.stderr.write(`check-installed-native-compaction: ${error instanceof Error ? error.stack : String(error)}\n`)
    process.exitCode = 1
  }
}
