/** Real DSH loop and adapter, synthetic inputs and responses. No real account or provider is used. */
import { createHash, randomUUID } from 'node:crypto'
import { mkdtemp, rm, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { zstdDecompressSync } from 'node:zlib'
import { Context } from '@deepseek-ai/cordis'
import { AgentRegistry, installModelSelection } from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import Llm, { createUserMessage, ReasoningEffortId, ToolCallId } from '@deepseek-ai/dsh-llm'
import type { LlmResolvedModelInfo } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import Sessions from '@deepseek-ai/dsh-session'
import Projection from '@deepseek-ai/dsh-session-projection'
import Prompt from '@deepseek-ai/dsh-system-prompt'
import Tools from '@deepseek-ai/dsh-tools'
import Persistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import Meter from '@deepseek-ai/dsh-token-meter'
import Compaction from '@deepseek-ai/dsh-compaction-basic'
import { afterEach, expect, it, vi } from 'vitest'
import { createOpenAICodexAdapter } from '../src/adapter.ts'
import { OpenAICodexCredentialStore } from '../src/store.ts'
import { OpenAICodexBackendRequests } from '../src/backend-request.ts'
import { AdaptiveTaskRuntime } from '../src/adaptive-task-runtime.ts'
import { AdaptiveTaskStore, taskIdentity } from '../src/adaptive-task-store.ts'
import { ADAPTIVE_TASK_MODELS, ADAPTIVE_TASK_TOOL } from '../src/adaptive-task-contract.ts'
import type { AdaptiveTaskCommand } from '../src/adaptive-task-contract.ts'

let root: string | undefined
let context: Context | undefined
const principal = taskIdentity('synthetic-authenticated-browser')
const endpoint = 'https://chatgpt.com/backend-api/codex/responses'
function response(item: Record<string, unknown>) {
  return new Response([
    { type: 'response.output_item.added', output_index: 0, item },
    { type: 'response.output_item.done', output_index: 0, item },
    { type: 'response.completed', response: { id: 'r_fixture', model: 'synthetic', status: 'completed', output: [item],
      usage: { input_tokens: 20, output_tokens: 10, total_tokens: 30 } } },
  ].map(event => `data: ${JSON.stringify(event)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } })
}
const answer = (text = 'The synthetic task is completed.') => response({ type: 'message', id: 'm_fixture', role: 'assistant', phase: 'final_answer', status: 'completed',
  content: [{ type: 'output_text', text, annotations: [] }] })
const choose = (model: string, effort: string) => response({ type: 'function_call', id: 'fc_fixture', call_id: `c_${randomUUID()}`,
  name: ADAPTIVE_TASK_TOOL, arguments: JSON.stringify({ model, effort, reason: 'The remaining fixture work benefits from this choice.' }), status: 'completed' })
async function setup(options: { persistence?: 'none' | 'zstd'; maxConcurrent?: number; nativeCompaction?: boolean } = {}) {
  root = await mkdtemp(join(tmpdir(), 'adaptive-task-phase1-'))
  vi.stubEnv('DSH_HOME', root)
  vi.stubEnv('OTEL_SDK_DISABLED', 'true')
  const wires: Array<Record<string, any>> = []
  let reply = (_wire: Record<string, any>): Response | Promise<Response> => answer()
  vi.stubGlobal('WebSocket', class { constructor() { throw new Error('No live transport in fixture') } })
  const fetch = vi.fn(async (url: unknown, init: RequestInit) => {
    expect(String(url)).toBe(endpoint)
    const raw = new Headers(init.headers).get('content-encoding') === 'zstd'
      ? zstdDecompressSync(init.body as Uint8Array).toString('utf8') : String(init.body)
    const wire = JSON.parse(raw); wires.push(wire)
    expect(wires.length).toBeLessThan(20)
    return reply({ ...wire, signal: init.signal })
  })
  vi.stubGlobal('fetch', fetch)
  const ctx = new Context(); context = ctx
  for (const plugin of [Llm, Sessions, Projection, AgentRegistry, Prompt, Tools]) await ctx.plugin(plugin)
  await ctx.plugin(AgentLoop, { agents: [] })
  if (options.persistence !== undefined) await ctx.plugin(Persistence, { root: join(root, 'sessions'), compression: options.persistence })
  const credentials = new OpenAICodexCredentialStore(join(root, '.synthetic-oauth.json'))
  const claim = Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: 'synthetic-only' } })).toString('base64url')
  await credentials.modify('openai-codex', async () => ({ type: 'oauth', access: `e30.${claim}.fixture`, refresh: 'fixture', accountId: 'synthetic-only', expires: Date.now() + 3600000 }))
  const store = new AdaptiveTaskStore(join(root, 'tasks'))
  let catalog: readonly LlmResolvedModelInfo[] = []
  let catalogFailure = false
  const models = async () => { if (catalogFailure) throw new Error('Synthetic catalog outage'); return catalog }
  let runtime!: AdaptiveTaskRuntime
  const governor = new OpenAICodexBackendRequests(undefined, undefined, options.maxConcurrent ?? 8, async () => runtime.reserveAuxiliary())
  const dispatch = { stream: (...args: Parameters<AdaptiveTaskRuntime['stream']>) => runtime.stream(...args) }
  const adapter = createOpenAICodexAdapter(credentials, () => undefined, undefined, undefined,
    undefined, undefined, undefined, undefined, () => options.nativeCompaction === true, governor, dispatch)
  ctx.llm.registerAdapter(['openai-codex'], adapter)
  catalog = await Promise.all(ADAPTIVE_TASK_MODELS.map(model => adapter.resolveModel('openai-codex', model)))
  let feature = await ctx.plugin(function TaskHost(host: Context) {
    runtime = new AdaptiveTaskRuntime(host, { store, models })
  })
  const create = async (id: string) => {
    const handle = await ctx.agents.create({ sessionId: SessionId(id), meta: { cwd: root! },
      agentOptions: { provider: 'openai-codex', model: 'gpt-5.6-terra', reasoningEffort: ReasoningEffortId('low') } })
    const agent = handle.agent
    ctx.effect(() => installModelSelection(agent.ctx, { get current() {
      const explicit = agent.session.snapshotEvents().findLast(event => event.type === 'model/selection')?.data
      if (explicit !== undefined) return { provider: explicit.provider, model: explicit.model,
        ...(explicit.reasoningEffort === undefined ? {} : { reasoningEffort: ReasoningEffortId(explicit.reasoningEffort) }) }
      return agent.session.requestHeader()?.config ?? agent.options as { provider: string; model: string }
    }, assembled: undefined }))
    return handle
  }
  const handle = await create('phase1-root'); const agent = handle.agent
  ctx.effect(() => () => governor.dispose())
  const state = () => runtime.state(agent.id, principal)
  const command = async (action: AdaptiveTaskCommand['action'], extra: Partial<AdaptiveTaskCommand> = {}) => runtime.command({
    sessionId: agent.id, action, operationId: randomUUID(), revision: (await state()).revision, ...extra,
  }, principal)
  const efforts = Object.fromEntries(catalog.map(model => [model.id, model.reasoning!.efforts.map(effort => String(effort.id))]))
  const start = (maximumRequests = 40) => command('start', { maximumRequests, models: [...ADAPTIVE_TASK_MODELS], efforts })
  const send = async (text = 'ORIGINAL REQUIREMENT: fix the issue and verify the result.') => {
    agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text }] }))
    await agent.whenIdle()
  }
  const execute = (model: string, effort: string, extra = {}) => ctx.tools.execute({ agent, callId: ToolCallId(randomUUID()),
    name: ADAPTIVE_TASK_TOOL, arguments: { model, effort, reason: 'Synthetic meaningful phase', ...extra }, signal: new AbortController().signal })
  return { ctx, agent, handle, create, efforts, wires, fetch, store, state, command, start, send, execute, governor,
    runtime: () => runtime, setReply(value: typeof reply) { reply = value },
    setCatalog(value: readonly LlmResolvedModelInfo[]) { catalog = value }, catalog: () => catalog,
    failCatalog() { catalogFailure = true },
    async reload() { await feature.dispose(); feature = await ctx.plugin(function ReloadedTaskHost(host: Context) {
      runtime = new AdaptiveTaskRuntime(host, { store, models })
    }) },
  }
}
afterEach(async () => {
  try { await context?.fiber.dispose() } finally {
    context = undefined
    vi.unstubAllGlobals(); vi.unstubAllEnvs()
    if (root !== undefined) await rm(root, { recursive: true, force: true }); root = undefined
  }
})
it('is off without a task grant and preserves the ordinary selection', async () => {
  const f = await setup(); expect((await f.state()).mode).toBe('off')
  expect(f.ctx.tools.get(ADAPTIVE_TASK_TOOL, f.agent)).toBeUndefined()
  await expect(readdir(join(root!, 'tasks'))).rejects.toMatchObject({ code: 'ENOENT' })
  await f.send(); expect(f.wires[0]!.model).toBe('gpt-5.6-terra')
  expect(f.wires[0]!.reasoning.effort).toBe('low')
})
it('starts Sol/Medium only after task opt-in and adds no mandatory routing call', async () => {
  const f = await setup(); const enabled = await f.start()
  expect(enabled.requested).toEqual({ model: 'gpt-5.6-sol', effort: 'medium' })
  expect(f.wires).toHaveLength(0); await f.send()
  expect(f.wires).toHaveLength(1); expect(f.wires[0]).toMatchObject({ model: 'gpt-5.6-sol', reasoning: { effort: 'medium' } })
  expect((await f.state()).reserved).toBe(1)
})
it.each([
  ['gpt-5.6-sol', 'high'], ['gpt-5.6-terra', 'medium'], ['gpt-5.6-luna', 'max'], ['gpt-6-astra', 'low'],
  ['gpt-6-sol', 'xhigh'], ['gpt-6-luna', 'max'],
])('lets the current model choose %s/%s within the approved task', async (model, effort) => {
  const f = await setup(); await f.start()
  f.setReply(() => f.wires.length === 1 ? choose(model, effort) : answer())
  await f.send(); expect(f.wires).toHaveLength(2)
  expect(f.wires[1]).toMatchObject({ model, reasoning: { effort } })
  expect(JSON.stringify(f.wires[1]!.input)).toContain('ORIGINAL REQUIREMENT')
  expect((await f.state()).reserved).toBe(2)
  expect(f.agent.session.requestHeader()!.config).toMatchObject({ model, reasoningEffort: effort })
  expect(f.wires[1]!.input.some((item: any) => item.type === 'configuration_update')).toBe(false)
})
it('keeps another root untouched and refuses forged or extra-scope tool inputs', async () => {
  const f = await setup(); await f.start(); await f.send()
  const other = await f.create('another-root')
  expect(f.ctx.tools.get(ADAPTIVE_TASK_TOOL, other.agent)).toBeUndefined()
  expect((await f.execute('gpt-6-astra', 'high', { approved: true })).isError).toBe(true)
  expect((await f.execute('unlisted-model', 'high')).isError).toBe(true)
  expect(f.wires).toHaveLength(1)
})
it('does not silently fall back when an allowed model disappears', async () => {
  const f = await setup(); await f.start(); await f.send()
  f.setCatalog(f.catalog().filter(model => model.id !== 'gpt-6-astra'))
  expect((await f.execute('gpt-6-astra', 'high')).isError).toBe(true)
  await f.send(); expect(f.wires.at(-1)!.model).toBe('gpt-5.6-sol')
})
it('reserves each real HTTP attempt durably and stops at the shared request limit', async () => {
  const f = await setup(); await f.start(1); await f.send(); await f.send('one extra request')
  expect(f.wires).toHaveLength(1)
  expect(await f.state()).toMatchObject({ mode: 'limit', reserved: 1, maximumRequests: 1 })
  expect(f.ctx.tools.get(ADAPTIVE_TASK_TOOL, f.agent)).toBeUndefined()
})
it('does not refund a failed request or automatically retry the model', async () => {
  const f = await setup(); await f.start(2)
  f.setReply(() => new Response(null, { status: 500 })); await f.send()
  expect(f.wires).toHaveLength(1); expect((await f.state()).reserved).toBe(1)
})
it('requires the same authenticated browser and exact revision, with duplicate operation receipts', async () => {
  const f = await setup()
  const command: AdaptiveTaskCommand = { action: 'start', operationId: randomUUID(), revision: 0,
    sessionId: f.agent.id, models: [...ADAPTIVE_TASK_MODELS], efforts: f.efforts, maximumRequests: 5 }
  await f.runtime().command(command, principal); await f.send()
  await f.runtime().command(command, principal)
  expect((await f.state()).reserved).toBe(1)
  await expect(f.runtime().command({ ...command, maximumRequests: 6 }, principal)).rejects.toThrow('TASK_OPERATION_CONFLICT')
  await expect(f.runtime().state(f.agent.id, taskIdentity('other-browser'))).rejects.toThrow('TASK_OWNER_MISMATCH')
  await expect(f.command('manual', { revision: 0 })).rejects.toThrow('TASK_STALE_REVISION')
})
it('returns to ordinary manual model and Default selection after a handoff', async () => {
  const f = await setup(); await f.start()
  f.setReply(() => f.wires.length === 1 ? choose('gpt-6-astra', 'high') : answer()); await f.send()
  await f.command('manual')
  f.agent.session.append('model/selection', { provider: 'openai-codex', model: 'gpt-5.6-terra' })
  await f.send('manual continuation')
  expect(f.wires.at(-1)!.model).toBe('gpt-5.6-terra')
  expect((await f.state()).mode).toBe('manual')
  expect(f.ctx.tools.get(ADAPTIVE_TASK_TOOL, f.agent)).toBeUndefined()
})
it('manual selector changes withdraw automation rather than being overwritten', async () => {
  const f = await setup(); await f.start(); await f.send()
  f.agent.session.append('model/selection', { provider: 'openai-codex', model: 'gpt-5.6-luna', reasoningEffort: ReasoningEffortId('max') })
  await f.send(); expect(f.wires.at(-1)!.model).toBe('gpt-5.6-luna')
  expect((await f.state()).mode).toBe('manual')
})
it('halts in-flight requests, retains their reservations, and does not auto-resume after stop', async () => {
  const f = await setup(); await f.start()
  f.setReply(wire => new Promise((_resolve, reject) => wire.signal.addEventListener('abort', () => reject(wire.signal.reason), { once: true })))
  const sending = f.send(); await vi.waitFor(() => expect(f.wires).toHaveLength(1))
  await f.command('stop'); await sending
  expect(await f.state()).toMatchObject({ mode: 'stopped', reserved: 1 })
  await f.send('do not restart automatically'); expect(f.wires).toHaveLength(1)
  await f.command('manual'); f.setReply(() => answer()); await f.send(); expect(f.wires).toHaveLength(2)
})
it('retains counters across runtime replacement but requires explicit same-owner resume', async () => {
  const f = await setup(); await f.start(); await f.send(); await f.reload()
  expect(await f.state()).toMatchObject({ mode: 'interrupted', reserved: 1 })
  await f.send('not yet reauthorized'); expect(f.wires).toHaveLength(1)
  await f.command('resume'); await f.send(); expect((await f.state()).reserved).toBe(2)
})
it('refuses old sessions and starting with unavailable Sol', async () => {
  const f = await setup(); f.setCatalog(f.catalog().filter(model => model.id !== 'gpt-5.6-sol'))
  await expect(f.start()).rejects.toThrow('TASK_MODEL_UNAVAILABLE')
  await f.send(); await expect(f.start()).rejects.toThrow('TASK_NEW_SESSION_REQUIRED')
})
it('fails closed on malformed stored state without creating a fresh budget', async () => {
  const f = await setup(); await f.start(); await f.send()
  const filename = join(root!, 'tasks', createHash('sha256').update(f.agent.id).digest('hex') + '.json')
  await writeFile(filename, '{"version":99}', { mode: 0o600 })
  await expect(f.state()).rejects.toThrow('TASK_STATE_INVALID')
  await f.send(); expect(f.wires).toHaveLength(1)
})

it('remembers missing task authority from the host journal after reload instead of resetting', async () => {
  const f = await setup(); await f.start(); await f.send()
  await rm(join(root!, 'tasks'), { recursive: true })
  await f.reload()
  await expect(f.state()).rejects.toThrow('TASK_STATE_MISSING')
  await f.send('No fresh budget'); expect(f.wires).toHaveLength(1)
})
it('does not let another browser interrupt a still-owned restored task by reading it', async () => {
  const f = await setup(); await f.start(); await f.send(); await f.reload()
  await expect(f.runtime().state(f.agent.id, taskIdentity('different-browser'))).rejects.toThrow('TASK_OWNER_MISMATCH')
  expect((await f.store.read(f.agent.id))!.mode).toBe('auto')
  expect((await f.state()).mode).toBe('interrupted')
})
it('permits another model to choose the next route without preserving a fixed commander', async () => {
  const f = await setup(); await f.start()
  f.setReply(() => f.wires.length === 1 ? choose('gpt-5.6-luna', 'max')
    : f.wires.length === 2 ? choose('gpt-5.6-terra', 'medium') : answer())
  await f.send(); expect(f.wires.map(wire => wire.model)).toEqual(['gpt-5.6-sol', 'gpt-5.6-luna', 'gpt-5.6-terra'])
  expect((await f.state()).reserved).toBe(3)
})
it.each(['none', 'zstd'] as const)('retains the task grant and exact original session through persisted unload/resume (%s)', async compression => {
  const f = await setup({ persistence: compression }); await f.start(); await f.send()
  await f.ctx.sessions.flush(f.agent.session)
  const identity = f.agent.session.header
  await f.handle.dispose(); await f.reload()
  const resumed = await f.ctx.agents.resume({ resumeSessionId: SessionId(identity.id),
    agentOptions: { provider: 'openai-codex', model: 'gpt-5.6-sol', reasoningEffort: ReasoningEffortId('medium') } })
  expect(resumed.agent).not.toBe(f.agent)
  expect(resumed.agent.session.header.createdAt).toBe(identity.createdAt)
  const status = await f.runtime().state(identity.id, principal)
  expect(status).toMatchObject({ mode: 'interrupted', reserved: 1 })
  await f.runtime().command({ sessionId: identity.id, revision: status.revision, operationId: randomUUID(), action: 'resume' }, principal)
  resumed.agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Continue the same persisted task.' }] }))
  await resumed.agent.whenIdle()
  expect(f.wires).toHaveLength(2)
  expect(JSON.stringify(f.wires.at(-1)!.input)).toContain('ORIGINAL REQUIREMENT')
  expect((await f.runtime().state(identity.id, principal)).reserved).toBe(2)
})
it('expands pre-handoff checkpoints from original evidence and permits new target-route compaction', async () => {
  const f = await setup(); await f.ctx.plugin(Meter); await f.ctx.plugin(Compaction, { auto: false, retainTokens: 0 })
  await f.start()
  f.setReply(() => answer('Extensive synthetic evidence from this task. '.repeat(500)))
  await f.send(); await f.send('Retain this later requirement')
  f.setReply(() => answer('COMPACTED CONTEXT'))
  expect(await f.ctx.compaction.compactNow(f.agent, new AbortController().signal)).toBeTruthy()
  expect(f.agent.session.surface.replaceGeneration).toBe(1)
  expect((await f.execute('gpt-5.6-luna', 'max')).isError).not.toBe(true)
  f.setReply(() => answer('Luna target evidence. '.repeat(500))); await f.send('Handoff continuation')
  expect(f.wires.at(-1)!.model).toBe('gpt-5.6-luna')
  expect(JSON.stringify(f.wires.at(-1)!.input)).toContain('ORIGINAL REQUIREMENT')
  await f.send('Target continuation before compaction')
  f.setReply(() => answer('TARGET COMPACTED CONTEXT'))
  expect(await f.ctx.compaction.compactNow(f.agent, new AbortController().signal)).toBeTruthy()
  await f.send('After target compaction')
  expect(JSON.stringify(f.wires.at(-1)!.input)).toContain('TARGET COMPACTED CONTEXT')
  expect(JSON.stringify(f.wires.at(-1)!.input)).not.toContain('Extensive synthetic evidence')
  expect((await f.state()).reserved).toBe(f.wires.length)
  expect((await f.execute('gpt-5.6-terra', 'medium')).isError).not.toBe(true)
  await f.send('Second model handoff')
  expect(JSON.stringify(f.wires.at(-1)!.input)).toContain('ORIGINAL REQUIREMENT')
})

it.each(['source-sequences', 'summary-range', 'checkpoint-content'] as const)('rejects a mismatched compaction journal on handoff: %s', async corruption => {
  const f = await setup(); await f.ctx.plugin(Meter); await f.ctx.plugin(Compaction, { auto: false, retainTokens: 0 })
  await f.start(); f.setReply(() => answer('Evidence to compact. '.repeat(500)))
  await f.send(); await f.send('Keep original requirements')
  f.setReply(() => answer('SUMMARY'))
  expect(await f.ctx.compaction.compactNow(f.agent, new AbortController().signal)).toBeTruthy()
  const snapshot = structuredClone(f.agent.session.snapshotEvents())
  const checkpoint = snapshot.findLast(event => event.type === 'user/message' && event.data.source.kind === 'compact-checkpoint')!
  if (corruption === 'source-sequences' && checkpoint.type === 'user/message') {
    Object.assign(checkpoint, { sourceEventSeqs: [checkpoint.seq - 1] })
  } else if (corruption === 'summary-range') {
    const summary = snapshot.findLast(event => event.type === 'compaction/summary')!
    Object.assign(summary.data, { shadowedSeqs: [] })
  } else if (checkpoint.type === 'user/message') {
    Object.assign(checkpoint.data, { content: [{ type: 'text', text: 'Uncorrelated checkpoint' }] })
  }
  const mocked = vi.spyOn(f.agent.session, 'snapshotEvents').mockReturnValue(snapshot)
  expect((await f.execute('gpt-5.6-luna', 'max')).isError).toBe(true)
  mocked.mockRestore()
  expect((await f.state()).requested!.model).toBe('gpt-5.6-sol')
})

it('expands a native checkpoint on model handoff and retains original requirements', async () => {
  const f = await setup({ nativeCompaction: true })
  await f.ctx.plugin(Meter); await f.ctx.plugin(Compaction, { auto: false, retainTokens: 0 }); await f.start()
  f.setReply(wire => wire.input.some((item: any) => item.type === 'compaction_trigger')
    ? response({ type: 'compaction', id: 'task-native-fixture', encrypted_content: 'synthetic-native-task-context' })
    : answer('Evidence before native compaction. '.repeat(500)))
  await f.send(); await f.send('Keep the latest user constraint')
  expect(await f.ctx.compaction.compactNow(f.agent, new AbortController().signal)).toBeTruthy()
  expect(f.wires.some(wire => wire.input.some((item: any) => item.type === 'compaction_trigger'))).toBe(true)
  expect((await f.execute('gpt-5.6-luna', 'max')).isError).not.toBe(true)
  await f.send('Continue after native handoff')
  expect(f.wires.at(-1)!.model).toBe('gpt-5.6-luna')
  expect(JSON.stringify(f.wires.at(-1)!.input)).toContain('ORIGINAL REQUIREMENT')
  expect(f.wires.at(-1)!.input.some((item: any) => item.type === 'compaction')).toBe(false)
  expect((await f.state()).reserved).toBe(f.wires.length)
})

it('charges direct auxiliary backend work to the same initiating task', async () => {
  const f = await setup(); await f.start(3)
  f.ctx.tools.register({ name: 'fixture_auxiliary', description: 'Synthetic auxiliary route only.',
    parameters: { type: 'object', properties: {} }, output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: String(value) }] },
    async execute() {
      return f.governor.run({ lane: 'search' }, async context => {
        const result = await context.fetch(endpoint, { method: 'POST', body: JSON.stringify({ model: 'gpt-5.6-sol', input: [], tools: [] }) })
        await result.text(); return 'Synthetic auxiliary completed'
      })
    },
  })
  f.setReply(() => f.wires.length === 1 ? response({ type: 'function_call', id: 'fc_aux', call_id: 'call_aux', name: 'fixture_auxiliary',
    arguments: '{}', status: 'completed' }) : answer())
  await f.send()
  // The real AgentLoop, unlike an out-of-turn bare ToolRuntime call, binds currentInitiator.
  expect((await f.state()).reserved).toBe(3)
  expect(f.wires).toHaveLength(3)
  const refused = await f.ctx.agents.withInitiator(f.agent, () => f.ctx.tools.execute({ agent: f.agent, name: 'fixture_auxiliary',
    callId: ToolCallId(randomUUID()), arguments: {}, signal: new AbortController().signal }))
  expect(refused.isError).toBe(true)
  expect(f.wires).toHaveLength(3)
})
it('discards an unexecuted model choice when the user takes over', async () => {
  const f = await setup(); await f.start(); await f.send()
  expect((await f.execute('gpt-6-astra', 'high')).isError).not.toBe(true)
  expect((await f.state()).current!.model).toBe('gpt-5.6-sol')
  await f.command('manual'); expect((await f.state()).requested).toBeUndefined()
  f.agent.session.append('model/selection', { provider: 'openai-codex', model: 'gpt-5.6-terra', reasoningEffort: ReasoningEffortId('low') })
  await f.send(); expect(f.wires.at(-1)!.model).toBe('gpt-5.6-terra')
  expect(f.wires.every(wire => wire.model !== 'gpt-6-astra')).toBe(true)
})

it('enforces the exact user-selected effort subset after catalog expansion', async () => {
  const f = await setup()
  await f.command('start', { maximumRequests: 5, models: ['gpt-5.6-sol', 'gpt-5.6-luna'],
    efforts: { 'gpt-5.6-sol': ['medium'], 'gpt-5.6-luna': ['low'] } })
  await f.send()
  expect((await f.execute('gpt-5.6-sol', 'high')).isError).toBe(true)
  expect((await f.execute('gpt-5.6-luna', 'max')).isError).toBe(true)
  expect((await f.execute('gpt-6-astra', 'low')).isError).toBe(true)
  expect((await f.execute('gpt-5.6-luna', 'low')).isError).not.toBe(true)
  await f.send(); expect(f.wires.at(-1)).toMatchObject({ model: 'gpt-5.6-luna', reasoning: { effort: 'low' } })
})

it('permits stop and manual takeover even when model discovery is unavailable', async () => {
  const f = await setup(); await f.start(); await f.send(); f.failCatalog()
  expect((await f.command('stop')).mode).toBe('stopped')
  expect((await f.command('manual')).mode).toBe('manual')
  expect((await f.state()).reserved).toBe(1)
})

it('revokes automation after the ordinary host stop button cancels a turn', async () => {
  const f = await setup(); await f.start()
  f.setReply(wire => new Promise((_resolve, reject) => wire.signal.addEventListener('abort', () => reject(wire.signal.reason), { once: true })))
  const sending = f.send(); await vi.waitFor(() => expect(f.wires).toHaveLength(1))
  f.agent.cancel({ kind: 'user' }); await sending
  expect(await f.state()).toMatchObject({ mode: 'stopped', reserved: 1 })
  expect(f.ctx.tools.get(ADAPTIVE_TASK_TOOL, f.agent)).toBeUndefined()
  await f.send('Cannot restart the automatic task'); expect(f.wires).toHaveLength(1)
})

it('keeps a failed journal activation interrupted until an explicit successful resume', async () => {
  const f = await setup()
  const flush = vi.spyOn(f.ctx.sessions, 'flush').mockRejectedValueOnce(new Error('Synthetic storage failure'))
  await expect(f.start()).rejects.toThrow('Synthetic storage failure')
  flush.mockRestore()
  expect(await f.state()).toMatchObject({ mode: 'interrupted', reserved: 0 })
  await f.send('No automatic execution after failed activation'); expect(f.wires).toHaveLength(0)
  await f.command('resume'); await f.send(); expect(f.wires).toHaveLength(1)
})

it.each(['stop', 'manual', 'dispose'] as const)('cancels a queued task before backend admission on %s', async action => {
  const f = await setup({ maxConcurrent: 1 }); await f.start()
  let release!: () => void
  const holding = f.governor.run({ lane: 'search' }, async transport => {
    const held = await transport.fetch(endpoint, { method: 'POST', body: JSON.stringify({ model: 'fixture', input: [] }) })
    await new Promise<void>(resolve => { release = resolve }); await held.text()
  })
  await vi.waitFor(() => expect(release).toBeTypeOf('function'))
  const sending = f.send()
  await vi.waitFor(() => expect(f.agent.session.requestHeader()).toBeDefined())
  if (action === 'dispose') f.runtime().dispose()
  else await f.command(action)
  release(); await holding; await sending
  expect(f.wires).toHaveLength(1)
  expect((await f.store.read(f.agent.id))!.reserved).toBe(0)
})
