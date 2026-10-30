import test from 'node:test';
import assert from 'node:assert/strict';
import { createDiagnosticSession, admittedOperator, PATH } from '../session.mjs';

function fixture() {
    const controller = new AbortController(), peer = { principal: { kind: 'owner' }, signal: controller.signal };
    let agent = { id: 'synthetic-root', status: 'idle' }, root = true, pending = [], clock = 0;
    const calls = [];
    const session = createDiagnosticSession({ sessionId: 'synthetic-root', peer, lookup: () => agent, roots: () => root ? [agent] : [], pending: () => pending, now: () => clock,
        ask: request => { calls.push(request); return new Promise((resolve, reject) => request.signal.addEventListener('abort', () => reject(new Error()), { once: true })); } });
    return { session, peer, calls, controller, change: value => { if ('agent' in value) agent = value.agent; if ('root' in value) root = value.root; if ('pending' in value) pending = value.pending; if ('clock' in value) clock = value.clock; } };
}
test('one fixed inert question; genuine root and signal passed unchanged; stop drains', async () => {
    const f = fixture();
    const prepared = f.session.command(f.peer, { action: 'prepare' });
    assert.equal(f.calls.length, 0);
    f.session.command(f.peer, { action: 'send', correlation: prepared.correlation });
    assert.equal(f.calls.length, 1);
    const q = f.calls[0].questions[0];
    assert.equal(q.intent, undefined); assert.deepEqual(q.options, [{ label: '结束诊断' }]);
    assert.equal(f.calls[0].agent.id, 'synthetic-root');
    assert.throws(() => f.session.command(f.peer, { action: 'send', correlation: prepared.correlation }));
    f.session.command(f.peer, { action: 'stop', correlation: prepared.correlation });
    assert.equal(f.calls[0].signal.aborted, true);
    assert.throws(() => f.session.command(f.peer, { action: 'prepare' }));
    await f.session.dispose();
});
test('foreign callers and injected session/content/approval fields rejected without ask', async () => {
    const f = fixture();
    assert.throws(() => f.session.command({ ...f.peer }, { action: 'prepare' }));
    for (const field of ['sessionId', 'root', 'questions', 'prompt', 'intent', 'grant', 'url']) assert.throws(() => f.session.command(f.peer, { action: 'prepare', [field]: 'foreign' }));
    assert.equal(f.calls.length, 0); await f.session.dispose();
});
test('absent/delegated/busy roots and competing pending request reject', async () => {
    for (const change of [{ agent: undefined }, { root: false }, { agent: { status: 'running' } }, { pending: [{ agentId: 'synthetic-root' }] }]) {
        const f = fixture(); f.change(change); assert.throws(() => f.session.command(f.peer, { action: 'prepare' })); assert.equal(f.calls.length, 0); await f.session.dispose();
    }
});
test('prepared identity replacement, expiry and wrong correlation reject before question', async () => {
    for (const change of [{ agent: { id: 'synthetic-root', status: 'idle' } }, { clock: 60000 }, { root: false }]) {
        const f = fixture(), prepared = f.session.command(f.peer, { action: 'prepare' }); f.change(change);
        assert.throws(() => f.session.command(f.peer, { action: 'send', correlation: prepared.correlation })); assert.equal(f.calls.length, 0); await f.session.dispose();
    }
    const f = fixture(); f.session.command(f.peer, { action: 'prepare' });
    assert.throws(() => f.session.command(f.peer, { action: 'send', correlation: 'foreign' })); await f.session.dispose();
});
test('peer revoke immediately aborts diagnostic; new agent activity closes it', async () => {
    for (const kind of ['peer', 'activity']) {
        const f = fixture(), prepared = f.session.command(f.peer, { action: 'prepare' });
        f.session.command(f.peer, { action: 'send', correlation: prepared.correlation });
        if (kind === 'peer') f.controller.abort(); else { f.calls[0].agent.status = 'running'; await new Promise(resolve => setTimeout(resolve, 130)); }
        assert.equal(f.calls[0].signal.aborted, true); await f.session.dispose();
    }
});
test('admission requires exact local Origin, browser owner, live peer; no API owner substitution', () => {
    const peer = { principal: { kind: 'owner' }, signal: new AbortController().signal };
    let admitted = peer;
    const connection = { browserPeer: peer, admit: () => ({ peer: admitted }) };
    const ctx = { get: () => connection, webServer: { getOrigin: () => 'http://127.0.0.1:39999' } };
    const request = { method: 'POST', url: PATH, socket: { remoteAddress: '127.0.0.1' }, headers: { origin: 'http://127.0.0.1:39999', 'sec-fetch-site': 'same-origin', 'content-type': 'application/json' } };
    assert.equal(admittedOperator(ctx, request), peer);
    for (const altered of [{ ...request, method: 'GET' }, { ...request, url: PATH + '?root=other' }, { ...request, socket: { remoteAddress: '192.0.2.1' } }, { ...request, headers: { ...request.headers, origin: 'https://other.invalid' } }, { ...request, headers: { ...request.headers, 'sec-fetch-site': 'cross-site' } }]) assert.throws(() => admittedOperator(ctx, altered));
    admitted = { ...peer }; assert.throws(() => admittedOperator(ctx, request));
    admitted = undefined; assert.throws(() => admittedOperator(ctx, request));
});
