import assert from 'node:assert/strict'
import test from 'node:test'
import { installFrontendProbe } from './browser-probe.mjs'
import { createFrontendTrace } from './diagnostics.mjs'

test('passive wrappers preserve original promises, receiver, cancellation and rejection', async () => {
  const callbacks = [], marker = {}, failure = new Error('synthetic'), abort = new AbortController()
  let settle, calls = 0
  const completion = new Promise((resolve, reject) => { settle = { resolve, reject } })
  const remote = { events: {
    pumpEvents() { return marker },
    answer() { calls++; return completion },
    dispatchWaterfall() { throw failure },
  }, $on(event, listener) { callbacks.push({ event, listener }); return marker } }
  const trace = createFrontendTrace()
  installFrontendProbe({ remote }, trace)
  assert.equal(callbacks.length, 0, 'probe itself must never register an answerer')
  assert.equal(remote.events.pumpEvents(), marker)
  const frame = { event: 'user-questions/request', eventId: 'PRIVATE_EVENT_ID', request: { questions: [] } }
  assert.equal(remote.events.answer(frame, 'PRIVATE_CLIENT', abort.signal), completion)
  assert.throws(() => remote.events.dispatchWaterfall({}, frame, abort.signal), error => error === failure)
  const receiver = {}
  assert.equal(remote.$on('user-questions/request', function (request, next) { assert.equal(this, receiver); return next }), marker)
  assert.equal(callbacks[0].listener.call(receiver, { questions: frame.request.questions }, marker), marker)
  abort.abort()
  settle.reject(failure)
  await assert.rejects(completion, error => error === failure)
  await Promise.resolve()
  assert.equal(calls, 1)
  assert(trace.snapshot().some(row => row.stage === 'delivery-abort' && row.event === 1 && row.generation === 1))
  assert(trace.snapshot().some(row => row.stage === 'delivery-drained'))
  assert(!JSON.stringify(trace.snapshot()).includes('PRIVATE'))
})

test('non-question and incomplete frames pass through unchanged without diagnostic interpretation', async () => {
  const trace = createFrontendTrace(), calls = [], callbacks = [], marker = {}, failure = new Error('original rejection')
  const promise = Promise.reject(failure)
  promise.catch(() => {})
  const remote = { events: {
    pumpEvents() {},
    answer(...args) { calls.push({ receiver: this, args }); return promise },
    dispatchWaterfall(...args) { calls.push({ receiver: this, args }); return marker },
  }, $on(event, listener) { callbacks.push(listener); return marker } }
  installFrontendProbe({ remote }, trace)
  const frames = [undefined, null, {}, { event: 'another/event', request: {} },
    { event: 'another/event', eventId: 'PRIVATE_ID', request: { questions: [] } },
    { event: 'user-questions/request' },
    { event: 'user-questions/request', eventId: 'PRIVATE_ID', request: null },
    { event: 'user-questions/request', eventId: 'PRIVATE_ID', request: {} },
    { event: 'user-questions/request', eventId: 'PRIVATE_ID', request: { questions: 'PRIVATE_TEXT' } },
    { event: 'user-questions/request', request: { questions: [] } }]
  for (const frame of frames) {
    assert.equal(remote.events.answer(frame, marker, undefined), promise)
    assert.deepEqual(calls.at(-1), { receiver: remote.events, args: [frame, marker, undefined] })
    assert.equal(remote.events.dispatchWaterfall(marker, frame, undefined), marker)
    assert.deepEqual(calls.at(-1), { receiver: remote.events, args: [marker, frame, undefined] })
  }
  const listener = () => marker
  assert.equal(remote.$on('another/event', listener), marker)
  assert.equal(callbacks[0], listener, 'unknown event listeners are not wrapped')
  remote.$on('user-questions/request', function (value, next) { assert.equal(this, marker); assert.equal(value, undefined); return next })
  assert.equal(callbacks[1].call(marker, undefined, marker), marker)
  await assert.rejects(promise, error => error === failure)
  assert.deepEqual(trace.snapshot(), [])
})

test('original synchronous throw and missing signal stay transparent', () => {
  const failure = new Error('original throw'), marker = {}, trace = createFrontendTrace()
  let added = 0, removed = 0, value = marker
  const signal = { addEventListener() { added++ }, removeEventListener() { removed++ } }
  const remote = { events: {
    pumpEvents() {}, answer() { if (value === failure) throw failure; return value }, dispatchWaterfall() {},
  }, $on() {} }
  installFrontendProbe({ remote }, trace)
  const frame = { event: 'user-questions/request', eventId: 'PRIVATE_ID', request: { questions: [] } }
  assert.equal(remote.events.answer(frame, marker, undefined), marker)
  assert.deepEqual(trace.snapshot(), [])
  assert.equal(remote.events.answer(frame, marker, signal), marker)
  value = failure
  assert.throws(() => remote.events.answer(frame, marker, signal), error => error === failure)
  assert.equal(added, 2)
  assert.equal(removed, 2, 'sync throws do not leak probe abort listeners')
})
