import test from 'node:test';
import assert from 'node:assert/strict';
import { observeDiagnostic } from '../observer.mjs';
const binding = { sessionId: 'synthetic-root', correlation: '11111111-1111-1111-1111-111111111111' };
function fixture(answer = () => Promise.resolve('original')) {
    let generation = {}, handler, subscriptions = 0;
    const ctx = { remote: { events: { answer, dispatchWaterfall: (...args) => args }, $on: () => { throw new Error('NO_NEW_ANSWER_LISTENER'); } }, uiSession: { pendingSnapshot: new Map() }, connection: { generation: { getSnapshot: () => generation, subscribe: callback => { handler = callback; subscriptions++; return () => subscriptions--; } } } };
    const document = { querySelectorAll: () => [], visibilityState: 'visible', defaultView: {} }, records = [];
    const observer = observeDiagnostic(ctx, document, row => records.push(row));
    return { ctx, document, observer, records, subscriptions: () => subscriptions, generation: () => { generation = {}; handler(); } };
}
const frame = () => ({ event: 'user-questions/request', agentId: binding.sessionId, request: { questions: [{ id: 'codex-display-diagnostic-' + binding.correlation }] } });
test('unrelated malformed/foreign question frames preserve receiver,args,return without observation', () => {
    const result = Promise.resolve('identity'), calls = [];
    const original = function (...args) { calls.push([this, ...args]); return result; };
    const f = fixture(original); f.observer.arm(binding);
    for (const value of [undefined, {}, { event: 'approval/request' }, { ...frame(), agentId: 'foreign' }, { ...frame(), request: {} }]) {
        assert.equal(f.ctx.remote.events.answer(value, 'client', undefined), result);
    }
    assert.equal(calls.length, 5); assert(calls.every(row => row[0] === f.ctx.remote.events)); assert.equal(f.observer.snapshot().receive, 0);
    f.observer.dispose(); assert.equal(f.ctx.remote.events.answer, original); assert.equal(f.subscriptions(), 0);
});
test('known nonce records finite counts; exact promise and synchronous error preserved', async () => {
    const error = new Error('private text must not leave'), original = () => { throw error; };
    const f = fixture(original); f.observer.arm(binding);
    assert.throws(() => f.ctx.remote.events.answer(frame()), value => value === error);
    assert.equal(f.observer.snapshot().receive, 1); assert(!JSON.stringify(f.records).includes('private')); f.observer.dispose();
    const g = fixture(); g.observer.arm(binding); g.generation(); await g.ctx.remote.events.answer(frame());
    assert.equal(g.observer.snapshot().generation, 2); assert.equal(g.observer.snapshot().drained, 1); g.observer.dispose();
});
test('disposal does not overwrite a later wrapper; no private identifiers in exported projection', () => {
    const f = fixture(); f.observer.arm(binding); f.ctx.remote.events.answer(frame());
    const later = () => {}; f.ctx.remote.events.answer = later; f.observer.dispose();
    assert.equal(f.ctx.remote.events.answer, later);
    assert(!JSON.stringify(f.records).includes(binding.sessionId)); assert(!JSON.stringify(f.records).includes(binding.correlation));
    assert.deepEqual(Object.keys(f.observer.snapshot()).sort(), ['dispatch','drained','generation','inViewport','mounted','pending','receive','visible'].sort());
});
