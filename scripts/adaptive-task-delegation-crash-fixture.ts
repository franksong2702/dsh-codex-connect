/** Real parent/child execution, externally killed after a completed durable operation. Synthetic transport only. */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { zstdDecompressSync } from 'node:zlib'
import { Context } from '@deepseek-ai/cordis'
import { AgentRegistry } from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import Llm, { createUserMessage, ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import Sessions, { SessionId } from '@deepseek-ai/dsh-session'
import Projection from '@deepseek-ai/dsh-session-projection'
import Prompt from '@deepseek-ai/dsh-system-prompt'
import Tools from '@deepseek-ai/dsh-tools'
import Persistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import { AdaptiveTaskDelegation, TASK_DELEGATE_TOOL } from '../src/adaptive-task-delegation.ts'
import { TaskDelegationHost } from '../src/adaptive-task-delegation-host.ts'
import { TaskEvidenceManifest } from '../src/adaptive-task-evidence.ts'
import { TaskDelegationArtifacts } from '../src/adaptive-task-artifacts.ts'
import { AdaptiveTaskDelegationLedger } from '../src/adaptive-task-delegation-ledger.ts'
import type { LedgerIdentity } from '../src/adaptive-task-delegation-ledger.ts'
import type { TaskLedgerDocument } from '../src/adaptive-task-delegation-contract.ts'
import { AdaptiveTaskStore, taskIdentity } from '../src/adaptive-task-store.ts'
import { OpenAICodexCredentialStore } from '../src/store.ts'
import { OpenAICodexBackendRequests } from '../src/backend-request.ts'
import { createOpenAICodexAdapter } from '../src/adapter.ts'

const [directory, phase, stage] = process.argv.slice(2)
const stages = ['prepared', 'host-created-before-ledger-publish', 'published', 'child-reserved-before-fetch',
  'result-artifact-before-settle', 'settled-before-cleanup', 'cleaned-before-parent-tool-result',
  'parent-result-flushed-before-delivery', 'delivery-recorded']
assert.ok(directory && (phase === 'write' || phase === 'recover') && stages.includes(stage!))
const root = directory!, oldEpoch = taskIdentity('crash-old-epoch'), newEpoch = taskIdentity('crash-new-epoch')
const parentId = SessionId('delegation-crash-root'), route = { model: 'gpt-5.6-sol', effort: 'medium' }
const worker = { model: 'gpt-5.6-luna', effort: 'max' }, parentCall = 'crash-parent-call'
let sourceId = '', fetches = 0, childCreates = 0
const wires: Array<{ model: string; effort: string }> = []

function response(item: Record<string, unknown>): Response {
  const events = [{ type: 'response.output_item.added', output_index: 0, item },
    { type: 'response.output_item.done', output_index: 0, item },
    { type: 'response.completed', response: { id: 'synthetic-crash', status: 'completed', output: [item],
      usage: { input_tokens: 20, output_tokens: 10, total_tokens: 30 } } }]
  return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''),
    { headers: { 'content-type': 'text/event-stream' } })
}
function tool(name: string, args: unknown, callId: string = randomUUID()): Response {
  return response({ type: 'function_call', id: `fc_${randomUUID()}`, call_id: callId, name,
    arguments: JSON.stringify(args), status: 'completed' })
}
globalThis.fetch = async (url, init) => {
  fetches++
  assert.equal(phase, 'write', 'Recovery must never attempt transport')
  assert.equal(String(url), 'https://chatgpt.com/backend-api/codex/responses')
  const raw = new Headers(init?.headers).get('content-encoding') === 'zstd'
    ? zstdDecompressSync(init!.body as Uint8Array).toString('utf8') : String(init?.body)
  const wire = JSON.parse(raw)
  const selected = fetches === 1 ? route : worker
  assert.equal(wire.model, selected.model); assert.equal(wire.reasoning.effort, selected.effort)
  wires.push({ model: wire.model, effort: wire.reasoning.effort })
  if (fetches === 1) return tool(TASK_DELEGATE_TOOL, { goal: 'Inspect notes', expectedOutput: 'Cited findings',
    ...worker, sourceIds: [sourceId] }, parentCall)
  if (fetches === 2) return tool('read_task_evidence', { sourceId, start: 1, end: 1 })
  if (fetches === 3) return tool('submit_task_findings', { summary: 'Synthetic finding', findings: [
    { text: 'First line observed', references: [{ sourceId, start: 1, end: 1, digest: taskIdentity('fixture first') }] },
  ] })
  throw new Error('Unexpected extra writer fetch before crash barrier')
}
// A misconfigured adapter cannot escape the synthetic HTTP fixture via WebSocket.
Object.defineProperty(globalThis, 'WebSocket', { configurable: true, value: class {
  constructor() { throw new Error('CRASH_FIXTURE_WEBSOCKET_FORBIDDEN') }
} })

const ctx = new Context()
for (const plugin of [Llm, Sessions, Projection, AgentRegistry, Prompt, Tools]) await ctx.plugin(plugin)
await ctx.plugin(AgentLoop, { agents: [] })
await ctx.plugin(Persistence, { root: join(root, 'sessions'), packChunks: true,
  compression: process.env.CRASH_COMPRESSION === 'zstd' ? 'zstd' : 'none' })
const credentials = new OpenAICodexCredentialStore(join(root, 'synthetic-oauth.json'))
if (phase === 'write') {
  const claim = Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: 'crash-fixture' } })).toString('base64url')
  await credentials.modify('openai-codex', async () => ({ type: 'oauth', access: `e30.${claim}.fixture`,
    refresh: 'fixture', accountId: 'crash-fixture', expires: Date.now() + 3600000 }))
}
const ledger = new AdaptiveTaskDelegationLedger(join(root, 'tasks'))
const artifacts = new TaskDelegationArtifacts(join(root, 'artifacts')), host = new TaskDelegationHost(ctx)
const runtime = new AdaptiveTaskDelegation(ctx, { ledger, host, artifacts: () => artifacts })
const governor = new OpenAICodexBackendRequests(undefined, undefined, 8, () => runtime.reserveAuxiliary())
ctx.effect(() => () => governor.dispose())
ctx.llm.registerAdapter(['openai-codex'], createOpenAICodexAdapter(credentials, () => undefined, undefined,
  undefined, undefined, undefined, undefined, undefined, () => false, governor, runtime))
const create = host.create.bind(host)
host.create = async (...args) => { childCreates++; return create(...args) }

try {
  if (phase === 'write') {
    const handle = await ctx.agents.create({ sessionId: parentId, meta: { cwd: root },
      agentOptions: { provider: 'openai-codex', model: route.model, reasoningEffort: ReasoningEffortId(route.effort) } })
    const parent = handle.agent, h = parent.session.header
    const identity: LedgerIdentity = { sessionId: parentId, owner: taskIdentity('crash-owner'),
      sessionKey: taskIdentity(JSON.stringify([h.id, h.createdAt, h.cwd ?? '', h.isSeeded, h.parentSession ?? ''])) }
    await writeFile(join(root, 'notes.txt'), 'fixture first\nfixture second')
    const manifest = await TaskEvidenceManifest.approve(root, ['notes.txt'])
    sourceId = manifest.sources()[0]!.id
    await new AdaptiveTaskStore(join(root, 'tasks')).update(parentId, () => ({ version: 1, ...identity,
      runtime: oldEpoch, revision: 1, mode: 'auto', route,
      capabilities: [{ model: route.model, efforts: [route.effort] }, { model: worker.model, efforts: [worker.effort] }],
      maximumRequests: 40, reserved: 0, selectionSeq: -1, portable: false, handoffSeq: -1,
      receipts: [{ id: randomUUID(), digest: taskIdentity('start') }] }))
    let doc = await ledger.migrate(identity, 1)
    doc = await ledger.configure(identity, doc.revision, { routes: [worker], sourceManifest: manifest.digest,
      sourceIds: [sourceId], maxRequests: 6, timeoutMs: 30000 })
    await ledger.resume(identity, doc.revision, oldEpoch)
    await runtime.install(parent, identity, manifest)

    async function barrier(): Promise<never> {
      // Observe only. Never flush, settle, create a result, or repair the state under test here.
      const state = await ledger.read(identity) as TaskLedgerDocument
      const calls = parent.session.snapshotEvents().filter(event => event.type === 'tool/call' && event.data.name === TASK_DELEGATE_TOOL)
      assert.equal(calls.length, 1); assert.equal(calls[0]!.type, 'tool/call')
      const originalCallId = calls[0]!.data.callId
      assert.equal(state.delegation.runs[0]!.callId, taskIdentity(originalCallId))
      const parentResults = parent.session.snapshotEvents().filter(event => event.type === 'tool/result'
        && event.data.message.source.callId === originalCallId).length
      const checkpoint = { identity, oldEpoch, newEpoch, stage, pid: process.pid, node: process.version,
        fetches, childCreates, wires, parentResults, originalCallId, state }
      await writeFile(join(root, 'checkpoint.json'), JSON.stringify(checkpoint))
      process.stdout.write(JSON.stringify({ barrier: stage, pid: process.pid }) + '\n')
      setInterval(() => {}, 1000)
      return await new Promise<never>(() => {})
    }
    // Pause after public operations release their own storage locks, not from inside a store update.
    function after(target: any, name: string, selectedStage: string, matches: (args: any[], result: any) => boolean = () => true): void {
      const original = target[name].bind(target)
      target[name] = async (...args: any[]) => {
        const result = await original(...args)
        if (stage === selectedStage && matches(args, result)) await barrier()
        return result
      }
    }
    after(ledger, 'prepare', 'prepared')
    after(host, 'create', 'host-created-before-ledger-publish')
    after(ledger, 'publish', 'published')
    after(ledger, 'reserveChild', 'child-reserved-before-fetch')
    after(artifacts, 'put', 'result-artifact-before-settle', ([value]) => typeof value?.summary === 'string' && Array.isArray(value.findings))
    after(ledger, 'settle', 'settled-before-cleanup')
    after(ledger, 'cleanup', 'cleaned-before-parent-tool-result', (args) => args[3] === true)
    after(ctx.sessions, 'flush', 'parent-result-flushed-before-delivery', ([session], flushed) => {
      if (session !== parent.session || flushed !== true) return false
      const call = parent.session.snapshotEvents().find(event => event.type === 'tool/call' && event.data.name === TASK_DELEGATE_TOOL)
      return call?.type === 'tool/call' && parent.session.snapshotEvents().some(event => event.type === 'tool/result'
        && event.data.message.source.callId === call.data.callId && event.data.error === undefined)
    })
    after(ledger, 'delivery', 'delivery-recorded')
    parent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'ORIGINAL CRASH REQUIREMENT' }] }))
    await parent.whenIdle()
    throw new Error(`Execution finished without reaching ${stage}`)
  } else {
    const checkpoint = JSON.parse(await readFile(join(root, 'checkpoint.json'), 'utf8'))
    assert.equal(checkpoint.stage, stage); assert.notEqual(checkpoint.pid, process.pid)
    const restored = await ctx.agents.resume({ resumeSessionId: parentId,
      agentOptions: { provider: 'openai-codex', model: route.model, reasoningEffort: ReasoningEffortId(route.effort) } })
    const parent = restored.agent, before = await ledger.read(checkpoint.identity) as TaskLedgerDocument
    assert.deepEqual(before, checkpoint.state)
    // Normal host restoration must retain the actual original call, including early crash windows.
    const calls = parent.session.snapshotEvents().filter(event => event.type === 'tool/call' && event.data.callId === checkpoint.originalCallId)
    assert.equal(calls.length, 1)
    assert.ok(JSON.stringify(parent.session.snapshotEvents()).includes('ORIGINAL CRASH REQUIREMENT'))
    await runtime.recover(parent, checkpoint.identity, before.revision, oldEpoch, newEpoch)
    await assert.rejects(ledger.reserveRoot(checkpoint.identity, oldEpoch, route, 'main'), /TASK_STALE_EPOCH/)
    const recovered = await ledger.read(checkpoint.identity) as TaskLedgerDocument
    assert.equal(recovered.mode, 'interrupted'); assert.equal(recovered.reserved, before.reserved)
    assert.equal(recovered.delegation.runs.length, 1)
    assert.deepEqual(recovered.delegation.runs[0]!.attempts, before.delegation.runs[0]!.attempts)
    assert.equal(ctx.tools.get(TASK_DELEGATE_TOOL, parent), undefined)
    assert.equal(fetches, 0); assert.equal(childCreates, 0)
    assert.deepEqual(ctx.agents.list(), [parent])
    const run = recovered.delegation.runs[0]!
    console.log(JSON.stringify({ phase, stage, pid: process.pid, writerPid: checkpoint.pid, node: process.version,
      writerFetches: checkpoint.fetches, writerChildCreates: checkpoint.childCreates, writerParentResults: checkpoint.parentResults,
      beforeState: before.delegation.runs[0]!.state, beforeDelivery: before.delegation.runs[0]!.delivery,
      reserved: recovered.reserved, attempts: run.attempts.length, state: run.state, cleanup: run.cleanup, delivery: run.delivery,
      recoveryFetches: fetches, recoveryChildCreates: childCreates, oldEpochRejected: true, passed: true }))
    await restored.dispose()
  }
} finally { await ctx.fiber.dispose() }
