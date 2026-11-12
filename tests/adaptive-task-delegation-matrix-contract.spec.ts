import { expect, it } from 'vitest'
import { recoveryCases, recoveryRuntimePackages, RC2_RECOVERY_RUNTIME_PACKAGES } from '../scripts/adaptive-task-recovery-contract.mjs'
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

function rc2Matrix(): any {
  const version = '0.2.2-rc.2', node = 'v24.13.0'
  const cases = [...recoveryCases(version), 'uses the exact isolated host without a neighboring runtime'].sort()
  let pid = 1
  const crashes = { profile: 'alpha3-recovery-only', node, passed: true, syntheticOnly: true, cases: 12, freshProcesses: 24,
    externalNetworkAttempts: 0, realProviderRequests: 0, bundleSha256: digest,
    reports: [1, 2].flatMap(v => ['none', 'zstd'].flatMap(compression => ['seed', 'stop', 'manual'].map(cut => ({
      version: v, compression, cut, passed: true, recoveryFetches: 0, recoveryChildCreates: 0,
      oldEpochRejected: v === 2, cleanup: 'verified', phases: ['write', 'read'].map(phase => ({
        version: v, compression, cut, phase, pid: pid++, passed: true, calls: 0, children: 0, externalNetworkAttempts: 0,
        ...(phase === 'write' ? { abruptExit: 85 } : {}),
      })),
    })))) }
  return { schemaVersion: 1, kind: 'adaptive-task-delegation-host-matrix', node, bundleDigest: digest,
    syntheticOnly: true, realProviderDispatches: 0, externalNetworkAttempts: 0,
    reports: [{ version, node, bundleDigest: digest, syntheticOnly: true, realProviderDispatches: 0, externalNetworkAttempts: 0,
      cases, tests: cases.length, pid: 100, profile: 'recovery-only', crashes,
      runtimePackages: { ...Object.fromEntries([...PHASE2_RUNTIME_PACKAGES, ...recoveryRuntimePackages(version)].map(name => [name, version])),
        '@earendil-works/pi-ai': '0.85.1' } }] }
}
it('requires all rc2 functional cases, real identity and crash boundaries in Phase 2', () => {
  const r = rc2Matrix()
  expect(assertDelegationMatrix(r, ['0.2.2-rc.2'], digest)).toBe(r)
  const data = { success: true, numFailedTests: 0, numPendingTests: 0, numTodoTests: 0, numTotalTests: 32, numPassedTests: 32,
    testResults: [{ assertionResults: r.reports[0].cases.map((title: string) => ({ title, status: 'passed' })) }] }
  expect(inspectDelegationMatrixReport(data, '0.2.2-rc.2')).toHaveLength(32)
  data.testResults[0]!.assertionResults.pop(); data.numTotalTests--; data.numPassedTests--
  expect(() => inspectDelegationMatrixReport(data, '0.2.2-rc.2')).toThrow()
})
it.each(RC2_RECOVERY_RUNTIME_PACKAGES)('rejects missing or mixed rc2 Phase 2 %s', name => {
  for (const mutation of ['missing', 'mixed']) {
    const r = rc2Matrix()
    if (mutation === 'missing') delete r.reports[0].runtimePackages[name]
    else r.reports[0].runtimePackages[name] = '0.2.2-rc.1'
    expect(() => assertDelegationMatrix(r, ['0.2.2-rc.2'], digest)).toThrow()
  }
})
