/** Optional, read-only model projection of the existing identity-bound quota cache. */
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import type { OpenAICodexQuotaState } from './quota-state.ts'

/** Stable Host tool name; no account/model selector or refresh bypass is accepted. */
export const QUOTA_TOOL_NAME = 'codex_connect_quota'

interface QuotaValue {
  status: 'available' | 'unknown' | 'stale'
  /** Local observation time, not an upstream generation timestamp. Unix milliseconds. */
  updatedAt?: number
  windows: Array<{ remainingPercent: number; windowSeconds: number; resetAt?: number }>
}

/** Register through the normal Host tool path, preserving its permission and cancellation policy. */
export function quotaTool(quota: Pick<OpenAICodexQuotaState, 'read'>): ToolDefinition {
  return defineTool({
    name: QUOTA_TOOL_NAME,
    description: 'Observe shared Codex allowance for the account captured when this call starts. Read-only; excludes separately metered model allowances and balances. Call when the user requests quota or an authorized workflow needs a resource checkpoint, not on every step. updatedAt is local successful-fetch time in Unix milliseconds; resetAt is Unix seconds. unknown/stale gives no usable allowance. Percentages are observations, not exact task budgets or completion guarantees. Preserve the user\'s requirements, tests, safety checks and permissions; report resource blockers. This tool does not authorize changing models/accounts or scheduling work.',
    parameters: {},
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: {
          status: { type: 'string', enum: ['available', 'unknown', 'stale'], required: true },
          updatedAt: { type: 'integer' },
          windows: {
            type: 'array', required: true,
            items: {
              type: 'object', additionalProperties: false,
              properties: {
                remainingPercent: { type: 'number', required: true },
                windowSeconds: { type: 'integer', required: true },
                resetAt: { type: 'integer' },
              },
            },
          },
        },
      },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    isConcurrencySafe: () => true,
    async execute(args, exec): Promise<QuotaValue> {
      exec.signal.throwIfAborted()
      if (Object.keys(args).length !== 0) throw new Error('Quota observation takes no arguments.')
      try {
        const snapshot = await quota.read(undefined, exec.signal)
        exec.signal.throwIfAborted()
        const now = Date.now()
        const updatedAt = snapshot.fetchedAt
        if (!Number.isSafeInteger(updatedAt) || updatedAt < 0 || updatedAt > now) {
          return { status: 'unknown', windows: [] }
        }
        // Emit no upstream free-form strings or whole usage/routing objects.
        const windows = snapshot.usage.rateLimits.filter(limit => limit.id === 'codex').flatMap(limit => limit.windows)
        if (snapshot.authoritySignal.aborted || now - updatedAt >= 60_000
          || windows.some(window => window.resetAt !== undefined && window.resetAt * 1_000 <= now)) {
          return { status: 'stale', updatedAt, windows: [] }
        }
        if (windows.length === 0) return { status: 'unknown', updatedAt, windows: [] }
        return { status: 'available', updatedAt, windows: windows.map(window => ({
          remainingPercent: window.remainingPercent, windowSeconds: window.windowSeconds,
          ...(window.resetAt === undefined ? {} : { resetAt: window.resetAt }),
        })) }
      } catch {
        // Never relay auth/account/transport error text, nor invent zero or full capacity.
        exec.signal.throwIfAborted()
        return { status: 'unknown', windows: [] }
      }
    },
  })
}
