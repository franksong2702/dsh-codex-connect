import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { zstdDecompressSync } from 'node:zlib'
import { Context } from '@deepseek-ai/cordis'
import { AgentRegistry, installModelSelection } from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import LlmRuntime, { createUserMessage, ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import SessionProjections from '@deepseek-ai/dsh-session-projection'
import { SessionStore } from '@deepseek-ai/dsh-session'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import UserQuestions from '@deepseek-ai/dsh-user-questions'
import { afterEach, expect, it, vi } from 'vitest'
import * as CodexConnect from '../src/index.ts'
import { OpenAICodexCredentialStore, OPENAI_CODEX_PROVIDER } from '../src/store.ts'
import { planReasoningUpdates, readReasoningUpdate } from '../src/reasoning-update.ts'

let ctx: Context | undefined
let root: string | undefined
afterEach(async () => {
  await ctx?.fiber.dispose()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  if (root !== undefined) await rm(root, { recursive: true, force: true })
})

function response(output: Record<string, unknown>[]): Response {
  const events = output.flatMap((item, output_index) => [
    { type: 'response.output_item.added', output_index, item },
    { type: 'response.output_item.done', output_index, item },
  ])
  return new Response([...events, { type: 'response.completed', response: { id: 'resp_fixture', status: 'completed', output, usage: { input_tokens: 20, output_tokens: 10, total_tokens: 30 } } }].map(event => `data: ${JSON.stringify(event)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } })
}

async function setup(enabled = true, initialEffort: 'low' | 'default' = 'low', seed?: readonly SessionEvent[]) {
  root = await mkdtemp(join(tmpdir(), 'codex-reasoning-loop-'))
  vi.stubEnv('DSH_HOME', root)
  const store = new OpenAICodexCredentialStore(join(root, '.openai-codex-auth.json'))
  const payload = Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: 'fixture' } })).toString('base64url')
  await store.modify(OPENAI_CODEX_PROVIDER, async () => ({ type: 'oauth', accountId: 'fixture', access: `e30.${payload}.fixture`, refresh: 'fixture', expires: Date.now() + 3600000 }))
  const context = new Context()
  ctx = context
  await context.plugin(LlmRuntime)
  await context.plugin(SessionStore)
  await context.plugin(SessionProjections)
  await context.plugin(AgentRegistry)
  await context.plugin(SystemPrompt)
  await context.plugin(ToolRuntime, { mode: 'native' })
  await context.plugin(UserQuestions)
  const saveDefault = vi.fn()
  context.provide('agentDefaultModel', { saveSelection: saveDefault })
  const plugin = await context.plugin(CodexConnect, { enableReasoningUpdates: enabled })
  await context.plugin(AgentLoop, { agents: [] })
  const handle = await context.agents.create({ sessionId: SessionId('reasoning-loop'), meta: { cwd: root }, ...(seed === undefined ? {} : { seed }), agentOptions: { provider: 'openai-codex', model: 'gpt-6-astra', ...(initialEffort === 'low' ? { reasoningEffort: ReasoningEffortId('low') } : {}) } })
  context.effect(() => installModelSelection(handle.agent.ctx, {
    get current() {
      const selected = handle.agent.session.snapshotEvents().findLast(event => event.type === 'model/selection')?.data
      if (selected !== undefined) return { provider: selected.provider, model: selected.model,
        ...(selected.reasoningEffort === undefined ? {} : { reasoningEffort: ReasoningEffortId(selected.reasoningEffort) }) }
      return handle.agent.session.requestHeader()?.config ?? handle.agent.options as { provider: string; model: string; reasoningEffort?: ReturnType<typeof ReasoningEffortId> }
    },
    assembled: undefined,
  }))
  return { context, agent: handle.agent, plugin, saveDefault }
}

it.each([true, false])('runs real loop tool confirmation, then replays the recorded request (approved=%s)', async approved => {
  const { context, agent, saveDefault } = await setup()
  const questions = vi.fn(async () => ({ answers: [{ id: 'astra-reasoning-effort', selected: [approved ? 'Change to high' : 'Keep current effort'] }] }))
  context.on('user-questions/request', questions)
  const wires: Record<string, unknown>[] = []
  vi.stubGlobal('fetch', vi.fn(async (_url: unknown, init: RequestInit) => {
    const body = new Headers(init.headers).get('content-encoding') === 'zstd' ? zstdDecompressSync(init.body as Uint8Array).toString('utf8') : String(init.body)
    wires.push(JSON.parse(body) as Record<string, unknown>)
    if (wires.length === 1) return response([{ type: 'function_call', id: 'fc_change', call_id: 'call_change', name: CodexConnect.ASTRA_REASONING_TOOL_NAME, arguments: JSON.stringify({ effort: 'high', reason: 'The next step needs a careful proof.' }), status: 'completed' }])
    return response([{ type: 'message', id: `msg_${wires.length}`, role: 'assistant', phase: 'final_answer', status: 'completed', content: [{ type: 'output_text', text: 'Done.', annotations: [] }] }])
  }))
  agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Solve the fixture.' }] }))
  await agent.whenIdle()
  expect(questions).toHaveBeenCalledTimes(1)
  expect(wires).toHaveLength(2)
  expect(agent.session.requestHeader()?.config.reasoningEffort).toBe(approved ? 'high' : 'low')
  expect(saveDefault).not.toHaveBeenCalled()
  expect(JSON.stringify(wires[0]!.input)).toContain('effective effort for this request low')
  expect(JSON.stringify(wires[0]!.tools)).toContain('Proactively use this tool, without waiting for the user to name it')
  expect(JSON.stringify(wires[0]!.tools)).toContain('Tool use alone is not a reason')
  if (approved) expect((wires[0]!.tools as Array<{ name: string; description: string }>).find(tool => tool.name === CodexConnect.ASTRA_REASONING_TOOL_NAME)?.description).toMatchSnapshot('phase-aware reasoning policy delivered to Astra')
  expect(JSON.stringify(wires[0]!.input)).toContain('including whether a lower effort is now sufficient')
  const input = wires[1]!.input as Record<string, unknown>[]
  expect(input.filter(item => item.type === 'configuration_update')).toEqual(approved ? [{ type: 'configuration_update', reasoning: { effort: 'high' } }] : [])
  expect(wires.map(wire => wire.reasoning)).toEqual([{ effort: 'low', summary: 'auto' }, { effort: 'low', summary: 'auto' }])
  const restored = Session.create(agent.id, JSON.parse(JSON.stringify(agent.session.snapshotEvents())))
  const messages = restored.deriveMessages()
  const stateNotices = messages.filter(message => message.source.kind === 'plugin'
    && message.source.form === 'notice' && message.source.summary === 'Astra reasoning state')
  expect(stateNotices).toHaveLength(approved ? 2 : 1)
  expect(JSON.stringify(stateNotices.at(-1))).toContain(`effective effort for this request ${approved ? 'high' : 'low'}`)
  expect(messages.filter(message => readReasoningUpdate(message) !== undefined)).toHaveLength(approved ? 1 : 0)
  const prepared = await context.llm.prepareCall(restored.requestHeader()!.config)
  for await (const _ of prepared.stream({ ...prepared.config, sessionId: agent.id, messages })) { /* Drain the real adapter replay. */ }
  const replay = wires[2]!.input as Record<string, unknown>[]
  expect(JSON.stringify(replay)).toContain(`effective effort for this request ${approved ? 'high' : 'low'}`)
  expect(replay.filter(item => item.type === 'configuration_update')).toEqual(input.filter(item => item.type === 'configuration_update'))
  if (approved) expect(replay.findIndex(item => item.type === 'configuration_update')).toBe(input.findIndex(item => item.type === 'configuration_update'))
  expect(planReasoningUpdates({ ...prepared.config, sessionId: agent.id, messages })?.effectiveEffort).toBe(approved ? 'high' : undefined)
  // Prepared calls share an adapter, but must never share the request-local update plan.
  async function concurrent(sessionId: ReturnType<typeof SessionId>, history: typeof messages) {
    const call = await context.llm.prepareCall({ provider: 'openai-codex', model: 'gpt-6-astra', reasoningEffort: ReasoningEffortId('low') })
    for await (const _ of call.stream({ ...call.config, sessionId, messages: history })) { /* Drain concurrent transport. */ }
  }
  await Promise.all([concurrent(agent.id, messages), concurrent(SessionId('unrelated-session'), [createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Unrelated.' }] })])])
  const unrelated = wires.find(wire => wire.prompt_cache_key === 'unrelated-session')!
  expect((unrelated.input as Record<string, unknown>[]).some(item => item.type === 'configuration_update')).toBe(false)
  const own = wires.filter(wire => wire.prompt_cache_key === agent.id).at(-1)!
  expect((own.input as Record<string, unknown>[]).filter(item => item.type === 'configuration_update')).toHaveLength(approved ? 1 : 0)
  expect(input.map(item => item.type === 'configuration_update' ? item : item.type === 'function_call_output' ? { type: item.type, output: item.output } : { type: item.type ?? 'message', role: item.role })).toMatchSnapshot()
})

it('does not register the experimental tool by default', async () => {
  const { context } = await setup(false)
  expect(context.tools.get(CodexConnect.ASTRA_REASONING_TOOL_NAME)).toBeUndefined()
})

it('reports Default as non-explicit and does not duplicate unchanged state across turns', async () => {
  const { agent } = await setup(true, 'default')
  const wires: string[] = []
  vi.stubGlobal('fetch', vi.fn(async (_url: unknown, init: RequestInit) => {
    wires.push(new Headers(init.headers).get('content-encoding') === 'zstd' ? zstdDecompressSync(init.body as Uint8Array).toString('utf8') : String(init.body))
    return response([{ type: 'message', id: `msg_${wires.length}`, role: 'assistant', phase: 'final_answer', status: 'completed', content: [{ type: 'output_text', text: 'Ready.', annotations: [] }] }])
  }))
  for (const text of ['Discuss the requirement.', 'Summarize it.']) {
    agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text }] }))
    await agent.whenIdle()
  }
  expect(wires).toHaveLength(2)
  for (const wire of wires) expect(JSON.stringify(JSON.parse(wire).input)).toContain('no explicit initial effort is selected')
  expect(agent.session.deriveMessages().filter(message => message.source.kind === 'plugin' && message.source.form === 'notice' && message.source.summary === 'Astra reasoning state')).toHaveLength(1)
})

it.each(['cancel', 'unload', 'model-change', 'decline'] as const)('leaves no queued or admitted update after %s during confirmation', async action => {
  const { context, agent, plugin } = await setup()
  vi.stubGlobal('fetch', vi.fn(async () => response([{ type: 'message', id: 'msg_initial', role: 'assistant', phase: 'final_answer', status: 'completed', content: [{ type: 'output_text', text: 'Ready.', annotations: [] }] }])))
  agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Start.' }] }))
  await agent.whenIdle()
  let answer: ((value: { answers: { id: string; selected: string[] }[] }) => void) | undefined
  context.on('user-questions/request', async request => new Promise((resolve, reject) => {
    const abort = () => reject(request.signal?.reason)
    request.signal?.addEventListener('abort', abort, { once: true })
    answer = value => {
      request.signal?.removeEventListener('abort', abort)
      resolve(value)
    }
  }))
  const controller = new AbortController()
  const execution = context.tools.execute({ name: CodexConnect.ASTRA_REASONING_TOOL_NAME, callId: 'call_manual' as never, arguments: { effort: 'high', reason: 'Check carefully.' }, agent, signal: controller.signal })
  // Observe both rejection and rendered tool errors without leaving an unhandled promise.
  const settled = execution.then(value => value, error => error)
  await vi.waitFor(() => expect(answer).toBeDefined())
  if (action === 'cancel') controller.abort(new Error('Canceled by fixture user'))
  if (action === 'unload') await plugin.dispose()
  if (action === 'model-change') agent.session.append('model/selection', { provider: 'openai-codex', model: 'gpt-6-astra', reasoningEffort: ReasoningEffortId('medium') })
  answer!({ answers: [{ id: 'astra-reasoning-effort', selected: [action === 'decline' ? 'Keep current effort' : 'Change to high'] }] })
  await settled
  expect([...agent.inbox.nextStep, ...agent.inbox.nextTurn].filter(message => readReasoningUpdate(message) !== undefined)).toHaveLength(0)
  expect(agent.session.deriveMessages().filter(message => readReasoningUpdate(message) !== undefined)).toHaveLength(0)
  expect(agent.session.requestHeader()?.config.reasoningEffort).toBe('low')
})

it('records high then medium, resumes at medium and never changes defaults', async () => {
  const { context, agent, saveDefault } = await setup()
  context.on('user-questions/request', async request => ({ answers: [{ id: 'astra-reasoning-effort', selected: [request.questions[0]!.options![0]!.label] }] }))
  const wires: Record<string, unknown>[] = []
  vi.stubGlobal('fetch', vi.fn(async (_url: unknown, init: RequestInit) => {
    const body = new Headers(init.headers).get('content-encoding') === 'zstd' ? zstdDecompressSync(init.body as Uint8Array).toString('utf8') : String(init.body)
    wires.push(JSON.parse(body))
    const effort = wires.length === 1 ? 'high' : wires.length === 2 ? 'medium' : undefined
    return response(effort === undefined
      ? [{ type: 'message', id: `msg_${wires.length}`, role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'Done.', annotations: [] }] }]
      : [{ type: 'function_call', id: `fc_${effort}`, call_id: `call_${effort}`, name: CodexConnect.ASTRA_REASONING_TOOL_NAME, arguments: JSON.stringify({ effort, reason: 'The next task has different reasoning needs.' }), status: 'completed' }])
  }))
  agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Start.' }] }))
  await agent.whenIdle()
  expect(wires).toHaveLength(3)
  expect(agent.session.snapshotEvents().filter(e => e.type === 'request/header').map(e => e.data.header.config.reasoningEffort)).toEqual(['low', 'high', 'medium'])
  for (const wire of wires) expect(wire.reasoning).toMatchObject({ effort: 'low' })
  expect((wires[2]!.input as Record<string, unknown>[]).filter(item => item.type === 'configuration_update')).toEqual([
    { type: 'configuration_update', reasoning: { effort: 'high' } },
    { type: 'configuration_update', reasoning: { effort: 'medium' } },
  ])
  const restored = Session.create(agent.id, JSON.parse(JSON.stringify(agent.session.snapshotEvents())))
  expect(restored.requestHeader()?.config.reasoningEffort).toBe('medium')
  const prepared = await context.llm.prepareCall(restored.requestHeader()!.config)
  for await (const _ of prepared.stream({ ...prepared.config, sessionId: agent.id, messages: restored.deriveMessages() })) { /* Drain restored transport. */ }
  expect(wires[3]!.reasoning).toMatchObject({ effort: 'low' })
  expect((wires[3]!.input as Record<string, unknown>[]).filter(item => item.type === 'configuration_update')).toEqual((wires[2]!.input as Record<string, unknown>[]).filter(item => item.type === 'configuration_update'))
  expect(saveDefault).not.toHaveBeenCalled()
  agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Continue.' }] }))
  await agent.whenIdle()
  expect(agent.session.requestHeader()?.config.reasoningEffort).toBe('medium')
  expect(wires).toHaveLength(5)
})

it.each(['before-admission', 'before-header', 'manual-selection', 'late-unmatched-header'] as const)('does not publish a new effective level after %s', async stage => {
  const { context, agent, saveDefault } = await setup()
  context.on('user-questions/request', async () => ({ answers: [{ id: 'astra-reasoning-effort', selected: ['Change to high'] }] }))
  const fetch = vi.fn(async () => response([{ type: 'function_call', id: 'fc_change', call_id: 'call_change', name: CodexConnect.ASTRA_REASONING_TOOL_NAME, arguments: JSON.stringify({ effort: 'high', reason: 'Check the next step.' }), status: 'completed' }]))
  vi.stubGlobal('fetch', fetch)
  context.on('agent/pre-step', async (payload, next) => {
    const decision = await next()
    if (payload.step === 2 && stage === 'before-admission') agent.cancel({ kind: 'user' })
    return decision
  })
  context.on('agent/request', async (payload, next) => {
    const config = await next()
    if (payload.step === 2 && stage === 'manual-selection') agent.session.append('model/selection', { provider: 'openai-codex', model: 'gpt-6-astra', reasoningEffort: ReasoningEffortId('medium') })
    if (payload.step === 2 && stage === 'late-unmatched-header') {
      agent.session.append('model/selection', { provider: 'openai-codex', model: 'gpt-6-astra', reasoningEffort: ReasoningEffortId('medium') })
      agent.session.append('request/header', { header: agent.session.requestHeader()!, reason: 'change' })
    }
    if (payload.step === 2 && stage === 'before-header') agent.cancel({ kind: 'user' })
    return config
  })
  agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Start.' }] }))
  await agent.whenIdle()
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(agent.session.requestHeader()?.config.reasoningEffort).toBe('low')
  expect(saveDefault).not.toHaveBeenCalled()
})

it.each(['legacy', 'current', 'manual-low', 'manual-medium', 'manual-max'] as const)('continues a JSON-restored session in a fresh loop (%s)', async scenario => {
  const legacy = scenario !== 'current'
  const first = await setup()
  first.context.on('user-questions/request', async () => ({ answers: [{ id: 'astra-reasoning-effort', selected: ['Change to high'] }] }))
  const wires: Record<string, unknown>[] = []
  vi.stubGlobal('fetch', vi.fn(async (_url: unknown, init: RequestInit) => {
    const body = new Headers(init.headers).get('content-encoding') === 'zstd' ? zstdDecompressSync(init.body as Uint8Array).toString('utf8') : String(init.body)
    wires.push(JSON.parse(body))
    return response(wires.length === 1
      ? [{ type: 'function_call', id: 'fc_high', call_id: 'call_high', name: CodexConnect.ASTRA_REASONING_TOOL_NAME, arguments: JSON.stringify({ effort: 'high', reason: 'Check carefully.' }), status: 'completed' }]
      : [{ type: 'message', id: `msg_${wires.length}`, role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'Done.', annotations: [] }] }])
  }))
  first.agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Start.' }] }))
  await first.agent.whenIdle()
  const saved: SessionEvent[] = JSON.parse(JSON.stringify(first.agent.session.snapshotEvents()))
  if (legacy) for (const event of saved) {
    if (event.type === 'request/header') event.data.header.config.reasoningEffort = ReasoningEffortId('low')
  }
  await first.context.fiber.dispose()
  await rm(root!, { recursive: true, force: true })
  const resumed = await setup(true, 'low', saved)
  expect(resumed.agent.session.requestHeader()?.config.reasoningEffort).toBe(legacy ? 'low' : 'high')
  const manual = scenario.startsWith('manual-') ? scenario.slice(7) : undefined
  if (manual !== undefined) {
    resumed.agent.session.append('model/selection', { provider: 'openai-codex', model: 'gpt-6-astra', reasoningEffort: ReasoningEffortId('medium') })
    resumed.agent.session.append('model/selection', { provider: 'openai-codex', model: 'gpt-6-astra', reasoningEffort: ReasoningEffortId(manual) })
  }
  resumed.agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Continue after restart.' }] }))
  await resumed.agent.whenIdle()
  expect(wires).toHaveLength(3)
  expect(resumed.agent.session.requestHeader()?.config.reasoningEffort).toBe(manual ?? 'high')
  expect(wires[2]!.reasoning).toMatchObject({ effort: 'low' })
  expect((wires[2]!.input as Record<string, unknown>[]).filter(item => item.type === 'configuration_update')).toEqual([{ type: 'configuration_update', reasoning: { effort: 'high' } }, ...(manual === undefined ? [] : [{ type: 'configuration_update', reasoning: { effort: manual } }])])
  expect(resumed.saveDefault).not.toHaveBeenCalled()
  if (manual !== undefined) {
    resumed.context.on('user-questions/request', async request => ({ answers: [{ id: 'astra-reasoning-effort', selected: [request.questions[0]!.options![0]!.label] }] }))
    vi.stubGlobal('fetch', vi.fn(async (_url: unknown, init: RequestInit) => {
      const body = new Headers(init.headers).get('content-encoding') === 'zstd' ? zstdDecompressSync(init.body as Uint8Array).toString('utf8') : String(init.body)
      wires.push(JSON.parse(body))
      const effort = wires.length === 4 ? 'high' : wires.length === 5 ? 'xhigh' : undefined
      return response(effort === undefined
        ? [{ type: 'message', id: `msg_${wires.length}`, role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'Done.', annotations: [] }] }]
        : [{ type: 'function_call', id: `fc_${effort}`, call_id: `call_${effort}`, name: CodexConnect.ASTRA_REASONING_TOOL_NAME, arguments: JSON.stringify({ effort, reason: 'Check the next step.' }), status: 'completed' }])
    }))
    resumed.agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Review carefully.' }] }))
    await resumed.agent.whenIdle()
    expect(wires).toHaveLength(6)
    expect(resumed.agent.session.requestHeader()?.config.reasoningEffort).toBe('xhigh')
    resumed.agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Continue.' }] }))
    await resumed.agent.whenIdle()
    expect(wires).toHaveLength(7)
    expect((wires[6]!.input as Record<string, unknown>[]).filter(item => item.type === 'configuration_update').map(item => item.reasoning)).toEqual([{ effort: 'high' }, { effort: manual }, { effort: 'high' }, { effort: 'xhigh' }])
    expect(resumed.saveDefault).not.toHaveBeenCalled()
  }
})
