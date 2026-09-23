/** Installed DSH agent-loop host bridge with synthetic tools only. No provider network or credentials. */
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Context } from '@deepseek-ai/cordis'
import { AgentRegistry } from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import Llm, { LlmAdapter, ReasoningEffortId, ToolCallId } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, LlmModelInfo, LlmProviderInfo, LlmResolvedModelInfo, StreamChunk } from '@deepseek-ai/dsh-llm'
import Sessions, { SessionId } from '@deepseek-ai/dsh-session'
import Projection from '@deepseek-ai/dsh-session-projection'
import Prompt from '@deepseek-ai/dsh-system-prompt'
import Tools, { ToolDefinition } from '@deepseek-ai/dsh-tools'
import { afterEach, expect, it } from 'vitest'
import { TaskDelegationHost } from '../src/adaptive-task-delegation-host.ts'
import type { TaskChildRun } from '../src/adaptive-task-delegation-contract.ts'
import { taskIdentity } from '../src/adaptive-task-store.ts'

class SyntheticAdapter extends LlmAdapter {
  providerInfo(provider: string): LlmProviderInfo { return { id: provider, name: 'Synthetic' } }
  async listModels(provider: string): Promise<readonly LlmModelInfo[]> { return [{ provider, id: 'synthetic-model', name: 'Synthetic model' }] }
  async resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    return { provider, id: model, name: 'Synthetic model', reasoning: { efforts: [{ id: ReasoningEffortId('medium'), name: 'medium' }] } }
  }
  async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    // Baseline sends system separately; newer hosts project it into history.
    // Inspect the complete model-visible request, not one version's envelope.
    const visible = JSON.stringify({ system: options.system, messages: options.messages })
    expect(visible).toContain('bounded read-only evidence helper')
    expect(visible).not.toContain('parent persona')
    expect(visible).not.toContain('unapproved ambient context')
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text: 'synthetic complete' }
    yield { type: 'block-end', index: 0, block: { type: 'text', text: 'synthetic complete' } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

const roots: string[] = []
const contexts: Context[] = []
async function setup(ptc = true) {
  const root = await mkdtemp(join(tmpdir(), 'task-host-')); roots.push(root)
  const ctx = new Context()
  contexts.push(ctx)
  for (const plugin of [Llm, Sessions, Projection, AgentRegistry]) await ctx.plugin(plugin)
  await ctx.plugin(Prompt)
  await ctx.plugin(Tools)
  ctx.systemPrompt.context({ name: 'fixture:ambient', order: 0, text: 'unapproved ambient context' })
  await ctx.plugin(AgentLoop, { agents: [] })
  ctx.llm.registerAdapter(['openai-codex'], new SyntheticAdapter())
  ctx.tools.register({ name: 'host_shell', description: 'Inherited shell fixture', parameters: { type: 'object' },
    output: { schema: { type: 'object' }, render: () => [{ type: 'text', text: '{}' }] }, async execute() { return { executed: true } } } as ToolDefinition)
  const parentHandle = await ctx.agents.create({ sessionId: SessionId('task-host-parent'), meta: { cwd: root },
    agentOptions: { provider: 'openai-codex', model: 'synthetic-model', reasoningEffort: ReasoningEffortId('medium') },
    setup: agentCtx => {
      agentCtx.systemPrompt.section({ name: 'deployment:persona', order: 0, text: 'parent persona needs {{cwd}}' })
      if (ptc) agentCtx.tools.presentAs('ptc')
    } })
  const host = new TaskDelegationHost(ctx)
  const run: TaskChildRun = { id: 'run-0000000000000001', callId: 'call-00000000000001', argumentDigest: taskIdentity('args'),
    grantRevision: 1, revocationGeneration: 0, epoch: taskIdentity('epoch'), childSessionId: null, childSessionKey: null,
    route: { model: 'synthetic-model', effort: 'medium' }, sourceIds: ['source-0000000001'], evidenceDigest: taskIdentity('evidence'),
    maxRequests: 1, attempts: [], deadlineAt: Date.now() + 60000, state: 'prepared', outcome: null, cleanup: 'pending', resultDigest: null, delivery: 'none' }
  return { ctx, root, host, parent: parentHandle.agent, parentHandle, run }
}
afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

it('creates an unpublished-tool-scoped child, runs it through the real loop, and disposes it', async () => {
  const f = await setup(); const calls: Array<[string, unknown]> = []; let submitted = false
  const child = await f.host.create(f.parent, f.run, new AbortController().signal, {
    check() { if (submitted) throw new Error('submitted') },
    async execute(name, args) { calls.push([name, args]); if (name === 'submit_task_findings') submitted = true; return { accepted: true } },
  })
  expect(child.isLive()).toBe(true)
  expect(child.agent.session.header.parentSession).toBe(f.parent.id)
  expect(child.agent.session.header.cwd).toBeUndefined()
  expect(f.ctx.agents.isOwnedBy(child.agent.id, f.parent)).toBe(true)
  expect(child.agent.ctx.tools.schemas(child.agent).map(schema => schema.name).sort()).toEqual(['read_task_evidence', 'submit_task_findings'])
  await child.run('Synthetic brief', new AbortController().signal)
  const runCode = await f.ctx.agents.withInitiator(child.agent, () => f.ctx.tools.execute({ agent: child.agent, callId: ToolCallId('tool-code-0000001'),
    name: 'run_code', arguments: { code: 'return 1' }, signal: new AbortController().signal }))
  expect(runCode.isError).toBe(true)
  const inherited = await f.ctx.agents.withInitiator(child.agent, () => f.ctx.tools.execute({ agent: child.agent, callId: ToolCallId('tool-shell-0000001'),
    name: 'host_shell', arguments: {}, signal: new AbortController().signal }))
  expect(inherited.isError).toBe(true)
  const result = await f.ctx.agents.withInitiator(child.agent, () => f.ctx.tools.execute({ agent: child.agent, callId: ToolCallId('tool-call-0000001'),
    name: 'read_task_evidence', arguments: { sourceId: 'source-0000000001', start: 1, end: 1 }, signal: new AbortController().signal }))
  expect(result.isError).toBe(false); expect(calls[0]![0]).toBe('read_task_evidence')
  await child.dispose(); expect(child.isLive()).toBe(false); expect(f.ctx.agents.get(SessionId(child.sessionId))).toBeUndefined()
  await f.parentHandle.dispose()
})

it('fails closed for non-live or foreign parents and setup checks', async () => {
  const f = await setup(); const foreign = await f.ctx.agents.create({ sessionId: SessionId('task-host-foreign'), agentOptions: { provider: 'openai-codex', model: 'synthetic-model' } })
  const header = f.parent.session.header
  f.host.assertRoot(f.parent, { sessionId: f.parent.id,
    sessionKey: taskIdentity(JSON.stringify([header.id, header.createdAt, header.cwd ?? '', header.isSeeded, header.parentSession ?? ''])), owner: taskIdentity('owner') })
  expect(() => f.host.assertRoot(foreign.agent, { sessionId: f.parent.id, sessionKey: taskIdentity('key'), owner: taskIdentity('owner') })).toThrow('TASK_PARENT_NOT_LIVE')
  expect(() => f.host.assertNoChildren(f.parent)).not.toThrow()
  await expect(f.host.create(f.parent, f.run, new AbortController().signal, { check() { throw new Error('denied') }, execute() { return {} } })).rejects.toThrow('denied')
  await foreign.dispose(); await f.parentHandle.dispose()
})

it('rejects a live child in assertNoChildren until its handle is disposed', async () => {
  // Inspect the actual parent scope without requiring an unrelated PTC code
  // runtime. The first case separately checks inheritance from a PTC parent.
  const f = await setup(false)
  const parentPrompt = await f.parent.ctx.systemPrompt.assemble({ scope: f.parent, agent: f.parent })
  expect(parentPrompt.sections.some(section => section.text.includes('parent persona'))).toBe(true)
  expect(parentPrompt.contexts.some(section => section.text.includes('unapproved ambient context'))).toBe(true)
  const child = await f.host.create(f.parent, f.run, new AbortController().signal, { check() {}, execute() { return {} } })
  expect(await f.parent.ctx.systemPrompt.assemble({ scope: f.parent, agent: f.parent })).toEqual(parentPrompt)
  expect(() => f.host.assertNoChildren(f.parent)).toThrow('TASK_CHILDREN_LIVE')
  await child.dispose(); expect(() => f.host.assertNoChildren(f.parent)).not.toThrow()
  expect(await f.parent.ctx.systemPrompt.assemble({ scope: f.parent, agent: f.parent })).toEqual(parentPrompt)
  await f.parentHandle.dispose()
})
