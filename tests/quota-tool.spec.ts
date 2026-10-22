import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { quotaTool, QUOTA_TOOL_NAME } from '../src/quota-tool.ts'
import type { OpenAICodexQuotaSnapshot } from '../src/quota-state.ts'

let context: Context | undefined
afterEach(async () => { await context?.fiber.dispose(); context = undefined; vi.useRealTimers() })

function snapshot(): OpenAICodexQuotaSnapshot {
  return {
    fetchedAt: Date.now(), authoritySignal: new AbortController().signal, decision: { kind: 'unavailable' },
    usage: {
      rateLimits: [
        { id: 'codex', name: 'private upstream label', windows: [{ remainingPercent: 27, windowSeconds: 18_000, resetAt: Math.floor(Date.now() / 1000) + 100 }] },
        { id: 'private-feature', name: 'private-model', windows: [{ remainingPercent: 99, windowSeconds: 100 }] },
      ],
      credits: { unlimited: false, balance: '123.45' },
      individualLimit: { limit: '100', used: '20', remaining: '80', remainingPercent: 80 },
    },
  }
}

async function setup(read: () => Promise<OpenAICodexQuotaSnapshot>) {
  const ctx = context = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime, { mode: 'native' })
  const reader = vi.fn(read)
  ctx.tools.register(quotaTool({ read: reader }))
  const request = (args: unknown = {}, signal = new AbortController().signal) => ({
    name: QUOTA_TOOL_NAME, callId: 'quota-call' as never, arguments: args, signal,
    agent: { id: 'quota-session', options: {}, session: {} } as never,
  })
  return { ctx, reader, execute: (args?: unknown, signal?: AbortSignal) => ctx.tools.execute(request(args, signal)), request }
}

describe('model quota observation', () => {
  it('uses the Host tool runtime and returns only explicit common-window fields', async () => {
    vi.useFakeTimers(); vi.setSystemTime(1_000_000)
    const value = snapshot()
    const h = await setup(async () => value)
    expect(h.ctx.tools.executionMode(h.request())).toEqual({ kind: 'parallel' })
    const result = await h.execute()
    expect(result.isError).toBe(false)
    if (result.isError) throw new Error('expected quota observation')
    expect(result.value).toEqual({ status: 'available', updatedAt: 1_000_000,
      windows: [{ remainingPercent: 27, windowSeconds: 18_000, resetAt: 1100 }] })
    expect(result.content).toEqual([{ type: 'text', text: JSON.stringify(result.value) }])
    expect(JSON.stringify(result)).not.toMatch(/private|balance|credits|individualLimit|identity|decision|authoritySignal|123\.45/)
  })

  it('does not invent a reset time or replace zero remaining with unknown', async () => {
    const value = snapshot()
    value.usage = { rateLimits: [{ id: 'codex', windows: [{ remainingPercent: 0, windowSeconds: 100 }] }] }
    const h = await setup(async () => value)
    const result = await h.execute()
    expect(result).toMatchObject({ isError: false, value: { status: 'available', windows: [{ remainingPercent: 0, windowSeconds: 100 }] } })
    if (!result.isError) expect(result.value).not.toHaveProperty('windows.0.resetAt')
  })

  it.each(['expired-age', 'expired-reset', 'revoked'])('omits stale percentages for %s', async kind => {
    vi.useFakeTimers(); vi.setSystemTime(1_000_000)
    const value = snapshot()
    if (kind === 'expired-age') value.fetchedAt -= 60_000
    if (kind === 'expired-reset') value.usage = { rateLimits: [{ id: 'codex', windows: [{ remainingPercent: 50, windowSeconds: 100, resetAt: 1000 }] }] }
    if (kind === 'revoked') value.authoritySignal = AbortSignal.abort()
    const h = await setup(async () => value)
    expect(await h.execute()).toMatchObject({ isError: false, value: { status: 'stale', updatedAt: value.fetchedAt, windows: [] } })
  })

  it.each(['missing-windows', 'invalid-time', 'upstream-failure'])('returns unknown without fake capacity for %s', async kind => {
    const value = snapshot()
    if (kind === 'missing-windows') value.usage = { rateLimits: [] }
    if (kind === 'invalid-time') value.fetchedAt = NaN
    const h = await setup(async () => { if (kind === 'upstream-failure') throw new Error('private upstream body, token, account'); return value })
    const result = await h.execute()
    expect(result).toMatchObject({ isError: false, value: { status: 'unknown', windows: [] } })
    expect(JSON.stringify(result)).not.toMatch(/private|remainingPercent|balance/)
  })

  it('rejects account/refresh arguments without reading quota', async () => {
    const h = await setup(async () => snapshot())
    expect((await h.execute({ accountId: 'other', forceRefresh: true })).isError).toBe(true)
    expect(h.reader).not.toHaveBeenCalled()
  })

  it('keeps cancellation as an aborted Host tool result', async () => {
    const controller = new AbortController()
    const h = await setup(async () => { controller.abort(); throw new Error('private failure') })
    const result = await h.execute({}, controller.signal)
    expect(result).toMatchObject({ isError: true, error: { message: expect.stringMatching(/aborted/i) } })
    expect(JSON.stringify(result)).not.toContain('unknown')
    expect(h.reader).toHaveBeenCalledWith(undefined, controller.signal)
  })
})
