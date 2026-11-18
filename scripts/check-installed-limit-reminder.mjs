import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { ensureNativeToolExecution } from './installed-host-context.mjs'
import { selectPersistencePlugin } from './persistence-plugin-fixture.mjs'

/** Exercise the installed adapter, Host turn settlement and automatic Schedule delivery together. */
export async function checkInstalledLimitReminder(importHost, CodexConnect) {
  const directory = await mkdtemp(join(tmpdir(), 'codex-installed-limit-reminder-'))
  const previousHome = process.env.DSH_HOME
  const previousFetch = globalThis.fetch
  let ctx
  let calls = 0
  let resetAt = Math.ceil(Date.now() / 1000) + 900
  process.env.DSH_HOME = directory
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), 'https://chatgpt.com/backend-api/codex/responses')
    assert.equal(init.method, 'POST')
    calls++
    return Response.json({ error: { type: 'usage_limit_reached', resets_at: resetAt } }, { status: 429 })
  }
  try {
    const modules = await Promise.all([
      'cordis', 'dsh-llm', 'dsh-session', 'dsh-session-projection', 'dsh-system-prompt', 'dsh-tools',
      'dsh-agent', 'dsh-agent-loop', 'dsh-fs-local', 'dsh-working-directory', 'dsh-subagent',
      'dsh-session-persistence-jsonl', 'dsh-storage', 'dsh-storage-json', 'dsh-storage-domain', 'dsh-schedule',
    ].map(name => importHost('@deepseek-ai/' + name)))
    const [{ Context }, llm, sessions, projections, system, tools, agents, loop, fs, workingDirectory,
      subagents, persistence, storage, jsonStorage, domain, schedule] = modules
    const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url')
    const credentials = new CodexConnect.OpenAICodexCredentialStore()
    await credentials.modify('openai-codex', async () => ({
      type: 'oauth', access: `${encode({ alg: 'none' })}.${encode({ 'https://api.openai.com/auth': { chatgpt_account_id: 'synthetic-limit' } })}.synthetic`,
      refresh: 'synthetic-only', accountId: 'synthetic-limit', expires: Date.now() + 3600_000,
    }))
    ctx = new Context()
    for (const module of [llm, sessions, projections, system, tools, agents, fs, workingDirectory, subagents, storage]) {
      await ctx.plugin(module.default)
    }
    await ensureNativeToolExecution(ctx, importHost)
    await ctx.plugin(loop.default, { agents: [] })
    await ctx.plugin(selectPersistencePlugin(persistence), { root: join(directory, 'sessions') })
    await ctx.plugin(jsonStorage, { root: join(directory, 'storages') })
    await ctx.plugin(domain, { backend: 'json' })
    await ctx.plugin(schedule.default)
    await ctx.plugin(CodexConnect, { enableLimitResumeReminder: true, retryPolicy: { mode: 'normal', maxRetries: 0 } })
    const sessionId = sessions.SessionId('limit-reminder-original')
    const { agent } = await ctx.agents.create({ sessionId, agentOptions: { provider: 'openai-codex', model: 'gpt-5.6-sol' } })
    ctx.on('schedule/resolve-agent', async (id, next) => id === sessionId ? agent : next())
    assert.equal(await ctx.sessions.flush(agent.session), true)
    const wait = async predicate => {
      const deadline = Date.now() + 7000
      while (Date.now() < deadline) {
        const value = await predicate()
        if (value) return value
        await delay(20)
      }
      throw new Error('Timed out waiting for installed limit reminder')
    }
    const send = async () => {
      agent.followup(llm.createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Synthetic manual turn' }] }))
      await agent.whenIdle()
    }
    await send()
    const first = await wait(async () => (await ctx.schedule.list()).items[0])
    assert.deepEqual(first.target, { kind: 'session', sessionId })
    assert.equal(first.kind, 'at')
    assert.equal(first.scheduledAt, new Date((resetAt + 60) * 1000).toISOString())
    assert.match(agent.session.snapshotEvents().findLast(event => event.type === 'turn/end').data.reason.error.message, /Codex diagnostics/u)
    resetAt += 120
    await send()
    const updated = await wait(async () => {
      const record = await ctx.schedule.view({ id: first.id })
      return record.scheduledAt === new Date((resetAt + 60) * 1000).toISOString() && record
    })
    assert.equal((await ctx.schedule.list()).total, 1)
    await ctx.schedule.edit({
      id: first.id, action: 'update', expectedUpdatedAt: updated.updatedAt,
      patch: { timing: { kind: 'at', at: new Date(Date.now() + 700).toISOString() } },
    })
    const ended = await wait(async () => {
      const record = await ctx.schedule.view({ id: first.id })
      return record.status === 'ended' && record
    })
    await agent.whenIdle()
    assert.equal(ended.lastDelivery.targetSessionId, sessionId)
    assert.equal((await ctx.schedule.list()).total, 1)
    assert.equal(calls, 3)
    const deliveries = agent.session.snapshotEvents().filter(event => event.type === 'user/message'
      && event.data.source.kind === 'schedule' && event.data.id === ended.lastDelivery.messageId)
    assert.equal(deliveries.length, 1)
    return { syntheticOnly: true, exactHost: '0.2.2-rc.3', occurrences: 1, dueDeliveries: 1, syntheticRequests: calls }
  } finally {
    try { await ctx?.fiber.dispose() } finally {
      globalThis.fetch = previousFetch
      if (previousHome === undefined) delete process.env.DSH_HOME
      else process.env.DSH_HOME = previousHome
      await rm(directory, { recursive: true, force: true })
    }
  }
}
