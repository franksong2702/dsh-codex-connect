import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { zstdDecompressSync } from 'node:zlib'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import type { Agent } from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import LlmRuntime, { ReasoningEffortId, createUserMessage } from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SessionProjections from '@deepseek-ai/dsh-session-projection'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { afterEach, expect, it, vi } from 'vitest'
import * as CodexConnect from '../src/index.ts'
import { reserveToken } from './reserve-fixture.ts'
let ctx: Context | undefined
let home: string | undefined
afterEach(async () => {
  await ctx?.fiber.dispose(); ctx = undefined
  vi.unstubAllGlobals(); vi.unstubAllEnvs()
  if (home !== undefined) await rm(home, { recursive: true, force: true })
  home = undefined
})
async function fixture(config: CodexConnect.Config) {
  home = await mkdtemp(join(tmpdir(), 'codex-startup-speed-'))
  vi.stubEnv('DSH_HOME', home)
  const credentials = new CodexConnect.OpenAICodexCredentialStore()
  await credentials.modify(CodexConnect.OPENAI_CODEX_PROVIDER, async () => ({ type: 'oauth', accountId: 'startup-fixture',
    access: reserveToken('startup-fixture'), refresh: 'synthetic-only', expires: Date.now() + 3600000 }))
  const wires: Record<string, unknown>[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string | URL, init: RequestInit) => {
    expect(String(url)).toBe('https://chatgpt.com/backend-api/codex/responses')
    const raw = new Headers(init.headers).get('content-encoding') === 'zstd'
      ? zstdDecompressSync(init.body as Uint8Array).toString('utf8') : String(init.body)
    const payload = JSON.parse(raw)
    wires.push(payload)
    const item = { type: 'message', id: 'msg_startup', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'OK', annotations: [] }] }
    return new Response([
      { type: 'response.output_item.added', output_index: 0, item: { ...item, content: [] } },
      { type: 'response.output_text.delta', output_index: 0, content_index: 0, delta: 'OK' },
      { type: 'response.output_item.done', output_index: 0, item },
      { type: 'response.completed', response: { id: 'resp_startup', status: 'completed', model: payload.model, output: [item], usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } } },
    ].map(event => `data: ${JSON.stringify(event)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } })
  }))
  ctx = new Context()
  for (const plugin of [LlmRuntime, SessionStore, SessionProjections, SystemPrompt, ToolRuntime, AgentRegistry]) await ctx.plugin(plugin)
  await ctx.plugin(AgentLoop, { agents: [] })
  await ctx.plugin(CodexConnect, config)
  const create = async (id: string, model = 'gpt-6.1-sol', parentAgent?: Agent) => {
    const handle = await ctx!.agents.create({ sessionId: SessionId(id),
      agentOptions: { provider: 'openai-codex', model, reasoningEffort: ReasoningEffortId('max'), maxTokens: 1024 },
      ...(parentAgent === undefined ? {} : { parentAgent, meta: { origin: 'subagent' as const } }),
    })
    expect(handle.agent.session.requestHeader()).toBeUndefined()
    return handle.agent
  }
  const send = async (agent: Agent) => {
    agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'synthetic startup fixture' }] }))
    await agent.whenIdle()
  }
  return { wires, create, send }
}
it.each(['gpt-6-astra', 'gpt-6.1-sol'])('seeds %s through actual Host creation, request routing and real pi-ai SSE', async model => {
  const f = await fixture({ newSessionSpeedMode: 'ultrafast' })
  const agent = await f.create('top', model)
  await f.send(agent)
  expect(f.wires).toHaveLength(1)
  expect(f.wires[0]).toMatchObject({ model, service_tier: 'ultrafast', reasoning: { effort: 'max' }, stream: true })
})
it.each([
  ['ultrafast', 'standard', 'ultrafast', undefined],
  ['standard', 'ultrafast', undefined, 'ultrafast'],
] as const)('keeps independent parent %s / child %s defaults through the actual factory', async (topMode, childMode, topTier, childTier) => {
  const f = await fixture({ newSessionSpeedMode: topMode, newSubagentSpeedMode: childMode, enableNewSubagentFastMode: true })
  const top = await f.create('top')
  const child = await f.create('child', 'gpt-6.1-sol', top)
  await f.send(top); await f.send(child)
  expect(f.wires).toHaveLength(2)
  expect(f.wires[0]?.service_tier).toBe(topTier)
  expect(f.wires[1]?.service_tier).toBe(childTier)
  expect(child.session.header.origin).toBe('subagent')
})
it.each([
  [{}, undefined],
  [{ enableNewSessionFastMode: true }, 'priority'],
  [{ enableNewSessionFastMode: true, newSessionSpeedMode: 'standard' }, undefined],
  [{ enableNewSessionFastMode: true, newSessionSpeedMode: null }, 'priority'],
] as const)('preserves omitted/reset legacy policy and explicit Standard: %j', async (config, tier) => {
  const f = await fixture(config)
  await f.send(await f.create('top'))
  expect(f.wires).toHaveLength(1)
  expect(f.wires[0]?.service_tier).toBe(tier)
})
it('keeps unsupported initial models on Standard rather than trying the paid route', async () => {
  const f = await fixture({ newSessionSpeedMode: 'ultrafast' })
  await f.send(await f.create('top', 'gpt-5.6-sol'))
  expect(f.wires).toHaveLength(1)
  expect(f.wires[0]).not.toHaveProperty('service_tier')
})
