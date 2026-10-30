import { createFrontendTrace } from '/diagnostics.mjs';
// Synthetic composition of the installed production browser bundles. No grant backend.
import staticModules from '/static.mjs';
const modules = staticModules();
const diagnostic = createFrontendTrace({ limit: 256 });
const mark = (stage, detail) => diagnostic.record(stage, detail);
Object.defineProperty(window, 'fixtureTrace', { get: () => diagnostic.snapshot() });
document.addEventListener('visibilitychange', () => mark('visibility', { state: document.visibilityState }));
window.__ModuleLoader__ = { load(registration) {
        modules[registration.id] = registration.factory(name => {
            if (!(name in modules))
                throw new Error(`Missing fixture dependency: ${name}`);
            return modules[name];
        });
        modules[registration.id + '/client'] = modules[registration.id];
    } };
for (const name of ['connection', 'gateway', 'controller', 'renderer', 'uiSession', 'conversation', 'questions']) {
    await new Promise((resolve, reject) => { const script = document.createElement('script'); script.src = `/bundle/${name}`; script.onload = resolve; script.onerror = reject; document.head.append(script); });
}
const { Context } = modules['@deepseek-ai/cordis'];
const React = modules.react;
const ctx = new Context();
const gateway = modules['@deepseek-ai/dsh-api-gateway'];
const controller = modules['@deepseek-ai/dsh-api-session-controller'];
const renderer = modules['@deepseek-ai/dsh-client-ui-renderer'];
const uiSession = modules['@deepseek-ai/dsh-client-ui-session'];
const questions = modules['@deepseek-ai/dsh-client-ui-user-questions'];
let releaseBoot;
const bootReady = new Promise(resolve => releaseBoot = resolve);
ctx.provide('loader', { await: () => bootReady });
modules['@deepseek-ai/dsh-client-connection'].apply(ctx);
const connection = ctx.connection;
connection.generation.subscribe(() => {
    if (connection.generation.getSnapshot())
        mark('ready');
});
const adapters = new Map();
ctx.provide('typert', { contexts: { getClient: key => adapters.get(key) } });
const remote = new gateway.ClientRemoteService(ctx);
// Only wrap existing handlers. No observer registers another waterfall answerer.
const eventOrdinals = new Map();
const questionMeta = new WeakMap();
let generation = 0;
const originalPump = remote.events.pumpEvents.bind(remote.events);
remote.events.pumpEvents = (...args) => { generation++; return originalPump(...args); };
const originalAnswer = remote.events.answer.bind(remote.events);
remote.events.answer = (frame, clientId, signal) => {
    if (!eventOrdinals.has(frame.eventId)) eventOrdinals.set(frame.eventId, eventOrdinals.size + 1);
    const meta = { event: eventOrdinals.get(frame.eventId), generation };
    questionMeta.set(frame.request.questions, meta);
    mark('receive', meta);
    const aborted = () => mark('delivery-abort', meta);
    signal.addEventListener('abort', aborted, { once: true });
    const result = originalAnswer(frame, clientId, signal);
    const drained = () => { signal.removeEventListener('abort', aborted); mark('delivery-drained', meta); };
    result.then(drained, drained);
    return result;
};
const originalDispatch = remote.events.dispatchWaterfall.bind(remote.events);
remote.events.dispatchWaterfall = (target, frame, signal) => { mark('dispatch', questionMeta.get(frame.request.questions)); return originalDispatch(target, frame, signal); };
const originalOn = remote.$on;
remote.$on = function (event, listener) {
    return originalOn.call(this, event, event === 'user-questions/request' ? function (request, ...args) { mark('listener', questionMeta.get(request.questions)); return listener.call(this, request, ...args); } : listener);
};
const sessions = new controller.ClientSessions(ctx, {});
// Synthetic session catalog, no real session history, persistence or account.
sessions.manager.summaries = ['synthetic-root', 'synthetic-other'].map(sessionId => ({ sessionId, title: sessionId, running: false, blank: true, updatedAt: 0 }));
sessions.manager.listSnapshotCache = sessions.manager.buildListSnapshot();
sessions.projectList();
let mainRef = sessions.retainScope('synthetic-root', 'mainView');
const retained = sessions.retainAgentScope('synthetic-root');
adapters.set('agent', { resolve(id) { const ref = sessions.retainAgentScope(id); return { [Symbol.for('dsh.typert.owned-value')]: true, value: ref.binding.ctx, [Symbol.dispose]: () => ref.release() }; } });
renderer.apply(ctx);
const locale = { register() { return () => { }; }, getSnapshot: () => ({ revision: 0 }), subscribe: () => () => { }, bind: () => key => key };
ctx.provide('locale', locale);
ctx.slots.installLocale(locale);
ctx.provide('remoteAccess', { source: () => ({ getSnapshot: () => ({ allowed: true }), subscribe: () => () => { } }) });
uiSession.apply(ctx);
ctx.uiSession.sessionStatus.subscribe(() => mark('pending', { count: ctx.uiSession.pendingSnapshot.size }));
// Full production composer chain/slot registry; shell and unrelated history views are omitted.
ctx.slots.register({ name: 'root', children: { 'fixture.conversation': { kind: 'single', scope: 'session' } } }, props => props.renderSlot('fixture.conversation', {}));
const ConversationContent = modules['@deepseek-ai/dsh-client-ui-conversation'].ConversationContent;
const emptySource = (selector) => selector(undefined);
const workspaces = { items: [], phase: 'ready' };
const NoView = () => null;
ctx.slots.register({ name: 'fixture.conversation', children: {
        'conversation.composer': { kind: 'chain', scope: 'session' },
        'conversation.composer.bar': { kind: 'single', scope: 'session-maybe' },
        'conversation.input.dock': { kind: 'list', scope: 'session' },
        'conversation.hero.workspace': { kind: 'single', scope: 'root' },
        'conversation.hero.agentPreset': { kind: 'single', scope: 'session-maybe' },
        'conversation.hero.options': { kind: 'list', scope: 'session' },
    } }, props => React.createElement(ConversationContent, {
    ...props, phase: 'ready', hero: false, useInput: emptySource, useComposerBlock: emptySource,
    useWorkspaces: selector => selector(workspaces), useFactorySlot: () => NoView,
    selectWorkspace: () => { throw new Error('No workspace mutations'); }, t: key => key,
}));
ctx.slots.register({ name: 'conversation.composer.bar' }, () => React.createElement('div', { style: { height: 50 } }, 'Synthetic composer'));
ctx.provide('uiConversation', { events: { register() { return () => { }; } } });
ctx.provide('remote.userQuestions', { answer() { throw new Error('No durable permission backend'); } });
let questionsFiber;
async function mountQuestions() { questionsFiber = await ctx.plugin({ name: 'synthetic-question-plugin', apply: questions.apply }); }
mark('before-questions');
await mountQuestions();
mark('after-questions');
let unmount = ctx.uiRenderer.mount(document.getElementById('app'));
const observeMount = () => {
    const nodes = [...document.querySelectorAll('[data-question-key]')];
    if (!nodes.length) mark('mount', { count: 0, visible: document.visibilityState === 'visible', inViewport: false });
    for (const pending of ctx.uiSession.pendingSnapshot.values()) {
        const node = nodes.find(node => node.getAttribute('data-question-key') === pending.key);
        if (!node) continue;
        const box = node.getBoundingClientRect();
        mark('mount', { ...questionMeta.get(pending.questions), count: nodes.length, visible: document.visibilityState === 'visible', inViewport: box.width > 0 && box.height > 0 && box.x < innerWidth && box.y < innerHeight && box.right > 0 && box.bottom > 0 });
    }
};
const observer = new MutationObserver(observeMount);
observer.observe(document.getElementById('app'), { subtree: true, childList: true });
releaseBoot();
window.fixture = { get trace() { return diagnostic.snapshot(); },
    state() { return { generation, received: diagnostic.snapshot().filter(x => x.stage === 'receive').length, listened: diagnostic.snapshot().filter(x => x.stage === 'listener').length, pending: ctx.uiSession.pendingSnapshot.size, visibility: document.visibilityState }; },
    async reconnect() {
        const before = connection.generation.getSnapshot()?.id;
        connection.reconnect();
        await new Promise(resolve => {
            const off = connection.generation.subscribe(() => {
                if ((connection.generation.getSnapshot()?.id ?? 0) > before) {
                    off();
                    resolve();
                }
            });
        });
    },
    switchSession(id) {
        if (!['synthetic-root', 'synthetic-other'].includes(id))
            throw new Error('Synthetic sessions only');
        const next = sessions.retainScope(id, 'mainView');
        mainRef.release();
        mainRef = next;
        ctx.uiSession.publishMain();
    },
    remount() { unmount(); unmount = ctx.uiRenderer.mount(document.getElementById('app')); },
    hideMount() { unmount(); },
    showMount() { unmount = ctx.uiRenderer.mount(document.getElementById('app')); },
    async unloadQuestions() { await questionsFiber.dispose(); },
    async reloadQuestions() { await mountQuestions(); },
    async dispose() { observer.disconnect(); unmount(); mainRef.release(); retained.release(); await ctx.fiber.dispose(); },
};
mark('fixture-ready');
