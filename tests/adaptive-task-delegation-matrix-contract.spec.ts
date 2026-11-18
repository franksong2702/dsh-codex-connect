import { expect, it } from 'vitest'
import { recoveryCases, RECOVERY_CASES, recoveryRuntimePackages, RC2_RECOVERY_RUNTIME_PACKAGES } from '../scripts/adaptive-task-recovery-contract.mjs'
// @ts-expect-error Plain Node matrix helper is outside the source build.
import { assertDelegationMatrix, inspectDelegationMatrixReport, PHASE2_REQUIRED_CASES, PHASE2_RUNTIME_PACKAGES } from '../scripts/adaptive-task-delegation-matrix-contract.mjs'

const versions = ['0.1.2-rc.1', '0.1.5-alpha.1', '0.1.5-rc.1', '0.1.5-rc.2']
const digest = 'a'.repeat(64)
let nextPid = 1
const crashes = () => ({ passed: true, profile: 'alpha3-recovery-only', syntheticOnly: true, node: 'v24.13.0', cases: 12, freshProcesses: 24, externalNetworkAttempts: 0, realProviderRequests: 0, bundleSha256: digest,
  reports: [1, 2].flatMap(v => ['none', 'zstd'].flatMap(compression => ['seed', 'stop', 'manual'].map(cut => ({ version: v, compression, cut, passed: true, recoveryFetches: 0, recoveryChildCreates: 0, oldEpochRejected: v === 2, cleanup: 'verified', phases: ['write', 'read'].map(phase => ({ version: v, compression, cut, phase, pid: nextPid++, passed: true, calls: 0, children: 0, externalNetworkAttempts: 0, ...(phase === 'write' ? { abruptExit: 85 } : {}) })) })))) })
const testReport = () => ({ success: true, numFailedTests: 0, numPendingTests: 0, numTodoTests: 0,
  numTotalTests: RECOVERY_CASES.length + 1, numPassedTests: RECOVERY_CASES.length + 1,
  testResults: [{ assertionResults: [...RECOVERY_CASES, ...PHASE2_REQUIRED_CASES].map((title: string) => ({ title, status: 'passed' })) }] })
const matrix = (): any => ({ schemaVersion: 1, kind: 'adaptive-task-delegation-host-matrix', node: 'v24.13.0', bundleDigest: digest,
  syntheticOnly: true, realProviderDispatches: 0, externalNetworkAttempts: 0, reports: versions.map((version, index) => ({
    version, bundleDigest: digest, node: 'v24.13.0', syntheticOnly: true, realProviderDispatches: 0, externalNetworkAttempts: 0,
    cases: [...RECOVERY_CASES, ...PHASE2_REQUIRED_CASES].sort(), tests: RECOVERY_CASES.length + 1, pid: index + 1, profile: 'recovery-only',
    runtimePackages: { ...Object.fromEntries(PHASE2_RUNTIME_PACKAGES.map((name: string) => [name, version])), '@earendil-works/pi-ai': '0.84.4' },
    crashes: crashes(),
  })) })
it('requires every named Phase 2 case and accurate totals without skip or todo', () => {
  expect(inspectDelegationMatrixReport(testReport())).toEqual([...RECOVERY_CASES, ...PHASE2_REQUIRED_CASES].sort())
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
it.each(['missing-package', 'mixed-runtime', 'node', 'network', 'digest', 'case', 'pid', 'profile'])('rejects incomplete or mismatched %s evidence', kind => {
  const report = matrix(), host = report.reports[1]
  if (kind === 'missing-package') delete host.runtimePackages[PHASE2_RUNTIME_PACKAGES[0]]
  if (kind === 'mixed-runtime') host.runtimePackages[PHASE2_RUNTIME_PACKAGES[0]] = 'unrelated'
  if (kind === 'node') host.node = 'v22.19.0'
  if (kind === 'network') host.externalNetworkAttempts = 1
  if (kind === 'digest') host.bundleDigest = 'b'.repeat(64)
  if (kind === 'case') host.cases = host.cases.slice(1)
  if (kind === 'pid') host.pid = report.reports[0].pid
  if (kind === 'profile') host.profile = 'recovery-disabled'
  expect(() => assertDelegationMatrix(report, versions, digest)).toThrow()
})

function rc2Matrix(version = '0.2.2-rc.2'): any {
  const node = 'v24.13.0'
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
it.each(['0.2.2-rc.2', '0.2.2-rc.3'])('requires all %s functional cases, real identity and crash boundaries in Phase 2', version => {
  const r = rc2Matrix(version)
  expect(assertDelegationMatrix(r, [version], digest)).toBe(r)
  const data = { success: true, numFailedTests: 0, numPendingTests: 0, numTodoTests: 0, numTotalTests: r.reports[0].cases.length, numPassedTests: r.reports[0].cases.length,
    testResults: [{ assertionResults: r.reports[0].cases.map((title: string) => ({ title, status: 'passed' })) }] }
  expect(inspectDelegationMatrixReport(data, version)).toHaveLength(r.reports[0].cases.length)
  data.testResults[0]!.assertionResults.pop(); data.numTotalTests--; data.numPassedTests--
  expect(() => inspectDelegationMatrixReport(data, version)).toThrow()
})
it.each(RC2_RECOVERY_RUNTIME_PACKAGES)('rejects missing or mixed rc2 Phase 2 %s', name => {
  for (const version of ['0.2.2-rc.2', '0.2.2-rc.3']) for (const mutation of ['missing', 'mixed']) {
    const r = rc2Matrix(version)
    if (mutation === 'missing') delete r.reports[0].runtimePackages[name]
    else r.reports[0].runtimePackages[name] = '0.2.2-rc.1'
    expect(() => assertDelegationMatrix(r, [version], digest)).toThrow()
  }
})
