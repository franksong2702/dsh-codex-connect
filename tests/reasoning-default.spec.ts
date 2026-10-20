import { zstdDecompressSync } from 'node:zlib'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import { createOpenAICodexAdapter } from '../src/adapter.ts'
import { resolveOpenAICodexModelCatalog } from '../src/model-discovery.ts'
import { decodeOpenAICodexModelCatalog } from '../src/model-contract.ts'
import { Config } from '../src/index.ts'
import { DEFAULT_OPENAI_CODEX_SETTINGS, decodeOpenAICodexSettings, resolveOpenAICodexSettings } from '../src/settings-contract.ts'
import type { OpenAICodexReasoningEffort } from '../src/reasoning-contract.ts'
import type { OpenAICodexCredentialStore } from '../src/store.ts'

afterEach(() => { vi.unstubAllGlobals() })
function fixture(initial?: OpenAICodexReasoningEffort) {
  let effort = initial
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const read = vi.fn(async () => ({ type: 'oauth', accountId: 'synthetic-reasoning', refresh: 'synthetic', expires: Date.now() + 3600000,
    access: `${encode({ alg: 'none' })}.${encode({ 'https://api.openai.com/auth': { chatgpt_account_id: 'synthetic-reasoning' } })}.synthetic` }))
  const credentials = { read } as unknown as OpenAICodexCredentialStore
  credentials.captureActiveAccount = async () => credentials
  const wires: Record<string, unknown>[] = []
  const fetch = vi.fn(async (_url: unknown, init: RequestInit) => {
    const raw = new Headers(init.headers).get('content-encoding') === 'zstd'
      ? zstdDecompressSync(init.body as Uint8Array).toString('utf8') : String(init.body)
    wires.push(JSON.parse(raw))
    const model = 'gpt-6.1-sol'
    const item = { type: 'message', id: 'msg_fixture', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'fixture', annotations: [] }] }
    return new Response([
      { type: 'response.created', response: { id: 'resp_fixture', status: 'in_progress', model } },
      { type: 'response.output_item.added', output_index: 0, item },
      { type: 'response.output_item.done', output_index: 0, item },
      { type: 'response.completed', response: { id: 'resp_fixture', status: 'completed', model, output: [item], usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } } },
    ].map(event => `data: ${JSON.stringify(event)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } })
  })
  vi.stubGlobal('fetch', fetch)
  const adapter = createOpenAICodexAdapter(credentials, () => undefined, undefined, () => ['gpt-6-astra'], undefined, undefined, undefined,
    undefined, undefined, undefined, undefined, undefined, undefined, undefined, () => effort)
  return { adapter, wires, read, fetch, set: (next?: OpenAICodexReasoningEffort) => { effort = next } }
}
const options: GenerateOptions = { provider: 'openai-codex', model: 'gpt-6.1-sol', messages: [], maxTokens: 1024 }
async function collect(stream: AsyncIterable<StreamChunk>) {
  const chunks: StreamChunk[] = []
  for await (const chunk of stream) chunks.push(chunk)
  return chunks
}

describe('public reasoning fallback through real Host adapter and pi-ai SSE', () => {
  it('advertises actual efforts without credentials, including hidden models and optional default', async () => {
    const f = fixture()
    expect((await f.adapter.listModels('openai-codex')).map(model => model.id)).toEqual(['gpt-6-astra'])
    const bare = await resolveOpenAICodexModelCatalog(f.adapter)
    const expected = await f.adapter.resolveModel('openai-codex', 'gpt-6.1-sol')
    expect(bare.find(entry => entry.id === options.model)?.reasoning).toEqual(expected.reasoning)
    expect(expected.reasoning?.defaultEffort).toBeUndefined()
    f.set('max')
    const catalog = await resolveOpenAICodexModelCatalog(f.adapter)
    expect(catalog.find(entry => entry.id === options.model)?.reasoning).toMatchObject({ defaultEffort: 'max', efforts: expect.arrayContaining([{ id: 'max', name: 'Max' }]) })
    expect(decodeOpenAICodexModelCatalog(catalog)).toEqual(catalog)
    expect(f.read).not.toHaveBeenCalled()
    expect(f.fetch).not.toHaveBeenCalled()
  })
  it('keeps omission identical to provider behavior and lets explicit requests override the profile', async () => {
    const f = fixture()
    await collect(f.adapter.stream(options))
    const providerDefault = f.wires[0]?.reasoning
    f.set('max')
    await collect(f.adapter.stream(options))
    await collect(f.adapter.stream({ ...options, reasoningEffort: ReasoningEffortId('high') }))
    f.set(undefined)
    await collect(f.adapter.stream(options))
    expect(f.wires.map(wire => wire.reasoning)).toEqual([providerDefault, { effort: 'max', summary: 'auto' }, { effort: 'high', summary: 'auto' }, providerDefault])
    expect(f.wires.every(wire => wire.max_output_tokens === undefined && wire.service_tier === undefined && wire.stream === true)).toBe(true)
  })
  it('preserves prepared profile snapshots across a live default change', async () => {
    const f = fixture('max')
    const old = await f.adapter.prepareCall('openai-codex', options.model)
    f.set('high')
    const current = await f.adapter.prepareCall('openai-codex', options.model)
    await collect(old.stream(options))
    await collect(current.stream(options))
    expect(f.wires.map(wire => (wire.reasoning as { effort: string }).effort)).toEqual(['max', 'high'])
    expect(old.model.reasoning?.defaultEffort).toBe('max')
    expect(current.model.reasoning?.defaultEffort).toBe('high')
  })
  it('keeps unsupported models discoverable and rejects unsupported effort before credentials or transport', async () => {
    const f = fixture('off')
    expect((await f.adapter.resolveModel('openai-codex', options.model)).reasoning?.defaultEffort).toBeUndefined()
    await expect(collect(f.adapter.stream(options))).rejects.toMatchObject({ code: 'UNSUPPORTED_REASONING_EFFORT' })
    expect(f.read).not.toHaveBeenCalled()
    expect(f.fetch).not.toHaveBeenCalled()
    await collect(f.adapter.stream({ ...options, reasoningEffort: ReasoningEffortId('high') }))
    expect(f.wires).toHaveLength(1)
  })
  it('preserves omission and null reset, and validates Host and browser inputs', () => {
    expect(Config({}).reasoningEffort.get()).toBeUndefined()
    expect(Config({ reasoningEffort: null }).reasoningEffort.get()).toBeNull()
    expect(resolveOpenAICodexSettings({ reasoningEffort: null }).reasoningEffort).toBeUndefined()
    expect(decodeOpenAICodexSettings(DEFAULT_OPENAI_CODEX_SETTINGS)?.reasoningEffort).toBeUndefined()
    for (const value of ['max', 'high', 'off'] as const) {
      expect(Config({ reasoningEffort: value }).reasoningEffort.get()).toBe(value)
      expect(decodeOpenAICodexSettings({ ...DEFAULT_OPENAI_CODEX_SETTINGS, reasoningEffort: value })?.reasoningEffort).toBe(value)
    }
    for (const value of ['ultra', 'MAX', 1, {}, []]) {
      expect(() => Config({ reasoningEffort: value } as never)).toThrow()
      expect(decodeOpenAICodexSettings({ ...DEFAULT_OPENAI_CODEX_SETTINGS, reasoningEffort: value })).toBeUndefined()
    }
  })
  it('clones future Host effort ids and rejects duplicate or inconsistent wire metadata', async () => {
    const f = fixture()
    const catalog = await resolveOpenAICodexModelCatalog(f.adapter)
    const model = { ...catalog[0]!, reasoning: { efforts: [{ id: 'future-effort', name: 'Future' }], defaultEffort: 'future-effort' } }
    const decoded = decodeOpenAICodexModelCatalog([model])!
    model.reasoning.efforts[0]!.name = 'Changed'
    expect(decoded[0]?.reasoning?.efforts[0]?.name).toBe('Future')
    expect(decodeOpenAICodexModelCatalog([{ ...model, reasoning: { ...model.reasoning, defaultEffort: 'missing' } }])).toBeUndefined()
    expect(decodeOpenAICodexModelCatalog([{ ...model, reasoning: { efforts: [model.reasoning.efforts[0], model.reasoning.efforts[0]] } }])).toBeUndefined()
    const { reasoning: _reasoning, ...legacy } = model
    expect(decodeOpenAICodexModelCatalog([legacy])).toEqual([legacy])
  })
})
