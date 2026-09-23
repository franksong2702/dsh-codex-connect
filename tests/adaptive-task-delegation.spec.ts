/** Real host + pi-ai + shared governor + private ledger/artifacts. Synthetic wire only. */
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm, realpath, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { zstdDecompressSync } from 'node:zlib'
import { Context } from '@deepseek-ai/cordis'
import { AgentRegistry, installModelSelection } from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import Llm, { createUserMessage, ReasoningEffortId, ToolCallId } from '@deepseek-ai/dsh-llm'
import Sessions, { SessionId } from '@deepseek-ai/dsh-session'
import Projection from '@deepseek-ai/dsh-session-projection'
import Prompt from '@deepseek-ai/dsh-system-prompt'
import Tools from '@deepseek-ai/dsh-tools'
import Persistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import Meter from '@deepseek-ai/dsh-token-meter'
import Compaction from '@deepseek-ai/dsh-compaction-basic'
import { afterEach, expect, it, vi } from 'vitest'
import { AdaptiveTaskDelegation, TASK_DELEGATE_TOOL } from '../src/adaptive-task-delegation.ts'
import { TaskDelegationHost } from '../src/adaptive-task-delegation-host.ts'
import { TaskEvidenceManifest } from '../src/adaptive-task-evidence.ts'
import { TaskDelegationArtifacts } from '../src/adaptive-task-artifacts.ts'
import { AdaptiveTaskDelegationLedger } from '../src/adaptive-task-delegation-ledger.ts'
import type { TaskLedgerDocument } from '../src/adaptive-task-delegation-contract.ts'
import { AdaptiveTaskStore, taskIdentity } from '../src/adaptive-task-store.ts'
import { OpenAICodexCredentialStore } from '../src/store.ts'
import { OpenAICodexBackendRequests } from '../src/backend-request.ts'
import { createOpenAICodexAdapter } from '../src/adapter.ts'
import { ADAPTIVE_TASK_TOOL } from '../src/adaptive-task-contract.ts'

const route = { model: 'gpt-5.6-sol', effort: 'medium' }
const worker = { model: 'gpt-5.6-luna', effort: 'max' }
const roots: string[] = [], contexts: Context[] = []
afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
  vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})
function response(item: Record<string, unknown>) {
  return new Response([
    { type: 'response.output_item.added', output_index: 0, item },
    { type: 'response.output_item.done', output_index: 0, item },
    { type: 'response.completed', response: { id: 'r_test', status: 'completed', output: [item], usage: { input_tokens: 20, output_tokens: 10, total_tokens: 30 } } },
  ].map(event => `data: ${JSON.stringify(event)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } })
}
const answer = (text = 'Synthetic complete') => response({ type: 'message', id: 'm_test', role: 'assistant', phase: 'final_answer', status: 'completed', content: [{ type: 'output_text', text, annotations: [] }] })
const tool = (name: string, args: unknown, callId = `c_${randomUUID()}`) => response({ type: 'function_call', id: `fc_${randomUUID()}`, call_id: callId, name, arguments: JSON.stringify(args), status: 'completed' })
async function setup(options: { compression?: 'none' | 'zstd'; persistence?: boolean; childRoute?: typeof route; timeout?: number; maximum?: number; nativeCompaction?: boolean; delegation?: boolean } = {}) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'task-delegation-'))); roots.push(root)
  vi.stubEnv('DSH_HOME', root); vi.stubEnv('OTEL_SDK_DISABLED', 'true')
  vi.stubGlobal('WebSocket', class { constructor() { throw new Error('No live wire') } })
  const wires: Array<Record<string, any>> = []
  let reply: (wire: Record<string, any>) => Response | Promise<Response> = () => answer()
  vi.stubGlobal('fetch', vi.fn(async (url: unknown, init: RequestInit) => {
    expect(String(url)).toBe('https://chatgpt.com/backend-api/codex/responses')
    const raw = new Headers(init.headers).get('content-encoding') === 'zstd' ? zstdDecompressSync(init.body as Uint8Array).toString('utf8') : String(init.body)
    const wire = JSON.parse(raw); wires.push(wire); expect(wires.length).toBeLessThan(15)
    return reply({ ...wire, signal: init.signal })
  }))
  const ctx = new Context(); contexts.push(ctx)
  for (const plugin of [Llm, Sessions, Projection, AgentRegistry, Prompt, Tools]) await ctx.plugin(plugin)
  await ctx.plugin(AgentLoop, { agents: [] })
  if (options.persistence !== false) await ctx.plugin(Persistence, { root: join(root, 'sessions'), compression: options.compression ?? 'none' })
  const credentials = new OpenAICodexCredentialStore(join(root, '.synthetic-oauth.json'))
  const claim = Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: 'synthetic-delegation' } })).toString('base64url')
  await credentials.modify('openai-codex', async () => ({ type: 'oauth', access: `e30.${claim}.fixture`, refresh: 'fixture', accountId: 'synthetic-delegation', expires: Date.now() + 3600000 }))
  const ledger = new AdaptiveTaskDelegationLedger(join(root, 'tasks')), host = new TaskDelegationHost(ctx)
  const artifacts = new TaskDelegationArtifacts(join(root, 'artifacts'))
  const runtime = new AdaptiveTaskDelegation(ctx, { ledger, host, artifacts: () => artifacts })
  let dispatch = runtime
  const governor = new OpenAICodexBackendRequests(undefined, undefined, 8, () => dispatch.reserveAuxiliary())
  ctx.effect(() => () => governor.dispose())
  const adapter = createOpenAICodexAdapter(credentials, () => undefined, undefined, undefined, undefined, undefined, undefined, undefined, () => options.nativeCompaction === true, governor,
    { stream: (options, delegate) => dispatch.stream(options, delegate) })
  ctx.llm.registerAdapter(['openai-codex'], adapter)
  const handle = await ctx.agents.create({ sessionId: SessionId('delegation-root'), meta: { cwd: root },
    agentOptions: { provider: 'openai-codex', model: route.model, reasoningEffort: ReasoningEffortId(route.effort) } })
  const parent = handle.agent, h = parent.session.header
  ctx.effect(() => installModelSelection(parent.ctx, { get current() {
    const explicit = parent.session.snapshotEvents().findLast(event => event.type === 'model/selection')?.data
    if (explicit !== undefined) return { provider: explicit.provider, model: explicit.model,
      ...(explicit.reasoningEffort === undefined ? {} : { reasoningEffort: ReasoningEffortId(explicit.reasoningEffort) }) }
    return parent.options as { provider: string; model: string }
  }, assembled: undefined }))
  const identity = { sessionId: parent.id, sessionKey: taskIdentity(JSON.stringify([h.id, h.createdAt, h.cwd ?? '', h.isSeeded, h.parentSession ?? ''])), owner: taskIdentity('synthetic-owner') }
  await writeFile(join(root, 'notes.txt'), 'fixture first\nfixture second')
  const manifest = await TaskEvidenceManifest.approve(root, ['notes.txt']), sourceId = manifest.sources()[0]!.id
  const selected = options.childRoute ?? worker
  await new AdaptiveTaskStore(join(root, 'tasks')).update(parent.id, () => ({ version: 1, ...identity, runtime: taskIdentity('epoch'), revision: 1,
    mode: 'auto', route, capabilities: [{ model: route.model, efforts: [route.effort] }, { model: selected.model, efforts: [selected.effort] }],
    maximumRequests: options.maximum ?? 40, reserved: 0, selectionSeq: -1, portable: false, handoffSeq: -1, receipts: [{ id: randomUUID(), digest: taskIdentity('start') }] }))
  let doc = await ledger.migrate(identity, 1)
  if (options.delegation !== false) doc = await ledger.configure(identity, doc.revision, { routes: [selected], sourceManifest: manifest.digest, sourceIds: [sourceId], maxRequests: 6, timeoutMs: options.timeout ?? 10000 })
  await ledger.resume(identity, doc.revision, doc.runtime)
  await runtime.install(parent, identity, options.delegation === false ? undefined : manifest)
  const args = { goal: 'Inspect approved notes', expectedOutput: 'Cited findings', model: selected.model, effort: selected.effort, sourceIds: [sourceId] }
  const findings = { summary: 'Synthetic review', findings: [{ text: 'First line observed', references: [{ sourceId, start: 1, end: 1, digest: taskIdentity('fixture first') }] }] }
  const parentCall = `parent_${randomUUID()}`
  let count = 0
  const successful = () => { reply = () => {
    count++
    if (count === 1) return tool(TASK_DELEGATE_TOOL, args, parentCall)
    if (count === 2) return tool('read_task_evidence', { sourceId, start: 1, end: 1 })
    if (count === 3) return tool('submit_task_findings', findings)
    return answer()
  } }
  const send = async () => { parent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Synthetic parent task' }] })); await parent.whenIdle() }
  const read = async () => await ledger.read(identity) as TaskLedgerDocument
  const repeat = () => {
    const call = parent.session.snapshotEvents().find(event => event.type === 'tool/call' && event.data.name === TASK_DELEGATE_TOOL)
    return ctx.tools.execute({ agent: parent, callId: call?.type === 'tool/call' ? call.data.callId : ToolCallId(parentCall), name: TASK_DELEGATE_TOOL, arguments: args, signal: new AbortController().signal })
  }
  const select = (model = worker.model, effort = worker.effort) => ctx.tools.execute({ agent: parent, callId: ToolCallId(randomUUID()),
    name: ADAPTIVE_TASK_TOOL, arguments: { model, effort, reason: 'Synthetic main task transition' }, signal: new AbortController().signal })
  return { root, ctx, parent, handle, ledger, host, artifacts, manifest, identity, runtime, governor, sourceId, args, findings, wires, parentCall, successful, send, read, repeat, select,
    setReply(fn: typeof reply) { reply = fn }, setDispatch(value: AdaptiveTaskDelegation) { dispatch = value } }
}

it.each(['none', 'zstd'] as const)('executes read/submit through real host and shared governor with durable normal delivery (%s)', async compression => {
  const f = await setup({ compression }); f.successful(); await f.send()
  const doc = await f.read(), run = doc.delegation.runs[0]!
  expect(run).toMatchObject({ state: 'succeeded', cleanup: 'verified', delivery: 'recorded' })
  expect(doc.reserved).toBe(f.wires.length); expect(run.attempts).toHaveLength(2)
  expect(f.wires.map(w => [w.model, w.reasoning.effort])).toEqual([[route.model, route.effort], [worker.model, worker.effort], [worker.model, worker.effort], [route.model, route.effort]])
  expect(f.ctx.agents.list()).toEqual([f.parent]); expect(await f.runtime.unresolved(f.parent)).toBe(false)
  expect(await f.artifacts.get(run.resultDigest!)).toEqual(f.findings)
  const before = f.wires.length, replay = await f.repeat(); expect(replay.isError, JSON.stringify(replay)).toBe(false)
  expect(f.wires).toHaveLength(before); expect((await f.read()).reserved).toBe(before)
})
it('selects a second authorized child route instead of hard-coding Luna/Low', async () => {
  const selected = { model: 'gpt-5.6-terra', effort: 'high' }, f = await setup({ childRoute: selected })
  f.successful(); await f.send(); expect((await f.read()).delegation.runs[0]!.state).toBe('succeeded')
  expect(f.wires[1]!.model).toBe(selected.model); expect(f.wires[1]!.reasoning.effort).toBe(selected.effort)
})
it('refuses a child before preparation when the parent call has no durability listener', async () => {
  const f = await setup({ persistence: false })
  f.setReply(() => f.wires.length === 1 ? tool(TASK_DELEGATE_TOOL, f.args, f.parentCall) : answer())
  await f.send()
  expect((await f.read()).delegation.runs).toEqual([])
  expect(f.wires).toHaveLength(2); expect(f.ctx.agents.list()).toEqual([f.parent])
})
it('rejects out-of-scope model/source and forged parent call without spawning', async () => {
  const f = await setup()
  expect((await f.repeat()).isError).toBe(true)
  f.setReply(() => f.wires.length === 1 ? tool(TASK_DELEGATE_TOOL, { ...f.args, model: 'gpt-6-astra' }, f.parentCall) : answer())
  await f.send(); expect((await f.read()).delegation.runs).toEqual([]); expect(f.ctx.agents.list()).toEqual([f.parent])
})
it('unobserved findings fail and parent receives a bounded failed outcome', async () => {
  const f = await setup()
  f.setReply(() => f.wires.length === 1 ? tool(TASK_DELEGATE_TOOL, f.args, f.parentCall)
    : f.wires.length === 2 ? tool('submit_task_findings', f.findings) : answer())
  await f.send(); expect((await f.read()).delegation.runs[0]).toMatchObject({ state: 'failed', cleanup: 'verified', resultDigest: null })
  expect(f.ctx.agents.list()).toEqual([f.parent])
})
it('retains a parent request and stops a child at the shared budget floor', async () => {
  const f = await setup({ maximum: 3 }); f.successful(); await f.send()
  const doc = await f.read(); expect(doc.reserved).toBe(3); expect(f.wires).toHaveLength(3)
  expect(doc.delegation.runs[0]).toMatchObject({ state: 'failed', cleanup: 'verified' }); expect(doc.delegation.runs[0]!.attempts).toHaveLength(1)
})
it.each(['manual', 'stopped'] as const)('revocation during a pending child request prevents later fetch and drains ownership (%s)', async mode => {
  const f = await setup(); let reached!: () => void
  const waiting = new Promise<void>(resolve => { reached = resolve })
  f.setReply(wire => {
    if (f.wires.length === 1) return tool(TASK_DELEGATE_TOOL, f.args, f.parentCall)
    reached()
    return new Promise<Response>((_resolve, reject) => { wire.signal.addEventListener('abort', () => reject(wire.signal.reason), { once: true }) })
  })
  const running = f.send(); await waiting
  await f.runtime.revoke(f.parent, (await f.read()).revision, mode); await running
  expect(f.wires).toHaveLength(2)
  expect((await f.read()).delegation.runs[0]).toMatchObject({ state: 'cancelled', cleanup: 'verified' })
  expect(f.ctx.agents.list()).toEqual([f.parent])
})
it('deadline and disposal cancel owned transport without refund or subsequent fetch', async () => {
  const f = await setup({ timeout: 1000 }); let reached!: () => void
  const waiting = new Promise<void>(resolve => { reached = resolve })
  f.setReply(wire => {
    if (f.wires.length === 1) return tool(TASK_DELEGATE_TOOL, f.args, f.parentCall)
    reached(); return new Promise<Response>((_resolve, reject) => wire.signal.addEventListener('abort', () => reject(wire.signal.reason), { once: true }))
  })
  const running = f.send(); await waiting; await f.runtime.dispose(); await running
  expect(f.wires).toHaveLength(2); expect((await f.read()).reserved).toBe(2)
  expect((await f.read()).delegation.runs[0]).toMatchObject({ state: 'cancelled', cleanup: 'verified' })
})
it('create failure yields no child fetch, preserves receipt and does not retry', async () => {
  const f = await setup(); vi.spyOn(f.host, 'create').mockRejectedValue(new Error('Synthetic create failure'))
  f.successful(); await f.send()
  expect((await f.read()).delegation.runs[0]).toMatchObject({ state: 'failed', cleanup: 'verified', attempts: [] })
  expect(f.host.create).toHaveBeenCalledTimes(1); await f.repeat(); expect(f.host.create).toHaveBeenCalledTimes(1)
})
it('cleanup failure blocks new root dispatch and is not promoted to success', async () => {
  const f = await setup(), original = f.host.create.bind(f.host)
  vi.spyOn(f.host, 'create').mockImplementation(async (...args) => {
    const owned = await original(...args)
    return { ...owned, dispose: async () => { await owned.dispose(); throw new Error('Synthetic verification failure') } }
  })
  f.successful(); await f.send()
  expect((await f.read()).delegation.runs[0]).toMatchObject({ state: 'settling', cleanup: 'failed' })
  expect(f.wires).toHaveLength(3); expect(await f.runtime.unresolved(f.parent)).toBe(true)
  await expect(f.runtime.dispose()).rejects.toThrow('TASK_CHILD_CLEANUP_UNVERIFIED')
})
it('lost reply reconciliation uses the original durable call/result, without new provider work', async () => {
  const f = await setup(); f.successful()
  const reconcile = vi.spyOn(f.runtime, 'reconcile').mockResolvedValue(undefined)
  await f.send(); reconcile.mockRestore()
  expect((await f.read()).delegation.runs[0]!.delivery).toBe('pending')
  const before = f.wires.length
  await f.runtime.reconcile(f.parent)
  expect((await f.read()).delegation.runs[0]!.delivery).toBe('recorded'); expect(f.wires).toHaveLength(before)
})

it.each(['none', 'zstd'] as const)('unloads/resumes the persisted parent and reconciles a lost reply without respawning (%s)', async compression => {
  const f = await setup({ compression }); f.successful()
  vi.spyOn(f.runtime, 'reconcile').mockResolvedValue(undefined)
  await f.send(); const before = await f.read(), wireCount = f.wires.length
  expect(before.delegation.runs[0]!.delivery).toBe('pending')
  await f.runtime.dispose(); await f.handle.dispose()
  const restored = await f.ctx.agents.resume({ resumeSessionId: SessionId(f.identity.sessionId),
    agentOptions: { provider: 'openai-codex', model: route.model, reasoningEffort: ReasoningEffortId(route.effort) } })
  const fresh = new AdaptiveTaskDelegation(f.ctx, { ledger: f.ledger, host: f.host, artifacts: () => f.artifacts })
  await fresh.recover(restored.agent, f.identity, before.revision, before.runtime, taskIdentity('fresh-epoch'))
  const after = await f.read()
  expect(after.mode).toBe('interrupted'); expect(after.reserved).toBe(before.reserved)
  expect(after.delegation.runs[0]).toMatchObject({ state: 'succeeded', delivery: 'recorded' })
  expect(f.ctx.tools.get(TASK_DELEGATE_TOOL, restored.agent)).toBeUndefined()
  expect(f.wires).toHaveLength(wireCount); await restored.dispose()
})
it('a publication failure cleans the owned child before any child request', async () => {
  const f = await setup(); vi.spyOn(f.ledger, 'publish').mockRejectedValue(new Error('Synthetic publication failure'))
  f.setReply(() => f.wires.length === 1 ? tool(TASK_DELEGATE_TOOL, f.args, f.parentCall) : answer())
  await f.send()
  expect((await f.read()).delegation.runs[0]).toMatchObject({ state: 'failed', cleanup: 'verified', childSessionId: null, attempts: [] })
  expect(f.wires).toHaveLength(2); expect(f.ctx.agents.list()).toEqual([f.parent])
})
it('revocation after host creation but before ledger publication never dispatches the child', async () => {
  const f = await setup(), original = f.host.create.bind(f.host)
  let reached!: () => void, release!: () => void
  const waiting = new Promise<void>(resolve => { reached = resolve }), gate = new Promise<void>(resolve => { release = resolve })
  vi.spyOn(f.host, 'create').mockImplementation(async (...args) => {
    const owned = await original(...args); args[2].addEventListener('abort', release, { once: true }); reached(); await gate; return owned
  })
  f.successful(); const running = f.send(); await waiting
  const stopping = f.runtime.revoke(f.parent, (await f.read()).revision, 'stopped')
  await stopping; await running
  expect(f.wires).toHaveLength(1); expect(f.ctx.agents.list()).toEqual([f.parent])
  expect((await f.read()).delegation.runs[0]).toMatchObject({ state: 'cancelled', cleanup: 'verified', attempts: [] })
})
it('the actual child deadline cancels a hung request and preserves the spent debit', async () => {
  const f = await setup({ timeout: 1000 })
  f.setReply(wire => {
    if (f.wires.length === 1) return tool(TASK_DELEGATE_TOOL, f.args, f.parentCall)
    if (f.wires.length === 2) return new Promise<Response>((_resolve, reject) => wire.signal.addEventListener('abort', () => reject(wire.signal.reason), { once: true }))
    return answer()
  })
  await f.send(); const doc = await f.read()
  expect(doc.delegation.runs[0]).toMatchObject({ state: 'cancelled', cleanup: 'verified' })
  expect(doc.reserved).toBe(f.wires.length); expect(doc.delegation.runs[0]!.attempts).toHaveLength(1)
})
it('ordinary parent Stop cancels child ownership and is consumed as durable revocation', async () => {
  const f = await setup(); let reached!: () => void
  const waiting = new Promise<void>(resolve => { reached = resolve })
  f.setReply(wire => {
    if (f.wires.length === 1) return tool(TASK_DELEGATE_TOOL, f.args, f.parentCall)
    reached(); return new Promise<Response>((_resolve, reject) => wire.signal.addEventListener('abort', () => reject(wire.signal.reason), { once: true }))
  })
  const running = f.send(); await waiting; f.parent.cancel({ kind: 'user' }); await running
  await f.runtime.unresolved(f.parent)
  expect((await f.read()).mode).toBe('stopped'); expect(f.wires).toHaveLength(2)
  expect(f.ctx.agents.list()).toEqual([f.parent])
})
it('unknown live descendants and auxiliary child work cannot borrow a root scope', async () => {
  const f = await setup()
  const stranger = await f.parent.ctx.agents.create({ sessionId: SessionId('unmanaged-child'), meta: { parentSession: f.parent.id },
    agentOptions: { provider: 'openai-codex', model: worker.model, reasoningEffort: ReasoningEffortId(worker.effort) } })
  stranger.agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Cannot dispatch' }] }))
  await stranger.agent.whenIdle(); expect(f.wires).toHaveLength(0)
  const grandchild = await stranger.agent.ctx.agents.create({ sessionId: SessionId('unmanaged-grandchild'), meta: { parentSession: stranger.agent.id },
    agentOptions: { provider: 'openai-codex', model: worker.model, reasoningEffort: ReasoningEffortId(worker.effort) } })
  grandchild.agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Cannot dispatch either' }] }))
  await grandchild.agent.whenIdle()
  await expect(f.ctx.agents.withInitiator(grandchild.agent, () => f.runtime.reserveAuxiliary())).rejects.toThrow('TASK_CHILD_AUXILIARY_DENIED')
  expect(f.wires).toHaveLength(0); expect((await f.read()).reserved).toBe(0)
  await grandchild.dispose(); await stranger.dispose()
})

it('v2 main model changes on the next real request within the same grant and shared counter', async () => {
  const f = await setup()
  f.setReply(() => f.wires.length === 1 ? tool(ADAPTIVE_TASK_TOOL, { ...worker, reason: 'Continue using another approved route' }) : answer())
  await f.send()
  expect(f.wires.map(w => [w.model, w.reasoning.effort])).toEqual([[route.model, route.effort], [worker.model, worker.effort]])
  expect((await f.read()).reserved).toBe(2); expect((await f.read()).route).toEqual(worker)
  expect((await f.select(route.model, 'high')).isError).toBe(true)
  expect((await f.select('gpt-6-astra', 'max')).isError).toBe(true)
})
it('a migrated v2 root without delegation consent retains main routing but exposes no child tool', async () => {
  const f = await setup({ delegation: false })
  expect((await f.read()).delegation.grant).toBeNull()
  expect(f.ctx.tools.get(TASK_DELEGATE_TOOL, f.parent)).toBeUndefined()
  expect((await f.select()).isError).toBe(false)
  await f.send()
  expect(f.wires.map(w => w.model)).toEqual([worker.model]); expect((await f.read()).reserved).toBe(1)
  expect((await f.read()).delegation.runs).toEqual([])
})
it('an unavailable installed model is rejected without fallback, dispatch or a new debit', async () => {
  const f = await setup()
  vi.spyOn(f.ctx.llm, 'resolveModelInfo').mockRejectedValue(new Error('Synthetic unavailable catalog'))
  expect((await f.select()).isError).toBe(true)
  await f.send()
  expect(f.wires).toHaveLength(0); expect((await f.read()).reserved).toBe(0)
  expect((await f.read()).route).toEqual(route)
})
it('manual takeover discards a queued route and restores the ordinary picker without resetting spent budget', async () => {
  const f = await setup(); await f.send(); expect((await f.select()).isError).toBe(false)
  const before = await f.read(); await f.runtime.revoke(f.parent, before.revision, 'manual')
  f.parent.session.append('model/selection', { provider: 'openai-codex', model: 'gpt-5.6-terra', reasoningEffort: ReasoningEffortId('low') })
  await f.send()
  expect(f.wires.map(w => w.model)).toEqual([route.model, 'gpt-5.6-terra'])
  expect((await f.read()).reserved).toBe(before.reserved)
  expect(f.ctx.tools.get(ADAPTIVE_TASK_TOOL, f.parent)).toBeUndefined()
  expect(f.ctx.tools.get(TASK_DELEGATE_TOOL, f.parent)).toBeUndefined()
})
it('a native picker change automatically withdraws v2 control before the next request', async () => {
  const f = await setup(); await f.send()
  f.parent.session.append('model/selection', { provider: 'openai-codex', model: 'gpt-5.6-terra', reasoningEffort: ReasoningEffortId('low') })
  await f.send(); expect((await f.read()).mode).toBe('manual'); expect((await f.read()).reserved).toBe(1)
  expect(f.wires.at(-1)!.model).toBe('gpt-5.6-terra')
})
it('a native picker change while creating a child revokes its first fetch and restores ordinary parent control', async () => {
  const f = await setup(), original = f.host.create.bind(f.host)
  let reached!: () => void, release!: () => void
  const waiting = new Promise<void>(resolve => { reached = resolve }), gate = new Promise<void>(resolve => { release = resolve })
  vi.spyOn(f.host, 'create').mockImplementation(async (...args) => {
    const owned = await original(...args); reached(); await gate; return owned
  })
  f.setReply(() => f.wires.length === 1 ? tool(TASK_DELEGATE_TOOL, f.args, f.parentCall) : answer())
  const running = f.send(); await waiting
  f.parent.session.append('model/selection', { provider: 'openai-codex', model: 'gpt-5.6-terra', reasoningEffort: ReasoningEffortId('low') })
  release(); await running
  expect(f.wires.map(w => w.model)).toEqual([route.model, 'gpt-5.6-terra'])
  expect((await f.read()).mode).toBe('manual'); expect((await f.read()).reserved).toBe(1)
  expect((await f.read()).delegation.runs[0]).toMatchObject({ state: 'cancelled', cleanup: 'verified', attempts: [] })
  expect(f.ctx.agents.list()).toEqual([f.parent])
})
it.each([false, true])('v2 compaction is counted and handoff restores the original journal (native=%s)', async nativeCompaction => {
  const f = await setup({ nativeCompaction })
  await f.ctx.plugin(Meter); await f.ctx.plugin(Compaction, { auto: false, retainTokens: 0 })
  f.setReply(wire => wire.input.some((item: any) => item.type === 'compaction_trigger')
    ? response({ type: 'compaction', id: 'v2-native', encrypted_content: 'synthetic-v2-native' })
    : answer('Original long evidence. '.repeat(600)))
  await f.send(); await f.send()
  if (!nativeCompaction) f.setReply(() => answer('Compact summary'))
  expect(await f.ctx.compaction.compactNow(f.parent, new AbortController().signal)).toBeTruthy()
  expect((await f.read()).reserved).toBe(f.wires.length)
  expect((await f.select()).isError).toBe(false)
  f.setReply(() => answer()); await f.send()
  expect(f.wires.at(-1)!.model).toBe(worker.model)
  expect(JSON.stringify(f.wires.at(-1)!.input)).toContain('Synthetic parent task')
  expect(f.wires.at(-1)!.input.some((item: any) => item.type === 'compaction')).toBe(false)
  expect((await f.read()).reserved).toBe(f.wires.length)
  // New-route compaction must remain useful; a later manual handoff must expand it again.
  f.setReply(wire => wire.input.some((item: any) => item.type === 'compaction_trigger')
    ? response({ type: 'compaction', id: 'v2-new-native', encrypted_content: 'synthetic-v2-target-native' })
    : answer('Target-route long evidence. '.repeat(600)))
  await f.send()
  f.setReply(wire => wire.input.some((item: any) => item.type === 'compaction_trigger')
    ? response({ type: 'compaction', id: 'v2-new-native', encrypted_content: 'synthetic-v2-target-native' })
    : answer('Target later brief response'))
  await f.send()
  if (!nativeCompaction) f.setReply(() => answer('TARGET V2 COMPACTED CONTEXT'))
  expect(await f.ctx.compaction.compactNow(f.parent, new AbortController().signal)).toBeTruthy()
  f.setReply(() => answer()); await f.send()
  const compacted = JSON.stringify(f.wires.at(-1)!.input)
  expect(compacted).toContain(nativeCompaction ? 'synthetic-v2-target-native' : 'TARGET V2 COMPACTED CONTEXT')
  expect(compacted).not.toContain('Target-route long evidence.')
  const beforeManual = await f.read()
  expect(beforeManual.reserved).toBe(f.wires.length)
  await f.runtime.revoke(f.parent, beforeManual.revision, 'manual')
  f.parent.session.append('model/selection', { provider: 'openai-codex', model: 'gpt-5.6-terra', reasoningEffort: ReasoningEffortId('low') })
  await f.send()
  expect(f.wires.at(-1)!.model).toBe('gpt-5.6-terra')
  expect(JSON.stringify(f.wires.at(-1)!.input)).toContain('Synthetic parent task')
  expect(f.wires.at(-1)!.input.some((item: any) => item.type === 'compaction')).toBe(false)
  expect((await f.read()).reserved).toBe(beforeManual.reserved)
})
it('v2 title-purpose and direct auxiliary calls share the root counter without double debit', async () => {
  const f = await setup(); await f.send()
  for await (const _ of f.ctx.llm.stream({ provider: 'openai-codex', model: route.model, purpose: 'session-title', sessionId: f.parent.id,
    messages: [createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Synthetic title' }] })] })) { /* consume */ }
  await f.ctx.agents.withInitiator(f.parent, () => f.governor.run({ lane: 'search' }, async scope => {
    const response = await scope.fetch('https://chatgpt.com/backend-api/codex/responses', { method: 'POST', body: JSON.stringify({ model: route.model, input: [], tools: [] }) })
    await response.text()
  }))
  expect(f.wires).toHaveLength(3); expect((await f.read()).reserved).toBe(3)
})
it('v2 main-model changes cannot run while a child is unresolved', async () => {
  const f = await setup(); let reached!: () => void
  const wait = new Promise<void>(resolve => { reached = resolve })
  f.setReply(wire => f.wires.length === 1 ? tool(TASK_DELEGATE_TOOL, f.args, f.parentCall) : new Promise<Response>((_resolve, reject) => {
    reached(); wire.signal.addEventListener('abort', () => reject(wire.signal.reason), { once: true })
  }))
  const running = f.send(); await wait
  expect((await f.select()).isError).toBe(true)
  await f.runtime.revoke(f.parent, (await f.read()).revision, 'stopped'); await running
  expect((await f.read()).route).toEqual(route); expect(f.wires).toHaveLength(2)
})
it('explicit same-owner idle resume reattaches tools without resetting budget or auto-respawning children', async () => {
  const f = await setup(); await f.send(); await f.runtime.dispose()
  const old = await f.read(), fresh = new AdaptiveTaskDelegation(f.ctx, { ledger: f.ledger, host: f.host, artifacts: () => f.artifacts })
  await fresh.recover(f.parent, f.identity, old.revision, old.runtime, taskIdentity('new-v2-epoch'))
  expect(f.ctx.tools.get(ADAPTIVE_TASK_TOOL, f.parent)).toBeUndefined()
  await expect(fresh.resume(f.parent, { ...f.identity, owner: taskIdentity('another-owner') }, (await f.read()).revision)).rejects.toThrow('TASK_OWNER_MISMATCH')
  await fresh.resume(f.parent, f.identity, (await f.read()).revision)
  expect((await f.read()).mode).toBe('auto'); expect((await f.read()).reserved).toBe(1)
  expect(f.ctx.tools.get(ADAPTIVE_TASK_TOOL, f.parent)).toBeDefined(); expect(f.wires).toHaveLength(1)
  f.setDispatch(fresh); await f.send()
  expect(f.wires).toHaveLength(2); expect((await f.read()).reserved).toBe(2)
  await fresh.dispose()
})
it('resume never overrides a manual picker change made while interrupted', async () => {
  const f = await setup(); await f.send(); await f.runtime.dispose()
  const old = await f.read(), fresh = new AdaptiveTaskDelegation(f.ctx, { ledger: f.ledger, host: f.host, artifacts: () => f.artifacts })
  await fresh.recover(f.parent, f.identity, old.revision, old.runtime, taskIdentity('picker-recovery'))
  f.parent.session.append('model/selection', { provider: 'openai-codex', model: 'gpt-5.6-terra', reasoningEffort: ReasoningEffortId('low') })
  await expect(fresh.resume(f.parent, f.identity, (await f.read()).revision)).rejects.toThrow('TASK_MANUAL_SELECTION_CHANGED')
  expect((await f.read()).mode).toBe('interrupted'); expect((await f.read()).reserved).toBe(1)
  expect(f.ctx.tools.get(ADAPTIVE_TASK_TOOL, f.parent)).toBeUndefined()
  await fresh.dispose()
})
it('tool registration failure during explicit resume withdraws all authority and persists stopped', async () => {
  const f = await setup(); await f.send(); await f.runtime.dispose()
  const old = await f.read(), fresh = new AdaptiveTaskDelegation(f.ctx, { ledger: f.ledger, host: f.host, artifacts: () => f.artifacts })
  await fresh.recover(f.parent, f.identity, old.revision, old.runtime, taskIdentity('registration-recovery'))
  vi.spyOn(f.parent.ctx.tools, 'register').mockImplementation(() => { throw new Error('Synthetic tool registration failure') })
  await expect(fresh.resume(f.parent, f.identity, (await f.read()).revision)).rejects.toThrow('Synthetic tool registration failure')
  expect((await f.read()).mode).toBe('stopped'); expect((await f.read()).reserved).toBe(1)
  expect(f.ctx.tools.get(ADAPTIVE_TASK_TOOL, f.parent)).toBeUndefined()
  f.setDispatch(fresh); await f.send(); expect(f.wires).toHaveLength(1)
  await fresh.dispose()
})
