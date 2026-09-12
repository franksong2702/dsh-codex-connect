#!/usr/bin/env node
/** Actual isolated Chromium -> HTTP -> DSH approval -> child -> parent acceptance. No live provider. */
import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'tsdown'
import { chromium } from 'playwright'
import { runSplitHostScenario } from './split-host-fixture.mjs'
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(join(ROOT, 'package.json'))
const importHost = specifier => import(pathToFileURL(require.resolve(specifier)).href)
const dir = await mkdtemp(join(ROOT, '.split-browser-'))
let browser
try {
  const pkg = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'))
  await build({ config: false, entry: { experiment: join(ROOT, 'scripts/split-experiment-entry.ts') }, outDir: join(dir, 'host'),
    platform: 'node', target: 'es2024', format: 'esm', dts: false, clean: true, report: false, logLevel: 'silent',
    deps: { neverBundle: true }, define: { __CODEX_CONNECT_VERSION__: JSON.stringify(pkg.version) } })
  await build({ config: false, entry: { browser: join(ROOT, 'scripts/split-browser-entry.tsx') }, outDir: join(dir, 'browser'),
    platform: 'browser', target: 'es2022', format: 'esm', dts: false, clean: true, report: false, logLevel: 'silent',
    deps: { alwaysBundle: [/.*/] }, define: { 'process.env.NODE_ENV': '"production"' } })
  const implementation = await import(pathToFileURL(join(dir, 'host/experiment.mjs')).href)
  const browserNames = await readdir(join(dir, 'browser'))
  assert.ok(browserNames.length > 0 && browserNames.every(name => /^[\w.-]+\.m?js$/u.test(name)))
  const browserEntry = browserNames.filter(name => /^browser\.m?js$/u.test(name))
  assert.equal(browserEntry.length, 1)
  const browserFiles = new Map(await Promise.all(browserNames.map(async name => [name, await readFile(join(dir, 'browser', name))])))
  browserFiles.set('connection.js', await readFile(require.resolve('@deepseek-ai/dsh-client-connection/client')))
  browser = await chromium.launch({ headless: true })
  let decisionDispatches = 0; let resets = 0
  const report = await runSplitHostScenario('transport-allow', { root: join(dir, 'data'), implementation, importHost,
    async interaction({ ctx, origin, cookie, target, status }) {
      const unregisterIndex = ctx.webServer.register({ kind: 'exact', path: '/', handler(req, res) {
        if (!ctx.connection.authorizeIndex(req, res)) return
        res.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store' })
        res.end(`<!doctype html><meta charset="utf-8"><div id="root"></div><script>window.__splitTarget=${JSON.stringify(target).replaceAll('<', '\\u003c')}</script><script type="module" src="/fixture/${browserEntry[0]}"></script>`)
      } })
      const unregisterBundles = [...browserFiles].map(([name, browserBytes]) => ctx.webServer.register({ kind: 'exact', path: `/fixture/${name}`, handler(req, res) {
        const denied = ctx.connection.requestRejection(req)
        if (denied !== undefined) { res.writeHead(denied); res.end(); return }
        res.writeHead(200, { 'content-type': 'text/javascript', 'cache-control': 'no-store' }); res.end(browserBytes)
      } }))
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
      const errors = []
      try {
        const anonymous = await context.request.post(`${origin}/api/codex-connect/split-approval`, {
          data: { ...target, action: 'status' }, headers: { 'x-dsh-split-request': '1', origin },
        })
        assert.equal(anonymous.status(), 401)
        const at = cookie.indexOf('=')
        await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin, httpOnly: true, sameSite: 'Strict' }])
        const page = await context.newPage()
        page.on('pageerror', error => errors.push(error.message))
        await page.route('**/api/codex-connect/split-approval', async route => {
          const body = route.request().postDataJSON()
          if (body.action === 'decide') {
            decisionDispatches += 1
            // Deliver the real request and lose only its reply. The browser must not retry approval.
            const response = await route.fetch()
            assert.equal(response.status(), 200)
            await route.abort('failed')
          } else await route.continue()
        })
        await page.goto(origin)
        try { await page.getByRole('button', { name: 'Approve once', exact: true }).waitFor({ timeout: 5000 }) }
        catch { throw new Error(`Split fixture did not become ready: ${JSON.stringify({ errors, text: (await page.locator('body').innerText()).slice(0, 1000) })}`) }
        assert.equal(decisionDispatches, 0)
        await page.getByRole('button', { name: 'Approve once', exact: true }).click()
        await page.getByText('The action could not be confirmed.', { exact: false }).waitFor()
        await page.evaluate(() => window.__splitBrowser.reconnect()); resets += 1
        await page.getByRole('status').filter({ hasText: 'Completed' }).waitFor()
        assert.equal(decisionDispatches, 1)
        assert.equal((await status()).view.phase, 'completed')
        await page.reload()
        await page.getByRole('status').filter({ hasText: 'Completed' }).waitFor()
        assert.equal(decisionDispatches, 1)
        assert.equal(await page.getByRole('button', { name: 'Approve once', exact: true }).count(), 0)
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
        assert.deepEqual(errors, [])
      } finally { await context.close(); for (const unregister of unregisterBundles) unregister(); unregisterIndex() }
    },
  })
  assert.equal(decisionDispatches, 1); assert.equal(report.childMockDispatches, 2)
  console.log(JSON.stringify({ kind: 'split-authenticated-browser-e2e', passed: true, browser: 'chromium',
    realDshBrowserAuthentication: true, realHttp: true, connectionController: 'real', generationReadiness: 'fixture',
    lostDecisionReply: true, reconnects: resets, reloadRecovered: true, decisionDispatches,
    childMockDispatches: report.childMockDispatches, syntheticProvider: true, realProviderDispatches: 0 }))
} finally { await browser?.close(); await rm(dir, { recursive: true, force: true }) }
