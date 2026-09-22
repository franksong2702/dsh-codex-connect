/** Fresh-process phase runner. Every account, instruction and response is synthetic. */
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { zstdDecompressSync } from 'node:zlib'
import { Context } from '@deepseek-ai/cordis'
import Llm, { createUserMessage, ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import Sessions, { SessionId } from '@deepseek-ai/dsh-session'
import Projection from '@deepseek-ai/dsh-session-projection'
import Agents from '@deepseek-ai/dsh-agent'
import Loop from '@deepseek-ai/dsh-agent-loop'
import Prompt from '@deepseek-ai/dsh-system-prompt'
import Tools from '@deepseek-ai/dsh-tools'
import Persistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import { createOpenAICodexAdapter } from '../src/adapter.ts'
import { OpenAICodexCredentialStore } from '../src/store.ts'
import { OpenAICodexBackendRequests } from '../src/backend-request.ts'
import { AdaptiveTaskRuntime } from '../src/adaptive-task-runtime.ts'
import { AdaptiveTaskStore, taskIdentity } from '../src/adaptive-task-store.ts'
import { ADAPTIVE_TASK_MODELS, ADAPTIVE_TASK_TOOL } from '../src/adaptive-task-contract.ts'

const [directory, phase, compression] = process.argv.slice(2)
assert.ok(directory && ['write', 'resume'].includes(phase!) && ['none', 'zstd'].includes(compression!))
process.env.DSH_HOME = join(directory, 'synthetic-home'); process.env.OTEL_SDK_DISABLED = 'true'
await mkdir(directory, { recursive: true })
const owner = taskIdentity('synthetic-persistence-owner')
const wires: any[] = []
globalThis.WebSocket = class { constructor() { throw new Error('Synthetic fixture forbids WebSocket') } } as never
globalThis.fetch = async (url, init) => {
  assert.equal(String(url), 'https://chatgpt.com/backend-api/codex/responses')
  assert.ok(wires.length < 3)
  const raw = new Headers(init!.headers).get('content-encoding') === 'zstd' ? zstdDecompressSync(init!.body as Uint8Array).toString('utf8') : String(init!.body)
  const body = JSON.parse(raw); wires.push(body)
  assert.ok(JSON.stringify(body.input).includes('PERSISTENT ORIGINAL REQUIREMENT'))
  const item = phase === 'write' && wires.length === 1
    ? { type: 'function_call', id: 'fc_fixture', call_id: 'call_fixture', name: ADAPTIVE_TASK_TOOL,
      arguments: JSON.stringify({ model: 'gpt-5.6-luna', effort: 'max', reason: 'Explicit remaining synthetic work.' }), status: 'completed' }
    : { type: 'message', id: 'm_fixture', role: 'assistant', phase: 'final_answer', status: 'completed',
      content: [{ type: 'output_text', text: 'Synthetic result with requirement retained.', annotations: [] }] }
  return new Response([{ type: 'response.output_item.added', output_index: 0, item }, { type: 'response.output_item.done', output_index: 0, item },
    { type: 'response.completed', response: { id: 'r_fixture', model: body.model, status: 'completed', output: [item] } },
  ].map(event => `data: ${JSON.stringify(event)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } })
}
const ctx = new Context()
try {
  for (const module of [Llm, Sessions, Projection, Agents, Prompt, Tools]) await ctx.plugin(module)
  await ctx.plugin(Loop, { agents: [] })
  await ctx.plugin(Persistence, { root: join(directory, 'sessions'), compression: compression as 'none' | 'zstd', packChunks: true })
  const credentials = new OpenAICodexCredentialStore()
  const claim = Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: 'synthetic-persistence' } })).toString('base64url')
  await credentials.modify('openai-codex', async () => ({ type: 'oauth', access: `e30.${claim}.fixture`, refresh: 'fixture', accountId: 'synthetic-persistence', expires: Date.now() + 3600000 }))
  let runtime!: AdaptiveTaskRuntime
  const governor = new OpenAICodexBackendRequests(undefined, undefined, 8, async () => runtime.reserveAuxiliary())
  const dispatch = { stream: (...args: Parameters<AdaptiveTaskRuntime['stream']>) => runtime.stream(...args) }
  const adapter = createOpenAICodexAdapter(credentials, () => undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, governor, dispatch)
  ctx.llm.registerAdapter(['openai-codex'], adapter)
  const catalog = await Promise.all(ADAPTIVE_TASK_MODELS.map(id => adapter.resolveModel('openai-codex', id)))
  await ctx.plugin(function TaskFixture(host: Context) {
    runtime = new AdaptiveTaskRuntime(host, { store: new AdaptiveTaskStore(join(directory, 'tasks')), models: async () => catalog })
  })
  ctx.effect(() => () => governor.dispose())
  const id = SessionId('persistent-phase1')
  const options = { provider: 'openai-codex', model: 'gpt-5.6-sol', reasoningEffort: ReasoningEffortId('medium') }
  const handle = phase === 'write' ? await ctx.agents.create({ sessionId: id, meta: { cwd: directory }, agentOptions: options })
    : await ctx.agents.resume({ resumeSessionId: id, agentOptions: options })
  const { agent } = handle
  let before = await runtime.state(id, owner)
  if (phase === 'write') {
    assert.equal(before.mode, 'off')
    await runtime.command({ sessionId: id, action: 'start', operationId: randomUUID(), revision: before.revision,
      maximumRequests: 8, models: [...ADAPTIVE_TASK_MODELS], efforts: Object.fromEntries(catalog.map(model => [model.id, model.reasoning!.efforts.map(effort => String(effort.id))])) }, owner)
  } else {
    const previous = JSON.parse(await readFile(join(directory, 'written.json'), 'utf8'))
    assert.notEqual(previous.pid, process.pid)
    assert.equal(agent.session.header.createdAt, previous.createdAt)
    assert.equal(before.mode, 'interrupted'); assert.equal(before.reserved, 2)
    agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Do not run before reauthorization.' }] }))
    await agent.whenIdle(); assert.equal(wires.length, 0)
    before = await runtime.state(id, owner)
    await runtime.command({ sessionId: id, action: 'resume', operationId: randomUUID(), revision: before.revision }, owner)
  }
  agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: phase === 'write'
    ? 'PERSISTENT ORIGINAL REQUIREMENT: inspect the fixture without discarding this requirement.' : 'Continue the same persisted task.' }] }))
  await agent.whenIdle(); await ctx.sessions.flush(agent.session)
  const state = await runtime.state(id, owner)
  assert.equal(state.reserved, phase === 'write' ? 2 : 3)
  assert.equal(wires.length, phase === 'write' ? 2 : 1)
  assert.equal(wires.at(-1).model, 'gpt-5.6-luna')
  assert.equal(wires.at(-1).reasoning.effort, 'max')
  const report = { kind: 'adaptive-task-process', phase, compression, pid: process.pid, node: process.version,
    reserved: state.reserved, requestsInProcess: wires.length, originalRequirementRetained: true, syntheticOnly: true, realProviderRequests: 0 }
  if (phase === 'write') await writeFile(join(directory, 'written.json'), JSON.stringify({ pid: process.pid, createdAt: agent.session.header.createdAt }))
  await handle.dispose()
  console.log(JSON.stringify(report))
} finally { await ctx.fiber.dispose() }
