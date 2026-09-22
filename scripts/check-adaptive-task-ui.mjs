#!/usr/bin/env node
/** Real Chromium -> DSH signed browser auth -> actual product endpoint. No real model. */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runBoundedCommand } from './bounded-command.mjs'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(join(root, 'package.json'))
const cli = join(dirname(require.resolve('vitest/package.json')), 'vitest.mjs')
const result = await runBoundedCommand(process.execPath, [cli, 'run', 'tests/adaptive-task-http.spec.ts'], {
  cwd: root, timeoutMs: 120000, env: { ...process.env, ADAPTIVE_TASK_UI: '1', OTEL_SDK_DISABLED: 'true' },
})
process.stdout.write(result.stdout); process.stderr.write(result.stderr)
assert.equal(result.status, 0, 'Actual authenticated task-control test failed')
assert.equal(result.error, undefined); assert.equal(result.cleanupError, undefined)
assert.ok(result.stdout.includes('5 tests'), 'Expected four HTTP tests and the actual Chromium flow')
console.log(JSON.stringify({ kind: 'adaptive-task-authenticated-control', syntheticProvider: true,
  realHostAuthentication: true, realProductEndpoint: true, realProductControl: true,
  fullDailyProfileAcceptance: false, realProviderRequests: 0, passed: true }))
