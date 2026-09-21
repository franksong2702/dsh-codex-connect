/** Synthetic provider, real native consent/AgentLoop/compaction/JSONL. No live mode. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { zstdDecompressSync } from 'node:zlib'

const MODEL = 'gpt-6-astra'
const PROVIDER = 'openai-codex'
const ID = 'think-remember-parent'
const TOOL = 'codex_connect_set_reasoning_effort'
const SECTION = 'dsh-codex-connect/reasoning-update'
const OPAQUE = 'synthetic-think-remember-checkpoint'
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const checkpoint = session => session.deriveMessages().find(message => message.source.kind === 'plugin' && message.source.plugin === 'compact')
const updates = session => session.snapshotEvents().filter(event => event.type === 'user/message'
  && event.data.source.kind === 'plugin' && event.data.source.plugin === 'dsh-codex-connect'
  && event.data.source.form === 'snapshot' && event.data.source.sections.some(section => section.name === SECTION))
const wireUpdates = wire => wire.input.filter(item => item.type === 'configuration_update').map(item => item.reasoning.effort)
function response(items) {
  const events = items.flatMap((item, output_index) => [
    { type: 'response.output_item.added', output_index, item },
    { type: 'response.output_item.done', output_index, item },
  ])
  events.push({ type: 'response.completed', response: { id: 'resp_fixture', status: 'completed', output: items,
    usage: { input_tokens: 100, output_tokens: 30, total_tokens: 130 } } })
  return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } })
}
const textResponse = text => response([{ type: 'message', id: 'msg_fixture', role: 'assistant', status: 'completed', phase: 'final_answer',
  content: [{ type: 'output_text', text, annotations: [] }] }])

/** Writer, independent restore/downgrade, and independent final restore form one bounded sequence. */
export async function runThinkRememberPhase(phase, { root, importHost, plugin, compression = 'none', mode = 'native', scenario = 'lifecycle' }) {
  assert.ok(['write', 'resume', 'verify', 'faults'].includes(phase))
  const faultCases = ['cancel-compaction', 'pending-before-compaction', 'manual-after-compaction', 'decline', 'automatic-pressure', 'system-head-refresh']
  assert.ok(scenario === 'lifecycle' || faultCases.includes(scenario))
  if (phase === 'faults') {
    const cases = []
    for (const name of faultCases) cases.push(await runThinkRememberPhase('write', { root: join(root, name), importHost, plugin, compression, mode, scenario: name }))
    return { phase, syntheticOnly: true, cases }
  }
  assert.ok(['native', 'fallback'].includes(mode))
  const previousHome = process.env.DSH_HOME
  const previousFetch = globalThis.fetch
  process.env.DSH_HOME = join(root, 'synthetic-home')
  const wires = []
  const requestIds = new Set()
  let nextEffort = phase === 'write' ? 'high' : undefined
  let proposalCount = 0
  let questionCount = 0
  let nativeAttempts = 0
  let compacting = false
  let cancellation
  let ctx
  const errors = []
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), 'https://chatgpt.com/backend-api/codex/responses', 'refuse all non-fixture dispatch')
    const headers = new Headers(init.headers)
    const requestId = headers.get('x-client-request-id')
    assert.ok(requestId && !requestIds.has(requestId), 'every network attempt must use its own governor correlation id')
    requestIds.add(requestId)
    assert.ok(['error', 'manual'].includes(init.redirect), 'authenticated redirects stay disabled')
    const text = headers.get('content-encoding') === 'zstd' ? zstdDecompressSync(init.body).toString('utf8') : String(init.body)
    const wire = JSON.parse(text); wires.push(wire)
    assert.equal(wire.model, MODEL)
    if (!(scenario === 'decline' && compacting)) assert.equal(wire.reasoning.effort, 'low', 'canonical wire base is not silently reset by compaction')
    if (wire.input.some(item => item.type === 'compaction_trigger')) {
      nativeAttempts += 1
      if (cancellation) { cancellation.abort(new DOMException('Synthetic compaction cancellation', 'AbortError')); throw cancellation.signal.reason }
      if (mode === 'fallback') return new Response(null, { status: 400 })
      return response([{ type: 'compaction', id: 'cmp_fixture', encrypted_content: OPAQUE }])
    }
    const summaryInstruction = wire.input.at(-1)?.content?.some(part => part.type === 'input_text' && part.text.includes('Output only the checkpoint text'))
    if (compacting || summaryInstruction) return textResponse('A synthetic ordinary summary preserves task context, but cannot authorize reasoning changes.')
    if (nextEffort !== undefined) {
      const effort = nextEffort; nextEffort = undefined; proposalCount += 1
      return response([{ type: 'function_call', id: `fc_${phase}_${proposalCount}`, call_id: `call_${phase}_${proposalCount}`,
        name: TOOL, arguments: JSON.stringify({ effort, reason: 'Use the selected effort for the next bounded fixture phase.' }), status: 'completed' }])
    }
    return textResponse('Synthetic investigation and supporting evidence. '.repeat(700))
  }
  try {
    await mkdir(root, { recursive: true })
    const names = ['@deepseek-ai/cordis', '@deepseek-ai/dsh-llm', '@deepseek-ai/dsh-session',
      '@deepseek-ai/dsh-session-projection', '@deepseek-ai/dsh-system-prompt', '@deepseek-ai/dsh-tools',
      '@deepseek-ai/dsh-agent', '@deepseek-ai/dsh-agent-loop', '@deepseek-ai/dsh-token-meter',
      '@deepseek-ai/dsh-compaction-basic', '@deepseek-ai/dsh-session-persistence-jsonl', '@deepseek-ai/dsh-user-questions']
    const [{ Context }, llm, sessions, projections, system, tools, agents, loop, meter, compaction, persistence, questions] = await Promise.all(names.map(importHost))
    const store = new plugin.OpenAICodexCredentialStore()
    const encoded = value => Buffer.from(JSON.stringify(value)).toString('base64url')
    await store.modify(PROVIDER, async () => ({ type: 'oauth', accountId: 'synthetic-account',
      access: `${encoded({ alg: 'none' })}.${encoded({ 'https://api.openai.com/auth': { chatgpt_account_id: 'synthetic-account' } })}.synthetic`,
      refresh: 'synthetic-refresh', expires: Date.now() + 3600000 }))
    ctx = new Context()
    ctx.on('agent/error', event => { errors.push(String(event.error?.stack ?? event.error ?? event)) })
    for (const mod of [llm, sessions, projections, system, tools, agents, questions]) await ctx.plugin(mod.default)
    await ctx.plugin(loop.default, { agents: [] })
    await ctx.plugin(meter.default)
    await ctx.plugin(persistence.default, { root: join(root, 'sessions'), compression, packChunks: true })
    await ctx.plugin(compaction.default, { auto: scenario === 'automatic-pressure', thresholdRatio: 0.5, retainTokens: 0 })
    let feature = await ctx.plugin(plugin, { enableNativeCompaction: phase !== 'verify', enableReasoningUpdates: phase === 'write',
      ...(scenario === 'automatic-pressure' ? { contextWindowOverrides: { [MODEL]: 30000 } } : {}) })
    ctx.on('user-questions/request', async request => {
      questionCount += 1
      assert.equal(request.questions.length, 1)
      const q = request.questions[0]
      return { answers: [{ id: q.id, selected: [q.options[scenario === 'decline' ? 1 : 0].label] }] }
    })
    const selection = { provider: PROVIDER, model: MODEL, reasoningEffort: llm.ReasoningEffortId('low') }
    const handle = phase === 'write'
      ? await ctx.agents.create({ sessionId: sessions.SessionId(ID), agentOptions: selection })
      : await ctx.agents.resume({ resumeSessionId: sessions.SessionId(ID), agentOptions: selection })
    const agent = handle.agent
    const send = async text => {
      const seq = agent.session.seq
      agent.followup(llm.createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text }] }))
      await agent.whenIdle(); await ctx.sessions.flush(agent.session)
      const tail = agent.session.snapshotEvents().filter(event => event.seq >= seq)
      assert.ok(tail.some(event => event.type === 'assistant/message'), `new turn must complete: ${JSON.stringify({ errors, finish: tail.filter(event => ['request/finish', 'turn/end'].includes(event.type)) })}`)
      assert.equal(tail.filter(event => event.type === 'request/error').length, 0)
    }
    const compact = async () => {
      compacting = true
      const before = nativeAttempts
      try { assert.ok(await ctx.compaction.compactNow(agent, new AbortController().signal), 'real compaction must commit') }
      finally { compacting = false }
      assert.equal(nativeAttempts - before, 1, 'one bounded native attempt, optional ordinary fallback')
      await ctx.sessions.flush(agent.session)
      assert.ok(checkpoint(agent.session))
    }
    if (phase === 'write') {
      await send('Investigate the first synthetic task.')
      assert.equal(questionCount, 1); assert.equal(updates(agent.session).length, scenario === 'decline' ? 0 : 1)
      assert.equal(agent.session.requestHeader().config.reasoningEffort, scenario === 'decline' ? 'low' : 'high')
      await send('Continue with enough historical analysis for prefix compaction.')
      if (scenario === 'automatic-pressure') {
        await send('Continue until the ordinary host pressure trigger compacts the prefix.')
        assert.ok(nativeAttempts >= 1, 'host pressure hook must trigger a real native attempt')
        assert.ok(agent.session.surface.replaceGeneration >= 1)
        assert.equal(agent.session.requestHeader().config.reasoningEffort, 'high')
        assert.deepEqual(wireUpdates(wires.at(-1)), ['high'])
        assert.equal(questionCount, 1)
        return { phase, scenario, syntheticOnly: true, automaticPressure: true }
      }
      if (scenario === 'cancel-compaction') {
        const before = wires.length
        cancellation = new AbortController(); compacting = true
        await assert.rejects(ctx.compaction.compactNow(agent, cancellation.signal))
        compacting = false; cancellation = undefined
        assert.equal(wires.length - before, 1, 'cancellation must not dispatch summary fallback')
        assert.equal(agent.session.surface.replaceGeneration, 0)
        assert.equal(checkpoint(agent.session), undefined)
        await send('Continue after cancelled compaction.')
        assert.deepEqual(wireUpdates(wires.at(-1)), ['high'])
        return { phase, scenario, syntheticOnly: true, cancellationNoFallback: true }
      }
      if (scenario === 'pending-before-compaction') {
        const result = await ctx.tools.execute({ name: TOOL, callId: 'call_pending_fixture',
          arguments: { effort: 'max', reason: 'An approved but not yet admitted fixture change.' }, agent, signal: new AbortController().signal })
        assert.notEqual(result.isError, true)
        assert.equal(questionCount, 2); assert.equal(updates(agent.session).length, 1)
      }
      await compact()
      assert.equal(agent.session.surface.replaceGeneration, 1)
      assert.equal(agent.session.deriveMessages().filter(message => updates(agent.session).some(event => event.data.id === message.id)).length, 0,
        'admitted notice must really be hidden by the checkpoint')
      if (scenario === 'system-head-refresh') {
        const hasSystemHead = agent.session.snapshotEvents().some(event => event.type === 'system/message')
        agent.ctx.systemPrompt.section({ name: 'fixture:system-refresh', order: 100, text: 'Continue the synthetic task under an updated host-owned system instruction.' })
        await send('Continue after the host system instruction changes.')
        assert.equal(agent.session.requestHeader().config.reasoningEffort, 'high')
        assert.deepEqual(wireUpdates(wires.at(-1)), ['high'])
        const rewrites = agent.session.snapshotEvents().filter(event => event.type === 'system/message' && event.surfaceOp && event.surfaceOp !== 'append').length
        if (hasSystemHead) assert.ok(rewrites >= 1, 'newer hosts must exercise a real protected system-head rewrite')
        return { phase, scenario, syntheticOnly: true, systemHeadRewrites: rewrites }
      }
      if (scenario === 'manual-after-compaction') {
        agent.session.append('model/selection', { provider: PROVIDER, model: MODEL, reasoningEffort: llm.ReasoningEffortId('low') })
        await send('Honor the manual lower effort after compaction.')
        assert.equal(agent.session.requestHeader().config.reasoningEffort, 'low')
        assert.deepEqual(wireUpdates(wires.at(-1)), ['high', 'low'])
        return { phase, scenario, syntheticOnly: true, manualPriority: true }
      }
      if (scenario === 'pending-before-compaction' || scenario === 'decline') {
        await send('Continue without admitting the obsolete or declined proposal.')
        assert.equal(updates(agent.session).length, scenario === 'decline' ? 0 : 1)
        assert.equal(agent.session.requestHeader().config.reasoningEffort, scenario === 'decline' ? 'low' : 'high')
        assert.deepEqual(wireUpdates(wires.at(-1)), scenario === 'decline' ? [] : ['high'])
        return { phase, scenario, syntheticOnly: true, unadmittedChangeExcluded: true }
      }
      await writeFile(join(root, 'expected.json'), JSON.stringify({ checkpoint: digest(checkpoint(agent.session)), eventCount: agent.session.snapshotEvents().length, events: digest(agent.session.snapshotEvents()) }))
      return { phase, syntheticOnly: true, realConsentService: true, realTransaction: true, admittedEffort: 'high', nativeAttempts, questionCount, requests: wires.length }
    }
    const expected = JSON.parse(await readFile(join(root, 'expected.json'), 'utf8'))
    assert.equal(digest(checkpoint(agent.session)), expected.checkpoint)
    assert.equal(digest(agent.session.snapshotEvents().slice(0, expected.eventCount)), expected.events, 'restore may append lifecycle events but must not rewrite the stored journal prefix')
    assert.equal(ctx.tools.get(TOOL), undefined, 'restored state remains readable with new proposals disabled')
    await send('Continue after a fresh runtime restores the same journal.')
    assert.deepEqual(wireUpdates(wires.at(-1)), [phase === 'resume' ? 'high' : 'medium'])
    assert.equal(agent.session.requestHeader().config.reasoningEffort, phase === 'resume' ? 'high' : 'medium')
    if (mode === 'native') assert.equal(wires.at(-1).input.filter(item => item.type === 'compaction').length, 1)
    if (phase === 'resume') {
      await feature.dispose()
      feature = await ctx.plugin(plugin, { enableNativeCompaction: true, enableReasoningUpdates: true })
      nextEffort = 'medium'
      await send('The difficult phase is done; propose a decrease for the next phase.')
      assert.equal(questionCount, 1)
      assert.equal(agent.session.requestHeader().config.reasoningEffort, 'medium')
      assert.deepEqual(wireUpdates(wires.at(-1)), ['high', 'medium'])
      assert.equal(updates(agent.session).length, 2)
      await send('Finish the next phase before another prefix compaction.')
      await compact()
      assert.equal(agent.session.surface.replaceGeneration, 2)
      await writeFile(join(root, 'expected.json'), JSON.stringify({ checkpoint: digest(checkpoint(agent.session)), eventCount: agent.session.snapshotEvents().length, events: digest(agent.session.snapshotEvents()) }))
    }
    return { phase, syntheticOnly: true, restoredWithProposalsDisabled: true, admittedEffort: phase === 'resume' ? 'medium' : 'medium',
      nativeAttempts, questionCount, requests: wires.length, journalStateReconstructed: true,
      systemHeadRewrites: agent.session.snapshotEvents().filter(event => event.type === 'system/message' && event.surfaceOp && event.surfaceOp !== 'append').length }
  } finally {
    try { await ctx?.fiber.dispose() } finally {
      globalThis.fetch = previousFetch
      if (previousHome === undefined) delete process.env.DSH_HOME
      else process.env.DSH_HOME = previousHome
    }
  }
}
