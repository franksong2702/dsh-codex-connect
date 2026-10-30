import Schema from '@deepseek-ai/schemastery';
import { createRequire } from 'node:module';
import { PATH, createDiagnosticSession, admittedOperator } from './session.mjs';
import { verifyDiagnosticHost } from './host-contract.mjs';

export const name = 'codex-display-diagnostic';
export const inject = ['connection', 'webServer', 'agents', 'userQuestions', 'typertGateway'];
export const Config = Schema.object({ enabled: Schema.boolean().default(false), sessionId: Schema.string().default('') });

export function apply(ctx, config) {
    if (config.enabled !== true) return;
    if (!/^[a-zA-Z0-9-]{1,80}$/.test(config.sessionId)) throw new Error('DISPLAY_DIAGNOSTIC_SESSION_REQUIRED');
    const require = createRequire(import.meta.url);
    verifyDiagnosticHost(require);
    const browserPeer = ctx.connection.browserPeer;
    const diagnostic = createDiagnosticSession({ sessionId: config.sessionId, peer: browserPeer,
        lookup: id => ctx.agents.get(id), roots: () => ctx.agents.roots(),
        pending: () => ctx.typertGateway.getPendingRemoteEvents(), ask: request => ctx.userQuestions.ask(request),
    });
    ctx.effect(() => () => diagnostic.dispose(), 'display diagnostic: lifetime');
    ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: PATH, async handler(req, res) {
        res.setHeader('content-type', 'application/json'); res.setHeader('cache-control', 'no-store'); res.setHeader('x-content-type-options', 'nosniff');
        let timer;
        try {
            if (ctx.get('connection')?.browserPeer !== browserPeer) throw new Error('unavailable');
            const peer = admittedOperator(ctx, req);
            const length = req.headers['content-length'];
            if (length !== undefined && (!/^\d+$/.test(length) || Number(length) > 512)) throw new Error('size');
            timer = setTimeout(() => req.destroy(), 2000);
            const chunks = []; let bytes = 0;
            for await (const chunk of req) { bytes += chunk.length; if (bytes > 512) throw new Error('size'); chunks.push(chunk); }
            if (length !== undefined && Number(length) !== bytes) throw new Error('size');
            // Recheck after body read: no stale admission or replacement service.
            if (ctx.get('connection')?.browserPeer !== browserPeer || admittedOperator(ctx, req) !== peer) throw new Error('unavailable');
            const value = diagnostic.command(peer, JSON.parse(Buffer.concat(chunks).toString('utf8')));
            res.end(JSON.stringify(value));
        } catch { res.statusCode = 403; res.end('{"error":"DISPLAY_DIAGNOSTIC_UNAVAILABLE"}'); }
        finally { clearTimeout(timer); }
    } }), 'display diagnostic: authenticated operator route');
}
