/** Narrow production observer. No answer subscription, answer callback, storage or network. */
export function observeDiagnostic(ctx, document, publish) {
    let binding, disposed = false, generation = 1;
    let previousGeneration = ctx.connection.generation.getSnapshot();
    let counts = { receive: 0, dispatch: 0, drained: 0, pending: false, mounted: false, inViewport: false, visible: false, generation: 1 };
    const safe = action => { try { action(); } catch { /* Diagnostic observation must not alter production flow. */ } };
    const emit = () => safe(() => publish({ ...counts }));
    const matches = frame => binding && frame?.event === 'user-questions/request' && frame.agentId === binding.sessionId &&
        Array.isArray(frame.request?.questions) && frame.request.questions.length === 1 && frame.request.questions[0]?.id === 'codex-display-diagnostic-' + binding.correlation;
    const events = ctx.remote.events;
    const originalAnswer = events.answer, originalDispatch = events.dispatchWaterfall;
    function answer(...args) {
        const matched = matches(args[0]);
        if (matched) safe(() => { counts.receive = Math.min(32, counts.receive + 1); counts.generation = generation; emit(); });
        const result = Reflect.apply(originalAnswer, this, args);
        if (matched && typeof result?.then === 'function') result.then(() => safe(() => { counts.drained = Math.min(32, counts.drained + 1); emit(); }), () => safe(() => { counts.drained = Math.min(32, counts.drained + 1); emit(); }));
        return result;
    }
    function dispatch(...args) {
        if (matches(args[1])) safe(() => { counts.dispatch = Math.min(32, counts.dispatch + 1); emit(); });
        return Reflect.apply(originalDispatch, this, args);
    }
    events.answer = answer; events.dispatchWaterfall = dispatch;
    const stopGeneration = ctx.connection.generation.subscribe(() => safe(() => {
        const current = ctx.connection.generation.getSnapshot();
        if (current !== previousGeneration) { previousGeneration = current; generation = Math.min(32, generation + 1); }
    }));
    const inspect = () => safe(() => {
        if (!binding || disposed) return;
        const pending = ctx.uiSession.pendingSnapshot.get(binding.sessionId);
        const correct = pending?.questions?.length === 1 && pending.questions[0]?.id === 'codex-display-diagnostic-' + binding.correlation;
        const panel = [...document.querySelectorAll('[data-conversation-session]')].find(node => node.getAttribute('data-conversation-session') === binding.sessionId);
        const node = correct && panel && [...panel.querySelectorAll('[data-question-key]')].find(node => node.getAttribute('data-question-key') === pending.key);
        const rect = node?.getBoundingClientRect(), view = document.defaultView;
        const next = { pending: Boolean(correct), mounted: Boolean(node), visible: document.visibilityState === 'visible',
            inViewport: Boolean(rect && rect.width > 0 && rect.height > 0 && rect.right > 0 && rect.bottom > 0 && rect.left < view.innerWidth && rect.top < view.innerHeight) };
        if (Object.entries(next).some(([key, value]) => counts[key] !== value)) { Object.assign(counts, next); emit(); }
    });
    const timer = setInterval(inspect, 100);
    return {
        arm(value) {
            if (disposed || binding || !/^[a-zA-Z0-9-]{1,80}$/.test(value?.sessionId ?? '') || !/^[a-f0-9-]{36}$/.test(value?.correlation ?? '')) throw new Error('DISPLAY_DIAGNOSTIC_BINDING_INVALID');
            binding = { sessionId: value.sessionId, correlation: value.correlation }; emit(); inspect();
        },
        snapshot: () => ({ ...counts }),
        dispose() {
            if (disposed) return;
            disposed = true; clearInterval(timer); stopGeneration(); binding = undefined;
            if (events.answer === answer) events.answer = originalAnswer;
            if (events.dispatchWaterfall === dispatch) events.dispatchWaterfall = originalDispatch;
        },
    };
}
