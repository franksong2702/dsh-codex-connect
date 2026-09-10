/** Identity-checked, backend-authorized Luna Reserve decisions from the usage endpoint. */

import { createHash } from 'node:crypto'

/** Hidden route selected only by a backend Luna Reserve banner. */
export const OPENAI_CODEX_RESERVE_MODEL = 'gpt-reserve'
/** Catalog metadata supported by this implementation of Luna Reserve. */
export const OPENAI_CODEX_RESERVE_NORMAL_MODEL = 'gpt-5.6-luna'

/** Internal identity used to match the usage response, never exposed in diagnostics. */
export interface ReserveIdentity {
  accountId: string
  userId: string
  /** Account/user binding stored instead of raw identifiers in the return-target file. */
  key: string
}

/** Only a recognized banner authorizes entry; missing recovery fields remain unknown. */
export type ReserveUsageDecision =
  | { kind: 'reserve'; normalModel: string; blockedModel?: string }
  | { kind: 'ordinary' }
  | { kind: 'exhausted' }
  | { kind: 'unavailable' }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function identityText(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 256
    && !/[\u0000-\u001f\u007f]/u.test(value)
}

function modelSlug(value: unknown): value is string {
  return typeof value === 'string' && /^(?=.{1,128}$)[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(value)
}

/**
 * Read only complete Codex identity claims from the captured bearer token.
 * This is not signature verification: the fixed first-party endpoint authenticates the token.
 * Unlike the official client's ID-token store, older plugin credentials may lack these claims;
 * absence or a FedRAMP marker disables Reserve without guessing from an email or plan name.
 */
export function reserveIdentity(access: string): ReserveIdentity | undefined {
  const payload = access.split('.')[1]
  if (payload === undefined || payload.length === 0 || payload.length > 64 * 1024) return undefined
  let decoded: unknown
  try {
    decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
  } catch {
    return undefined
  }
  if (!isRecord(decoded)) return undefined
  const claims = decoded['https://api.openai.com/auth']
  if (!isRecord(claims)) return undefined
  const accountId = claims['chatgpt_account_id']
  const userId = claims['chatgpt_user_id'] ?? claims['user_id']
  const fedramp = claims['chatgpt_account_is_fedramp']
  if (!identityText(accountId) || !identityText(userId)
    || (fedramp !== undefined && fedramp !== false)) return undefined
  return {
    accountId,
    userId,
    key: createHash('sha256').update(JSON.stringify([accountId, userId])).digest('hex'),
  }
}

function validBanner(value: Record<string, unknown>): boolean {
  const title = value['title']
  const description = value['description']
  const ctas = value['ctas']
  const blocked = value['blocked_model_slug']
  const presentation = value['presentation']
  const fallbacks = value['fallback_model_slugs']
  return typeof title === 'string' && title.trim().length > 0
    && Buffer.byteLength(title) <= 1024 && title.split('\n').length <= 3
    && typeof description === 'string' && Buffer.byteLength(description) <= 4096
    && description.split('\n').length <= 12
    && Array.isArray(ctas) && ctas.length <= 8
    && ctas.every(cta => isRecord(cta) && typeof cta['action'] === 'string' && typeof cta['label'] === 'string')
    && (blocked === undefined || blocked === null || modelSlug(blocked))
    && (presentation === undefined || presentation === 'inline' || presentation === 'dismissible')
    && (fallbacks === undefined || (Array.isArray(fallbacks) && fallbacks.length <= 16 && fallbacks.every(modelSlug)))
    && (value['model_slug'] === undefined || value['model_slug'] === null || modelSlug(value['model_slug']))
    && (value['reset_at'] === undefined || value['reset_at'] === null || Number.isSafeInteger(value['reset_at']))
    && (value['request_url'] === undefined || value['request_url'] === null || typeof value['request_url'] === 'string')
}

/** Parse backend authority without inferring permission from rounded quota windows. */
export function parseReserveUsage(value: unknown, identity: ReserveIdentity): ReserveUsageDecision {
  if (!isRecord(value) || value['account_id'] !== identity.accountId || value['user_id'] !== identity.userId) {
    return { kind: 'unavailable' }
  }
  const banner = value['rate_limit_upsell']
  if (isRecord(banner) && banner['banner_type'] === 'luna_reserve' && validBanner(banner)) {
    const additional = value['additional_rate_limits']
    if (additional !== undefined && additional !== null && !Array.isArray(additional)) return { kind: 'unavailable' }
    const reserves = (additional ?? []).filter((limit: unknown) => isRecord(limit) && limit['limit_name'] === OPENAI_CODEX_RESERVE_MODEL)
    if (reserves.length > 1) return { kind: 'unavailable' }
    const reserveLimit = reserves[0]?.['rate_limit']
    if (isRecord(reserveLimit) && (reserveLimit['allowed'] === false || reserveLimit['limit_reached'] === true)) {
      return { kind: 'exhausted' }
    }
    const normalModel: unknown = reserves[0]?.['normal_model_slug'] ?? OPENAI_CODEX_RESERVE_NORMAL_MODEL
    if (!modelSlug(normalModel)) return { kind: 'unavailable' }
    const blocked = banner['blocked_model_slug']
    return { kind: 'reserve', normalModel, ...typeof blocked === 'string' ? { blockedModel: blocked } : {} }
  }
  // Unknown or malformed banners still block recovery, as in the official client.
  if (banner !== undefined && banner !== null) return { kind: 'unavailable' }
  const rateLimit = value['rate_limit']
  const spendControl = value['spend_control']
  const credits = value['credits']
  const hasCredits = isRecord(credits) && (credits['has_credits'] === true || credits['unlimited'] === true)
  if (isRecord(rateLimit) && typeof rateLimit['allowed'] === 'boolean'
    && (rateLimit['allowed'] || hasCredits)
    && (spendControl === undefined || spendControl === null || (isRecord(spendControl) && spendControl['reached'] === false))
    && (value['rate_limit_reached_type'] === undefined || value['rate_limit_reached_type'] === null)) {
    return { kind: 'ordinary' }
  }
  const additional = value['additional_rate_limits']
  if (isRecord(rateLimit) && rateLimit['allowed'] === false && Array.isArray(additional)
    && additional.some(limit => isRecord(limit) && limit['limit_name'] === OPENAI_CODEX_RESERVE_MODEL
      && isRecord(limit['rate_limit']) && limit['rate_limit']['allowed'] === false)) {
    return { kind: 'exhausted' }
  }
  return { kind: 'unavailable' }
}
