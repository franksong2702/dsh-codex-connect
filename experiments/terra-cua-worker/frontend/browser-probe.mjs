/** Passive synthetic-fixture probe: wraps existing handlers; never subscribes an answerer. */
export function installFrontendProbe(ctx, trace) {
    const mark = (stage, data) => trace.record(stage, data);
    const events = new Map(), questions = new WeakMap();
    const remote = ctx.remote;
    let generation = 0, sequence = 0;
    const originalPump = remote.events.pumpEvents.bind(remote.events);
    remote.events.pumpEvents = (...args) => { generation++; return originalPump(...args); };
    const originalAnswer = remote.events.answer.bind(remote.events);
    remote.events.answer = (frame, clientId, signal) => {
        if (!events.has(frame.eventId)) {
            if (events.size === 256) events.delete(events.keys().next().value);
            events.set(frame.eventId, ++sequence);
        }
        const meta = { event: events.get(frame.eventId), generation };
        questions.set(frame.request.questions, meta);
        mark('receive', meta);
        const abort = () => mark('delivery-abort', meta);
        signal.addEventListener('abort', abort, { once: true });
        const result = originalAnswer(frame, clientId, signal);
        const drained = () => { signal.removeEventListener('abort', abort); mark('delivery-drained', meta); };
        result.then(drained, drained);
        return result;
    };
    const originalDispatch = remote.events.dispatchWaterfall.bind(remote.events);
    remote.events.dispatchWaterfall = (target, frame, signal) => {
        mark('dispatch', questions.get(frame.request.questions));
        return originalDispatch(target, frame, signal);
    };
    const originalOn = remote.$on;
    remote.$on = function (event, listener) {
        return originalOn.call(this, event, event === 'user-questions/request' ? function (request, ...args) {
            mark('listener', questions.get(request.questions));
            return listener.call(this, request, ...args);
        } : listener);
    };
    return {
        observe(document) {
            const view = document.defaultView;
            const inspect = () => {
                const nodes = [...document.querySelectorAll('[data-question-key]')];
                if (!nodes.length) mark('mount', { count: 0, visible: document.visibilityState === 'visible', inViewport: false });
                for (const pending of ctx.get('uiSession')?.pendingSnapshot.values() ?? []) {
                    const node = nodes.find(node => node.getAttribute('data-question-key') === pending.key);
                    if (!node) continue;
                    const box = node.getBoundingClientRect();
                    mark('mount', { ...questions.get(pending.questions), count: nodes.length, visible: document.visibilityState === 'visible', inViewport: box.width > 0 && box.height > 0 && box.x < view.innerWidth && box.y < view.innerHeight && box.right > 0 && box.bottom > 0 });
                }
            };
            const observer = new view.MutationObserver(inspect);
            observer.observe(document.body, { subtree: true, childList: true });
            inspect();
            return () => observer.disconnect();
        },
    };
}
