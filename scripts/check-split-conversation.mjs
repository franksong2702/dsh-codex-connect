#!/usr/bin/env node
/** Explicit offline experiment: actual Gateway generation and ordinary DSH conversation UI. */
import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'tsdown'
import { chromium } from 'playwright'
import { runSplitHostScenario } from './split-host-fixture.mjs'
import { collectSplitClientBundles } from './split-conversation-bundles.mjs'
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(join(ROOT, 'package.json'))
const manual = process.argv.find(value => value.startsWith('--manual='))?.slice('--manual='.length)
if (manual !== undefined && !['allow', 'reject', 'revoke'].includes(manual)) throw new Error('Use --manual=allow, --manual=reject or --manual=revoke')
const importHost = specifier => import(pathToFileURL(require.resolve(specifier)).href)
const dir = await mkdtemp(join(ROOT, '.split-conversation-'))
let browser
try {
  const pkg = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'))
  await build({ config: false, entry: { experiment: join(ROOT, 'scripts/split-experiment-entry.ts') }, outDir: join(dir, 'host'),
    platform: 'node', target: 'es2024', format: 'esm', dts: false, clean: true, report: false, logLevel: 'silent',
    deps: { neverBundle: true }, define: { __CODEX_CONNECT_VERSION__: JSON.stringify(pkg.version) } })
  await build({ config: false, entry: { browser: join(ROOT, 'scripts/split-conversation-entry.tsx') }, outDir: join(dir, 'browser'),
    platform: 'browser', target: 'es2022', format: 'esm', dts: false, clean: true, report: false, logLevel: 'silent',
    deps: { alwaysBundle: [/.*/] }, define: { 'process.env.NODE_ENV': '"production"' } })
  const implementation = await import(pathToFileURL(join(dir, 'host/experiment.mjs')).href)
  const names = await readdir(join(dir, 'browser'))
  const entry = names.find(name => /^browser\.m?js$/u.test(name)); assert.ok(entry)
  const files = new Map(await Promise.all(names.map(async name => [name, await readFile(join(dir, 'browser', name))])))
  const bundles = await collectSplitClientBundles(ROOT)
  assert.deepEqual(bundles.missing, [])
  for (const asset of bundles.assets) files.set(asset.fileName, await readFile(asset.path))
  browser = await chromium.launch({ headless: manual === undefined })
  const reports = []
  for (const scenario of manual ? [`conversation-${manual}`] : ['conversation-allow', 'conversation-reject', 'conversation-revoke', 'conversation-admission']) {
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
        const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
        try {
          const at = cookie.indexOf('=')
          await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin, httpOnly: true, sameSite: 'Strict' }])
          const page = await context.newPage(); const errors = []
          page.on('pageerror', error => errors.push(error.message))
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
  console.log(JSON.stringify({ kind: 'split-conversation-browser', passed: true, actualGatewayGeneration: true,
    ordinaryConversationUi: true, syntheticProvider: true, realProviderDispatches: 0, scenarios: reports }))
} finally { await browser?.close(); await rm(dir, { recursive: true, force: true }) }
