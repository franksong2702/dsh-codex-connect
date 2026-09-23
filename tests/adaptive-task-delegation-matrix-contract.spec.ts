import { expect, it } from 'vitest'
// @ts-expect-error Plain Node matrix helper is outside the source build.
import { assertDelegationMatrix, inspectDelegationMatrixReport, PHASE2_REQUIRED_CASES, PHASE2_RUNTIME_PACKAGES } from '../scripts/adaptive-task-delegation-matrix-contract.mjs'

const versions = ['0.1.2-rc.1', '0.1.5-alpha.1', '0.1.5-rc.1', '0.1.5-rc.2']
const digest = 'a'.repeat(64)
const testReport = () => ({ success: true, numFailedTests: 0, numPendingTests: 0, numTodoTests: 0,
  numTotalTests: PHASE2_REQUIRED_CASES.length, numPassedTests: PHASE2_REQUIRED_CASES.length,
  testResults: [{ assertionResults: PHASE2_REQUIRED_CASES.map((title: string) => ({ title, status: 'passed' })) }] })
const matrix = (): any => ({ schemaVersion: 1, kind: 'adaptive-task-delegation-host-matrix', node: 'v24.13.0', bundleDigest: digest,
  syntheticOnly: true, realProviderDispatches: 0, externalNetworkAttempts: 0, reports: versions.map((version, index) => ({
    version, bundleDigest: digest, node: 'v24.13.0', syntheticOnly: true, realProviderDispatches: 0, externalNetworkAttempts: 0,
    cases: PHASE2_REQUIRED_CASES, tests: PHASE2_REQUIRED_CASES.length, pid: index + 1,
    runtimePackages: { ...Object.fromEntries(PHASE2_RUNTIME_PACKAGES.map((name: string) => [name, version])), '@earendil-works/pi-ai': '0.84.4' },
    crashes: { passed: true, node: 'v24.13.0', cases: 18, freshProcesses: 36, bundleSha256: digest,
      reports: Array.from({ length: 18 }, () => ({ passed: true, recoveryFetches: 0, recoveryChildCreates: 0, oldEpochRejected: true, cleanup: 'verified' })) },
  })) })
it('requires every named Phase 2 case and accurate totals without skip or todo', () => {
  expect(inspectDelegationMatrixReport(testReport())).toEqual(PHASE2_REQUIRED_CASES)
  for (const key of ['numFailedTests', 'numPendingTests', 'numTodoTests']) expect(() => inspectDelegationMatrixReport({ ...testReport(), [key]: 1 })).toThrow()
  const missing = testReport(); missing.testResults[0]!.assertionResults.pop()
  missing.numTotalTests--; missing.numPassedTests--
  expect(() => inspectDelegationMatrixReport(missing)).toThrow()
})
it('accepts four complete exact hosts with identical source and crash evidence', () => {
  const report = matrix(); expect(assertDelegationMatrix(report, versions, digest)).toBe(report)
})
it('accepts one declared exact host when the current compatibility matrix has one version', () => {
  const report = matrix()
  report.reports = report.reports.slice(0, 1)
  expect(assertDelegationMatrix(report, versions.slice(0, 1), digest)).toBe(report)
})
it.each(['missing-package', 'mixed-runtime', 'node', 'network', 'digest', 'case', 'pid', 'crash-count', 'crash-replay'])('rejects incomplete or mismatched %s evidence', kind => {
  const report = matrix(), host = report.reports[1]
  if (kind === 'missing-package') delete host.runtimePackages[PHASE2_RUNTIME_PACKAGES[0]]
  if (kind === 'mixed-runtime') host.runtimePackages[PHASE2_RUNTIME_PACKAGES[0]] = 'unrelated'
  if (kind === 'node') host.node = 'v22.19.0'
  if (kind === 'network') host.externalNetworkAttempts = 1
  if (kind === 'digest') host.bundleDigest = 'b'.repeat(64)
  if (kind === 'case') host.cases = host.cases.slice(1)
  if (kind === 'pid') host.pid = report.reports[0].pid
  if (kind === 'crash-count') host.crashes.freshProcesses = 35
  if (kind === 'crash-replay') host.crashes.reports[0].recoveryFetches = 1
  expect(() => assertDelegationMatrix(report, versions, digest)).toThrow()
})
