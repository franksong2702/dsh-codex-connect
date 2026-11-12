/** The recovery profile is a complete positive contract, not a way to omit failing cases. */
import { expect, it } from 'vitest'
import { RECOVERY_CASES, RC2_RECOVERY_CASES, recoveryCases, recoveryRuntimePackages, isRecoveryHost, recoveryCordisVersion, inspectRecoveryReport, assertRecoveryCrashes } from '../scripts/adaptive-task-recovery-contract.mjs'
const identity = 'uses the exact isolated host without a neighboring runtime'
function report(version = '0.2.2-alpha.3') {
  const titles = [...recoveryCases(version), identity]
  return { success: true, numFailedTests: 0, numPendingTests: 0, numTodoTests: 0,
    numPassedTests: titles.length, numTotalTests: titles.length,
    testResults: [{ assertionResults: titles.map(title => ({ title, status: 'passed' })) }] }
}
function crashes() {
  let pid = 1
  const reports = [1, 2].flatMap(version => ['none', 'zstd'].flatMap(compression => ['seed', 'stop', 'manual'].map(cut => ({
    version, compression, cut, passed: true, recoveryFetches: 0, recoveryChildCreates: 0,
    oldEpochRejected: version === 2, cleanup: 'verified', phases: ['write', 'read'].map(phase => ({
      version, compression, cut, phase, pid: pid++, passed: true, calls: 0, children: 0,
      externalNetworkAttempts: 0, ...(phase === 'write' ? { abruptExit: 85 } : {}),
    })),
  }))))
  return { profile: 'alpha3-recovery-only', passed: true, syntheticOnly: true, cases: 12, freshProcesses: 24,
    externalNetworkAttempts: 0, realProviderRequests: 0, bundleSha256: 'a'.repeat(64), reports }
}
it('admits the full exact recovery case set with no skipped or pending cases', () => {
  expect(inspectRecoveryReport(report())).toMatchObject({ profile: 'recovery-only', automationExercised: false })
  expect(() => assertRecoveryCrashes(crashes())).not.toThrow()
})
it.each(['numPendingTests', 'numTodoTests', 'numFailedTests'] as const)('rejects nonzero %s', key => {
  const r = report(); r[key] = 1; expect(() => inspectRecoveryReport(r)).toThrow()
})
it.each(['missing', 'duplicate', 'skipped', 'old-automatic-case'])('rejects %s recovery evidence', mutation => {
  const r = report(), rows = r.testResults[0]!.assertionResults
  if (mutation === 'missing') rows.pop()
  if (mutation === 'duplicate') rows[0] = rows[1]!
  if (mutation === 'skipped') rows[0]!.status = 'skipped'
  if (mutation === 'old-automatic-case') rows[0]!.title = 'starts automatic Task routing'
  expect(() => inspectRecoveryReport(r)).toThrow()
})
it.each(['calls', 'children', 'externalNetworkAttempts'] as const)('rejects any fresh-process %s', key => {
  const r = crashes(); r.reports[0]!.phases[1]![key] = 1; expect(() => assertRecoveryCrashes(r)).toThrow()
})
it.each(['missing-case', 'duplicate-pid', 'wrong-cut', 'no-crash', 'v2-no-epoch-fence'])('rejects %s boundary evidence', mutation => {
  const r = crashes()
  if (mutation === 'missing-case') r.reports.pop()
  if (mutation === 'duplicate-pid') r.reports[0]!.phases[1]!.pid = r.reports[0]!.phases[0]!.pid
  if (mutation === 'wrong-cut') r.reports[0]!.cut = 'manual'
  if (mutation === 'no-crash') r.reports[0]!.phases[0]!.abruptExit = 0
  if (mutation === 'v2-no-epoch-fence') r.reports[6]!.oldEpochRejected = false
  expect(() => assertRecoveryCrashes(r)).toThrow()
})

it('selects recovery only for the three exact recovery contract candidates', () => {
  expect(isRecoveryHost('0.2.2-rc.1')).toBe(true)
  expect(isRecoveryHost('0.2.2-alpha.3')).toBe(true)
  expect(isRecoveryHost('0.2.2-rc.2')).toBe(true)
  for (const version of ['0.2.2-alpha.2', '0.2.2-rc.3', '0.2.3', undefined]) {
    expect(isRecoveryHost(version)).toBe(false)
    expect(() => recoveryCordisVersion(version as string)).toThrow()
  }
  expect(recoveryCordisVersion('0.2.2-rc.1')).toBe('4.1.0')
  expect(recoveryCordisVersion('0.2.2-alpha.3')).toBe('4.0.6-alpha.2')
})

it('requires the seven rc2 ownership regressions in addition to all prior recovery cases', () => {
  expect(RECOVERY_CASES).toHaveLength(24)
  expect(RC2_RECOVERY_CASES).toHaveLength(7)
  expect(inspectRecoveryReport(report('0.2.2-rc.2'), '0.2.2-rc.2').tests).toBe(32)
  expect(inspectRecoveryReport(report('0.2.2-rc.1'), '0.2.2-rc.1').tests).toBe(25)
  expect(() => inspectRecoveryReport(report(), '0.2.2-rc.2')).toThrow()
  expect(() => recoveryCases('0.2.2-rc.3')).toThrow()
  expect(() => recoveryRuntimePackages('0.2.2-rc.3')).toThrow()
})
it.each(RC2_RECOVERY_CASES)('rejects rc2 evidence omitting %s even with adjusted passing totals', title => {
  const r = report('0.2.2-rc.2')
  r.testResults[0]!.assertionResults = r.testResults[0]!.assertionResults.filter(row => row.title !== title)
  r.numTotalTests--; r.numPassedTests--
  expect(() => inspectRecoveryReport(r, '0.2.2-rc.2')).toThrow()
})
it('only the exact rc2 profile adds its ownership and concrete filesystem services', () => {
  const names = ['@deepseek-ai/dsh-subagent', '@deepseek-ai/dsh-working-directory', '@deepseek-ai/dsh-fs-local']
  for (const name of names) {
    expect(recoveryRuntimePackages('0.2.2-rc.2')).toContain(name)
    expect(recoveryRuntimePackages('0.2.2-rc.1')).not.toContain(name)
  }
})
