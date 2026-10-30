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
  const frame = { eventId: 'PRIVATE_EVENT_ID', request: { questions: [] } }
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
