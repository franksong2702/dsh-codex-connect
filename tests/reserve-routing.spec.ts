import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { zstdDecompressSync } from 'node:zlib'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import type { Agent } from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import LlmRuntime, { ReasoningEffortId, createUserMessage } from '@deepseek-ai/dsh-llm'
import type { LlmCallConfig, StreamChunk } from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SessionProjections from '@deepseek-ai/dsh-session-projection'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as CodexConnect from '../src/index.ts'
import { OPENAI_CODEX_RESERVE_MODEL } from '../src/reserve-usage.ts'
import { ReserveReturnStore } from '../src/reserve-state.ts'
import { ordinaryUsage, reserveToken, reserveUsage } from './reserve-fixture.ts'

let context: Context | undefined
let root: string | undefined
afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

function response(): Response {
  const item = { type: 'message', id: 'msg_fixture', role: 'assistant', phase: 'final_answer', status: 'completed', content: [{ type: 'output_text', text: 'OK', annotations: [] }] }
  const events = [
    { type: 'response.output_item.added', output_index: 0, item: { ...item, content: [] } },
    { type: 'response.output_text.delta', output_index: 0, content_index: 0, delta: 'OK' },
    { type: 'response.output_item.done', output_index: 0, item },
    { type: 'response.completed', response: { id: 'resp_fixture', status: 'completed', output: [item], usage: { input_tokens: 10, output_tokens: 2, total_tokens: 12 } } },
  ]
  return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } })
}

function wireBody(init: RequestInit): Record<string, unknown> {
  const body = new Headers(init.headers).get('content-encoding') === 'zstd'
    ? zstdDecompressSync(init.body as Uint8Array).toString('utf8') : String(init.body)
  return JSON.parse(body) as Record<string, unknown>
}

async function fixture(config: CodexConnect.Config = { enableReserveFallback: true }) {
  root = await mkdtemp(join(tmpdir(), 'codex-reserve-routing-'))
  vi.stubEnv('DSH_HOME', root)
  const credentials = new CodexConnect.OpenAICodexCredentialStore()
  const setAccount = async (account = 'fixture-account', user = 'fixture-user', extra: Record<string, unknown> = {}) => {
    await credentials.modify(CodexConnect.OPENAI_CODEX_PROVIDER, async () => ({
      type: 'oauth', accountId: account, access: reserveToken(account, user, extra), refresh: 'fixture-refresh', expires: Date.now() + 3_600_000,
    }))
  }
  await setAccount()
  const ctx = new Context()
  context = ctx
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(SessionStore)
  await ctx.plugin(SessionProjections)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(AgentLoop, { agents: [] })
  const plugin = await ctx.plugin(CodexConnect, config)
  const agent = ctx.agentLoop.create(SessionId('reserve-fixture'), {
    provider: 'openai-codex', model: 'gpt-6-astra', reasoningEffort: ReasoningEffortId('max'), maxTokens: 2048,
  })
  const proposal: LlmCallConfig = { provider: 'openai-codex', model: 'gpt-6-astra', reasoningEffort: ReasoningEffortId('max'), maxTokens: 2048 }
  const request = (value: LlmCallConfig = proposal, signal = new AbortController().signal, target: Agent = agent) =>
    ctx.waterfall('agent/request', { agent: target, turn: 1, step: 1, signal }, async () => value)
  return { ctx, agent, plugin, request, proposal, setAccount }
}

async function send(agent: Agent, text: string) {
  agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text }] }))
  await agent.whenIdle()
}

describe('assembled Reserve agent routing', () => {
  it('logs and streams Reserve with Luna defaults, then restores the exact ordinary selection on recovery', async () => {
    const { ctx, agent, proposal } = await fixture({ enableReserveFallback: true, contextWindowOverrides: { 'gpt-6-astra': 500_000 } })
    let usage = reserveUsage()
    const wires: Record<string, unknown>[] = []
    let usageReads = 0
    vi.stubGlobal('fetch', async (url: string | URL | Request, init: RequestInit) => {
      if (String(url).endsWith('/wham/usage')) {
        usageReads++
        expect(new Headers(init.headers).get('x-openai-codex-luna-reserve')).toBe('1')
        return Response.json(usage)
      }
      expect(String(url)).toBe('https://chatgpt.com/backend-api/codex/responses')
      expect(new Headers(init.headers).has('x-openai-codex-luna-reserve')).toBe(false)
      wires.push(wireBody(init))
      return response()
    })
    const models = await ctx.llm.listModels('openai-codex')
    expect(models.some(model => model.id === OPENAI_CODEX_RESERVE_MODEL)).toBe(false)
    await send(agent, 'first')
    expect(wires).toHaveLength(1)
    expect(wires[0]).toMatchObject({ model: 'gpt-reserve' })
    expect(wires[0]).not.toHaveProperty('reasoning')
    expect(wires[0]).not.toHaveProperty('service_tier')
    expect(agent.session.requestHeader()?.config).toEqual({ provider: 'openai-codex', model: 'gpt-reserve' })
    expect(agent.session.snapshotEvents().filter(event => event.type === 'request/context').at(-1)?.data)
      .toMatchObject({ model: 'gpt-reserve', contextWindow: 272_000 })
    const firstAssistant = agent.session.snapshotEvents().find(event => event.type === 'assistant/message')
    expect(firstAssistant?.type === 'assistant/message' && firstAssistant.data.message.source)
      .toMatchObject({ kind: 'model', model: 'gpt-reserve', replayState: { response: { model: 'gpt-reserve' } } })
    usage = ordinaryUsage()
    await send(agent, 'second')
    expect(wires).toHaveLength(2)
    expect(wires[1]).toMatchObject({ model: 'gpt-6-astra', reasoning: { effort: 'max' } })
    expect(agent.session.requestHeader()?.config).toEqual(proposal)
    expect(usageReads).toBe(2)
    const transcript = agent.session.snapshotEvents().flatMap(event => {
      if (event.type === 'request/header') return [{ event: 'request', ...event.data.header.config }]
      if (event.type === 'assistant/message') return [{ event: 'answer', model: event.data.message.source.kind === 'model' ? event.data.message.source.model : undefined }]
      return []
    })
    expect(transcript).toEqual([
      { event: 'request', provider: 'openai-codex', model: 'gpt-reserve' },
      { event: 'answer', model: 'gpt-reserve' },
      { event: 'request', ...proposal },
      { event: 'answer', model: 'gpt-6-astra' },
    ])
  })

  it('keeps the default-off path unchanged and never requests capability negotiation', async () => {
    const { agent } = await fixture({})
    const fetch = vi.fn(async (_url: unknown, init: RequestInit) => {
      expect(init.method).toBe('POST')
      expect(wireBody(init).model).toBe('gpt-6-astra')
      return response()
    })
    vi.stubGlobal('fetch', fetch)
    await send(agent, 'ordinary')
    expect(fetch).toHaveBeenCalledOnce()
    await expect(readdir(join(root!, 'codex-connect-reserve'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it.each([
    reserveUsage({ rate_limit_upsell: null }),
    reserveUsage({ account_id: 'other-account' }),
    reserveUsage({ user_id: 'other-user' }),
    reserveUsage({ rate_limit_upsell: { ...(reserveUsage().rate_limit_upsell as object), blocked_model_slug: 'gpt-5.5' } }),
  ])('does not change an ordinary route without applicable backend authority', async usage => {
    const { request, proposal } = await fixture()
    vi.stubGlobal('fetch', async () => Response.json(usage))
    expect(await request()).toEqual(proposal)
  })

  it('does not use incomplete identity or a FedRAMP token to negotiate Reserve', async () => {
    const { request, proposal, setAccount } = await fixture()
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    await setAccount('fixture-account', '')
    expect(await request()).toEqual(proposal)
    await setAccount('fixture-account', 'fixture-user', { chatgpt_account_is_fedramp: true })
    expect(await request()).toEqual(proposal)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('rejects unsupported model metadata and keeps failed usage checks from granting Reserve', async () => {
    const { request, proposal } = await fixture()
    vi.stubGlobal('fetch', async () => Response.json(reserveUsage({ additional_rate_limits: [{ limit_name: 'gpt-reserve', normal_model_slug: 'future-luna' }] })))
    await expect(request()).rejects.toThrow('unsupported Luna Reserve model metadata')
    vi.stubGlobal('fetch', async () => new Response('private details', { status: 429 }))
    expect(await request()).toEqual(proposal)
    await expect(request({ provider: 'openai-codex', model: 'gpt-reserve' })).rejects.toThrow('eligibility could not be verified')
  })

  it('rejects an account switch between authorization and stream without sending a model request', async () => {
    const { ctx, agent, setAccount } = await fixture()
    const fetch = vi.fn(async () => Response.json(reserveUsage()))
    vi.stubGlobal('fetch', fetch)
    ctx.on('llm/stream', async function* (_request, next) {
      await setAccount('second-account', 'second-user')
      yield* next()
    })
    await send(agent, 'account switch')
    expect(fetch).toHaveBeenCalledOnce()
    expect(agent.session.snapshotEvents().filter(event => event.type === 'assistant/message')).toHaveLength(0)
  })

  it('rejects direct and prepared auxiliary calls even with a fresh permit, while the real loop still works', async () => {
    const { ctx, agent, request } = await fixture()
    const fetch = vi.fn(async (url: unknown) => String(url).endsWith('/wham/usage') ? Response.json(reserveUsage()) : response())
    vi.stubGlobal('fetch', fetch)
    const stream = async () => {
      const chunks: StreamChunk[] = []
      for await (const chunk of ctx.llm.stream({ provider: 'openai-codex', model: 'gpt-reserve', sessionId: agent.session.id, messages: [] })) chunks.push(chunk)
      return chunks.find(chunk => chunk.type === 'finish')
    }
    await expect(stream()).rejects.toThrow('agent-loop requests')
    expect(fetch).not.toHaveBeenCalled()
    const authorized = await request()
    await expect(stream()).rejects.toThrow('agent-loop requests')
    const prepared = await ctx.llm.prepareCall(authorized)
    await expect(async () => {
      for await (const _chunk of prepared.stream({ ...prepared.config, sessionId: agent.session.id, messages: [], purpose: 'compaction' })) { /* drain */ }
    }).rejects.toThrow('agent-loop requests')
    expect(fetch).toHaveBeenCalledOnce()
    await send(agent, 'authorized loop')
    expect(agent.session.snapshotEvents().filter(event => event.type === 'assistant/message')).toHaveLength(1)
    await expect(stream()).rejects.toThrow('agent-loop requests')
    expect(fetch).toHaveBeenCalledTimes(3)
  })

  it('restores a saved target after plugin reload and never reuses it for a different account', async () => {
    const { ctx, plugin, request, proposal, setAccount } = await fixture()
    let usage = reserveUsage()
    vi.stubGlobal('fetch', async () => Response.json(usage))
    const reserved = await request()
    await plugin.dispose()
    await ctx.plugin(CodexConnect, { enableReserveFallback: true })
    usage = ordinaryUsage()
    expect(await request(reserved)).toEqual(proposal)
    await setAccount('second-account', 'second-user')
    usage = ordinaryUsage({ account_id: 'second-account', user_id: 'second-user' })
    await expect(request(reserved)).rejects.toThrow('no return target for this account')
  })

  it('waits for an in-flight return write before plugin disposal completes and never grants its cancelled route', async () => {
    const { plugin, request } = await fixture()
    vi.stubGlobal('fetch', async () => Response.json(reserveUsage()))
    const originalSave = ReserveReturnStore.prototype.save
    const entered = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    vi.spyOn(ReserveReturnStore.prototype, 'save').mockImplementation(async function (this: ReserveReturnStore, sessionId, target) {
      entered.resolve()
      await release.promise
      await originalSave.call(this, sessionId, target)
    })
    const pending = request()
    const rejection = expect(pending).rejects.toThrow()
    await entered.promise
    let disposed = false
    const disposal = plugin.dispose().then(() => { disposed = true })
    await Promise.resolve()
    expect(disposed).toBe(false)
    release.resolve()
    await disposal
    await rejection
    expect(disposed).toBe(true)
  })

  it('cancels an in-flight check on caller cancellation and plugin disposal', async () => {
    const { request, plugin } = await fixture()
    const fetch = vi.fn(async (_url: unknown, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init.signal!.addEventListener('abort', () => { reject(new Error('fixture aborted')) }, { once: true })
    }))
    vi.stubGlobal('fetch', fetch)
    const abort = new AbortController()
    const pending = request(undefined, abort.signal)
    const rejected = expect(pending).rejects.toThrow()
    await vi.waitFor(() => { expect(fetch).toHaveBeenCalledOnce() })
    abort.abort()
    await rejected
    const disposing = request()
    const disposed = expect(disposing).rejects.toThrow()
    await vi.waitFor(() => { expect(fetch).toHaveBeenCalledTimes(2) })
    await plugin.dispose()
    await disposed
  })
})
