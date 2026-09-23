import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { zstdDecompressSync } from 'node:zlib'
import { Context } from '@deepseek-ai/cordis'
import LlmRuntime, { createUserMessage, ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import Sessions, { SessionId } from '@deepseek-ai/dsh-session'
import Projection from '@deepseek-ai/dsh-session-projection'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import Tools from '@deepseek-ai/dsh-tools'
import Agents from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import TokenMeter from '@deepseek-ai/dsh-token-meter'
import Compaction from '@deepseek-ai/dsh-compaction-basic'
import Persistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import { afterEach, expect, it, vi } from 'vitest'
import * as plugin from '../src/index.ts'
import { loadSettingsPlugin } from './support/settings-loader-fixture.ts'

const MODEL = 'gpt-5.6-luna'
const NS = plugin.OPENAI_CODEX_SETTINGS_NS
const PROVIDER = plugin.OPENAI_CODEX_PROVIDER
let root: string | undefined
let ctx: Context | undefined

type Wire = { model: string; input: { type?: string; encrypted_content?: string }[]; reasoning?: { effort?: string }; service_tier?: string }
function sse(item: Record<string, unknown>): Response {
  return new Response([
    { type: 'response.output_item.added', output_index: 0, item },
    { type: 'response.output_item.done', output_index: 0, item },
    { type: 'response.completed', response: { id: 'resp_settings_fixture', status: 'completed', model: MODEL, output: [item], usage: { input_tokens: 100, output_tokens: 1000, total_tokens: 1100 } } },
  ].map(event => `data: ${JSON.stringify(event)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } })
}

async function fixture(initial: Record<string, unknown> = {}, auto?: boolean) {
  root = await mkdtemp(join(tmpdir(), 'codex-native-setting-'))
  vi.stubEnv('DSH_HOME', join(root, 'synthetic-home'))
  let history = true
  let nativeCount = 0
  const wires: Wire[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string | URL, init: RequestInit) => {
    expect(String(url)).toBe('https://chatgpt.com/backend-api/codex/responses')
    const bytes = init.body as Uint8Array | string
    const raw = new Headers(init.headers).get('content-encoding') === 'zstd' ? zstdDecompressSync(bytes as Uint8Array).toString('utf8') : String(bytes)
    const body = JSON.parse(raw) as Wire
    expect(body.model).toBe(MODEL)
    // Auxiliary compaction uses the host summarization policy, not AgentOptions.
    // The conversation's unchanged effort is checked both here and after toggling.
    if (!body.input.some(item => item.type === 'compaction_trigger')) expect(body.reasoning?.effort).toBe('low')
    expect(body.service_tier).toBeUndefined()
    expect(wires.length).toBeLessThan(40)
    wires.push(body)
    if (body.input.some(item => item.type === 'compaction_trigger')) {
      nativeCount += 1
      return sse({ type: 'compaction', id: 'cmp_settings_fixture', encrypted_content: 'synthetic-settings-checkpoint' })
    }
    return sse({ type: 'message', id: 'msg_settings_fixture', role: 'assistant', phase: 'final_answer', status: 'completed', content: [{ type: 'output_text', text: history ? 'Synthetic historical reasoning and decisions. '.repeat(400) : 'Continue the synthetic task.', annotations: [] }] })
  }))
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const store = new plugin.OpenAICodexCredentialStore()
  await store.modify(PROVIDER, async () => ({ type: 'oauth', access: `${encode({ alg: 'none' })}.${encode({ 'https://api.openai.com/auth': { chatgpt_account_id: 'synthetic-settings' } })}.synthetic`, refresh: 'synthetic-only', accountId: 'synthetic-settings', expires: Date.now() + 3600000 }))
  const runtime = new Context()
  ctx = runtime
  await runtime.plugin(LlmRuntime)
  await runtime.plugin(Sessions)
  await runtime.plugin(Projection)
  await runtime.plugin(SystemPrompt)
  await runtime.plugin(Tools)
  await runtime.plugin(Agents)
  await runtime.plugin(AgentLoop, { agents: [] })
  await runtime.plugin(TokenMeter)
  await runtime.plugin(Persistence, { root: join(root, 'sessions'), compression: 'none' })
  await runtime.plugin(Compaction, {
    ...(auto === undefined ? {} : { auto }),
    thresholdRatio: 0.8,
    headroomTokens: 1_024,
    maxTokens: 1_024,
    retainTokens: 0,
    compactionRetries: 0,
    maxOverflowRetries: 0,
  })
  const { editor } = await loadSettingsPlugin(runtime, root, 'dsh-codex-connect', plugin, {
    models: [MODEL], contextWindowOverrides: { [MODEL]: 8192 }, ...initial,
  })
  const settings = runtime.settings
  const resolved = () => plugin.decodeOpenAICodexSettings(settings.describe().find(entry => entry.ns === NS)?.value)!
  const exercise = async (name: string) => {
    const { agent } = await runtime.agents.create({ sessionId: SessionId(name), agentOptions: { provider: PROVIDER, model: MODEL, reasoningEffort: ReasoningEffortId('low'), maxTokens: 1_024 } })
    const send = async (text: string) => {
      agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text }] }))
      await agent.whenIdle()
      await runtime.sessions.flush(agent.session)
      expect(agent.session.snapshotEvents().findLast(event => event.type === 'turn/end')?.data.reason.kind).toBe('completed')
    }
    history = true
    await send('Record the first set of synthetic decisions.')
    await send('Record the next synthetic decisions.')
    expect(runtime.tokenMeter.measure(agent.session).totalTokens).toBeGreaterThanOrEqual(8192 * 0.8)
    history = false
    // Only an ordinary followup: the real AgentLoop chooses whether to compact.
    await send('Continue the synthetic work.')
    return { agent, send }
  }
  return { runtime, settings, editor, resolved, exercise, wires, nativeCount: () => nativeCount,
    stored: () => settings.describe().find(entry => entry.ns === NS)?.value }
}

afterEach(async () => {
  await ctx?.fiber.dispose()
  ctx = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

it('requires a committed opt-in, uses automatic host triggers, and preserves replay after disabling', async () => {
  const f = await fixture()
  const before = f.resolved()
  expect(before.enableNativeCompaction).toBe(false)
  await f.exercise('default-off')
  expect(f.nativeCount()).toBe(0)
  f.editor.failNext = true
  await expect(f.settings.mutate(NS, [{ op: 'set', path: ['enableNativeCompaction'], value: true }])).rejects.toThrow('fixture persistence failure')
  expect(f.resolved()).toEqual(before)
  await f.exercise('failed-save-still-off')
  expect(f.nativeCount()).toBe(0)
  await f.settings.mutate(NS, [{ op: 'set', path: ['enableNativeCompaction'], value: true }])
  expect(f.resolved()).toEqual({ ...before, enableNativeCompaction: true })
  expect(f.stored()).toMatchObject({ enableNativeCompaction: true })
  const enabled = await f.exercise('saved-on')
  expect(f.nativeCount()).toBe(1)
  await f.settings.mutate(NS, [{ op: 'set', path: ['enableNativeCompaction'], value: false }])
  expect(f.resolved()).toEqual(before)
  await enabled.send('Continue after disabling new native compaction.')
  expect(f.wires.at(-1)!.input.filter(item => item.type === 'compaction')).toEqual([{ type: 'compaction', id: 'cmp_settings_fixture', encrypted_content: 'synthetic-settings-checkpoint' }])
  await f.exercise('saved-off')
  expect(f.nativeCount()).toBe(1)
  expect(f.stored()).toMatchObject({ enableNativeCompaction: false })
  expect(enabled.agent.options.model).toBe(MODEL)
  expect(enabled.agent.options.reasoningEffort).toBe('low')
})

it.each([false, true])('loads previously persisted native-context consent %s without a new prompt', async enabled => {
  const f = await fixture({ enableNativeCompaction: enabled })
  expect(f.resolved().enableNativeCompaction).toBe(enabled)
  await f.exercise('persisted-choice')
  expect(f.nativeCount()).toBe(enabled ? 1 : 0)
})

it('does not override an explicit host auto=false configuration', async () => {
  const f = await fixture({}, false)
  await f.settings.mutate(NS, [{ op: 'set', path: ['enableNativeCompaction'], value: true }])
  const result = await f.exercise('host-auto-disabled')
  expect(f.nativeCount()).toBe(0)
  expect(result.agent.session.surface.replaceGeneration).toBe(0)
})
