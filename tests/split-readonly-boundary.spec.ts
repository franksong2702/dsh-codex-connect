/** Design-gate tests only: real DSH scopes, no worker implementation or provider dispatch. */
import { Context } from '@deepseek-ai/cordis'
import LlmRuntime, { ReasoningEffortId, ToolCallId } from '@deepseek-ai/dsh-llm'
import SessionRuntime, { SessionId } from '@deepseek-ai/dsh-session'
import ProjectionRuntime from '@deepseek-ai/dsh-session-projection'
import SystemPromptRuntime from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import AgentRuntime from '@deepseek-ai/dsh-agent'
import type { Agent } from '@deepseek-ai/dsh-agent'
import AgentLoopRuntime from '@deepseek-ai/dsh-agent-loop'
import SubagentRuntime, {
  applyChildComposition,
  childSessionMeta,
  resolveChildAgentOptions,
  resolveChildDepth,
} from '@deepseek-ai/dsh-subagent'
import { afterEach, expect, it, vi } from 'vitest'

let ctx: Context | undefined
const readName = 'split_fixture_read'
const writeName = 'split_fixture_write'

function tool(name: string, execute: () => Promise<string>): ToolDefinition {
  return {
    name, description: 'Synthetic boundary fixture; no filesystem access.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: String(value) }] },
    execute,
  }
}

async function fixture(guarded = true) {
  vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('No network is permitted in this design gate') }))
  ctx = new Context()
  for (const module of [LlmRuntime, SessionRuntime, ProjectionRuntime, SystemPromptRuntime, ToolRuntime, AgentRuntime]) {
    await ctx.plugin(module)
  }
  await ctx.plugin(AgentLoopRuntime, { agents: [] })
  await ctx.plugin(SubagentRuntime)
  const read = vi.fn(async () => 'bounded fixture evidence')
  const write = vi.fn(async () => 'forbidden fixture effect')
  ctx.tools.register(tool(readName, read))
  ctx.tools.register(tool(writeName, write))
  const parentHandle = await ctx.agents.create({
    sessionId: SessionId('split-boundary-parent'),
    agentOptions: { provider: 'openai-codex', model: 'gpt-5.6-luna', reasoningEffort: ReasoningEffortId('low') },
  })
  const parent = parentHandle.agent
  const depth = resolveChildDepth(parent, 1)
  const childHandle = await ctx.agents.create({
    sessionId: SessionId('split-boundary-child'),
    meta: childSessionMeta(parent, depth, false),
    agentOptions: resolveChildAgentOptions(parent, undefined, depth),
    setup(scope) {
      applyChildComposition(scope, parent, { toolFilter: { allow: [readName] } })
      // Defense in depth: restrict() deliberately exempts tools registered in the child's own layer.
      // These fixtures have no output-capture tool; a shipped worker must separately audit that capability.
      if (guarded) scope.tools.guard(exec => exec.name === readName ? undefined : 'SPLIT_READ_ONLY_DENIED')
    },
  })
  return { context: ctx, parent, child: childHandle.agent, childHandle, read, write }
}

function execute(context: Context, agent: Agent, name: string, signal = new AbortController().signal) {
  return context.tools.execute({ callId: ToolCallId(`split-${name}`), name, arguments: {}, agent, signal })
}

afterEach(async () => {
  try {
    await ctx?.fiber.dispose()
    expect(globalThis.fetch).not.toHaveBeenCalled()
  } finally {
    ctx = undefined
    vi.unstubAllGlobals()
  }
})

it('filters inherited writes from child visibility and real dispatch without restricting the parent', async () => {
  const { context, parent, child, read, write } = await fixture()
  expect(context.tools.get(writeName, child)).toBeUndefined()
  expect(context.tools.get(readName, child)).toBeDefined()
  expect((await execute(context, child, readName)).isError).toBe(false)
  expect((await execute(context, child, writeName)).isError).toBe(true)
  expect(read).toHaveBeenCalledTimes(1)
  expect(write).not.toHaveBeenCalled()
  expect((await execute(context, parent, writeName)).isError).toBe(false)
  expect(write).toHaveBeenCalledTimes(1)
})

it('documents that a filter alone does not constrain a child-local registration', async () => {
  const { context, child } = await fixture(false)
  const local = vi.fn(async () => 'fixture-only local effect')
  child.ctx.tools.register(tool('split_local', local))
  expect((await execute(context, child, 'split_local')).isError).toBe(false)
  expect(local).toHaveBeenCalledTimes(1)
})

it('denies child-local tools at execution with a monotonic guard', async () => {
  const { context, child } = await fixture()
  const local = vi.fn(async () => 'must not execute')
  child.ctx.tools.register(tool('split_local', local))
  expect(context.tools.get('split_local', child)).toBeDefined()
  expect((await execute(context, child, 'split_local')).isError).toBe(true)
  expect(local).not.toHaveBeenCalled()
})

it('does not turn a cancelled read into an executed read', async () => {
  const { context, child, read } = await fixture()
  const controller = new AbortController()
  controller.abort()
  expect((await execute(context, child, readName, controller.signal)).isError).toBe(true)
  expect(read).not.toHaveBeenCalled()
})

it('stamps lineage/depth and rejects grandchildren at the same depth cap', async () => {
  const { parent, child } = await fixture()
  expect(child.session.header.parentSession).toBe(parent.id)
  expect(child.session.header.delegationDepth).toBe(1)
  expect(child.options.model).toBe('gpt-5.6-luna')
  expect(child.options.reasoningEffort).toBe('low')
  expect(() => resolveChildDepth(child, 1)).toThrow()
})

it('rejects unsupported tool-filter capability before a provider can start', async () => {
  const { context, parent } = await fixture()
  const start = vi.fn(async () => { throw new Error('must not dispatch') })
  context.subagents.registerProvider({
    name: 'split-unsupported', inheritsParentContext: false,
    capabilities: { agentOptions: false, outputSchema: false, depthLimit: false, toolFilter: false, persona: false },
    start,
  })
  await expect(context.subagents.start('split-unsupported', {
    parent, prompt: [{ type: 'text', text: 'Inspect only.' }], signal: new AbortController().signal,
    toolFilter: { allow: [readName] },
  })).rejects.toThrow()
  expect(start).not.toHaveBeenCalled()
})

it('disposes the owned child without disposing its parent', async () => {
  const { context, parent, child, childHandle } = await fixture()
  await childHandle.dispose()
  await childHandle.dispose()
  expect(context.agents.get(child.id)).toBeUndefined()
  expect(context.agents.get(parent.id)).toBe(parent)
})
