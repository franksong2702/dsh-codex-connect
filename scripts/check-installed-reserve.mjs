import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { zstdDecompressSync } from 'node:zlib'

/** Exercise the packed plugin's logged Reserve transitions with an exact installed host and synthetic HTTP. */
export async function checkInstalledReserve(importHost, CodexConnect) {
  const [
    { Context }, { default: Llm, createUserMessage, ReasoningEffortId },
    { default: Sessions, SessionId }, { default: Projections },
    { default: Prompt }, { default: Tools }, { default: Agents }, { default: Loop },
  ] = await Promise.all([
    '@deepseek-ai/cordis', '@deepseek-ai/dsh-llm', '@deepseek-ai/dsh-session',
    '@deepseek-ai/dsh-session-projection', '@deepseek-ai/dsh-system-prompt',
    '@deepseek-ai/dsh-tools', '@deepseek-ai/dsh-agent', '@deepseek-ai/dsh-agent-loop',
  ].map(importHost))
  const directory = await mkdtemp(join(tmpdir(), 'codex-installed-reserve-'))
  const previousHome = process.env.DSH_HOME
  const previousFetch = globalThis.fetch
  const ctx = new Context()
  process.env.DSH_HOME = directory
  let ordinary = false
  let usageReads = 0
  const wires = []
  try {
    const claims = { chatgpt_account_id: 'fixture-account', chatgpt_user_id: 'fixture-user' }
    const access = `e30.${Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': claims })).toString('base64url')}.fixture`
    const credentials = new CodexConnect.OpenAICodexCredentialStore()
    await credentials.modify('openai-codex', async () => ({
      type: 'oauth', accountId: 'fixture-account', access,
      refresh: 'fixture-refresh', expires: Date.now() + 3_600_000,
    }))
    globalThis.fetch = async (url, init) => {
      if (String(url) === 'https://chatgpt.com/backend-api/wham/usage') {
        assert.equal(new Headers(init.headers).get('x-openai-codex-luna-reserve'), '1')
        usageReads++
        return Response.json({
          account_id: 'fixture-account', user_id: 'fixture-user', plan_type: 'pro',
          rate_limit: { allowed: ordinary, limit_reached: !ordinary },
          rate_limit_upsell: ordinary ? null : {
            banner_type: 'luna_reserve', presentation: 'dismissible',
            title: 'Luna Reserve is available', description: 'Fixture authorization.', ctas: [],
          },
        })
      }
      assert.equal(String(url), 'https://chatgpt.com/backend-api/codex/responses')
      assert.equal(new Headers(init.headers).has('x-openai-codex-luna-reserve'), false)
      const body = new Headers(init.headers).get('content-encoding') === 'zstd'
        ? zstdDecompressSync(init.body).toString('utf8') : String(init.body)
      wires.push(JSON.parse(body))
      const item = { type: 'message', id: 'msg_fixture', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'OK', annotations: [] }] }
      const events = [
        { type: 'response.output_item.added', output_index: 0, item: { ...item, content: [] } },
        { type: 'response.output_text.delta', output_index: 0, content_index: 0, delta: 'OK' },
        { type: 'response.output_item.done', output_index: 0, item },
        { type: 'response.completed', response: { id: 'resp_fixture', status: 'completed', output: [item], usage: { input_tokens: 10, output_tokens: 2, total_tokens: 12 } } },
      ]
      return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } })
    }
    for (const plugin of [Llm, Sessions, Projections, Prompt, Tools, Agents]) await ctx.plugin(plugin)
    await ctx.plugin(Loop, { agents: [] })
    await ctx.plugin(CodexConnect, { enableReserveFallback: true })
    assert.equal((await ctx.llm.listModels('openai-codex')).some(model => model.id === 'gpt-reserve'), false)
    const selection = { provider: 'openai-codex', model: 'gpt-6-astra', reasoningEffort: ReasoningEffortId('max'), maxTokens: 2048 }
    const agent = await ctx.agentLoop.create(SessionId('installed-reserve-fixture'), selection)
    for (let step = 0; step < 3; step++) {
      ordinary = step === 2
      agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Fixture turn' }] }))
      await agent.whenIdle()
      assert.deepEqual(agent.session.requestHeader()?.config, ordinary ? selection : { provider: 'openai-codex', model: 'gpt-reserve' })
    }
    assert.equal(usageReads, 3)
    assert.deepEqual(wires.map(wire => wire.model), ['gpt-reserve', 'gpt-reserve', 'gpt-6-astra'])
    assert.equal(wires[0].reasoning, undefined)
    assert.equal(wires[2].reasoning.effort, 'max')
    const answers = agent.session.snapshotEvents().filter(event => event.type === 'assistant/message')
    assert.deepEqual(answers.map(event => event.data.message.source.model), ['gpt-reserve', 'gpt-reserve', 'gpt-6-astra'])
    return true
  } finally {
    try {
      await ctx.fiber.dispose()
    } finally {
      globalThis.fetch = previousFetch
      if (previousHome === undefined) delete process.env.DSH_HOME
      else process.env.DSH_HOME = previousHome
      await rm(directory, { recursive: true, force: true })
    }
  }
}
