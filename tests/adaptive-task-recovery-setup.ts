/** Exact alpha.3 recovery contract. Only synthetic state, tools and model output. */
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { AgentRegistry } from '@deepseek-ai/dsh-agent'
import Loop from '@deepseek-ai/dsh-agent-loop'
import Llm, { LlmAdapter, ReasoningEffortId, createUserMessage } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, LlmResolvedModelInfo, StreamChunk } from '@deepseek-ai/dsh-llm'
import Sessions, { SessionId } from '@deepseek-ai/dsh-session'
import Projection from '@deepseek-ai/dsh-session-projection'
import Prompt from '@deepseek-ai/dsh-system-prompt'
import Tools from '@deepseek-ai/dsh-tools'
import * as Persistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import { selectPersistencePlugin } from '../scripts/persistence-plugin-fixture.mjs'
import assert from 'node:assert/strict'
import { AdaptiveTaskControlRuntime } from '../src/adaptive-task-control-runtime.ts'
import { AtomicTaskDocumentStore, taskIdentity } from '../src/adaptive-task-store.ts'
import type { TaskDocument } from '../src/adaptive-task-store.ts'
import { parseTaskLedger } from '../src/adaptive-task-delegation-contract.ts'
import type { TaskLedgerDocument } from '../src/adaptive-task-delegation-contract.ts'
import { TaskDelegationArtifacts } from '../src/adaptive-task-artifacts.ts'
import { taskHostRecoveryOnly } from '../src/adaptive-task-host-policy.ts'

export const owner = taskIdentity('synthetic-recovery-owner'), model = 'gpt-5.6-sol'
const contexts: Context[] = [], roots: string[] = []

export async function setup(version: 1 | 2, persisted?: { root: string; compression: 'none' | 'zstd'; readExisting: boolean }) {
  assert.equal(taskHostRecoveryOnly(), true)
  const root = persisted?.root ?? await mkdtemp(join(tmpdir(), 'alpha3-task-recovery-')); if (persisted === undefined) roots.push(root)
  const ctx = new Context(); contexts.push(ctx)
  for (const p of [Llm, Sessions, Projection, AgentRegistry, Prompt, Tools]) await ctx.plugin(p)
  let ownershipFiber: Awaited<ReturnType<typeof ctx.plugin>> | undefined
  if (typeof ctx.agents.roots !== 'function') {
    // rc.2 moves live tree membership into the real subagent service. Mount
    // that read-only seam, not a fabricated rootOf() or a delegation tool.
    const fsName = '@deepseek-ai/dsh-fs-local', directoryName = '@deepseek-ai/dsh-working-directory', subagentName = '@deepseek-ai/dsh-subagent'
    await ctx.plugin((await import(fsName)).default)
    await ctx.plugin((await import(directoryName)).default)
    ownershipFiber = await ctx.plugin((await import(subagentName)).default)
  }
  // Use the actual published root executor, never a fake execute()/success adapter.
  const nativeName = '@deepseek-ai/dsh-tool-executor-native'
  await ctx.plugin(await import(nativeName))
  await ctx.plugin(Loop, { agents: [] })
  if (persisted !== undefined) await ctx.plugin(selectPersistencePlugin(Persistence), { root: join(root, 'sessions'), compression: persisted.compression })
  let calls = 0, hold = false, runtime!: AdaptiveTaskControlRuntime
  const info = { provider: 'openai-codex', id: model, name: 'Synthetic', reasoning: { efforts: [{ id: ReasoningEffortId('medium'), name: 'Medium' }] } }
  class Adapter extends LlmAdapter {
    providerInfo(provider: string) { return { id: provider, name: 'Synthetic' } }
    async listModels() { return [info] }
    async resolveModel(): Promise<LlmResolvedModelInfo> { return info }
    async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
      yield* runtime.stream(options, async function* () {
        calls++
        if (hold) {
          const signal = options.signal!
          if (!signal.aborted) await new Promise<void>(resolve => signal.addEventListener('abort', () => resolve(), { once: true }))
          signal.throwIfAborted()
        }
        yield { type: 'block-start', index: 0, blockType: 'text' }
        yield { type: 'text-delta', index: 0, text: 'synthetic ordinary completion' }
        yield { type: 'block-end', index: 0, block: { type: 'text', text: 'synthetic ordinary completion' } }
        yield { type: 'finish', reason: { kind: 'stop' } }
      })
    }
  }
  ctx.llm.registerAdapter(['openai-codex'], new Adapter())
  const directory = join(root, 'tasks'), store = new AtomicTaskDocumentStore(directory, parseTaskLedger)
  const artifacts = new TaskDelegationArtifacts(join(root, 'artifacts'))
  const load = async () => {
    const fiber = await ctx.plugin(function Recovery(scope: Context) {
      runtime = new AdaptiveTaskControlRuntime(scope, { directory, models: async () => [info], artifacts: () => artifacts })
    })
    return fiber
  }
  let fiber = await load()
  const agentOptions = { provider: 'openai-codex', model, reasoningEffort: ReasoningEffortId('medium') }
  const handle = persisted?.readExisting === true
    ? await ctx.agents.resume({ resumeSessionId: SessionId('recovery-root'), agentOptions })
    : await ctx.agents.create({ sessionId: SessionId('recovery-root'), meta: { cwd: root }, agentOptions })
  const { agent } = handle
  const h = agent.session.header
  const sessionKey = taskIdentity(JSON.stringify([h.id, h.createdAt, h.cwd ?? '', h.isSeeded, h.parentSession ?? '']))
  const base: TaskDocument = { version: 1, sessionId: agent.id, sessionKey, owner, runtime: taskIdentity('prior-process'),
    revision: 7, mode: 'auto', route: { model, effort: 'medium' }, capabilities: [{ model, efforts: ['medium'] }],
    reserved: 3, maximumRequests: 12, selectionSeq: -1, portable: false, handoffSeq: -1,
    receipts: [{ id: 'old-operation-0001', digest: taskIdentity('old-input') }] }
  if (persisted?.readExisting !== true) await store.update(agent.id, () => version === 1 ? base : { ...base, version: 2,
    delegation: { grant: null, grantRevision: 0, revocationGeneration: 0, runs: [] } } as TaskLedgerDocument)
  if (persisted?.readExisting !== true) agent.inject(createUserMessage({
    source: { kind: 'dsh-codex-connect', plugin: 'dsh-codex-connect/task-grant' },
    content: [{ type: 'text', text: 'Synthetic retained task marker; no new authority.' }] }))
  const state = () => runtime.state(agent.id, owner)
  const command = (action: Parameters<AdaptiveTaskControlRuntime['command']>[0]['action'], revision: number, extra = {}, principal = owner) =>
    runtime.command({ sessionId: agent.id, action, revision, operationId: randomUUID(), ...extra }, principal)
  const send = async () => { agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Synthetic ordinary request' }] })); await agent.whenIdle() }
  return { ctx, agent, handle, ownershipFiber, store, state, command, send, calls: () => calls, runtime: () => runtime, hold() { hold = true },
    async removeState() { await unlink(join(directory, taskIdentity(agent.id) + '.json')) },
    async corruptState() { await writeFile(join(directory, taskIdentity(agent.id) + '.json'), 'invalid synthetic task') },
    async reload() { await fiber.dispose(); fiber = await load() } }
}
export async function seedInterrupted(f: Awaited<ReturnType<typeof setup>>) {
  await f.store.update(f.agent.id, value => {
    if (value?.version !== 2) throw new Error('v2 required')
    return { ...value, mode: 'interrupted', delegation: { ...value.delegation, grantRevision: 1,
      runs: [{ id: 'child-run-00000001', callId: 'parent-call-000001', argumentDigest: taskIdentity('args'),
        grantRevision: 1, revocationGeneration: 0, epoch: value.runtime,
        childSessionId: 'old-child', childSessionKey: taskIdentity('old-child-key'), route: value.route,
        sourceIds: ['source-000000001'], evidenceDigest: taskIdentity('evidence'), maxRequests: 1,
        attempts: ['attempt-000000001'], deadlineAt: 1, state: 'interrupted', outcome: 'interrupted',
        cleanup: 'failed', resultDigest: null, delivery: 'none' }] } }
  })
}
export async function cleanupRecoveryFixtures(): Promise<void> {
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
}
