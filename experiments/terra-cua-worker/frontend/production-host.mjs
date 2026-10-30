/** Child-process-only production Web fixture. No real home, model, grant or Native driver. */
import assert from 'node:assert/strict';
import { createRequire, syncBuiltinESMExports } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { mkdir, writeFile, readFile, cp as copy } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import net from 'node:net';
import cp from 'node:child_process';
import { createHash } from 'node:crypto';
const [rootArg, candidateArg] = process.argv.slice(2);
const root = resolve(rootArg), candidate = resolve(candidateArg);
assert.equal(JSON.parse(await readFile(join(root, 'owner.json'))).kind, 'cua-frontend-production-synthetic');
assert.equal(process.env.HOME, join(root, 'home'));
assert.equal(process.env.DSH_HOME, join(root, 'home'));
assert.equal(process.cwd(), join(root, 'workspace'));
const counts = { subprocess: 0, outbound: 0, fetch: 0, model: 0, consentAnswers: 0 };
// These fences apply only to this throwaway child, before importing any Host module.
for (const name of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']) cp[name] = () => {
    counts.subprocess++; throw new Error('FIXTURE_SUBPROCESS_DENIED');
};
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
    const option = net._normalizeArgs(args)[0];
    if (option.path || !['127.0.0.1', '::1', 'localhost'].includes(option.host ?? 'localhost')) {
        counts.outbound++; throw new Error('FIXTURE_NETWORK_DENIED');
    }
    return connect.apply(this, args);
};
globalThis.fetch = () => { counts.fetch++; return Promise.reject(new Error('FIXTURE_FETCH_DENIED')); };
syncBuiltinESMExports();
const requireRuntime = createRequire(join(candidate, 'runtime/package.json'));
const hashes = {};
for (const pkg of ['dsh-api-gateway', 'dsh-api-remotes', 'dsh-user-questions', 'dsh-client-connection', 'dsh-api-session-controller']) {
    const bytes = await readFile(requireRuntime.resolve('@deepseek-ai/' + pkg));
    assert.deepEqual(bytes, await readFile(join(candidate, 'packages', pkg, 'lib/index.js')), 'Host/source candidate mismatch');
    hashes[pkg + '/lib/index.js'] = createHash('sha256').update(bytes).digest('hex');
}
const imported = async name => import(pathToFileURL(requireRuntime.resolve('@deepseek-ai/' + name)));
const { runProfile } = await imported('dsh/profile-boot');
const { createLaunchEnvironmentSnapshot } = await imported('dsh-launch-environment');
const patch = join(root, 'isolation.patch.yml');
// Load the real optional browser contributions through the real module registry.
// Their Host halves are deliberately inert: there is no CUA/access/account backend.
const repository = fileURLToPath(new URL('../../../', import.meta.url));
const optional = [];
for (const [label, source] of [['connect', repository], ['cua', join(candidate, 'packages/dsh-cua')]]) {
    const destination = join(root, 'plugins', label);
    await mkdir(destination, { recursive: true });
    const manifest = JSON.parse(await readFile(join(source, 'package.json'), 'utf8'));
    await copy(join(source, 'lib'), join(destination, 'lib'), { recursive: true });
    hashes[manifest.name + '/lib/client.js'] = createHash('sha256').update(await readFile(join(destination, 'lib/client.js'))).digest('hex');
    await writeFile(join(destination, 'fixture-host.mjs'), 'export function apply() {}\n');
    await writeFile(join(destination, 'package.json'), JSON.stringify({ ...manifest, main: './fixture-host.mjs', exports: { ...manifest.exports, '.': './fixture-host.mjs' } }));
    optional.push({ id: 'fixture-' + label, name: join(destination, 'fixture-host.mjs') });
}
// No UI roster replacement, synthetic loader, manual resolver or readiness latch.
// Unrelated Host activity is removed instead of permitting any subprocess/LLM call.
await writeFile(patch, '- id: session-title-llm\n  disabled: true\n- id: open-in-app\n  disabled: true\n- id: workspace-changes\n  disabled: true\n- id: hmr\n  disabled: true\n- id: session-controller\n  config:\n    nativeOpen: false\n- insert: ' + JSON.stringify(optional) + '\n');
let app, agent, stopping;
const pending = new Map();
const records = [];
const record = row => { records.push(row); if (records.length > 256) records.shift(); };
const stop = () => stopping ??= (async () => {
    for (const row of pending.values()) row.abort.abort();
    await Promise.all([...pending.values()].map(row => row.promise));
    await app?.ctx.fiber.dispose();
    process.send?.({ type: 'stopped', counts, pending: [...pending.values()].filter(row => row.state === 'pending').length });
    process.disconnect?.();
    process.exit(0);
})();
process.on('message', message => { if (message?.type === 'stop') void stop(); });
process.on('SIGTERM', () => void stop());
const hardStop = setTimeout(() => { void stop(); }, 120000);
hardStop.unref();
try {
    app = await runProfile({ profile: 'web', patchFiles: [patch], args: ['--no-open', '--host', '127.0.0.1', '--port', '0'], environment: createLaunchEnvironmentSnapshot([{ source: 'process', values: { DSH_TELEMETRY_DISABLED: '1', SSH_CONNECTION: '127.0.0.1 1 127.0.0.1 1' } }]) });
    const { ctx } = app;
    ctx.provide('workspaceChanges', { summary: () => undefined, diff: () => { throw new Error('FIXTURE_NO_FILE_DIFF'); } });
    await ctx.loader.await();
    assert.equal(ctx.get('cua'), undefined, 'No CUA backend may be mounted');
    ctx.on('llm/stream', () => { counts.model++; throw new Error('FIXTURE_MODEL_DENIED'); });
    const workspace = await ctx.workspaceRegistry.create(join(root, 'workspace'), 'Synthetic workspace');
    await ctx.sessionController.create({ sessionId: 'synthetic-root', workspaceId: workspace.id, agentPreset: 'minimal' });
    agent = ctx.agents.get('synthetic-root');
    assert(agent, 'Real Session Controller must publish the synthetic root');
    const { createUserMessage } = await imported('dsh-llm');
    // Synthetic saved history only; never enqueue input or drive an Agent/model turn.
    agent.session.append('turn/start', { turn: 1 });
    agent.session.append('user/message', createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Synthetic saved history. No model executed.' }] }), { surfaceOp: 'append' });
    agent.session.append('turn/end', { turn: 1, reason: 'empty' });
    await ctx.sessionController.rename({ sessionId: 'synthetic-root', title: 'Synthetic approval test' });
    const sourceOrdinal = new Map();
    const eventOrdinal = id => { if (!sourceOrdinal.has(id)) sourceOrdinal.set(id, sourceOrdinal.size + 1); return sourceOrdinal.get(id); };
    const originalDeliver = ctx.typertGateway.deliverRemoteEvent.bind(ctx.typertGateway);
    ctx.typertGateway.deliverRemoteEvent = (event, client) => {
        record({ stage: 'host-deliver', event: eventOrdinal(event.frame.eventId), browser: client.peer === ctx.connection.browserPeer });
        return originalDeliver(event, client);
    };
    ctx.webServer.register({ kind: 'exact', path: '/fixture', handler: async (req, res) => {
        try {
            const admission = ctx.connection.admit(req);
            if ('rejection' in admission) { res.writeHead(admission.rejection); res.end(); return; }
            // Only an independent, authenticated /connect controller can start fixture questions.
            if (admission.peer === ctx.connection.browserPeer || admission.peer.interactions !== 'none') { res.writeHead(403); res.end(); return; }
            let raw = '';
            for await (const bytes of req) { raw += bytes; if (raw.length > 1024) throw new Error('FIXTURE_BODY_BOUND'); }
            const command = JSON.parse(raw);
            res.setHeader('content-type', 'application/json');
            if (command.type === 'ask' && ['select', 'consent'].includes(command.kind)) {
                assert(![...pending.values()].some(row => row.state === 'pending'), 'One synthetic request at a time');
                const abort = new AbortController(), key = String(pending.size + 1), kind = command.kind;
                const question = kind === 'select' ? { id: 'cua-task-window', question: 'Choose synthetic window', options: [{ label: 'Synthetic window' }, { label: 'Cancel' }] } : { id: 'cua-task-access', question: 'Synthetic task approval — no authority', detail: 'No application grant, model call or Native operation exists in this synthetic fixture.', options: [{ label: 'Allow once' }, { label: 'Reject' }], intent: { kind: 'approval', approve: 'Allow once', reject: 'Reject', subject: { name: 'Synthetic' } } };
                const row = { abort, kind, state: 'pending' }; pending.set(key, row);
                record({ stage: 'host-ask', request: Number(key), distinctController: true });
                row.promise = ctx.userQuestions.ask({ agent: agent, signal: abort.signal, questions: [question] }).then(() => {
                    row.state = 'answered'; if (kind === 'consent') counts.consentAnswers++;
                }, error => { row.state = error.code === 'NO_PROVIDER' ? 'no-provider' : 'cancelled'; });
                row.timer = setTimeout(() => abort.abort(), 15000); row.promise.finally(() => clearTimeout(row.timer));
                res.end(JSON.stringify({ key }));
            } else if (command.type === 'cancel' && pending.has(command.key)) {
                const row = pending.get(command.key); row.abort.abort(); await row.promise; res.end('{}');
            } else if (command.type === 'status') {
                res.end(JSON.stringify({ pending: [...pending].map(([key, row]) => ({ key, kind: row.kind, state: row.state })), clients: ctx.typertGateway.remoteEventClients.size, records, counts }));
            } else { res.writeHead(400); res.end(); }
        } catch { res.writeHead(400); res.end(); }
    } });
    const plugins = [...ctx.loader.entries()].filter(entry => !entry.disabled).map(entry => ({ name: optional.find(row => row.name === entry.options.name || pathToFileURL(row.name).href === entry.options.name)?.id ?? entry.options.name, state: entry.fiber?.state }));
    assert(plugins.every(entry => entry.state === 2), 'Inactive synthetic Host plugin');
    assert(plugins.every(entry => /^(?:@deepseek-ai\/|cordis:|fixture-)[a-z0-9/-]+$/.test(entry.name)), 'Unexpected non-package plugin identity');
    process.send?.({ type: 'ready', url: ctx.connection.authenticatedUrl(ctx.webServer.getOrigin()), graph: ctx.clientModules.graph().entries.map(({ id, rev }) => ({ id, rev })), plugins, hashes });
} catch (error) {
    // No paths, request strings, credentials, page content or raw stacks leave the child.
    process.send?.({ type: 'failure', stage: 'host-bootstrap', name: error.name === 'AssertionError' ? 'AssertionError' : 'Error' });
    process.exitCode = 1;
    await stop();
}
