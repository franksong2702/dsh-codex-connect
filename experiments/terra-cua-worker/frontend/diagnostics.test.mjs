import assert from 'node:assert/strict'
import test from 'node:test'
import { createFrontendTrace } from './diagnostics.mjs'
test('probe rejects unbounded stages and never copies content or identifiers', () => {
  const trace = createFrontendTrace()
  const privateData = { question: 'PRIVATE_QUESTION', input: 'PRIVATE_INPUT', credential: 'PRIVATE_TOKEN', agentId: 'PRIVATE_ID', title: 'PRIVATE_TITLE', event: 'PRIVATE_EVENT' }
  assert.equal(trace.record('PRIVATE_STAGE', privateData), false)
  for (const stage of ['receive', 'dispatch', 'listener', 'pending', 'mount', 'visibility']) trace.record(stage, { ...privateData, count: 1, visible: true, state: 'hidden' })
  assert(!JSON.stringify(trace.snapshot()).includes('PRIVATE'))
  assert.deepEqual(trace.snapshot()[0], { sequence: 1, stage: 'receive' })
  assert.deepEqual(trace.snapshot()[4], { sequence: 5, stage: 'mount', count: 1, visible: true })
})
test('bounded snapshots are detached and invalid metrics are excluded', () => {
  const trace = createFrontendTrace({ limit: 2 })
  trace.record('pending', { count: 'secret' }); trace.record('mount', { count: 101, visible: 'secret' }); trace.record('ready')
  const rows = trace.snapshot(); assert.equal(rows.length, 2)
  assert.deepEqual(rows[0], { sequence: 2, stage: 'mount' })
  rows[0].stage = 'changed'; assert.equal(trace.snapshot()[0].stage, 'mount')
  for (const limit of [0, 257, Infinity, '128']) assert.throws(() => createFrontendTrace({ limit }), RangeError)
})
test('correlation accepts only bounded local ordinals and distinguishes viewport from visibility', () => {
  const trace = createFrontendTrace()
  trace.record('receive', { event: 'PRIVATE_WIRE_ID', generation: -1 })
  trace.record('mount', { event: 3, generation: 2, count: 1, visible: true, inViewport: false })
  assert.deepEqual(trace.snapshot(), [
    { sequence: 1, stage: 'receive' },
    { sequence: 2, stage: 'mount', count: 1, event: 3, generation: 2, visible: true, inViewport: false },
  ])
})
