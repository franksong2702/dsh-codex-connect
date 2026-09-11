import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { zstdDecompressSync } from 'node:zlib'

/** Exercise the packed plugin's logged Reserve transitions with an exact installed host and synthetic HTTP. */
export async function checkInstalledReserve(importHost, CodexConnect) {
  const [
    { Context }, { default: Llm, createUserMessage, ReasoningEffortId, QUOTA_EXCEEDED_CODE },
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
  const previousNow = Date.now
  let now = Date.now()
  Date.now = () => now
  const ctx = new Context()
  process.env.DSH_HOME = directory
  let ordinary = false
  let accountId = 'fixture-account'
  let userId = 'fixture-user'
  let exhausted = false
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
          account_id: accountId, user_id: userId, plan_type: 'pro',
          rate_limit: { allowed: ordinary, limit_reached: !ordinary },
          ...(exhausted ? { additional_rate_limits: [{ metered_feature: 'base_model_inference', limit_name: 'gpt-reserve', rate_limit: { allowed: false, limit_reached: true } }] } : {}),
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
    let plugin = await ctx.plugin(CodexConnect, { enableReserveFallback: true })
    assert.equal((await ctx.llm.listModels('openai-codex')).some(model => model.id === 'gpt-reserve'), false)
    const selection = { provider: 'openai-codex', model: 'gpt-6-astra', reasoningEffort: ReasoningEffortId('max'), maxTokens: 2048 }
    const agent = await ctx.agentLoop.create(SessionId('installed-reserve-fixture'), selection)
    for (let step = 0; step < 3; step++) {
      ordinary = step === 2
      if (ordinary) now += 61_000
      agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Fixture turn' }] }))
      await agent.whenIdle()
      assert.deepEqual(agent.session.requestHeader()?.config, ordinary ? selection : { provider: 'openai-codex', model: 'gpt-reserve' })
      if (!ordinary) assert.equal(agent.session.snapshotEvents().filter(event => event.type === 'request/context').at(-1)?.data.contextWindow, 272_000)
    }
    assert.equal(usageReads, 2)
    assert.deepEqual(wires.map(wire => wire.model), ['gpt-reserve', 'gpt-reserve', 'gpt-6-astra'])
    assert.equal(wires[0].reasoning, undefined)
    assert.equal(wires[2].reasoning.effort, 'max')
    const answers = agent.session.snapshotEvents().filter(event => event.type === 'assistant/message')
    assert.deepEqual(answers.map(event => event.data.message.source.model), ['gpt-reserve', 'gpt-reserve', 'gpt-6-astra'])
    const recovering = await ctx.agentLoop.create(SessionId('installed-reserve-retry-fixture'), selection)
    ordinary = false
    let attempts = 0
    let injectQuotaFailure = true
    ctx.on('llm/stream', async function* (request, next) {
      if (injectQuotaFailure && request.sessionId === recovering.session.id) {
        attempts++
        if (request.model === 'gpt-6-astra') {
          yield { type: 'finish', reason: { kind: 'error', failure: { code: QUOTA_EXCEEDED_CODE, message: 'Fixture quota exhausted' } } }
          return
        }
      }
      yield* next()
    }, { prepend: true })
    recovering.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Fixture quota recovery' }] }))
    await recovering.whenIdle()
    assert.equal(attempts, 2)
    assert.equal(usageReads, 3)
    assert.equal(wires.at(-1).model, 'gpt-reserve')
    assert.equal(recovering.session.snapshotEvents().filter(event => event.type === 'assistant/message').length, 1)
    injectQuotaFailure = false
    const send = async target => {
      target.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Fixture lifecycle check' }] }))
      await target.whenIdle()
    }
    const count = wires.length
    await assert.rejects(async () => {
      for await (const _chunk of ctx.llm.stream({ provider: 'openai-codex', model: 'gpt-reserve', sessionId: recovering.session.id, messages: [], purpose: 'compaction' })) { /* drain */ }
    }, /agent-loop requests/)
    assert.equal(wires.length, count)

    // Reloading with the feature disabled must stop a Reserve conversation.
    await plugin.dispose()
    plugin = await ctx.plugin(CodexConnect, { enableReserveFallback: false })
    await send(recovering)
    assert.equal(wires.length, count)
    await plugin.dispose()
    plugin = await ctx.plugin(CodexConnect, { enableReserveFallback: true })
    ordinary = true
    await send(recovering)
    assert.equal(wires.length, count + 1)
    assert.equal(wires.at(-1).model, selection.model)
    assert.deepEqual(recovering.session.requestHeader()?.config, selection)

    // A different session must not inherit a persisted return target.
    const fork = await ctx.agentLoop.create(SessionId('installed-reserve-without-target'), { provider: 'openai-codex', model: 'gpt-reserve' })
    await send(fork)
    assert.equal(wires.length, count + 1)

    ordinary = false
    now += 61_000
    await send(recovering)
    assert.equal(wires.length, count + 2)
    assert.equal(wires.at(-1).model, 'gpt-reserve')
    accountId = 'second-fixture-account'
    userId = 'second-fixture-user'
    const secondClaims = { chatgpt_account_id: accountId, chatgpt_user_id: userId }
    await credentials.modify('openai-codex', async () => ({
      type: 'oauth', accountId,
      access: `e30.${Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': secondClaims })).toString('base64url')}.fixture`,
      refresh: 'second-fixture-refresh', expires: Date.now() + 3_600_000,
    }))
    await send(recovering)
    assert.equal(wires.length, count + 2)

    // Affirmative exhaustion must stop even an ordinary-model conversation.
    exhausted = true
    now += 61_000
    const depleted = await ctx.agentLoop.create(SessionId('installed-reserve-exhausted'), selection)
    await send(depleted)
    assert.equal(wires.length, count + 2)
    return true
  } finally {
    try {
      await ctx.fiber.dispose()
    } finally {
      globalThis.fetch = previousFetch
      Date.now = previousNow
      if (previousHome === undefined) delete process.env.DSH_HOME
      else process.env.DSH_HOME = previousHome
      await rm(directory, { recursive: true, force: true })
    }
  }
}
