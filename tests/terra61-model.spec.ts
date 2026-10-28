import { zstdDecompressSync } from 'node:zlib'
import { afterEach, expect, it, vi } from 'vitest'
import type { AttachmentStore, ImageAttachmentRef, RequestImageAttachment } from '@deepseek-ai/dsh-attachment'
import { createMessage, ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import { openaiCodexProvider } from '@earendil-works/pi-ai/providers/openai-codex'
import { createOpenAICodexAdapter, openAICodexModelCatalog, withOpenAICodexModels } from '../src/adapter.ts'
import { resolveOpenAICodexModelCatalog } from '../src/model-discovery.ts'
import type { OpenAICodexCredentialStore } from '../src/store.ts'

const id = 'gpt-6.1-terra'
const providerId = 'openai-codex'
afterEach(() => { vi.unstubAllGlobals() })

it('fills Terra once with Codex budgets, image input and existing Responses tool capabilities', () => {
  const provider = openaiCodexProvider()
  const baseline = withOpenAICodexModels(provider).getModels().filter(model => model.id !== id)
  const snapshot = structuredClone(baseline)
  const wrapped = withOpenAICodexModels({ ...provider, getModels: () => baseline })
  expect(wrapped.getModels().filter(model => model.id === id)).toEqual([expect.objectContaining({
    id, name: 'GPT-6.1 Terra', api: 'openai-codex-responses', provider: providerId,
    baseUrl: 'https://chatgpt.com/backend-api', reasoning: true, input: ['text', 'image'],
    contextWindow: 500_000, maxTokens: 128_000,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    compat: { supportsOpenAIGrammarTools: true, supportsAdditionalTools: true, supportsToolSearch: true },
  })])
  expect(wrapped.getModels().filter(model => model.id !== id)).toEqual(snapshot)
  expect(baseline).toEqual(snapshot)
  expect(withOpenAICodexModels(wrapped).getModels()).toEqual(wrapped.getModels())
})

it.each(['provider', 'bundled-static'] as const)('keeps native Terra metadata but applies the Sol effort mask at the %s boundary', source => {
  const provider = openaiCodexProvider()
  const native = { ...provider.getModels()[0]!, id, name: 'Native Terra', contextWindow: 272_000, maxTokens: 96_000,
    cost: { input: 1, output: 2, cacheRead: 3, cacheWrite: 4 },
    compat: { supportsStrictMode: false }, thinkingLevelMap: { off: 'none', minimal: 'low', max: null } as const }
  const snapshot = structuredClone(native)
  const wrapped = withOpenAICodexModels({ ...provider, getModels: () => [native] }, source)
  expect(wrapped.getModels().filter(model => model.id === id)).toEqual([{ ...snapshot,
    thinkingLevelMap: { off: null, minimal: null, xhigh: 'xhigh', max: 'max' } }])
  expect(native).toEqual(snapshot)
})

it('offers Terra without credentials and keeps a hidden selection resolvable', async () => {
  const captureActiveAccount = vi.fn(() => { throw new Error('discovery must stay signed out') })
  const fetch = vi.fn(() => { throw new Error('discovery must stay offline') })
  vi.stubGlobal('fetch', fetch)
  let visible: string[] | undefined
  const adapter = createOpenAICodexAdapter({ captureActiveAccount } as unknown as OpenAICodexCredentialStore,
    () => undefined, undefined, () => visible)
  expect((await adapter.listModels(providerId)).map(model => model.id)).toContain(id)
  expect(openAICodexModelCatalog().find(model => model.id === id)).toMatchObject({ contextWindow: 500_000, maxContextWindow: 872_000 })
  visible = [id]
  expect((await adapter.listModels(providerId)).map(model => model.id)).toEqual([id])
  visible = []
  expect(await adapter.listModels(providerId)).toEqual([])
  expect((await adapter.prepareCall(providerId, id)).model).toMatchObject({ id, inputModalities: ['text', 'image'], context: { contextWindow: 500_000 } })
  const catalog = await resolveOpenAICodexModelCatalog(adapter)
  expect(catalog.find(model => model.id === id)?.reasoning?.efforts.map(effort => effort.id)).toEqual(['low', 'medium', 'high', 'xhigh', 'max'])
  expect(captureActiveAccount).not.toHaveBeenCalled()
  expect(fetch).not.toHaveBeenCalled()
})

it('sends a synthetic attachment and function through the real Host/pi-ai Codex Responses route', async () => {
  const data = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC', 'base64')
  const attachment: ImageAttachmentRef = { attachmentId: `sha256:${'a'.repeat(64)}` as ImageAttachmentRef['attachmentId'], mediaType: 'image/png', width: 1, height: 1, bytes: data.byteLength }
  const readImageRequest = vi.fn<AttachmentStore['readImageRequest']>(async () => ({ ...attachment, attachment, data,
    variantId: 'fixture-variant' as RequestImageAttachment['variantId'], depth: 'uchar', space: 'srgb', hasAlpha: false }))
  const attachments = { readImageRequest } as unknown as AttachmentStore
  const payload = Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: 'fixture-terra' } })).toString('base64url')
  const credentials = { read: async () => ({ type: 'oauth', accountId: 'fixture-terra', access: `e30.${payload}.fixture`, refresh: 'fixture', expires: Date.now() + 3600000 }) } as unknown as OpenAICodexCredentialStore
  credentials.captureActiveAccount = async () => credentials
  let wire: Record<string, unknown> | undefined
  vi.stubGlobal('fetch', vi.fn(async (url: unknown, init: RequestInit) => {
    expect(String(url)).toBe('https://chatgpt.com/backend-api/codex/responses')
    const raw = new Headers(init.headers).get('content-encoding') === 'zstd'
      ? zstdDecompressSync(init.body as Uint8Array).toString('utf8') : String(init.body)
    wire = JSON.parse(raw)
    const item = { type: 'message', id: 'msg_fixture', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'OK', annotations: [] }] }
    const events = [
      { type: 'response.output_item.added', output_index: 0, item: { ...item, content: [] } },
      { type: 'response.output_text.delta', item_id: item.id, output_index: 0, content_index: 0, delta: 'OK' },
      { type: 'response.output_item.done', output_index: 0, item },
      { type: 'response.completed', response: { id: 'resp_fixture', status: 'completed', output: [item], usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } } },
    ]
    return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } })
  }))
  const adapter = createOpenAICodexAdapter(credentials, () => attachments)
  const prepared = await adapter.prepareCall(providerId, id)
  const chunks = []
  for await (const chunk of prepared.stream({ provider: providerId, model: id, reasoningEffort: ReasoningEffortId('high'),
    messages: [createMessage({ role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'Inspect the fixture.' }, { type: 'image', attachment }] })],
    tools: [{ name: 'lookup', description: 'Read a fixture', parameters: { type: 'object', properties: {} } }],
  })) chunks.push(chunk)
  expect(readImageRequest).toHaveBeenCalledOnce()
  expect(wire).toMatchObject({ model: id, stream: true, store: false, reasoning: { effort: 'high' }, parallel_tool_calls: true,
    tools: [expect.objectContaining({ type: 'function', name: 'lookup' })],
    input: [expect.objectContaining({ role: 'user', content: expect.arrayContaining([{ type: 'input_image', detail: 'auto', image_url: `data:image/png;base64,${data.toString('base64')}` }]) })],
  })
  expect(wire).not.toHaveProperty('service_tier')
  expect(wire).not.toHaveProperty('max_output_tokens')
  expect(chunks.find(chunk => chunk.type === 'finish')).toMatchObject({ reason: { kind: 'stop' } })
})
