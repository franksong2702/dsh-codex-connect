#!/usr/bin/env node
/** Actual Chromium and signed host auth, explicitly assembled Phase 2 composition. */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { runBoundedCommand } from './bounded-command.mjs'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(join(root, 'package.json'))
const cli = join(dirname(require.resolve('vitest/package.json')), 'vitest.mjs')
const directory = await mkdtemp(join(tmpdir(), 'adaptive-task-delegation-ui-report-'))
try {
  const result = await runBoundedCommand(process.execPath, [cli, 'run', 'tests/adaptive-task-consent.spec.ts',
    '--reporter=json', '--outputFile', join(directory, 'report.json')], {
    cwd: root, timeoutMs: 120000, env: { ...process.env, ADAPTIVE_DELEGATION_UI: '1', OTEL_SDK_DISABLED: 'true' },
  })
  process.stdout.write(result.stdout); process.stderr.write(result.stderr)
  assert.equal(result.status, 0, 'Isolated authenticated Phase 2 control test failed')
  assert.equal(result.error, undefined); assert.equal(result.cleanupError, undefined)
  const report = JSON.parse(await readFile(join(directory, 'report.json'), 'utf8'))
  assert.equal(report.success, true)
  assert.equal(report.numTotalTests, 23); assert.equal(report.numPassedTests, 23)
  assert.equal(report.numPendingTests, 0); assert.equal(report.numTodoTests, 0)
  console.log(JSON.stringify({ kind: 'adaptive-task-delegation-authenticated-control', syntheticProvider: true,
    realHostAuthentication: true, explicitPhase2Composition: true, usesProductEntry: false,
    fullDailyProfileAcceptance: false, realProviderRequests: 0, passed: true }))
} finally { await rm(directory, { recursive: true, force: true }) }
