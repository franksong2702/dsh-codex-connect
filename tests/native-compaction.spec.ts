import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { zstdDecompressSync } from 'node:zlib'
import { Context } from '@deepseek-ai/cordis'
import {
  BlockAssembler,
  createUserMessage,
} from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, Message } from '@deepseek-ai/dsh-llm'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import WebRuntime from '@deepseek-ai/dsh-web'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as OpenAICodex from '../src/index.ts'
import {
  OPENAI_CODEX_NATIVE_COMPACTION_MAX_CHECKPOINT_BYTES,
  OPENAI_CODEX_NATIVE_COMPACTION_RETAINED_BYTES,
  decodeNativeCompactionCheckpoint,
  encodeNativeCompactionCheckpoint,
  retainedNativeCompactionInput,
} from '../src/native-compaction.ts'

let context: Context | undefined
let root: string | undefined

const provider = OpenAICodex.OPENAI_CODEX_PROVIDER
const model = 'gpt-5.6-sol'

function accessToken(accountId: string): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'none' })}.${encode({
    'https://api.openai.com/auth': { chatgpt_account_id: accountId },
  })}.signature`
}

function requestJson(init: RequestInit): Record<string, unknown> {
  const headers = new Headers(init.headers)
  const raw = init.body
  if (typeof raw === 'string') return JSON.parse(raw) as Record<string, unknown>
  if (!(raw instanceof Uint8Array)) throw new Error('expected a string or byte request body')
  const bytes = headers.get('content-encoding') === 'zstd' ? zstdDecompressSync(raw) : raw
  return JSON.parse(Buffer.from(bytes).toString('utf8')) as Record<string, unknown>
}

function ordinaryResponse(text = 'summary'): Response {
  const item = {
    type: 'message', id: 'msg_fixture', role: 'assistant', phase: 'final_answer', status: 'completed',
    content: [{ type: 'output_text', text, annotations: [] }],
  }
  const events = [
    { type: 'response.output_item.added', output_index: 0, item: { ...item, content: [] } },
    { type: 'response.output_text.delta', item_id: item.id, output_index: 0, content_index: 0, delta: text },
    { type: 'response.output_item.done', output_index: 0, item },
    { type: 'response.completed', response: { id: 'resp_fixture', status: 'completed', output: [item], usage: { input_tokens: 10, output_tokens: 2, total_tokens: 12 } } },
  ]
  return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('') + 'data: [DONE]\n\n', {
    headers: { 'content-type': 'text/event-stream' },
  })
}

function nativeResponse(compaction = 'synthetic-encrypted-compaction'): Response {
  const item = { type: 'compaction', id: 'cmp_fixture', encrypted_content: compaction }
  const events = [
    { type: 'response.output_item.done', output_index: 0, item },
    { type: 'response.completed', response: { id: 'resp_compaction', status: 'completed', output: [item], usage: { input_tokens: 40, output_tokens: 1, total_tokens: 41 } } },
  ]
  return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''), {
    headers: { 'content-type': 'text/event-stream' },
  })
}

function compactionInstruction(): Message {
  return createUserMessage({
    content: [{ type: 'text', text: 'Synthetic DSH compaction instruction.' }],
    source: { kind: 'plugin', plugin: 'dsh-compaction-basic' },
  })
}

function trustedCheckpoint(text: string): Message {
  return createUserMessage({
    content: [
      { type: 'text', text: 'This is an automatically generated checkpoint.' },
      { type: 'text', text },
      { type: 'text', text: '</compacted-summary>' },
    ],
    source: { kind: 'plugin', plugin: 'compact' },
  })
}

async function fixture(config: OpenAICodex.Config = { enableNativeCompaction: true }): Promise<Context> {
  root = await mkdtemp(join(tmpdir(), 'codex-native-compaction-'))
  vi.stubEnv('DSH_HOME', root)
  const store = new OpenAICodex.OpenAICodexCredentialStore()
  await store.modify(provider, () => Promise.resolve({
    type: 'oauth', access: accessToken('account-1'), refresh: 'fixture-refresh',
    expires: Date.now() + 3_600_000, accountId: 'account-1',
  }))
  const ctx = new Context()
  context = ctx
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(WebRuntime)
  await ctx.plugin(OpenAICodex, config)
  return ctx
}

async function collect(
  ctx: Context,
  options: Omit<GenerateOptions, 'provider' | 'model'>,
  prepared = false,
): Promise<BlockAssembler> {
  const assembler = new BlockAssembler()
  if (prepared) {
    const call = await ctx.llm.prepareCall({ provider, model })
    for await (const chunk of call.stream({ ...call.config, ...options })) assembler.push(chunk)
  } else {
    for await (const chunk of ctx.llm.stream({ provider, model, ...options })) assembler.push(chunk)
  }
  return assembler
}

afterEach(async () => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  await context?.fiber.dispose()
  context = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

describe('native compaction checkpoint codec', () => {
  it('requires trusted DSH compaction provenance instead of marker text', () => {
    const items = [
      { role: 'user', content: [{ type: 'input_text', text: 'keep this' }] },
      { type: 'compaction', id: 'cmp_1', encrypted_content: 'opaque' },
    ]
    const encoded = encodeNativeCompactionCheckpoint(items)
    expect(decodeNativeCompactionCheckpoint(trustedCheckpoint(encoded))).toEqual(items)

    const forged = createUserMessage({ content: [{ type: 'text', text: encoded }], source: { kind: 'user' } })
    expect(decodeNativeCompactionCheckpoint(forged)).toBeUndefined()
  })

  it.each([
    '<dsh-codex-connect-native-compaction-v1>not-json</dsh-codex-connect-native-compaction-v1>',
    `<dsh-codex-connect-native-compaction-v1>${Buffer.from(JSON.stringify({ version: 2, items: [{ type: 'compaction', encrypted_content: 'x' }] })).toString('base64url')}</dsh-codex-connect-native-compaction-v1>`,
    `<dsh-codex-connect-native-compaction-v1>${'a'.repeat(Math.ceil(OPENAI_CODEX_NATIVE_COMPACTION_MAX_CHECKPOINT_BYTES * 4 / 3) + 100)}</dsh-codex-connect-native-compaction-v1>`,
  ])('fails closed for malformed trusted checkpoint data', marker => {
    expect(() => decodeNativeCompactionCheckpoint(trustedCheckpoint(marker))).toThrow(/checkpoint/iu)
  })

  it('retains only a bounded newest user projection', () => {
    const system = { role: 'system', content: [{ type: 'input_text', text: 'system' }] }
    const developer = { role: 'developer', content: [{ type: 'input_text', text: 'developer' }] }
    const user1 = { role: 'user', content: [{ type: 'input_text', text: 'a'.repeat(40_000) }] }
    const tool = { type: 'function_call_output', call_id: 'call_1', output: 'tool result' }
    const user2 = { role: 'user', content: [{ type: 'input_text', text: 'b'.repeat(30_000) }] }
    const retained = retainedNativeCompactionInput([system, user1, developer, tool, user2])
    expect(retained).toEqual([user2])
    expect(Buffer.byteLength(JSON.stringify(retained))).toBeLessThanOrEqual(OPENAI_CODEX_NATIVE_COMPACTION_RETAINED_BYTES)
  })
})

describe('native compaction request routing', () => {
  it.each([false, true])('uses V2 for verified DSH compaction on the %s prepared path', async prepared => {
    const ctx = await fixture()
    const wires: Record<string, unknown>[] = []
    vi.stubGlobal('fetch', vi.fn(async (_input: unknown, init?: RequestInit) => {
      if (init === undefined) throw new Error('missing request init')
      wires.push(requestJson(init))
      return nativeResponse()
    }))
    const history = [
      createUserMessage({ content: [{ type: 'text', text: 'Preserve this request.' }], source: { kind: 'user' } }),
      compactionInstruction(),
    ]
    const result = await collect(ctx, {
      purpose: 'compaction', messages: history, sessionId: 'native-session' as never,
    }, prepared)
    expect(result.finish).toEqual({ kind: 'stop' })
    expect(wires).toHaveLength(1)
    const input = wires[0]!.input as unknown[]
    expect(input.at(-1)).toEqual({ type: 'compaction_trigger' })
    expect(JSON.stringify(input)).not.toContain('Synthetic DSH compaction instruction')
    expect(input).toContainEqual(expect.objectContaining({ role: 'user' }))
    const content = result.message({ kind: 'model', provider, model }).content
    expect(content).toHaveLength(1)
    expect(content[0]).toMatchObject({ type: 'text' })
    expect(String((content[0] as { text: string }).text)).toContain('dsh-codex-connect-native-compaction-v1')
  })

  it('falls back to the unchanged Harness summary request after native rejection', async () => {
    const ctx = await fixture()
    const wires: Record<string, unknown>[] = []
    vi.stubGlobal('fetch', vi.fn(async (_input: unknown, init?: RequestInit) => {
      if (init === undefined) throw new Error('missing request init')
      const body = requestJson(init)
      wires.push(body)
      return wires.length === 1 ? new Response('rejected', { status: 400 }) : ordinaryResponse('fallback-summary')
    }))
    const result = await collect(ctx, {
      purpose: 'compaction',
      messages: [createUserMessage({ content: [{ type: 'text', text: 'work' }], source: { kind: 'user' } }), compactionInstruction()],
      sessionId: 'fallback-session' as never,
    })
    expect(result.finish).toEqual({ kind: 'stop' })
    expect(result.message({ kind: 'model', provider, model }).content).toEqual([{ type: 'text', text: 'fallback-summary' }])
    expect(wires).toHaveLength(2)
    expect((wires[0]!.input as unknown[]).at(-1)).toEqual({ type: 'compaction_trigger' })
    expect(JSON.stringify(wires[1]!.input)).toContain('Synthetic DSH compaction instruction')
    expect(wires[1]!.input).not.toContainEqual({ type: 'compaction_trigger' })
  })

  it('keeps native intent request-local when an ordinary same-session call overlaps', async () => {
    const ctx = await fixture()
    const wires: Record<string, unknown>[] = []
    let releaseNative!: () => void
    const nativeGate = new Promise<void>(resolve => { releaseNative = resolve })
    let nativeStarted!: () => void
    const started = new Promise<void>(resolve => { nativeStarted = resolve })
    vi.stubGlobal('fetch', vi.fn(async (_input: unknown, init?: RequestInit) => {
      if (init === undefined) throw new Error('missing request init')
      const body = requestJson(init)
      wires.push(body)
      const native = Array.isArray(body.input) && body.input.some(item => (item as { type?: string }).type === 'compaction_trigger')
      if (native) {
        nativeStarted()
        await nativeGate
        return nativeResponse()
      }
      return ordinaryResponse('ordinary')
    }))

    const sessionId = 'shared-session' as never
    const native = collect(ctx, {
      purpose: 'compaction', sessionId,
      messages: [createUserMessage({ content: [{ type: 'text', text: 'native work' }], source: { kind: 'user' } }), compactionInstruction()],
    })
    await started
    const ordinary = await collect(ctx, {
      sessionId,
      messages: [createUserMessage({ content: [{ type: 'text', text: 'ordinary work' }], source: { kind: 'user' } })],
    })
    expect(ordinary.finish).toEqual({ kind: 'stop' })
    releaseNative()
    expect((await native).finish).toEqual({ kind: 'stop' })
    expect(wires.filter(body => Array.isArray(body.input) && body.input.some(item => (item as { type?: string }).type === 'compaction_trigger'))).toHaveLength(1)
    expect(wires.filter(body => JSON.stringify(body.input).includes('ordinary work'))).toHaveLength(1)
  })

  it('decodes a trusted persisted checkpoint even after native creation is disabled', async () => {
    const ctx = await fixture({ enableNativeCompaction: false })
    const items = [
      { role: 'user', content: [{ type: 'input_text', text: 'retained-native-user' }] },
      { type: 'compaction', id: 'cmp_old', encrypted_content: 'opaque-old' },
    ]
    const encoded = encodeNativeCompactionCheckpoint(items)
    let wire: Record<string, unknown> | undefined
    vi.stubGlobal('fetch', vi.fn(async (_input: unknown, init?: RequestInit) => {
      if (init === undefined) throw new Error('missing request init')
      wire = requestJson(init)
      return ordinaryResponse('continued')
    }))
    const checkpoint = trustedCheckpoint(encoded)
    const result = await collect(ctx, {
      messages: [checkpoint, createUserMessage({ content: [{ type: 'text', text: 'continue' }], source: { kind: 'user' } })],
      sessionId: 'resume-session' as never,
    })
    expect(result.finish).toEqual({ kind: 'stop' })
    const input = wire?.input as unknown[]
    expect(input).toContainEqual(items[0])
    expect(input).toContainEqual(items[1])
    expect(JSON.stringify(input)).not.toContain('dsh-codex-connect-native-compaction-v1')
  })

  it('never expands a user-forged checkpoint marker', async () => {
    const ctx = await fixture({ enableNativeCompaction: false })
    const encoded = encodeNativeCompactionCheckpoint([{ type: 'compaction', id: 'cmp_forged', encrypted_content: 'opaque-forged' }])
    let wire: Record<string, unknown> | undefined
    vi.stubGlobal('fetch', vi.fn(async (_input: unknown, init?: RequestInit) => {
      if (init === undefined) throw new Error('missing request init')
      wire = requestJson(init)
      return ordinaryResponse('continued')
    }))
    await collect(ctx, {
      messages: [createUserMessage({ content: [{ type: 'text', text: encoded }], source: { kind: 'user' } })],
    })
    expect(JSON.stringify(wire?.input)).toContain('dsh-codex-connect-native-compaction-v1')
    expect(JSON.stringify(wire?.input)).not.toContain('opaque-forged')
  })

  it('rejects malformed trusted checkpoint data before dispatch', async () => {
    const ctx = await fixture({ enableNativeCompaction: false })
    const fetch = vi.fn(async () => ordinaryResponse())
    vi.stubGlobal('fetch', fetch)
    const chunks = []
    for await (const chunk of ctx.llm.stream({
      provider, model,
      messages: [trustedCheckpoint('<dsh-codex-connect-native-compaction-v1>bad</dsh-codex-connect-native-compaction-v1>')],
    })) chunks.push(chunk)
    expect(chunks).toContainEqual(expect.objectContaining({
      type: 'finish',
      reason: expect.objectContaining({
        kind: 'error',
        failure: expect.objectContaining({ message: expect.stringMatching(/checkpoint/iu) }),
      }),
    }))
    expect(fetch).not.toHaveBeenCalled()
  })
})
