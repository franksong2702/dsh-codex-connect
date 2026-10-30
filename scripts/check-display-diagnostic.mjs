/** Exact production diagnostic plugin and untouched frontend; isolated Host, no models/CUA. */
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { chromium, request as http } from 'playwright';
const candidate = resolve(process.argv[2] ?? '');
assert(process.argv[2], 'Usage: node scripts/check-display-diagnostic.mjs <isolated-candidate> [result.json]');
const root = await realpath(await mkdtemp(join(tmpdir(), 'display-diagnostic-')));
for (const part of ['home', 'workspace']) await mkdir(join(root, part));
await writeFile(join(root, 'owner.json'), JSON.stringify({ kind: 'cua-frontend-production-synthetic' }));
const host = fileURLToPath(new URL('../experiments/terra-cua-worker/frontend/production-host.mjs', import.meta.url));
const child = spawn(process.execPath, [host, root, candidate, '--display-diagnostic'], { cwd: join(root, 'workspace'), env: { PATH: process.env.PATH, HOME: join(root, 'home'), DSH_HOME: join(root, 'home'), DSH_TELEMETRY_DISABLED: '1', OTEL_SDK_DISABLED: 'true' }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
child.stdout.resume(); child.stderr.resume();
const messages = []; child.on('message', value => messages.push(value));
let exit; const exited = new Promise(resolve => child.once('exit', (code, signal) => { exit = { code, signal }; resolve(exit); }));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate, message, timeout = 20000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) { if (await predicate()) return; assert(!exit && !messages.some(row => row.type === 'failure'), 'Synthetic Host startup failed'); await delay(30); }
    throw new Error(message);
}
let browser, context, control, anonymous, page, phase = 'bootstrap', report;
const diagnosticStatuses = [], pageErrors = [];
try {
    await until(() => messages.some(row => row.type === 'ready'), 'Host readiness');
    const ready = messages.find(row => row.type === 'ready'), origin = new URL(ready.url).origin;
    assert.equal(new URL(origin).hostname, '127.0.0.1');
    phase = 'diagnostic-client-graph'; assert(ready.graph.some(row => row.id === 'dsh-codex-display-diagnostic'));
    phase = 'unauthenticated-denial';
    anonymous = await http.newContext({ baseURL: origin });
    assert.equal((await anonymous.post('/codex-display-diagnostic', { data: { action: 'status' }, headers: { Origin: origin, 'Sec-Fetch-Site': 'same-origin' } })).status(), 403);
    phase = 'api-owner-denial'; control = await http.newContext({ baseURL: origin });
    const connect = new URL(ready.url); connect.pathname = '/connect'; connect.searchParams.set('interactions', 'none');
    assert.equal((await control.get(connect.href, { maxRedirects: 0 })).status(), 302);
    assert.equal((await control.post('/codex-display-diagnostic', { data: { action: 'prepare' }, headers: { Origin: origin, 'Sec-Fetch-Site': 'same-origin' } })).status(), 403);
    phase = 'browser-launch'; browser = await chromium.launch({ headless: true }); context = await browser.newContext(); context.setDefaultTimeout(12000);
    let bootExposures = 0;
    await context.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.origin !== origin) return route.abort();
        if ((url.pathname.startsWith('/assets/') && url.pathname.endsWith('.js')) || url.pathname === '/plugins/') {
            const response = await route.fetch(), source = await response.text();
            if (source.includes('const t=new nV(e);')) {
                bootExposures++;
                return route.fulfill({ response, body: source.replace('const t=new nV(e);', 'const t=new nV(e);globalThis.__fixtureNavigation=t;') });
            }
            return route.fulfill({ response });
        }
        return route.continue();
    });
    page = await context.newPage();
    page.on('response', response => { if (new URL(response.url()).pathname === '/codex-display-diagnostic') diagnosticStatuses.push(response.status()); });
    page.on('pageerror', () => pageErrors.push('pageerror'));
    // Expose only the real WebBoot for the same navigation call used by the sidebar.
    // No scope/answer probe, resolver replacement, registration latch or question-bundle edits.
    await page.goto(ready.url);
    const notice = page.getByRole('button', { name: 'Continue', exact: true }); if (await notice.isVisible()) await notice.click();
    phase = 'await-production-navigation';
    await page.waitForFunction(() => window.__fixtureNavigation?.ctx?.uiWorkspace && window.__fixtureNavigation.ctx.connection.generation.getSnapshot());
    assert.equal(bootExposures, 1);
    phase = 'await-session-catalog';
    await page.waitForFunction(() => Boolean(window.__fixtureNavigation.ctx.sessions.list.getSnapshot().byId?.['synthetic-root']), { timeout: 20000 });
    phase = 'open-production-session';
    await page.evaluate(() => window.__fixtureNavigation.ctx.uiWorkspace.openSession('synthetic-root'));
    phase = 'await-session-panel';
    const panel = page.locator('[data-conversation-session="synthetic-root"]');
    await panel.waitFor({ state: 'visible' });
    phase = 'diagnostic-ui-mount';
    const statusProof = await page.evaluate(async () => { const response = await fetch('/codex-display-diagnostic', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'status' }) }); return { status: response.status, body: await response.json() }; });
    assert.equal(statusProof.status, 200, 'Synthetic browser admission: ' + JSON.stringify(statusProof.body));
    const diagnostic = panel.locator('[data-codex-display-diagnostic]'); await diagnostic.waitFor({ state: 'visible' });
    phase = 'negative-isolation';
    const foreignStatus = await page.evaluate(async () => (await fetch('/codex-display-diagnostic', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'prepare', sessionId: 'foreign-root' }) })).status);
    assert.equal(foreignStatus, 403);
    assert.equal(await page.locator('[data-question-key]').count(), 0);
    phase = 'one-inert-question';
    await diagnostic.getByRole('button', { name: '开始一次显示诊断', exact: true }).click();
    const counts = async () => JSON.parse(await diagnostic.locator('[data-diagnostic-counts]').textContent());
    await until(async () => { const row = (await counts()).lastObservation ?? {}; return row.receive === 1 && row.dispatch === 1 && row.pending && row.mounted && row.inViewport && row.visible; }, 'Exact question receive/dispatch/pending/visible mount');
    assert.equal(await panel.locator('[data-question-key]').count(), 1);
    assert.equal(await page.locator('[data-question-key]').count(), 1);
    const observed = await counts();
    assert(!JSON.stringify(observed).includes('synthetic-root'));
    assert.equal(await diagnostic.getByRole('button', { name: '开始一次显示诊断', exact: true }).isEnabled(), false);
    phase = 'active-diagnostic-new-page';
    const second = await context.newPage();
    await second.goto(origin);
    await second.waitForFunction(() => window.__fixtureNavigation?.ctx?.uiWorkspace && window.__fixtureNavigation.ctx.connection.generation.getSnapshot());
    await second.waitForFunction(() => Boolean(window.__fixtureNavigation.ctx.sessions.list.getSnapshot().byId?.['synthetic-root']), { timeout: 20000 });
    await second.evaluate(() => window.__fixtureNavigation.ctx.uiWorkspace.openSession('synthetic-root'));
    const secondDiagnostic = second.locator('[data-conversation-session="synthetic-root"] [data-codex-display-diagnostic]');
    await secondDiagnostic.waitFor({ state: 'visible' });
    await until(async () => { const row = JSON.parse(await secondDiagnostic.locator('[data-diagnostic-counts]').textContent()); return row.lastObservation?.pending && row.lastObservation?.mounted; }, 'Active diagnostic observed on later page');
    assert.equal(await secondDiagnostic.getByRole('button', { name: '开始一次显示诊断', exact: true }).isEnabled(), false);
    await second.close();
    // Stop cancels this diagnostic; never answer a question or permission card.
    await diagnostic.getByRole('button', { name: '停止诊断', exact: true }).click();
    await until(async () => (await counts()).state === 'ended', 'Diagnostic stopped');
    await until(async () => await page.locator('[data-question-key]').count() === 0, 'Question cleanup');
    assert.equal(await diagnostic.getByRole('button', { name: '开始一次显示诊断', exact: true }).isEnabled(), false);
    const statusResponse = await control.post('/fixture', { data: { type: 'status' } }); assert.equal(statusResponse.status(), 200);
    const state = await statusResponse.json(); assert.deepEqual(state.counts, { subprocess: 0, outbound: 0, fetch: 0, model: 0, consentAnswers: 0 });
    report = { result: 'passed', source: 'actual diagnostic package and production Web boot; bootstrap context exposed only for production UI navigation; Gateway/question/diagnostic bundles unchanged', observed, final: await counts(), counts: state.counts, assertions: ['unauthenticated denied', 'API owner denied', 'foreign session payload denied', 'production UI navigation', 'one inert production question', 'finite content-free visible receipt', 'later page observes active diagnostic', 'stop removes card', 'one-shot cannot reuse'], liveAcceptance: false };
} catch (error) {
    let observation;
    try { observation = await page?.evaluate(() => ({ panels: document.querySelectorAll('[data-conversation-session]').length, listPhase: window.__fixtureNavigation?.ctx?.sessions?.list?.getSnapshot()?.phase ?? 'unknown', targetInList: Boolean(window.__fixtureNavigation?.ctx?.sessions?.list?.getSnapshot()?.byId?.['synthetic-root']) })); } catch { /* Synthetic browser not ready. */ }
    const detail = /^(?:page\.(?:evaluate|waitForFunction|goto): [^\n]+|locator\.[^\n]+|TypeError: [^\n]+)/.exec(error.message)?.[0]?.slice(0, 180);
    report = { result: 'failed', phase, error: error.name === 'AssertionError' ? 'assertion' : 'runtime', detail, observation, diagnosticStatuses, pageErrors, hostFailure: messages.find(row => row.type === 'failure'), liveAcceptance: false }; process.exitCode = 1;
}
finally {
    await context?.close(); await browser?.close(); await control?.dispose(); await anonymous?.dispose();
    if (!exit) child.send({ type: 'stop' });
    await Promise.race([exited, delay(10000)]);
    if (!exit) { child.kill('SIGTERM'); await Promise.race([exited, delay(2000)]); }
    if (!exit) { child.kill('SIGKILL'); await exited; }
    report.cleanup = exit; if (exit.code !== 0) { report.result = 'failed'; process.exitCode = 1; }
    await rm(root, { recursive: true, force: true });
    if (process.argv[3]) await writeFile(resolve(process.argv[3]), JSON.stringify(report, null, 2) + '\n');
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
}
