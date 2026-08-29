/** Compact plan-aware Codex quota indicator for the Composer tool row. */

import { useEffect, useId, useSyncExternalStore, useState } from 'react'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { ModelDirectoryState } from '@deepseek-ai/dsh-client-ui-model-selection/client'
import type { OpenAICodexUsage, OpenAICodexRateLimitWindow } from '../usage.ts'
import { OPENAI_CODEX_AUTH_STATUS_PATH } from '../auth-paths.ts'
import { formatOpenAICodexResetAt } from './OpenAICodexSettings.tsx'
import type { OpenAICodexSettingsKey } from './locales.ts'

const WEEK_SECONDS = 7 * 24 * 60 * 60
const FIVE_HOUR_SECONDS = 5 * 60 * 60
const USAGE_POLL_INTERVAL_MS = 60_000
const CODEX_PROVIDER = 'openai-codex'
const SPARK_MODEL = 'gpt-5.3-codex-spark'
const SPARK_QUOTA_ID = 'codex_bengalfox'

type Translate = (key: OpenAICodexSettingsKey, params?: Record<string, unknown>) => string

export interface OpenAICodexQuotaIndicatorInjected {
  /** Session-scoped model directory shared with the model selection surface. */
  readonly directory: SnapshotStore<ModelDirectoryState>
}

interface UsageRequestState {
  readonly status: 'loading' | 'hidden' | 'ready'
  readonly usage?: OpenAICodexUsage
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isWindow(value: unknown): value is OpenAICodexRateLimitWindow {
  if (!isRecord(value)) return false
  const remainingPercent = value['remainingPercent']
  const windowSeconds = value['windowSeconds']
  const resetAt = value['resetAt']
  return typeof remainingPercent === 'number'
    && Number.isFinite(remainingPercent)
    && remainingPercent >= 0
    && remainingPercent <= 100
    && typeof windowSeconds === 'number'
    && Number.isSafeInteger(windowSeconds)
    && windowSeconds > 0
    && (resetAt === undefined || (typeof resetAt === 'number'
      && Number.isSafeInteger(resetAt)
      && resetAt > 0
      && Number.isFinite(new Date(resetAt * 1_000).getTime())))
}

function usageFromStatus(value: unknown): OpenAICodexUsage | undefined {
  if (!isRecord(value) || value['status'] !== 'signed-in') return undefined
  const usage = value['usage']
  if (!isRecord(usage) || !Array.isArray(usage['rateLimits'])) return undefined
  const rateLimits = usage['rateLimits']
  for (const limit of rateLimits) {
    if (!isRecord(limit) || typeof limit['id'] !== 'string' || !Array.isArray(limit['windows'])) return undefined
    if (!limit['windows'].every(isWindow)) return undefined
  }
  return usage as unknown as OpenAICodexUsage
}

function quotaOf(usage: OpenAICodexUsage, model: string | undefined, windowSeconds: number): OpenAICodexRateLimitWindow | undefined {
  const quotaId = model === SPARK_MODEL ? SPARK_QUOTA_ID : 'codex'
  return usage.rateLimits
    .find(limit => limit.id === quotaId)
    ?.windows.find(window => window.windowSeconds === windowSeconds)
}

function isGptModel(state: ModelDirectoryState): boolean {
  const current = state.current
  return state.status === 'ready'
    && current?.provider === CODEX_PROVIDER
    && typeof current.model === 'string'
    && current.model.toLowerCase().startsWith('gpt-')
}

function formatPercent(percent: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(percent)
}

const QUOTA_PROGRESS_WIDTH_PX = 48
const QUOTA_PROGRESS_TRACK_HEIGHT_PX = 6

type QuotaProgressColor = 'green' | 'yellow' | 'orange' | 'red'

function boundedQuotaPercent(remainingPercent: number): number {
  return Math.min(100, Math.max(0, remainingPercent))
}

function quotaProgressColor(remainingPercent: number): {
  readonly name: QuotaProgressColor
  readonly value: string
} {
  const bounded = boundedQuotaPercent(remainingPercent)
  if (bounded >= 60) {
    return { name: 'green', value: 'var(--dsw-alias-state-success-primary, #22c55e)' }
  }
  if (bounded >= 40) {
    return { name: 'yellow', value: 'var(--dsw-alias-state-warn-primary, #eab308)' }
  }
  if (bounded >= 20) {
    return { name: 'orange', value: '#f97316' }
  }
  return { name: 'red', value: 'var(--dsw-alias-state-error-primary, #ef4444)' }
}

function subscribeDirectory(directory: SnapshotStore<ModelDirectoryState>, listener: () => void): () => void {
  return directory.subscribe(listener)
}

/** Render nothing until an eligible GPT Codex session has a usable quota window. */
export function OpenAICodexQuotaIndicator({ directory, t }: OpenAICodexQuotaIndicatorInjected & { t: Translate }) {
  const directoryState = useSyncExternalStore(
    listener => subscribeDirectory(directory, listener),
    () => directory.getSnapshot(),
    () => directory.getSnapshot(),
  )
  const eligible = isGptModel(directoryState)
  const [request, setRequest] = useState<UsageRequestState>({ status: 'loading' })
  const [isHovered, setIsHovered] = useState(false)
  const [isFocused, setIsFocused] = useState(false)
  const tooltipId = useId()

  useEffect(() => {
    if (!eligible) {
      setRequest({ status: 'hidden' })
      return
    }

    const controller = new AbortController()
    let inFlight = false
    let disposed = false

    const refresh = async (): Promise<void> => {
      if (inFlight || disposed) return
      inFlight = true
      try {
        const response = await fetch(OPENAI_CODEX_AUTH_STATUS_PATH, {
          method: 'GET',
          credentials: 'same-origin',
          headers: { accept: 'application/json' },
          signal: controller.signal,
        })
        const value: unknown = await response.json().catch(() => undefined)
        const usage = response.ok ? usageFromStatus(value) : undefined
        if (!disposed && !controller.signal.aborted) {
          setRequest(usage === undefined ? { status: 'hidden' } : { status: 'ready', usage })
        }
      } catch {
        if (!disposed && !controller.signal.aborted) setRequest({ status: 'hidden' })
      } finally {
        inFlight = false
      }
    }

    setRequest({ status: 'loading' })
    void refresh()
    const timer = window.setInterval(() => { void refresh() }, USAGE_POLL_INTERVAL_MS)
    return () => {
      disposed = true
      window.clearInterval(timer)
      controller.abort()
    }
  }, [eligible])

  if (!eligible || request.status !== 'ready' || request.usage === undefined) return null
  const fiveHour = quotaOf(request.usage, directoryState.current?.model, FIVE_HOUR_SECONDS)
  const weekly = quotaOf(request.usage, directoryState.current?.model, WEEK_SECONDS)
  const quotas: Array<{
    kind: 'five-hour' | 'weekly'
    shortLabel: string
    summary: string
    window: OpenAICodexRateLimitWindow
  }> = []
  if (fiveHour !== undefined) {
    quotas.push({
      kind: 'five-hour',
      shortLabel: t('composerFiveHourShort'),
      summary: t('composerFiveHourQuotaSummary', {
        percent: formatPercent(fiveHour.remainingPercent),
        time: formatOpenAICodexResetAt(fiveHour.resetAt) ?? t('resetUnavailable'),
      }),
      window: fiveHour,
    })
  }
  if (weekly !== undefined) {
    quotas.push({
      kind: 'weekly',
      shortLabel: t('composerWeeklyShort'),
      summary: t('composerWeeklyQuotaSummary', {
        percent: formatPercent(weekly.remainingPercent),
        time: formatOpenAICodexResetAt(weekly.resetAt) ?? t('resetUnavailable'),
      }),
      window: weekly,
    })
  }
  if (quotas.length === 0) return null

  const summary = quotas.map(quota => quota.summary).join('; ')
  const tooltipVisible = isHovered || isFocused
  return (
    <>
    <style>{`
      [data-openai-codex-quota-indicator] {
        border-radius: 9px;
        transition: background-color 180ms ease, box-shadow 180ms ease;
      }
      [data-openai-codex-quota-indicator]:hover {
        background: color-mix(in srgb, var(--dsw-alias-bg-layer-2) 72%, transparent);
      }
      [data-openai-codex-quota-indicator]:focus-visible {
        outline: 2px solid color-mix(in srgb, var(--dsw-alias-brand-primary) 72%, white);
        outline-offset: 2px;
      }
      [data-openai-codex-quota-progress] { transition: width 240ms ease; }
      [data-openai-codex-quota-tooltip] {
        animation: openaiCodexQuotaTooltipIn 180ms cubic-bezier(.2,.8,.2,1) both;
      }
      @keyframes openaiCodexQuotaTooltipIn {
        from { opacity: 0; transform: translateY(4px) scale(.98); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
      @media (prefers-reduced-motion: reduce) {
        [data-openai-codex-quota-indicator],
        [data-openai-codex-quota-progress],
        [data-openai-codex-quota-tooltip] { animation: none !important; transition: none !important; }
      }
    `}</style>
    <span
      role="status"
      data-openai-codex-quota={quotas.map(quota => quota.kind).join(',')}
      data-openai-codex-quota-indicator="composer"
      aria-label={summary}
      aria-describedby={tooltipVisible ? tooltipId : undefined}
      tabIndex={0}
      onMouseEnter={() => { setIsHovered(true) }}
      onMouseLeave={() => { setIsHovered(false) }}
      onFocus={() => { setIsFocused(true) }}
      onBlur={() => { setIsFocused(false) }}
      style={{
        display: 'inline-flex',
        width: `${QUOTA_PROGRESS_WIDTH_PX + 22}px`,
        minHeight: '30px',
        position: 'relative',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: '3px',
      }}
    >
      {quotas.map(quota => {
        const boundedPercent = boundedQuotaPercent(quota.window.remainingPercent)
        const progressColor = quotaProgressColor(quota.window.remainingPercent)
        return (
          <span key={quota.kind} aria-hidden="true" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 18, color: 'var(--dsw-alias-label-tertiary)', fontSize: 9, lineHeight: '10px', textAlign: 'right' }}>{quota.shortLabel}</span>
            <span
              data-openai-codex-quota-track={quota.kind}
              style={{
                display: 'block',
                width: `${QUOTA_PROGRESS_WIDTH_PX}px`,
                height: `${QUOTA_PROGRESS_TRACK_HEIGHT_PX}px`,
                borderRadius: '999px',
                backgroundColor: 'color-mix(in srgb, var(--dsw-alias-border-l2) 78%, transparent)',
                overflow: 'hidden',
                boxShadow: 'inset 0 1px 2px rgb(0 0 0 / 9%)',
              }}
            >
              <span
                data-openai-codex-quota-progress={quota.kind}
                data-openai-codex-quota-color={progressColor.name}
                style={{
                  display: 'block',
                  width: `${boundedPercent}%`,
                  height: '100%',
                  borderRadius: 'inherit',
                  backgroundColor: progressColor.value,
                }}
              />
            </span>
          </span>
        )
      })}
      {tooltipVisible ? (
        <span
          id={tooltipId}
          role="tooltip"
          data-openai-codex-quota-tooltip={quotas.map(quota => quota.kind).join(',')}
          style={{
            position: 'absolute',
            right: -8,
            bottom: 'calc(100% + 9px)',
            zIndex: 1000,
            boxSizing: 'border-box',
            minWidth: 230,
            maxWidth: 'min(320px, calc(100vw - 24px))',
            pointerEvents: 'none',
            padding: 10,
            border: '1px solid var(--dsw-alias-border-l2)',
            borderRadius: 12,
            backgroundColor: 'color-mix(in srgb, var(--dsw-alias-bg-layer-1, #fff) 96%, transparent)',
            color: 'var(--dsw-alias-label-primary)',
            boxShadow: '0 14px 34px rgb(0 0 0 / 20%), 0 2px 8px rgb(0 0 0 / 9%)',
            fontSize: 11,
            lineHeight: '16px',
            textAlign: 'left',
          }}
        >
          <span aria-hidden="true" style={{ position: 'absolute', right: 28, bottom: -5, width: 9, height: 9, borderRight: '1px solid var(--dsw-alias-border-l2)', borderBottom: '1px solid var(--dsw-alias-border-l2)', background: 'var(--dsw-alias-bg-layer-1, #fff)', transform: 'rotate(45deg)' }} />
          {quotas.map((quota, index) => {
            const progressColor = quotaProgressColor(quota.window.remainingPercent)
            return (
              <span key={quota.kind} style={{ display: 'grid', gridTemplateColumns: '8px minmax(0, 1fr)', gap: 8, alignItems: 'start', paddingTop: index === 0 ? 0 : 7, marginTop: index === 0 ? 0 : 7, borderTop: index === 0 ? undefined : '1px solid var(--dsw-alias-border-l2)' }}>
                <span aria-hidden="true" style={{ width: 7, height: 7, marginTop: 4, borderRadius: '50%', background: progressColor.value, boxShadow: `0 0 0 3px color-mix(in srgb, ${progressColor.value} 13%, transparent)` }} />
                <span>{quota.summary}</span>
              </span>
            )
          })}
        </span>
      ) : null}
    </span>
    </>
  )
}
