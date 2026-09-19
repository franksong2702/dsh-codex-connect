#!/usr/bin/env node
/** Explicit offline experiment: actual Gateway generation and ordinary DSH conversation UI. */
import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'tsdown'
import { chromium } from 'playwright'
import { runSplitHostScenario } from './split-host-fixture.mjs'
import { assertSplitHostPath, collectSplitClientBundles, splitBrowserSeedAliases } from './split-conversation-bundles.mjs'
import { assertSplitBrowserReport, SPLIT_BROWSER_SCENARIOS } from './split-browser-contract.mjs'
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export async function runSplitConversationBrowser({ hostRoot = ROOT, expectedVersion, implementation, importHost, manual } = {}) {
const require = createRequire(join(hostRoot, 'package.json'))
const version = JSON.parse(await readFile(require.resolve('@deepseek-ai/dsh-api-session-controller/package.json'), 'utf8')).version
if (expectedVersion !== undefined) assert.equal(version, expectedVersion)
importHost ??= async specifier => import(pathToFileURL(await assertSplitHostPath(hostRoot, require.resolve(specifier))).href)
const dir = await mkdtemp(join(hostRoot, '.split-conversation-'))
let browser
let externalBrowserRequests = 0; let fatalPageErrors = 0
try {
  const pkg = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'))
  if (implementation === undefined) {
    await build({ config: false, entry: { experiment: join(ROOT, 'scripts/split-experiment-entry.ts') }, outDir: join(dir, 'host'),
      platform: 'node', target: 'es2024', format: 'esm', dts: false, clean: true, report: false, logLevel: 'silent',
      deps: { neverBundle: true }, define: { __CODEX_CONNECT_VERSION__: JSON.stringify(pkg.version) } })
    implementation = await import(pathToFileURL(join(dir, 'host/experiment.mjs')).href)
  }
  const seeds = await splitBrowserSeedAliases(hostRoot, version)
  await build({ config: false, alias: seeds.alias, entry: { browser: join(ROOT, 'scripts/split-conversation-entry.tsx') }, outDir: join(dir, 'browser'),
    platform: 'browser', target: 'es2022', format: 'esm', dts: false, clean: true, report: false, logLevel: 'silent',
    deps: { alwaysBundle: [/.*/] }, define: { 'process.env.NODE_ENV': '"production"' } })
  const names = await readdir(join(dir, 'browser'))
  const entry = names.find(name => /^browser\.m?js$/u.test(name)); assert.ok(entry)
  const files = new Map(await Promise.all(names.map(async name => [name, await readFile(join(dir, 'browser', name))])))
  const bundles = await collectSplitClientBundles(hostRoot, undefined, version)
  assert.deepEqual(bundles.missing, [])
  for (const asset of bundles.assets) files.set(asset.fileName, await readFile(asset.path))
  browser = await chromium.launch({ headless: manual === undefined })
  const reports = []
  for (const scenario of manual ? [`conversation-${manual}`] : SPLIT_BROWSER_SCENARIOS) {
    let creates = 0; let decisions = 0
    const report = await runSplitHostScenario(scenario, { root: join(dir, 'data'), implementation, importHost,
      async interaction({ ctx, origin, cookie, exchange, children }) {
        const disposeIndex = ctx.webServer.register({ kind: 'exact', path: '/', handler(req, res) {
          if (!ctx.connection.authorizeIndex(req, res)) return
          res.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store' })
          res.end(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Split experimental conversation</title>${names.filter(name => name.endsWith('.css')).map(name => `<link rel="stylesheet" href="/fixture/${name}">`).join('')}<div id="root"></div><script>window.__splitBundleNames=${JSON.stringify(bundles.assets.map(asset => asset.fileName))};window.__splitPluginIds=${JSON.stringify(bundles.packages.map(item => item.id))}</script><script type="module" src="/fixture/${entry}"></script></html>`)
        } })
        const disposers = [...files].map(([name, bytes]) => ctx.webServer.register({ kind: 'exact', path: `/fixture/${name}`, handler(req, res) {
          const denied = ctx.connection.requestRejection(req)
          if (denied !== undefined) { res.writeHead(denied); res.end(); return }
          res.writeHead(200, { 'content-type': name.endsWith('.css') ? 'text/css' : 'text/javascript', 'cache-control': 'no-store' }); res.end(bytes)
        } }))
        const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' })
        await context.route('**/*', route => {
          if (new URL(route.request().url()).origin !== origin) { externalBrowserRequests += 1; return route.abort('blockedbyclient') }
          return route.continue()
        })
        try {
          const at = cookie.indexOf('=')
          await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin, httpOnly: true, sameSite: 'Strict' }])
          const page = await context.newPage(); const errors = []
          page.on('pageerror', error => { fatalPageErrors += 1; errors.push(error.message) })
          page.on('console', message => { if (message.type() === 'error') errors.push(message.text().slice(0, 500)) })
          page.on('response', async response => {
            if (response.status() >= 400) errors.push(`${response.status()} ${new URL(response.url()).pathname}`)
          })
          await page.route('**/api/codex-connect/*', async route => {
            const body = route.request().postDataJSON()
            if (body.action === 'create') {
              creates += 1
              if (scenario === 'conversation-admission') {
                const result = await route.fetch(); assert.equal(result.status(), 202)
                await route.abort('failed'); return
              }
            }
            if (body.action === 'decide') {
              decisions += 1
              if (scenario === 'conversation-allow' && manual === undefined) {
                const result = await route.fetch(); assert.equal(result.status(), 200)
                await route.abort('failed'); return
              }
            }
            await route.continue()
          })
          await page.goto(origin)
          if (manual !== undefined) {
            console.log(`Offline Split manual ${manual}: enter a brief, start the task, choose ${manual}, and refresh the page. Close the experiment tab when finished. No real provider requests are enabled.`)
            await page.waitForEvent('close', { timeout: 0 })
            assert.equal(creates, 1); assert.equal(decisions, 1)
            return
          }
          try {
            await page.getByRole('textbox', { name: 'Read-only task brief' }).fill('Inspect the approved example and cite its source.', { timeout: 10000 })
            await page.getByRole('button', { name: 'Start Split task', exact: true }).click({ timeout: 10000 })
            if (scenario === 'conversation-admission') {
              await page.getByText('Task status is unconfirmed.', { exact: true }).waitFor({ timeout: 10000 })
              await page.reload()
            }
            await page.getByRole('button', { name: 'Approve once', exact: true }).waitFor({ timeout: 10000 })
          } catch { throw new Error(`Conversation did not reach approval: ${JSON.stringify({ errors, text: (await page.locator('body').innerText()).slice(0, 2000) })}`) }
          assert.equal(creates, 1); assert.equal(decisions, 0)
          await page.getByRole('button', { name: scenario === 'conversation-reject' ? 'Reject' : 'Approve once', exact: true }).click()
          if (scenario === 'conversation-allow') {
            await page.getByText('The action could not be confirmed.', { exact: false }).waitFor()
            await page.evaluate(() => window.__splitConversationBrowser.reconnect())
          }
          if (scenario === 'conversation-revoke') {
            await page.getByRole('status').filter({ hasText: 'Worker running' }).waitFor({ timeout: 10000 })
            for (let i = 0; children.length === 0 && i < 100; i++) await new Promise(resolve => setTimeout(resolve, 10))
            assert.equal(children.length, 1)
            assert.ok(ctx.agents.get(children[0].id))
            await page.getByRole('button', { name: 'Revoke and stop', exact: true }).click()
          }
          const phase = scenario === 'conversation-reject' ? 'Rejected' : scenario === 'conversation-revoke' ? 'Revoked' : 'Completed'
          await page.getByRole('status').filter({ hasText: phase }).waitFor({ timeout: 10000 })
          if (scenario === 'conversation-allow' || scenario === 'conversation-admission') {
            try { await page.getByText('Parent consumed the worker result.', { exact: true }).waitFor({ timeout: 10000 }) }
            catch { throw new Error(`Conversation transcript unavailable: ${JSON.stringify({ errors, text: (await page.locator('body').innerText()).slice(0, 5000) })}`) }
          }
          await page.reload()
          await page.getByRole('status').filter({ hasText: phase }).waitFor({ timeout: 10000 })
          assert.equal(creates, 1); assert.equal(decisions, 1)
          assert.equal((await exchange({ action: 'status' })).value.tasks.length, 1)
        } finally { await context.close(); disposers.forEach(dispose => dispose()); disposeIndex() }
      },
    })
    reports.push({ ...report, creates, decisions, reloadRecovered: manual === undefined })
  }
  const report = { kind: 'split-conversation-browser', passed: true, actualGatewayGeneration: true,
    ordinaryConversationUi: true, syntheticProvider: true, realProviderDispatches: 0, scenarios: reports,
    dshVersion: version, browserVersion: browser.version(), externalBrowserRequests, fatalPageErrors,
    browserBundleSha256: createHash('sha256').update(files.get(entry)).digest('hex'),
    clientPackages: bundles.packages.map(({ id, version, sha256 }) => ({ id, version, sha256 })), seedPackages: seeds.packages }
  if (manual === undefined) assertSplitBrowserReport(report, version)
  return report
} finally { await browser?.close(); await rm(dir, { recursive: true, force: true }) }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2)
  const manual = argv[0]?.startsWith('--manual=') ? argv[0].slice('--manual='.length) : undefined
  assert.ok(argv.length === 0 || (argv.length === 1 && ['allow', 'reject', 'revoke'].includes(manual)), 'Use --manual=allow, --manual=reject or --manual=revoke')
  console.log(JSON.stringify(await runSplitConversationBrowser({ manual })))
}
