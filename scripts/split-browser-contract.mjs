/** Exact-host browser evidence is separate from the worker/HTTP matrix. */
import assert from 'node:assert/strict'
export const SPLIT_BROWSER_SCENARIOS = Object.freeze(['conversation-allow', 'conversation-reject', 'conversation-revoke', 'conversation-admission'])
export const SPLIT_BROWSER_REQUIRED_PACKAGES = Object.freeze([
  '@deepseek-ai/dsh-client-connection', '@deepseek-ai/dsh-api-gateway',
  '@deepseek-ai/dsh-api-session-controller', '@deepseek-ai/dsh-client-ui-session',
  '@deepseek-ai/dsh-client-ui-conversation', '@deepseek-ai/dsh-client-ui-chat',
])
export const SPLIT_BROWSER_SEEDS = Object.freeze(['react', 'react-dom', '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store', '@deepseek-ai/dsh-client-ui-slots', '@deepseek-ai/dsh-client-ui-primitives'])

export function assertSplitBrowserReport(report, version) {
  assert.equal(report?.kind, 'split-conversation-browser')
  assert.equal(report.passed, true)
  assert.equal(report.dshVersion, version)
  assert.equal(report.actualGatewayGeneration, true)
  assert.equal(report.ordinaryConversationUi, true)
  assert.equal(report.syntheticProvider, true)
  assert.equal(report.realProviderDispatches, 0)
  assert.equal(report.externalBrowserRequests, 0)
  assert.equal(report.fatalPageErrors, 0)
  assert.ok(typeof report.browserVersion === 'string' && report.browserVersion.length > 0)
  assert.ok(/^[a-f0-9]{64}$/u.test(report.browserBundleSha256 ?? ''))
  assert.ok(Array.isArray(report.clientPackages) && report.clientPackages.length >= SPLIT_BROWSER_REQUIRED_PACKAGES.length)
  assert.equal(new Set(report.clientPackages.map(item => item.id)).size, report.clientPackages.length)
  for (const id of SPLIT_BROWSER_REQUIRED_PACKAGES) assert.ok(report.clientPackages.some(item => item.id === id))
  for (const item of report.clientPackages) {
    assert.ok(item.id.startsWith('@deepseek-ai/dsh-'))
    assert.equal(item.version, version, `mixed browser package: ${item.id}`)
    assert.ok(/^[a-f0-9]{64}$/u.test(item.sha256 ?? ''))
  }
  assert.deepEqual(report.seedPackages.map(item => item.id).sort(), [...SPLIT_BROWSER_SEEDS].sort())
  for (const item of report.seedPackages) {
    assert.ok(/^[a-f0-9]{64}$/u.test(item.sha256 ?? ''))
    if (item.id.startsWith('@deepseek-ai/dsh-')) assert.equal(item.version, version)
  }
  assert.deepEqual(report.scenarios.map(item => item.scenario), SPLIT_BROWSER_SCENARIOS)
  for (const item of report.scenarios) {
    assert.equal(item.syntheticOnly, true)
    assert.equal(item.actualGateway, true)
    assert.equal(item.actualSessionController, true)
    assert.equal(item.realProviderDispatches, 0)
    assert.equal(item.creates, 1)
    assert.equal(item.decisions, 1)
    assert.equal(item.reloadRecovered, true)
    assert.equal(item.childQuiescent, true)
    assert.equal(item.parents, 1)
    assert.equal(item.children, item.scenario === 'conversation-reject' ? 0 : 1)
    assert.equal(item.childMockDispatches, item.scenario === 'conversation-reject' ? 0 : item.scenario === 'conversation-revoke' ? 1 : 2)
  }
}
