import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { prepareTaskTarget } from './task-target-flow.mjs'

test('unit-tested preparation is embedded verbatim in the exact Host patch', async () => {
  const module = (await readFile(new URL('./task-target-flow.mjs', import.meta.url), 'utf8'))
    .replace("import { randomUUID } from 'node:crypto'\n", '')
    .replace(/^export /gmu, '')
  const patch = await readFile(new URL('./patches/dsh-cua.patch', import.meta.url), 'utf8')
  assert.ok(patch.includes(module.trimEnd().split('\n').map(line => `+${line}`).join('\n')))
})

function fixture({ apps, windows, answer, nativeError, closeError } = {}) {
  const messages = [{ id: 'real-input-1', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: '在Chrome里完成本次任务' }] }]
  const parent = { id: 'root', inbox: { nextTurn: [], nextStep: [] }, session: { deriveMessages: () => messages } }
  const requests = [], questions = [], rows = new Map(), refusals = new WeakMap()
  const listeners = new Map()
  const ctx = { on(name, listener) { const set = listeners.get(name) ?? new Set(); listeners.set(name, set); set.add(listener); return () => set.delete(listener) },
    agents: { get: id => id === parent.id ? parent : undefined, roots: () => [parent] }, get: () => ({ async ask(request) {
    questions.push(request)
    return answer ? answer(request) : { answers: [{ id: request.questions[0].id, selected: [request.questions[0].options[0].label] }] }
  } }) }
  const targets = { ctx, rows, error: code => Object.assign(new Error(code), { code }), root: id => ctx.agents.get(id),
    async inOrder(_root, operation) { return operation() },
    async start(root) {
      const row = { root, controller: new AbortController(), expiresAt: Date.now() + 120000, candidates: [], release() {}, client: { async request(method, params) {
        requests.push({ method, params })
        if (nativeError) throw nativeError
        if (method === 'listApps') return apps ?? [{ pid: 11, name: 'Google Chrome', bundleId: 'com.google.Chrome' }, { pid: 99, name: 'Private unrelated application', bundleId: 'org.private.Unrelated' }]
        if (method === 'getApp') return { pid: Number(params.selector), appHandle: `app-${params.selector}`, name: 'Google Chrome', bundleId: 'com.google.Chrome', authorization: { id: 'private-process-identity' } }
        if (method === 'prepareTaskWindows') return windows ?? [{ pid: row.app.pid, windowId: 7, title: 'PRIVATE_WINDOW_TITLE', targetKey: 'private-anchor' }]
        if (method === 'bindTaskWindow') return { validated: true }
        throw new Error('Unexpected native method')
      } } }; rows.set(root, row); return row
    },
    assert(row) { if (row.closed || row.expiresAt <= Date.now() || rows.get(parent) !== row) throw this.error('CUA_TARGET_CLOSED'); row.controller.signal.throwIfAborted() },
    prepared(app, pid, bundle) { assert.equal(app.pid, pid); assert.equal(app.bundleId, bundle); return app },
    async windows(row) { row.candidates = (await row.client.request('prepareTaskWindows', { appHandle: row.app.appHandle })).map(window => ({ ...window, id: `candidate-${window.windowId}`, application: row.app.name })) },
    target(root) { const row = rows.get(root); this.assert(row); return { application: String(row.app.pid), windowId: row.selected.windowId, targetSelectionId: row.selected.id } },
    async close(row) { row.closed = true; clearTimeout(row.timer); row.controller.abort(); if (closeError) throw closeError; rows.delete(row.root); row.release?.() },
  }
  const access = { taskRefusals: refusals }, controller = new AbortController()
  const input = () => ({ parent, goal: 'MODEL_GOAL_HAS_NO_DISCOVERY_AUTHORITY', expiresAt: Date.now() + 2000, signal: controller.signal })
  const run = () => prepareTaskTarget(targets, access, input())
  const cleanup = () => Promise.allSettled([...rows.values()].map(row => targets.close(row)))
  const emit = (name, ...args) => { for (const listener of listeners.get(name) ?? []) listener(...args) }
  return { parent, messages, targets, access, controller, input, requests, questions, run, cleanup, emit, listeners }
}

test('unique target prepares automatically; only related app is queried and no directory is returned', async () => {
  const f = fixture()
  try {
    const before = JSON.stringify(f.messages)
    assert.deepEqual(await f.run(), { application: '11', windowId: 7, targetSelectionId: 'candidate-7' })
    assert.equal(f.questions.length, 0)
    assert.deepEqual(f.requests.filter(x => x.method === 'getApp').map(x => x.params.selector), ['11'])
    assert.equal(JSON.stringify(f.messages), before)
    assert.equal(f.requests.some(x => ['screenshot', 'getState', 'click', 'pressKey'].includes(x.method)), false)
  } finally { await f.cleanup() }
})

test('ambiguity is answered through the exact root without mutating model messages', async () => {
  const f = fixture({ windows: [7, 8].map(windowId => ({ pid: 11, windowId, title: `PRIVATE_${windowId}`, targetKey: `anchor-${windowId}` })),
    answer: async request => { assert.equal(request.agent, f.parent); return { answers: [{ id: 'cua-task-window', selected: [request.questions[0].options[1].label] }] } } })
  try {
    const result = await f.run()
    assert.equal(result.windowId, 8)
    assert.equal(JSON.stringify(result).includes('PRIVATE_'), false)
    assert.equal(JSON.stringify(f.messages).includes('PRIVATE_'), false)
    assert.equal(f.requests.at(-1).params.targetKey, 'anchor-8')
  } finally { await f.cleanup() }
})

test('forged root and absent human input cannot enumerate anything', async () => {
  const f = fixture()
  await assert.rejects(prepareTaskTarget(f.targets, f.access, { ...f.input(), parent: { ...f.parent } }), /LIVE_ROOT/)
  f.messages.length = 0
  await assert.rejects(f.run(), /USER_REQUEST_REQUIRED/)
  assert.equal(f.requests.length, 0)
})

test('model goal cannot select a different private application', async () => {
  const f = fixture()
  try { await prepareTaskTarget(f.targets, f.access, { ...f.input(), goal: 'Operate Private unrelated application' }); assert.equal(f.requests.find(x => x.method === 'getApp').params.selector, '11') }
  finally { await f.cleanup() }
})

test('dismissal locks this human input and drains metadata before another request', async () => {
  const f = fixture({ windows: [7, 8].map(windowId => ({ pid: 11, windowId, title: 'PRIVATE', targetKey: `anchor-${windowId}` })), answer: async () => { throw new Error('dismissed PRIVATE_TITLE') } })
  await assert.rejects(f.run(), error => error.code === 'CUA_TARGET_METADATA_UNAVAILABLE' && !String(error).includes('PRIVATE_TITLE'))
  const count = f.requests.length
  await assert.rejects(f.run(), /RETRY_REQUIRES_USER_INPUT/)
  assert.equal(f.requests.length, count)
  assert.equal(f.targets.rows.size, 0)
})

test('native errors are scrubbed and cleanup uncertainty remains closed', async () => {
  const f = fixture({ nativeError: new Error('PRIVATE_APP_PATH'), closeError: new Error('unconfirmed exit') })
  await assert.rejects(f.run(), error => error.code === 'CUA_TARGET_CLEANUP_UNCERTAIN' && !String(error).includes('PRIVATE_APP_PATH'))
  assert.equal(f.targets.rows.get(f.parent).closed, true)
})

test('changed real human input during metadata prevents binding', async () => {
  const f = fixture({ windows: [7, 8].map(windowId => ({ pid: 11, windowId, title: 'PRIVATE', targetKey: `anchor-${windowId}` })), answer: async request => {
    f.messages.push({ ...f.messages[0], id: 'real-input-2' })
    return { answers: [{ id: 'cua-task-window', selected: [request.questions[0].options[0].label] }] }
  } })
  await assert.rejects(f.run(), /REQUEST_CHANGED/)
  assert.equal(f.requests.some(x => x.method === 'bindTaskWindow'), false)
})

test('selection cancellation aborts metadata and locks the same admitted input', async () => {
  let pending
  const entered = new Promise(resolve => { pending = resolve })
  const f = fixture({ windows: [7, 8].map(windowId => ({ pid: 11, windowId, title: 'PRIVATE', targetKey: `anchor-${windowId}` })),
    answer: request => { pending(); return new Promise((_resolve, reject) => request.signal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true })) } })
  const run = f.run()
  await entered
  f.controller.abort()
  await assert.rejects(run, /CANCELLED/)
  assert.equal(f.requests.some(request => request.method === 'bindTaskWindow'), false)
  assert.equal(f.targets.rows.size, 0)
  assert.equal(f.access.taskRefusals.get(f.parent), 'real-input-1')
})

test('no running match never binds or observes a window', async () => {
  const f = fixture({ apps: [], answer: async () => ({ answers: [{ id: 'cua-task-application', selected: [], custom: 'Chrome' }] }) })
  await assert.rejects(f.run(), /NO_RUNNING_APPLICATION/)
  assert.deepEqual(f.requests.map(request => request.method), ['listApps'])
  assert.equal(f.targets.rows.size, 0)
})

test('expired task and untrusted model-only input fail before native creation', async () => {
  const f = fixture()
  await assert.rejects(prepareTaskTarget(f.targets, f.access, { ...f.input(), expiresAt: Date.now() - 1 }), /INVALID_TASK/)
  f.messages[0].source.kind = 'agent'
  await assert.rejects(f.run(), /USER_REQUEST_REQUIRED/)
  assert.equal(f.requests.length, 0)
})

test('already queued human replacement blocks before metadata and goal/expiry remain frozen', async () => {
  const f = fixture()
  f.parent.inbox.nextStep.push({ ...f.messages[0], id: 'next-human-input' })
  await assert.rejects(f.run(), /REQUEST_CHANGED/)
  assert.equal(f.requests.length, 0)
  f.parent.inbox.nextStep.length = 0
  const input = f.input()
  await prepareTaskTarget(f.targets, f.access, input)
  const flow = f.targets.rows.get(f.parent).flow
  assert.equal(Object.isFrozen(flow), true)
  assert.equal(flow.userInput, 'real-input-1')
  assert.equal(flow.goal, input.goal)
  assert.equal(flow.expiresAt, input.expiresAt)
  await f.cleanup()
})

test('input watch ignores lookalike session/agent identities and stops on the exact root', async () => {
  const f = fixture()
  await f.run()
  const message = { ...f.messages[0], id: 'new-human-input' }
  f.emit('session/event', { ...f.parent.session }, { type: 'user/message', data: message })
  f.emit('agent/inbox/inserted', { agent: { ...f.parent }, message })
  assert.equal(f.targets.rows.size, 1)
  f.emit('agent/inbox/inserted', { agent: f.parent, message })
  assert.equal(f.targets.rows.size, 0)
  assert.equal(f.access.taskRefusals.get(f.parent), 'real-input-1')
  assert.ok([...f.listeners.values()].every(set => set.size === 0))
})
