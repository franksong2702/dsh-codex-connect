/** Cross-host Split acceptance. Real host components; synthetic sources, credentials and provider. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { zstdDecompressSync } from 'node:zlib'
import { setTimeout as delay } from 'node:timers/promises'
import { exerciseSplitTransport, SPLIT_TRANSPORT_SCENARIOS } from './split-transport-fixture.mjs'

export const SPLIT_HOST_SCENARIOS = Object.freeze([
  'success', 'plain', 'unread', 'bad-reference', 'forbidden', 'recursive', 'run-code',
  'http-error', 'request-budget', 'timeout', 'pre-cancel', 'publication-cancel',
  'read-substitution', 'capture-substitution', 'local-tool', 'route-change',
  'parent-dispose', 'concurrent-admission', 'provider-changed', 'disabled',
  'persistent-composition', 'persistence-after-grant', 'oversized-result',
  'approval-allow', 'approval-reject', 'approval-missing', 'approval-unavailable', 'approval-never',
  'approval-stale', 'approval-revoke-pending', 'approval-revoke-running', 'approval-timeout',
  'approval-intercepted', 'approval-provider-change', 'prompt-isolation', 'context-injection',
  'grant-revoked-before-start', 'grant-revoked-running',
  'approval-disposal-failure', 'approval-owner-disposed',
  ...SPLIT_TRANSPORT_SCENARIOS,
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

export async function runSplitHostScenario(scenario, { root, implementation, importHost, interaction }) {
  assert.ok(SPLIT_HOST_SCENARIOS.includes(scenario))
  const isTransport = scenario.startsWith('transport-')
  const isApproval = scenario.startsWith('approval-') || isTransport
  const approvalSuccess = ['approval-allow', 'approval-stale'].includes(scenario)
  const waitFor = async condition => { for (let n = 0; !condition() && n < 400; n += 1) await delay(5); assert.ok(condition(), 'expected lifecycle boundary must be reached') }
  const prior = { fetch: globalThis.fetch, WebSocket: globalThis.WebSocket, home: process.env.DSH_HOME }
  const workspace = join(root, scenario)
  process.env.DSH_HOME = join(workspace, 'synthetic-home')
  const { attachApprovedSplitWorker, attachSplitApprovalRequest, snapshotSplitEvidence, createOpenAICodexAdapter, OpenAICodexCredentialStore, SPLIT_MODEL, SPLIT_INSPECT_TOOL, SPLIT_READ_TOOL, SPLIT_RESULT_TOOL } = implementation
  let ctx
  let parentHandle
  const wires = []
  const childWires = []
  const children = []
  const lifecycle = []
  const systemRepresentations = new Set()
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
    if (!body.tools.some(tool => [SPLIT_READ_TOOL, SPLIT_RESULT_TOOL].includes(tool.name))) {
      parentRequests += 1
      if (parentRequests === 1) return call(SPLIT_INSPECT_TOOL, {})
      if (!isApproval || approvalSuccess) assert.ok(JSON.stringify(body.input).includes('Verified the fixture.'))
      return answer('Parent consumed the worker result.')
    }
    childWires.push(body)
    assert.ok(!JSON.stringify(body).includes('PARENT_ONLY_FIXTURE'))
    assert.ok(!JSON.stringify(body).includes('DEPLOYMENT_ONLY_FIXTURE'))
    assert.deepEqual(body.tools.map(tool => tool.name).sort(), [SPLIT_READ_TOOL, SPLIT_RESULT_TOOL].sort())
    assert.equal(body.reasoning.effort, 'low')
    assert.equal(body.service_tier, undefined)
    if (scenario === 'http-error') return new Response(JSON.stringify({ error: { message: 'Synthetic failure', code: 'server_error' } }), { status: 500 })
    if (['timeout', 'parent-dispose', 'concurrent-admission', 'approval-revoke-running', 'grant-revoked-running', 'transport-revoke'].includes(scenario)) return new Promise((_resolve, reject) => {
      if (init.signal.aborted) { reject(init.signal.reason); return }
      init.signal.addEventListener('abort', () => {
        if (scenario.endsWith('revoked-running') || scenario === 'approval-revoke-running' || scenario === 'transport-revoke') setTimeout(() => reject(init.signal.reason), 80)
        else reject(init.signal.reason)
      }, { once: true })
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
    if (isApproval && scenario !== 'approval-missing') {
      const approval = await importHost('@deepseek-ai/dsh-user-approval')
      await ctx.plugin(approval.default, { policy: scenario === 'approval-never' ? 'never' : 'ask' })
    }
    if (scenario === 'prompt-isolation') {
      ctx.systemPrompt.section({ name: 'fixture:private-section', order: 123, text: 'DEPLOYMENT_ONLY_FIXTURE system' })
      ctx.systemPrompt.context({ name: 'fixture:private-context', order: 123, text: 'DEPLOYMENT_ONLY_FIXTURE context' })
    }
    ctx.llm.registerAdapter(['openai-codex'], createOpenAICodexAdapter(store, () => undefined))
    const effect = name => ({ name, description: 'Synthetic effect only.', parameters: { type: 'object', properties: {} }, output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: String(value) }] }, execute: async () => { forbiddenEffects += 1; return 'forbidden'; } })
    ctx.tools.register(effect('fixture_write'))
    parentHandle = await ctx.agents.create({ sessionId: sessions.SessionId(`split-${scenario}`), agentOptions: { provider: 'openai-codex', model: SPLIT_MODEL, reasoningEffort: llm.ReasoningEffortId('low') } })
    const parent = parentHandle.agent
    // Observe the actual host request without changing its frozen history or prompt.
    ctx.on('llm/stream', async function* (options, next) {
      if (options.sessionId !== parent.id) {
        const first = options.messages[0]
        systemRepresentations.add(options.system !== undefined ? 'field' : first?.role === 'system' ? 'history' : 'missing')
      }
      yield* next()
    })
    const provider = ctx.subagents.getProvider('split-exact-spawn')
    if (scenario === 'approval-disposal-failure') {
      const originalStart = provider.start
      provider.start = async request => {
        const run = await originalStart.call(provider, request)
        return { ...run, async dispose() { await run.dispose(); throw new Error('Synthetic disposal failure after child removal') } }
      }
    }
    ctx.on('agent/created', ({ agent }) => { if (agent !== parent) children.push(agent) })
    ctx.on('subagent/start', () => lifecycle.push('start'))
    ctx.on('subagent/end', () => lifecycle.push('end'))
    const attachPersistence = async () => {
      const persistence = await importHost('@deepseek-ai/dsh-session-persistence-jsonl')
      await ctx.plugin(persistence.default, { root: join(workspace, 'sessions'), compression: 'none', packChunks: true })
    }
    const task = { enabled: scenario !== 'disabled', brief: 'Inspect the approved example and cite its source.', evidence, provider,
      maximumRequests: scenario === 'request-budget' ? 2 : 6, timeoutMs: ['timeout', 'approval-timeout'].includes(scenario) ? 150 : 10000 }
    if (scenario === 'persistent-composition') {
      await attachPersistence()
      assert.throws(() => attachApprovedSplitWorker(ctx, parent, task), /SPLIT_PERSISTENCE_UNSUPPORTED/u)
      assert.equal(wires.length, 0)
      return { scenario, syntheticOnly: true, rejectedBeforeDispatch: true, mockDispatches: 0 }
    }
    const consent = isApproval ? attachSplitApprovalRequest(ctx, parent, { ...task, workspaceLabel: 'Synthetic fixture workspace' }) : undefined
    const revoke = consent === undefined ? attachApprovedSplitWorker(ctx, parent, task) : () => undefined
    if (scenario === 'approval-intercepted' || scenario === 'approval-unavailable') parent.ctx.on('approval/request', async () => scenario === 'approval-intercepted' ? 'allowed-once' : 'unavailable', { prepend: true })
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
      if (scenario === 'context-injection') agent.inject(llm.createUserMessage({ source: { kind: 'plugin', plugin: 'fixture' }, content: [{ type: 'text', text: 'DEPLOYMENT_ONLY_FIXTURE injected context' }] }))
      if (scenario === 'local-tool') agent.ctx.tools.register(effect('fixture_local'))
      if (scenario === 'read-substitution' || scenario === 'capture-substitution') {
        ctx.tools.get(scenario === 'read-substitution' ? SPLIT_READ_TOOL : SPLIT_RESULT_TOOL, agent).execute = effect('replacement').execute
        assert.ok(ctx.tools.get(SPLIT_READ_TOOL, agent), 'the worker must be composed before substitution')
      }
      if (scenario === 'route-change') agent.ctx.on('agent/request', async (_event, next) => ({ ...await next(), model: 'fixture-disallowed-model' }))
    })
    if (isTransport) {
      await exerciseSplitTransport(scenario, { ctx, parent, parentHandle, consent, implementation, importHost, childWires, children, llm, waitFor, interaction })
    } else if (isApproval) {
      const offer = consent.getSnapshot()
      assert.equal(consent.decide(offer.id, offer.reviewDigest, 'allow-once'), false, 'ready is not an outstanding approval')
      parent.followup(llm.createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'PARENT_ONLY_FIXTURE: run the approved inspection.' }] }))
      if (!['approval-missing', 'approval-unavailable', 'approval-never', 'approval-intercepted'].includes(scenario)) {
        await waitFor(() => consent.getSnapshot().phase === 'awaiting-approval')
        assert.equal(childWires.length, 0); assert.equal(children.length, 0)
        if (scenario === 'approval-stale') {
          assert.equal(consent.decide('another-offer', offer.reviewDigest, 'allow-once'), false)
          assert.equal(consent.decide(offer.id, 'different-review', 'allow-once'), false)
          assert.equal(consent.decide(offer.id, offer.reviewDigest, 'unexpected-choice'), false)
          assert.equal(consent.getSnapshot().phase, 'awaiting-approval')
          task.brief = 'MUTATED_AFTER_REVIEW'
        }
        if (scenario === 'approval-revoke-pending' || scenario === 'approval-owner-disposed') {
          if (scenario === 'approval-owner-disposed') await parentHandle.dispose()
          const stopped = consent.revoke()
          assert.equal(consent.revoke(), stopped)
          await stopped
          assert.equal(consent.decide(offer.id, offer.reviewDigest, 'allow-once'), false, 'late allow must remain stale')
        } else if (scenario !== 'approval-timeout') {
          const originalStart = provider.start
          if (scenario === 'approval-provider-change') provider.start = async () => { forbiddenEffects += 1; throw new Error('Must not start') }
          assert.equal(consent.decide(offer.id, offer.reviewDigest, scenario === 'approval-reject' ? 'reject' : 'allow-once'), true)
          assert.equal(consent.decide(offer.id, offer.reviewDigest, 'allow-once'), false)
          if (scenario === 'approval-revoke-running') {
            await waitFor(() => childWires.length === 1)
            const stopped = consent.revoke()
            assert.equal(consent.getSnapshot().phase, 'revoking')
            assert.equal(consent.revoke(), stopped)
            assert.ok(ctx.agents.get(children[0].id), 'revocation must await the cooperative provider and child cleanup')
            await stopped
          }
          await parent.whenIdle()
          provider.start = originalStart
        }
      }
      await parent.whenIdle()
      const events = parent.session.snapshotEvents()
      const audit = events.filter(event => ['approval/asked', 'approval/decided'].includes(event.type))
      if (scenario === 'approval-missing') assert.equal(audit.length, 0)
      else {
        assert.deepEqual(audit.map(event => event.type), ['approval/asked', 'approval/decided'])
        assert.equal(audit[0].data.id, audit[1].data.id)
        assert.ok(audit[0].data.reason.includes(offer.reviewDigest))
        assert.ok(audit[0].data.reason.includes(sha256))
        assert.ok(events.findIndex(event => event.type === 'turn/start') < events.indexOf(audit[0]))
        assert.ok(events.indexOf(audit[1]) < events.findIndex(event => event.type === 'turn/end'))
      }
      if (approvalSuccess) {
        assert.equal(consent.getSnapshot().phase, 'completed')
        assert.equal(childWires.length, 2)
        assert.ok(JSON.stringify(events.find(event => event.type === 'tool/result')).includes('Verified the fixture.'))
        assert.ok(!JSON.stringify(childWires).includes('MUTATED_AFTER_REVIEW'))
      } else {
        const toolResult = events.find(event => event.type === 'tool/result')
        assert.ok(toolResult?.data.message.content.some(block => block.type === 'tool-result' && block.isError === true))
        assert.equal(childWires.length, scenario === 'approval-revoke-running' ? 1 : scenario === 'approval-disposal-failure' ? 2 : 0)
      }
      if (scenario.includes('revoke-')) assert.equal(consent.getSnapshot().phase, 'revoked')
      if (scenario === 'approval-disposal-failure') {
        await assert.rejects(() => consent.revoke(), /SPLIT_REVOCATION_FAILED/u)
        assert.equal(consent.getSnapshot().phase, 'failed', 'removed child does not erase disposal failure')
      } else await consent.revoke()
    } else if (scenario === 'grant-revoked-before-start') {
      const saved = ctx.tools.get(SPLIT_INSPECT_TOOL, parent)
      await revoke.revoke()
      await assert.rejects(() => saved.execute({}, { agent: parent, signal: controller.signal }), /SPLIT_REVOKED/u)
      assert.equal(childWires.length, 0)
    } else if (scenario === 'grant-revoked-running') {
      const pending = execute()
      await waitFor(() => childWires.length === 1)
      const stopped = revoke.revoke()
      assert.equal(revoke.revoke(), stopped)
      assert.ok(ctx.agents.get(children[0].id))
      await stopped
      assert.equal((await pending).isError, true)
      assert.equal(childWires.length, 1)
    } else if (scenario === 'provider-changed') {
      // Same trusted fixture object, different start identity: execution must reject it before startup.
      const original = provider.start
      provider.start = async () => { forbiddenEffects += 1; throw new Error('Must not run') }
      try { assert.match(JSON.stringify(await execute()), /SPLIT_PROVIDER_CHANGED/u) } finally { provider.start = original }
    } else if (scenario === 'success' || scenario === 'prompt-isolation') {
      parent.followup(llm.createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'PARENT_ONLY_FIXTURE: run the approved inspection.' }] }))
      await parent.whenIdle()
      const events = parent.session.snapshotEvents()
      assert.ok(JSON.stringify(events.find(event => event.type === 'tool/result')).includes('Verified the fixture.'))
      assert.ok(JSON.stringify(events.findLast(event => event.type === 'assistant/message')).includes('Parent consumed the worker result.'))
      assert.equal(parentRequests, 2)
      assert.equal(childWires.length, 2)
      assert.equal(wires.length, 4)
      if (scenario === 'prompt-isolation') assert.ok(JSON.stringify(wires[0]).includes('DEPLOYMENT_ONLY_FIXTURE'))
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
      if (['pre-cancel', 'publication-cancel', 'route-change', 'persistence-after-grant', 'context-injection'].includes(scenario)) assert.equal(childWires.length, 0)
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
    if (!['parent-dispose', 'approval-owner-disposed', 'transport-owner-disposed'].includes(scenario)) assert.equal(ctx.agents.get(parent.id), parent)
    assert.ok(lifecycle.length === 0 || JSON.stringify(lifecycle) === '["start","end"]', 'published lifecycle must pair')
    revoke()
    if (scenario === 'success' || scenario === 'prompt-isolation' || approvalSuccess) {
      assert.equal(systemRepresentations.size, 1, 'a successful child must use one observed host prompt representation')
      assert.ok(!systemRepresentations.has('missing'))
    }
    return { scenario, syntheticOnly: true, mockDispatches: wires.length, childMockDispatches: childWires.length, children: children.length, lifecyclePaired: true, childQuiescent: true, forbiddenEffects, systemRepresentations: [...systemRepresentations] }
  } finally {
    try { await ctx?.fiber.dispose() } finally {
      globalThis.fetch = prior.fetch
      globalThis.WebSocket = prior.WebSocket
      if (prior.home === undefined) delete process.env.DSH_HOME
      else process.env.DSH_HOME = prior.home
    }
  }
}
