import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { zstdDecompressSync } from 'node:zlib'

/** Real rc.5 exported Auto gate and plugin transport; lifecycle/snapshot/HTTP are synthetic. No tool executor. */
export async function checkInstalledStockReview(importHost, CodexConnect) {
  const [{ Context }, { default: Llm }, stock] = await Promise.all([
    importHost('@deepseek-ai/cordis'), importHost('@deepseek-ai/dsh-llm'), importHost('@deepseek-ai/dsh-experimental-auto-review'),
  ])
  const root = await mkdtemp(join(tmpdir(), 'codex-stock-review-'))
  const home = process.env.DSH_HOME
  const fetch = globalThis.fetch
  const ctx = new Context()
  let gate
  let receivedOptions
  const bodies = []
  process.env.DSH_HOME = root
  globalThis.fetch = async (_url, init) => {
    assert.equal(String(_url), 'https://chatgpt.com/backend-api/codex/responses')
    const raw = new Headers(init.headers).get('content-encoding') === 'zstd' ? zstdDecompressSync(init.body).toString() : String(init.body)
    bodies.push(JSON.parse(raw))
    if (Object.hasOwn(bodies.at(-1), 'temperature')) return Response.json({ detail: 'Unsupported parameter: temperature' }, { status: 400 })
    const text = JSON.stringify({ risk: 'low', decision: 'allow' })
    const item = { type: 'message', id: 'fixture', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text, annotations: [] }] }
    const events = [
      { type: 'response.output_item.added', output_index: 0, item: { ...item, content: [] } },
      { type: 'response.output_text.delta', item_id: item.id, output_index: 0, content_index: 0, delta: text },
      { type: 'response.output_item.done', output_index: 0, item },
      { type: 'response.completed', response: { id: 'fixture', status: 'completed', output: [item], usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } } },
    ]
    return new Response(events.map(event => 'data: ' + JSON.stringify(event) + '\n\n').join(''), { headers: { 'content-type': 'text/event-stream' } })
  }
  try {
    await new CodexConnect.OpenAICodexCredentialStore().modify('openai-codex', async () => ({ type: 'oauth', access: 'e30.' + Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: 'fixture' } })).toString('base64url') + '.fixture', refresh: 'fixture', accountId: 'fixture', expires: Date.now() + 3600000 }))
    await ctx.plugin(Llm)
    await ctx.plugin(CodexConnect, {})
    stock.apply({
      effect(generator) { const scope = generator(); scope.next(); scope.next() },
      on(event, handler) { assert.equal(event, 'tools/pre-execute'); gate = handler; return () => {} },
      permissionPresets: { current: () => 'auto', registerAuto: () => () => {} },
      approval: { overrideOf: () => undefined }, workingDirectory: { ensure: async () => root },
      llm: { stream(options) { receivedOptions = options; return ctx.llm.stream(options) } },
    })
    const name = 'str_replace_editor'
    const args = { command: 'view', path: join(root, 'example.txt') }
    const raw = JSON.stringify(args)
    const events = [
      { type: 'step/start', data: { turn: 1, step: 1 } },
      { type: 'assistant/message', data: { turn: 1, step: 1, message: { content: [{ type: 'tool-call', id: 'fixture', name, arguments: raw }] } } },
      { type: 'tool/call', data: { turn: 1, step: 1, callId: 'fixture', name, arguments: raw } },
    ]
    const session = { header: { origin: 'interactive', cwd: root }, surface: { nodes: [1] }, snapshotEvents: () => events,
      requestHeader: () => ({ config: { provider: 'openai-codex', model: 'gpt-6.1-sol' }, tools: [{ name, description: 'Synthetic read only; never executed', parameters: { type: 'object' } }] }) }
    const result = await gate({ agent: { session }, name, arguments: args, callId: 'fixture', rootCallId: 'fixture', signal: new AbortController().signal }, async () => ({ kind: 'allow' }))
    assert.equal(receivedOptions.temperature, 0, 'actual stock classifier must supply zero')
    assert.equal(result.kind, 'allow', result.reason ?? 'stock classifier must complete through the installed Codex transport')
    assert.equal(bodies.length, 1)
    assert.equal(Object.hasOwn(bodies[0], 'temperature'), false)
    assert.equal(bodies[0].model, 'gpt-6.1-sol')
    return { syntheticOnly: true, stockPreset: true, temperatureOmitted: true, toolExecutions: 0, realProviderRequests: 0 }
  } finally {
    try { await ctx.fiber.dispose() } finally {
      globalThis.fetch = fetch
      if (home === undefined) delete process.env.DSH_HOME
      else process.env.DSH_HOME = home
      await rm(root, { recursive: true, force: true })
    }
  }
}
