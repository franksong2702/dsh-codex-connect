/** Real host + pi-ai + shared governor + private ledger/artifacts. Synthetic wire only. */
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm, realpath, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { zstdDecompressSync } from 'node:zlib'
import { Context } from '@deepseek-ai/cordis'
import { AgentRegistry } from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import Llm, { createUserMessage, ReasoningEffortId, ToolCallId } from '@deepseek-ai/dsh-llm'
import Sessions, { SessionId } from '@deepseek-ai/dsh-session'
import Projection from '@deepseek-ai/dsh-session-projection'
import Prompt from '@deepseek-ai/dsh-system-prompt'
import Tools from '@deepseek-ai/dsh-tools'
import Persistence from '@deepseek-ai/dsh-session-persistence-jsonl'
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
const answer = () => response({ type: 'message', id: 'm_test', role: 'assistant', phase: 'final_answer', status: 'completed', content: [{ type: 'output_text', text: 'Synthetic complete', annotations: [] }] })
const tool = (name: string, args: unknown, callId = `c_${randomUUID()}`) => response({ type: 'function_call', id: `fc_${randomUUID()}`, call_id: callId, name, arguments: JSON.stringify(args), status: 'completed' })
async function setup(options: { compression?: 'none' | 'zstd'; persistence?: boolean; childRoute?: typeof route; timeout?: number; maximum?: number } = {}) {
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
  if (options.persistence !== false) await ctx.plugin(Persistence, { root: join(root, 'sessions'), compression: options.compression ?? 'none', packChunks: true })
  const credentials = new OpenAICodexCredentialStore(join(root, '.synthetic-oauth.json'))
  const claim = Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: 'synthetic-delegation' } })).toString('base64url')
  await credentials.modify('openai-codex', async () => ({ type: 'oauth', access: `e30.${claim}.fixture`, refresh: 'fixture', accountId: 'synthetic-delegation', expires: Date.now() + 3600000 }))
  const ledger = new AdaptiveTaskDelegationLedger(join(root, 'tasks')), host = new TaskDelegationHost(ctx)
  const artifacts = new TaskDelegationArtifacts(join(root, 'artifacts'))
  const runtime = new AdaptiveTaskDelegation(ctx, { ledger, host, artifacts: () => artifacts })
  const governor = new OpenAICodexBackendRequests(undefined, undefined, 8, () => runtime.reserveAuxiliary())
  ctx.effect(() => () => governor.dispose())
  const adapter = createOpenAICodexAdapter(credentials, () => undefined, undefined, undefined, undefined, undefined, undefined, undefined, () => false, governor, runtime)
  ctx.llm.registerAdapter(['openai-codex'], adapter)
  const handle = await ctx.agents.create({ sessionId: SessionId('delegation-root'), meta: { cwd: root },
    agentOptions: { provider: 'openai-codex', model: route.model, reasoningEffort: ReasoningEffortId(route.effort) } })
  const parent = handle.agent, h = parent.session.header
  const identity = { sessionId: parent.id, sessionKey: taskIdentity(JSON.stringify([h.id, h.createdAt, h.cwd ?? '', h.isSeeded, h.parentSession ?? ''])), owner: taskIdentity('synthetic-owner') }
  await writeFile(join(root, 'notes.txt'), 'fixture first\nfixture second')
  const manifest = await TaskEvidenceManifest.approve(root, ['notes.txt']), sourceId = manifest.sources()[0]!.id
  const selected = options.childRoute ?? worker
  await new AdaptiveTaskStore(join(root, 'tasks')).update(parent.id, () => ({ version: 1, ...identity, runtime: taskIdentity('epoch'), revision: 1,
    mode: 'auto', route, capabilities: [{ model: route.model, efforts: [route.effort] }, { model: selected.model, efforts: [selected.effort] }],
    maximumRequests: options.maximum ?? 40, reserved: 0, selectionSeq: -1, portable: false, handoffSeq: -1, receipts: [{ id: randomUUID(), digest: taskIdentity('start') }] }))
  let doc = await ledger.migrate(identity, 1)
  doc = await ledger.configure(identity, doc.revision, { routes: [selected], sourceManifest: manifest.digest, sourceIds: [sourceId], maxRequests: 6, timeoutMs: options.timeout ?? 10000 })
  await ledger.resume(identity, doc.revision, doc.runtime)
  await runtime.install(parent, identity, manifest)
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
  return { root, ctx, parent, handle, ledger, host, artifacts, manifest, identity, runtime, governor, sourceId, args, findings, wires, parentCall, successful, send, read, repeat,
    setReply(fn: typeof reply) { reply = fn } }
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
it('does not mark memory-only host results durably delivered', async () => {
  const f = await setup({ persistence: false }); f.successful(); await f.send()
  expect((await f.read()).delegation.runs[0]).toMatchObject({ state: 'succeeded', cleanup: 'verified', delivery: 'pending' })
  expect(f.wires).toHaveLength(3); expect(await f.runtime.unresolved(f.parent)).toBe(true)
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
