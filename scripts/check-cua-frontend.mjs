/** Isolated actual-bundle / actual-mux browser replay. It cannot grant permission. */
import assert from 'node:assert/strict';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve, join } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
const candidate = resolve(process.argv[2] ?? '');
assert(process.argv[2], 'Usage: node scripts/check-cua-frontend.mjs <isolated-candidate> [result.json]');
const requireRuntime = createRequire(join(candidate, 'runtime/package.json'));
const { Context } = requireRuntime('@deepseek-ai/cordis');
const Gateway = (await import(pathToFileURL(requireRuntime.resolve('@deepseek-ai/dsh-api-gateway')))).default;
const packages = join(candidate, 'packages');
const assets = join(packages, 'dsh-web-frontend/dist/assets');
const routes = new Map();
const hashes = {};
const records = [];
const add = (path, bytes, type = 'application/javascript') => routes.set(path, { bytes, type });
async function source(pkg, file) { const bytes = await readFile(join(packages, pkg, file)); hashes[`${pkg}/${file}`] = createHash('sha256').update(bytes).digest('hex'); return bytes.toString(); }
const hostSource = await source('dsh-api-gateway', 'lib/index.js');
assert.equal(await readFile(requireRuntime.resolve('@deepseek-ai/dsh-api-gateway'), 'utf8'), hostSource, 'Browser fixture and imported Host must use the same candidate');
const assetNames = await readdir(assets);
const mainName = assetNames.find(name => /^index-.*\.js$/.test(name));
let main = await source('dsh-web-frontend', `dist/assets/${mainName}`);
const end = main.indexOf('const Ws=globalThis.dshDesktopBoot');
assert(end > 0, 'exact bootstrap boundary');
const staticMatch = main.match(/function (\w+)\(\)\{return\{react:[^}]+"@deepseek-ai\/dsh-client-ui-dockkit"/);
assert(staticMatch, 'exact bundled builtin map');
add('/static.mjs', main.slice(0, end) + `\nexport default ${staticMatch[1]};\n`);
for (const name of assetNames.filter(name => /^vendor-.*\.js$/.test(name) || name.endsWith('.css')))
    add(`/${name}`, await source('dsh-web-frontend', `dist/assets/${name}`), name.endsWith('.css') ? 'text/css' : 'application/javascript');
for (const [name, pkg, file, expose] of [
    ['connection', 'dsh-client-connection', 'client.browser.js', ''],
    ['gateway', 'dsh-api-gateway', 'client.browser.js', 'ClientRemoteService'],
    ['controller', 'dsh-api-session-controller', 'client.js', 'ClientSessions'],
    ['renderer', 'dsh-client-ui-renderer', 'client.js', ''],
    ['uiSession', 'dsh-client-ui-session', 'client.js', ''],
    ['conversation', 'dsh-client-ui-conversation', 'client.js', 'ConversationContent'],
    ['questions', 'dsh-client-ui-user-questions', 'client.js', ''],
]) {
    let text = await source(pkg, `lib/${file}`);
    if (expose) {
        assert(text.includes('exports.apply = apply;'));
        text = text.replace('exports.apply = apply;', `Object.assign(exports,{${expose}});exports.apply = apply;`);
    }
    add(`/bundle/${name}`, text);
}
add('/diagnostics.mjs', await readFile(new URL('../experiments/terra-cua-worker/frontend/diagnostics.mjs', import.meta.url)));
add('/fixture.mjs', await readFile(new URL('../experiments/terra-cua-worker/frontend/browser-fixture.mjs', import.meta.url)));
add('/', `<!doctype html><html><head>${assetNames.filter(n => n.endsWith('.css')).map(n => `<link rel="stylesheet" href="/${n}">`).join('')}<style>html,body,#app{width:100%;height:100%;margin:0}</style></head><body><div id="app"></div><script type="module" src="/fixture.mjs"></script></body></html>`, 'text/html');
const ctx = new Context();
let upgrade;
const lifetime = new AbortController();
const peer = { ctx, principal: { kind: 'owner' }, interactions: 'answer', signal: lifetime.signal };
ctx.provide('typert', {});
ctx.provide('remoteAccess', {});
ctx.provide('connection', { rpc: { intercept() { return () => { }; } }, admitConnection: () => ({ peer, release: async () => { } }) });
ctx.provide('webServer', { registerUpgrade(route) { upgrade = route; return () => { upgrade = undefined; }; } });
await ctx.plugin(Gateway, { websocketHeartbeatIntervalMs: 1000, streamInboxBytes: 1048576, websocketCompression: 'none' });
const gateway = ctx.typertGateway;
let wake;
const queue = [];
const stopSource = gateway.registerRemoteEvents(async function* (signal) {
    while (!signal.aborted) {
        if (queue.length)
            yield queue.shift();
        else
            await new Promise(resolve => { wake = resolve; signal.addEventListener('abort', resolve, { once: true }); });
    }
}, { home: 'synthetic-only' });
const server = createServer(async (req, res) => {
    try {
        if (req.url === '/api/$events/result' && req.method === 'POST') {
            let text = '';
            for await (const chunk of req) {
                text += chunk;
                if (text.length > 16384)
                    throw new Error('bounded payload');
            }
            const envelope = JSON.parse(text);
            assert.equal(envelope.type, 'client-request');
            assert.equal(envelope.method, '$events/result');
            const result = await gateway.dispatchRpc('$events/result', envelope.payload, lifetime.signal, peer);
            records.push({ stage: 'host-result', ok: result.ok });
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify({ type: 'server-response', rpcId: envelope.rpcId, result }));
            return;
        }
        const route = routes.get(req.url);
        if (req.method !== 'GET' || !route) {
            res.writeHead(404);
            res.end();
            return;
        }
        res.setHeader('content-type', route.type);
        res.end(route.bytes);
    }
    catch {
        res.writeHead(400);
        res.end();
    }
});
server.on('upgrade', (req, socket, head) => {
    records.push({ stage: 'upgrade', path: req.url, registered: upgrade?.path });
    if (upgrade && req.url === upgrade.path)
        upgrade.handler(req, socket, head);
    else
        socket.destroy();
});
let browser, page;
const cases = [];
const errors = [];
function ask(kind) {
    const abort = new AbortController();
    const agent = {};
    const question = kind === 'select' ? { id: 'target', question: 'Choose synthetic window', options: [{ label: 'Synthetic window' }, { label: 'Cancel' }] } : { id: 'cua-task-access', question: 'Synthetic task approval — no authority', detail: 'No application, model, or grant exists in this fixture.', options: [{ label: 'Allow once' }, { label: 'Reject' }], intent: { kind: 'approval', approve: 'Allow once', reject: 'Reject', subject: { name: 'Synthetic' } } };
    let settle;
    const done = new Promise(resolve => settle = resolve);
    const timeout = setTimeout(() => abort.abort(new Error('Synthetic question deadline')), 10000);
    done.finally(() => clearTimeout(timeout));
    queue.push({ event: 'user-questions/request', context: { agentId: 'synthetic-root', value: ctx, subject: agent }, request: { agent, signal: abort.signal, questions: [question] }, resolve: outcome => { records.push({ stage: 'host-settled', kind, outcome: outcome.kind }); settle(outcome); }, reject: error => { records.push({ stage: 'host-cancelled', kind }); settle({ kind: 'cancelled', name: error.name }); } });
    records.push({ stage: 'host-send', kind });
    wake?.();
    return { abort, done };
}
try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const origin = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({ headless: true, timeout: 15000 });
    const context = await browser.newContext();
    context.setDefaultTimeout(5000);
    await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => {
        if (m.type() === 'error')
            errors.push(m.text());
    });
    await page.goto(origin);
    await page.waitForFunction(() => window.fixture && window.fixture.trace.some(row => row.stage === 'ready'), undefined, { timeout: 10000 });
    const visible = async () => {
        await page.getByText('Synthetic task approval — no authority', { exact: true }).waitFor({ state: 'visible', timeout: 5000 });
        assert.equal(await page.locator('[data-question-key]').count(), 1);
        const box = await page.getByText('Synthetic task approval — no authority', { exact: true }).boundingBox();
        const viewport = page.viewportSize();
        assert(box && box.x < viewport.width && box.y < viewport.height && box.x + box.width > 0 && box.y + box.height > 0, 'card must intersect viewport');
    };
    const close = async (request) => { request.abort.abort(); await request.done; await page.waitForFunction(() => document.querySelectorAll('[data-question-key]').length === 0); };
    let request = ask('consent');
    await visible();
    await close(request);
    cases.push('fresh-consent');
    const selection = ask('select');
    await page.getByText('Synthetic window', { exact: true }).click();
    // Use the actual UI's submit affordance; no approval is answered.
    await page.getByRole('button', { name: /submit/i }).click();
    assert.equal((await selection.done).kind, 'result');
    request = ask('consent');
    await visible();
    await close(request);
    cases.push('selection-then-consent');
    request = ask('consent');
    await visible();
    await page.evaluate(() => window.fixture.reconnect());
    await visible();
    await close(request);
    cases.push('reconnect-pending');
    await page.evaluate(() => window.fixture.switchSession('synthetic-other'));
    request = ask('consent');
    await page.waitForTimeout(100);
    assert.equal(await page.locator('[data-question-key]').count(), 0);
    await page.evaluate(() => window.fixture.switchSession('synthetic-root'));
    await visible();
    await close(request);
    cases.push('session-switch');
    request = ask('consent');
    await visible();
    await page.evaluate(() => window.fixture.remount());
    await visible();
    await close(request);
    cases.push('remount-pending');
    // A second ordinary frontend answers selection: first frontend gets cancel then new consent.
    const second = await context.newPage();
    second.on('pageerror', e => errors.push(e.message));
    await second.goto(origin);
    await second.waitForFunction(() => window.fixture?.trace.some(x => x.stage === 'ready'));
    const crossSelection = ask('select');
    await page.getByText('Choose synthetic window', { exact: true }).waitFor();
    await second.getByText('Synthetic window', { exact: true }).click();
    await second.getByRole('button', { name: /submit/i }).click();
    assert.equal((await crossSelection.done).kind, 'result');
    request = ask('consent');
    await visible();
    await second.getByText('Synthetic task approval — no authority', { exact: true }).waitFor({ state: 'visible' });
    await close(request);
    await second.evaluate(() => window.fixture.dispose());
    await second.close();
    cases.push('second-client-selection-then-consent');
    // Real Chromium lifecycle freeze/resume. Headless-shell does not prove hidden-tab behavior.
    const cdp = await context.newCDPSession(page);
    await cdp.send('Page.setWebLifecycleState', { state: 'frozen' });
    request = ask('consent');
    await new Promise(resolve => setTimeout(resolve, 100));
    await cdp.send('Page.setWebLifecycleState', { state: 'active' });
    await page.bringToFront();
    const hiddenObserved = await page.evaluate(() => window.fixture.trace.some(x => x.stage === 'visibility' && x.state === 'hidden'));
    await visible();
    await close(request);
    cases.push('frozen-resumed');
    // Detector controls: intentionally sever each seam. These are expected NOT to show a card.
    await page.evaluate(() => window.fixture.hideMount());
    const beforeListener = await page.evaluate(() => window.fixture.state().listened);
    request = ask('consent');
    await page.waitForFunction(before => window.fixture.state().listened > before && window.fixture.state().pending === 1, beforeListener);
    assert.equal(await page.locator('[data-question-key]').count(), 0);
    await page.evaluate(() => window.fixture.showMount());
    await visible();
    await close(request);
    cases.push('detector-mount-absent');
    await page.evaluate(() => window.fixture.unloadQuestions());
    const beforeMissing = await page.evaluate(() => window.fixture.state());
    request = ask('consent');
    const noListener = await request.done;
    assert.equal(noListener.kind, 'next');
    const afterMissing = await page.evaluate(() => window.fixture.state());
    assert.equal(afterMissing.received, beforeMissing.received + 1);
    assert.equal(afterMissing.listened, beforeMissing.listened);
    assert.equal(await page.locator('[data-question-key]').count(), 0);
    await page.evaluate(() => window.fixture.reloadQuestions());
    cases.push('detector-listener-absent');
    // No subscribed transport: Host retains, then delivers on a new real browser connection.
    const firstTrace = await page.evaluate(() => window.fixture.trace);
    await page.evaluate(() => window.fixture.dispose());
    await page.close();
    request = ask('consent');
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(gateway.remoteEventClients.size, 0);
    assert.equal(gateway.getPendingRemoteEvents().length, 1);
    page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(origin);
    await page.waitForFunction(() => window.fixture, undefined, { timeout: 10000 });
    await visible();
    await close(request);
    cases.push('detector-no-client-then-replay');
    assert.equal(gateway.getPendingRemoteEvents().length, 0);
    const trace = [...firstTrace, ...await page.evaluate(() => window.fixture.trace)];
    assert(trace.some(x => x.stage === 'receive'));
    assert(trace.some(x => x.stage === 'listener'));
    assert(trace.some(x => x.stage === 'mount' && x.count === 1));
    assert.deepEqual(errors, []);
    assert(!records.some(row => row.stage === 'host-settled' && row.kind === 'consent' && row.outcome === 'result'), 'No approval answers may be submitted');
    const result = { pass: true, platform: process.platform, nodeVersion: process.version, browserVersion: browser.version(), cases, hiddenObserved, hashes, records, trace, limits: ['Synthetic Host source/admission/session catalog; no grant implementation', 'Production Gateway WebSocket mux, browser dispatcher, controller scopes, UiSession, ConversationContent overlay, question plugin, React and slot renderer', 'Production shell/bootstrap, account and Native operations are not exercised', 'Headless lifecycle freeze/resume is covered; hidden-tab state is only covered if hiddenObserved is true'] };
    if (process.argv[3])
        await writeFile(resolve(process.argv[3]), JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify({ pass: true, cases }));
    await page.evaluate(() => window.fixture.dispose());
}
catch (error) {
    const trace = await page?.evaluate(() => window.fixtureTrace).catch(() => []);
    console.error(JSON.stringify({ pass: false, error: error.stack, errors, records, cases, trace, clients: gateway.remoteEventClients.size }));
    throw error;
}
finally {
    await browser?.close();
    lifetime.abort();
    await stopSource();
    await ctx.fiber.dispose();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
}
