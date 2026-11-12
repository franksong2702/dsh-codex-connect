/** Actual rc.2 composition regressions; no real provider or credentials. */
import { afterEach, expect, it, vi } from 'vitest'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { LlmAdapter, createUserMessage } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, LlmResolvedModelInfo, StreamChunk } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import { AtomicTaskDocumentStore, taskIdentity } from '../src/adaptive-task-store.ts'
import { setup, cleanupRecoveryFixtures, model } from './adaptive-task-recovery-setup.ts'
afterEach(async () => { vi.restoreAllMocks(); await cleanupRecoveryFixtures() })
async function send(agent: Agent) {
  agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Synthetic rc2 request' }] }))
  await agent.whenIdle()
}
async function child(f: Awaited<ReturnType<typeof setup>>, id: string, parent = f.agent.id) {
  return f.ctx.agents.create({ sessionId: SessionId(id), meta: { parentSession: parent, origin: 'subagent' },
    agentOptions: { provider: 'openai-codex', model } })
}
it('rc2 orphan with its own v2 ledger never falls through to the legacy provider', async () => {
  const f = await setup(2)
  const c = await f.ctx.agents.create({ sessionId: SessionId('orphan'), meta: { origin: 'subagent' }, agentOptions: { provider: 'openai-codex', model } })
  const source = await f.store.read(f.agent.id), h = c.agent.session.header
  if (source?.version !== 2) throw new Error('v2 required')
  await f.store.update(c.agent.id, () => ({ ...source, sessionId: c.agent.id,
    sessionKey: taskIdentity(JSON.stringify([h.id, h.createdAt, h.cwd ?? '', h.isSeeded, h.parentSession ?? ''])) }))
  await f.handle.dispose()
  expect(f.ctx.agents.list()).toEqual([c.agent])
  const before = await f.store.read(c.agent.id)
  await send(c.agent)
  expect(await f.store.read(c.agent.id)).toEqual(before)
  expect(f.calls()).toBe(0)
  expect(c.agent.session.snapshotEvents().findLast(e => e.type === 'turn/end')?.data).toMatchObject({ reason: { kind: 'error' } })
  expect((await f.store.read(c.agent.id))?.reserved).toBe(3)
})
it('rc2 disposed durable ancestor v2 never becomes an ordinary child request', async () => {
  const f = await setup(2), c = await child(f, 'orphan-after-root-disposal')
  await f.handle.dispose()
  expect(f.ctx.agents.get(f.agent.id)).toBeUndefined()
  await send(c.agent)
  expect(f.calls()).toBe(0)
  expect(c.agent.session.snapshotEvents().findLast(e => e.type === 'turn/end')?.data).toMatchObject({ reason: { kind: 'error' } })
  expect((await f.store.read(f.agent.id))?.reserved).toBe(3)
})
it('rc2 missing optional ownership service with no v2 state leaves ordinary requests alone', async () => {
  const f = await setup(1)
  await f.ownershipFiber?.dispose()
  const other = await f.ctx.agents.create({ sessionId: SessionId('ordinary-no-subagents'), agentOptions: { provider: 'openai-codex', model } })
  await send(other.agent)
  expect(f.calls()).toBe(1)
  await expect(f.state()).rejects.toThrow('TASK_HOST_OWNERSHIP_UNAVAILABLE')
})
it('rc2 unmanaged delegated agent without any v2 state is not blocked by a Task hook', async () => {
  const f = await setup(1)
  const parent = await f.ctx.agents.create({ sessionId: SessionId('untasked-parent'), agentOptions: { provider: 'openai-codex', model } })
  const c = await child(f, 'ordinary-unmanaged', parent.agent.id)
  await send(c.agent)
  expect(f.calls(), JSON.stringify(c.agent.session.snapshotEvents().findLast(e => e.type === 'turn/end'))).toBe(1)
  expect((await f.store.read(f.agent.id))?.reserved).toBe(3)
})
it('rc2 missing ownership service with a live v2 ledger refuses ambiguous dispatch', async () => {
  const f = await setup(2)
  await f.ownershipFiber?.dispose()
  const other = await f.ctx.agents.create({ sessionId: SessionId('ambiguous-no-subagents'), agentOptions: { provider: 'openai-codex', model } })
  await send(other.agent)
  expect(f.calls()).toBe(0)
  expect(other.agent.session.snapshotEvents().findLast(e => e.type === 'turn/end')?.data).toMatchObject({ reason: { kind: 'error' } })
})
it('rc2 unrelated non-Codex ordinary turn is not intercepted by retained Task state', async () => {
  const f = await setup(2); let calls = 0
  const info: LlmResolvedModelInfo = { provider: 'fixture-other', id: 'ordinary', name: 'Synthetic other' }
  class Other extends LlmAdapter {
    providerInfo(provider: string) { return { id: provider, name: 'Synthetic other' } }
    async listModels() { return [info] }
    async resolveModel() { return info }
    async *stream(_options: GenerateOptions): AsyncIterable<StreamChunk> { calls++; yield { type: 'finish', reason: { kind: 'stop' } } }
  }
  f.ctx.llm.registerAdapter(['fixture-other'], new Other())
  const other = await f.ctx.agents.create({ sessionId: SessionId('ordinary-other-provider'), agentOptions: { provider: 'fixture-other', model: 'ordinary' } })
  await send(other.agent)
  expect(calls).toBe(1); expect(f.calls()).toBe(0)
  expect((await f.store.read(f.agent.id))?.reserved).toBe(3)
})

it('rc2 revalidates the exact live caller after asynchronous empty-state reads', async () => {
  const f = await setup(1)
  await f.ownershipFiber?.dispose()
  const first = await f.ctx.agents.create({ sessionId: SessionId('replaced-during-read'), agentOptions: { provider: 'openai-codex', model } })
  const read = AtomicTaskDocumentStore.prototype.read
  let replaced = false
  vi.spyOn(AtomicTaskDocumentStore.prototype, 'read').mockImplementation(async function (this: AtomicTaskDocumentStore<unknown>, id) {
    if (id === first.agent.id && !replaced) {
      replaced = true
      await first.dispose()
      await f.ctx.agents.create({ sessionId: first.agent.id, agentOptions: { provider: 'openai-codex', model } })
    }
    return read.call(this, id)
  })
  let calls = 0
  const delegate = async function* (): AsyncIterable<StreamChunk> { calls++; yield { type: 'finish', reason: { kind: 'stop' } } }
  const stream = f.runtime().stream({ sessionId: first.agent.id } as GenerateOptions, delegate)
  await expect(stream[Symbol.asyncIterator]().next()).rejects.toThrow('TASK_LIVE_ROOT_REQUIRED')
  expect(calls).toBe(0); expect(replaced).toBe(true)
})
