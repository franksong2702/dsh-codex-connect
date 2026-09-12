/** Offline acceptance through actual AgentLoop pre-step and request-error events. */
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { readdir } from 'node:fs/promises'
import { zstdDecompressSync } from 'node:zlib'

const PROVIDER = 'openai-codex'
const MODEL = 'gpt-5.6-luna'
export const AUTOMATIC_SCENARIOS = ['pressure', 'below-threshold', 'auto-disabled', 'overflow', 'other-error', 'overflow-bounded', 'overflow-no-progress', 'repeated-pressure', 'unshrinkable-tail']
const checkpoint = session => session.deriveMessages().find(message => message.source.kind === 'plugin' && message.source.plugin === 'compact')
const text = value => ({ type: 'message', id: 'msg_automatic', role: 'assistant', phase: 'final_answer', status: 'completed', content: [{ type: 'output_text', text: value, annotations: [] }] })
function sse(item) {
  const events = [
    { type: 'response.output_item.added', output_index: 0, item },
    { type: 'response.output_item.done', output_index: 0, item },
    { type: 'response.completed', response: { id: 'resp_automatic', status: 'completed', model: MODEL, output: [item], usage: { input_tokens: 100, output_tokens: item.type === 'compaction' ? 20 : 1000, total_tokens: item.type === 'compaction' ? 120 : 1100 } } },
  ]
  return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } })
}
const rejection = overflow => new Response(JSON.stringify({ error: { code: overflow ? 'context_length_exceeded' : 'invalid_request_error', message: overflow ? 'Your input exceeds the context window of this model.' : 'Unrelated invalid request.' } }), { status: 400 })

/** All network and credentials are synthetic; host components are unmodified. */
export async function runNativeAutomaticScenario(scenario, { root, importHost, plugin, compression = 'none' }) {
  assert.ok(AUTOMATIC_SCENARIOS.includes(scenario))
  const priorHome = process.env.DSH_HOME
  const priorFetch = globalThis.fetch
  process.env.DSH_HOME = join(root, scenario, 'synthetic-home')
  const wires = []
  const failures = []
  let nativeCount = 0
  let ordinaryCount = 0
  let phase = 'history'
  let ctx
  const pressure = ['pressure', 'below-threshold', 'auto-disabled', 'repeated-pressure', 'unshrinkable-tail'].includes(scenario)
  const capacity = pressure ? 8192 : 200000
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), 'https://chatgpt.com/backend-api/codex/responses')
    assert.equal(init.method, 'POST')
    const raw = new Headers(init.headers).get('content-encoding') === 'zstd' ? zstdDecompressSync(init.body).toString('utf8') : String(init.body)
    const body = JSON.parse(raw)
    assert.equal(body.model, MODEL)
    assert.ok(wires.length < 8, 'automatic recovery must be bounded')
    wires.push(body)
    if (body.input.some(item => item.type === 'compaction_trigger')) {
      nativeCount += 1
      if (scenario === 'overflow-no-progress') return rejection(false)
      return sse({ type: 'compaction', id: `cmp_automatic_${nativeCount}`, encrypted_content: `synthetic-automatic-${nativeCount}` })
    }
    ordinaryCount += 1
    if (phase !== 'history' && !pressure) {
      if (scenario === 'other-error' || scenario === 'overflow-no-progress') return rejection(scenario !== 'other-error')
      if (scenario === 'overflow-bounded' || ordinaryCount === 3) return rejection(true)
    }
    const long = scenario !== 'below-threshold' && (phase === 'history' || scenario === 'repeated-pressure')
    return sse(text(long ? 'Synthetic historical reasoning and decisions. '.repeat(scenario === 'unshrinkable-tail' ? 1200 : 400) : 'Continued after automatic acceptance.'))
  }
  try {
    const modules = await Promise.all([
      '@deepseek-ai/cordis', '@deepseek-ai/dsh-llm', '@deepseek-ai/dsh-session',
      '@deepseek-ai/dsh-session-projection', '@deepseek-ai/dsh-system-prompt', '@deepseek-ai/dsh-tools',
      '@deepseek-ai/dsh-agent', '@deepseek-ai/dsh-agent-loop', '@deepseek-ai/dsh-token-meter',
      '@deepseek-ai/dsh-compaction-basic', '@deepseek-ai/dsh-session-persistence-jsonl',
    ].map(importHost))
    const [{ Context }, llm, sessions, projections, system, tools, agents, loop, meter, compaction, persistence] = modules
    const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url')
    const store = new plugin.OpenAICodexCredentialStore()
    await store.modify(PROVIDER, async () => ({ type: 'oauth', access: `${encode({ alg: 'none' })}.${encode({ 'https://api.openai.com/auth': { chatgpt_account_id: 'synthetic-automatic' } })}.synthetic`, refresh: 'synthetic-only', accountId: 'synthetic-automatic', expires: Date.now() + 3600000 }))
    ctx = new Context()
    for (const module of [llm, sessions, projections, system, tools, agents]) await ctx.plugin(module.default)
    await ctx.plugin(loop.default, { agents: [] })
    await ctx.plugin(meter.default)
    await ctx.plugin(persistence.default, { root: join(root, scenario, 'sessions'), compression, packChunks: true })
    ctx.on('agent/request-error', async ({ failure }, next) => { failures.push(failure.code); return next() })
    await ctx.plugin(compaction.default, { auto: scenario !== 'auto-disabled', thresholdRatio: 0.8, retainTokens: 0, compactionRetries: 0, maxOverflowRetries: 1 })
    await ctx.plugin(plugin, { enableNativeCompaction: true, contextWindowOverrides: { [MODEL]: capacity } })
    const { agent } = await ctx.agents.create({ sessionId: sessions.SessionId(`automatic-${scenario}`), agentOptions: { provider: PROVIDER, model: MODEL, reasoningEffort: llm.ReasoningEffortId('low') } })
    const send = async value => {
      agent.followup(llm.createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: value }] }))
      await agent.whenIdle()
      await ctx.sessions.flush(agent.session)
    }
    await send('Preserve the historical decisions.')
    if (scenario !== 'unshrinkable-tail') await send('Record the next historical decision.')
    const historyRequests = scenario === 'unshrinkable-tail' ? 1 : 2
    assert.equal(wires.length, historyRequests)
    assert.equal(nativeCount, 0)
    const measured = ctx.tokenMeter.measure(agent.session).totalTokens
    if (pressure && scenario !== 'below-threshold') assert.ok(measured >= capacity * 0.8, 'real meter must see pressure before the next step')
    else assert.ok(measured < capacity * 0.8, 'overflow/below-threshold cases must not be pressure-triggered')
    const continuationBoundary = agent.session.snapshotEvents().length
    const originalSurface = [...agent.session.surface.nodes]
    phase = 'continue'
    await send('Continue the work.')
    if (scenario === 'repeated-pressure') await send('Continue through a second automatic compaction.')
    const expectedNative = ['below-threshold', 'auto-disabled', 'other-error'].includes(scenario) ? 0 : scenario === 'repeated-pressure' ? 2 : 1
    assert.equal(nativeCount, expectedNative)
    const success = ['pressure', 'overflow', 'repeated-pressure'].includes(scenario)
    const replaced = success || scenario === 'overflow-bounded'
    assert.equal(agent.session.surface.replaceGeneration, replaced ? expectedNative : 0)
    if (replaced) {
      assert.ok(checkpoint(agent.session), 'automatic transaction must create a real checkpoint')
      const finalInput = wires.at(-1).input
      assert.equal(finalInput.filter(item => item.type === 'compaction').length, 1)
      assert.equal(finalInput.find(item => item.type === 'compaction').encrypted_content, `synthetic-automatic-${expectedNative}`)
      assert.ok(!JSON.stringify(finalInput).includes('dsh-codex-connect-native-checkpoint:'))
    }
    if (success) {
      const last = agent.session.snapshotEvents().findLast(event => event.type === 'assistant/message')
      assert.ok(last && last.seq >= continuationBoundary && last.data.message.content.some(block => block.type === 'text'), 'automatic flow must complete a new assistant message after the historical prefix')
      assert.equal(ordinaryCount, historyRequests + (scenario === 'overflow' || scenario === 'repeated-pressure' ? 2 : 1))
    }
    if (scenario === 'repeated-pressure') {
      const nativeWires = wires.filter(wire => wire.input.some(item => item.type === 'compaction_trigger'))
      assert.equal(nativeWires[1].input.filter(item => item.type === 'compaction').length, 1)
      assert.equal(nativeWires[1].input.find(item => item.type === 'compaction').encrypted_content, 'synthetic-automatic-1')
    }
    if (scenario.startsWith('overflow')) {
      assert.ok(failures.includes(llm.CONTEXT_WINDOW_EXCEEDED_CODE), 'real adapter must classify a provider context overflow')
      assert.equal(ordinaryCount, historyRequests + 2, 'exactly one recovery or summary attempt; never loop after a failed recovery')
    }
    if (scenario === 'other-error') { assert.equal(ordinaryCount, historyRequests + 1); assert.ok(!failures.includes(llm.CONTEXT_WINDOW_EXCEEDED_CODE)) }
    if (scenario === 'unshrinkable-tail') {
      assert.equal(checkpoint(agent.session), undefined)
      assert.equal(ordinaryCount, 2)
      assert.match(JSON.stringify(agent.session.snapshotEvents().filter(event => event.type === 'compaction/end')), /summary is not smaller/u)
    }
    const events = agent.session.snapshotEvents()
    const lastTurn = events.findLast(event => event.type === 'turn/end')
    const failedTurn = ['other-error', 'overflow-bounded', 'overflow-no-progress'].includes(scenario)
    assert.ok(lastTurn && lastTurn.seq >= continuationBoundary, 'continuation must finish a new turn')
    assert.equal(lastTurn.data.reason.kind, failedTurn ? 'error' : 'completed')
    if (!replaced) assert.ok(originalSurface.every(seq => agent.session.surface.nodes.includes(seq)), 'no-progress and no-trigger paths must preserve the original surface')
    const starts = events.filter(event => event.type === 'compaction/start')
    const ends = events.filter(event => event.type === 'compaction/end')
    assert.equal(starts.length, expectedNative)
    assert.equal(ends.length, expectedNative)
    assert.deepEqual(ends.map(event => event.data.compactionId), starts.map(event => event.data.compactionId))
    const files = await readdir(join(root, scenario, 'sessions'), { recursive: true })
    assert.ok(files.some(file => /\.jsonl(?:\.zstd)?$/u.test(file)), 'the real JSONL writer must persist the session')
    // Checkpoint contents are fixture-only. Keep output restricted to measured control-flow facts.
    return { scenario, syntheticOnly: true, trigger: pressure ? 'agent/pre-step' : 'agent/request-error', nativeRequests: nativeCount, ordinaryRequests: ordinaryCount, surfaceReplacements: agent.session.surface.replaceGeneration, failureCodes: failures, measuredTokensBefore: measured }
  } finally {
    try { await ctx?.fiber.dispose() } finally {
      globalThis.fetch = priorFetch
      if (priorHome === undefined) delete process.env.DSH_HOME
      else process.env.DSH_HOME = priorHome
    }
  }
}
