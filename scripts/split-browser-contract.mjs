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
/** Newer supported shells externalize dockkit as a shared library, not a client plugin. */
export function splitBrowserSeedsFor(version) {
  return ['0.1.5-alpha.1', '0.1.5-rc.1', '0.1.5-rc.2'].includes(version)
    ? [...SPLIT_BROWSER_SEEDS, '@deepseek-ai/dsh-client-ui-dockkit'] : [...SPLIT_BROWSER_SEEDS]
}
export const SPLIT_BROWSER_ROOTS = Object.freeze([
  '@deepseek-ai/dsh-typert-registry', '@deepseek-ai/dsh-client-connection',
  '@deepseek-ai/dsh-api-gateway', '@deepseek-ai/dsh-api-remotes', '@deepseek-ai/dsh-api-session-controller',
  '@deepseek-ai/dsh-client-ui-renderer', '@deepseek-ai/dsh-client-ui-session', '@deepseek-ai/dsh-client-ui-layout',
  '@deepseek-ai/dsh-client-ui-workspace', '@deepseek-ai/dsh-client-ui-conversation', '@deepseek-ai/dsh-client-ui-chat',
  '@deepseek-ai/dsh-client-locale', '@deepseek-ai/dsh-client-ui-settings',
  '@deepseek-ai/dsh-client-ui-settings-models', '@deepseek-ai/dsh-client-ui-settings-plugins',
  '@deepseek-ai/dsh-client-ui-model-selection',
])

/** Explicit private-shell runtime dependencies for the inspected RC shared libraries.
 * These exact versions already exist in the frozen development graph. Installing them in
 * each disposable host supplies missing package edges; it never borrows code from that graph.
 * Keep this allowlist reviewed: unresolved imports must fail, not trigger automatic installs.
 */
export const SPLIT_BROWSER_VENDOR_DEPENDENCIES = Object.freeze({
  '@shikijs/langs': '4.4.3',
  anser: '2.3.5',
  clsx: '2.1.1',
  immer: '10.2.0',
  katex: '0.16.47',
  'mdast-util-from-markdown': '2.0.3',
  'mdast-util-gfm': '3.1.0',
  'mdast-util-math': '3.0.0',
  'micromark-core-commonmark': '2.0.3',
  'micromark-extension-gfm': '3.0.0',
  'micromark-extension-math': '3.1.0',
  'micromark-factory-space': '2.0.1',
  'micromark-util-character': '2.1.1',
  'micromark-util-classify-character': '2.0.1',
  'micromark-util-sanitize-uri': '2.0.1',
  'micromark-util-symbol': '2.0.1',
  shiki: '4.4.3',
  zustand: '4.4.7',
})

/** Fail at bundle construction, rather than shipping an unresolved bare import to Chromium. */
export async function assertSplitBrowserImports(code) {
  const ts = await import('typescript')
  const source = ts.createSourceFile('browser.mjs', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  const check = node => {
    if (node && ts.isStringLiteralLike(node)) {
      assert.ok(/^(?:\.{1,2}\/|\/)/u.test(node.text), `Unresolved browser import: ${node.text}`)
    }
  }
  const visit = node => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) check(node.moduleSpecifier)
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) check(node.arguments[0])
    ts.forEachChild(node, visit)
  }
  visit(source)
}

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
  assert.deepEqual(report.seedPackages.map(item => item.id).sort(), splitBrowserSeedsFor(version).sort())
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
