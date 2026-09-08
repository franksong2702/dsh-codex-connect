import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { zstdDecompressSync } from 'node:zlib'
import { Context } from '@deepseek-ai/cordis'
import LlmRuntime, { BlockAssembler, createMessage, ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, Message, ToolSchema } from '@deepseek-ai/dsh-llm'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createOpenAICodexAdapter, OPENAI_CODEX_ASTRA_MODEL_ID } from '../src/adapter.ts'
import { OpenAICodexCredentialStore, OPENAI_CODEX_PROVIDER } from '../src/store.ts'

let context: Context
let root: string
const selection = { provider: OPENAI_CODEX_PROVIDER, model: OPENAI_CODEX_ASTRA_MODEL_ID }
const tools: ToolSchema[] = [{ name: 'lookup', description: 'Read a fixture value', parameters: { type: 'object', properties: { key: { type: 'string' } }, required: ['key'], additionalProperties: false } }]

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'codex-astra-tool-replay-'))
  const store = new OpenAICodexCredentialStore(join(root, 'auth.json'))
  const payload = Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: 'fixture' } })).toString('base64url')
  await store.modify(OPENAI_CODEX_PROVIDER, async () => ({ type: 'oauth', accountId: 'fixture', access: `e30.${payload}.fixture`, refresh: 'fixture', expires: Date.now() + 3600000 }))
  context = new Context()
  await context.plugin(LlmRuntime)
  await context.plugin({ inject: ['llm'], apply(ctx) { ctx.llm.registerAdapter([OPENAI_CODEX_PROVIDER], createOpenAICodexAdapter(store, () => undefined)) } })
})

afterEach(async () => {
  vi.unstubAllGlobals()
  await context?.fiber.dispose()
  if (root !== undefined) await rm(root, { recursive: true, force: true })
})

function response(items: Record<string, unknown>[]): Response {
  const events = items.flatMap((item, output_index) => [
    { type: 'response.output_item.added', output_index, item },
    { type: 'response.output_item.done', output_index, item },
  ])
  return new Response([...events, { type: 'response.completed', response: { id: 'resp_fixture', status: 'completed', output: items, usage: { input_tokens: 20, output_tokens: 10, total_tokens: 30 } } }].map(event => `data: ${JSON.stringify(event)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } })
}

function textItem(id: string, phase: string, text: string): Record<string, unknown> {
  return { type: 'message', id, role: 'assistant', phase, status: 'completed', content: [{ type: 'output_text', text, annotations: [] }] }
}

it.each(['', 'Inspect the fixture.'])('preserves reasoning, phases, and parallel tool correlation across JSON round trips (summary=%j)', async summary => {
  const reasoning = { type: 'reasoning', id: 'rs_fixture', encrypted_content: 'synthetic-encrypted-fixture', summary: summary === '' ? [] : [{ type: 'summary_text', text: summary }] }
  const calls = ['a', 'b'].map(key => ({ type: 'function_call', id: `fc_${key}`, call_id: `call_${key}`, name: 'lookup', arguments: JSON.stringify({ key }), status: 'completed' }))
  const wires: Record<string, unknown>[] = []
  vi.stubGlobal('fetch', vi.fn(async (_url: unknown, init: RequestInit) => {
    const body = new Headers(init.headers).get('content-encoding') === 'zstd' ? zstdDecompressSync(init.body as Uint8Array).toString('utf8') : String(init.body)
    wires.push(JSON.parse(body) as Record<string, unknown>)
    if (wires.length === 1) return response([reasoning, textItem('msg_work', 'commentary', 'Checking both values.'), ...calls])
    if (wires.length <= 3) return response([textItem(`msg_final_${wires.length}`, 'final_answer', 'Both values checked.')])
    throw new Error('Unexpected extra dispatch')
  }))
  const history: Message[] = [createMessage({ role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'Check a and b.' }] })]
  async function turn() {
    const prepared = await context.llm.prepareCall({ ...selection, reasoningEffort: ReasoningEffortId('high') })
    const assembler = new BlockAssembler()
    for await (const chunk of prepared.stream({ ...prepared.config, messages: history, tools, sessionId: 'fixture-session' as NonNullable<GenerateOptions['sessionId']> })) assembler.push(chunk)
    history.push(JSON.parse(JSON.stringify(assembler.message({ kind: 'model', ...selection, replayState: assembler.replayState }))) as Message)
    return assembler
  }
  const first = await turn()
  expect(first.finish).toEqual({ kind: 'tool-calls' })
  const toolCalls = first.blocks().filter(block => block.type === 'tool-call')
  expect(toolCalls).toHaveLength(2)
  for (const call of [...toolCalls].reverse()) {
    history.push(createMessage({ role: 'user', source: { kind: 'tool', callId: call.id }, content: [{ type: 'tool-result', toolCallId: call.id, content: [{ type: 'text', text: `value:${JSON.parse(call.arguments).key as string}` }] }] }))
  }
  expect((await turn()).finish).toEqual({ kind: 'stop' })
  history.push(createMessage({ role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'Confirm.' }] }))
  expect((await turn()).finish).toEqual({ kind: 'stop' })
  const secondInput = wires[1]?.input as Record<string, unknown>[]
  expect(secondInput).toContainEqual(reasoning)
  expect(secondInput).toContainEqual(expect.objectContaining({ id: 'msg_work', phase: 'commentary', role: 'assistant' }))
  for (const key of ['a', 'b']) {
    expect(secondInput).toContainEqual(expect.objectContaining({ type: 'function_call', call_id: `call_${key}`, name: 'lookup', arguments: JSON.stringify({ key }) }))
    expect(secondInput).toContainEqual(expect.objectContaining({ type: 'function_call_output', call_id: `call_${key}`, output: `value:${key}` }))
  }
  expect(wires[2]?.input).toContainEqual(expect.objectContaining({ id: 'msg_final_2', phase: 'final_answer', role: 'assistant' }))
  for (const wire of wires) {
    expect(wire).toMatchObject({ model: selection.model, store: false, parallel_tool_calls: true, prompt_cache_key: 'fixture-session', reasoning: { effort: 'high' }, include: ['reasoning.encrypted_content'] })
    expect(wire.tools).toEqual(wires[0]?.tools)
  }
})
