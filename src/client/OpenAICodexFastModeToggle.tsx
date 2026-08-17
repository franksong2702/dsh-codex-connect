/** Per-conversation OpenAI Codex Fast Mode control for the Composer row. */

import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { ModelDirectoryState } from '@deepseek-ai/dsh-client-ui-model-selection/client'
import { OPENAI_CODEX_FAST_MODE_PATH } from '../fast-mode-paths.ts'
import type { OpenAICodexSettingsKey } from './locales.ts'

const CODEX_PROVIDER = 'openai-codex'
const FAST_MODE_ACTIVE_COLOR = '#f97316'

type Translate = (key: OpenAICodexSettingsKey, params?: Record<string, unknown>) => string

export interface OpenAICodexFastModeToggleInjected {
  /** Session-scoped model directory shared with the model selector and quota. */
  readonly directory: SnapshotStore<ModelDirectoryState>
}

interface FastModeState {
  readonly status: 'loading' | 'ready' | 'error'
  readonly enabled: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readEnabled(value: unknown): boolean | undefined {
  if (!isRecord(value) || typeof value['enabled'] !== 'boolean') return undefined
  return value['enabled']
}

function isEligible(state: ModelDirectoryState): boolean {
  const current = state.current
  return state.status === 'ready'
    && current?.provider === CODEX_PROVIDER
    && typeof current.model === 'string'
    && current.model.startsWith('gpt-')
}

function subscribeDirectory(directory: SnapshotStore<ModelDirectoryState>, listener: () => void): () => void {
  return directory.subscribe(listener)
}

function requestUrl(sessionId: string): string {
  return `${OPENAI_CODEX_FAST_MODE_PATH}?sessionId=${encodeURIComponent(sessionId)}`
}

/**
 * Render a real SVG lightning button only for GPT models on the exact Codex
 * provider.  Host state is read and written through the session-addressed
 * route; no global model slot or persistent settings are changed.
 */
export function OpenAICodexFastModeToggle({
  directory,
  sessionId,
  t,
}: OpenAICodexFastModeToggleInjected & { sessionId: string; t: Translate }) {
  const directoryState = useSyncExternalStore(
    listener => subscribeDirectory(directory, listener),
    () => directory.getSnapshot(),
    () => directory.getSnapshot(),
  )
  const eligible = isEligible(directoryState)
  const [state, setState] = useState<FastModeState>({ status: 'loading', enabled: false })
  const [tooltipVisible, setTooltipVisible] = useState(false)
  const controllerRef = useRef<AbortController | undefined>(undefined)
  const tooltipId = useId()

  useEffect(() => () => { controllerRef.current?.abort() }, [])

  useEffect(() => {
    controllerRef.current?.abort()
    controllerRef.current = undefined
    if (!eligible) {
      setState({ status: 'loading', enabled: false })
      return
    }
    const controller = new AbortController()
    controllerRef.current = controller
    let disposed = false
    setState({ status: 'loading', enabled: false })
    void (async () => {
      try {
        const response = await fetch(requestUrl(sessionId), {
          method: 'GET',
          credentials: 'same-origin',
          headers: { accept: 'application/json' },
          signal: controller.signal,
        })
        const enabled = response.ok ? readEnabled(await response.json().catch(() => undefined)) : undefined
        if (!disposed && !controller.signal.aborted) {
          setState(enabled === undefined
            ? { status: 'error', enabled: false }
            : { status: 'ready', enabled })
        }
      } catch {
        if (!disposed && !controller.signal.aborted) setState({ status: 'error', enabled: false })
      } finally {
        if (controllerRef.current === controller) controllerRef.current = undefined
      }
    })()
    return () => {
      disposed = true
      controller.abort()
      if (controllerRef.current === controller) controllerRef.current = undefined
    }
  }, [eligible, sessionId])

  if (!eligible) return null

  const busy = state.status !== 'ready'
  const title = state.status === 'loading'
    ? t('fastModeLoadingTitle')
    : state.status === 'error'
      ? t('fastModeUnavailableTitle')
      : state.enabled
        ? t('fastModeEnabledTitle')
        : t('fastModeDisabledTitle')

  const toggle = (): void => {
    if (state.status !== 'ready' || busy) return
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    const next = !state.enabled
    setState(current => ({ ...current, status: 'loading' }))
    void (async () => {
      try {
        const response = await fetch(OPENAI_CODEX_FAST_MODE_PATH, {
          method: 'POST',
          credentials: 'same-origin',
          headers: {
            accept: 'application/json',
            'content-type': 'application/json',
          },
          body: JSON.stringify({ sessionId, enabled: next }),
          signal: controller.signal,
        })
        const enabled = response.ok ? readEnabled(await response.json().catch(() => undefined)) : undefined
        if (!controller.signal.aborted) {
          setState(enabled === undefined
            ? { status: 'error', enabled: state.enabled }
            : { status: 'ready', enabled })
        }
      } catch {
        if (!controller.signal.aborted) setState({ status: 'error', enabled: state.enabled })
      } finally {
        if (controllerRef.current === controller) controllerRef.current = undefined
      }
    })()
  }

  const active = state.enabled
  return (
    <span
      onMouseEnter={() => { setTooltipVisible(true) }}
      onMouseLeave={() => { setTooltipVisible(false) }}
      onFocus={() => { setTooltipVisible(true) }}
      onBlur={() => { setTooltipVisible(false) }}
      style={{
        display: 'inline-flex',
        position: 'relative',
        width: 30,
        height: 30,
      }}
    >
      <button
        type="button"
        data-openai-codex-fast-mode={active ? 'on' : 'off'}
        aria-label={title}
        aria-describedby={tooltipVisible ? tooltipId : undefined}
        aria-pressed={active}
        aria-busy={busy}
        disabled={busy}
        onClick={toggle}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 30,
          height: 30,
          padding: 0,
          border: 0,
          borderRadius: 8,
          background: 'transparent',
          color: active ? FAST_MODE_ACTIVE_COLOR : 'var(--dsw-alias-label-secondary)',
          cursor: busy ? 'default' : 'pointer',
          opacity: busy ? 0.6 : 1,
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path
            data-openai-codex-fast-mode-bolt={active ? 'filled' : 'outline'}
            d="M13.1 2.75 5.35 13.1h5.8l-.95 8.15 8.45-11.2h-5.9l.35-7.3Z"
            fill={active ? 'currentColor' : 'none'}
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {tooltipVisible && (
        <span
          id={tooltipId}
          role="tooltip"
          style={{
            position: 'absolute',
            left: '50%',
            bottom: 'calc(100% + 8px)',
            zIndex: 1000,
            transform: 'translateX(-50%)',
            padding: '4px 8px',
            borderRadius: 6,
            background: 'var(--dsw-specific-tip, #1f2329)',
            boxShadow: 'var(--dsw-shadow-lv2)',
            color: 'var(--dsw-alias-label-primary, #fff)',
            fontSize: 12,
            lineHeight: '18px',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
          }}
        >
          {title}
        </span>
      )}
    </span>
  )
}
