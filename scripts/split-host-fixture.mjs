/** Cross-host Split acceptance. Real host components; synthetic sources, credentials and provider. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { zstdDecompressSync } from 'node:zlib'
import { setTimeout as delay } from 'node:timers/promises'

export const SPLIT_HOST_SCENARIOS = Object.freeze([
  'success', 'plain', 'unread', 'bad-reference', 'forbidden', 'recursive', 'run-code',
  'http-error', 'request-budget', 'timeout', 'pre-cancel', 'publication-cancel',
  'read-substitution', 'capture-substitution', 'local-tool', 'route-change',
  'parent-dispose', 'concurrent-admission', 'provider-changed', 'disabled',
  'persistent-composition', 'persistence-after-grant', 'oversized-result',
])
const content = 'export const answer = 42\n'
const sha256 = createHash('sha256').update(content).digest('hex')
const resultData = { summary: 'Verified the fixture.', findings: [{ explanation: 'The answer is 42.', references: [{ path: 'src/example.ts', sha256, startLine: 1, endLine: 1 }] }], limitations: [] }
const endpoint = 'https://chatgpt.com/backend-api/codex/responses'
function response(item, model) {
  return new Response([
    { type: 'response.output_item.added', output_index: 0, item },
    { type: 'response.output_item.done', output_index: 0, item },
    { type: 'response.completed', response: { id: 'resp_split_host', model, status: 'completed', output: [item], usage: { input_tokens: 100, output_tokens: 20, total_tokens: 120 } } },
  ].map(event => `data: ${JSON.stringify(event)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } })
}

export async function runSplitHostScenario(scenario, { root, implementation, importHost }) {
  assert.ok(SPLIT_HOST_SCENARIOS.includes(scenario))
  const prior = { fetch: globalThis.fetch, WebSocket: globalThis.WebSocket, home: process.env.DSH_HOME }
  const workspace = join(root, scenario)
  process.env.DSH_HOME = join(workspace, 'synthetic-home')
  const { attachApprovedSplitWorker, snapshotSplitEvidence, createOpenAICodexAdapter, OpenAICodexCredentialStore, SPLIT_MODEL, SPLIT_INSPECT_TOOL, SPLIT_READ_TOOL, SPLIT_RESULT_TOOL } = implementation
  let ctx
  let parentHandle
  const wires = []
  const childWires = []
  const children = []
  const lifecycle = []
  let parentRequests = 0
  let forbiddenEffects = 0
  const controller = new AbortController()
  const call = (name, args) => response({ type: 'function_call', id: 'fc_split_host', call_id: `call_${name}`, name, arguments: JSON.stringify(args), status: 'completed' }, SPLIT_MODEL)
  const answer = text => response({ type: 'message', id: 'msg_split_host', role: 'assistant', phase: 'final_answer', status: 'completed', content: [{ type: 'output_text', text, annotations: [] }] }, SPLIT_MODEL)
  globalThis.WebSocket = class { constructor() { throw new Error('SPLIT_FIXTURE_WEBSOCKET_DENIED') } }
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), endpoint, 'offline fixture rejects unrelated endpoints')
    assert.equal(init.method, 'POST')
    const bytes = new Headers(init.headers).get('content-encoding') === 'zstd' ? zstdDecompressSync(init.body) : init.body
    const body = JSON.parse(typeof bytes === 'string' ? bytes : Buffer.from(bytes).toString('utf8'))
    assert.equal(body.model, SPLIT_MODEL)
    assert.ok(wires.length < 8, 'fixture requests remain bounded')
    wires.push(body)
    if (body.tools.some(tool => tool.name === SPLIT_INSPECT_TOOL)) {
      parentRequests += 1
      if (parentRequests === 1) return call(SPLIT_INSPECT_TOOL, {})
      assert.ok(JSON.stringify(body.input).includes('Verified the fixture.'))
      return answer('Parent consumed the worker result.')
    }
    childWires.push(body)
    assert.ok(!JSON.stringify(body).includes('PARENT_ONLY_FIXTURE'))
    assert.deepEqual(body.tools.map(tool => tool.name).sort(), [SPLIT_READ_TOOL, SPLIT_RESULT_TOOL].sort())
    assert.equal(body.reasoning.effort, 'low')
    assert.equal(body.service_tier, undefined)
    if (scenario === 'http-error') return new Response(JSON.stringify({ error: { message: 'Synthetic failure', code: 'server_error' } }), { status: 500 })
    if (['timeout', 'parent-dispose', 'concurrent-admission'].includes(scenario)) return new Promise((_resolve, reject) => {
      if (init.signal.aborted) { reject(init.signal.reason); return }
      init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true })
    })
    if (scenario === 'plain') return answer('Plain text is not structured completion.')
    if (scenario === 'unread') return call(SPLIT_RESULT_TOOL, { summary: 'No inspection.', findings: [], limitations: [] })
    if (scenario === 'forbidden') return call('fixture_write', {})
    if (scenario === 'recursive') return call(SPLIT_INSPECT_TOOL, {})
    if (scenario === 'run-code') return call('run_code', { code: 'fixture only' })
    if (scenario === 'local-tool') return call('fixture_local', {})
    if (childWires.length === 1 || scenario === 'request-budget') return call(SPLIT_READ_TOOL, { path: 'src/example.ts', startLine: 1, endLine: 1 })
    assert.ok(JSON.stringify(body.input).includes(content.trim()))
    if (scenario === 'bad-reference') return call(SPLIT_RESULT_TOOL, { ...resultData, findings: [{ explanation: 'Unobserved.', references: [{ path: 'src/other.ts', sha256, startLine: 1, endLine: 1 }] }] })
    if (scenario === 'oversized-result') return call(SPLIT_RESULT_TOOL, { ...resultData, summary: 'x'.repeat(16001) })
    return call(SPLIT_RESULT_TOOL, resultData)
  }
  try {
    await mkdir(join(workspace, 'src'), { recursive: true })
    await writeFile(join(workspace, 'src/example.ts'), content)
    const evidence = await snapshotSplitEvidence(workspace, [{ path: 'src/example.ts', sha256 }], new AbortController().signal)
    const [{ Context }, llm, sessions, projections, prompt, tools, agents, loop, subagents, spawn] = await Promise.all([
      '@deepseek-ai/cordis', '@deepseek-ai/dsh-llm', '@deepseek-ai/dsh-session',
      '@deepseek-ai/dsh-session-projection', '@deepseek-ai/dsh-system-prompt', '@deepseek-ai/dsh-tools',
      '@deepseek-ai/dsh-agent', '@deepseek-ai/dsh-agent-loop', '@deepseek-ai/dsh-subagent', '@deepseek-ai/dsh-subagent-spawn-in-process',
    ].map(importHost))
    const store = new OpenAICodexCredentialStore()
    const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url')
    await store.modify('openai-codex', async () => ({ type: 'oauth', accountId: 'split-host-synthetic', access: `${encode({ alg: 'none' })}.${encode({ 'https://api.openai.com/auth': { chatgpt_account_id: 'split-host-synthetic' } })}.synthetic`, refresh: 'synthetic-only', expires: Date.now() + 3600000 }))
    ctx = new Context()
    for (const module of [llm, sessions, projections, prompt, tools, agents]) await ctx.plugin(module.default)
    await ctx.plugin(loop.default, { agents: [] })
    await ctx.plugin(subagents.default)
    await ctx.plugin(spawn, { providerName: 'split-exact-spawn' })
    ctx.llm.registerAdapter(['openai-codex'], createOpenAICodexAdapter(store, () => undefined))
    const effect = name => ({ name, description: 'Synthetic effect only.', parameters: { type: 'object', properties: {} }, output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: String(value) }] }, execute: async () => { forbiddenEffects += 1; return 'forbidden'; } })
    ctx.tools.register(effect('fixture_write'))
    parentHandle = await ctx.agents.create({ sessionId: sessions.SessionId(`split-${scenario}`), agentOptions: { provider: 'openai-codex', model: SPLIT_MODEL, reasoningEffort: llm.ReasoningEffortId('low') } })
    const parent = parentHandle.agent
    const provider = ctx.subagents.getProvider('split-exact-spawn')
    ctx.on('agent/created', ({ agent }) => { if (agent !== parent) children.push(agent) })
    ctx.on('subagent/start', () => lifecycle.push('start'))
    ctx.on('subagent/end', () => lifecycle.push('end'))
    const attachPersistence = async () => {
      const persistence = await importHost('@deepseek-ai/dsh-session-persistence-jsonl')
      await ctx.plugin(persistence.default, { root: join(workspace, 'sessions'), compression: 'none', packChunks: true })
    }
    const task = { enabled: scenario !== 'disabled', brief: 'Inspect the approved example and cite its source.', evidence, provider,
      maximumRequests: scenario === 'request-budget' ? 2 : 6, timeoutMs: scenario === 'timeout' ? 150 : 10000 }
    if (scenario === 'persistent-composition') {
      await attachPersistence()
      assert.throws(() => attachApprovedSplitWorker(ctx, parent, task), /SPLIT_PERSISTENCE_UNSUPPORTED/u)
      assert.equal(wires.length, 0)
      return { scenario, syntheticOnly: true, rejectedBeforeDispatch: true, mockDispatches: 0 }
    }
    const revoke = attachApprovedSplitWorker(ctx, parent, task)
    const execute = () => ctx.tools.execute({ callId: llm.ToolCallId('split-host-inspection'), name: SPLIT_INSPECT_TOOL, arguments: {}, agent: parent, signal: controller.signal })
    if (scenario === 'disabled') {
      assert.equal(ctx.tools.get(SPLIT_INSPECT_TOOL, parent), undefined)
      assert.equal(wires.length, 0)
      return { scenario, syntheticOnly: true, disabled: true, mockDispatches: 0 }
    }
    if (scenario === 'persistence-after-grant') await attachPersistence()
    ctx.on('agent/created', ({ agent }) => { if (agent !== parent && scenario === 'publication-cancel') controller.abort() })
    // Run after the controller's publication hook sealed capability identities.
    // Mutating earlier would exercise trusted composition, not a post-seal substitution.
    ctx.on('agent/session-start', ({ agent }) => {
      if (agent === parent) return
      if (scenario === 'local-tool') agent.ctx.tools.register(effect('fixture_local'))
      if (scenario === 'read-substitution' || scenario === 'capture-substitution') {
        ctx.tools.get(scenario === 'read-substitution' ? SPLIT_READ_TOOL : SPLIT_RESULT_TOOL, agent).execute = effect('replacement').execute
        assert.ok(ctx.tools.get(SPLIT_READ_TOOL, agent), 'the worker must be composed before substitution')
      }
      if (scenario === 'route-change') agent.ctx.on('agent/request', async (_event, next) => ({ ...await next(), model: 'fixture-disallowed-model' }))
    })
    if (scenario === 'provider-changed') {
      // Same trusted fixture object, different start identity: execution must reject it before startup.
      const original = provider.start
      provider.start = async () => { forbiddenEffects += 1; throw new Error('Must not run') }
      try { assert.match(JSON.stringify(await execute()), /SPLIT_PROVIDER_CHANGED/u) } finally { provider.start = original }
    } else if (scenario === 'success') {
      parent.followup(llm.createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'PARENT_ONLY_FIXTURE: run the approved inspection.' }] }))
      await parent.whenIdle()
      const events = parent.session.snapshotEvents()
      assert.ok(JSON.stringify(events.find(event => event.type === 'tool/result')).includes('Verified the fixture.'))
      assert.ok(JSON.stringify(events.findLast(event => event.type === 'assistant/message')).includes('Parent consumed the worker result.'))
      assert.equal(parentRequests, 2)
      assert.equal(childWires.length, 2)
      assert.equal(wires.length, 4)
    } else {
      if (scenario === 'pre-cancel') controller.abort()
      const pending = execute()
      if (scenario === 'parent-dispose' || scenario === 'concurrent-admission') {
        for (let attempts = 0; childWires.length === 0 && attempts < 200; attempts += 1) await delay(5)
        assert.equal(childWires.length, 1)
        if (scenario === 'parent-dispose') await parentHandle.dispose()
        else { assert.match(JSON.stringify(await execute()), /SPLIT_PARENT_BUSY/u); controller.abort() }
      }
      const result = await pending
      assert.equal(result.isError, true, `${scenario} must not report success`)
      if (scenario === 'timeout') assert.match(JSON.stringify(result), /SPLIT_TIMEOUT/u)
      if (scenario === 'persistence-after-grant') assert.match(JSON.stringify(result), /SPLIT_PERSISTENCE_UNSUPPORTED/u)
      if (scenario === 'http-error') assert.equal(childWires.length, 1, 'provider error must not retry')
      if (scenario === 'request-budget') assert.equal(childWires.length, 2)
      if (['pre-cancel', 'publication-cancel', 'route-change', 'persistence-after-grant'].includes(scenario)) assert.equal(childWires.length, 0)
      if (scenario === 'concurrent-admission') {
        const after = await ctx.tools.execute({ callId: llm.ToolCallId('second'), name: SPLIT_INSPECT_TOOL, arguments: {}, agent: parent, signal: new AbortController().signal })
        assert.match(JSON.stringify(after), /SPLIT_APPROVAL_CONSUMED/u)
      }
    }
    if (scenario === 'read-substitution') assert.equal(childWires.length, 1, 'read substitution must reach the model-issued read')
    if (scenario === 'capture-substitution') assert.equal(childWires.length, 2, 'capture substitution must follow a successful read and reach result submission')
    if (['plain', 'unread', 'bad-reference', 'oversized-result'].includes(scenario)) {
      assert.equal(childWires.length, ['bad-reference', 'oversized-result'].includes(scenario) ? 2 : 1, 'result rejection must exercise the intended result boundary')
    }
    if (scenario === 'success') assert.deepEqual(lifecycle, ['start', 'end'])
    assert.equal(forbiddenEffects, 0, 'no forbidden tool or substituted provider body ran')
    for (const child of children) assert.equal(ctx.agents.get(child.id), undefined, 'child must reach quiescence')
    if (scenario !== 'parent-dispose') assert.equal(ctx.agents.get(parent.id), parent)
    assert.ok(lifecycle.length === 0 || JSON.stringify(lifecycle) === '["start","end"]', 'published lifecycle must pair')
    revoke()
    return { scenario, syntheticOnly: true, mockDispatches: wires.length, childMockDispatches: childWires.length, children: children.length, lifecyclePaired: true, childQuiescent: true, forbiddenEffects }
  } finally {
    try { await ctx?.fiber.dispose() } finally {
      globalThis.fetch = prior.fetch
      globalThis.WebSocket = prior.WebSocket
      if (prior.home === undefined) delete process.env.DSH_HOME
      else process.env.DSH_HOME = prior.home
    }
  }
}
