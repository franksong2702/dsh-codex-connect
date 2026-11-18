import { isRecoveryHost, recoveryCases, RECOVERY_CASES, recoveryRuntimePackages, inspectRecoveryReport } from './adaptive-task-recovery-contract.mjs'
import assert from 'node:assert/strict'

/** A matrix proves the installed Host and every saved-state recovery scenario. */
export const TASK_IDENTITY_CASE = 'uses the exact isolated host without a neighboring runtime'
export const TASK_RUNTIME_PACKAGES = Object.freeze([
  '@deepseek-ai/dsh-agent', '@deepseek-ai/dsh-agent-loop', '@deepseek-ai/dsh-llm',
  '@deepseek-ai/dsh-llm-pi-ai', '@deepseek-ai/dsh-session', '@deepseek-ai/dsh-session-projection',
  '@deepseek-ai/dsh-system-prompt', '@deepseek-ai/dsh-tools',
  '@deepseek-ai/dsh-settings',
  '@deepseek-ai/dsh-token-meter',
  '@deepseek-ai/dsh-compaction', '@deepseek-ai/dsh-compaction-basic',
  '@deepseek-ai/dsh-session-persistence', '@deepseek-ai/dsh-session-persistence-jsonl',
  '@deepseek-ai/dsh-atomic-write',
  '@deepseek-ai/dsh-home-paths',
  '@deepseek-ai/dsh-client-connection', '@deepseek-ai/dsh-host-webserver', '@deepseek-ai/dsh-api-session-controller',
])
const recoveryCasesForHost = version => isRecoveryHost(version) ? recoveryCases(version) : [...RECOVERY_CASES]

export function inspectTaskTestReport(report, version) {
  if (isRecoveryHost(version)) return inspectRecoveryReport(report, version)
  assert.equal(report.success, true, 'Task test process did not pass')
  assert.equal(report.numFailedTests, 0)
  assert.equal(report.numPendingTests, 0)
  assert.equal(report.numTodoTests, 0)
  const cases = [...recoveryCasesForHost(version), TASK_IDENTITY_CASE]
  assert.equal(report.numTotalTests, cases.length)
  assert.equal(report.numPassedTests, cases.length)
  const results = report.testResults.flatMap(suite => suite.assertionResults)
  assert.ok(results.every(result => result.status === 'passed'))
  assert.deepEqual(results.map(result => result.title).sort(), cases.sort())
  return { cases: recoveryCasesForHost(version), tests: results.length, profile: 'recovery-only', automationExercised: false }
}

export function assertTaskMatrix(report, versions, bundleDigest) {
  assert.equal(report.schemaVersion, 1)
  assert.equal(report.kind, 'adaptive-task-host-matrix')
  assert.equal(report.syntheticOnly, true)
  assert.equal(report.adaptiveTaskExercised, false)
  assert.equal(report.productionDefaultsChanged, false)
  assert.equal(report.realProviderDispatches, 0)
  assert.ok(versions.length > 0 && new Set(versions).size === versions.length)
  assert.ok(/^[a-f0-9]{64}$/u.test(bundleDigest))
  assert.equal(report.bundleDigest, bundleDigest)
  assert.equal(report.reports.length, versions.length)
  const pids = new Set()
  for (const [i, host] of report.reports.entries()) {
    assert.equal(host.version, versions[i])
    assert.equal(host.bundleDigest, bundleDigest)
    assert.equal(host.syntheticOnly, true)
    assert.equal(host.realProviderDispatches, 0)
    assert.equal(host.externalNetworkAttempts, 0)
    assert.ok(Number.isSafeInteger(host.pid) && host.pid > 0)
    pids.add(host.pid)
    const expected = recoveryCasesForHost(host.version)
    assert.deepEqual(host.cases, [...expected])
    assert.equal(host.tests, expected.length + 1)
    if (isRecoveryHost(host.version)) {
      assert.equal(host.profile, 'recovery-only'); assert.equal(host.automationExercised, false)
      for (const name of recoveryRuntimePackages(host.version)) assert.equal(host.runtimePackages[name], host.version)
    } else assert.equal(host.profile, 'recovery-only')
    for (const id of TASK_RUNTIME_PACKAGES) assert.equal(host.runtimePackages[id], host.version)
    assert.ok(Object.keys(host.runtimePackages).length >= TASK_RUNTIME_PACKAGES.length)
    assert.ok(Object.values(host.runtimePackages).every(version => version === host.version))
    assert.ok(typeof host.piAiVersion === 'string' && /^\d+\.\d+\.\d+$/u.test(host.piAiVersion))
  }
  assert.equal(pids.size, versions.length, 'each host needs a fresh test process')
  return report
}
