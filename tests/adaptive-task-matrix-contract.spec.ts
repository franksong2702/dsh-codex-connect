import { expect, it } from 'vitest'
import { recoveryCases, recoveryRuntimePackages, RC2_RECOVERY_RUNTIME_PACKAGES } from '../scripts/adaptive-task-recovery-contract.mjs'
// @ts-expect-error Plain Node matrix helper is outside the source build.
import { assertTaskMatrix, inspectTaskTestReport, TASK_HOST_CASES, TASK_IDENTITY_CASE, TASK_RUNTIME_PACKAGES } from '../scripts/adaptive-task-matrix-contract.mjs'

function report() {
  const cases = [...TASK_HOST_CASES, TASK_IDENTITY_CASE]
  return { success: true, numFailedTests: 0, numPendingTests: 0, numTodoTests: 0,
    numTotalTests: cases.length, numPassedTests: cases.length,
    testResults: [{ assertionResults: cases.map(title => ({ title, status: 'passed' })) }] }
}
it('requires the independent task contract including every host behavior and identity', () => {
  expect(inspectTaskTestReport(report()).tests).toBe(TASK_HOST_CASES.length + 1)
})
it.each(['missing', 'renamed', 'duplicated', 'skipped', 'failed'])('rejects %s task-matrix evidence even when the runner reports success', kind => {
  const data = report(); const cases = data.testResults[0]!.assertionResults
  if (kind === 'missing') cases.pop()
  if (kind === 'renamed') cases[0]!.title = 'unrelated passing test'
  if (kind === 'duplicated') cases[0]!.title = cases[1]!.title
  if (kind === 'skipped') cases[0]!.status = 'pending'
  if (kind === 'failed') cases[0]!.status = 'failed'
  expect(() => inspectTaskTestReport(data)).toThrow()
})

function rc2Matrix(): any {
  const version = '0.2.2-rc.2', bundleDigest = 'a'.repeat(64), cases = recoveryCases(version)
  return { schemaVersion: 1, kind: 'adaptive-task-host-matrix', bundleDigest, syntheticOnly: true,
    adaptiveTaskExercised: true, productionDefaultsChanged: false, realProviderDispatches: 0,
    reports: [{ version, bundleDigest, syntheticOnly: true, realProviderDispatches: 0, externalNetworkAttempts: 0,
      pid: 123, profile: 'recovery-only', automationExercised: false, cases, tests: cases.length + 1,
      runtimePackages: Object.fromEntries([...TASK_RUNTIME_PACKAGES, ...recoveryRuntimePackages(version)].map(name => [name, version])),
      piAiVersion: '0.85.1' }] }
}
it('requires all rc2 functional cases plus the real host identity in Phase 1', () => {
  const r = rc2Matrix()
  expect(assertTaskMatrix(r, ['0.2.2-rc.2'], r.bundleDigest)).toBe(r)
  const data = { success: true, numFailedTests: 0, numPendingTests: 0, numTodoTests: 0, numTotalTests: 34, numPassedTests: 34,
    testResults: [{ assertionResults: [...recoveryCases('0.2.2-rc.2'), TASK_IDENTITY_CASE].map(title => ({ title, status: 'passed' })) }] }
  expect(inspectTaskTestReport(data, '0.2.2-rc.2').tests).toBe(34)
  data.testResults[0]!.assertionResults.pop(); data.numTotalTests--; data.numPassedTests--
  expect(() => inspectTaskTestReport(data, '0.2.2-rc.2')).toThrow()
})
it.each(RC2_RECOVERY_RUNTIME_PACKAGES)('rejects missing or mixed rc2 Phase 1 %s', name => {
  for (const mutation of ['missing', 'mixed']) {
    const r = rc2Matrix()
    if (mutation === 'missing') delete r.reports[0].runtimePackages[name]
    else r.reports[0].runtimePackages[name] = '0.2.2-rc.1'
    expect(() => assertTaskMatrix(r, ['0.2.2-rc.2'], r.bundleDigest)).toThrow()
  }
})
