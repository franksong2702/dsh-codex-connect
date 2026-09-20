import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { zstdDecompressSync } from 'node:zlib'
import { Context } from '@deepseek-ai/cordis'
import { AgentRegistry, installModelSelection } from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import LlmRuntime, { createUserMessage, ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import { SessionId, SessionStore } from '@deepseek-ai/dsh-session'
import SessionProjections from '@deepseek-ai/dsh-session-projection'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import UserQuestions from '@deepseek-ai/dsh-user-questions'
import SettingsProvider from '@deepseek-ai/dsh-settings'
import type { SettingsNamespace } from '@deepseek-ai/dsh-settings'
import { afterEach, expect, it, vi } from 'vitest'
import * as Product from '../src/index.ts'
import { ASTRA_REASONING_TOOL_NAME } from '../src/reasoning-update-host.ts'
import { readReasoningUpdate } from '../src/reasoning-update.ts'
import { OpenAICodexCredentialStore, OPENAI_CODEX_PROVIDER } from '../src/store.ts'
import { decodeOpenAICodexSettings, resolveOpenAICodexSettings } from '../src/settings-contract.ts'

class MemorySettings extends SettingsProvider {
  readonly writable = true
  failSave = false
  private storedDocument: Record<string, unknown> = {}
  protected load() { return Promise.resolve(structuredClone(this.storedDocument)) }
  protected persist(ns: SettingsNamespace, section: Record<string, unknown>): Promise<void> {
    if (this.failSave) return Promise.reject(new Error('Synthetic settings disk failure'))
    this.storedDocument[ns] = structuredClone(section)
    return Promise.resolve()
  }
}
let context: Context | undefined
let root: string | undefined
const wires: Record<string, unknown>[] = []
afterEach(async () => {
  await context?.fiber.dispose(); context = undefined
  vi.unstubAllGlobals(); vi.unstubAllEnvs(); wires.length = 0
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

async function setup() {
  root = await mkdtemp(join(tmpdir(), 'think-product-settings-'))
  vi.stubEnv('DSH_HOME', root)
  vi.stubGlobal('fetch', vi.fn(async (_url: unknown, init: RequestInit) => {
    const body = new Headers(init.headers).get('content-encoding') === 'zstd'
      ? zstdDecompressSync(init.body as Uint8Array).toString('utf8') : String(init.body)
    wires.push(JSON.parse(body) as Record<string, unknown>)
    const item = { type: 'message', id: `msg_${wires.length}`, role: 'assistant', phase: 'final_answer', status: 'completed',
      content: [{ type: 'output_text', text: 'Synthetic settings completion.', annotations: [] }] }
    const events = [{ type: 'response.output_item.added', output_index: 0, item },
      { type: 'response.output_item.done', output_index: 0, item },
      { type: 'response.completed', response: { id: `r_${wires.length}`, status: 'completed', output: [item],
        usage: { input_tokens: 20, output_tokens: 5, total_tokens: 25 } } }]
    return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } })
  }))
  const credentials = new OpenAICodexCredentialStore()
  const claim = Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: 'synthetic-think-product' } })).toString('base64url')
  await credentials.modify(OPENAI_CODEX_PROVIDER, async () => ({ type: 'oauth', access: `e30.${claim}.fixture`, refresh: 'fixture', accountId: 'synthetic-think-product', expires: Date.now() + 3_600_000 }))
  const ctx = new Context(); context = ctx
  await ctx.plugin(LlmRuntime); await ctx.plugin(SessionStore); await ctx.plugin(SessionProjections)
  await ctx.plugin(AgentRegistry); await ctx.plugin(SystemPrompt); await ctx.plugin(ToolRuntime, { mode: 'native' })
  await ctx.plugin(UserQuestions); await ctx.plugin(MemorySettings)
  const saveDefault = vi.fn(); ctx.provide('agentDefaultModel', { saveSelection: saveDefault })
  let plugin = await ctx.plugin(Product, {})
  await ctx.plugin(AgentLoop, { agents: [] })
  const { agent } = await ctx.agents.create({ sessionId: SessionId('think-product'), meta: { cwd: root },
    agentOptions: { provider: OPENAI_CODEX_PROVIDER, model: 'gpt-6-astra', reasoningEffort: ReasoningEffortId('low') } })
  ctx.effect(() => installModelSelection(agent.ctx, { get current() { return agent.session.requestHeader()?.config ?? agent.options as { provider: string; model: string } }, assembled: undefined }))
  const send = async () => { agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Continue the synthetic test.' }] })); await agent.whenIdle() }
  const toggle = async (value: boolean) => {
    await ctx.settings.update(Product.OPENAI_CODEX_SETTINGS_NS, { enableReasoningUpdates: value })
    await vi.waitFor(() => expect(ctx.tools.get(ASTRA_REASONING_TOOL_NAME) !== undefined).toBe(value))
  }
  const execute = () => ctx.tools.execute({ name: ASTRA_REASONING_TOOL_NAME, callId: 'settings-change' as never,
    arguments: { effort: 'high', reason: 'Synthetic bounded proof.' }, agent, signal: new AbortController().signal })
  const saved = () => ctx.settings.describe().find(row => row.ns === Product.OPENAI_CODEX_SETTINGS_NS)!.value as Record<string, unknown>
  const reload = async () => { await plugin.dispose(); plugin = await ctx.plugin(Product, {}) }
  return { ctx, agent, send, toggle, execute, saved, reload, saveDefault, settings: ctx.settings as MemorySettings }
}
const approve = () => ({ answers: [{ id: 'astra-reasoning-effort', selected: ['Change to high'] }] })

it('defaults old settings to off and rejects malformed reasoning configuration', () => {
  expect(resolveOpenAICodexSettings({}).enableReasoningUpdates).toBe(false)
  const { enableReasoningUpdates: _unused, ...legacy } = Product.DEFAULT_OPENAI_CODEX_SETTINGS
  expect(decodeOpenAICodexSettings(legacy)?.enableReasoningUpdates).toBe(false)
  for (const value of [null, 'true', 1]) {
    expect(decodeOpenAICodexSettings({ ...legacy, enableReasoningUpdates: value })).toBeUndefined()
    expect(() => resolveOpenAICodexSettings({ enableReasoningUpdates: value as never })).toThrow()
  }
})

it('activates only on a successful saved opt-in and retains it across plugin reload', async () => {
  const f = await setup()
  expect(f.ctx.tools.get(ASTRA_REASONING_TOOL_NAME)).toBeUndefined()
  const before = structuredClone(f.saved())
  f.settings.failSave = true
  await expect(f.toggle(true)).rejects.toThrow(/failure/)
  expect(f.saved()).toEqual(before); expect(f.ctx.tools.get(ASTRA_REASONING_TOOL_NAME)).toBeUndefined()
  f.settings.failSave = false
  await f.toggle(true)
  expect(f.saved()).toEqual({ ...before, enableReasoningUpdates: true })
  expect(wires).toHaveLength(0)
  f.settings.failSave = true
  await expect(f.toggle(false)).rejects.toThrow(/failure/)
  expect(f.saved()).toEqual({ ...before, enableReasoningUpdates: true })
  expect(f.ctx.tools.get(ASTRA_REASONING_TOOL_NAME)).toBeDefined()
  f.settings.failSave = false
  await f.reload()
  await vi.waitFor(() => expect(f.ctx.tools.get(ASTRA_REASONING_TOOL_NAME)).toBeDefined())
  await f.toggle(false); await f.reload()
  expect(f.ctx.tools.get(ASTRA_REASONING_TOOL_NAME)).toBeUndefined()
  expect(f.saved()).toEqual(before)
  expect(f.saveDefault).not.toHaveBeenCalled()
})

it('saving disable aborts a real native question without admitting the late answer', async () => {
  const f = await setup(); await f.toggle(true); await f.send()
  let signal: AbortSignal | undefined
  let answer: ((value: ReturnType<typeof approve>) => void) | undefined
  f.ctx.on('user-questions/request', request => new Promise((resolve, reject) => {
    signal = request.signal
    request.signal?.addEventListener('abort', () => reject(request.signal?.reason), { once: true })
    answer = resolve
  }))
  const operation = f.execute().then(value => value, error => error)
  await vi.waitFor(() => expect(answer).toBeDefined())
  // A failed persistence attempt must not cancel consent for the still-enabled setting.
  f.settings.failSave = true
  await expect(f.toggle(false)).rejects.toThrow(/failure/)
  expect(f.saved().enableReasoningUpdates).toBe(true)
  expect(signal?.aborted).toBe(false)
  expect(f.ctx.tools.get(ASTRA_REASONING_TOOL_NAME)).toBeDefined()
  expect(wires).toHaveLength(1)
  f.settings.failSave = false
  await f.toggle(false)
  expect(signal?.aborted).toBe(true)
  answer!(approve()); await operation; await f.send()
  expect(f.agent.session.requestHeader()?.config.reasoningEffort).toBe('low')
  expect(f.agent.session.deriveMessages().some(message => readReasoningUpdate(message))).toBe(false)
  expect(f.saveDefault).not.toHaveBeenCalled()
})

it('discarding a pending adjustment on disable does not reset an already admitted adjustment', async () => {
  const f = await setup(); await f.toggle(true); await f.send()
  f.ctx.on('user-questions/request', async () => approve())
  await f.execute(); await f.toggle(false); await f.send()
  expect(f.agent.session.requestHeader()?.config.reasoningEffort).toBe('low')
  await f.toggle(true); await f.execute(); await f.send()
  expect(f.agent.session.requestHeader()?.config.reasoningEffort).toBe('high')
  await f.toggle(false); await f.reload(); await f.send()
  expect(f.agent.session.requestHeader()?.config.reasoningEffort).toBe('high')
  expect((wires.at(-1)!.input as { type?: string }[]).filter(item => item.type === 'configuration_update')).toHaveLength(1)
  expect(f.saveDefault).not.toHaveBeenCalled()
})
