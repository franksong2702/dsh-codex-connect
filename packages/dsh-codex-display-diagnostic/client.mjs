import { observeDiagnostic } from './observer.mjs';

export const inject = ['remote', 'connection', 'uiSession'];
export function apply(ctx) {
    ctx.effect(() => {
        const lifetime = new AbortController();
        let panel, observer, refresh, state, used = false, busy = false, counts;
        const call = async command => {
            const response = await fetch('/codex-display-diagnostic', { method: 'POST', credentials: 'same-origin',
                headers: { 'content-type': 'application/json' }, body: JSON.stringify(command), signal: lifetime.signal });
            if (!response.ok) throw new Error('DISPLAY_DIAGNOSTIC_UNAVAILABLE');
            return response.json();
        };
        const paint = () => {
            if (!panel) return;
            panel.querySelector('output').textContent = JSON.stringify({ state: state?.state ?? 'unavailable', outcome: state?.outcome ?? 'none', lastObservation: counts ?? null });
            panel.querySelector('[data-diagnostic-start]').disabled = busy || used || state?.state !== 'idle';
            panel.querySelector('[data-diagnostic-stop]').disabled = busy || !['prepared', 'sent'].includes(state?.state);
        };
        const finish = () => { clearInterval(refresh); observer?.dispose(); observer = undefined; paint(); };
        const poll = () => {
            let checking = false;
            refresh = setInterval(async () => {
                if (checking) return; checking = true;
                try { state = await call({ action: 'status' }); if (state.state === 'ended') finish(); else paint(); }
                catch { state = { state: 'unavailable', outcome: 'unknown' }; finish(); }
                finally { checking = false; }
            }, 250);
        };
        const run = async action => {
            if (busy || lifetime.signal.aborted) return;
            busy = true; paint();
            try {
                if (action === 'start') {
                    used = true;
                    state = await call({ action: 'prepare' });
                    observer = observeDiagnostic(ctx, document, value => { counts = value; paint(); });
                    observer.arm(state); // Install before the Host emits this one question.
                    state = await call({ action: 'send', correlation: state.correlation });
                    poll();
                } else {
                    state = await call({ action: 'stop', correlation: state.correlation }); finish();
                }
            } catch { state = { state: 'unavailable', outcome: 'unknown' }; finish(); }
            finally { busy = false; paint(); }
        };
        // One authenticated status read. Disabled/absent Host means no UI or wrappers.
        void call({ action: 'status' }).then(value => {
            if (lifetime.signal.aborted || !/^[a-zA-Z0-9-]{1,80}$/.test(value.sessionId ?? '')) return;
            state = value;
            const sessionId = value.sessionId;
            panel = document.createElement('section'); panel.setAttribute('data-codex-display-diagnostic', '');
            const label = document.createElement('p'); label.textContent = '显示链路诊断：不运行模型、不控制桌面、不授予权限。';
            const start = document.createElement('button'); start.textContent = '开始一次显示诊断'; start.setAttribute('data-diagnostic-start', ''); start.onclick = () => { void run('start'); };
            const stop = document.createElement('button'); stop.textContent = '停止诊断'; stop.setAttribute('data-diagnostic-stop', ''); stop.onclick = () => { void run('stop'); };
            const output = document.createElement('output'); output.setAttribute('data-diagnostic-counts', ''); output.style.display = 'block';
            panel.append(label, start, stop, output);
            const attach = () => {
                const target = [...document.querySelectorAll('[data-conversation-session]')].find(node => node.getAttribute('data-conversation-session') === sessionId);
                if (target && panel.parentElement !== target) target.append(panel);
            };
            const dom = new MutationObserver(attach); dom.observe(document.body, { childList: true, subtree: true });
            lifetime.signal.addEventListener('abort', () => dom.disconnect(), { once: true });
            // A newly loaded browser can observe an already active diagnostic.
            // Counters start here; they cannot reconstruct earlier delivery.
            if (['prepared', 'sent'].includes(state.state)) {
                used = true;
                observer = observeDiagnostic(ctx, document, value => { counts = value; paint(); });
                observer.arm(state);
                poll();
            }
            attach(); paint();
        }).catch(() => {});
        return () => { lifetime.abort(); finish(); panel?.remove(); };
    }, 'display diagnostic: bounded observation UI');
}
