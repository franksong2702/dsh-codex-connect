import { zstdDecompressSync } from 'node:zlib'
import { afterEach, expect, it, vi } from 'vitest'
import { codexRequestOptions } from '../src/codex-request-options.ts'
import { openaiCodexProvider } from '@earendil-works/pi-ai/providers/openai-codex'
import { createOpenAICodexAdapter } from '../src/adapter.ts'
import type { OpenAICodexCredentialStore } from '../src/store.ts'

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

it.each(['gpt-6.1-sol', 'gpt-6.1-terra', 'gpt-6-astra', 'gpt-5.6-luna', 'gpt-5.6-sol'].flatMap(model => [undefined, 0, 0.75].map(temperature => ({ model, temperature }))))('omits unsupported temperature on the real Codex request for %j', async ({ model, temperature }) => {
  const token = 'header.' + Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: 'synthetic' } })).toString('base64url') + '.signature'
  const credentials = { captureActiveAccount: async () => credentials,
    read: async () => ({ type: 'oauth', accountId: 'synthetic', access: token, refresh: 'synthetic', expires: Date.now() + 3600000 }),
  } as unknown as OpenAICodexCredentialStore
  const bodies: Record<string, unknown>[] = []
  vi.stubGlobal('fetch', vi.fn(async (_url: unknown, init?: RequestInit) => {
    const raw = new Headers(init?.headers).get('content-encoding') === 'zstd' ? zstdDecompressSync(init?.body as Uint8Array).toString() : String(init?.body)
    bodies.push(JSON.parse(raw))
    const item = { type: 'message', id: 'fixture', role: 'assistant', phase: 'final_answer', status: 'completed', content: [{ type: 'output_text', text: 'OK', annotations: [] }] }
    const events = [
      { type: 'response.output_item.added', output_index: 0, item: { ...item, content: [] } },
      { type: 'response.output_text.delta', item_id: item.id, output_index: 0, content_index: 0, delta: 'OK' },
      { type: 'response.output_item.done', output_index: 0, item },
      { type: 'response.completed', response: { id: 'synthetic', status: 'completed', output: [item], usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } } },
    ]
    return new Response(events.map(event => 'data: ' + JSON.stringify(event) + '\n\n').join(''), { headers: { 'content-type': 'text/event-stream' } })
  }))
  const adapter = createOpenAICodexAdapter(credentials, () => undefined)
  const chunks: unknown[] = []
  for await (const _chunk of adapter.stream({ provider: 'openai-codex', model, messages: [], ...(temperature === undefined ? {} : { temperature }), maxTokens: 128 })) { chunks.push(_chunk) }
  expect(bodies, JSON.stringify(chunks)).toHaveLength(1)
  expect(bodies[0]).not.toHaveProperty('temperature')
  expect(chunks).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'finish', reason: { kind: 'stop' } })]))
  expect(bodies[0]).toMatchObject({ model, stream: true, store: false })
})


it('composes after payload replacement and retains supported fields without mutating options', async () => {
  const model = openaiCodexProvider().getModels()[0]!
  const body = { temperature: 0.5, model: model.id, reasoning: { effort: 'high' }, text: { verbosity: 'low' }, tool_choice: 'auto' }
  const onPayload = vi.fn(async () => body)
  const options = { temperature: 0, maxTokens: 123, sessionId: 'synthetic', maxRetries: 0, onPayload }
  const projected = codexRequestOptions('openai-codex', model, options)!
  expect(projected).toMatchObject({ temperature: 0, maxTokens: 123, sessionId: 'synthetic', maxRetries: 0 })
  expect(await projected.onPayload!({}, model)).toEqual({ model: model.id, reasoning: body.reasoning, text: body.text, tool_choice: 'auto' })
  expect(body.temperature).toBe(0.5)
  expect(options.onPayload).toBe(onPayload)
})

it('preserves sampling for foreign provider and non-Codex API routes', () => {
  const model = openaiCodexProvider().getModels()[0]!
  const options = { temperature: 0.75, onPayload: vi.fn() }
  expect(codexRequestOptions('deepseek', model, options)).toBe(options)
  expect(codexRequestOptions('openai-codex', { ...model, provider: 'deepseek' }, options)).toBe(options)
  expect(codexRequestOptions('openai-codex', { ...model, api: 'openai-responses' }, options)).toBe(options)
})

it('projects a frozen payload and preserves hook errors rather than swallowing configuration failures', async () => {
  const model = openaiCodexProvider().getModels()[0]!
  const body = Object.freeze({ temperature: 0, input: [], text: { verbosity: 'high' } })
  const options = Object.freeze({ onPayload: async () => body })
  expect(await codexRequestOptions('openai-codex', model, options)!.onPayload!({}, model)).toEqual({ input: [], text: body.text })
  const failure = new Error('synthetic payload hook failure')
  await expect(codexRequestOptions('openai-codex', model, { onPayload() { throw failure } })!.onPayload!({}, model)).rejects.toBe(failure)
})
