import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
// @ts-expect-error Plain Node acceptance helper is outside the source build.
import { assertSplitBrowserReport, SPLIT_BROWSER_SCENARIOS, SPLIT_BROWSER_REQUIRED_PACKAGES, splitBrowserSeedsFor } from '../scripts/split-browser-contract.mjs'
// @ts-expect-error Plain Node acceptance helper is outside the source build.
import { collectSplitClientBundles, assertSplitHostPath } from '../scripts/split-conversation-bundles.mjs'
// @ts-expect-error Plain Node acceptance helper is outside the source build.
import { splitBrowserReactDependencies, validateSplitMatrix } from '../scripts/check-split-matrix.mjs'

const version = '0.1.5-rc.1'
const report = () => ({ kind: 'split-conversation-browser', passed: true, dshVersion: version,
  actualGatewayGeneration: true, ordinaryConversationUi: true, syntheticProvider: true,
  realProviderDispatches: 0, externalBrowserRequests: 0, fatalPageErrors: 0,
  browserVersion: 'fixture-chromium', browserBundleSha256: 'a'.repeat(64),
  clientPackages: (SPLIT_BROWSER_REQUIRED_PACKAGES as string[]).map(id => ({ id, version, sha256: 'b'.repeat(64) })),
  seedPackages: (splitBrowserSeedsFor(version) as string[]).map(id => ({ id, version, sha256: 'c'.repeat(64) })),
  scenarios: (SPLIT_BROWSER_SCENARIOS as string[]).map(scenario => ({ scenario,
    syntheticOnly: true, actualGateway: true, actualSessionController: true, realProviderDispatches: 0,
    creates: 1, decisions: 1, reloadRecovered: true, childQuiescent: true, parents: 1,
    children: scenario === 'conversation-reject' ? 0 : 1,
    childMockDispatches: scenario === 'conversation-reject' ? 0 : scenario === 'conversation-revoke' ? 1 : 2 })),
})
it('accepts complete exact-host browser evidence', () => { expect(() => assertSplitBrowserReport(report(), version)).not.toThrow() })
it('requires the newer shell library without adding it to the old baseline', () => {
  expect(splitBrowserSeedsFor('0.1.2-rc.1')).not.toContain('@deepseek-ai/dsh-client-ui-dockkit')
  for (const host of ['0.1.5-alpha.1', '0.1.5-rc.1', '0.1.5-rc.2']) {
    expect(splitBrowserSeedsFor(host)).toContain('@deepseek-ai/dsh-client-ui-dockkit')
  }
  const value = report()
  value.seedPackages = value.seedPackages.filter(item => !item.id.endsWith('-dockkit'))
  expect(() => assertSplitBrowserReport(value, version)).toThrow()
})
it.each(['wrong-host', 'missing-chat', 'mixed-client', 'mixed-seed', 'missing-hash', 'duplicate-package', 'missing-flow',
  'duplicate-create', 'duplicate-decision', 'reload-lost', 'child-not-stopped', 'rejected-child', 'live-request', 'external-request', 'page-error', 'fake-gateway'])(
  'rejects %s browser evidence', kind => {
    const value = report()
    if (kind === 'wrong-host') value.dshVersion = '0.1.2-rc.1'
    if (kind === 'missing-chat') value.clientPackages.pop()
    if (kind === 'mixed-client') value.clientPackages[0]!.version = '0.1.2-rc.1'
    if (kind === 'mixed-seed') value.seedPackages.find(p => p.id.startsWith('@deepseek-ai/dsh-'))!.version = '0.1.2-rc.1'
    if (kind === 'missing-hash') value.clientPackages[0]!.sha256 = ''
    if (kind === 'duplicate-package') value.clientPackages.push(value.clientPackages[0]!)
    if (kind === 'missing-flow') value.scenarios.pop()
    if (kind === 'duplicate-create') value.scenarios[0]!.creates = 2
    if (kind === 'duplicate-decision') value.scenarios[0]!.decisions = 2
    if (kind === 'reload-lost') value.scenarios[0]!.reloadRecovered = false
    if (kind === 'child-not-stopped') value.scenarios[0]!.childQuiescent = false
    if (kind === 'rejected-child') value.scenarios[1]!.children = 1
    if (kind === 'live-request') value.realProviderDispatches = 1
    if (kind === 'external-request') value.externalBrowserRequests = 1
    if (kind === 'page-error') value.fatalPageErrors = 1
    if (kind === 'fake-gateway') value.actualGatewayGeneration = false
    expect(() => assertSplitBrowserReport(value, version)).toThrow()
  })
it('does not accept empty matrix evidence in browser mode', () => {
  expect(() => validateSplitMatrix([], [version], { browser: true })).toThrow()
})

it('pins both browser-shell packages, refusing mixed or ranged React versions', async () => {
  const root = await mkdtemp(join(tmpdir(), 'split-react-pair-'))
  const manifest = (name: string, version: string) => JSON.stringify({ name, version })
  try {
    await writeFile(join(root, 'package.json'), '{}')
    for (const name of ['react', 'react-dom']) {
      await mkdir(join(root, 'node_modules', name), { recursive: true })
      await writeFile(join(root, 'node_modules', name, 'package.json'), manifest(name, '18.3.1'))
    }
    expect(await splitBrowserReactDependencies(root)).toEqual({ react: '18.3.1', 'react-dom': '18.3.1' })
    await writeFile(join(root, 'node_modules/react-dom/package.json'), manifest('react-dom', '19.0.0'))
    await expect(splitBrowserReactDependencies(root)).rejects.toThrow(/matching React pair/)
    await writeFile(join(root, 'node_modules/react-dom/package.json'), manifest('react-dom', '^18.3.1'))
    await expect(splitBrowserReactDependencies(root)).rejects.toThrow()
  } finally { await rm(root, { recursive: true, force: true }) }
})

it('rejects escaped assets and mixed package versions instead of using a neighboring installation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'split-client-identity-'))
  const host = join(root, 'host')
  const pkg = join(host, 'node_modules/@deepseek-ai/dsh-client-ui-chat')
  const id = '@deepseek-ai/dsh-client-ui-chat'
  try {
    await mkdir(pkg, { recursive: true })
    await writeFile(join(host, 'package.json'), '{}')
    await writeFile(join(pkg, 'package.json'), JSON.stringify({ name: id, version,
      exports: { './package.json': './package.json', './client': './client.js' } }))
    await writeFile(join(pkg, 'client.js'), '/* synthetic asset */')
    const good = await collectSplitClientBundles(host, [id], version)
    expect(good.missing).toEqual([])
    expect(good.packages[0].version).toBe(version)
    await expect(collectSplitClientBundles(host, [id], '0.1.2-rc.1')).rejects.toThrow(/mixed browser package/)
    const outside = join(root, 'outside.js')
    await writeFile(outside, '/* not in selected host */')
    await expect(assertSplitHostPath(host, outside)).rejects.toThrow(/escaped/)
    await rm(join(pkg, 'client.js'))
    await symlink(outside, join(pkg, 'client.js'))
    await expect(collectSplitClientBundles(host, [id], version)).rejects.toThrow(/escaped/)
  } finally { await rm(root, { recursive: true, force: true }) }
})
