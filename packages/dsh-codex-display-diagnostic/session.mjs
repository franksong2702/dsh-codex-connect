import { randomUUID } from 'node:crypto';

export const PATH = '/codex-display-diagnostic';
export const QUESTION_PREFIX = 'codex-display-diagnostic-';
export const LIFETIME_MS = 60000;
const fail = () => { throw new Error('DISPLAY_DIAGNOSTIC_UNAVAILABLE'); };

/** One inert question, using an already registered root. Never resumes/creates/drives an agent. */
export function createDiagnosticSession({ sessionId, peer, lookup, roots, pending, ask, now = Date.now, uuid = randomUUID }) {
    let row, disposed = false;
    const live = agent => agent && lookup(sessionId) === agent && roots().includes(agent) && agent.status === 'idle';
    const foreignPending = () => pending().some(event => event.agentId === sessionId);
    const assertPeer = caller => { if (disposed || caller !== peer || peer.signal.aborted || peer.principal.kind !== 'owner') fail(); };
    const snapshot = () => ({ state: row?.state ?? 'idle', sessionId, ...(row && row.state !== 'ended' ? { correlation: row.correlation, expiresAt: row.expiresAt } : {}), outcome: row?.outcome ?? 'none' });
    const end = outcome => {
        if (!row || row.state === 'ended') return;
        row.state = 'ended'; row.outcome = outcome;
        clearTimeout(row.timer); clearInterval(row.guard);
        row.abort.abort();
    };
    const onPeerEnd = () => end('identity-lost');
    peer.signal.addEventListener('abort', onPeerEnd, { once: true });
    return {
        command(caller, command) {
            assertPeer(caller);
            if (!command || Object.getPrototypeOf(command) !== Object.prototype) fail();
            const { action, correlation } = command;
            if (!['status', 'prepare', 'send', 'stop'].includes(action) || Object.keys(command).some(key => !['action', 'correlation'].includes(key))) fail();
            if (['status', 'prepare'].includes(action) && correlation !== undefined) fail();
            if (action === 'status') return snapshot();
            if (action === 'prepare') {
                if (row) fail(); // One shot per explicitly enabled plugin lifetime.
                const agent = lookup(sessionId);
                if (!live(agent) || foreignPending()) fail();
                row = { agent, correlation: uuid(), state: 'prepared', outcome: 'none', expiresAt: now() + LIFETIME_MS, abort: new AbortController() };
                row.timer = setTimeout(() => end('expired'), LIFETIME_MS); row.timer.unref?.();
                row.guard = setInterval(() => { if (!live(agent)) end('identity-lost'); }, 100); row.guard.unref?.();
                return snapshot();
            }
            if (!row || correlation !== row.correlation || row.state === 'ended') fail();
            if (action === 'stop') { end('stopped'); return snapshot(); }
            if (row.state !== 'prepared') fail();
            if (now() >= row.expiresAt || !live(row.agent) || foreignPending()) { end('unavailable'); fail(); }
            row.state = 'sent';
            // No intent, grant, tool, model, input or persistent session mutation.
            // The normal UserQuestions service independently enforces exact live-root identity.
            const request = { agent: row.agent, signal: row.abort.signal, questions: [{
                id: QUESTION_PREFIX + row.correlation,
                question: '显示链路诊断（不会授权任何操作）',
                detail: '这是一条无模型、无桌面控制、无授权能力的显示诊断。可以等待它自动结束。',
                options: [{ label: '结束诊断' }],
            }] };
            try { row.promise = Promise.resolve(ask(request)).then(() => end('closed'), () => end(row.abort.signal.aborted ? 'stopped' : 'delivery-failed')); }
            catch { end('delivery-failed'); }
            return snapshot();
        },
        async dispose() {
            disposed = true; end('stopped'); peer.signal.removeEventListener('abort', onPeerEnd);
            await row?.promise;
        },
    };
}

/** Admission is Host-owned; loopback, exact origin and browser Peer are additional restrictions. */
export function admittedOperator(ctx, request) {
    const connection = ctx.get('connection');
    const address = request.socket?.remoteAddress;
    if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address)) fail();
    const origin = ctx.webServer.getOrigin();
    if (!['127.0.0.1', '[::1]', 'localhost'].includes(new URL(origin).hostname)) fail();
    if (request.method !== 'POST' || request.url !== PATH || request.headers.origin !== origin ||
        request.headers['sec-fetch-site'] !== 'same-origin' || request.headers['content-type'] !== 'application/json') fail();
    const admission = connection?.admit(request);
    if (!admission || 'rejection' in admission || admission.peer !== connection.browserPeer || admission.peer.principal.kind !== 'owner' || admission.peer.signal.aborted) fail();
    return admission.peer;
}
