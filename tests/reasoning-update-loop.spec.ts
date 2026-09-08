import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { zstdDecompressSync } from 'node:zlib'
import { Context } from '@deepseek-ai/cordis'
import { AgentRegistry } from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import LlmRuntime, { createUserMessage, ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import SessionProjections from '@deepseek-ai/dsh-session-projection'
import { SessionStore } from '@deepseek-ai/dsh-session'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import UserQuestions from '@deepseek-ai/dsh-user-questions'
import { afterEach, expect, it, vi } from 'vitest'
import * as CodexConnect from '../src/index.ts'
import { OpenAICodexCredentialStore, OPENAI_CODEX_PROVIDER } from '../src/store.ts'
import { planReasoningUpdates, readReasoningUpdate } from '../src/reasoning-update.ts'

let ctx: Context | undefined
let root: string | undefined
afterEach(async () => {
  await ctx?.fiber.dispose()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  if (root !== undefined) await rm(root, { recursive: true, force: true })
})

function response(output: Record<string, unknown>[]): Response {
  const events = output.flatMap((item, output_index) => [
    { type: 'response.output_item.added', output_index, item },
    { type: 'response.output_item.done', output_index, item },
  ])
  return new Response([...events, { type: 'response.completed', response: { id: 'resp_fixture', status: 'completed', output, usage: { input_tokens: 20, output_tokens: 10, total_tokens: 30 } } }].map(event => `data: ${JSON.stringify(event)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } })
}

async function setup(enabled = true) {
  root = await mkdtemp(join(tmpdir(), 'codex-reasoning-loop-'))
  vi.stubEnv('DSH_HOME', root)
  const store = new OpenAICodexCredentialStore(join(root, '.openai-codex-auth.json'))
  const payload = Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: 'fixture' } })).toString('base64url')
  await store.modify(OPENAI_CODEX_PROVIDER, async () => ({ type: 'oauth', accountId: 'fixture', access: `e30.${payload}.fixture`, refresh: 'fixture', expires: Date.now() + 3600000 }))
  const context = new Context()
  ctx = context
  await context.plugin(LlmRuntime)
  await context.plugin(SessionStore)
  await context.plugin(SessionProjections)
  await context.plugin(AgentRegistry)
  await context.plugin(SystemPrompt)
  await context.plugin(ToolRuntime, { mode: 'native' })
  await context.plugin(UserQuestions)
  const plugin = await context.plugin(CodexConnect, { enableReasoningUpdates: enabled })
  await context.plugin(AgentLoop, { agents: [] })
  const handle = await context.agents.create({ sessionId: SessionId('reasoning-loop'), meta: { cwd: root }, agentOptions: { provider: 'openai-codex', model: 'gpt-6-astra', reasoningEffort: ReasoningEffortId('low') } })
  return { context, agent: handle.agent, plugin }
}

it.each([true, false])('runs real loop tool confirmation, then replays the recorded request (approved=%s)', async approved => {
  const { context, agent } = await setup()
  const questions = vi.fn(async () => ({ answers: [{ id: 'astra-reasoning-effort', selected: [approved ? 'Change to high' : 'Keep current effort'] }] }))
  context.on('user-questions/request', questions)
  const wires: Record<string, unknown>[] = []
  vi.stubGlobal('fetch', vi.fn(async (_url: unknown, init: RequestInit) => {
    const body = new Headers(init.headers).get('content-encoding') === 'zstd' ? zstdDecompressSync(init.body as Uint8Array).toString('utf8') : String(init.body)
    wires.push(JSON.parse(body) as Record<string, unknown>)
    if (wires.length === 1) return response([{ type: 'function_call', id: 'fc_change', call_id: 'call_change', name: CodexConnect.ASTRA_REASONING_TOOL_NAME, arguments: JSON.stringify({ effort: 'high', reason: 'The next step needs a careful proof.' }), status: 'completed' }])
    return response([{ type: 'message', id: `msg_${wires.length}`, role: 'assistant', phase: 'final_answer', status: 'completed', content: [{ type: 'output_text', text: 'Done.', annotations: [] }] }])
  }))
  agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Solve the fixture.' }] }))
  await agent.whenIdle()
  expect(questions).toHaveBeenCalledTimes(1)
  expect(wires).toHaveLength(2)
  const input = wires[1]!.input as Record<string, unknown>[]
  expect(input.filter(item => item.type === 'configuration_update')).toEqual(approved ? [{ type: 'configuration_update', reasoning: { effort: 'high' } }] : [])
  expect(wires.map(wire => wire.reasoning)).toEqual([{ effort: 'low', summary: 'auto' }, { effort: 'low', summary: 'auto' }])
  const restored = Session.create(agent.id, JSON.parse(JSON.stringify(agent.session.snapshotEvents())))
  const messages = restored.deriveMessages()
  expect(messages.filter(message => readReasoningUpdate(message) !== undefined)).toHaveLength(approved ? 1 : 0)
  const prepared = await context.llm.prepareCall({ provider: 'openai-codex', model: 'gpt-6-astra', reasoningEffort: ReasoningEffortId('low') })
  for await (const _ of prepared.stream({ ...prepared.config, sessionId: agent.id, messages })) { /* Drain the real adapter replay. */ }
  const replay = wires[2]!.input as Record<string, unknown>[]
  expect(replay.filter(item => item.type === 'configuration_update')).toEqual(input.filter(item => item.type === 'configuration_update'))
  if (approved) expect(replay.findIndex(item => item.type === 'configuration_update')).toBe(input.findIndex(item => item.type === 'configuration_update'))
  expect(planReasoningUpdates({ ...prepared.config, sessionId: agent.id, messages })?.effectiveEffort).toBe(approved ? 'high' : undefined)
  // Prepared calls share an adapter, but must never share the request-local update plan.
  async function concurrent(sessionId: ReturnType<typeof SessionId>, history: typeof messages) {
    const call = await context.llm.prepareCall({ provider: 'openai-codex', model: 'gpt-6-astra', reasoningEffort: ReasoningEffortId('low') })
    for await (const _ of call.stream({ ...call.config, sessionId, messages: history })) { /* Drain concurrent transport. */ }
  }
  await Promise.all([concurrent(agent.id, messages), concurrent(SessionId('unrelated-session'), [createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Unrelated.' }] })])])
  const unrelated = wires.find(wire => wire.prompt_cache_key === 'unrelated-session')!
  expect((unrelated.input as Record<string, unknown>[]).some(item => item.type === 'configuration_update')).toBe(false)
  const own = wires.filter(wire => wire.prompt_cache_key === agent.id).at(-1)!
  expect((own.input as Record<string, unknown>[]).filter(item => item.type === 'configuration_update')).toHaveLength(approved ? 1 : 0)
  expect(input.map(item => item.type === 'configuration_update' ? item : item.type === 'function_call_output' ? { type: item.type, output: item.output } : { type: item.type ?? 'message', role: item.role })).toMatchSnapshot()
})

it('does not register the experimental tool by default', async () => {
  const { context } = await setup(false)
  expect(context.tools.get(CodexConnect.ASTRA_REASONING_TOOL_NAME)).toBeUndefined()
})

it.each(['cancel', 'unload', 'model-change', 'decline'] as const)('leaves no queued or admitted update after %s during confirmation', async action => {
  const { context, agent, plugin } = await setup()
  vi.stubGlobal('fetch', vi.fn(async () => response([{ type: 'message', id: 'msg_initial', role: 'assistant', phase: 'final_answer', status: 'completed', content: [{ type: 'output_text', text: 'Ready.', annotations: [] }] }])))
  agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Start.' }] }))
  await agent.whenIdle()
  let answer: ((value: { answers: { id: string; selected: string[] }[] }) => void) | undefined
  context.on('user-questions/request', async request => new Promise((resolve, reject) => {
    const abort = () => reject(request.signal?.reason)
    request.signal?.addEventListener('abort', abort, { once: true })
    answer = value => {
      request.signal?.removeEventListener('abort', abort)
      resolve(value)
    }
  }))
  const controller = new AbortController()
  const execution = context.tools.execute({ name: CodexConnect.ASTRA_REASONING_TOOL_NAME, callId: 'call_manual' as never, arguments: { effort: 'high', reason: 'Check carefully.' }, agent, signal: controller.signal })
  // Observe both rejection and rendered tool errors without leaving an unhandled promise.
  const settled = execution.then(value => value, error => error)
  await vi.waitFor(() => expect(answer).toBeDefined())
  if (action === 'cancel') controller.abort(new Error('Canceled by fixture user'))
  if (action === 'unload') await plugin.dispose()
  if (action === 'model-change') agent.session.append('model/selection', { provider: 'openai-codex', model: 'gpt-6-astra', reasoningEffort: ReasoningEffortId('medium') })
  answer!({ answers: [{ id: 'astra-reasoning-effort', selected: [action === 'decline' ? 'Keep current effort' : 'Change to high'] }] })
  await settled
  expect([...agent.inbox.nextStep, ...agent.inbox.nextTurn].filter(message => readReasoningUpdate(message) !== undefined)).toHaveLength(0)
  expect(agent.session.deriveMessages().filter(message => readReasoningUpdate(message) !== undefined)).toHaveLength(0)
})
