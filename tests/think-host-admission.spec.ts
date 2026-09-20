import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { zstdDecompressSync } from 'node:zlib'
import { Context } from '@deepseek-ai/cordis'
import { AgentRegistry, installModelSelection } from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import LlmRuntime, { createUserMessage, ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import { SessionId, SessionStore } from '@deepseek-ai/dsh-session'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import SessionProjections from '@deepseek-ai/dsh-session-projection'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import UserQuestions from '@deepseek-ai/dsh-user-questions'
import { afterEach, expect, it, vi } from 'vitest'
import { createOpenAICodexAdapter } from '../src/adapter.ts'
import { OpenAICodexCredentialStore, OPENAI_CODEX_PROVIDER } from '../src/store.ts'
import { createReasoningUpdateMessage, readReasoningUpdate } from '../src/reasoning-update.ts'
import { ASTRA_REASONING_TOOL_NAME, registerThinkHostIntegration } from '../src/reasoning-update-host.ts'
import type { ThinkHostIntegration } from '../src/reasoning-update-host.ts'

let ctx: Context | undefined
let root: string | undefined
const wires: Record<string, unknown>[] = []
function response(output: Record<string, unknown>[]): Response {
  const events = output.flatMap((item, output_index) => [
    { type: 'response.output_item.added', output_index, item },
    { type: 'response.output_item.done', output_index, item },
  ])
  return new Response([...events, { type: 'response.completed', response: { id: 'resp_fixture', status: 'completed', output,
    usage: { input_tokens: 20, output_tokens: 10, total_tokens: 30 } } }].map(event => `data: ${JSON.stringify(event)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } })
}
const final = () => response([{ type: 'message', id: `msg_${wires.length}`, role: 'assistant', phase: 'final_answer', status: 'completed',
  content: [{ type: 'output_text', text: 'Synthetic completion.', annotations: [] }] }])
const proposal = (effort = 'high') => response([{ type: 'function_call', id: `fc_${wires.length}`, call_id: `call_${wires.length}`,
  name: ASTRA_REASONING_TOOL_NAME, arguments: JSON.stringify({ effort, reason: 'Check the next proof step.' }), status: 'completed' }])
function transport(reply: () => Response = final) {
  vi.stubGlobal('fetch', vi.fn(async (_url: unknown, init: RequestInit) => {
    const body = new Headers(init.headers).get('content-encoding') === 'zstd'
      ? zstdDecompressSync(init.body as Uint8Array).toString('utf8') : String(init.body)
    wires.push(JSON.parse(body) as Record<string, unknown>)
    return reply()
  }))
}
afterEach(async () => {
  await ctx?.fiber.dispose()
  ctx = undefined
  vi.unstubAllGlobals(); vi.unstubAllEnvs(); wires.length = 0
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})
async function setup(enabled = true, initialEffort: 'low' | 'default' = 'low', seed?: readonly SessionEvent[]) {
  root = await mkdtemp(join(tmpdir(), 'think-host-admission-'))
  vi.stubEnv('DSH_HOME', root)
  transport()
  const store = new OpenAICodexCredentialStore(join(root, '.openai-codex-auth.json'))
  const payload = Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: 'synthetic-think' } })).toString('base64url')
  await store.modify(OPENAI_CODEX_PROVIDER, async () => ({ type: 'oauth', accountId: 'synthetic-think', access: `e30.${payload}.fixture`, refresh: 'fixture', expires: Date.now() + 3600000 }))
  const context = new Context(); ctx = context
  await context.plugin(LlmRuntime); await context.plugin(SessionStore); await context.plugin(SessionProjections)
  await context.plugin(AgentRegistry); await context.plugin(SystemPrompt); await context.plugin(ToolRuntime, { mode: 'native' })
  const questionsPlugin = await context.plugin(UserQuestions)
  const saveDefault = vi.fn()
  context.provide('agentDefaultModel', { saveSelection: saveDefault })
  let integration!: ThinkHostIntegration
  const plugin = await context.plugin(function ThinkHost(host: Context) { integration = registerThinkHostIntegration(host) })
  await integration.setEnabled(enabled)
  const adapter = createOpenAICodexAdapter(store, () => undefined,
    undefined, undefined, undefined, undefined, undefined, undefined, undefined, integration.adapterReplay)
  context.llm.registerAdapter([OPENAI_CODEX_PROVIDER], adapter)
  await context.plugin(AgentLoop, { agents: [] })
  const handle = await context.agents.create({ sessionId: SessionId('think-host'), meta: { cwd: root }, ...(seed === undefined ? {} : { seed }),
    agentOptions: { provider: 'openai-codex', model: 'gpt-6-astra', ...(initialEffort === 'low' ? { reasoningEffort: ReasoningEffortId('low') } : {}) } })
  const agent = handle.agent
  context.effect(() => installModelSelection(agent.ctx, {
    get current() {
      const selected = agent.session.snapshotEvents().findLast(event => event.type === 'model/selection')?.data
      if (selected !== undefined) return { provider: selected.provider, model: selected.model,
        ...(selected.reasoningEffort === undefined ? {} : { reasoningEffort: ReasoningEffortId(selected.reasoningEffort) }) }
      return agent.session.requestHeader()?.config ?? agent.options as { provider: string; model: string; reasoningEffort?: ReturnType<typeof ReasoningEffortId> }
    }, assembled: undefined,
  }))
  const send = async () => { agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Continue the synthetic task.' }] })); await agent.whenIdle() }
  const notices = () => agent.session.deriveMessages().filter(message => readReasoningUpdate(message) !== undefined)
  const effort = () => agent.session.requestHeader()?.config.reasoningEffort
  const execute = (signal?: AbortSignal, effort = 'high') => context.tools.execute({ name: ASTRA_REASONING_TOOL_NAME,
    callId: 'call_explicit' as never, arguments: { effort, reason: 'Inspect this bounded task.' }, agent,
    signal: signal ?? new AbortController().signal })
  return { context, agent, adapter, plugin, questionsPlugin, integration, send, notices, effort, execute, saveDefault }
}
const approve = (effort = 'high') => ({ answers: [{ id: 'astra-reasoning-effort', selected: [`Change to ${effort}`] }] })
const wireUpdates = (wire = wires.at(-1)!) => (wire.input as Record<string, unknown>[]).filter(item => item.type === 'configuration_update')

it('is disabled by default and never rewrites an ordinary request', async () => {
  const f = await setup(false)
  expect(f.context.tools.get(ASTRA_REASONING_TOOL_NAME)).toBeUndefined()
  await f.send()
  expect(wires).toHaveLength(1); expect(wireUpdates()).toEqual([]); expect(f.effort()).toBe('low')
  expect(f.saveDefault).not.toHaveBeenCalled()
})
it.each([true, false])('runs native question, real loop and actual Codex adapter (approved=%s)', async allowed => {
  const f = await setup()
  const questions = vi.fn(async () => allowed ? approve() : { answers: [{ id: 'astra-reasoning-effort', selected: ['Keep current effort'] }] })
  f.context.on('user-questions/request', questions)
  transport(() => wires.length === 1 ? proposal() : final())
  await f.send()
  expect(questions).toHaveBeenCalledTimes(1); expect(wires).toHaveLength(2)
  expect(f.notices()).toHaveLength(allowed ? 1 : 0)
  expect(f.effort()).toBe(allowed ? 'high' : 'low')
  expect(wireUpdates()).toEqual(allowed ? [{ type: 'configuration_update', reasoning: { effort: 'high' } }] : [])
  expect(wires.map(wire => wire.reasoning)).toEqual([{ effort: 'low', summary: 'auto' }, { effort: 'low', summary: 'auto' }])
  expect(f.saveDefault).not.toHaveBeenCalled()
})
it('does not advertise a queued approval as an effective request', async () => {
  const f = await setup(); await f.send()
  f.context.on('user-questions/request', async () => approve())
  expect((await f.execute()).isError).not.toBe(true)
  expect(f.effort()).toBe('low'); expect(f.notices()).toHaveLength(0); expect(wires).toHaveLength(1)
  await f.send()
  expect(f.effort()).toBe('high'); expect(f.notices()).toHaveLength(1)
})
it.each(['disable', 'cancel', 'manual'] as const)('discards a queued but unadmitted change after %s', async action => {
  const f = await setup(); await f.send()
  f.context.on('user-questions/request', async () => approve())
  const controller = new AbortController(); expect((await f.execute(controller.signal)).isError).not.toBe(true)
  if (action === 'disable') await f.integration.setEnabled(false)
  if (action === 'cancel') controller.abort(new Error('fixture cancellation'))
  if (action === 'manual') f.agent.session.append('model/selection', { provider: 'openai-codex', model: 'gpt-6-astra', reasoningEffort: ReasoningEffortId('medium') })
  await f.send()
  expect(f.notices()).toHaveLength(0); expect(wireUpdates()).toEqual([])
  expect(f.effort()).toBe(action === 'manual' ? 'medium' : 'low')
})
it.each(['disable', 'cancel', 'dispose', 'manual'] as const)('rejects an obsolete native decision after %s', async action => {
  const f = await setup(); await f.send()
  let answer: ((value: ReturnType<typeof approve>) => void) | undefined
  f.context.on('user-questions/request', request => new Promise((resolve, reject) => {
    const abort = () => reject(request.signal?.reason)
    request.signal?.addEventListener('abort', abort, { once: true })
    answer = value => { request.signal?.removeEventListener('abort', abort); resolve(value) }
  }))
  const controller = new AbortController()
  const settled = f.execute(controller.signal).then(value => value, error => error)
  await vi.waitFor(() => expect(answer).toBeDefined())
  if (action === 'disable') await f.integration.setEnabled(false)
  if (action === 'cancel') controller.abort(new Error('fixture cancellation'))
  if (action === 'dispose') await f.plugin.dispose()
  if (action === 'manual') f.agent.session.append('model/selection', { provider: 'openai-codex', model: 'gpt-6-astra', reasoningEffort: ReasoningEffortId('medium') })
  answer!(approve()); await settled
  expect(f.notices()).toHaveLength(0); expect(f.effort()).toBe('low'); expect(wires).toHaveLength(1)
})
it('does not infer explicit initial effort from provider Default', async () => {
  const f = await setup(true, 'default'); await f.send()
  const questions = vi.fn(async () => approve()); f.context.on('user-questions/request', questions)
  await f.execute().catch(() => undefined)
  expect(questions).not.toHaveBeenCalled(); expect(f.notices()).toHaveLength(0)
})
it('replays admitted changes after disable and preserves later manual selections', async () => {
  const f = await setup(); f.context.on('user-questions/request', async () => approve())
  transport(() => wires.length === 1 ? proposal() : final()); await f.send()
  expect(f.effort()).toBe('high')
  await f.integration.setEnabled(false)
  expect(f.context.tools.get(ASTRA_REASONING_TOOL_NAME)).toBeUndefined()
  for (const choice of ['low', 'medium', 'max'] as const) {
    f.agent.session.append('model/selection', { provider: 'openai-codex', model: 'gpt-6-astra', reasoningEffort: ReasoningEffortId(choice) })
    await f.send(); expect(f.effort()).toBe(choice)
    expect(wireUpdates().at(-1)).toEqual({ type: 'configuration_update', reasoning: { effort: choice } })
  }
  expect(f.saveDefault).not.toHaveBeenCalled()
})
it('replays the same canonical history through a fresh root and prepared adapter call', async () => {
  let f = await setup(); f.context.on('user-questions/request', async () => approve())
  transport(() => wires.length === 1 ? proposal() : final()); await f.send()
  const seed = JSON.parse(JSON.stringify(f.agent.session.snapshotEvents())) as SessionEvent[]
  await f.context.fiber.dispose(); await rm(root!, { recursive: true, force: true })
  f = await setup(false, 'low', seed); transport(); await f.send()
  expect(f.effort()).toBe('high'); expect(wireUpdates()).toHaveLength(1)
  const call = await f.context.llm.prepareCall(f.agent.session.requestHeader()!.config)
  for await (const value of call.stream({ ...call.config, sessionId: f.agent.id, messages: f.agent.session.deriveMessages() })) void value
  expect(wireUpdates()).toHaveLength(1); expect(f.notices()).toHaveLength(1)
})
it('rejects missing durable notices before transport', async () => {
  const f = await setup(); f.context.on('user-questions/request', async () => approve())
  transport(() => wires.length === 1 ? proposal() : final()); await f.send()
  const count = wires.length
  const call = await f.context.llm.prepareCall(f.agent.session.requestHeader()!.config)
  await expect((async () => { for await (const chunk of call.stream({ ...call.config, sessionId: f.agent.id, messages: [] })) void chunk })()).rejects.toThrow(/missing/)
  expect(wires).toHaveLength(count)
})

it('keeps repeated enablement idempotent while a native question is pending', async () => {
  const f = await setup(); await f.send()
  let decisionSignal: AbortSignal | undefined
  f.context.on('user-questions/request', request => new Promise((_resolve, reject) => {
    decisionSignal = request.signal
    request.signal?.addEventListener('abort', () => reject(request.signal?.reason), { once: true })
  }))
  const operation = f.execute().then(value => value, error => error)
  await vi.waitFor(() => expect(decisionSignal).toBeDefined())
  await f.integration.setEnabled(true)
  await f.integration.setEnabled(false)
  expect(decisionSignal!.aborted).toBe(true)
  await operation
  await f.integration.setEnabled(true); await f.send()
  expect(f.notices()).toHaveLength(0); expect(f.effort()).toBe('low')
})

it('handles rapid activation changes without duplicate tool registration', async () => {
  const f = await setup(false)
  await Promise.all([f.integration.setEnabled(true), f.integration.setEnabled(false), f.integration.setEnabled(true)])
  expect(f.context.tools.get(ASTRA_REASONING_TOOL_NAME)).toBeDefined()
  await f.integration.setEnabled(false)
  expect(f.context.tools.get(ASTRA_REASONING_TOOL_NAME)).toBeUndefined()
})

it('rejects a second decision while one question is pending', async () => {
  const f = await setup(); await f.send()
  let answer: ((value: ReturnType<typeof approve>) => void) | undefined
  const questions = vi.fn(() => new Promise<ReturnType<typeof approve>>(resolve => { answer = resolve }))
  f.context.on('user-questions/request', questions)
  const first = f.execute()
  await vi.waitFor(() => expect(answer).toBeDefined())
  expect((await f.execute(undefined, 'medium')).isError).toBe(true)
  expect(questions).toHaveBeenCalledTimes(1)
  answer!(approve()); expect((await first).isError).not.toBe(true)
  await f.send(); expect(f.notices()).toHaveLength(1); expect(f.effort()).toBe('high')
})

it('does not substitute another approval service when native human questions are absent', async () => {
  const f = await setup(); await f.send(); await f.questionsPlugin.dispose()
  expect((await f.execute()).isError).toBe(true)
  await f.send(); expect(f.notices()).toHaveLength(0); expect(f.effort()).toBe('low')
})

it.each(['custom', 'wrong-option', 'multiple'] as const)('does not accept %s as exact consent', async mode => {
  const f = await setup(); await f.send()
  f.context.on('user-questions/request', async () => ({ answers: [{ id: 'astra-reasoning-effort',
    selected: mode === 'wrong-option' ? ['Change to max'] : mode === 'multiple' ? ['Change to high', 'Keep current effort'] : ['Change to high'],
    ...(mode === 'custom' ? { custom: 'actually do something else' } : {}),
  }] }))
  await f.execute().catch(() => undefined); await f.send()
  expect(f.notices()).toHaveLength(0); expect(f.effort()).toBe('low')
})

it('keeps approved changes out of an unrelated live root', async () => {
  const f = await setup(); f.context.on('user-questions/request', async () => approve())
  transport(() => wires.length === 1 ? proposal() : final()); await f.send()
  const other = await f.context.agents.create({ sessionId: SessionId('unrelated-think-root'), meta: { cwd: root! },
    agentOptions: { provider: 'openai-codex', model: 'gpt-6-astra', reasoningEffort: ReasoningEffortId('medium') } })
  other.agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Independent task.' }] }))
  await other.agent.whenIdle()
  const unrelated = wires.find(wire => wire.prompt_cache_key === other.agent.id)!
  expect(wireUpdates(unrelated)).toEqual([])
  expect(unrelated.reasoning).toMatchObject({ effort: 'medium' })
  expect(f.effort()).toBe('high'); expect(f.notices()).toHaveLength(1)
})

it('does not trust a different object carrying the live Agent id', async () => {
  const f = await setup(); await f.send()
  const questions = vi.fn(async () => approve()); f.context.on('user-questions/request', questions)
  const impostor = Object.create(f.agent) as typeof f.agent
  const result = await f.context.tools.execute({ name: ASTRA_REASONING_TOOL_NAME, callId: 'impostor' as never,
    arguments: { effort: 'high', reason: 'Not the live owner.' }, agent: impostor, signal: new AbortController().signal })
  expect(result.isError).toBe(true); expect(questions).not.toHaveBeenCalled()
})

it('rejects compaction for Think history without disabling ordinary compaction globally', async () => {
  const f = await setup(); f.context.on('user-questions/request', async () => approve())
  transport(() => wires.length === 1 ? proposal() : final()); await f.send()
  const count = wires.length
  const call = await f.context.llm.prepareCall(f.agent.session.requestHeader()!.config)
  await expect((async () => { for await (const chunk of call.stream({ ...call.config, sessionId: f.agent.id,
    purpose: 'compaction', messages: f.agent.session.deriveMessages() })) void chunk })()).rejects.toThrow(/Compaction/)
  expect(wires).toHaveLength(count)
})

it('does not publish a request header when selection changes inside admission', async () => {
  const f = await setup(); await f.send(); f.context.on('user-questions/request', async () => approve())
  expect((await f.execute()).isError).not.toBe(true)
  const count = f.agent.session.snapshotEvents().filter(event => event.type === 'request/header').length
  f.context.on('agent/request', async (_event, next) => {
    const config = await next()
    f.agent.session.append('model/selection', { provider: 'openai-codex', model: 'gpt-6-astra', reasoningEffort: ReasoningEffortId('medium') })
    return config
  })
  await f.send()
  expect(f.agent.session.snapshotEvents().filter(event => event.type === 'request/header')).toHaveLength(count)
  expect(wires).toHaveLength(1); expect(f.effort()).toBe('low')
})

it('refuses proposals from an actually owned child, not only forged identities', async () => {
  const f = await setup(); await f.send()
  // Baseline infers ownership from caller scope; newer hosts require an explicit live parent.
  const childOptions = { sessionId: SessionId('owned-think-child'), parentAgent: f.agent, meta: { cwd: root! },
    agentOptions: { provider: 'openai-codex', model: 'gpt-6-astra', reasoningEffort: ReasoningEffortId('low') } }
  const child = await f.agent.ctx.get('agents')!.create(childOptions)
  try {
    expect(f.context.agents.isOwnedBy(child.agent.id, f.agent)).toBe(true)
    expect(f.context.agents.roots()).not.toContain(child.agent)
    child.agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Synthetic child task.' }] }))
    await child.agent.whenIdle()
    const questions = vi.fn(async () => approve()); f.context.on('user-questions/request', questions)
    const result = await f.context.tools.execute({ name: ASTRA_REASONING_TOOL_NAME, callId: 'owned-child' as never,
      arguments: { effort: 'high', reason: 'Not a root.' }, agent: child.agent, signal: new AbortController().signal })
    expect(result.isError).toBe(true); expect(questions).not.toHaveBeenCalled()
  } finally {
    await child.dispose()
    expect(f.context.agents.get(child.agent.id)).toBeUndefined()
    expect(f.context.sessions.get(child.agent.id)).toBeUndefined()
  }
})

it('guards direct prepared adapter dispatch after the host integration is disposed', async () => {
  const f = await setup(); f.context.on('user-questions/request', async () => approve())
  transport(() => wires.length === 1 ? proposal() : final()); await f.send()
  const call = await f.adapter.prepareCall('openai-codex', 'gpt-6-astra')
  const options = { ...f.agent.session.requestHeader()!.config, sessionId: f.agent.id, messages: f.agent.session.deriveMessages() }
  const count = wires.length
  await f.plugin.dispose()
  await expect((async () => { for await (const value of call.stream(options)) void value })()).rejects.toThrow()
  expect(wires).toHaveLength(count)
})

it('applies an approved decrease after an increase without resetting the wire base', async () => {
  const f = await setup()
  let target = 'high'
  f.context.on('user-questions/request', async () => approve(target))
  transport(() => wires.length === 1 ? proposal() : final()); await f.send()
  target = 'medium'
  expect((await f.execute(undefined, target)).isError).not.toBe(true)
  expect(f.effort()).toBe('high'); await f.send()
  expect(f.effort()).toBe('medium')
  expect(wireUpdates()).toEqual([{ type: 'configuration_update', reasoning: { effort: 'high' } },
    { type: 'configuration_update', reasoning: { effort: 'medium' } }])
  expect(wires.at(-1)!.reasoning).toMatchObject({ effort: 'low' })
  expect(f.saveDefault).not.toHaveBeenCalled()
})

it.each(['removed', 'changed'] as const)('rejects a first approved notice %s by a later pre-step transform', async fault => {
  const f = await setup(); await f.send()
  f.context.on('user-questions/request', async () => approve())
  expect((await f.execute()).isError).not.toBe(true)
  f.context.on('agent/pre-step', async (_event, next) => {
    const decision = await next()
    if (decision.kind !== 'enter') return decision
    if (fault === 'changed') {
      return { ...decision, messages: decision.messages.map(message => {
        const update = readReasoningUpdate(message)
        if (update === undefined) return message
        const changed = createReasoningUpdateMessage({ ...update, effort: 'max' })
        return { ...message, source: changed.source, content: changed.content }
      }) }
    }
    return { ...decision, messages: decision.messages.filter(message => readReasoningUpdate(message) === undefined) }
  }, { prepend: true })
  await f.send()
  expect(wires).toHaveLength(1)
  expect(f.notices()).toHaveLength(fault === 'removed' ? 0 : 1)
  await f.send()
  expect(wires).toHaveLength(1)
})
