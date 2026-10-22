import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import * as PiAiRuntime from '@deepseek-ai/dsh-llm-pi-ai'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import * as Codex from '../src/index.ts'

let context: Context | undefined
let root: string | undefined
afterEach(async () => {
  await context?.fiber.dispose(); context = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined; vi.unstubAllEnvs(); vi.unstubAllGlobals()
})

async function setup(enableQuotaTool?: boolean) {
  root = await mkdtemp(join(tmpdir(), 'codex-quota-tool-'))
  vi.stubEnv('DSH_HOME', root)
  const ctx = context = new Context()
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(PiAiRuntime, {})
  const plugin = await ctx.plugin(Codex, enableQuotaTool === undefined ? {} : { enableQuotaTool })
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime, { mode: 'native' })
  const store = new Codex.OpenAICodexCredentialStore()
  const account = (id: string, access = `synthetic-access-${id}`) => store.modify(Codex.OPENAI_CODEX_PROVIDER, async () => ({
    type: 'oauth', access, refresh: 'synthetic-refresh', accountId: id, expires: Date.now() + 3_600_000,
  }))
  let calls = 0
  const execute = () => ctx.tools.execute({
    name: Codex.QUOTA_TOOL_NAME, callId: `quota-${++calls}` as never, arguments: {},
    signal: new AbortController().signal, agent: { id: 'synthetic-session', options: {}, session: {} } as never,
  })
  return { ctx, plugin, account, execute }
}

function usage(used: number) {
  return Response.json({
    account_id: 'synthetic-private-id',
    rate_limit: { primary_window: { used_percent: used, limit_window_seconds: 18_000 } },
    credits: { has_credits: true, unlimited: false, balance: '123.45' },
  })
}

describe('quota tool plugin integration', () => {
  it.each([undefined, false])('stays unregistered and makes no requests with opt-in %s', async enabled => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch)
    const h = await setup(enabled)
    expect(Codex.Config({}).enableQuotaTool).toBe(false)
    expect(h.ctx.tools.get(Codex.QUOTA_TOOL_NAME)).toBeUndefined()
    expect((await h.execute()).isError).toBe(true)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('registers on explicit opt-in, coalesces/cache-hits requests and disposes with the plugin', async () => {
    const fetch = vi.fn(async () => usage(25)); vi.stubGlobal('fetch', fetch)
    const h = await setup(true)
    await h.account('synthetic-a')
    expect(h.ctx.tools.get(Codex.QUOTA_TOOL_NAME)).toBeDefined()
    const results = await Promise.all([h.execute(), h.execute()])
    expect(results[0]).toMatchObject({ isError: false, value: { status: 'available', windows: [{ remainingPercent: 75, windowSeconds: 18_000 }] } })
    const cached = await h.execute()
    expect(cached).toMatchObject({ isError: false, value: !results[0]!.isError ? results[0]!.value : undefined })
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(results)).not.toMatch(/synthetic-private-id|123\.45|accountId|balance|credits/)
    await h.plugin.dispose()
    expect(h.ctx.tools.get(Codex.QUOTA_TOOL_NAME)).toBeUndefined()
  })

  it('binds concurrent results to captured accounts and invalidates the cache on renewed credentials', async () => {
    let release!: (response: Response) => void
    const pendingA = new Promise<Response>(resolve => { release = resolve })
    const sent: Array<[string | null, string | null]> = []
    vi.stubGlobal('fetch', vi.fn(async (_url: unknown, init?: RequestInit) => {
      const headers = new Headers(init?.headers)
      sent.push([headers.get('chatgpt-account-id'), headers.get('authorization')])
      return sent.length === 1 ? pendingA : usage(sent.length === 2 ? 90 : 40)
    }))
    const h = await setup(true)
    await h.account('synthetic-a')
    const a = h.execute()
    await vi.waitFor(() => expect(sent).toHaveLength(1))
    await h.account('synthetic-b')
    expect(await h.execute()).toMatchObject({ value: { status: 'available', windows: [{ remainingPercent: 10 }] } })
    release(usage(20))
    expect(await a).toMatchObject({ value: { status: 'available', windows: [{ remainingPercent: 80 }] } })
    await h.account('synthetic-a')
    expect(await h.execute()).toMatchObject({ value: { windows: [{ remainingPercent: 80 }] } })
    expect(sent).toHaveLength(2)
    await h.account('synthetic-a', 'synthetic-renewed-a')
    expect(await h.execute()).toMatchObject({ value: { windows: [{ remainingPercent: 60 }] } })
    expect(sent).toEqual([
      ['synthetic-a', 'Bearer synthetic-access-synthetic-a'],
      ['synthetic-b', 'Bearer synthetic-access-synthetic-b'],
      ['synthetic-a', 'Bearer synthetic-renewed-a'],
    ])
  })

  it.each(['missing', 'malformed', 'rate-limited', 'reauth'])('reports %s as unknown without bypassing failure cooldown', async kind => {
    const fetch = vi.fn(async () => kind === 'malformed' ? Response.json({ rate_limit: { primary_window: { used_percent: -1, limit_window_seconds: 100 } } })
      : new Response('private upstream body', { status: kind === 'reauth' ? 401 : 429, headers: { 'Retry-After': '120' } }))
    vi.stubGlobal('fetch', fetch)
    const h = await setup(true)
    if (kind !== 'missing') await h.account('synthetic-a')
    for (let i = 0; i < 2; i++) {
      const result = await h.execute()
      expect(result).toMatchObject({ isError: false, value: { status: 'unknown', windows: [] } })
      expect(JSON.stringify(result)).not.toMatch(/private|remainingPercent|synthetic|123\.45/)
    }
    expect(fetch).toHaveBeenCalledTimes(kind === 'missing' ? 0 : 1)
  })
})
