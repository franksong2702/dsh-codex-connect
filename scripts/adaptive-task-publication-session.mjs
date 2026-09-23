/** Release-pause upgrade acceptance on an owned synthetic profile, never a user profile. */
import assert from 'node:assert/strict'
import { cp, mkdir, readFile, readdir, realpath, rm } from 'node:fs/promises'
import { join, sep } from 'node:path'
import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { scrubCanaryEnvironment } from './canary-environment.mjs'

const LEGACY = '0.1.0-alpha.4.41'
// Immutable public npm archive, independently read back before the pause PR.
const LEGACY_SHA256 = '0823648f3db055a8e12f7bdbac8b23de9d25d4b9f0c6c91794fe21dd3207ed81'
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
export async function prepareLegacyTaskPackage(f) {
  assert.match(f.directory, /\/codex-task-session-[^/]+$/)
  const target = join(f.directory, 'legacy-package'); await mkdir(target)
  const env = { ...scrubCanaryEnvironment(process.env), npm_config_userconfig: join(f.directory, 'empty.npmrc'),
    npm_config_cache: join(f.directory, 'legacy-npm-cache') }
  delete env.NODE_OPTIONS; delete env.NODE_PATH
  const cli = process.env.MATRIX_NPM_CLI
  const [packed] = JSON.parse(execFileSync(cli ? process.execPath : 'npm', [...(cli ? [cli] : []),
    'pack', `dsh-codex-connect@${LEGACY}`, '--registry=https://registry.npmjs.org', '--ignore-scripts', '--json', '--pack-destination', target],
  { cwd: target, env, encoding: 'utf8', timeout: 90000 }))
  assert.equal(packed.filename, `dsh-codex-connect-${LEGACY}.tgz`)
  const archive = join(target, packed.filename)
  assert.equal(digest(await readFile(archive)), LEGACY_SHA256, 'Legacy fixture must use the original public package bytes')
  const entries = execFileSync('tar', ['-tzf', archive], { encoding: 'utf8' }).trim().split('\n')
  assert.ok(entries.every(path => path.startsWith('package/') && !path.split('/').includes('..')))
  execFileSync('tar', ['-xzf', archive, '-C', target])
  const source = join(target, 'package')
  const manifest = JSON.parse(await readFile(join(source, 'package.json'), 'utf8'))
  assert.equal(manifest.name, 'dsh-codex-connect'); assert.equal(manifest.version, LEGACY)
  return source
}
export async function replaceFixtureTaskPackage(f, plugin, source) {
  const actual = await realpath(plugin)
  assert.ok(actual.startsWith(f.directory + sep), 'Never replace a shared or daily installation')
  assert.ok((await realpath(source)).startsWith(f.directory + sep))
  // Remove entries instead of overwriting potentially hardlinked package-store files.
  await rm(join(actual, 'lib'), { recursive: true })
  await cp(join(source, 'lib'), join(actual, 'lib'), { recursive: true })
  await rm(join(actual, 'package.json'))
  await cp(join(source, 'package.json'), join(actual, 'package.json'))
  const names = (await readdir(join(source, 'lib'))).sort()
  assert.deepEqual((await readdir(join(actual, 'lib'))).sort(), names)
  for (const name of names) assert.equal(digest(await readFile(join(actual, 'lib', name))), digest(await readFile(join(source, 'lib', name))))
}
export async function publicationPauseJourney(o) {
  const { f, plugin, page, context, panel, closePanel, allowLunaMax, send, picker, requests, events, until,
    pass, stop, start, origin, taskReads, mutations } = o
  const path = '/plugins/dsh-codex-connect/task'
  const read = async url => {
    const result = await context.request.get(url)
    assert.equal(result.status(), 200); return result.json()
  }
  const newSession = async () => {
    await page.getByRole('button', { name: 'New session', exact: true }).last().click()
    await page.getByRole('textbox', { name: /^Describe what you want to build/ }).waitFor()
  }
  // Create genuine v1/v2 grants through the old published UI, with synthetic models only.
  await panel('off', 0); await allowLunaMax()
  await page.getByRole('button', { name: 'Start with these limits', exact: true }).click()
  await page.getByText('Automatic selection is allowed', { exact: true }).waitFor(); await closePanel()
  // The legacy v1 route does not dispatch a native title request in this fixture.
  // Exercise two explicit main turns, and verify both real debits rather than inventing an auxiliary request.
  await send('ORIGINAL_REQUIREMENT_P2 UPGRADE_V1_P2: retain this task through the release pause.', 1)
  await send('UPGRADE_V1_P2 FOLLOWUP_P2: keep the original requirement and answer normally.', 2)
  await panel('auto', 2); const v1Url = taskReads.at(-1).url; await closePanel()
  await newSession(); await panel('off', 0); await allowLunaMax()
  await page.getByRole('button', { name: 'Start with these limits', exact: true }).click()
  await page.getByRole('button', { name: 'Prepare task upgrade', exact: true }).click()
  await page.getByText('No delegation permission', { exact: true }).waitFor()
  await page.getByText('Set explicit helper scope', { exact: true }).click()
  await page.getByRole('checkbox', { name: 'Child gpt-5.6-luna / max', exact: true }).check()
  await page.getByRole('textbox', { name: 'Approved text files (workspace-relative, one per line)', exact: true }).fill('notes.txt')
  await page.getByRole('checkbox', { name: /I reviewed these files/ }).check()
  await page.getByRole('button', { name: 'Authorize exactly this scope', exact: true }).click()
  await page.getByText('Read-only delegation is authorized for:', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Resume with the same limits', exact: true }).click()
  await page.getByText('Automatic selection is allowed', { exact: true }).waitFor(); await closePanel()
  await send('ORIGINAL_REQUIREMENT_P2 UPGRADE_V2_P2 DELEGATE_P2: inspect approved notes.', 7)
  const completed = await panel('auto', 5); const v2Url = taskReads.at(-1).url; await closePanel()
  assert.equal(completed.delegation.runs[0].cleanup, 'verified')
  assert.notEqual(v1Url, v2Url)
  pass('published 4.41 creates genuine v1/v2 grants and a completed restricted child with retained accounting')
  await send('DELEGATE_P2 HOLD_CHILD_P2: interrupt this owned child at package upgrade.', 9, false)
  const before = await read(v2Url)
  assert.equal(before.reserved, 7)
  const port = new URL(origin()).port
  await stop()
  assert.ok((await events()).some(e => e.kind === 'provider-aborted' && e.child))
  await replaceFixtureTaskPackage(f, plugin, f.source)
  await start(port); await page.reload()
  await page.getByRole('button', { name: 'Existing task controls', exact: true }).waitFor()
  const restored = await read(v2Url)
  assert.ok(['interrupted', 'stopped'].includes(restored.mode)); assert.equal(restored.reserved, before.reserved)
  assert.equal(restored.canStart, false); assert.equal(restored.delegation.version, 2)
  assert.equal((await requests()).length, 9)
  pass('rebuilt closed package restores v2 after active-child shutdown without replay or debit reset')
  const recovery = async () => {
    await page.getByRole('button', { name: 'Existing task controls', exact: true }).click()
    await page.getByRole('button', { name: 'Take over manually', exact: true }).waitFor({ state: 'visible' })
    await until(() => page.getByRole('button', { name: 'Take over manually', exact: true }).isEnabled(), 'Recovery state not ready')
    assert.equal(await page.getByRole('checkbox').count(), 0)
    for (const name of ['Model choice', 'Start with these limits', 'Resume with the same limits', 'Prepare task upgrade', 'Authorize exactly this scope']) {
      assert.equal(await page.getByRole('button', { name, exact: true }).count(), 0)
    }
  }
  await recovery()
  const state = await read(v2Url), sessionId = new URL(v2Url).searchParams.get('sessionId')
  for (const action of ['start', 'resume', 'upgrade', 'delegate-enable']) {
    const result = await context.request.post(origin() + path, { headers: { origin: origin() }, data: {
      sessionId, action, revision: state.revision, operationId: randomUUID(),
      ...(action === 'start' ? { models: ['gpt-5.6-sol'], efforts: { 'gpt-5.6-sol': ['medium'] }, maximumRequests: 10 } : {}),
      ...(action === 'delegate-enable' ? { files: ['notes.txt'], routes: [{ model: 'gpt-5.6-sol', effort: 'medium' }], maxChildRequests: 1, timeoutMs: 1000, disclose: true } : {}),
    } })
    assert.equal(result.status(), 409); assert.deepEqual(await result.json(), { error: 'TASK_PUBLIC_RELEASE_PAUSED' })
  }
  assert.equal((await read(v2Url)).revision, state.revision)
  pass('no activation UI and cached-client start/resume/upgrade/delegation all rejected without state changes')
  let lost = 0
  const lose = async route => {
    if (route.request().method() !== 'POST') return route.continue()
    const result = await route.fetch(); assert.equal(result.status(), 200)
    assert.equal((await result.json()).mode, 'manual'); lost++; await route.abort('connectionreset')
  }
  const previousMutations = mutations.length
  await page.route('**' + path, lose)
  await page.getByRole('button', { name: 'Take over manually', exact: true }).click()
  await page.getByRole('alert').waitFor()
  await page.unroute('**' + path, lose)
  await page.getByRole('button', { name: 'Read state again', exact: true }).click()
  await page.getByText('Recorded state: manual', { exact: false }).waitFor()
  assert.equal(lost, 1); assert.equal(mutations.length, previousMutations + 1)
  assert.equal((await read(v2Url)).reserved, 7); await closePanel()
  pass('existing v2 manual exit remains available; lost successful reply requires readback and never repeats mutation')
  await page.getByRole('treeitem', { name: /UPGRADE_V1_P2/ }).click()
  await page.getByRole('button', { name: 'Existing task controls', exact: true }).waitFor()
  assert.equal((await read(v1Url)).reserved, 2)
  await recovery()
  await page.getByRole('button', { name: 'Stop this task', exact: true }).click()
  await page.getByText('Recorded state: stopped', { exact: false }).waitFor()
  await page.getByRole('button', { name: 'Take over manually', exact: true }).click()
  await page.getByText('Recorded state: manual', { exact: false }).waitFor(); await closePanel()
  await picker('Model', 'GPT-5.6 Terra'); await picker('Effort', 'High')
  await send('MANUAL_P2: continue the old original requirement using Terra High.', 10)
  assert.deepEqual([(await requests()).at(-1).model, (await requests()).at(-1).effort], ['gpt-5.6-terra', 'high'])
  await picker('Effort', 'Default'); await send('DEFAULT_P2: continue without an effort override.', 11)
  const last = (await requests()).at(-1)
  assert.equal(last.effort, undefined); assert.equal(last.originalRetained, true)
  assert.ok(!last.tools.includes('delegate_task') && !last.tools.includes('codex_connect_change_work_model'))
  assert.equal((await read(v1Url)).reserved, 2)
  pass('v1 stop/manual exit preserves history and counters; native Terra High and Default remain ordinary')
  await newSession()
  await until(() => taskReads.at(-1)?.url && ![v1Url, v2Url].includes(taskReads.at(-1).url), 'New Session control read missing')
  const newUrl = taskReads.at(-1).url
  await until(async () => { try { return (await read(newUrl)).mode === 'off' } catch { return false } }, 'New Session did not become ready')
  assert.equal((await read(newUrl)).canStart, false)
  assert.equal(await page.getByRole('button', { name: 'Model choice', exact: true }).count(), 0)
  assert.equal(await page.getByRole('button', { name: 'Existing task controls', exact: true }).count(), 0)
  assert.equal((await requests()).length, 11)
  pass('new installed Sessions expose no collaboration entry or options and create no automation')
}
