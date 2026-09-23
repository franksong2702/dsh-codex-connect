#!/usr/bin/env node
/** Stock installed DSH Web -> native Composer/controller -> installed plugin -> fake wire. */
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir, readdir, rm, realpath } from 'node:fs/promises'
import { join, dirname, resolve, delimiter, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { createHash, randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { connect } from 'node:net'
import { chromium } from 'playwright'
import { prepareTaskSession } from './prepare-adaptive-task-session.mjs'
import { scrubCanaryEnvironment } from './canary-environment.mjs'
import { prepareLegacyTaskPackage, replaceFixtureTaskPackage, publicationPauseJourney } from './adaptive-task-publication-session.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const args = process.argv.slice(2)
const phase2 = args.includes('--phase2')
const currentHostPaused = args.includes('--current-host-paused')
const manifests = args.filter(arg => arg !== '--phase2' && arg !== '--current-host-paused')
assert.equal(phase2 && currentHostPaused, false, 'Select one installed Session scenario')
assert.ok(manifests.length <= 1 && !manifests.some(arg => arg.startsWith('--')))
const f = manifests[0] ? JSON.parse(await readFile(resolve(manifests[0]), 'utf8'))
  : await prepareTaskSession(root, currentHostPaused ? '0.1.7-rc.1' : undefined)
assert.match(f.directory, /\/codex-task-session-[^/]+$/)
for (const name of ['home', 'workspace', 'install', 'source']) assert.equal(f[name], join(f.directory, name))
assert.equal(JSON.parse(await readFile(join(f.directory, 'fixture-owner.json'), 'utf8')).kind, 'codex-task-session-offline')
const output = join(root, 'output/playwright', phase2 ? 'task-session-phase2' : 'task-session', basename(f.directory))
await mkdir(output, { recursive: true })
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
assert.equal(hash(await readFile(f.artifact)), f.artifactSha256)
const plugin = join(f.home, 'profiles/web/node_modules/dsh-codex-connect')
const identity = {}
const sourceFiles = (await readdir(join(f.source, 'lib'))).sort()
assert.deepEqual((await readdir(join(plugin, 'lib'))).sort(), sourceFiles)
for (const file of sourceFiles.map(name => 'lib/' + name)) {
  const installedHash = hash(await readFile(join(plugin, file)))
  assert.equal(installedHash, hash(await readFile(join(f.source, file))))
  identity[file] = installedHash
}
const hostRequire = createRequire(join(f.install, 'package.json'))
const pluginRequire = createRequire(join(plugin, 'package.json'))
for (const [name, expected] of Object.entries(f.vendorPackages ?? {})) {
  const path = hostRequire.resolve(name + '/package.json')
  const { version } = JSON.parse(await readFile(path, 'utf8'))
  assert.equal(version, expected)
  identity[name] = { path, version }
}
for (const name of ['dsh', 'dsh-agent', 'dsh-session', 'dsh-client-ui-conversation', 'dsh-api-session-controller', 'dsh-host-webserver']) {
  const path = hostRequire.resolve(`@deepseek-ai/${name}/package.json`)
  const { version } = JSON.parse(await readFile(path, 'utf8'))
  assert.equal(version, f.version)
  identity[name] = { path, version }
}
const publicationPaused = /ADAPTIVE_TASK_PUBLIC_RELEASE: boolean = false/.test(await readFile(join(f.source, 'src/adaptive-task-publication.ts'), 'utf8'))
if (publicationPaused && !currentHostPaused) assert.equal(phase2, true, 'Run closed-release upgrade acceptance with --phase2')
if (currentHostPaused) assert.equal(publicationPaused, true, 'Current-host pause acceptance requires a paused release')
const path = '/plugins/dsh-codex-connect/task'
const checks = [], pids = [], browserErrors = [], blockedBrowser = [], mutations = [], taskReads = []
const redact = value => String(value).replace(/(https?:\/\/127\.0\.0\.1:\d+\/?)\?[^\s"'<>]+/g, '$1?[redacted]')
let child, context, page, host, error, cleanup = false
const pass = name => { checks.push(name); console.log(`PASS ${name}`) }
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
const events = async () => (await readFile(join(f.directory, 'events.jsonl'), 'utf8')).trim().split('\n').filter(Boolean).map(line => JSON.parse(line))
const requests = async () => (await events()).filter(event => event.kind === 'provider-request')
async function until(predicate, message) {
  const deadline = Date.now() + 15000
  while (Date.now() < deadline) { if (await predicate()) return; await pause(50) }
  throw new Error(message)
}
async function start(port = '0') {
  const env = { ...scrubCanaryEnvironment(process.env), PATH: dirname(process.execPath) + delimiter + process.env.PATH, DSH_HOME: f.home,
    DSH_TELEMETRY_MODE: 'DISABLED', OTEL_SDK_DISABLED: 'true', CODEX_TASK_SESSION_FIXTURE: f.directory,
    CODEX_TASK_SESSION_PHASE2: phase2 ? '1' : '0',
    // Stock auto-picker chooses its browser backend on an unattended host.
    SSH_CONNECTION: '127.0.0.1 1 127.0.0.1 1',
    NODE_OPTIONS: '--import ' + fileURLToPath(new URL('./adaptive-task-session-mock.mjs', import.meta.url)) }
  child = spawn(f.binary, ['web', '--no-open', '--host', '127.0.0.1', '--port', port], {
    cwd: f.workspace, env, stdio: ['ignore', 'pipe', 'pipe'],
  })
  pids.push(child.pid)
  let buffer = '', result
  const read = data => {
    buffer += data.toString().replace(/\x1b\[[0-9;]*m/g, '')
    const authorized = (buffer.match(/http:\/\/127\.0\.0\.1:\d+[^\s]*/g) ?? []).find(url => url.includes('?'))
    if (authorized) result = { authorized, origin: new URL(authorized).origin }
  }
  child.stdout.on('data', read); child.stderr.on('data', read)
  await until(() => { assert.equal(child.exitCode, null, 'temporary host exited before readiness: ' + redact(buffer.slice(-6000))); return result }, 'Host readiness deadline')
  host = result
}
async function stop() {
  if (!child || child.exitCode !== null || child.signalCode !== null) return
  const exited = once(child, 'exit')
  child.kill('SIGTERM')
  const timer = setTimeout(() => child.kill('SIGKILL'), 10000)
  try { const [code, signal] = await exited; assert.equal(signal, null); assert.equal(code, 0) } finally { clearTimeout(timer) }
}
async function panel(mode, reserved) {
  // The stock shell may render plugin slots before its Session controller has
  // restored the live agent. Wait for the native Composer's actual ready state.
  await page.locator('[data-composer-input][contenteditable="true"]').waitFor()
  const request = page.waitForRequest(r => new URL(r.url()).pathname === path && r.method() === 'GET')
  await page.getByRole('button', { name: 'Model choice', exact: true }).click()
  const url = (await request).url()
  const labels = { off: 'Manual selection; automation is off', manual: 'Manual selection; automation is off',
    auto: 'Automatic selection is allowed', stopped: 'Task stopped',
    interrupted: 'Interrupted; your confirmation is required before continuing', limit: 'Request limit reached' }
  await page.getByRole('dialog').getByRole('status').filter({ hasText: labels[mode] }).waitFor()
  assert.ok((await page.getByRole('dialog').innerText()).includes(`Requests reserved: ${reserved} /`))
  // Read-only corroboration with the same browser cookie. Avoid CDP response-body
  // retrieval across host restarts; all actions and primary assertions remain UI-driven.
  const result = await context.request.get(url, { timeout: 10000 })
  assert.equal(result.status(), 200)
  const state = await result.json()
  assert.equal(state.mode, mode); assert.equal(state.reserved, reserved)
  return state
}
const closePanel = () => page.getByRole('button', { name: 'Close', exact: true }).click()
async function allowLunaMax() {
  await page.getByText('Allowed main models and effort levels', { exact: true }).click()
  await page.getByRole('checkbox', { name: /^gpt-5\.6-luna:/ }).check()
  await page.getByRole('checkbox', { name: 'gpt-5.6-luna / max', exact: true }).check()
  await page.getByText('Main model and effort allowed if started now: gpt-5.6-sol: medium; gpt-5.6-luna: max', { exact: true }).waitFor()
}
async function send(message, expectedCount, completed = true) {
  const count = await page.getByText('SESSION_FIXTURE_COMPLETE: original requirement retained.', { exact: true }).count()
  await page.locator('[data-composer-input]').fill(message)
  await page.getByRole('button', { name: 'Send message', exact: true }).click()
  await until(async () => (await requests()).length === expectedCount, 'Expected synthetic wire request count')
  if (completed) await until(async () => await page.getByText('SESSION_FIXTURE_COMPLETE: original requirement retained.', { exact: true }).count() === count + 1, 'Native conversation did not render final answer')
}
async function picker(kind, choice) {
  await page.getByRole('button', { name: /^Select model, current/ }).click()
  await page.getByRole('menuitem', { name: new RegExp(`^${kind} `) }).click()
  await page.getByRole('menuitemradio', { name: choice, exact: true }).click()
}
async function currentHostPausedJourney() {
  await page.locator('[data-composer-input][contenteditable="true"]').waitFor()
  assert.equal(await page.getByRole('button', { name: 'Model choice', exact: true }).count(), 0)
  assert.equal(await page.getByRole('button', { name: 'Existing task controls', exact: true }).count(), 0)
  await until(() => taskReads.at(-1)?.url !== undefined, 'Current Session task state was not read')
  const taskUrl = taskReads.at(-1).url
  const stateResponse = await context.request.get(taskUrl)
  assert.equal(stateResponse.status(), 200)
  const state = await stateResponse.json()
  assert.equal(state.mode, 'off')
  assert.equal(state.canStart, false)
  const sessionId = new URL(taskUrl).searchParams.get('sessionId')
  assert.ok(sessionId)
  const mutation = await context.request.post(host.origin + path, { headers: { origin: host.origin }, data: {
    sessionId, action: 'start', revision: state.revision, operationId: randomUUID(),
    models: ['gpt-5.6-sol'], efforts: { 'gpt-5.6-sol': ['medium'] }, maximumRequests: 1,
  } })
  assert.equal(mutation.status(), 409)
  assert.deepEqual(await mutation.json(), { error: 'TASK_PUBLIC_RELEASE_PAUSED' })
  assert.equal((await requests()).length, 0)
  pass('stock current DSH Session renders ordinary Composer but rejects paused task activation')
  await page.getByRole('button', { name: 'New session', exact: true }).last().click()
  await page.getByRole('textbox', { name: /^Describe what you want to build/ }).waitFor()
  assert.equal(await page.getByRole('button', { name: 'Model choice', exact: true }).count(), 0)
  assert.equal(await page.getByRole('button', { name: 'Existing task controls', exact: true }).count(), 0)
  pass('fresh Session exposes no paused automation controls')
}
async function delegationJourney() {
  await writeFile(join(f.workspace, 'notes.txt'), 'approved first\nsecond')
  await allowLunaMax()
  await page.getByRole('button', { name: 'Start with these limits', exact: true }).click()
  await page.getByRole('button', { name: 'Prepare task upgrade', exact: true }).click()
  await page.getByText('No delegation permission', { exact: true }).waitFor()
  const grant = async (loseResponse = false) => {
    await page.getByText('Set explicit helper scope', { exact: true }).click()
    await page.getByRole('checkbox', { name: 'Child gpt-5.6-luna / max', exact: true }).check()
    await page.getByRole('textbox', { name: 'Approved text files (workspace-relative, one per line)', exact: true }).fill('notes.txt')
    assert.equal(await page.getByRole('button', { name: 'Authorize exactly this scope' }).isEnabled(), false)
    await page.getByRole('checkbox', { name: /I reviewed these files/ }).check()
    let dropped = 0
    const lose = async route => {
      if (route.request().method() !== 'POST') return route.continue()
      const response = await route.fetch(); assert.equal(response.status(), 200)
      assert.equal((await response.json()).delegation.enabled, true); dropped++; await route.abort('connectionreset')
    }
    const before = mutations.length
    if (loseResponse) await page.route('**' + path, lose)
    await page.getByRole('button', { name: 'Authorize exactly this scope', exact: true }).click()
    if (loseResponse) {
      await page.getByRole('alert').filter({ hasText: 'did not return a confirmed result' }).waitFor()
      assert.equal(await page.getByRole('button', { name: 'Authorize exactly this scope' }).isEnabled(), false)
      await page.unroute('**' + path, lose)
      await page.getByRole('button', { name: 'Read state again', exact: true }).click()
      assert.equal(dropped, 1); assert.equal(mutations.length, before + 1)
    }
    await page.getByText('Read-only delegation is authorized for:', { exact: true }).waitFor()
  }
  await grant(true)
  assert.equal((await requests()).length, 0)
  await page.getByRole('button', { name: 'Resume with the same limits', exact: true }).click()
  await page.getByText('Automatic selection is allowed', { exact: true }).waitFor(); await closePanel()
  pass('explicit upgrade and file/model disclosure; lost consent response does not replay')
  await send('ORIGINAL_REQUIREMENT_P2 DELEGATE_P2: inspect approved notes.', 5)
  let wire = await requests()
  assert.deepEqual(wire.filter(r => !r.auxiliary).map(r => [r.model, r.effort]), [['gpt-5.6-sol', 'medium'], ['gpt-5.6-luna', 'max'], ['gpt-5.6-luna', 'max'], ['gpt-5.6-sol', 'medium']])
  assert.equal(wire.filter(r => r.auxiliary).length, 1)
  assert.ok(wire.filter(r => !r.child).every(r => r.originalRetained))
  assert.ok(wire.filter(r => r.child).every(r => r.tools.length === 2 && r.tools.includes('read_task_evidence') && r.tools.includes('submit_task_findings')))
  const complete = await panel('auto', 5)
  assert.equal(complete.delegation.runs.length, 1)
  assert.equal(complete.delegation.runs[0].state, 'succeeded'); assert.equal(complete.delegation.runs[0].cleanup, 'verified')
  assert.equal(complete.delegation.runs[0].delivery, 'recorded')
  await page.screenshot({ path: join(output, 'delegation.png'), fullPage: true }); await closePanel()
  pass('installed Composer to restricted child; four model requests plus native title request share five debits')
  await page.getByRole('button', { name: 'New session', exact: true }).last().click()
  await page.getByRole('textbox', { name: /^Describe what you want to build/ }).waitFor()
  assert.equal((await panel('off', 0)).delegation, undefined); await closePanel()
  await page.getByRole('treeitem', { name: /^ORIGINAL_REQUIREMENT_P2/ }).click()
  await panel('auto', 5); await closePanel()
  const port = new URL(host.origin).port
  await stop(); await start(port); await page.reload()
  const restored = await panel('interrupted', 5)
  assert.equal(restored.delegation.runs[0].id, complete.delegation.runs[0].id)
  assert.equal((await requests()).length, 5); assert.notEqual(pids[0], pids[1])
  await page.getByRole('button', { name: 'Resume with the same limits', exact: true }).click()
  await page.getByText('Automatic selection is allowed', { exact: true }).waitFor(); await closePanel()
  await send('CONTINUE_P2: retain original requirement without another child.', 6)
  assert.equal((await requests()).at(-1).originalRetained, true)
  pass('new Session stays off; fresh host restores interrupted history and count without replay')
  await panel('auto', 6)
  await page.getByRole('button', { name: 'Take over manually', exact: true }).click()
  await page.getByText('Manual selection; automation is off', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Remove helper permission', exact: true }).click()
  await page.getByRole('button', { name: 'Archive and return to Phase 1 manual', exact: true }).click()
  await page.getByRole('button', { name: 'Prepare task upgrade', exact: true }).waitFor()
  assert.ok((await page.getByRole('dialog').innerText()).includes('Requests reserved: 6 /'))
  await page.getByRole('button', { name: 'Prepare task upgrade', exact: true }).click()
  await page.getByText('No delegation permission', { exact: true }).waitFor()
  assert.ok((await page.getByRole('dialog').innerText()).includes('Requests reserved: 6 /'))
  pass('verified archive downgrade and re-upgrade preserve spent count and child provenance without permission')
  await grant()
  await page.getByRole('button', { name: 'Resume with the same limits', exact: true }).click()
  await page.getByText('Automatic selection is allowed', { exact: true }).waitFor(); await closePanel()
  await send('DELEGATE_P2 HOLD_CHILD_P2: wait for native Stop.', 8, false)
  await page.getByRole('button', { name: 'Stop generating', exact: true }).click()
  await until(async () => (await events()).some(e => e.kind === 'provider-aborted' && e.child), 'Native Stop did not abort the child')
  const stopped = await panel('stopped', 8)
  assert.equal(stopped.delegation.runs.length, 2)
  assert.equal(stopped.delegation.runs[1].cleanup, 'verified')
  await pause(400); assert.equal((await requests()).length, 8)
  pass('native Session Stop aborts active child and preserves all eight debits')
  await page.getByRole('button', { name: 'Take over manually', exact: true }).click()
  await page.getByText('Manual selection; automation is off', { exact: true }).waitFor(); await closePanel()
  await picker('Model', 'GPT-5.6 Terra'); await picker('Effort', 'High')
  await send('MANUAL_P2: selected Terra High.', 9)
  await picker('Effort', 'Default'); await send('DEFAULT_P2: provider default effort.', 10)
  wire = await requests()
  assert.deepEqual([wire[8].model, wire[8].effort], ['gpt-5.6-terra', 'high'])
  assert.equal(wire[9].model, 'gpt-5.6-terra'); assert.equal(wire[9].effort, undefined)
  assert.ok(!wire[9].tools.includes('delegate_task')); assert.ok(!wire[9].tools.includes('codex_connect_change_work_model'))
  await panel('manual', 8)
  await page.screenshot({ path: join(output, 'manual.png'), fullPage: true }); await closePanel()
  pass('native picker honors manual Terra High and Default; no delegation or automatic debit remains')
}
try {
  // A fixture may be supplied to avoid repeating dependency installation, but must be unused.
  const existing = await readFile(join(f.home, 'storages/workspace.json'), 'utf8').catch(() => '')
  assert.ok(!existing || JSON.parse(existing).global.workspaceIds.length === 0, 'Use a fresh fixture, never reuse user sessions')
  if (publicationPaused && !currentHostPaused) {
    await writeFile(join(f.workspace, 'notes.txt'), 'approved first\nsecond')
    await replaceFixtureTaskPackage(f, plugin, await prepareLegacyTaskPackage(f))
  }
  await start()
  if (!currentHostPaused) {
    // Legacy host boot creates profile module fallback links; rc.1 instead
    // uses a process-local resolver and is covered by check:dsh-install.
    for (const [name, value] of Object.entries(identity)) {
      if (!value?.path || name === 'dsh') continue
      const packageName = name.startsWith('@') ? name : '@deepseek-ai/' + name
      assert.equal(await realpath(pluginRequire.resolve(packageName + '/package.json')), await realpath(value.path))
    }
  }
  await writeFile(join(f.directory, 'host-origin.json'), JSON.stringify({ origin: host.origin }), { mode: 0o600 })
  assert.ok(!['3080', '3081'].includes(new URL(host.origin).port))
  context = await chromium.launchPersistentContext(join(f.directory, 'browser'), { headless: true, viewport: { width: 1400, height: 1000 } })
  context.setDefaultTimeout(12000)
  context.setDefaultNavigationTimeout(15000)
  await context.route('**/*', route => {
    if (new URL(route.request().url()).origin === host.origin) return route.continue()
    blockedBrowser.push(new URL(route.request().url()).origin); return route.abort()
  })
  await context.routeWebSocket('**/*', socket => {
    if (new URL(socket.url()).origin.replace(/^ws/, 'http') === host.origin) return socket.connectToServer()
    blockedBrowser.push(new URL(socket.url()).origin); socket.close()
  })
  page = context.pages()[0] ?? await context.newPage()
  page.on('pageerror', error => browserErrors.push(error.message))
  page.on('response', response => {
    if (new URL(response.url()).pathname === path && response.request().method() === 'GET') taskReads.push({ status: response.status(), url: response.url() })
  })
  page.on('requestfailed', request => {
    if (new URL(request.url()).pathname === path && request.method() === 'GET') taskReads.push({ failure: request.failure()?.errorText })
  })
  page.on('request', request => {
    if (new URL(request.url()).pathname === path && request.method() === 'POST') mutations.push(request.postDataJSON())
  })
  await page.goto(host.authorized)
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.getByRole('button', { name: 'Add workspace', exact: true }).click()
  await page.getByRole('button', { name: 'Edit path', exact: true }).click()
  await page.locator('input').last().fill(f.workspace)
  await page.locator('input').last().press('Enter')
  await page.getByRole('button', { name: 'Open', exact: true }).click()
  if (currentHostPaused) await currentHostPausedJourney()
  else if (publicationPaused) await publicationPauseJourney({ f, plugin, page, context, panel, closePanel, allowLunaMax, send, picker,
    requests, events, until, pass, stop, start, origin: () => host.origin, taskReads, mutations })
  else {
  await page.getByRole('button', { name: 'Model choice', exact: true }).waitFor()
  const initial = await panel('off', 0)
  assert.equal(initial.canStart, true)
  assert.equal((await requests()).length, 0)
  pass('stock installed shell, native empty Session, opt-in off')
  if (phase2) await delegationJourney()
  else {
  await allowLunaMax()
  await page.getByRole('spinbutton', { name: 'Request limit (whole task)' }).fill('6')
  let dropped = 0
  const loseStartResponse = async route => {
    if (route.request().method() !== 'POST') return route.continue()
    const response = await route.fetch()
    assert.equal(response.status(), 200)
    assert.equal((await response.json()).mode, 'auto')
    dropped++; await route.abort('connectionreset')
  }
  await page.route('**' + path, loseStartResponse)
  await page.getByRole('button', { name: 'Start with these limits', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: 'did not return a confirmed result' }).waitFor()
  assert.equal(await page.getByRole('button', { name: 'Start with these limits' }).isDisabled(), true)
  await page.unroute('**' + path, loseStartResponse)
  await page.getByRole('button', { name: 'Read state again', exact: true }).click()
  await page.getByText('Automatic selection is allowed', { exact: true }).waitFor()
  assert.equal(dropped, 1); assert.equal(mutations.length, 1)
  assert.deepEqual([...mutations[0].models].sort(), ['gpt-5.6-luna', 'gpt-5.6-sol'])
  assert.deepEqual(mutations[0].efforts, { 'gpt-5.6-sol': ['medium'], 'gpt-5.6-luna': ['max'] })
  assert.equal((await requests()).length, 0)
  pass('explicit narrow consent; lost mutation response reconciles without replay')
  await closePanel()
  await send('ORIGINAL_REQUIREMENT_P1 HANDOFF_TO_LUNA_P1: preserve the original constraint.', 2)
  assert.deepEqual((await requests()).map(r => [r.model, r.effort]), [['gpt-5.6-sol', 'medium'], ['gpt-5.6-luna', 'max']])
  assert.ok((await requests()).every(r => r.originalRetained))
  const active = await panel('auto', 2)
  assert.equal(active.maximumRequests, 6)
  assert.deepEqual(active.current, { model: 'gpt-5.6-luna', effort: 'max' })
  await page.screenshot({ path: join(output, 'handoff.png'), fullPage: true })
  await closePanel()
  pass('real Composer sends Sol/Medium then tool-led Luna/Max; one root counter')
  await page.getByRole('button', { name: 'New session', exact: true }).last().click()
  await page.getByRole('textbox', { name: /^Describe what you want to build/ }).waitFor()
  await panel('off', 0); await closePanel()
  await page.getByRole('treeitem', { name: /^ORIGINAL_REQUIREMENT_P1/ }).click()
  await page.getByRole('button', { name: 'Select model, current GPT-5.6 Luna, reasoning effort Max', exact: true }).waitFor()
  await panel('auto', 2); await closePanel()
  await page.reload()
  await panel('auto', 2); await closePanel()
  assert.equal((await requests()).length, 2)
  pass('native Session switching and reload preserve isolation and do not dispatch')
  const port = new URL(host.origin).port
  await stop(); await start(port)
  await page.reload()
  const interrupted = await panel('interrupted', 2)
  assert.equal(interrupted.maximumRequests, 6)
  await pause(700)
  assert.equal((await requests()).length, 2)
  await page.getByRole('button', { name: 'Resume with the same limits', exact: true }).click()
  await page.getByText('Automatic selection is allowed', { exact: true }).waitFor()
  await closePanel()
  assert.equal((await requests()).length, 2)
  await send('RESUMED_P1: continue preserving my original requirement.', 3)
  assert.equal((await requests()).at(-1).originalRetained, true)
  await panel('auto', 3); await closePanel()
  assert.notEqual(pids[0], pids[1])
  pass('fresh host process requires same-browser resume; original history and budget survive')
  await send('HOLD_FOR_STOP_P1: await the native Stop button.', 4, false)
  await page.getByRole('button', { name: 'Stop generating', exact: true }).click()
  await until(async () => (await events()).some(event => event.kind === 'provider-aborted'), 'Native stop failed to abort wire')
  await panel('stopped', 4)
  await pause(500); assert.equal((await requests()).length, 4)
  pass('ordinary host Stop aborts wire and withdraws automatic work')
  await page.getByRole('button', { name: 'Take over manually', exact: true }).click()
  await page.getByText('Manual selection; automation is off', { exact: true }).waitFor()
  await closePanel()
  await picker('Model', 'GPT-5.6 Terra')
  await picker('Effort', 'High')
  await send('MANUAL_P1: use my selected Terra High.', 5)
  assert.deepEqual([(await requests()).at(-1).model, (await requests()).at(-1).effort], ['gpt-5.6-terra', 'high'])
  await picker('Effort', 'Default')
  await send('DEFAULT_P1: keep provider default effort.', 6)
  const manual = (await requests()).at(-1)
  assert.equal(manual.model, 'gpt-5.6-terra'); assert.equal(manual.effort, undefined)
  assert.equal(manual.tools.includes('codex_connect_change_work_model'), false)
  await panel('manual', 4)
  assert.ok(!(await page.getByRole('dialog').innerText()).includes('No model request yet'))
  await page.screenshot({ path: join(output, 'manual.png'), fullPage: true })
  await closePanel()
  pass('native picker honors manual Terra/High and Default; automatic tool removed')
  await page.getByRole('button', { name: 'New session', exact: true }).last().click()
  await page.getByRole('textbox', { name: /^Describe what you want to build/ }).waitFor()
  await panel('off', 0)
  await allowLunaMax()
  await page.getByRole('spinbutton', { name: 'Request limit (whole task)' }).fill('1')
  await page.getByRole('button', { name: 'Start with these limits', exact: true }).click()
  await page.getByText('Automatic selection is allowed', { exact: true }).waitFor(); await closePanel()
  await send('BUDGET_P1 ORIGINAL_REQUIREMENT_P1 HANDOFF_TO_LUNA_P1: one reservation only.', 7, false)
  await until(async () => !(await page.getByRole('button', { name: 'Stop generating', exact: true }).isVisible()), 'Budget task did not settle')
  await panel('limit', 1)
  await pause(500); assert.equal((await requests()).length, 7)
  pass('shared one-request budget denies the post-handoff dispatch')
  }
  }
  assert.deepEqual(browserErrors, [])
  assert.deepEqual(blockedBrowser, [])
  assert.equal((await events()).filter(event => event.kind === 'blocked-network').length, 0)
  pass('no uncaught browser errors or unexpected network attempts')
} catch (cause) {
  error = cause
  console.error(redact(cause.stack))
  if (page && !page.isClosed()) {
    await page.screenshot({ path: join(output, 'failure.png'), fullPage: true }).catch(() => {})
    await writeFile(join(output, 'failure.txt'), await page.locator('body').innerText().catch(() => 'unavailable'))
  }
} finally {
  await context?.close().catch(cause => { error ??= cause })
  try {
    await stop()
    if (host) {
      await new Promise((resolve, reject) => {
        const socket = connect({ host: '127.0.0.1', port: Number(new URL(host.origin).port) })
        socket.once('connect', () => { socket.destroy(); reject(new Error('Owned listener survived cleanup')) })
        socket.setTimeout(2000, () => { socket.destroy(); reject(new Error('Listener cleanup probe timed out')) })
        socket.once('error', error => error.code === 'ECONNREFUSED' ? resolve() : reject(error))
      })
    }
    cleanup = true
  } catch (cause) { error ??= cause }
  const allEvents = await events().catch(() => [])
  const wire = allEvents.filter(event => event.kind === 'provider-request')
  await writeFile(join(output, 'events.json'), JSON.stringify(allEvents, null, 2))
  // Keep failed fixtures for diagnosis; success needs only redacted evidence,
  // not disposable credentials, browser state or downloaded dependencies.
  let fixtureRemoved = false
  if (!error && cleanup) {
    try { await rm(f.directory, { recursive: true, force: true }); fixtureRemoved = true } catch (cause) { error = cause }
  }
  const report = { kind: 'installed-full-session-synthetic', scenario: currentHostPaused ? 'current-host-paused' : phase2 ? 'phase2-upgrade' : 'phase1', phase: currentHostPaused ? null : phase2 ? 2 : 1, publicationPaused,
    upgradedFrom: publicationPaused && !currentHostPaused ? '0.1.0-alpha.4.41' : undefined, checkedAt: new Date().toISOString(), passed: !error, head: f.head, hostVersion: f.version,
    artifactSha256: f.artifactSha256, identity, installer: f.installer, node: process.version, checks, pids, wire, mutations: mutations.map(({ action, revision }) => ({ action, revision })),
    browserErrors, blockedBrowser, taskReads: taskReads.map(({ status, failure }) => ({ status, failure })), cleanup, hostOrigin: host?.origin, syntheticCredentials: true, realProviderRequests: 0,
    fullInstalledSessionPage: true, fullDailyProfileAcceptance: false,
    fixtureDirectory: f.directory, fixtureRemoved, failure: error ? redact(error.message) : undefined }
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ passed: !error, checks: checks.length, cleanup, report: join(output, 'report.json') }))
  if (error) process.exitCode = 1
}
