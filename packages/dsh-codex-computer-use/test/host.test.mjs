/** Real published Host loop and Native pipeline, scripted in-memory provider/CUA. No network or GUI. */
import { afterEach, test } from 'node:test'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import assert from 'node:assert/strict'
import { mkdtemp, rm, unlink, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { PassThrough, Writable } from 'node:stream'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import Llm, { LlmAdapter, ReasoningEffortId, ToolCallId, createUserMessage, markAgentLoopRequest } from '@deepseek-ai/dsh-llm'
import Sessions, { SessionId } from '@deepseek-ai/dsh-session'
import Projection from '@deepseek-ai/dsh-session-projection'
import { AgentRegistry } from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import Presets from '@deepseek-ai/dsh-agent-preset-registry'
import Prompt from '@deepseek-ai/dsh-system-prompt'
import Tools from '@deepseek-ai/dsh-tools'
import { NativeToolExecutor } from '@deepseek-ai/dsh-tool-executor-native'
import ComputerUse from '@deepseek-ai/dsh-computer-use'
import UserQuestions from '@deepseek-ai/dsh-user-questions'
import { CuaConfig, installCua } from '@deepseek-ai/dsh-cua'
import { computerUseTool, operationDenial, PRESET, TOOL, ROUTE } from '../worker.mjs'
import { acquireDesktopLease } from '../lease.mjs'

const owned = []
afterEach(async () => { for (const item of owned.splice(0).reverse()) await item() })
const target = { application: 'Synthetic Browser', windowId: 7, maxDurationMs: 2000, maxSteps: 12, maxOperations: 20 }
const schema = { type: 'object' }
const output = { schema, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] }
function call(name, args) { return { type: 'tool-call', id: ToolCallId(`call-${crypto.randomUUID()}`), name, arguments: JSON.stringify(args) } }
function *toolStream(block) {
  yield { type: 'block-start', index: 0, blockType: 'tool-call' }
  yield { type: 'block-end', index: 0, block }
  yield { type: 'finish', reason: { kind: 'tool-call' } }
}

async function fixture({ script, cua, officialCua = false, strict = false, taskApproval = true, providerName = 'dsh-cua', humanAnswer, nativeResponse, config = {} } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'codex-cua-host-'))
  owned.push(() => rm(directory, { recursive: true, force: true }))
  const ctx = new Context()
  owned.push(() => ctx.fiber.dispose())
  const scopeFiber = strict && !officialCua ? await ctx.plugin({ apply(scopeCtx) {
    scopeCtx.provide('cuaWindowScope', Object.freeze({ version: 1, strictWindowScope: true }))
  } }) : undefined
  ctx.baseUrl = new URL(`file://${directory}/`).href
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  for (const service of [Llm, Sessions, Projection, AgentRegistry, Prompt, Tools, ComputerUse]) await ctx.plugin(service)
  const providerFiber = !officialCua && providerName ? await ctx.plugin({ inject: ['computerUse'], apply(providerCtx) {
    providerCtx.computerUse.register(providerName)
  } }) : undefined
  const questions = [], grants = [], nativeRequests = []
  if (!officialCua && taskApproval) ctx.provide('cuaTaskApproval', Object.freeze({ version: 1, begin(input) {
    assert.equal(ctx.agents.get(input.parent.id), input.parent)
    assert.equal(ctx.agents.get(input.child.id), input.child)
    assert.equal(ctx.agents.isOwnedBy(input.child.id, input.parent), true)
    const controller = new AbortController(), grant = { ...input, disposed: false }
    grants.push(grant)
    return { id: `synthetic-${grants.length}`, signal: controller.signal, async dispose() { grant.disposed = true }, async revoke() { controller.abort() } }
  } }))
  await ctx.plugin(Presets, { default: PRESET })
  await ctx.agentPresets.register({ id: PRESET, plugins: [] })
  await ctx.plugin(AgentLoop, { agents: [] })
  ctx.tools.setExecutor(new NativeToolExecutor(ctx))
  const seen = [], dispatched = []
  let index = 0, parentIndex = 0
  class Scripted extends LlmAdapter {
    providerInfo(id) { return { id, name: 'In-memory fixture' } }
    async listModels(provider) { return [{ provider, id: ROUTE.model, name: 'Fixture' }] }
    async resolveModel(provider, id) { return { provider, id, name: 'Fixture', reasoning: { efforts: [{ id: ReasoningEffortId('high'), name: 'high' }] } } }
    async *stream(options) {
      seen.push(options)
      if (options.model === 'flash') {
        if (parentIndex++ === 0) yield *toolStream(call(TOOL, { goal: 'Complete this task in the requested browser' }))
        else {
          yield { type: 'block-start', index: 0, blockType: 'text' }
          yield { type: 'block-end', index: 0, block: { type: 'text', text: 'Task result received' } }
          yield { type: 'finish', reason: { kind: 'stop' } }
        }
        return
      }
      if (options.model === 'fixture-unrelated') {
        yield { type: 'block-start', index: 0, blockType: 'text' }
        yield { type: 'block-end', index: 0, block: { type: 'text', text: 'unrelated request completed' } }
        yield { type: 'finish', reason: { kind: 'stop' } }
        return
      }
      const blocks = script ?? [call('cua', { method: 'getApp', params: { selector: target.application } }),
        call('cua', { method: 'screenshot', params: { appHandle: 'app-fixture', windowId: 7 } }),
        call('cua', { method: 'click', params: { appHandle: 'app-fixture', windowId: 7, x: 20, y: 20 } }),
        call('cua', { method: 'screenshot', params: { appHandle: 'app-fixture', windowId: 7 } }),
        call('finish_computer_use', { status: 'completed', summary: 'Synthetic success observed' })]
      const block = blocks[index++]
      if (Array.isArray(block)) {
        for (const [i, item] of block.entries()) {
          yield { type: 'block-start', index: i, blockType: 'tool-call' }
          yield { type: 'block-end', index: i, block: item }
        }
        yield { type: 'finish', reason: { kind: 'tool-call' } }
      } else if (block) yield *toolStream(block)
      else {
        yield { type: 'block-start', index: 0, blockType: 'text' }
        yield { type: 'block-end', index: 0, block: { type: 'text', text: 'done' } }
        yield { type: 'finish', reason: { kind: 'stop' } }
      }
    }
  }
  ctx.llm.registerAdapter(['openai-codex', 'deepseek'], new Scripted())
  ctx.tools.register({ name: 'host_shell', description: 'Forbidden capability', parameters: schema, output, async execute() { throw new Error('shell reached') } })
  // Match the official CUA provider's scoped registration lifecycle without launching its helper.
  if (officialCua) {
    await ctx.plugin(UserQuestions)
    ctx.on('user-questions/request', async (request, next) => { questions.push(request); return humanAnswer ? humanAnswer(request) : next() })
    await ctx.plugin({ inject: ['computerUse', 'agents', 'tools', 'systemPrompt'], apply(cuaCtx) {
      installCua(cuaCtx, CuaConfig({ agentPreset: PRESET, strictWindowScope: strict }), { helperPath: '/synthetic/no-executable', guidance: 'Synthetic channel', description: 'Fixture official CUA provider',
      createChannel() {
        const stdout = new PassThrough()
        let done
        const closed = new Promise(resolve => { done = resolve })
        const stdin = new Writable({ write(chunk, _encoding, callback) {
          const request = JSON.parse(chunk.toString())
          nativeRequests.push(request)
          Promise.resolve(nativeResponse ? nativeResponse(request) : request.method === 'getApp' ? { appHandle: 'app-fixture', pid: 1234, name: target.application,
            authorization: { id: 'a'.repeat(64), name: target.application, persistable: false } } : request.method === 'getState' ? {
              appHandle: 'app-fixture', pid: 1234, windowId: 7, snapshotId: 'strict-fixture', windowScope: 'strict-window', tree: 'Synthetic button', windows: [{ windowId: 7, pid: 1234, appName: target.application, title: 'Synthetic window', bounds: { x: 0, y: 0, width: 100, height: 100 }, isOnScreen: true, onCurrentSpace: true }], truncated: false,
            } : { acted: true }).then(result => { if (!stdout.writableEnded) stdout.write(JSON.stringify({ id: request.id, result }) + '\n') }, error => stdout.destroy(error))
          callback()
        } })
        return { stdin, stdout, done: closed, close() { stdout.end(); stdin.end(); done() }, waitForClose: () => closed }
      },
      })
    } })
  } else ctx.on('agent/created', ({ agent }) => {
    if (ctx.agentPresets.composedPreset(agent.ctx) !== PRESET) return
    agent.ctx.tools.register({ name: 'cua', description: 'Synthetic transport only', parameters: schema, output,
      async execute(args, exec) {
        dispatched.push({ args, agent: exec.agent })
        if (cua) return cua(args, exec)
        if (args.method === 'getApp') return { appHandle: 'app-fixture' }
        if (args.method === 'getState') return { windowId: 7, appHandle: 'app-fixture', snapshotId: 'snapshot-fixture', ...(strict ? { windowScope: 'strict-window' } : {}) }
        if (args.method === 'screenshot') return { windowId: 7 }
        return { acted: true }
      },
    })
  })
  const parent = await ctx.agents.create({ sessionId: SessionId(`parent-${crypto.randomUUID()}`), agentOptions: { provider: 'deepseek', model: 'flash' } })
  owned.push(() => parent.dispose())
  const tool = computerUseTool(ctx, { ...target, ...config }, () => acquireDesktopLease(directory))
  ctx.tools.register(tool)
  const controller = new AbortController()
  const execute = () => ctx.tools.execute({ agent: parent.agent, calls: [call(TOOL, { goal: 'Complete the synthetic UI task' })], signal: controller.signal })
  const conversation = async text => {
    parent.agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text }] }))
    await parent.agent.whenIdle()
  }
  return { ctx, parent, seen, dispatched, execute, conversation, controller, directory, scopeFiber, providerFiber, questions, grants, nativeRequests }
}

test('missing or foreign providers block before child model, task grant or native dispatch', async () => {
  for (const providerName of [null, 'foreign-provider']) {
    const f = await fixture({ providerName })
    const batch = await f.execute()
    assert.equal(batch.results[0].result.value.reason, 'official_provider_unavailable')
    assert.equal(f.seen.length, 0)
    assert.equal(f.grants.length, 0)
    assert.equal(f.dispatched.length, 0)
  }
})

test('provider registration loss with unchanged capabilities stops later worker dispatch', async () => {
  let entered, release
  const pending = new Promise(resolve => { entered = resolve })
  const resume = new Promise(resolve => { release = resolve })
  const f = await fixture({ cua: async () => { entered(); await resume; return { appHandle: 'app-fixture' } } })
  const run = f.execute()
  await pending
  await f.providerFiber.dispose()
  release()
  const batch = await run
  assert.equal(batch.results[0].result.value.reason, 'cua_provider_changed')
  assert.equal(f.dispatched.length, 1)
  assert.equal(f.grants[0].disposed, true)
})

test('independent Terra child uses the real Native pipeline and leaves the Flash parent route unchanged', async () => {
  const f = await fixture()
  const batch = await f.execute()
  assert.equal(batch.results[0].result.isError, false)
  const value = batch.results[0].result.value
  assert.equal(value.status, 'completed')
  assert.equal(value.cleanup, 'drained')
  assert.equal(value.modelSteps, 5)
  assert.equal(f.dispatched.length, 4)
  assert.ok(f.dispatched.every(call => call.agent.id === value.workerSessionId && call.agent !== f.parent.agent))
  assert.equal(f.ctx.agents.get(value.workerSessionId), undefined)
  assert.deepEqual(f.parent.agent.model.current(), { provider: 'deepseek', model: 'flash' })
  assert.equal(value.effectiveModel.model, ROUTE.model)
  assert.equal(value.acceptance, 'not_independently_verified')
})

test('active worker hooks leave unrelated Host requests and agent steps unchanged', async () => {
  let ready, release
  const entered = new Promise(resolve => { ready = resolve })
  const resume = new Promise(resolve => { release = resolve })
  let worker
  const f = await fixture({ cua: async (args, exec) => {
    if (args.method === 'getApp') { worker = exec.agent; ready(); await resume; return { appHandle: 'app-fixture' } }
    return args.method === 'screenshot' ? { windowId: 7 } : { acted: true }
  } })
  const running = f.execute()
  await entered
  try {
    for (const context of [f.ctx, worker.ctx]) {
      const chunks = []
      for await (const chunk of context.llm.stream({ provider: ROUTE.provider, model: 'fixture-unrelated', sessionId: worker.id, messages: [], signal: new AbortController().signal })) chunks.push(chunk)
      assert.equal(chunks.at(-1).reason.kind, 'stop')
    }
    const answer = await worker.ctx.waterfall(f.parent.agent, 'agent/pre-step', {
      agent: f.parent.agent, modelSelection: { provider: 'deepseek', model: 'flash' }, signal: new AbortController().signal,
    }, async () => ({ kind: 'continue' }))
    assert.equal(answer.kind, 'continue')
  } finally { release() }
  const batch = await running
  assert.equal(batch.results[0].result.value.status, 'completed')
  assert.equal(f.dispatched.length, 4)
})

test('actual worker loop dispatch still rejects a changed route before the adapter', async () => {
  let ready, release, worker
  const entered = new Promise(resolve => { ready = resolve })
  const resume = new Promise(resolve => { release = resolve })
  const f = await fixture({ cua: async (_args, exec) => {
    worker = exec.agent; ready(); await resume; return { appHandle: 'app-fixture' }
  } })
  const running = f.execute()
  await entered
  try {
    await assert.rejects(async () => {
      for await (const _chunk of worker.ctx.llm.stream(markAgentLoopRequest({
        provider: ROUTE.provider, model: 'fixture-unrelated', reasoningEffort: ReasoningEffortId('high'),
        sessionId: worker.id, messages: [], signal: new AbortController().signal,
      }))) { /* consume the guarded dispatch */ }
    }, /CUA_WORKER_ROUTE_CHANGED/)
  } finally { release() }
  const batch = await running
  assert.equal(batch.results[0].result.value.reason, 'worker_route_changed')
  assert.equal(f.seen.length, 1)
})

test('an inherited shell and run_code cannot execute', async () => {
  for (const name of ['host_shell', 'run_code']) {
    const f = await fixture({ script: [call(name, { code: 'forbidden' })] })
    const batch = await f.execute()
    assert.notEqual(batch.results[0].result.value.status, 'completed')
    assert.equal(f.dispatched.length, 0)
  }
})

test('wrong applications/windows and unobserved AX snapshots are denied before transport', () => {
  assert.equal(operationDenial({ method: 'getApp', params: { selector: 'Personal App' } }, target), 'CUA_APPLICATION_DENIED')
  assert.equal(operationDenial({ method: 'screenshot', params: { appHandle: 'a', windowId: 99 } }, target, 'a'), 'CUA_WINDOW_DENIED')
  assert.equal(operationDenial({ method: 'setValue', params: { appHandle: 'a', snapshotId: 'stolen', elementIndex: 1 } }, target, 'a'), 'CUA_AX_WINDOW_OWNERSHIP_UNVERIFIED')
  assert.equal(operationDenial({ method: 'typeText', params: { appHandle: 'a', text: 'outside' } }, target, 'a'), 'CUA_OPERATION_DENIED')
  for (const variant of [{ mouseButton: 'right' }, { mouseButton: 'middle' }, { modifiers: ['control'] }, { modifiers: ['command'] }, { holdMs: 1000 }]) {
    assert.equal(operationDenial({ method: 'click', params: { appHandle: 'a', windowId: 7, x: 20, y: 20, ...variant } }, target, 'a'), 'CUA_MENU_INPUT_DENIED')
  }
})

test('a pre-input screenshot cannot support a completed result after input', async () => {
  const f = await fixture({ script: [
    call('cua', { method: 'getApp', params: { selector: target.application } }),
    call('cua', { method: 'screenshot', params: { appHandle: 'app-fixture', windowId: 7 } }),
    call('cua', { method: 'click', params: { appHandle: 'app-fixture', windowId: 7, x: 20, y: 20 } }),
    call('finish_computer_use', { status: 'completed', summary: 'unverified' }),
  ] })
  const batch = await f.execute()
  assert.notEqual(batch.results[0].result.value.status, 'completed')
})

test('a result refusal in a batch stops later input before transport', async () => {
  const f = await fixture({ script: [call('cua', { method: 'getApp', params: { selector: target.application } }), [
    call('cua', { method: 'screenshot', params: { appHandle: 'app-fixture', windowId: 7 } }),
    call('cua', { method: 'click', params: { appHandle: 'app-fixture', windowId: 7, x: 20, y: 20 } }),
  ]], cua: async args => {
    if (args.method === 'getApp') return { appHandle: 'app-fixture' }
    throw new Error('APP_ACCESS_REVOKED: synthetic refusal')
  } })
  const batch = await f.execute()
  assert.equal(batch.results[0].result.value.reason, 'application_access_revoked')
  assert.deepEqual(f.dispatched.map(row => row.args.method), ['getApp', 'screenshot'])
})

test('sequential batch input invalidates an earlier observation before finish', async () => {
  const f = await fixture({ script: [call('cua', { method: 'getApp', params: { selector: target.application } }), [
    call('cua', { method: 'screenshot', params: { appHandle: 'app-fixture', windowId: 7 } }),
    call('cua', { method: 'click', params: { appHandle: 'app-fixture', windowId: 7, x: 20, y: 20 } }),
    call('finish_computer_use', { status: 'completed', summary: 'unverified' }),
  ]] })
  const batch = await f.execute()
  assert.notEqual(batch.results[0].result.value.status, 'completed')
})

test('strict Host attestation admits form input and element clicks in a bounded sequential batch', async () => {
  const f = await fixture({ strict: true, script: [
    call('cua', { method: 'getApp', params: { selector: target.application } }),
    call('cua', { method: 'getState', params: { appHandle: 'app-fixture', windowId: 7, includeMenus: false } }),
    [call('cua', { method: 'setValue', params: { appHandle: 'app-fixture', snapshotId: 'snapshot-fixture', elementIndex: 2, value: 'Synthetic Name' } }),
      call('cua', { method: 'setValue', params: { appHandle: 'app-fixture', snapshotId: 'snapshot-fixture', elementIndex: 3, value: 'Synthetic Code' } }),
      call('cua', { method: 'click', params: { appHandle: 'app-fixture', snapshotId: 'snapshot-fixture', elementIndex: 4 } }),
      call('cua', { method: 'getState', params: { appHandle: 'app-fixture', windowId: 7, includeMenus: false } }),
      call('finish_computer_use', { status: 'completed', summary: 'Synthetic form observed' })],
  ] })
  const batch = await f.execute()
  assert.equal(batch.results[0].result.value.status, 'completed')
  assert.equal(batch.results[0].result.value.modelSteps, 3)
  assert.deepEqual(f.dispatched.map(row => row.args.method), ['getApp', 'getState', 'setValue', 'setValue', 'click', 'getState'])
})

test('strict capability without matching native snapshot attestation is blocked', async () => {
  for (const value of [
    { appHandle: 'app-fixture', windowId: 7, snapshotId: 's' },
    { windowScope: 'strict-window', appHandle: 'foreign', windowId: 7, snapshotId: 's' },
    { windowScope: 'strict-window', appHandle: 'app-fixture', windowId: 8, snapshotId: 's' },
  ]) {
    const f = await fixture({ strict: true, script: [
      call('cua', { method: 'getApp', params: { selector: target.application } }),
      call('cua', { method: 'getState', params: { appHandle: 'app-fixture', windowId: 7, includeMenus: false } }),
      call('cua', { method: 'setValue', params: { appHandle: 'app-fixture', snapshotId: 's', elementIndex: 2, value: 'must not run' } }),
    ], cua: async args => args.method === 'getApp' ? { appHandle: 'app-fixture' } : value })
    const batch = await f.execute()
    assert.equal(batch.results[0].result.value.reason, 'host_window_scope_unverified')
    assert.equal(f.dispatched.length, 2)
  }
})

test('strict AX rejects menu requests and unobserved snapshot identities', () => {
  const scope = { strict: true, snapshotId: 'admitted' }
  assert.equal(operationDenial({ method: 'getState', params: { appHandle: 'a', windowId: 7, includeMenus: true } }, target, 'a', scope), 'CUA_MENU_INPUT_DENIED')
  assert.equal(operationDenial({ method: 'setValue', params: { appHandle: 'a', snapshotId: 'stolen', elementIndex: 1, value: 'x' } }, target, 'a', scope), 'CUA_SNAPSHOT_DENIED')
})

test('unloading the strict CUA provider invalidates the active worker capability', async () => {
  let f
  f = await fixture({ strict: true, cua: async args => {
    if (args.method === 'getApp') { await f.scopeFiber.dispose(); return { appHandle: 'app-fixture' } }
    throw new Error('must not reach transport')
  } })
  const batch = await f.execute()
  assert.equal(batch.results[0].result.value.reason, 'cua_provider_changed')
  assert.equal(f.dispatched.length, 1)
})

test('a later strict observation supersedes the earlier snapshot before form input', async () => {
  let observations = 0
  const f = await fixture({ strict: true, script: [
    call('cua', { method: 'getApp', params: { selector: target.application } }),
    call('cua', { method: 'getState', params: { appHandle: 'app-fixture', windowId: 7 } }),
    call('cua', { method: 'getState', params: { appHandle: 'app-fixture', windowId: 7 } }),
    call('cua', { method: 'setValue', params: { appHandle: 'app-fixture', snapshotId: 'snapshot-1', elementIndex: 2, value: 'stale' } }),
  ], cua: async args => args.method === 'getApp' ? { appHandle: 'app-fixture' }
    : { appHandle: 'app-fixture', windowId: 7, windowScope: 'strict-window', snapshotId: `snapshot-${++observations}` } })
  const batch = await f.execute()
  assert.equal(batch.results[0].result.value.status, 'blocked')
  assert.equal(f.dispatched.length, 3)
})

test('a late Host router cannot dispatch the Terra worker to Reserve', async t => {
  const f = await fixture()
  if (f.ctx.agents.requestRoutingVersion !== 1) { t.skip('requires the distinct local async-route Host'); return }
  f.ctx.on('agent/route-request', async (_event, next) => ({ ...await next(), model: 'gpt-reserve' }))
  const batch = await f.execute()
  assert.equal(batch.results[0].result.value.reason, 'worker_route_changed')
  assert.equal(f.seen.length, 0)
  assert.equal(f.dispatched.length, 0)
  assert.deepEqual(f.parent.agent.model.current(), { provider: 'deepseek', model: 'flash' })
})

test('a window-tagged snapshot cannot authorize application-menu or other AX elements', async () => {
  for (const params of [
    { appHandle: 'app-fixture', snapshotId: 'snapshot-fixture', elementIndex: 0 },
    { appHandle: 'app-fixture', snapshotId: 'snapshot-fixture', elementIndex: 9, windowId: 7 },
    { appHandle: 'app-fixture', snapshotId: 'snapshot-fixture', elementIndex: 2, mouseButton: 'right' },
  ]) {
    const f = await fixture({ script: [call('cua', { method: 'getApp', params: { selector: target.application } }), call('cua', { method: 'click', params })] })
    const batch = await f.execute()
    assert.equal(batch.results[0].result.value.status, 'blocked')
    assert.equal(batch.results[0].result.value.reason, 'host_window_scope_unverified')
    assert.equal(f.dispatched.length, 1)
  }
  assert.equal(operationDenial({ method: 'getState', params: { appHandle: 'a', windowId: 7, includeMenus: false } }, target, 'a'), 'CUA_AX_WINDOW_OWNERSHIP_UNVERIFIED')
  assert.equal(operationDenial({ method: 'performSecondaryAction', params: { appHandle: 'a', elementIndex: 1, action: 'AXPress' } }, target, 'a'), 'CUA_AX_WINDOW_OWNERSHIP_UNVERIFIED')
})

test('delegated application approval absence is blocked with no fallback', async () => {
  const f = await fixture({ cua: async () => { throw new Error('APP_APPROVAL_UNAVAILABLE: delegated caller cannot ask') } })
  const batch = await f.execute()
  assert.equal(batch.results[0].result.value.status, 'blocked')
  assert.equal(batch.results[0].result.value.reason, 'application_authorization_required')
  assert.equal(f.dispatched.length, 1)
})

test('official published CUA returns blocked when no delegated consent answerer exists', async () => {
  const f = await fixture({ officialCua: true })
  const batch = await f.execute()
  assert.equal(batch.results[0].result.value.status, 'blocked')
  assert.equal(batch.results[0].result.value.reason, 'host_task_approval_unavailable')
})

test('absence of the task approval capability blocks before any child model or desktop call', async () => {
  const f = await fixture({ taskApproval: false })
  const value = (await f.execute()).results[0].result.value
  assert.equal(value.reason, 'host_task_approval_unavailable')
  assert.equal(f.seen.length, 0)
  assert.equal(f.dispatched.length, 0)
})

const taskScript = () => [
  call('cua', { method: 'getApp', params: { selector: target.application } }),
  call('cua', { method: 'getState', params: { appHandle: 'app-fixture', windowId: 7, includeMenus: false } }),
  call('cua', { method: 'setValue', params: { appHandle: 'app-fixture', snapshotId: 'strict-fixture', elementIndex: 2, value: 'Synthetic value' } }),
  call('cua', { method: 'getState', params: { appHandle: 'app-fixture', windowId: 7, includeMenus: false } }),
  call('finish_computer_use', { status: 'completed', summary: 'Synthetic state observed' }),
]
const allowTask = () => ({ answers: [{ id: 'cua-task-access', selected: ['Allow this task'] }] })

async function directTaskFixture(t, options = {}) {
  const f = await fixture({ officialCua: true, strict: true, humanAnswer: allowTask, ...options })
  const capability = f.ctx.get('cuaTaskApproval')
  if (!capability) { t.skip('requires local.2 task capability'); return }
  const child = await f.ctx.agents.create({ sessionId: SessionId(crypto.randomUUID()), parentAgent: f.parent.agent,
    meta: { origin: 'subagent', parentSession: f.parent.agent.id, agentPreset: PRESET },
    agentOptions: ROUTE, async setup(childCtx) { await f.ctx.agentPresets.mount(childCtx, PRESET) },
  })
  const controller = new AbortController()
  const input = { parent: f.parent.agent, child: child.agent, application: target.application, windowId: 7, goal: 'Direct synthetic task', expiresAt: Date.now() + 1500, signal: controller.signal }
  const grant = capability.begin(input)
  owned.push(async () => { await grant.dispose(); await child.dispose() })
  const invoke = async args => (await f.ctx.tools.execute({ agent: child.agent, calls: [call('cua', args)], signal: controller.signal })).results[0].result
  return { ...f, capability, child, controller, input, grant, invoke }
}

// Two Host policies receive separate adapters over one synthetic profile domain.
// Each read returns a fresh snapshot; a cached permission object cannot pass.
function sharedPermissionDomain() {
  let state = { migrated: true, applications: {} }, stateTail = Promise.resolve(), writes = 0
  const appTails = new Map()
  const queue = (previous, signal, operation) => previous.catch(() => {}).then(() => { signal.throwIfAborted(); return operation() })
  return {
    get writes() { return writes },
    open() { return {
      persistent: false,
      withState(signal, operation) {
        const result = queue(stateTail, signal, () => operation({ state: structuredClone(state), async save(next) { writes++; state = structuredClone(next) } }))
        stateTail = result.catch(() => {})
        return result
      },
      withApplication(id, signal, operation) {
        const result = queue(appTails.get(id) ?? Promise.resolve(), signal, operation)
        appTails.set(id, result.catch(() => {}))
        return result
      },
      async drain() { await Promise.all([stateTail, ...appTails.values()]) },
    } },
  }
}

test('another Host sharing the profile can revoke an approved task before later native dispatch', async t => {
  const first = await directTaskFixture(t)
  if (!first) return
  const second = await fixture({ officialCua: true, strict: true })
  const domain = sharedPermissionDomain()
  first.ctx.get('cuaAccess').policy.options.store = domain.open()
  second.ctx.get('cuaAccess').policy.options.store = domain.open()
  assert.equal((await first.invoke({ method: 'getApp', params: { selector: target.application } })).isError, false)
  assert.equal(domain.writes, 0, 'task consent must not save an application grant')
  const before = first.nativeRequests.length
  await second.ctx.get('cuaAccess').revoke('a'.repeat(64))
  assert.equal(domain.writes, 1, 'only the explicit legacy revoke writes shared state')
  assert.equal((await first.invoke({ method: 'getState', params: { appHandle: 'app-fixture', windowId: 7 } })).isError, true)
  assert.equal(first.nativeRequests.length, before)
  assert.equal(first.grant.signal.aborted, true)
})

test('another Host revoking during the human question invalidates its late approval', async t => {
  let asked, answer
  const pending = new Promise(resolve => { asked = resolve })
  const first = await directTaskFixture(t, { humanAnswer: () => { asked(); return new Promise(resolve => { answer = resolve }) } })
  if (!first) return
  const second = await fixture({ officialCua: true, strict: true })
  const domain = sharedPermissionDomain()
  first.ctx.get('cuaAccess').policy.options.store = domain.open()
  second.ctx.get('cuaAccess').policy.options.store = domain.open()
  const run = first.invoke({ method: 'getApp', params: { selector: target.application } })
  await pending
  await second.ctx.get('cuaAccess').revoke('a'.repeat(64))
  answer(allowTask())
  assert.equal((await run).isError, true)
  assert.deepEqual(first.nativeRequests.map(x => x.method), ['getApp'])
  assert.equal(first.grant.signal.aborted, true)
})

test('task registration rejects forged root, foreign child, extra fields and invalid lifetimes', async t => {
  const f = await directTaskFixture(t)
  if (!f) return
  const foreign = await f.ctx.agents.create({ sessionId: SessionId(crypto.randomUUID()), agentOptions: ROUTE })
  owned.push(() => foreign.dispose())
  for (const input of [
    { ...f.input, parent: { ...f.parent.agent } }, { ...f.input, child: foreign.agent },
    { ...f.input, expiresAt: Date.now() - 1 }, { ...f.input, expiresAt: Date.now() + 1800000 },
    { ...f.input, approved: true },
  ]) assert.throws(() => f.capability.begin(input), /task|Task|root/)
  assert.equal(f.nativeRequests.length, 0)
  assert.equal(f.questions.length, 0)
})

test('Host task scope rejects foreign windows, handles, snapshots and app-wide methods before dispatch', async t => {
  const f = await directTaskFixture(t)
  if (!f) return
  assert.equal((await f.invoke({ method: 'getApp', params: { selector: target.application } })).isError, false)
  assert.equal((await f.invoke({ method: 'getState', params: { appHandle: 'app-fixture', windowId: 7 } })).isError, false)
  const before = f.nativeRequests.length
  for (const args of [
    { method: 'getState', params: { appHandle: 'app-fixture', windowId: 8 } },
    { method: 'getState', params: { appHandle: 'app-fixture', windowId: 7, includeMenus: true } },
    { method: 'getState', params: { appHandle: 'foreign', windowId: 7 } },
    { method: 'setValue', params: { appHandle: 'app-fixture', snapshotId: 'foreign', elementIndex: 2, value: 'forbidden' } },
    { method: 'click', params: { appHandle: 'app-fixture', snapshotId: 'strict-fixture', elementIndex: 2, mouseButton: 'right' } },
    { method: 'typeText', params: { appHandle: 'app-fixture', text: 'forbidden' } },
  ]) assert.equal((await f.invoke(args)).isError, true)
  assert.equal(f.nativeRequests.length, before)
  assert.equal(f.questions.length, 1)
})

test('task closure leaves a tombstone so a live child cannot fall back to saved app consent', async t => {
  const f = await directTaskFixture(t)
  if (!f) return
  await f.invoke({ method: 'getApp', params: { selector: target.application } })
  await f.grant.dispose()
  assert.equal(f.grant.signal.aborted, true)
  const before = f.nativeRequests.length
  const result = await f.invoke({ method: 'getApp', params: { selector: target.application } })
  assert.equal(result.isError, true)
  assert.equal(f.nativeRequests.length, before)
  assert.throws(() => f.capability.begin(f.input), /already/)
})

test('revocation cancels in-flight native work and rejects later dispatch', async t => {
  let entered
  const pending = new Promise(resolve => { entered = resolve })
  const f = await directTaskFixture(t, { nativeResponse: request => {
    if (request.method === 'getApp') return { appHandle: 'app-fixture', pid: 1234, name: target.application, authorization: { id: 'a'.repeat(64), name: target.application, persistable: false } }
    if (request.method === 'getState') { entered(); return new Promise(() => {}) }
    return { acted: true }
  } })
  if (!f) return
  await f.invoke({ method: 'getApp', params: { selector: target.application } })
  const inFlight = f.invoke({ method: 'getState', params: { appHandle: 'app-fixture', windowId: 7 } })
  await pending
  await f.grant.revoke()
  assert.equal((await inFlight).isError, true)
  const before = f.nativeRequests.length
  assert.equal((await f.invoke({ method: 'getState', params: { appHandle: 'app-fixture', windowId: 7 } })).isError, true)
  assert.equal(f.nativeRequests.length, before)
})

test('revocation also drains the first native identity lookup before any question', async t => {
  let entered
  const pending = new Promise(resolve => { entered = resolve })
  const f = await directTaskFixture(t, { nativeResponse: request => {
    if (request.method === 'getApp') { entered(); return new Promise(() => {}) }
    return { acted: true }
  } })
  if (!f) return
  const run = f.invoke({ method: 'getApp', params: { selector: target.application } })
  await pending
  await f.grant.revoke()
  assert.equal((await run).isError, true)
  assert.equal(f.questions.length, 0)
  assert.equal(f.ctx.get('cuaAccess').policy.tasks.size, 0)
})

test('expiry while the root question is pending admits no observation or input', async t => {
  const f = await directTaskFixture(t, { humanAnswer: request => new Promise((resolve, reject) => {
    request.signal.addEventListener('abort', () => reject(new Error('synthetic pending answer cancelled')), { once: true })
  }) })
  if (!f) return
  const result = await f.invoke({ method: 'getApp', params: { selector: target.application } })
  assert.equal(result.isError, true)
  assert.equal(f.grant.signal.aborted, true)
  assert.deepEqual(f.nativeRequests.map(x => x.method), ['getApp'])
})

test('existing application revoke also revokes the task and requires fresh user input', async t => {
  const f = await directTaskFixture(t)
  if (!f) return
  await f.invoke({ method: 'getApp', params: { selector: target.application } })
  await f.ctx.get('cuaAccess').revoke('a'.repeat(64))
  assert.equal(f.grant.signal.aborted, true)
  assert.throws(() => f.capability.begin(f.input), /new user input/)
  const count = f.nativeRequests.length
  assert.equal((await f.invoke({ method: 'getState', params: { appHandle: 'app-fixture', windowId: 7 } })).isError, true)
  assert.equal(f.nativeRequests.length, count)
})

test('root Stop while the task question is pending cancels and drains without input', async t => {
  let asked
  const pending = new Promise(resolve => { asked = resolve })
  const f = await fixture({ officialCua: true, strict: true, script: taskScript(), humanAnswer: request => {
    asked()
    return new Promise((resolve, reject) => request.signal.addEventListener('abort', () => reject(new Error('synthetic human wait cancelled')), { once: true }))
  } })
  if (!f.ctx.get('cuaTaskApproval')) { t.skip('requires local.2 task capability'); return }
  const run = f.execute()
  await pending
  f.controller.abort()
  const result = (await run).results[0].result
  if (result.value) {
    assert.equal(result.value.status, 'cancelled')
    assert.equal(result.value.cleanup, 'drained')
  } else {
    assert.equal(result.isError, true)
    assert.match(JSON.stringify(result.error), /ABORTED|AbortError/u)
  }
  const tasks = [...f.ctx.get('cuaAccess').policy.tasks.values()]
  for (const task of tasks) assert.equal(task.closed, true)
  await Promise.all(tasks.map(task => task.closing))
  assert.equal(f.ctx.get('cuaAccess').policy.tasks.size, 0)
  assert.deepEqual(f.nativeRequests.map(x => x.method), ['getApp'])
})

test('a late human answer after revocation cannot reopen a task', async t => {
  let asked, answer
  const pending = new Promise(resolve => { asked = resolve })
  const f = await directTaskFixture(t, { humanAnswer: () => { asked(); return new Promise(resolve => { answer = resolve }) } })
  if (!f) return
  const run = f.invoke({ method: 'getApp', params: { selector: target.application } })
  await pending
  const revoke = f.grant.revoke()
  answer(allowTask())
  assert.equal((await run).isError, true)
  await revoke
  assert.deepEqual(f.nativeRequests.map(x => x.method), ['getApp'])
})

test('application revoke during a pending task question invalidates the late answer', async t => {
  let asked, answer
  const pending = new Promise(resolve => { asked = resolve })
  const f = await directTaskFixture(t, { humanAnswer: () => { asked(); return new Promise(resolve => { answer = resolve }) } })
  if (!f) return
  const run = f.invoke({ method: 'getApp', params: { selector: target.application } })
  await pending
  const revoke = f.ctx.get('cuaAccess').revoke('a'.repeat(64))
  await new Promise(resolve => setImmediate(resolve))
  const revokedBeforeAnswer = f.grant.signal.aborted
  answer(allowTask())
  await run
  await revoke
  assert.equal(revokedBeforeAnswer, true)
  assert.throws(() => f.capability.begin(f.input), /new user input/)
  assert.deepEqual(f.nativeRequests.map(x => x.method), ['getApp'])
})

test('a denied root task cannot automatically create another worker for the same user input', async t => {
  const f = await fixture({ officialCua: true, strict: true, script: taskScript(), humanAnswer: () => ({ answers: [{ id: 'cua-task-access', selected: ['Deny'] }] }) })
  if (!f.ctx.get('cuaTaskApproval')) { t.skip('requires local.2 task capability'); return }
  await f.execute()
  const count = f.seen.length
  const result = (await f.execute()).results[0].result.value
  assert.equal(result.reason, 'task_retry_requires_new_user_input')
  assert.equal(f.seen.length, count)
  assert.equal(f.questions.length, 1)
})

test('a dismissed or failed human question requires new user input before another worker', async t => {
  const f = await fixture({ officialCua: true, strict: true, script: taskScript(), humanAnswer: () => { throw new Error('synthetic human dialog dismissed') } })
  if (!f.ctx.get('cuaTaskApproval')) { t.skip('requires local.2 task capability'); return }
  await f.execute()
  const count = f.seen.length
  const result = (await f.execute()).results[0].result.value
  assert.equal(result.reason, 'task_retry_requires_new_user_input')
  assert.equal(f.seen.length, count)
  assert.equal(f.questions.length, 1)
  assert.deepEqual(f.nativeRequests.map(x => x.method), ['getApp'])
})

test('official task approval asks the true root for one child/window with no permanent option', async t => {
  let f
  f = await fixture({ officialCua: true, strict: true, script: taskScript(), humanAnswer: request => {
    assert.equal(request.agent, f.parent.agent)
    assert.equal(f.nativeRequests.length, 1, 'only application identity lookup may precede approval')
    const q = request.questions[0]
    assert.equal(q.id, 'cua-task-access')
    assert.deepEqual(q.options.map(x => x.label), ['Allow this task', 'Deny'])
    assert.equal(q.intent.always, undefined)
    for (const text of ['Process: 1234', 'Window: 7', 'Complete the synthetic UI task', 'Expires:', 'Stop']) assert.ok(q.detail.includes(text))
    return allowTask()
  } })
  if (!f.ctx.get('cuaTaskApproval')) { t.skip('requires local.2 task capability'); return }
  const store = f.ctx.get('cuaAccess').policy.options.store
  const withState = store.withState.bind(store)
  store.withState = (signal, read) => withState(signal, ({ state }) => read({ state, save() { throw new Error('task consent must not write application grants') } }))
  const result = (await f.execute()).results[0].result.value
  assert.equal(result.status, 'completed', JSON.stringify(result))
  assert.equal(result.cleanup, 'drained')
  assert.equal(f.questions.length, 1)
  assert.deepEqual(f.nativeRequests.map(x => x.method), ['getApp', 'getState', 'setValue', 'getState'])
  assert.deepEqual(f.parent.agent.model.current(), { provider: 'deepseek', model: 'flash' })
  assert.deepEqual(store.memory.applications, {})
})

test('denied and malformed task answers never dispatch observation or input', async t => {
  for (const answer of [
    undefined, null, { answers: 'malformed' },
    { answers: [{ id: 'cua-task-access', selected: ['Allow this task'], custom: 7 }] },
    { answers: [{ id: 'cua-task-access', selected: ['Deny'] }] },
    { answers: [{ id: 'cua-task-access', selected: ['Always allow'] }] },
    { answers: [{ id: 'cua-task-access', selected: ['Allow this task'], custom: 'override' }] },
    { answers: [{ id: 'other', selected: ['Allow this task'] }] },
  ]) {
    const f = await fixture({ officialCua: true, strict: true, script: taskScript(), humanAnswer: () => answer })
    if (!f.ctx.get('cuaTaskApproval')) { t.skip('requires local.2 task capability'); return }
    const value = (await f.execute()).results[0].result.value
    assert.equal(value.status, 'blocked')
    assert.equal(value.cleanup, 'drained')
    assert.deepEqual(f.nativeRequests.map(x => x.method), ['getApp'])
    assert.equal(f.questions.length, 1)
    const before = f.seen.length
    assert.equal((await f.execute()).results[0].result.value.reason, 'task_retry_requires_new_user_input')
    assert.equal(f.seen.length, before)
  }
})

test('a Host-reported in-flight revocation stops later actions', { timeout: 3000 }, async () => {
  let entered, revoke
  const waiting = new Promise(resolve => { entered = resolve })
  const f = await fixture({ cua: async args => {
    if (args.method === 'getApp') return { appHandle: 'app-fixture' }
    entered()
    return new Promise((_resolve, reject) => { revoke = () => reject(new Error('APP_ACCESS_REVOKED: synthetic Host revocation')) })
  } })
  const running = f.execute()
  await waiting
  revoke()
  const batch = await running
  assert.equal(batch.results[0].result.value.status, 'blocked')
  assert.equal(batch.results[0].result.value.reason, 'application_access_revoked')
  assert.equal(f.dispatched.length, 2)
})

test('caller cancellation drains in-flight transport before releasing the desktop lease', { timeout: 3000 }, async () => {
  let started, drained = false
  const entered = new Promise(resolve => { started = resolve })
  const f = await fixture({ cua: async (_args, exec) => {
    started()
    await new Promise(resolve => exec.signal.addEventListener('abort', resolve, { once: true }))
    await new Promise(resolve => setTimeout(resolve, 15))
    drained = true
    throw new Error('cancelled')
  } })
  const running = f.execute()
  await entered
  await assert.rejects(acquireDesktopLease(f.directory), { code: 'EEXIST' })
  f.controller.abort()
  await running
  assert.equal(drained, true)
  const next = await acquireDesktopLease(f.directory); next.release(true)
})

test('lease loss aborts an in-flight native operation and returns blocked', { timeout: 3000 }, async () => {
  let started, drained = false
  const entered = new Promise(resolve => { started = resolve })
  const f = await fixture({ cua: async (_args, exec) => {
    started()
    await new Promise(resolve => exec.signal.addEventListener('abort', resolve, { once: true }))
    drained = true
    throw new Error('cancelled')
  } })
  const running = f.execute()
  await entered
  await unlink(join(f.directory, 'desktop.lock'))
  const batch = await running
  assert.equal(drained, true)
  assert.equal(batch.results[0].result.value.reason, 'desktop_lease_lost')
})

const missingTargetReason = f => f.ctx.get('cuaTaskApproval')?.version === 2 ? 'target_preparation_blocked' : 'operator_target_required'
const operatorFace = f => f.ctx.extend({invocation:{peer:{principal:{kind:'owner'}}}}).get('cuaAccess')

// First-use operator route. Native metadata/results remain synthetic; this is not GUI acceptance.
const selectedTaskScript = () => taskScript().map((block, index) => index === 0
  ? call('cua', {method:'getApp',params:{selector:'1234'}}) : block)
function targetNative(request) {
  if (request.method === 'getApp') return {appHandle:'app-fixture',pid:1234,name:target.application,authorization:{id:'a'.repeat(64),name:target.application,persistable:false}}
  if (request.method === 'prepareTaskWindows') return [{windowId:7,pid:1234,appName:target.application,title:'Synthetic fixture',bounds:{x:0,y:0,width:100,height:100},isOnScreen:true,onCurrentSpace:true,targetKey:'native-opaque-candidate'}]
  if (request.method === 'getState') return {appHandle:'app-fixture',pid:1234,windowId:7,snapshotId:'strict-fixture',windowScope:'strict-window',tree:'Synthetic button',windows:[{windowId:7,pid:1234,appName:target.application,title:'Synthetic fixture',bounds:{x:0,y:0,width:100,height:100},isOnScreen:true,onCurrentSpace:true}],truncated:false}
  return {validated:true}
}
async function selectOperatorTarget(f) {
  const found = await operatorFace(f).discoverTaskTargets(f.parent.agent.id, target.application)
  assert.equal(found.targets.length,1)
  assert.equal('appHandle' in found.targets[0],false)
  assert.equal('targetKey' in found.targets[0],false)
  await operatorFace(f).selectTaskTarget(f.parent.agent.id,found.targets[0].id)
  return found
}

test('first use without grant/window ID selects metadata then requires the true root task answer', async t => {
  let f
  f = await fixture({officialCua:true,strict:true,config:{application:'',windowId:0},nativeResponse:targetNative,script:selectedTaskScript(),humanAnswer:request=>{
    assert.equal(request.agent,f.parent.agent)
    assert.equal(f.nativeRequests.some(r=>['getState','screenshot','click','setValue'].includes(r.method)),false)
    assert.match(request.questions[0].detail,/Window: 7/)
    return allowTask()
  }})
  if (!f.ctx.get('cuaTaskTargets')) {t.skip('requires local.3 operator target capability');return}
  assert.equal((await f.execute()).results[0].result.value.reason,missingTargetReason(f))
  assert.equal(f.seen.length,0)
  await selectOperatorTarget(f)
  assert.deepEqual(f.nativeRequests.map(r=>r.method),['getApp','prepareTaskWindows','bindTaskWindow'])
  assert.deepEqual((await f.ctx.cuaAccess.applications()).allowedApps,[])
  assert.equal(f.questions.length,0)
  const value = (await f.execute()).results[0].result.value
  assert.equal(value.status,'completed',JSON.stringify(value))
  assert.equal(value.cleanup,'drained')
  assert.equal(f.questions.length,1)
  assert.equal(f.nativeRequests.filter(r=>r.method==='validateTaskWindow').length,2)
  assert.deepEqual((await f.ctx.cuaAccess.applications()).allowedApps,[])
  assert.deepEqual(f.parent.agent.model.current(),{provider:'deepseek',model:'flash'})
  assert.equal(f.ctx.cuaTaskTargets.target(f.parent.agent),undefined,'selection consumed exactly once')
  assert.equal((await f.execute()).results[0].result.value.reason,missingTargetReason(f))
})

test('operator discovery refuses missing/child roots and is absent from every model CUA schema', async t=>{
  const f=await fixture({officialCua:true,strict:true,nativeResponse:targetNative})
  if(!f.ctx.get('cuaTaskTargets')){t.skip('requires local.3');return}
  assert.throws(()=>f.ctx.cuaAccess.discoverTaskTargets(f.parent.agent.id,target.application),/CUA_TARGET_OPERATOR_REQUIRED/)
  const nonOwner=f.ctx.extend({invocation:{peer:{principal:{kind:'liveshare'}}}}).get('cuaAccess')
  assert.throws(()=>nonOwner.discoverTaskTargets(f.parent.agent.id,target.application),/CUA_TARGET_OPERATOR_REQUIRED/)
  assert.throws(()=>nonOwner.selectTaskTarget(f.parent.agent.id,'candidate'),/CUA_TARGET_OPERATOR_REQUIRED/)
  assert.throws(()=>nonOwner.clearTaskTargets(f.parent.agent.id),/CUA_TARGET_OPERATOR_REQUIRED/)
  await assert.rejects(operatorFace(f).discoverTaskTargets('not-a-root',target.application),/CUA_TARGET_OPERATOR_ROOT_REQUIRED/)
  const child=await f.ctx.agents.create({sessionId:SessionId(crypto.randomUUID()),parentAgent:f.parent.agent,meta:{origin:'subagent',parentSession:f.parent.agent.id}})
  owned.push(()=>child.dispose())
  await assert.rejects(operatorFace(f).discoverTaskTargets(child.agent.id,target.application),/CUA_TARGET_OPERATOR_ROOT_REQUIRED/)
  assert.equal(f.nativeRequests.length,0)
  const cua=f.ctx.tools.get('cua',child.agent)
  if(cua)for(const method of ['prepareTaskWindows','bindTaskWindow','validateTaskWindow']) assert.equal(JSON.stringify(cua.parameters).includes('"const":"'+method+'"'),false)
  assert.equal(f.ctx.tools.get('discoverTaskTargets',f.parent.agent),undefined)
})

test('no matching window, wrong candidate, expired selection and explicit clear cannot authorize work', async t=>{
  const f=await fixture({officialCua:true,strict:true,config:{application:'',windowId:0},nativeResponse:r=>r.method==='prepareTaskWindows'?[]:targetNative(r)})
  if(!f.ctx.get('cuaTaskTargets')){t.skip('requires local.3');return}
  const found=await operatorFace(f).discoverTaskTargets(f.parent.agent.id,target.application)
  assert.deepEqual(found.targets,[])
  await assert.rejects(operatorFace(f).selectTaskTarget(f.parent.agent.id,'forged'),/CUA_TARGET_NOT_FOUND/)
  assert.equal((await f.execute()).results[0].result.value.reason,'operator_target_required')
  assert.equal(f.seen.length,0)
  await operatorFace(f).clearTaskTargets(f.parent.agent.id)
  assert.equal(f.ctx.cuaTaskTargets.rows.size,0)
  assert.deepEqual((await f.ctx.cuaAccess.applications()).allowedApps,[])
  const g=await fixture({officialCua:true,strict:true,config:{application:'',windowId:0},nativeResponse:targetNative})
  await selectOperatorTarget(g)
  g.ctx.cuaTaskTargets.rows.get(g.parent.agent).expiresAt=Date.now()-1
  assert.equal((await g.execute()).results[0].result.value.reason,'operator_target_required')
  assert.equal(g.seen.length,0)
  await operatorFace(g).clearTaskTargets(g.parent.agent.id)
  assert.equal(g.ctx.cuaTaskTargets.rows.size,0)
})

test('stale window before or after the human answer and human denial leave no reusable target/grant', async t=>{
  for(const failureAt of ['bind','before-answer','after-answer','deny']){
    let validations=0
    const f=await fixture({officialCua:true,strict:true,config:{application:'',windowId:0},script:selectedTaskScript(),humanAnswer:()=>failureAt==='deny'?{answers:[{id:'cua-task-access',selected:['Deny']}]}:allowTask(),nativeResponse:r=>{
      if(r.method==='bindTaskWindow'&&failureAt==='bind'||r.method==='validateTaskWindow'&&++validations===(failureAt==='before-answer'?1:failureAt==='after-answer'?2:-1)) throw Error('CUA_TARGET_STALE')
      return targetNative(r)
    }})
    if(!f.ctx.get('cuaTaskTargets')){t.skip('requires local.3');return}
    if(failureAt==='bind'){
      await assert.rejects(selectOperatorTarget(f),/NATIVE/)
      assert.equal(f.ctx.cuaTaskTargets.rows.size,0)
    }else{
      await selectOperatorTarget(f)
      const result=(await f.execute()).results[0].result.value
      assert.equal(result.status,'blocked',JSON.stringify(result))
      assert.equal(result.cleanup,'drained')
    }
    assert.equal(f.nativeRequests.some(r=>['getState','setValue','screenshot','click'].includes(r.method)),false)
    assert.deepEqual((await f.ctx.cuaAccess.applications()).allowedApps,[])
    assert.equal(f.ctx.cuaTaskTargets.target(f.parent.agent),undefined)
    assert.equal((await f.execute()).results[0].result.value.reason,missingTargetReason(f))
  }
})


test('generated owner RPC contract parses exact arguments and rejects non-owner after admission', async t=>{
  const f=await fixture({officialCua:true,strict:true,nativeResponse:targetNative})
  if(!f.ctx.get('cuaTaskTargets')){t.skip('requires local.3');return}
  const require=createRequire(import.meta.url)
  const base=pathToFileURL(require.resolve('@deepseek-ai/dsh-cua/package.json'))
  const {TYPERT}=await import(new URL('lib/typert.host.js',base))
  const {TYPERT_REMOTE}=await import(new URL('lib/typert.remote-client.js',base))
  const descriptor=TYPERT.invocations.find(d=>d.method==='discoverTaskTargets')
  const args={sessionId:f.parent.agent.id,application:target.application}
  assert.deepEqual(descriptor.input({strict:true}).create().parse(args),args)
  assert.throws(()=>descriptor.input({strict:true}).create().parse({...args,principal:{kind:'owner'}}))
  assert.deepEqual(TYPERT_REMOTE.methods['cuaAccess/discoverTaskTargets'].input({strict:true}).create().parse(args),args)
  const nonOwner=f.ctx.extend({invocation:{peer:{principal:{kind:'liveshare'}}}})
  assert.throws(()=>descriptor.invoke(nonOwner,args),/CUA_TARGET_OPERATOR_REQUIRED/)
  assert.equal(f.nativeRequests.length,0)
  const owner=f.ctx.extend({invocation:{peer:{principal:{kind:'owner'}}}})
  const result=await descriptor.invoke(owner,args)
  assert.equal(result.targets.length,1)
  await operatorFace(f).clearTaskTargets(f.parent.agent.id)
})

test('cancelling selected first-use work drains its private target connection and leaves no selection',async t=>{
  let entered
  const waiting=new Promise(resolve=>{entered=resolve})
  const f=await fixture({officialCua:true,strict:true,config:{application:'',windowId:0},script:selectedTaskScript(),nativeResponse:targetNative,humanAnswer:request=>{entered();return new Promise((_resolve,reject)=>request.signal.addEventListener('abort',()=>reject(Error('cancelled')),{once:true}))}})
  if(!f.ctx.get('cuaTaskTargets')){t.skip('requires local.3');return}
  await selectOperatorTarget(f)
  const running=f.execute();await waiting;f.controller.abort();await running
  assert.equal(f.ctx.cuaTaskTargets.target(f.parent.agent),undefined)
  assert.deepEqual((await f.ctx.cuaAccess.applications()).allowedApps,[])
  assert.equal(f.nativeRequests.some(r=>['getState','screenshot','click','setValue'].includes(r.method)),false)
  const lease=await acquireDesktopLease(f.directory);lease.release(true)
})


for(const ok of [false,true])test(`operator UI clear confirms success before unlocking selection (RPC ok=${ok})`,async t=>{
  const f=await fixture({officialCua:true,strict:true})
  if(!f.ctx.get('cuaTaskTargets')){t.skip('requires local.3');return}
  const require=createRequire(import.meta.url)
  const base=pathToFileURL(require.resolve('@deepseek-ai/dsh-cua/package.json'))
  const source=await readFile(new URL('lib/client.js',base),'utf8')
  const start=source.indexOf('function TaskTargetPanel('),end=source.indexOf('function PermissionPanel(',start)
  assert.ok(start>=0&&end>start)
  const state=['root','Synthetic Browser',[],'Selected window 7',false,true,[]]
  let index=0
  const react={useState:()=>{const key=index++;return[state[key],value=>{state[key]=value}]}}
  const jsx=(type,props)=>({type,...props})
  // Render only the trusted packaged component with inert JSX/state and a synthetic RPC.
  const component=new Function('react','react_jsx_runtime',source.slice(start,end)+';return TaskTargetPanel;')(react,{jsx,jsxs:jsx})
  const view=component({remote:{clearTaskTargets:async()=>ok?{ok:true,value:undefined}:{ok:false,error:Error('reply lost')}}})
  const clear=view.children.find(child=>child?.type==='button'&&child.children==='Clear selection')
  await clear.onClick()
  assert.equal(state[5],!ok)
  if(ok)assert.match(state[3],/^Selection cleared/)
  else {assert.match(state[3],/failed or is uncertain/);assert.doesNotMatch(state[3],/^Selection cleared/)}
})


test('metadata continuations are declared native-only and rejected as model CUA requests',async t=>{
 const f=await fixture({officialCua:true,strict:true})
 if(!f.ctx.get('cuaTaskTargets')){t.skip('requires local.3');return}
 const require=createRequire(import.meta.url)
 const {Request,NativeOnlyOperations}=await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-cua/protocol')))
 for(const [method,params]of [['prepareTaskWindows',{appHandle:'private'}],['bindTaskWindow',{appHandle:'private',windowId:7,targetKey:'opaque'}],['validateTaskWindow',{appHandle:'private',windowId:7}]]){
  assert.equal(Request.safeParse({method,params}).success,false)
  assert.equal(NativeOnlyOperations.some(operation=>operation.safeParse({method,params}).success),true)
 }
 assert.equal(f.nativeRequests.length,0)
})

test('uncertain native target cleanup stays rejected across repeated clear and blocks discovery',async t=>{
 const f=await fixture({officialCua:true,strict:true,nativeResponse:targetNative})
 if(!f.ctx.get('cuaTaskTargets')){t.skip('requires local.3');return}
 await selectOperatorTarget(f)
 const row=f.ctx.cuaTaskTargets.rows.get(f.parent.agent),dispose=row.client.dispose.bind(row.client)
 let calls=0
 row.client.dispose=async()=>{calls++;throw Error('close uncertain')}
 try{
  await assert.rejects(operatorFace(f).clearTaskTargets(f.parent.agent.id),/close uncertain/)
  assert.equal(row.closed,true)
  assert.equal(f.ctx.cuaTaskTargets.rows.get(f.parent.agent),row)
  const first=row.closing
  await assert.rejects(operatorFace(f).clearTaskTargets(f.parent.agent.id),/close uncertain/)
  assert.equal(row.closing,first)
  const before=f.nativeRequests.length
  await assert.rejects(operatorFace(f).discoverTaskTargets(f.parent.agent.id,target.application),/close uncertain/)
  assert.equal(f.nativeRequests.length,before)
  assert.equal(calls,1,'no duplicate cleanup or new native connection')
  const other=await f.ctx.agents.create({sessionId:SessionId(crypto.randomUUID()),agentOptions:{provider:'deepseek',model:'flash'}})
  owned.push(()=>other.dispose())
  await assert.rejects(operatorFace(f).discoverTaskTargets(other.agent.id,target.application),/CUA_TARGET_CLEANUP_UNCERTAIN/)
  assert.equal(f.nativeRequests.length,before)
  // Connect the real backend failure to the packaged UI, including a second clear.
  const require=createRequire(import.meta.url),base=pathToFileURL(require.resolve('@deepseek-ai/dsh-cua/package.json'))
  const source=await readFile(new URL('lib/client.js',base),'utf8')
  const start=source.indexOf('function TaskTargetPanel('),end=source.indexOf('function PermissionPanel(',start)
  const state=[f.parent.agent.id,target.application,[],'Selected window7',false,true,[]];let index=0
  const react={useState:()=>{const key=index++;return[state[key],value=>{state[key]=value}]}}
  const jsx=(type,props)=>({type,...props})
  const panel=new Function('react','react_jsx_runtime',source.slice(start,end)+';return TaskTargetPanel;')(react,{jsx,jsxs:jsx})
  const view=panel({remote:{clearTaskTargets:async()=>{try{await operatorFace(f).clearTaskTargets(f.parent.agent.id);return{ok:true,value:undefined}}catch(error){return{ok:false,error}}}}})
  const clear=view.children.find(child=>child?.type==='button'&&child.children==='Clear selection')
  for(let attempt=0;attempt<2;attempt++){await clear.onClick();assert.equal(state[5],true);assert.match(state[3],/failed or is uncertain/);assert.equal(calls,1)}

  assert.throws(()=>f.ctx.cuaTaskTargets.target(f.parent.agent),/CUA_TARGET_CLOSED/)
  assert.deepEqual((await f.ctx.cuaAccess.applications()).allowedApps,[])
 }finally{row.client.dispose=dispose;await dispose()}
})

test('actual strict Gateway admits owner selection and rejects a policy-allowed non-owner',async t=>{
 const f=await fixture({officialCua:true,strict:true,nativeResponse:targetNative,config:{application:'',windowId:0},script:selectedTaskScript(),humanAnswer:allowTask})
 if(!f.ctx.get('cuaTaskTargets')){t.skip('requires local.3');return}
 const require=createRequire(import.meta.url)
 const {default:Registry}=await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-typert-registry')))
 const {default:Gateway}=await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-api-gateway')))
 const {TYPERT}=await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-cua/typert')))
 await f.ctx.plugin(Registry)
 f.ctx.typert.register(TYPERT)
 let policyCalls=0
 f.ctx.provide('remoteAccess',{decide(){policyCalls++;return{kind:'allow'}}})
 await f.ctx.plugin(Gateway,Gateway.Config({}))
 const peer=kind=>({id:kind,principal:{kind},signal:new AbortController().signal})
 const args={sessionId:f.parent.agent.id,application:target.application}
 const denied=await f.ctx.typertGateway.invokeRpc('cuaAccess/discoverTaskTargets',{args},undefined,peer('liveshare'))
 assert.equal(policyCalls,1,'gateway policy intentionally permits this endpoint')
 assert.equal(denied.ok,false)
 assert.match(JSON.stringify(denied),/CUA_TARGET_OPERATOR_REQUIRED/)
 assert.equal(f.nativeRequests.length,0)
 const found=await f.ctx.typertGateway.invokeRpc('cuaAccess/discoverTaskTargets',{args},undefined,peer('owner'))
 assert.equal(found.ok,true,JSON.stringify(found))
 const chosen=await f.ctx.typertGateway.invokeRpc('cuaAccess/selectTaskTarget',{args:{sessionId:f.parent.agent.id,candidateId:found.value.targets[0].id}},undefined,peer('owner'))
 assert.equal(chosen.ok,true,JSON.stringify(chosen))
 assert.equal(f.questions.length,0)
 const outcome=(await f.execute()).results[0].result.value
 assert.equal(outcome.status,'completed',JSON.stringify(outcome))
 assert.equal(f.questions.length,1)
 assert.deepEqual((await f.ctx.cuaAccess.applications()).allowedApps,[])
})

// Real Gateway/registry + official provider, scripted native identities only.
const instanceBundle = 'org.example.SyntheticBrowser'
function instanceNative({ pids = [1234, 5678], extra = true } = {}) {
  const generations = new Map(pids.map(pid => [pid, 1])), handles = new Map()
  return { generations, async respond(request) {
    if(request.method === 'listApps') return [...pids.map(pid=>({pid,name:'Synthetic Browser',bundleId:instanceBundle})),...(extra?[{pid:9999,name:'UNRELATED_CATALOG_SENTINEL',bundleId:'org.example.Other'}]:[])]
    if(request.method === 'getApp') {
      const pid = Number(request.params.selector), generation = generations.get(pid)
      if(!generation) throw Error('APP_UNAVAILABLE')
      const appHandle = `app-${pid}-${generation}`
      handles.set(appHandle,{pid,generation})
      return {appHandle,pid,name:'Synthetic Browser',bundleId:instanceBundle,authorization:{id:'a'.repeat(64),name:'Synthetic Browser',persistable:false}}
    }
    if(request.method === 'prepareTaskWindows') {
      const identity=handles.get(request.params.appHandle)
      if(!identity || generations.get(identity.pid)!==identity.generation) throw Error('STALE_APP process restarted')
      const windowId=identity.pid===1234?7:9
      return [{windowId,pid:identity.pid,appName:'Synthetic Browser',title:`Synthetic fixture ${identity.pid}`,bounds:{x:0,y:0,width:100,height:100},isOnScreen:true,targetKey:`native-${identity.pid}-${identity.generation}`}]
    }
    if(request.method === 'getState') return {...targetNative(request),appHandle:request.params.appHandle}
    return {validated:true}
  }}
}
async function instanceGateway(options={}) {
  const native=options.native??instanceNative(options)
  const f=await fixture({officialCua:true,strict:true,nativeResponse:native.respond,config:{application:'',windowId:0},script:selectedTaskScript().map(block=>{
    const args=JSON.parse(block.arguments)
    if(args.params?.appHandle)args.params.appHandle='app-1234-1'
    return {...block,arguments:JSON.stringify(args)}
  }),humanAnswer:options.humanAnswer??allowTask})
  if(typeof f.ctx.get('cuaTaskTargets')?.discoverApplications!=='function')return {f,native,unavailable:true}
  const require=createRequire(import.meta.url)
  const {default:Registry}=await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-typert-registry')))
  const {default:Gateway}=await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-api-gateway')))
  const {TYPERT}=await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-cua/typert')))
  await f.ctx.plugin(Registry);f.ctx.typert.register(TYPERT)
  f.ctx.provide('remoteAccess',{decide(){return {kind:'allow'}}})
  await f.ctx.plugin(Gateway,Gateway.Config({}))
  const rpc=(method,args={},kind='owner')=>f.ctx.typertGateway.invokeRpc('cuaAccess/'+method,{args:{sessionId:f.parent.agent.id,...args}},undefined,{id:kind,principal:{kind},signal:new AbortController().signal})
  return {f,native,rpc}
}
const rpcValue = result => {assert.equal(result.ok,true,JSON.stringify(result));return result.value}

for(const count of [0,1,2])test(`operator RPC lists only exact-bundle identity candidates (${count} instances)`,async t=>{
 const {f,rpc,unavailable}=await instanceGateway({pids:[1234,5678].slice(0,count)})
 if(unavailable){t.skip('requires local.4 instance selection');return}
 const found=rpcValue(await rpc('discoverTaskApplications',{bundleId:instanceBundle}))
 assert.equal(found.applications.length,count)
 assert.doesNotMatch(JSON.stringify(found),/appHandle|authorization|UNRELATED_CATALOG_SENTINEL|org.example.Other/)
 for(const candidate of found.applications){assert.equal(candidate.bundleId,instanceBundle);assert.ok([1234,5678].includes(candidate.pid));assert.equal(typeof candidate.id,'string')}
 assert.deepEqual(f.nativeRequests.map(r=>r.method),['listApps',...Array(count).fill('getApp')])
 assert.equal(f.seen.length,0);assert.equal(f.questions.length,0)
 assert.deepEqual((await f.ctx.cuaAccess.applications()).allowedApps,[])
 rpcValue(await rpc('clearTaskTargets'))
 assert.equal(f.ctx.cuaTaskTargets.rows.size,0)
})

test('full first-use RPC chooses an instance/window before true-root task consent and keeps parent Flash',async t=>{
 let f
 const setup=await instanceGateway({humanAnswer:request=>{assert.equal(request.agent,f.parent.agent);assert.match(request.questions[0].detail,/Process: 1234/);assert.equal(f.nativeRequests.some(r=>['getState','click','setValue'].includes(r.method)),false);return allowTask()}})
 if(setup.unavailable){t.skip('requires local.4');return}
 f=setup.f;const {rpc}=setup
 const apps=rpcValue(await rpc('discoverTaskApplications',{bundleId:instanceBundle})).applications
 const windows=rpcValue(await rpc('selectTaskApplication',{candidateId:apps.find(app=>app.pid===1234).id})).targets
 assert.equal(windows[0].pid,1234);assert.equal(windows[0].windowId,7)
 rpcValue(await rpc('selectTaskTarget',{candidateId:windows[0].id}))
 assert.equal(f.questions.length,0)
 const result=(await f.execute()).results[0].result.value
 assert.equal(result.status,'completed',JSON.stringify(result));assert.equal(result.cleanup,'drained')
 assert.equal(f.questions.length,1)
 assert.deepEqual(f.parent.agent.model.current(),{provider:'deepseek',model:'flash'})
 assert.equal(f.ctx.cuaTaskTargets.rows.size,0)
 assert.deepEqual((await f.ctx.cuaAccess.applications()).allowedApps,[])
})

test('instance RPC rejects non-owner, invalid bundle, child root and forged candidates before window reads',async t=>{
 const {f,rpc,unavailable}=await instanceGateway()
 if(unavailable){t.skip('requires local.4');return}
 for(const method of ['discoverTaskApplications','selectTaskApplication']){
  const args=method==='discoverTaskApplications'?{bundleId:instanceBundle}:{candidateId:'forged'}
  assert.match(JSON.stringify(await rpc(method,args,'liveshare')),/CUA_TARGET_OPERATOR_REQUIRED/)
 }
 for(const bundleId of ['1234','Synthetic Browser','org.example.*',' org.example.SyntheticBrowser'])assert.equal((await rpc('discoverTaskApplications',{bundleId})).ok,false)
 const child=await f.ctx.agents.create({sessionId:SessionId(crypto.randomUUID()),parentAgent:f.parent.agent,meta:{origin:'subagent',parentSession:f.parent.agent.id}});owned.push(()=>child.dispose())
 assert.match(JSON.stringify(await rpc('discoverTaskApplications',{sessionId:child.agent.id,bundleId:instanceBundle})),/CUA_TARGET_OPERATOR_ROOT_REQUIRED/)
 assert.equal(f.nativeRequests.length,0)
 const apps=rpcValue(await rpc('discoverTaskApplications',{bundleId:instanceBundle})).applications
 assert.match(JSON.stringify(await rpc('selectTaskApplication',{candidateId:'forged'})),/CUA_TARGET_NOT_FOUND/)
 const other=await f.ctx.agents.create({sessionId:SessionId(crypto.randomUUID()),agentOptions:{provider:'deepseek',model:'flash'}});owned.push(()=>other.dispose())
 assert.equal((await rpc('selectTaskApplication',{sessionId:other.agent.id,candidateId:apps[0].id})).ok,false)
 assert.equal(f.nativeRequests.some(r=>r.method==='prepareTaskWindows'),false)
 rpcValue(await rpc('clearTaskTargets'))
})

for(const changed of ['exited','restarted'])test(`retained instance identity rejects ${changed} PID before returning window metadata`,async t=>{
 const {f,native,rpc,unavailable}=await instanceGateway({pids:[1234]})
 if(unavailable){t.skip('requires local.4');return}
 const app=rpcValue(await rpc('discoverTaskApplications',{bundleId:instanceBundle})).applications[0]
 native.generations.set(1234,changed==='exited'?undefined:2)
 assert.equal((await rpc('selectTaskApplication',{candidateId:app.id})).ok,false)
 assert.deepEqual(f.nativeRequests.map(r=>r.method),['listApps','getApp','prepareTaskWindows'],'no fresh getApp-by-PID can silently rebind a new process')
 assert.equal(f.ctx.cuaTaskTargets.rows.size,0)
 assert.equal(f.questions.length,0);assert.equal(f.seen.length,0)
})

test('PID reuse during application catalog resolution must still match the exact bundle',async t=>{
 const native=instanceNative({pids:[1234]});const original=native.respond
 native.respond=async request=>{const result=await original(request);return request.method==='getApp'?{...result,bundleId:'org.example.Foreign'}:result}
 const {f,rpc,unavailable}=await instanceGateway({native})
 if(unavailable){t.skip('requires local.4');return}
 assert.match(JSON.stringify(await rpc('discoverTaskApplications',{bundleId:instanceBundle})),/CUA_TARGET_RUNNING_APP_REQUIRED/)
 assert.equal(f.nativeRequests.some(r=>r.method==='prepareTaskWindows'),false)
 assert.equal(f.ctx.cuaTaskTargets.rows.size,0)
})

test('switching instance candidates invalidates previously shown windows and never selects automatically',async t=>{
 const {f,rpc,unavailable}=await instanceGateway()
 if(unavailable){t.skip('requires local.4');return}
 const apps=rpcValue(await rpc('discoverTaskApplications',{bundleId:instanceBundle})).applications
 const first=rpcValue(await rpc('selectTaskApplication',{candidateId:apps[0].id})).targets[0]
 const second=rpcValue(await rpc('selectTaskApplication',{candidateId:apps[1].id})).targets[0]
 assert.notEqual(first.pid,second.pid)
 assert.match(JSON.stringify(await rpc('selectTaskTarget',{candidateId:first.id})),/CUA_TARGET_NOT_FOUND/)
 assert.equal((await f.execute()).results[0].result.value.reason,'operator_target_required')
 assert.equal(f.questions.length,0)
 rpcValue(await rpc('selectTaskTarget',{candidateId:second.id}))
 assert.match(JSON.stringify(await rpc('selectTaskApplication',{candidateId:apps[0].id})),/CUA_TARGET_ALREADY_SELECTED/)
 rpcValue(await rpc('clearTaskTargets'))
})

test('concurrent clear aborts pending instance metadata and drains before any candidate can be reused',async t=>{
 let entered,release
 const waiting=new Promise(resolve=>{entered=resolve}),resume=new Promise(resolve=>{release=resolve})
 const native=instanceNative();const respond=native.respond
 native.respond=async request=>{if(request.method==='listApps'){entered();await resume}return respond(request)}
 const {f,rpc,unavailable}=await instanceGateway({native})
 if(unavailable){t.skip('requires local.4');return}
 const pending=rpc('discoverTaskApplications',{bundleId:instanceBundle});await waiting
 const clear=rpc('clearTaskTargets');release()
 assert.equal((await pending).ok,false);rpcValue(await clear)
 assert.equal(f.ctx.cuaTaskTargets.rows.size,0)
 assert.equal(f.nativeRequests.some(r=>r.method==='getApp'),false)
 assert.equal(f.questions.length,0);assert.equal(f.seen.length,0)
})

for(const pid of [0,-1,1.5])test(`invalid catalog PID ${pid} is rejected before a native identity lookup`,async t=>{
 const native={respond:async request=>request.method==='listApps'?[{pid,name:'Synthetic Browser',bundleId:instanceBundle}]:targetNative(request)}
 const {f,rpc,unavailable}=await instanceGateway({native})
 if(unavailable){t.skip('requires local.4');return}
 assert.equal((await rpc('discoverTaskApplications',{bundleId:instanceBundle})).ok,false)
 assert.deepEqual(f.nativeRequests.map(r=>r.method),['listApps'])
 assert.equal(f.ctx.cuaTaskTargets.rows.size,0)
})

test('instance candidates expire and clear without becoming a control capability or model operation',async t=>{
 const {f,rpc,unavailable}=await instanceGateway({pids:[1234]})
 if(unavailable){t.skip('requires local.4');return}
 const app=rpcValue(await rpc('discoverTaskApplications',{bundleId:instanceBundle})).applications[0]
 f.ctx.cuaTaskTargets.rows.get(f.parent.agent).expiresAt=Date.now()-1
 assert.match(JSON.stringify(await rpc('selectTaskApplication',{candidateId:app.id})),/CUA_TARGET_CLOSED/)
 rpcValue(await rpc('clearTaskTargets'))
 const require=createRequire(import.meta.url),{Request}=await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-cua/protocol')))
 for(const method of ['discoverTaskApplications','selectTaskApplication']){
  assert.equal(Request.safeParse({method,params:{}}).success,false)
  assert.equal(f.ctx.tools.get(method,f.parent.agent),undefined)
 }
 assert.equal(f.questions.length,0)
})

test('packaged operator UI uses the current conversation and completes instance/window RPC selection without URL guessing',async t=>{
 const {f,rpc,unavailable}=await instanceGateway({pids:[1234]})
 if(unavailable){t.skip('requires local.4');return}
 const require=createRequire(import.meta.url),base=pathToFileURL(require.resolve('@deepseek-ai/dsh-cua/package.json'))
 const source=await readFile(new URL('lib/client.js',base),'utf8'),start=source.indexOf('function TaskTargetPanel('),end=source.indexOf('function PermissionPanel(',start)
 assert.doesNotMatch(source.slice(start,end),/from its URL/)
 const state=['',instanceBundle,[],'',false,false,[]];let index=0
 const react={useState:initial=>{const key=index++;if(!(key in state))state[key]=initial;return[state[key],value=>{state[key]=value}]}}
 const jsx=(type,props)=>({type,...props}),Panel=new Function('react','react_jsx_runtime',source.slice(start,end)+';return TaskTargetPanel;')(react,{jsx,jsxs:jsx})
 const remote=Object.fromEntries(['discoverTaskApplications','selectTaskApplication','selectTaskTarget','clearTaskTargets'].map(method=>[method,(sessionId,value)=>rpc(method,{sessionId,...method==='discoverTaskApplications'?{bundleId:value}:method==='clearTaskTargets'?{}:{candidateId:value}})]))
 const render=()=>{index=0;return Panel({remote,useSessions:selector=>selector({byId:{[f.parent.agent.id]:{id:f.parent.agent.id,retainedBy:{mainView:1}}}})})}
 const find=(node,label)=>{if(!node||typeof node!=='object')return;if(node.type==='button'&&node.children===label)return node;for(const child of Array.isArray(node.children)?node.children:[node.children]){const found=find(child,label);if(found)return found}}
 await find(render(),'Use current conversation').onClick()
 assert.equal(state[0],f.parent.agent.id)
 await find(render(),'Find application instances').onClick()
 assert.equal(state[6].length,1)
 assert.equal(state[5],false)
 await find(render(),"Show this instance's windows").onClick()
 assert.equal(state[2].length,1)
 await find(render(),'Select this window').onClick()
 assert.equal(state[5],true);assert.match(state[3],/approval is still required/)
 assert.equal(f.questions.length,0)
 assert.equal(f.nativeRequests.some(row=>['getState','screenshot','click','setValue'].includes(row.method)),false)
 await find(render(),'Clear selection').onClick()
 assert.equal(state[5],false);assert.equal(f.ctx.cuaTaskTargets.rows.size,0)
})

// Ordinary human message -> Flash tool call -> private Host preparation -> root
// consent -> owned Terra. Every provider/native response below is synthetic.
function conversationalNative(request) {
  if (request.method === 'listApps') return [
    { pid: 1234, name: target.application, bundleId: 'org.example.SyntheticBrowser' },
    { pid: 9999, name: 'UNRELATED_PRIVATE_APPLICATION', bundleId: 'org.example.Private' },
  ]
  if (request.method === 'getApp') return { ...targetNative(request), bundleId: 'org.example.SyntheticBrowser' }
  if (request.method === 'prepareTaskWindows') return targetNative(request).map(window => ({ ...window, title: 'PRIVATE_CANDIDATE_TITLE' }))
  return targetNative(request)
}

test('ordinary Flash conversation privately locates a unique target and approves before the first Terra request', async t => {
  let f
  f = await fixture({ officialCua: true, strict: true, config: { application: '', windowId: 0 },
    script: selectedTaskScript(), nativeResponse: conversationalNative, humanAnswer: request => {
      assert.equal(request.agent, f.parent.agent)
      assert.equal(request.questions[0].id, 'cua-task-access')
      assert.equal(f.seen.filter(call => call.model === ROUTE.model).length, 0)
      assert.equal(f.nativeRequests.some(call => ['getState', 'screenshot', 'setValue', 'click'].includes(call.method)), false)
      return allowTask()
    } })
  if (f.ctx.get('cuaTaskApproval')?.version !== 2) { t.skip('requires local.6 private preparation'); return }
  await f.conversation('Complete this synthetic task in Synthetic Browser')
  assert.equal(f.questions.length, 1)
  assert.ok(f.nativeRequests.some(call => call.method === 'setValue'), 'real Host pipeline dispatches the synthetic native input')
  assert.deepEqual(f.seen.filter(call => call.model === 'flash').map(call => call.provider), ['deepseek', 'deepseek'])
  assert.ok(f.seen.some(call => call.model === ROUTE.model && call.reasoningEffort === 'high'))
  assert.deepEqual(f.parent.agent.model.current(), { provider: 'deepseek', model: 'flash' })
  const events = JSON.stringify(f.parent.agent.session.snapshotEvents())
  const toolResult = f.parent.agent.session.snapshotEvents().find(event => event.type === 'tool/result').data.message
  assert.equal(JSON.parse(toolResult.content.find(block => block.type === 'text').text).status, 'completed')
  assert.equal(events.includes('PRIVATE_CANDIDATE_TITLE'), false)
  for (const call of f.seen) {
    assert.equal(JSON.stringify(call).includes('UNRELATED_PRIVATE_APPLICATION'), false)
    assert.equal(JSON.stringify(call).includes('PRIVATE_CANDIDATE_TITLE'), false)
  }
  assert.equal(f.ctx.cuaTaskTargets.rows.size, 0)
  assert.deepEqual((await f.ctx.cuaAccess.applications()).allowedApps, [])
})

test('ambiguous ordinary task selects in the same root and denies without Terra, observation or reusable consent', async t => {
  let f
  f = await fixture({ officialCua: true, strict: true, config: { application: '', windowId: 0 },
    nativeResponse: request => request.method === 'prepareTaskWindows'
      ? [7, 8].map(windowId => ({ ...targetNative(request)[0], windowId, title: `PRIVATE_CANDIDATE_${windowId}`, targetKey: `anchor-${windowId}` }))
      : conversationalNative(request), humanAnswer: request => {
      assert.equal(request.agent, f.parent.agent)
      const question = request.questions[0]
      if (question.id === 'cua-task-window') return { answers: [{ id: question.id, selected: [question.options[0].label] }] }
      return { answers: [{ id: 'cua-task-access', selected: ['Deny'] }] }
    } })
  if (f.ctx.get('cuaTaskApproval')?.version !== 2) { t.skip('requires local.6 private preparation'); return }
  await f.conversation('Use Synthetic Browser for this task')
  assert.deepEqual(f.questions.map(request => request.questions[0].id), ['cua-task-window', 'cua-task-access'])
  assert.equal(f.seen.some(call => call.model === ROUTE.model), false)
  assert.equal(f.nativeRequests.some(call => ['getState', 'click', 'screenshot', 'setValue'].includes(call.method)), false)
  assert.equal(JSON.stringify(f.parent.agent.session.snapshotEvents()).includes('PRIVATE_CANDIDATE_'), false)
  const nativeCount = f.nativeRequests.length
  const retry = (await f.execute()).results[0].result.value
  assert.equal(retry.reason, 'task_retry_requires_new_user_input')
  assert.equal(f.nativeRequests.length, nativeCount)
  assert.equal(f.ctx.cuaTaskTargets.rows.size, 0)
  assert.deepEqual((await f.ctx.cuaAccess.applications()).allowedApps, [])
})

test('Stop during ordinary root consent drains target metadata with no Terra or page operation', async t => {
  let entered, f
  const pending = new Promise(resolve => { entered = resolve })
  f = await fixture({ officialCua: true, strict: true, config: { application: '', windowId: 0 },
    nativeResponse: conversationalNative, humanAnswer: request => {
      entered()
      return new Promise((_resolve, reject) => request.signal.addEventListener('abort', () => reject(Error('human interaction cancelled')), { once: true }))
    } })
  if (f.ctx.get('cuaTaskApproval')?.version !== 2) { t.skip('requires local.6 private preparation'); return }
  const run = f.conversation('Use Synthetic Browser for this task')
  await pending
  f.parent.agent.cancel({ kind: 'user' })
  await run
  assert.equal(f.seen.some(call => call.model === ROUTE.model), false)
  assert.equal(f.nativeRequests.some(call => ['getState', 'screenshot', 'setValue', 'click'].includes(call.method)), false)
  assert.equal(f.ctx.cuaTaskTargets.rows.size, 0)
  const count = f.nativeRequests.length
  assert.equal((await f.execute()).results[0].result.value.reason, 'task_retry_requires_new_user_input')
  assert.equal(f.nativeRequests.length, count)
  assert.deepEqual((await f.ctx.cuaAccess.applications()).allowedApps, [])
})
