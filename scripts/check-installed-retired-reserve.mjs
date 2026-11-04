import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, relative, isAbsolute } from 'node:path'
import { createHash } from 'node:crypto'
import { zstdDecompressSync } from 'node:zlib'
import { ensureNativeToolExecution } from './installed-host-context.mjs'

/** Packed plugin retirement/migration checks; synthetic account and HTTP only, no tool body. */
export async function checkInstalledRetiredReserve(importHost, CodexConnect) {
  const [{ Context }, { default: Llm, createUserMessage }, { default: Sessions, SessionId },
    { default: Projections }, { default: Prompt }, { default: Tools }, { default: Agents }, { default: Loop }] = await Promise.all([
    '@deepseek-ai/cordis', '@deepseek-ai/dsh-llm', '@deepseek-ai/dsh-session',
    '@deepseek-ai/dsh-session-projection', '@deepseek-ai/dsh-system-prompt', '@deepseek-ai/dsh-tools',
    '@deepseek-ai/dsh-agent', '@deepseek-ai/dsh-agent-loop',
  ].map(importHost))
  const { mkdir, readFile, writeFile } = await import('node:fs/promises')
  const directory = await mkdtemp(join(tmpdir(), 'codex-retired-reserve-'))
  const previousHome = process.env.DSH_HOME
  const previousFetch = globalThis.fetch
  const ctx = new Context()
  process.env.DSH_HOME = directory
  const errors = []
  const wires = []
  let quotaNegotiations = 0
  let unexpectedRequests = 0
  ctx.on('agent/error', ({ error }) => { errors.push(error) })
  globalThis.fetch = async (url, init) => {
    if (String(url) === 'https://chatgpt.com/backend-api/wham/usage') quotaNegotiations++
    if (String(url) !== 'https://chatgpt.com/backend-api/codex/responses') unexpectedRequests++
    assert.equal(String(url), 'https://chatgpt.com/backend-api/codex/responses', 'retired opt-in must not trigger usage negotiation or other requests')
    assert.equal(new Headers(init.headers).has('x-openai-codex-luna-reserve'), false)
    const raw = new Headers(init.headers).get('content-encoding') === 'zstd' ? zstdDecompressSync(init.body).toString() : String(init.body)
    const body = JSON.parse(raw)
    assert.notEqual(body.model, 'gpt-reserve')
    wires.push(body.model)
    const item = { type: 'message', id: 'fixture', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'OK', annotations: [] }] }
    const events = [
      { type: 'response.output_item.added', output_index: 0, item: { ...item, content: [] } },
      { type: 'response.output_text.delta', output_index: 0, content_index: 0, delta: 'OK' },
      { type: 'response.output_item.done', output_index: 0, item },
      { type: 'response.completed', response: { id: 'fixture', status: 'completed', output: [item], usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } } },
    ]
    return new Response(events.map(event => 'data: ' + JSON.stringify(event) + '\n\n').join(''), { headers: { 'content-type': 'text/event-stream' } })
  }
  try {
    const credentials = new CodexConnect.OpenAICodexCredentialStore()
    const fromRoot = relative(directory, credentials.filename)
    assert.ok(fromRoot !== '..' && !fromRoot.startsWith('../') && !fromRoot.startsWith('..\\') && !isAbsolute(fromRoot), 'fixture credentials must stay in its temporary home')
    const returnDirectory = join(dirname(credentials.filename), 'codex-connect-reserve')
    await mkdir(returnDirectory, { recursive: true, mode: 0o700 })
    const oldFile = join(returnDirectory, createHash('sha256').update('legacy-reserve-fixture').digest('hex') + '.json')
    const oldContents = JSON.stringify({ version: 1, identityKey: 'a'.repeat(64), ordinary: { provider: 'openai-codex', model: 'gpt-5.6-luna' } })
    await writeFile(oldFile, oldContents)
    await credentials.modify('openai-codex', async () => ({ type: 'oauth', access: 'e30.' + Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: 'fixture', chatgpt_user_id: 'fixture-user' } })).toString('base64url') + '.fixture', refresh: 'fixture', accountId: 'fixture', expires: Date.now() + 3600000 }))
    for (const plugin of [Llm, Sessions, Projections, Prompt, Tools, Agents]) await ctx.plugin(plugin)
    await ensureNativeToolExecution(ctx, importHost)
    await ctx.plugin(Loop, { agents: [] })
    await ctx.plugin(CodexConnect, { enableReserveFallback: true })
    assert.equal(CodexConnect.resolveOpenAICodexSettings({ enableReserveFallback: true }).enableReserveFallback, false)
    assert.equal((await ctx.llm.listModels('openai-codex')).some(model => model.id === 'gpt-reserve'), false)
    await assert.rejects(ctx.llm.prepareCall({ provider: 'openai-codex', model: 'gpt-reserve' }), /Luna Reserve has been removed/)
    const legacy = await ctx.agentLoop.create(SessionId('legacy-reserve-fixture'), { provider: 'openai-codex', model: 'gpt-reserve' })
    const send = async agent => {
      agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Synthetic migration check; no tool use.' }] }))
      await agent.whenIdle()
    }
    await send(legacy)
    assert.equal(wires.length, 0, 'a retired session must not dispatch before the user picks a model')
    assert.ok(errors.some(error => error.message.includes('Luna Reserve has been removed')))
    errors.length = 0
    // Simulate an explicit operator selection through the public Host generation's API.
    if (legacy.model?.select !== undefined) legacy.model.select({ provider: 'openai-codex', model: 'gpt-6-astra' })
    else legacy.options.model = 'gpt-6-astra'
    await send(legacy)
    assert.equal(errors.length, 0, errors[0]?.message)
    assert.deepEqual(wires, ['gpt-6-astra'])
    assert.equal(quotaNegotiations, 0, 'legacy true must not negotiate Reserve even when failures could be caught')
    assert.equal(unexpectedRequests, 0)
    assert.equal(legacy.session.requestHeader().config.model, 'gpt-6-astra')
    assert.equal(await readFile(oldFile, 'utf8'), oldContents)
    return { syntheticOnly: true, retiredModelBlocked: true, explicitOrdinarySelectionVerified: true, legacyFlagIgnored: true, returnFilePreserved: true, quotaNegotiations, toolExecutions: 0, realProviderRequests: 0 }
  } finally {
    try { await ctx.fiber.dispose() } finally {
      globalThis.fetch = previousFetch
      if (previousHome === undefined) delete process.env.DSH_HOME
      else process.env.DSH_HOME = previousHome
      await rm(directory, { recursive: true, force: true })
    }
  }
}
