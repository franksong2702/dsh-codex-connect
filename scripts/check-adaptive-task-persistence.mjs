#!/usr/bin/env node
/** Task authorization/accounting survives actual process replacement, not just a new JS object. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, rm, readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'tsdown'
import { runBoundedCommand } from './bounded-command.mjs'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const cache = join(root, 'node_modules/.cache'); await mkdir(cache, { recursive: true })
const workspace = await mkdtemp(join(cache, 'adaptive-task-persistence-'))
const reports = []
try {
  await build({ config: false, entry: { fixture: join(root, 'scripts/adaptive-task-persistence-fixture.ts') }, outDir: workspace,
    platform: 'node', format: 'esm', target: 'es2024', dts: false, report: false, logLevel: 'silent', deps: { neverBundle: true } })
  const entry = join(workspace, 'fixture.mjs')
  const digest = createHash('sha256').update(await readFile(entry)).digest('hex')
  for (const compression of ['none', 'zstd']) for (const phase of ['write', 'resume']) {
    const result = await runBoundedCommand(process.execPath, [entry, join(workspace, compression), phase, compression], {
      cwd: root, timeoutMs: 45000, env: { ...process.env, DSH_TELEMETRY_MODE: 'DISABLED', OTEL_SDK_DISABLED: 'true' },
    })
    assert.equal(result.error, undefined); assert.equal(result.cleanupError, undefined)
    assert.equal(result.status, 0, result.stderr.slice(-4000))
    const report = JSON.parse(result.stdout.trim().split('\n').at(-1))
    assert.equal(report.phase, phase); assert.equal(report.compression, compression)
    assert.equal(report.syntheticOnly, true); assert.equal(report.realProviderRequests, 0)
    reports.push(report)
  }
  assert.equal(new Set(reports.map(report => report.pid)).size, 4)
  console.log(JSON.stringify({ kind: 'adaptive-task-cold-process-lifecycle', passed: true, bundleSha256: digest, freshProcesses: 4, reports }))
} finally { await rm(workspace, { recursive: true, force: true }) }
