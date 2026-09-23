import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { TASK_RUNTIME_PACKAGES } from './adaptive-task-matrix-contract.mjs'

export const PHASE2_REQUIRED_CASES = Object.freeze([...JSON.parse(readFileSync(new URL('./adaptive-task-delegation-cases.json', import.meta.url), 'utf8')),
  'uses the exact isolated host without a neighboring runtime'].sort())
export const PHASE2_RUNTIME_PACKAGES = Object.freeze([...TASK_RUNTIME_PACKAGES,
  '@deepseek-ai/dsh-client-connection', '@deepseek-ai/dsh-host-webserver', '@deepseek-ai/dsh-api-session-controller'])

export function inspectDelegationMatrixReport(report) {
  assert.equal(report.success, true)
  assert.equal(report.numFailedTests, 0)
  assert.equal(report.numPendingTests, 0)
  assert.equal(report.numTodoTests, 0)
  const results = report.testResults.flatMap(suite => suite.assertionResults)
  assert.deepEqual(results.map(result => result.title).sort(), PHASE2_REQUIRED_CASES)
  assert.ok(results.every(result => result.status === 'passed'))
  assert.equal(report.numTotalTests, results.length)
  assert.equal(report.numPassedTests, results.length)
  return results.map(result => result.title).sort()
}

export function assertDelegationMatrix(report, versions, bundleDigest) {
  assert.equal(report.schemaVersion, 1)
  assert.equal(report.kind, 'adaptive-task-delegation-host-matrix')
  assert.equal(report.syntheticOnly, true)
  assert.equal(report.realProviderDispatches, 0)
  assert.equal(report.externalNetworkAttempts, 0)
  assert.ok(/^[a-f0-9]{64}$/u.test(report.bundleDigest ?? ''))
  assert.equal(report.bundleDigest, bundleDigest)
  assert.ok(/^v(?:22|24)\./u.test(report.node))
  assert.ok(versions.length > 0 && new Set(versions).size === versions.length)
  assert.equal(report.reports.length, versions.length)
  const expected = PHASE2_REQUIRED_CASES
  const pids = new Set()
  for (const [index, host] of report.reports.entries()) {
    assert.equal(host.version, versions[index])
    assert.equal(host.bundleDigest, bundleDigest)
    assert.equal(host.syntheticOnly, true)
    assert.equal(host.realProviderDispatches, 0)
    assert.equal(host.externalNetworkAttempts, 0)
    assert.equal(host.bundleDigest, bundleDigest)
    assert.equal(host.node, report.node)
    assert.deepEqual(host.cases, expected)
    assert.equal(host.tests, expected.length)
    assert.ok(Number.isSafeInteger(host.pid) && host.pid > 0); pids.add(host.pid)
    for (const name of PHASE2_RUNTIME_PACKAGES) assert.equal(host.runtimePackages[name], host.version)
    assert.match(host.runtimePackages['@earendil-works/pi-ai'], /^\d+\.\d+\.\d+$/u)
    for (const [name, version] of Object.entries(host.runtimePackages)) {
      if (name.startsWith('@deepseek-ai/dsh-')) assert.equal(version, host.version)
    }
    assert.equal(host.crashes.passed, true); assert.equal(host.crashes.node, report.node)
    assert.equal(host.crashes.cases, 18); assert.equal(host.crashes.freshProcesses, 36)
    assert.equal(host.crashes.reports.length, 18)
    for (const run of host.crashes.reports) {
      assert.equal(run.passed, true); assert.equal(run.recoveryFetches, 0); assert.equal(run.recoveryChildCreates, 0)
      assert.equal(run.oldEpochRejected, true); assert.equal(run.cleanup, 'verified')
    }
  }
  assert.equal(new Set(report.reports.map(host => host.crashes.bundleSha256)).size, 1)
  assert.equal(pids.size, versions.length)
  return report
}
