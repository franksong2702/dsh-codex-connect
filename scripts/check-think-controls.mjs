#!/usr/bin/env node
/** Bounded Chromium product/native-control check with a test-only RPC bridge. No daily service. */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { readFile, mkdtemp, mkdir, readdir, rm } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'tsdown'
import { chromium } from 'playwright'
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(join(ROOT, 'package.json'))
const cache = join(ROOT, 'node_modules/.cache')
await mkdir(cache, { recursive: true })
const dir = await mkdtemp(join(cache, 'think-controls-'))
let browser, fixture
let externalRequests = 0
try {
  const version = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8')).version
  await build({ config: false, entry: { host: join(ROOT, 'scripts/think-controls-host.ts') }, outDir: join(dir, 'node'),
    platform: 'node', format: 'esm', target: 'es2024', dts: false, report: false, logLevel: 'silent', deps: { neverBundle: true },
    define: { __CODEX_CONNECT_VERSION__: JSON.stringify(version) } })
  await build({ config: false, entry: { browser: join(ROOT, 'scripts/think-controls-browser.mjs') }, outDir: join(dir, 'browser'),
    platform: 'browser', format: 'esm', target: 'es2022', dts: false, report: false, logLevel: 'silent', deps: { alwaysBundle: [/.*/] },
    define: { 'process.env.NODE_ENV': '"production"' } })
  const names = await readdir(join(dir, 'browser'))
  const entry = names.find(name => /^browser\.m?js$/u.test(name)); assert.ok(entry)
  const files = new Map(await Promise.all(names.map(async name => [name, await readFile(join(dir, 'browser', name))])))
  const nativePackages = []
  for (const [name, id] of [['questions', '@deepseek-ai/dsh-client-ui-user-questions'], ['selection', '@deepseek-ai/dsh-client-ui-model-selection']]) {
    const pkg = JSON.parse(await readFile(require.resolve(`${id}/package.json`), 'utf8'))
    assert.equal(pkg.version, '0.1.2-rc.1')
    const source = await readFile(require.resolve(`${id}/client`))
    files.set(`${name}.js`, source)
    nativePackages.push({ id, version: pkg.version, sha256: createHash('sha256').update(source).digest('hex') })
  }
  const { createThinkControlsHost } = await import(pathToFileURL(join(dir, 'node/host.mjs')).href)
  browser = await chromium.launch({ headless: true })
  const outcomes = []
  for (const scenario of ['approve', 'reject', 'disable-pending', 'cancel']) {
    fixture = await createThinkControlsHost()
    const context = await browser.newContext({ viewport: { width: 1100, height: 1100 }, serviceWorkers: 'block' })
    const errors = []
    try {
      await context.route('**/*', async route => {
        const url = new URL(route.request().url())
        if (url.origin !== 'http://think-controls.invalid') { externalRequests++; return route.abort() }
        if (url.pathname === '/plugins/dsh-codex-connect/models') return route.fulfill({ json: fixture.state().catalog })
        if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
          + names.filter(name => name.endsWith('.css')).map(name => `<link rel="stylesheet" href="/fixture/${name}">`).join('')
          + '<div id="root"></div><pre id="errors"></pre><script type="module" src="/fixture/' + entry + '"></script></html>' })
        const data = files.get(url.pathname.slice('/fixture/'.length))
        if (!url.pathname.startsWith('/fixture/') || !data) {
          errors.push(`Unexpected fixture asset ${url.pathname}`)
          return route.fulfill({ status: 404, body: 'Unknown fixture asset' })
        }
        return route.fulfill({ contentType: url.pathname.endsWith('.css') ? 'text/css' : 'text/javascript', body: data })
      })
      const page = await context.newPage()
      page.on('pageerror', error => {
        errors.push((error.stack ?? error.message).slice(0, 1500))
        const location = error.stack?.match(/\/fixture\/([^\s/:]+):(\d+):/u)
        if (location && files.has(location[1])) errors.push(files.get(location[1]).toString('utf8').split('\n').slice(Number(location[2]) - 3, Number(location[2]) + 2).join('\n').slice(0, 1200))
      })
      const host = fixture
      await page.exposeFunction('__thinkCommand', (name, value) => host.command(name, value))
      await page.goto('http://think-controls.invalid/')
      await page.getByRole('button', { name: /GPT-6 Astra.*Low/ }).waitFor({ timeout: 10000 })
      const toggle = page.getByRole('checkbox', { name: 'Codex native reasoning adjustment (Astra)', exact: true })
      await toggle.check()
      assert.equal(host.state().enabled, false)
      await page.getByRole('button', { name: 'Save changes', exact: true }).click()
      await page.getByRole('button', { name: 'Propose high', exact: true }).click()
      await page.getByRole('radio', { name: 'Change to high', exact: true }).waitFor({ timeout: 10000 })
      assert.equal(host.state().recorded.reasoningEffort, 'low')
      assert.equal(host.state().requests, 1)
      if (scenario === 'disable-pending') {
        await toggle.uncheck(); await page.getByRole('button', { name: 'Save changes', exact: true }).click()
      } else if (scenario === 'cancel') {
        await page.getByRole('button', { name: 'Dismiss all questions', exact: true }).click()
      } else {
        await page.getByRole('radio', { name: scenario === 'approve' ? 'Change to high' : 'Keep current effort', exact: true }).click()
        await page.getByRole('button', { name: 'Submit', exact: true }).click()
      }
      await page.getByRole('radio', { name: 'Change to high', exact: true }).waitFor({ state: 'detached', timeout: 10000 })
      assert.equal(host.state().recorded.reasoningEffort, 'low', 'approval alone must not publish a new effort')
      assert.equal(host.state().requests, 1)
      await page.getByRole('button', { name: 'Continue fixture', exact: true }).click()
      const label = scenario === 'approve' ? 'High' : 'Low'
      await page.getByRole('status', { name: 'Fixture phase' }).filter({ hasText: 'continued' }).waitFor()
      await page.getByRole('button', { name: new RegExp(`GPT-6 Astra.*${label}`) }).waitFor()
      assert.equal(host.state().recorded.reasoningEffort, label.toLowerCase())
      assert.equal(host.state().updates, scenario === 'approve' ? 1 : 0)
      if (scenario === 'approve') {
        await page.getByRole('button', { name: 'Propose medium', exact: true }).click()
        await page.getByRole('radio', { name: 'Change to medium', exact: true }).click()
        await page.getByRole('button', { name: 'Submit', exact: true }).click()
        await page.getByRole('radio', { name: 'Change to medium', exact: true }).waitFor({ state: 'detached' })
        assert.equal(host.state().recorded.reasoningEffort, 'high')
        await page.getByRole('button', { name: 'Continue fixture', exact: true }).click()
        await page.getByRole('button', { name: /GPT-6 Astra.*Medium/ }).waitFor()
        await toggle.uncheck(); await page.getByRole('button', { name: 'Save changes', exact: true }).click()
        await page.evaluate(() => window.__thinkControls.remount())
        await page.getByRole('button', { name: /GPT-6 Astra.*Medium/ }).waitFor()
        assert.equal(host.state().updates, 2)
      }
      assert.equal(host.state().defaultWrites, 0)
      assert.equal(host.state().unexpectedFetches, 0)
      assert.deepEqual(errors, [])
      outcomes.push({ scenario, requests: host.state().requests, finalEffort: host.state().recorded.reasoningEffort, passed: true })
    } catch (error) {
      throw new Error(`${scenario}: ${String(error)}; browser errors=${JSON.stringify(errors)}`, { cause: error })
    } finally { await context.close(); await fixture.dispose(); fixture = undefined }
  }
  assert.equal(externalRequests, 0)
  console.log(JSON.stringify({ kind: 'think-product-native-controls', passed: true, syntheticOnly: true, actualProduct: true,
    actualNativeControls: true, gatewayTransport: false, externalRequests, nativePackages, outcomes }))
} catch (error) {
  console.error(error instanceof Error ? error.message.slice(0, 5000) : String(error))
  process.exitCode = 1
} finally { await fixture?.dispose(); await browser?.close(); await rm(dir, { recursive: true, force: true }) }
