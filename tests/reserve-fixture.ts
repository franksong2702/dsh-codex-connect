import { OPENAI_CODEX_RESERVE_MODEL } from '../src/reserve-usage.ts'

export function reserveToken(account = 'fixture-account', user = 'fixture-user', extra: Record<string, unknown> = {}): string {
  const claims = { chatgpt_account_id: account, chatgpt_user_id: user, ...extra }
  return `e30.${Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': claims })).toString('base64url')}.fixture`
}

export function reserveUsage(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    account_id: 'fixture-account',
    user_id: 'fixture-user',
    plan_type: 'pro',
    rate_limit: { allowed: false, limit_reached: true },
    additional_rate_limits: [{
      limit_name: OPENAI_CODEX_RESERVE_MODEL,
      metered_feature: 'base_model_inference',
      normal_model_slug: 'gpt-5.6-luna',
      rate_limit: { allowed: true, limit_reached: false },
    }],
    rate_limit_upsell: {
      banner_type: 'luna_reserve',
      presentation: 'dismissible',
      title: 'Luna Reserve is available',
      description: 'Ordinary usage is exhausted.',
      ctas: [],
    },
    ...extra,
  }
}

export function ordinaryUsage(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return reserveUsage({
    rate_limit: { allowed: true, limit_reached: false },
    rate_limit_upsell: null,
    ...extra,
  })
}
