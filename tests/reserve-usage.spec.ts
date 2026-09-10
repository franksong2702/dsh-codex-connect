import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  OPENAI_CODEX_RESERVE_USAGE_MAX_BYTES,
  parseReserveUsage,
  readReserveUsage,
  reserveIdentity,
} from '../src/reserve-usage.ts'
import { OPENAI_CODEX_USAGE_URL } from '../src/usage.ts'
import { ordinaryUsage, reserveToken, reserveUsage } from './reserve-fixture.ts'

const access = reserveToken()
const identity = reserveIdentity(access)!
afterEach(() => { vi.unstubAllGlobals() })

describe('Reserve identity and backend authority', () => {
  it('requires complete namespace identity, supports the user_id fallback, and excludes FedRAMP', () => {
    expect(identity).toMatchObject({ accountId: 'fixture-account', userId: 'fixture-user' })
    expect(identity.key).toMatch(/^[a-f0-9]{64}$/u)
    expect(identity.key).not.toContain('fixture')
    for (const token of ['bad', 'e30.not-json.fixture', reserveToken('', 'user'), reserveToken('account', ''),
      reserveToken('account', 'user', { chatgpt_account_is_fedramp: true }),
      reserveToken('account', 'user', { chatgpt_account_is_fedramp: 'false' })]) {
      expect(reserveIdentity(token)).toBeUndefined()
    }
    expect(reserveIdentity(reserveToken('account', 'unused', { chatgpt_user_id: undefined, user_id: 'fallback' })))
      .toMatchObject({ userId: 'fallback' })
  })

  it('enters only for the recognized identity-matched banner and preserves its blocked model', () => {
    expect(parseReserveUsage(reserveUsage(), identity)).toEqual({ kind: 'reserve', normalModel: 'gpt-5.6-luna' })
    const usage = reserveUsage()
    Object.assign(usage.rate_limit_upsell as object, { blocked_model_slug: 'gpt-6-astra' })
    expect(parseReserveUsage(usage, identity)).toEqual({ kind: 'reserve', normalModel: 'gpt-5.6-luna', blockedModel: 'gpt-6-astra' })
    expect(parseReserveUsage(reserveUsage({ additional_rate_limits: null }), identity))
      .toEqual({ kind: 'reserve', normalModel: 'gpt-5.6-luna' })
  })

  it.each([
    { rate_limit_upsell: null },
    { rate_limit_upsell: { banner_type: 'luna_reserve' } },
    { account_id: 'different' },
    { user_id: 'different' },
    { account_id: undefined },
    { user_id: undefined },
    { additional_rate_limits: {} },
    { additional_rate_limits: [{ limit_name: 'gpt-reserve', normal_model_slug: '' }] },
    { additional_rate_limits: [{ limit_name: 'gpt-reserve' }, { limit_name: 'gpt-reserve' }] },
  ])('does not turn incomplete or mismatched authority into a Reserve route: %j', fields => {
    expect(parseReserveUsage(reserveUsage(fields), identity)).toEqual({ kind: 'unavailable' })
  })

  it.each([300, 10080])('does not infer entry from an exhausted %i-minute ordinary window', minutes => {
    const rate_limit = { allowed: false, limit_reached: true, primary_window: { used_percent: 100, limit_window_seconds: minutes * 60 } }
    expect(parseReserveUsage(reserveUsage({ rate_limit, rate_limit_upsell: null }), identity)).toEqual({ kind: 'unavailable' })
    expect(parseReserveUsage(reserveUsage({ rate_limit }), identity).kind).toBe('reserve')
  })

  it('requires affirmative full-read recovery and honors workspace blockers and unknown banners', () => {
    expect(parseReserveUsage(ordinaryUsage(), identity)).toEqual({ kind: 'ordinary' })
    for (const fields of [
      { rate_limit: {} },
      { rate_limit: { allowed: false, primary_window: { used_percent: 0, reset_at: 0 } } },
      { rate_limit_upsell: { banner_type: 'new-banner' } },
      { spend_control: { reached: true } },
      { spend_control: 'unknown' },
      { rate_limit_reached_type: { type: 'workspace_owner_usage_limit_reached' } },
      { user_id: 'other' },
    ]) expect(parseReserveUsage(ordinaryUsage(fields), identity)).toEqual({ kind: 'unavailable' })
    expect(parseReserveUsage(ordinaryUsage({ rate_limit: { allowed: false }, credits: { has_credits: true } }), identity))
      .toEqual({ kind: 'ordinary' })
    expect(parseReserveUsage(ordinaryUsage({ rate_limit: {}, credits: { unlimited: true } }), identity))
      .toEqual({ kind: 'unavailable' })
  })

  it('negotiates only at the fixed usage endpoint with the captured identity and no redirects', async () => {
    const fetch = vi.fn(async () => Response.json(reserveUsage()))
    vi.stubGlobal('fetch', fetch)
    await expect(readReserveUsage(access, identity, new AbortController().signal)).resolves.toMatchObject({ kind: 'reserve' })
    expect(fetch).toHaveBeenCalledOnce()
    expect(fetch).toHaveBeenCalledWith(OPENAI_CODEX_USAGE_URL, expect.objectContaining({
      method: 'GET', redirect: 'error',
      headers: expect.objectContaining({ authorization: `Bearer ${access}`, 'chatgpt-account-id': identity.accountId, 'x-openai-codex-luna-reserve': '1' }),
    }))
  })

  it.each([401, 403, 429, 500])('does not grant a route or expose an HTTP %i response body', async status => {
    vi.stubGlobal('fetch', async () => new Response('private upstream detail', { status }))
    await expect(readReserveUsage(access, identity, new AbortController().signal)).rejects.toThrow('Codex Reserve eligibility could not be verified')
  })

  it('rejects oversized and malformed bodies and checks cancellation before network access', async () => {
    vi.stubGlobal('fetch', async () => new Response('x', { headers: { 'content-length': String(OPENAI_CODEX_RESERVE_USAGE_MAX_BYTES + 1) } }))
    await expect(readReserveUsage(access, identity, new AbortController().signal)).rejects.toThrow('could not be verified')
    vi.stubGlobal('fetch', async () => new Response('private malformed JSON'))
    await expect(readReserveUsage(access, identity, new AbortController().signal)).rejects.toThrow('could not be verified')
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    await expect(readReserveUsage(access, identity, AbortSignal.abort())).rejects.toThrow('aborted')
    expect(fetch).not.toHaveBeenCalled()
  })
})
