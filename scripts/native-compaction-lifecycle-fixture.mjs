/** Offline lifecycle fixture shared by source tests and fresh-process installed-host checks. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { zstdDecompressSync } from 'node:zlib'

const PROVIDER = 'openai-codex'
const MODEL = 'gpt-6-astra'
const PARENT = 'native-lifecycle-parent'
const CHILD = 'native-lifecycle-child'
const OPAQUE = 'synthetic-encrypted-native-lifecycle'
const REASONING = 'synthetic-encrypted-reasoning-after-compaction'
const MARKER = 'dsh-codex-connect-native-compaction-v1'
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const nativeItems = wire => wire.input.filter(item => item.type === 'compaction')
const checkpoint = session => session.deriveMessages().find(message => message.source.kind === 'plugin' && message.source.plugin === 'compact')

function response(items, text, terminalStatus = 'completed') {
  const events = items.flatMap((item, output_index) => [
    { type: 'response.output_item.added', output_index, item: text === undefined ? item : { ...item, content: [] } },
    ...(text === undefined ? [] : [{ type: 'response.output_text.delta', output_index, content_index: 0, item_id: item.id, delta: text }]),
    { type: 'response.output_item.done', output_index, item },
  ])
  events.push({ type: 'response.completed', response: { id: 'resp_lifecycle', status: terminalStatus, output: items, usage: { input_tokens: 1000, output_tokens: 20, total_tokens: 1020 } } })
  return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } })
}

function textResponse(text) {
  return response([{ type: 'message', id: 'msg_lifecycle', role: 'assistant', phase: 'final_answer', status: 'completed', content: [{ type: 'output_text', text, annotations: [] }] }], text)
}

function wireBody(init) {
  const body = new Headers(init.headers).get('content-encoding') === 'zstd'
    ? zstdDecompressSync(init.body).toString('utf8') : String(init.body)
  return JSON.parse(body)
}

/** DSH appends independent Zstandard frames; one synchronous decode consumes only one frame. */
function decodeStoredFrames(bytes) {
  const frames = []
  let offset = 0
  while (offset < bytes.length) {
    const decoded = zstdDecompressSync(bytes.subarray(offset), { info: true })
    const consumed = decoded.engine.bytesWritten
    assert.ok(Number.isSafeInteger(consumed) && consumed > 0 && consumed <= bytes.length - offset)
    frames.push(decoded.buffer)
    offset += consumed
  }
  return Buffer.concat(frames)
}

/** Read only this disposable fixture's physical files, independent of changing storage service APIs. */
async function readPhysicalSession(storageRoot, id) {
  const matches = []
  const visit = async directory => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) await visit(path)
      else if (entry.isFile() && /\.jsonl(?:\.zstd)?$/u.test(entry.name)) {
        const bytes = await readFile(path)
        const content = (entry.name.endsWith('.zstd') ? decodeStoredFrames(bytes) : bytes).toString('utf8')
        const header = JSON.parse(content.slice(0, content.indexOf('\n')))
        if (header.type === 'session' && header.id === id) {
          matches.push({ content, physicalDigest: createHash('sha256').update(bytes).digest('hex') })
        }
      }
    }
  }
  await visit(storageRoot)
  // These tests create current-format sessions, not cross-version migrations with multiple generations.
  assert.equal(matches.length, 1, 'exactly one physical current-session artifact must exist')
  return matches[0]
}

/** Run one phase without using a live account, network, or a production session directory. */
export async function runNativeLifecyclePhase(phase, { root, importHost, plugin, compression = 'zstd' }) {
  assert.ok(['write', 'resume-fork', 'verify-child', 'failure-paths'].includes(phase))
  const priorHome = process.env.DSH_HOME
  const priorFetch = globalThis.fetch
  process.env.DSH_HOME = join(root, 'synthetic-home')
  const wires = []
  const readRaw = id => readPhysicalSession(join(root, 'sessions'), id)
  let mode = phase === 'write' ? 'long' : 'tool'
  let toolExecuted = 0
  let ordinaryRequests = 0
  let cancellation
  const cancelReason = new Error('Synthetic native compaction cancellation')
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), 'https://chatgpt.com/backend-api/codex/responses', 'offline fixture refuses all other network routes')
    assert.equal(init.method, 'POST')
    const wire = wireBody(init)
    wires.push(wire)
    if (wire.input.some(item => item.type === 'compaction_trigger')) {
      if (mode === 'http-reject') return new Response(null, { status: 400 })
      if (mode === 'truncated') return new Response(`data: ${JSON.stringify({ type: 'response.output_item.done', item: { type: 'compaction', encrypted_content: OPAQUE } })}\n\n`)
      if (mode === 'empty-native') return response([{ type: 'compaction', encrypted_content: '' }])
      if (mode === 'incomplete-terminal') return response([{ type: 'compaction', encrypted_content: OPAQUE }], undefined, 'incomplete')
      if (mode === 'oversized-checkpoint') return response([{ type: 'compaction', encrypted_content: 'x'.repeat(2 * 1024 * 1024 + 1) }])
      if (mode === 'oversized-stream') return new Response('x'.repeat(8 * 1024 * 1024 + 1))
      if (mode === 'caller-cancel') { cancellation.abort(cancelReason); throw cancelReason }
      return response([{ type: 'compaction', id: 'cmp_lifecycle', encrypted_content: OPAQUE }])
    }
    ordinaryRequests += 1
    if (mode === 'long') return textResponse('Synthetic historical analysis. '.repeat(1000))
    if (mode === 'text') return textResponse('Parent-only continuation.')
    if (phase === 'failure-paths') return textResponse('Synthetic ordinary fallback summary.')
    if (ordinaryRequests === 1) {
      return response([
        { type: 'reasoning', id: 'rs_lifecycle', encrypted_content: REASONING, summary: [] },
        { type: 'function_call', id: `fc_lifecycle_${phase}`, call_id: `call_lifecycle_${phase}`, name: 'lifecycle_lookup', arguments: '{}', status: 'completed' },
      ])
    }
    return textResponse('Tool result received.')
  }
  let ctx
  try {
    const modules = await Promise.all([
      '@deepseek-ai/cordis', '@deepseek-ai/dsh-llm', '@deepseek-ai/dsh-session',
      '@deepseek-ai/dsh-session-projection', '@deepseek-ai/dsh-system-prompt', '@deepseek-ai/dsh-tools',
      '@deepseek-ai/dsh-agent', '@deepseek-ai/dsh-agent-loop', '@deepseek-ai/dsh-token-meter',
      '@deepseek-ai/dsh-compaction-basic', '@deepseek-ai/dsh-session-persistence-jsonl',
    ].map(importHost))
    const [{ Context }, llm, sessions, projections, system, tools, agents, loop, meter, compaction, persistence] = modules
    const credential = new plugin.OpenAICodexCredentialStore()
    const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url')
    await credential.modify(PROVIDER, async () => ({
      type: 'oauth', access: `${encode({ alg: 'none' })}.${encode({ 'https://api.openai.com/auth': { chatgpt_account_id: 'synthetic-account' } })}.synthetic`,
      refresh: 'synthetic-refresh', accountId: 'synthetic-account', expires: Date.now() + 3_600_000,
    }))
    ctx = new Context()
    for (const module of [llm, sessions, projections, system, tools, agents]) await ctx.plugin(module.default)
    await ctx.plugin(loop.default, { agents: [] })
    await ctx.plugin(meter.default)
    await ctx.plugin(persistence.default, { root: join(root, 'sessions'), compression, packChunks: true })
    await ctx.plugin(compaction.default, { auto: false })
    await ctx.plugin(plugin, { enableNativeCompaction: phase === 'write' || phase === 'failure-paths' })
    ctx.tools.register({
      name: 'lifecycle_lookup', description: 'Return a synthetic value without side effects',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
      output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
      execute: async () => { toolExecuted += 1; return 'synthetic-tool-result-17' },
    })
    const selection = { provider: PROVIDER, model: MODEL, reasoningEffort: llm.ReasoningEffortId('high') }
    const send = async (agent, text) => {
      const beforeSeq = agent.session.snapshotEvents().length
      agent.followup(llm.createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text }] }))
      await agent.whenIdle()
      await ctx.sessions.flush(agent.session)
      const last = agent.session.snapshotEvents().findLast(event => event.type === 'assistant/message')
      assert.ok(last && last.seq >= beforeSeq, 'agent must finish a new real model-backed step')
    }
    if (phase === 'write') {
      const { agent } = await ctx.agents.create({ sessionId: sessions.SessionId(PARENT), agentOptions: selection })
      await send(agent, 'Investigate synthetic fixture A.')
      await send(agent, 'Keep the decision and unresolved work.')
      const before = [...agent.session.surface.nodes]
      const result = await ctx.compaction.compactNow(agent, new AbortController().signal)
      assert.ok(result, 'manual compaction must commit rather than no-op')
      const native = checkpoint(agent.session)
      assert.ok(native && JSON.stringify(native.content).includes(MARKER))
      assert.notDeepEqual(agent.session.surface.nodes, before)
      assert.equal(agent.session.surface.replaceGeneration, 1)
      const log = agent.session.snapshotEvents()
      assert.deepEqual(log.filter(event => event.type.startsWith('compaction/')).map(event => event.type), ['compaction/start', 'compaction/summary', 'compaction/end'])
      const replacement = log.find(event => event.type === 'user/message' && event.data.id === native.id)
      assert.equal(replacement.surfaceOp.op, 'replace')
      assert.equal(replacement.data.source.compactionId, result.compactionId)
      for (const seq of result.shadowedSeqs) assert.ok(replacement.sourceEventSeqs.includes(seq))
      assert.ok(wires.at(-1).tools.some(tool => tool.name === 'lifecycle_lookup'))
      assert.equal(wires.at(-1).model, MODEL)
      const raw = await readRaw(agent.id)
      assert.ok(raw.content.includes(MARKER), 'checkpoint must exist in the physical JSONL artifact')
      assert.ok(!raw.content.includes('synthetic-refresh'), 'fixture credentials must not be persisted in session history')
      const state = { checkpointDigest: digest(native), surface: [...agent.session.surface.nodes], parentEvents: digest(log) }
      await writeFile(join(root, 'expected.json'), JSON.stringify(state))
      return { phase, realTransaction: true, physicalCheckpoint: true, checkpointEstimatedTokens: ctx.tokenMeter.estimateMessage(native), shadowedEstimatedTokens: result.shadowedTokenCount }
    }
    if (phase === 'failure-paths') {
      const cases = ['http-reject', 'truncated', 'empty-native', 'incomplete-terminal', 'oversized-checkpoint', 'oversized-stream', 'caller-cancel']
      for (const name of cases) {
        const handle = await ctx.agents.create({ sessionId: sessions.SessionId(`native-failure-${name}`), agentOptions: selection })
        const { agent } = handle
        mode = 'long'
        await send(agent, 'Synthetic history for failure recovery.')
        await send(agent, 'Retain the original task.')
        const before = [...agent.session.surface.nodes]
        const boundary = agent.session.snapshotEvents().length
        const dispatches = wires.length
        mode = name
        cancellation = new AbortController()
        const pending = ctx.compaction.compactNow(agent, cancellation.signal)
        if (name === 'caller-cancel') {
          await assert.rejects(pending, error => error === cancelReason)
          assert.deepEqual([...agent.session.surface.nodes], before)
          assert.equal(agent.session.surface.replaceGeneration, 0)
          assert.equal(wires.length - dispatches, 1, 'cancellation must not dispatch a fallback')
        } else {
          assert.ok(await pending)
          assert.equal(agent.session.surface.replaceGeneration, 1)
          assert.ok(!JSON.stringify(checkpoint(agent.session)).includes(MARKER), `${name} must commit only the fallback summary`)
          assert.equal(wires.length - dispatches, 2, 'one native attempt and one summary fallback')
        }
        await ctx.sessions.flush(agent.session)
        const tail = agent.session.snapshotEvents().slice(boundary)
        assert.deepEqual(tail.filter(event => event.type.startsWith('compaction/')).map(event => event.type),
          name === 'caller-cancel' ? ['compaction/start', 'compaction/end'] : ['compaction/start', 'compaction/summary', 'compaction/end'])
        const raw = await readRaw(agent.id)
        assert.ok(!raw.content.includes(MARKER), 'failed/cancelled native bytes must never reach durable history')
        await handle.dispose()
        const resumed = await ctx.agents.resume({ resumeSessionId: agent.id, agentOptions: selection })
        const restoredCheckpoint = checkpoint(resumed.agent.session)
        if (name === 'caller-cancel') assert.equal(restoredCheckpoint, undefined)
        else {
          assert.ok(restoredCheckpoint)
          assert.ok(!JSON.stringify(restoredCheckpoint).includes(MARKER))
        }
        mode = 'text'
        await send(resumed.agent, 'Continue after failed or cancelled compaction.')
        await resumed.dispose()
      }
      return { phase, fallbackAndCancellationVerified: true, cases }
    }
    const expected = JSON.parse(await readFile(join(root, 'expected.json'), 'utf8'))
    const id = sessions.SessionId(phase === 'resume-fork' ? PARENT : CHILD)
    assert.equal(ctx.sessions.get(id), undefined, 'phase starts without a live session')
    const { agent } = await ctx.agents.resume({ resumeSessionId: id, agentOptions: selection })
    assert.equal(digest(checkpoint(agent.session)), expected.checkpointDigest, 'native checkpoint survives physical storage and fresh runtime')
    assert.deepEqual([...agent.session.surface.nodes], phase === 'resume-fork' ? expected.surface : expected.childSurface)
    await send(agent, phase === 'resume-fork' ? 'Continue after restart; call the fixture tool.' : 'Continue child independently; call the fixture tool.')
    assert.equal(toolExecuted, 1)
    assert.equal(ordinaryRequests, 2, 'one tool request followed by one completion')
    for (const wire of wires) {
      assert.deepEqual(nativeItems(wire), [{ type: 'compaction', id: 'cmp_lifecycle', encrypted_content: OPAQUE }])
      assert.equal(wire.model, MODEL)
      assert.equal(wire.reasoning.effort, 'high')
      assert.equal(wire.prompt_cache_key, id)
      assert.ok(!JSON.stringify(wire.input).includes(MARKER))
      assert.ok(!JSON.stringify(wire.input).includes('native-checkpoint:'))
    }
    const second = wires[1].input
    assert.ok(second.some(item => item.type === 'reasoning' && item.encrypted_content === REASONING))
    const call = second.findLast(item => item.type === 'function_call')
    const output = second.findLast(item => item.type === 'function_call_output')
    assert.ok(call && output)
    assert.equal(output.call_id, call.call_id)
    assert.equal(call.call_id, `call_lifecycle_${phase}`)
    assert.ok(JSON.stringify(output).includes('synthetic-tool-result-17'))
    if (phase === 'resume-fork') {
      const seed = agent.session.snapshotEvents()
      const lastStart = seed.findLast(event => event.type === 'turn/start')
      const lastEnd = seed.findLast(event => event.type === 'turn/end')
      assert.ok(lastStart && lastEnd && lastEnd.seq > lastStart.seq, 'fork only a completed-turn prefix')
      // A live Session alone does not own a writer on handle-based hosts. Use the public factory.
      const childHandle = await ctx.agents.create({
        sessionId: sessions.SessionId(CHILD), seed,
        inheritedEventCount: sessions.SessionLogOffset(seed.length),
        meta: { parentSession: agent.id, isSeeded: true },
        agentOptions: selection,
      })
      const child = childHandle.agent.session
      assert.deepEqual(child.snapshotEvents().slice(0, seed.length), seed)
      await ctx.sessions.flush(child)
      assert.equal(child.header.parentSession, agent.id)
      assert.ok(child.inheritedEventCount > 0)
      const childRawBefore = await readRaw(child.id)
      expected.childSurface = [...child.surface.nodes]
      expected.inheritedEventCount = child.inheritedEventCount
      expected.childPrefix = digest(child.snapshotEvents().slice(0, child.inheritedEventCount))
      mode = 'text'
      await send(agent, 'Parent branch gets separate work after fork.')
      assert.equal((await readRaw(child.id)).physicalDigest, childRawBefore.physicalDigest, 'parent writes must not mutate child storage')
      expected.parentRawDigest = (await readRaw(agent.id)).physicalDigest
      await writeFile(join(root, 'expected.json'), JSON.stringify(expected))
      return { phase, resumedWithCreationDisabled: true, toolRoundTrip: true, reasoningReplay: true, forkPersisted: true, parentChildIsolated: true }
    }
    assert.equal(agent.session.header.parentSession, PARENT)
    assert.equal(agent.session.inheritedEventCount, expected.inheritedEventCount)
    assert.equal(digest(agent.session.snapshotEvents().slice(0, agent.session.inheritedEventCount)), expected.childPrefix)
    assert.equal((await readRaw(PARENT)).physicalDigest, expected.parentRawDigest, 'child writes must not mutate parent storage')
    return { phase, childResumed: true, childToolRoundTrip: true, parentUnchanged: true }
  } finally {
    try { await ctx?.fiber.dispose() } finally {
      globalThis.fetch = priorFetch
      if (priorHome === undefined) delete process.env.DSH_HOME
      else process.env.DSH_HOME = priorHome
    }
  }
}
