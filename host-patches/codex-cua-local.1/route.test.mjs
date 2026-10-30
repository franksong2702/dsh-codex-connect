/** Actual local Agent loop, synthetic provider only. No network, credentials, native helper or GUI. */
import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { resolve, join } from 'node:path'

if (!process.env.DSH_LOCAL_FIXTURE) throw new Error('DSH_LOCAL_FIXTURE must name an isolated candidate runtime')
const require = createRequire(join(resolve(process.env.DSH_LOCAL_FIXTURE), 'package.json'))
const host = name => import(pathToFileURL(require.resolve(name)).href)
const [{ Context }, LlmApi, SessionApi, { default: Projection }, AgentApi,
  { default: Prompt }, { default: Tools }, { default: Loop }, { NativeToolExecutor }] = await Promise.all([
  '@deepseek-ai/cordis', '@deepseek-ai/dsh-llm', '@deepseek-ai/dsh-session', '@deepseek-ai/dsh-session-projection',
  '@deepseek-ai/dsh-agent', '@deepseek-ai/dsh-system-prompt', '@deepseek-ai/dsh-tools', '@deepseek-ai/dsh-agent-loop',
  '@deepseek-ai/dsh-tool-executor-native',
].map(host))
const { default: Llm, LlmAdapter, ReasoningEffortId, QUOTA_EXCEEDED_CODE, createUserMessage, ToolCallId } = LlmApi
const { default: Sessions, SessionId } = SessionApi
const contexts = []
afterEach(async () => { for (const ctx of contexts.splice(0)) await ctx.fiber.dispose() })

async function fixture({ failFirst = false, partialTool = false } = {}) {
  assert.equal(AgentApi.REQUEST_ROUTE_VERSION, 1)
  const ctx = new Context(); contexts.push(ctx)
  for (const plugin of [Llm, Sessions, Projection, AgentApi.default, Prompt, Tools]) await ctx.plugin(plugin)
  assert.equal(ctx.agents.requestRoutingVersion, 1)
  await ctx.plugin(Loop, { agents: [] })
  ctx.tools.setExecutor(new NativeToolExecutor(ctx))
  const calls = [], conditions = [], prompts = []
  let dispatches = 0
  ctx.tools.register({ name: 'synthetic_side_effect', description: 'Must never run for a failed stream', parameters: { type: 'object' },
    output: { schema: { type: 'object' }, render: () => [] }, async execute() { dispatches++; return {} } },
  { when({ modelSelection }) { conditions.push(modelSelection.model); return true } })
  ctx.systemPrompt.section({ name: 'fixture:route', order: 0, text(context) { prompts.push(context.modelSelection.model); return `route=${context.modelSelection.model}` } })
  class InMemory extends LlmAdapter {
    providerInfo(id) { return { id, name: 'Synthetic' } }
    async listModels(provider) { return ['ordinary', 'reserve'].map(id => ({ provider, id, name: id })) }
    async resolveModel(provider, id) { return { provider, id, name: id, reasoning: { efforts: [{ id: ReasoningEffortId('max'), name: 'max' }] } } }
    async *stream(options) {
      calls.push(options)
      if (failFirst && calls.length === 1) {
        if (partialTool) {
          yield { type: 'block-start', index: 0, blockType: 'tool-call' }
          yield { type: 'block-end', index: 0, block: { type: 'tool-call', id: ToolCallId('never-dispatch'), name: 'synthetic_side_effect', arguments: '{}' } }
        }
        yield { type: 'finish', reason: { kind: 'error', failure: { code: QUOTA_EXCEEDED_CODE, message: 'Synthetic exhaustion' } } }
        return
      }
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'block-end', index: 0, block: { type: 'text', text: 'Synthetic completion' } }
      yield { type: 'finish', reason: { kind: 'stop' } }
    }
  }
  ctx.llm.registerAdapter(['synthetic'], new InMemory())
  const handle = await ctx.agents.create({ sessionId: SessionId(`route-${crypto.randomUUID()}`),
    agentOptions: { provider: 'synthetic', model: 'ordinary', reasoningEffort: ReasoningEffortId('max'), maxTokens: 2048 } })
  const agent = handle.agent
  agent.model.select({ provider: 'synthetic', model: 'ordinary', reasoningEffort: ReasoningEffortId('max') })
  const send = async () => { agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'input-once' }] })); await agent.whenIdle() }
  return { ctx, agent, handle, send, calls, conditions, prompts, dispatches: () => dispatches }
}

test('async routing precedes tool/prompt selection without changing the user-selected route', async () => {
  const f = await fixture()
  f.ctx.on('agent/route-request', async (_event, next) => { await Promise.resolve(); await next(); return { provider: 'synthetic', model: 'reserve' } })
  await f.send()
  assert.deepEqual(f.conditions, ['reserve'])
  assert.ok(f.prompts.every(model => model === 'reserve'))
  assert.equal(f.calls[0].model, 'reserve')
  assert.deepEqual(f.agent.session.requestHeader().config, { provider: 'synthetic', model: 'reserve' })
  assert.deepEqual(f.agent.model.current(), { provider: 'synthetic', model: 'ordinary', reasoningEffort: 'max' })
})

test('quota recovery re-admits the route/tools/prompt without repeating input or failed tool calls', async () => {
  const f = await fixture({ failFirst: true, partialTool: true })
  let recovered = false
  f.ctx.on('agent/route-request', async (_event, next) => recovered ? { provider: 'synthetic', model: 'reserve' } : next())
  f.ctx.on('agent/request-error', async () => { recovered = true; return { kind: 'retry', reprepare: true } })
  await f.send()
  assert.deepEqual(f.calls.map(call => call.model), ['ordinary', 'reserve'])
  assert.deepEqual(f.conditions, ['ordinary', 'reserve'])
  assert.ok(f.prompts.includes('ordinary') && f.prompts.includes('reserve'))
  const events = f.agent.session.snapshotEvents()
  assert.equal(events.filter(event => event.type === 'user/message' && event.data.content.some(block => block.text === 'input-once')).length, 1)
  assert.equal(events.filter(event => event.type === 'assistant/attempt').length, 1)
  assert.equal(events.filter(event => event.type === 'assistant/message').length, 1)
  assert.equal(f.dispatches(), 0)
  assert.deepEqual(f.agent.session.requestHeader().config, { provider: 'synthetic', model: 'reserve' })
})

test('ordinary retry preserves the existing prepared world', async () => {
  const f = await fixture({ failFirst: true })
  let routing = 0
  f.ctx.on('agent/route-request', async (_event, next) => { routing++; return next() })
  f.ctx.on('agent/request-error', async () => ({ kind: 'retry' }))
  await f.send()
  assert.equal(routing, 1)
  assert.deepEqual(f.conditions, ['ordinary'])
  assert.deepEqual(f.calls.map(call => call.model), ['ordinary', 'ordinary'])
})

test('cancellation in asynchronous route admission commits no model request', { timeout: 3000 }, async () => {
  const f = await fixture()
  let entered
  const waiting = new Promise(resolve => { entered = resolve })
  f.ctx.on('agent/route-request', async ({ signal }, next) => {
    entered()
    await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true }))
    signal.throwIfAborted()
    return next()
  })
  const run = f.send()
  await waiting
  f.agent.cancel({ kind: 'user' })
  await run
  assert.equal(f.calls.length, 0)
  assert.equal(f.agent.session.requestHeader(), undefined)
  assert.equal(f.conditions.length, 0)
})
