/** Dedicated Think evidence; ordinary installation/browser checks cannot satisfy this contract. */
import assert from 'node:assert/strict'

export const THINK_HOST_CASES = Object.freeze([
  'is disabled by default and never rewrites an ordinary request',
  ...[true, false].map(value => `runs native question, real loop and actual Codex adapter (approved=${value})`),
  'does not advertise a queued approval as an effective request',
  ...['disable', 'cancel', 'manual'].map(value => `discards a queued but unadmitted change after ${value}`),
  ...['disable', 'cancel', 'dispose', 'manual'].map(value => `rejects an obsolete native decision after ${value}`),
  'does not infer explicit initial effort from provider Default',
  'replays admitted changes after disable and preserves later manual selections',
  'replays the same canonical history through a fresh root and prepared adapter call',
  'rejects missing durable notices before transport',
  'keeps repeated enablement idempotent while a native question is pending',
  'handles rapid activation changes without duplicate tool registration',
  'rejects a second decision while one question is pending',
  'does not substitute another approval service when native human questions are absent',
  ...['custom', 'wrong-option', 'multiple'].map(value => `does not accept ${value} as exact consent`),
  'keeps approved changes out of an unrelated live root',
  'does not trust a different object carrying the live Agent id',
  'rejects compaction for Think history without disabling ordinary compaction globally',
  'does not publish a request header when selection changes inside admission',
  'refuses proposals from an actually owned child, not only forged identities',
  'guards direct prepared adapter dispatch after the host integration is disposed',
  'applies an approved decrease after an increase without resetting the wire base',
  ...['removed', 'changed'].map(value => `rejects a first approved notice ${value} by a later pre-step transform`),
  'defaults old settings to off and rejects malformed reasoning configuration',
  'activates only on a successful saved opt-in and retains it across plugin reload',
  'saving disable aborts a real native question without admitting the late answer',
  'discarding a pending adjustment on disable does not reset an already admitted adjustment',
])
export const THINK_IDENTITY_CASE = 'uses the exact isolated host without a neighboring runtime'
export const THINK_RUNTIME_PACKAGES = Object.freeze([
  '@deepseek-ai/dsh-agent', '@deepseek-ai/dsh-agent-loop', '@deepseek-ai/dsh-llm',
  '@deepseek-ai/dsh-llm-pi-ai', '@deepseek-ai/dsh-session', '@deepseek-ai/dsh-session-projection',
  '@deepseek-ai/dsh-system-prompt', '@deepseek-ai/dsh-tools', '@deepseek-ai/dsh-user-questions',
  '@deepseek-ai/dsh-settings',
])

export function inspectThinkTestReport(report) {
  assert.equal(report.success, true, 'Think test process did not pass')
  assert.equal(report.numFailedTests, 0)
  assert.equal(report.numPendingTests, 0)
  assert.equal(report.numTodoTests, 0)
  assert.equal(report.numTotalTests, THINK_HOST_CASES.length + 1)
  assert.equal(report.numPassedTests, THINK_HOST_CASES.length + 1)
  const results = report.testResults.flatMap(suite => suite.assertionResults)
  assert.ok(results.every(result => result.status === 'passed'))
  assert.deepEqual(results.map(result => result.title).sort(), [...THINK_HOST_CASES, THINK_IDENTITY_CASE].sort())
  return { cases: [...THINK_HOST_CASES], tests: results.length }
}

export function assertThinkMatrix(report, versions, bundleDigest) {
  assert.equal(report.schemaVersion, 2)
  assert.equal(report.kind, 'think-native-host-matrix')
  assert.equal(report.syntheticOnly, true)
  assert.equal(report.productSettingsExercised, true)
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
    assert.deepEqual(host.cases, [...THINK_HOST_CASES])
    assert.equal(host.tests, THINK_HOST_CASES.length + 1)
    for (const id of THINK_RUNTIME_PACKAGES) assert.equal(host.runtimePackages[id], host.version)
    assert.ok(Object.keys(host.runtimePackages).length >= THINK_RUNTIME_PACKAGES.length)
    assert.ok(Object.values(host.runtimePackages).every(version => version === host.version))
    assert.ok(typeof host.piAiVersion === 'string' && /^\d+\.\d+\.\d+$/u.test(host.piAiVersion))
  }
  assert.equal(pids.size, versions.length, 'each host needs a fresh test process')
  return report
}
