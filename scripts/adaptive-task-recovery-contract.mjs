/** Explicit replacement contract for one exact Host; never a generic version skip. */
import assert from 'node:assert/strict'
/** Exact Hosts with the verified subagent-owned recovery query. */
export function isSubagentRecoveryHost(version) { return version === '0.2.2-rc.2' || version === '0.2.2-rc.3' }
export const RECOVERY_HOST = '0.2.2-alpha.3'
export function isRecoveryHost(version) { return version === RECOVERY_HOST || version === '0.2.2-rc.1' || isSubagentRecoveryHost(version) }
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
  ...['interrupted', 'manual'].map(mode => `recovery v2 rejects managed non-Codex descendants after ${mode} root binding`),
])
export const RC2_RECOVERY_CASES = Object.freeze([
  'rc2 orphan with its own v2 ledger never falls through to the legacy provider',
  'rc2 disposed durable ancestor v2 never becomes an ordinary child request',
  'rc2 missing optional ownership service with no v2 state leaves ordinary requests alone',
  'rc2 unmanaged delegated agent without any v2 state is not blocked by a Task hook',
  'rc2 missing ownership service with a live v2 ledger refuses ambiguous dispatch',
  'rc2 unrelated non-Codex ordinary turn is not intercepted by retained Task state',
  'rc2 revalidates the exact live caller after asynchronous empty-state reads',
])

export const RECOVERY_RUNTIME_PACKAGES = Object.freeze([
  '@deepseek-ai/dsh-tool-executor-native', '@deepseek-ai/dsh-client-connection',
  '@deepseek-ai/dsh-host-webserver', '@deepseek-ai/dsh-api-session-controller',
])
export const RC2_RECOVERY_RUNTIME_PACKAGES = Object.freeze([
  '@deepseek-ai/dsh-subagent', '@deepseek-ai/dsh-working-directory', '@deepseek-ai/dsh-fs-local',
])
export function recoveryCases(version) {
  assert.ok(isRecoveryHost(version), 'Unverified recovery Host')
  return isSubagentRecoveryHost(version) ? [...RECOVERY_CASES, ...RC2_RECOVERY_CASES] : [...RECOVERY_CASES]
}
export function recoveryRuntimePackages(version) {
  assert.ok(isRecoveryHost(version), 'Unverified recovery Host')
  return [...RECOVERY_RUNTIME_PACKAGES, ...(isSubagentRecoveryHost(version) ? RC2_RECOVERY_RUNTIME_PACKAGES : [])]
}

export function inspectRecoveryReport(report, version = RECOVERY_HOST) {
  assert.equal(report.success, true); assert.equal(report.numFailedTests, 0)
  assert.equal(report.numPendingTests, 0); assert.equal(report.numTodoTests, 0)
  const cases = [...recoveryCases(version), 'uses the exact isolated host without a neighboring runtime']
  const results = report.testResults.flatMap(suite => suite.assertionResults)
  assert.deepEqual(results.map(row => row.title).sort(), [...cases].sort())
  assert.ok(results.every(row => row.status === 'passed'))
  assert.equal(report.numTotalTests, cases.length); assert.equal(report.numPassedTests, cases.length)
  return { cases: recoveryCases(version), tests: cases.length, profile: 'recovery-only', automationExercised: false }
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
