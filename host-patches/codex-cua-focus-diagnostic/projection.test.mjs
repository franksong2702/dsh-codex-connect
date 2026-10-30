import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const { taskErrorProjection, taskDiagnosticProjection, createTaskDiagnostics } = await import(pathToFileURL(process.env.FOCUS_DIAGNOSTIC_MODULE));
const old = await import(pathToFileURL(process.env.FOCUS_DIAGNOSTIC_BASELINE));
test('baseline collapsed settle reason; overlay preserves stage through both projections', () => {
    const error = Object.assign(new Error('Initial Chrome focus did not settle within the bounded preparation window'), { code: 'CUA_INPUT_FOCUS_LOST' });
    assert.equal(old.taskErrorProjection(error, 'arm', 'native')[0].focus, undefined);
    const d = createTaskDiagnostics(); d.enter('arm'); d.error(error, 'arm', 'native');
    const focus = taskDiagnosticProjection(d.snapshot()).primary.focus;
    assert.deepEqual(focus, {phase:'settle_timeout'});
});
test('final AX and foreground are distinct; original focus code and takeover reason remain intact', () => {
    for (const [message, phase] of [['Selected Chrome window lost focus or identity','final_ax'],['Foreground changed; Chrome input stops','final_foreground']]) {
        const value = taskErrorProjection(Object.assign(new Error(message), {code:'CUA_INPUT_FOCUS_LOST'}), 'arm', 'native')[0];
        assert.equal(value.reason, 'focus_lost'); assert.equal(value.focus.phase, phase);
    }
    assert.equal(taskErrorProjection({code:'CUA_INPUT_USER_TAKEOVER',message:'secret'}, 'arm', 'native')[0].reason, 'hardware_changed');
});
test('untrusted messages and objects cannot leak content or spoof invalid stages', () => {
    for (const message of ['Initial Chrome focus did not settle within the bounded preparation window secret title', 'FOCUS_SETTLE:10221x', 'Selected Chrome window lost focus or identity secret', 'SECRET']) {
        const value=taskErrorProjection({code:'CUA_INPUT_FOCUS_LOST',message},'arm','native')[0];
        assert.equal(value.focus, undefined); assert(!JSON.stringify(value).includes('secret'));
    }
    assert.equal(taskErrorProjection({code:'CUA_INPUT_FOCUS_LOST',message:'Selected Chrome window lost focus or identity'},'monitor','host')[0].focus,undefined);
    const forged=taskDiagnosticProjection({stage:'arm',chain:[{code:'CUA_INPUT_FOCUS_LOST',stage:'arm',source:'native',focus:{phase:'settle',frontProcess:'secret'}}]});
    assert.equal(forged.chain[0].focus,undefined); assert(!JSON.stringify(forged).includes('secret'));
});
test('raw errors require an exact message, regardless of a forged projected focus', () => {
    let reads=0;
    const value={code:'CUA_INPUT_FOCUS_LOST',message:'not a native focus message',get focus(){reads++;return {phase:'final_ax'}}};
    const projected=taskErrorProjection(value,'arm','native')[0];
    assert.equal(projected.focus,undefined);assert.equal(reads,0);
});
test('projected phase getter is read once and its untrusted later value cannot leak', () => {
    let reads=0;
    const focus={get phase(){reads++;return reads===1?'final_ax':'PRIVATE_SENTINEL'}};
    const row={code:'CUA_INPUT_FOCUS_LOST',stage:'arm',source:'native',focus};
    const result=taskDiagnosticProjection({stage:'arm',chain:[row]});
    assert.equal(reads,1);assert.deepEqual(result.chain[0].focus,{phase:'final_ax'});
    assert(!JSON.stringify(result).includes('PRIVATE_SENTINEL'));
});
test('native message getter is sampled only once', () => {
    let reads=0;
    const error={code:'CUA_INPUT_FOCUS_LOST',get message(){reads++;return reads===1?'unknown':'Selected Chrome window lost focus or identity'}};
    assert.equal(taskErrorProjection(error,'arm','native')[0].focus,undefined);assert.equal(reads,1);
});
test('throwing diagnostic getters cannot replace the original error projection', () => {
    const error={code:'CUA_INPUT_FOCUS_LOST',get message(){throw Error('PRIVATE_SENTINEL')}};
    const projected=taskErrorProjection(error,'arm','native')[0];
    assert.equal(projected.code,'CUA_INPUT_FOCUS_LOST');assert.equal(projected.focus,undefined);
    const row={code:'CUA_INPUT_FOCUS_LOST',stage:'arm',source:'native',get focus(){throw Error('PRIVATE_SENTINEL')}};
    const snapshot=taskDiagnosticProjection({stage:'arm',chain:[row]});
    assert.equal(snapshot.chain[0].focus,undefined);assert(!JSON.stringify(snapshot).includes('PRIVATE_SENTINEL'));
});
