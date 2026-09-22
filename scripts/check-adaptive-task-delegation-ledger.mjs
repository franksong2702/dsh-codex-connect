/** Real process replacement after a durable child debit; no host/model integration claim. */
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { build } from 'tsdown'
import { runBoundedCommand } from './bounded-command.mjs'
import { scrubCanaryEnvironment } from './canary-environment.mjs'
const root = fileURLToPath(new URL('../', import.meta.url))
const cache = join(root, 'node_modules/.cache'); await mkdir(cache, { recursive: true })
const directory = await mkdtemp(join(cache, 'task-ledger-cold-'))
try {
  await build({ config: false, entry: { fixture: join(root, 'scripts/adaptive-task-delegation-ledger-fixture.ts') },
    outDir: directory, platform: 'node', format: 'esm', target: 'es2024', dts: false, report: false, logLevel: 'silent', deps: { neverBundle: true } })
  const entry = join(directory, 'fixture.mjs'), reports = []
  for (const phase of ['write', 'recover']) {
    const result = await runBoundedCommand(process.execPath, [entry, directory, phase], {
      cwd: root, timeoutMs: 20000, env: { ...scrubCanaryEnvironment(process.env), DSH_HOME: join(directory, 'empty-home') },
    })
    assert.equal(result.error, undefined); assert.equal(result.cleanupError, undefined)
    assert.equal(result.status, 0, result.stderr)
    const report = JSON.parse(result.stdout.trim().split('\n').at(-1))
    assert.equal(report.phase, phase); assert.equal(report.reserved, 3); assert.equal(report.realProviderRequests, 0)
    reports.push(report)
  }
  assert.notEqual(reports[0].pid, reports[1].pid)
  console.log(JSON.stringify({ kind: 'task-delegation-ledger-cold-recovery', passed: true,
    bundleSha256: createHash('sha256').update(await readFile(entry)).digest('hex'), freshProcesses: 2, reports }))
} finally { await rm(directory, { recursive: true, force: true }) }
