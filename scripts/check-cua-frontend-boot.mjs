/** Complete installed production Web bootstrap, isolated from accounts/Native/models. */
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chromium, request as http } from 'playwright';
const candidate = resolve(process.argv[2] ?? '');
assert(process.argv[2], 'Usage: node scripts/check-cua-frontend-boot.mjs <isolated-candidate> [result.json]');
const fixture = fileURLToPath(new URL('../experiments/terra-cua-worker/frontend/', import.meta.url));
const root = await realpath(await mkdtemp(join(tmpdir(), 'cua-frontend-production-')));
for (const part of ['home', 'workspace']) await mkdir(join(root, part));
await writeFile(join(root, 'owner.json'), JSON.stringify({ kind: 'cua-frontend-production-synthetic' }));
const env = { PATH: process.env.PATH, HOME: join(root, 'home'), DSH_HOME: join(root, 'home'), DSH_TELEMETRY_DISABLED: '1', OTEL_SDK_DISABLED: 'true', LANG: 'en_US.UTF-8' };
const child = spawn(process.execPath, [join(fixture, 'production-host.mjs'), root, candidate], { cwd: join(root, 'workspace'), env, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
// Drain without printing/persisting Host launch URLs or raw third-party diagnostics.
let hostOutputBytes = 0;
child.stdout.on('data', bytes => { hostOutputBytes += bytes.length; });
child.stderr.on('data', bytes => { hostOutputBytes += bytes.length; });
const messages = [];
child.on('message', value => { messages.push(value); });
let exit;
const exited = new Promise(resolve => child.once('exit', (code, signal) => { exit = { code, signal }; resolve(exit); }));
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate, message, timeout = 20000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) { if (await predicate()) return; assert(!exit, `Synthetic Host exited during ${message}`); assert(!messages.some(row => row.type === 'failure'), 'Synthetic Host bootstrap failed'); await wait(25); }
    throw new Error(message);
}
let browser, context, control, page, phase = 'host-bootstrap', passed = false, result;
const cases = [], browserErrors = [], hashes = {}, probes = { gateway: 0, shell: 0 };
const digest = data => createHash('sha256').update(data).digest('hex');
try {
    await until(() => messages.some(row => row.type === 'ready'), 'Production Host readiness');
    const ready = messages.find(row => row.type === 'ready'), origin = new URL(ready.url).origin;
    assert.equal(new URL(origin).hostname, '127.0.0.1');
    for (const id of ['dsh-codex-connect', '@deepseek-ai/dsh-cua']) assert(ready.graph.some(row => row.id === id), 'Optional browser contribution missing from real boot graph');
    control = await http.newContext({ baseURL: origin });
    const connect = new URL(ready.url); connect.pathname = '/connect'; connect.searchParams.set('interactions', 'none');
    assert.equal((await control.get(connect.href, { maxRedirects: 0 })).status(), 302);
    const command = async body => { const response = await control.post('/fixture', { data: body }); assert.equal(response.status(), 200); return response.json(); };
    const ask = async kind => (await command({ type: 'ask', kind })).key;
    browser = await chromium.launch({ headless: true, timeout: 15000 });
    context = await browser.newContext(); context.setDefaultTimeout(8000);
    const diagnostics = (await readFile(join(fixture, 'diagnostics.mjs'), 'utf8')).replace('export function ', 'function ');
    const probe = (await readFile(join(fixture, 'browser-probe.mjs'), 'utf8')).replace('export function ', 'function ');
    await context.addInitScript({ content: diagnostics + '\n' + probe + '\nconst fixtureTrace=createFrontendTrace({limit:256});globalThis.__fixtureTrace=()=>fixtureTrace.snapshot();globalThis.__fixtureInstall=ctx=>{globalThis.__fixtureProbe=installFrontendProbe(ctx,fixtureTrace);globalThis.__fixtureProbe.observe(document);};' });
    await context.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.origin !== origin) return route.abort();
        if ((url.pathname.startsWith('/assets/') && url.pathname.endsWith('.js')) || url.pathname === '/plugins/') {
            const response = await route.fetch(), source = await response.text();
            hashes[url.pathname === '/plugins/' ? 'plugin-batch:' + digest(source) : url.pathname] = digest(source);
            let body = source;
            if (source.includes('const t=new nV(e);')) { body = body.replace('const t=new nV(e);', 'const t=new nV(e);globalThis.__fixtureBoot=t;'); probes.shell++; }
            if (source.includes('new ClientRemoteService(ctx);')) { body = body.replace('new ClientRemoteService(ctx);', 'new ClientRemoteService(ctx);globalThis.__fixtureInstall(ctx);'); probes.gateway++; }
            return route.fulfill({ response, body });
        }
        return route.continue();
    });
    page = await context.newPage(); phase = 'browser-bootstrap';
    page.on('pageerror', () => browserErrors.push('pageerror'));
    // Emit BEFORE loading the frontend: no manually gated listener/loader readiness.
    let key = await ask('consent');
    await page.goto(ready.url);
    await page.waitForFunction(() => window.__fixtureBoot?.ctx?.connection.generation.getSnapshot());
    const notice = page.getByRole('button', { name: 'Continue', exact: true });
    if (await notice.isVisible()) await notice.click(); // Preview notice, never an approval.
    phase = 'select-synthetic-session';
    // Same production navigation controller called by the sidebar; no scope fixture.
    await page.evaluate(() => window.__fixtureBoot.ctx.uiWorkspace.openSession('synthetic-root'));
    const visible = async () => {
        const card = page.getByText('Synthetic task approval — no authority', { exact: true });
        await card.waitFor({ state: 'visible' });
        assert.equal(await page.locator('[data-question-key]').count(), 1);
        const box = await card.boundingBox(), viewport = page.viewportSize();
        assert(box && box.width > 0 && box.height > 0 && box.x < viewport.width && box.y < viewport.height && box.x + box.width > 0 && box.y + box.height > 0);
        await page.waitForFunction(() => window.__fixtureTrace().some(row => row.stage === 'mount' && row.inViewport));
    };
    const cancel = async key => { await command({ type: 'cancel', key }); await page.waitForFunction(() => document.querySelectorAll('[data-question-key]').length === 0); };
    await visible(); await cancel(key); cases.push('production-bootstrap-pending-replay');
    phase = 'selection-then-consent';
    key = await ask('select');
    await page.getByText('Synthetic window', { exact: true }).click();
    await page.getByRole('button', { name: /submit/i }).click();
    await until(async () => (await command({ type: 'status' })).pending.find(row => row.key === key).state === 'answered', 'Synthetic selection answer');
    key = await ask('consent'); await visible(); cases.push('production-controller-selection-then-consent');
    phase = 'reconnect';
    const previous = await page.evaluate(() => window.__fixtureTrace().filter(row => row.stage === 'receive').at(-1));
    const oldKey = await page.locator('[data-question-key]').getAttribute('data-question-key');
    await page.evaluate(() => window.__fixtureBoot.ctx.connection.reconnect());
    await page.waitForFunction(({ event, generation }) => {
        const rows = window.__fixtureTrace();
        return ['delivery-abort', 'delivery-drained'].every(stage => rows.some(row => row.stage === stage && row.event === event && row.generation === generation)) &&
            ['receive', 'listener', 'mount'].every(stage => rows.some(row => row.stage === stage && row.event === event && row.generation > generation && (stage !== 'mount' || row.inViewport)));
    }, previous);
    await visible(); assert.notEqual(await page.locator('[data-question-key]').getAttribute('data-question-key'), oldKey);
    await cancel(key); cases.push('production-generation-drain-replay');
    // Normal New session button plus the sidebar's production navigation controller.
    phase = 'navigation';
    await page.getByRole('button', { name: 'New session', exact: true }).first().click();
    await page.waitForFunction(() => !window.__fixtureBoot.ctx.sessions.list.getSnapshot().byId['synthetic-root']?.retainedBy?.mainView);
    key = await ask('consent');
    await page.waitForFunction(() => window.__fixtureBoot.ctx.uiSession.pendingSnapshot.size === 1);
    assert.equal(await page.locator('[data-question-key]').count(), 0);
    await page.evaluate(() => window.__fixtureBoot.ctx.uiWorkspace.openSession('synthetic-root'));
    await visible(); await cancel(key); cases.push('production-navigation-retains-question');
    const state = await command({ type: 'status' });
    assert(state.pending.every(row => row.state !== 'pending'));
    assert.deepEqual(state.counts, { subprocess: 0, outbound: 0, fetch: 0, model: 0, consentAnswers: 0 });
    const active = await page.evaluate(() => [...window.__fixtureBoot.ctx.loader.entries()].map(entry => ({ name: entry.options.name, state: entry.fiber?.state })));
    assert(active.every(row => row.state === 2), 'Complete real frontend plugin graph must be active');
    assert(probes.gateway > 0 && probes.shell > 0);
    assert.deepEqual(browserErrors, []);
    result = { pass: true, cases, platform: process.platform, nodeVersion: process.version, browserVersion: browser.version(), graph: ready.graph, hostPlugins: ready.plugins, clientPlugins: active, hashes: { ...ready.hashes, ...hashes }, records: state.records, counts: state.counts, trace: await page.evaluate(() => window.__fixtureTrace()), limits: ['Production Web/base profile and real loader graph, including unchanged Connect/CUA browser bundles with inert Host halves', 'Empty synthetic HOME/DSH_HOME, two real authentication Peers; no real account/session/page', 'Production UserQuestions.ask and live-root registry; synthetic root is never driven', 'No Native/grant/model implementation or approval answer; not live acceptance', 'Unrelated title model, native opener, workspace Git capture and HMR disabled only in fixture', 'Session opening uses the production UiWorkspace navigation API; New session uses the real button'] };
    passed = true;
} catch {
    const frontend = await page?.evaluate(() => {
        const ctx = window.__fixtureBoot?.ctx, row = ctx?.get('sessions')?.list.getSnapshot().byId['synthetic-root'];
        return { generation: ctx?.get('connection')?.generation.getSnapshot()?.id, rootListed: !!row, blank: row?.blank, retained: row?.retainedBy?.mainView ?? 0, pending: ctx?.get('uiSession')?.pendingSnapshot.size, trace: window.__fixtureTrace?.() };
    }).catch(() => undefined);
    console.error(JSON.stringify({ pass: false, phase, cases, browserErrors, frontend, hostOutputBytes }));
    throw new Error('Isolated production frontend regression failed; see bounded stage evidence');
} finally {
    await browser?.close(); await control?.dispose();
    if (!exit) child.send({ type: 'stop' });
    const timeout = setTimeout(() => { if (!exit) child.kill('SIGTERM'); }, 7000);
    const hard = setTimeout(() => { if (!exit) child.kill('SIGKILL'); }, 10000);
    await exited; clearTimeout(timeout); clearTimeout(hard);
    if (passed) { assert.equal(exit.code, 0); assert.equal(exit.signal, null); assert(messages.some(row => row.type === 'stopped' && row.pending === 0), 'Confirmed full Host cleanup'); }
    await rm(root, { recursive: true, force: true });
}
assert(passed);
if (process.argv[3]) await writeFile(resolve(process.argv[3]), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ pass: true, cases, clientPlugins: result.clientPlugins.length, counts: result.counts }));
