import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { zstdDecompressSync } from 'node:zlib'
import { Context } from '@deepseek-ai/cordis'
import LlmRuntime, { ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createOpenAICodexAdapter, OPENAI_CODEX_ASTRA_MODEL_ID } from '../src/adapter.ts'
import { OpenAICodexCredentialStore, OPENAI_CODEX_PROVIDER } from '../src/store.ts'

let context: Context
let root: string
let store: OpenAICodexCredentialStore

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'codex-astra-reasoning-'))
  store = new OpenAICodexCredentialStore(join(root, 'auth.json'))
  context = new Context()
  await context.plugin(LlmRuntime)
  await context.plugin({
    inject: ['llm'],
    apply(ctx) {
      ctx.llm.registerAdapter([OPENAI_CODEX_PROVIDER], createOpenAICodexAdapter(store, () => undefined))
    },
  })
})

afterEach(async () => {
  vi.unstubAllGlobals()
  await context?.fiber.dispose()
  if (root !== undefined) await rm(root, { recursive: true, force: true })
})

const selection = { provider: OPENAI_CODEX_PROVIDER, model: OPENAI_CODEX_ASTRA_MODEL_ID }

describe('Astra reasoning selections', () => {
  it('exposes five effective levels and leaves the provider default unspecified', async () => {
    const info = await context.llm.resolveModelInfo(selection.provider, selection.model)
    expect(info.reasoning).toEqual({ efforts: [
      { id: 'low', name: 'Low' },
      { id: 'medium', name: 'Medium' },
      { id: 'high', name: 'High' },
      { id: 'xhigh', name: 'Xhigh' },
      { id: 'max', name: 'Max' },
    ] })
    const prepared = await context.llm.prepareCall(selection)
    expect(prepared.config).toEqual(selection)
  })

  it.each(['off', 'minimal', 'none'])('rejects %s before authentication or dispatch without rewriting the selection', async effort => {
    const capture = vi.spyOn(store, 'captureActiveAccount')
    const fetch = vi.fn(() => { throw new Error('Unexpected network request') })
    vi.stubGlobal('fetch', fetch)
    const config = Object.freeze({ ...selection, reasoningEffort: ReasoningEffortId(effort) })
    await expect(context.llm.resolveCallConfig(config)).rejects.toMatchObject({ code: 'UNSUPPORTED_REASONING_EFFORT' })
    await expect(context.llm.prepareCall(config)).rejects.toMatchObject({ code: 'UNSUPPORTED_REASONING_EFFORT' })
    expect(config.reasoningEffort).toBe(effort)
    expect(capture).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it.each([undefined, 'low', 'medium', 'high', 'xhigh', 'max'])('dispatches %s through a prepared Harness call without changing its wire effort', async effort => {
    const payload = Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: 'fixture' } })).toString('base64url')
    await store.modify(OPENAI_CODEX_PROVIDER, async () => ({ type: 'oauth', accountId: 'fixture', access: `e30.${payload}.fixture`, refresh: 'fixture', expires: Date.now() + 3600000 }))
    let wire: Record<string, unknown> | undefined
    const fetch = vi.fn(async (_url: unknown, init: RequestInit) => {
      const body = new Headers(init.headers).get('content-encoding') === 'zstd'
        ? zstdDecompressSync(init.body as Uint8Array).toString('utf8')
        : String(init.body)
      wire = JSON.parse(body) as Record<string, unknown>
      const item = { type: 'message', id: 'msg_fixture', role: 'assistant', phase: 'final_answer', status: 'completed', content: [{ type: 'output_text', text: 'OK', annotations: [] }] }
      const events = [
        { type: 'response.output_item.added', output_index: 0, item: { ...item, content: [] } },
        { type: 'response.output_text.delta', item_id: item.id, output_index: 0, content_index: 0, delta: 'OK' },
        { type: 'response.output_item.done', output_index: 0, item },
        { type: 'response.completed', response: { id: 'resp_fixture', status: 'completed', output: [item], usage: { input_tokens: 10, output_tokens: 2, total_tokens: 12 } } },
      ]
      return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('') + 'data: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } })
    })
    vi.stubGlobal('fetch', fetch)
    const prepared = await context.llm.prepareCall({ ...selection, ...(effort === undefined ? {} : { reasoningEffort: ReasoningEffortId(effort) }) })
    const chunks = []
    for await (const chunk of prepared.stream({ ...prepared.config, messages: [] })) chunks.push(chunk)
    expect(fetch).toHaveBeenCalledOnce()
    if (effort === undefined) expect(wire).not.toHaveProperty('reasoning')
    else expect(wire?.reasoning).toMatchObject({ effort })
    expect(chunks.find(chunk => chunk.type === 'finish')).toMatchObject({ reason: { kind: 'stop' } })
  })
})
