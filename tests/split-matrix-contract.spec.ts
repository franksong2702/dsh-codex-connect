import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
// @ts-expect-error Plain Node validation helper is outside the source build.
import { validateSplitMatrix, SPLIT_RUNTIME_PACKAGES } from '../scripts/check-split-matrix.mjs'
import { SPLIT_HOST_SCENARIOS } from '../scripts/split-host-fixture.mjs'
const versions = ['0.1.2-rc.1', '0.1.5-alpha.1', '0.1.5-rc.1', '0.1.5-rc.2']
const reports = () => versions.map((version, index) => ({ schemaVersion: 1, kind: 'split-internal-experiment', dshVersion: version,
  syntheticOnly: true, realProviderDispatches: 0, productionEntryEnabled: false, freshProcesses: 1, pid: index + 1,
  bundleDigest: 'a'.repeat(64), exactDshPackages: 7, runtimePackages: Object.fromEntries((SPLIT_RUNTIME_PACKAGES as string[]).map(name => [name, version])),
  scenarios: SPLIT_HOST_SCENARIOS.map(scenario => ({ scenario, passed: true, syntheticOnly: true })),
}))
it('requires a separate exact-host Split matrix, not compaction reports', () => { expect(() => validateSplitMatrix(reports(), versions)).not.toThrow() })
it.each(['missing-host', 'wrong-host', 'wrong-kind', 'different-bundle', 'reused-process', 'missing-scenario', 'failed-scenario', 'live', 'enabled', 'mixed-runtime', 'unknown-runtime'] as const)('rejects %s evidence', kind => {
  const data = reports()
  const first = data[0]!
  if (kind === 'missing-host') data.pop()
  if (kind === 'wrong-host') first.dshVersion = '0.1.5-alpha.2'
  if (kind === 'wrong-kind') first.kind = 'native-compaction'
  if (kind === 'different-bundle') first.bundleDigest = 'b'.repeat(64)
  if (kind === 'reused-process') first.pid = 2
  if (kind === 'missing-scenario') first.scenarios.pop()
  if (kind === 'failed-scenario') first.scenarios[0]!.passed = false
  if (kind === 'live') first.realProviderDispatches = 1
  if (kind === 'enabled') first.productionEntryEnabled = true
  if (kind === 'mixed-runtime') first.runtimePackages['@deepseek-ai/dsh-agent'] = '0.1.5-alpha.2'
  if (kind === 'unknown-runtime') { delete first.runtimePackages['@deepseek-ai/dsh-agent']; first.runtimePackages['unrelated'] = first.dshVersion }
  expect(() => validateSplitMatrix(data, versions)).toThrow()
})
it('keeps the internal worker outside the public plugin exports', () => {
  const entry = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  expect(entry).not.toContain('split-worker')
  expect(JSON.stringify(pkg.exports)).not.toContain('split')
  const workflow = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8')
  expect(workflow).toContain('run: node scripts/check-split-matrix.mjs')
  expect(workflow).toContain('run: node scripts/check-split-browser.mjs')
  expect(entry).not.toContain('split-transport')
  expect(entry).not.toContain('split-conversation')
  const client = readFileSync(new URL('../src/client/index.tsx', import.meta.url), 'utf8')
  expect(client).not.toContain('SplitApprovalRemoteCard')
  expect(client).not.toContain('split-conversation')
  expect(workflow).toContain('run: node scripts/check-split-conversation.mjs')
})
