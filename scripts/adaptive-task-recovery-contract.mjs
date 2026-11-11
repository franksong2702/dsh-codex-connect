/** Explicit replacement contract for one exact Host; never a generic version skip. */
import assert from 'node:assert/strict'
export const RECOVERY_HOST = '0.2.2-alpha.3'
export function isRecoveryHost(version) { return version === RECOVERY_HOST || version === '0.2.2-rc.1' }
export function recoveryCordisVersion(version) {
  assert.ok(isRecoveryHost(version), 'Unverified recovery Host')
  return version === RECOVERY_HOST ? '4.0.6-alpha.2' : '4.1.0'
}
export const RECOVERY_CASES = Object.freeze([
  ...[1, 2].flatMap(v => [
    `alpha3 v${v} reads old state without requests or new authority`,
    `alpha3 v${v} rejects stale and direct activation without mutation`,
    `alpha3 v${v} blocks old automatic dispatch before the model`,
    `alpha3 v${v} preserves owner and revision checks on safety exits`,
    `alpha3 v${v} stops and preserves spent counters`,
    `alpha3 v${v} manual takeover permits only an ordinary explicit model`,
    `alpha3 v${v} serializes concurrent exits and survives runtime reload`,
    `alpha3 v${v} refuses missing or corrupt retained state without dispatch`,
    `alpha3 v${v} preserves ordinary work in another live root`,
    `alpha3 v${v} keeps signed Host HTTP ownership and safety exits`,
  ]),
  'alpha3 refuses direct evidence-child creation before removed presentation APIs',
  'alpha3 cancellation of ordinary manual work never restores Task authority or refunds counters',
  'alpha3 cold ledger cleanup requires actual absence of live children and keeps delivery unconfirmed',
  'alpha3 never claims cleanup of a still-live owned child',
])
export function inspectRecoveryReport(report) {
  assert.equal(report.success, true); assert.equal(report.numFailedTests, 0)
  assert.equal(report.numPendingTests, 0); assert.equal(report.numTodoTests, 0)
  const cases = [...RECOVERY_CASES, 'uses the exact isolated host without a neighboring runtime']
  const results = report.testResults.flatMap(suite => suite.assertionResults)
  assert.deepEqual(results.map(row => row.title).sort(), [...cases].sort())
  assert.ok(results.every(row => row.status === 'passed'))
  assert.equal(report.numTotalTests, cases.length); assert.equal(report.numPassedTests, cases.length)
  return { cases: [...RECOVERY_CASES], tests: cases.length, profile: 'recovery-only', automationExercised: false }
}
export function assertRecoveryCrashes(report) {
  assert.equal(report.profile, 'alpha3-recovery-only'); assert.equal(report.passed, true)
  assert.equal(report.syntheticOnly, true); assert.equal(report.cases, 12); assert.equal(report.freshProcesses, 24)
  assert.equal(report.externalNetworkAttempts, 0); assert.equal(report.realProviderRequests, 0)
  assert.match(report.bundleSha256, /^[a-f0-9]{64}$/u)
  assert.equal(report.reports.length, 12)
  const expected = [1, 2].flatMap(v => ['none', 'zstd'].flatMap(c => ['seed', 'stop', 'manual'].map(cut => `${v}/${c}/${cut}`)))
  assert.deepEqual(report.reports.map(row => `${row.version}/${row.compression}/${row.cut}`), expected)
  const pids = new Set()
  for (const row of report.reports) {
    assert.equal(row.passed, true); assert.equal(row.recoveryFetches, 0); assert.equal(row.recoveryChildCreates, 0)
    assert.equal(row.oldEpochRejected, row.version === 2); assert.equal(row.cleanup, 'verified')
    assert.deepEqual(row.phases.map(p => p.phase), ['write', 'read'])
    for (const phase of row.phases) {
      assert.equal(phase.version, row.version); assert.equal(phase.compression, row.compression); assert.equal(phase.cut, row.cut)
      assert.equal(phase.passed, true); assert.equal(phase.calls, 0); assert.equal(phase.children, 0); assert.equal(phase.externalNetworkAttempts, 0)
      assert.ok(Number.isSafeInteger(phase.pid) && phase.pid > 0); assert.ok(!pids.has(phase.pid)); pids.add(phase.pid)
      if (phase.phase === 'write') assert.equal(phase.abruptExit, 85)
    }
  }
  assert.equal(pids.size, 24)
}
