/** Compact weekly Codex quota indicator for the Composer tool row. */

import { useEffect, useId, useSyncExternalStore, useState } from 'react'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { ModelDirectoryState } from '@deepseek-ai/dsh-client-ui-model-selection/client'
import type { OpenAICodexUsage, OpenAICodexRateLimitWindow } from '../usage.ts'
import { OPENAI_CODEX_AUTH_STATUS_PATH } from '../auth-paths.ts'
import { formatOpenAICodexResetAt } from './OpenAICodexSettings.tsx'
import type { OpenAICodexSettingsKey } from './locales.ts'

const WEEK_SECONDS = 7 * 24 * 60 * 60
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

function weeklyQuotaOf(usage: OpenAICodexUsage, model: string | undefined): OpenAICodexRateLimitWindow | undefined {
  const quotaId = model === SPARK_MODEL ? SPARK_QUOTA_ID : 'codex'
  return usage.rateLimits
    .find(limit => limit.id === quotaId)
    ?.windows.find(window => window.windowSeconds === WEEK_SECONDS)
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

/** Render nothing until an eligible GPT Codex session has a usable weekly quota. */
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
  const weekly = weeklyQuotaOf(request.usage, directoryState.current?.model)
  if (weekly === undefined) return null

  const percent = formatPercent(weekly.remainingPercent)
  const fullResetTime = formatOpenAICodexResetAt(weekly.resetAt) ?? t('resetUnavailable')
  const summary = t('composerWeeklyQuotaSummary', { percent, time: fullResetTime })
  const boundedPercent = boundedQuotaPercent(weekly.remainingPercent)
  const progressColor = quotaProgressColor(weekly.remainingPercent)
  const tooltipVisible = isHovered || isFocused
  return (
    <span
      role="status"
      data-openai-codex-quota="weekly"
      aria-label={summary}
      aria-describedby={tooltipVisible ? tooltipId : undefined}
      tabIndex={0}
      onMouseEnter={() => { setIsHovered(true) }}
      onMouseLeave={() => { setIsHovered(false) }}
      onFocus={() => { setIsFocused(true) }}
      onBlur={() => { setIsFocused(false) }}
      style={{
        display: 'inline-flex',
        width: `${QUOTA_PROGRESS_WIDTH_PX}px`,
        height: '28px',
        position: 'relative',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <span
        aria-hidden="true"
        data-openai-codex-quota-track="weekly"
        style={{
          display: 'block',
          width: `${QUOTA_PROGRESS_WIDTH_PX}px`,
          height: `${QUOTA_PROGRESS_TRACK_HEIGHT_PX}px`,
          borderRadius: '999px',
          backgroundColor: 'var(--dsw-alias-border-l2)',
          overflow: 'hidden',
        }}
      >
        <span
          aria-hidden="true"
          data-openai-codex-quota-progress="weekly"
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
      {tooltipVisible ? (
        <span
          id={tooltipId}
          role="tooltip"
          data-openai-codex-quota-tooltip="weekly"
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 6px)',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1000,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            padding: '4px 8px',
            borderRadius: '6px',
            backgroundColor: 'var(--dsw-specific-tip, #1f2329)',
            color: 'var(--dsw-alias-label-primary, #ffffff)',
            boxShadow: 'var(--dsw-shadow-lv2, 0 4px 12px rgb(0 0 0 / 12%))',
            fontSize: '12px',
            lineHeight: '18px',
          }}
        >{summary}</span>
      ) : null}
    </span>
  )
}
