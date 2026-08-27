/** Draggable session-local Codex proxy signal and water-drop configuration panel. */

import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import type {
  CSSProperties,
  FocusEvent,
  PointerEvent as ReactPointerEvent,
} from 'react'
import type { SettingsScope, SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { ModelDirectoryState } from '@deepseek-ai/dsh-client-ui-model-selection/client'
import { OPENAI_CODEX_CONNECTIVITY_PATH } from '../proxy-paths.ts'
import type {
  OpenAICodexConnectivityReport,
  OpenAICodexConnectivityTargetResult,
} from '../provider-proxy.ts'
import type { OpenAICodexSettingsConfig } from '../settings-contract.ts'
import type { OpenAICodexSettingsKey } from './locales.ts'
import { OpenAICodexProxyConfiguration } from './OpenAICodexProxyConfiguration.tsx'

type Translate = (key: OpenAICodexSettingsKey, params?: Record<string, unknown>) => string
type Signal = 'red' | 'yellow' | 'green'
type Point = { x: number; y: number }
type Bounds = { left: number; top: number; right: number; bottom: number; width: number; height: number }

export const OPENAI_CODEX_CONNECTIVITY_INTERVAL_MS = 3_000
export const OPENAI_CODEX_PROXY_CLOSE_DELAY_MS = 1_000

const BALL_SIZE = 54
const EDGE_GAP = 16
const DRAG_THRESHOLD = 4

export interface OpenAICodexProxyIndicatorInjected {
  readonly directory: SnapshotStore<ModelDirectoryState>
  readonly configScope: SettingsScope<OpenAICodexSettingsConfig>
  readonly sessionKey: string
}

interface DragState {
  pointerId: number
  startClient: Point
  startPosition: Point
  moved: boolean
}

const signalColors: Record<Signal, string> = {
  red: 'var(--dsw-alias-state-error-primary, #ef4444)',
  yellow: 'var(--dsw-alias-state-warn-primary, #eab308)',
  green: 'var(--dsw-alias-state-success-primary, #22c55e)',
}

const buttonStyle: CSSProperties = {
  minHeight: 30,
  padding: '5px 11px',
  border: '1px solid var(--dsw-alias-border-l2)',
  borderRadius: 16,
  background: 'var(--dsw-alias-bg-layer-2)',
  color: 'var(--dsw-alias-label-primary)',
  font: 'inherit',
  fontSize: 12,
  cursor: 'pointer',
}

function targetResult(value: unknown): OpenAICodexConnectivityTargetResult | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  if (typeof record['id'] !== 'string' || typeof record['hostname'] !== 'string'
    || typeof record['reachable'] !== 'boolean' || typeof record['latencyMs'] !== 'number') return undefined
  if (record['statusCode'] !== undefined && typeof record['statusCode'] !== 'number') return undefined
  if (record['error'] !== undefined && typeof record['error'] !== 'string') return undefined
  return {
    id: record['id'],
    hostname: record['hostname'],
    reachable: record['reachable'],
    latencyMs: record['latencyMs'],
    ...(typeof record['statusCode'] === 'number' ? { statusCode: record['statusCode'] } : {}),
    ...(typeof record['error'] === 'string' ? { error: record['error'] } : {}),
  }
}

function connectivityReport(value: unknown): OpenAICodexConnectivityReport | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  if (typeof record['checkedAt'] !== 'number' || (record['mode'] !== 'direct' && record['mode'] !== 'proxy')
    || !Array.isArray(record['targets'])) return undefined
  const targets = record['targets'].map(targetResult)
  if (targets.some(target => target === undefined)) return undefined
  return {
    checkedAt: record['checkedAt'],
    mode: record['mode'],
    targets: targets as OpenAICodexConnectivityTargetResult[],
  }
}

function targetSignal(target: OpenAICodexConnectivityTargetResult): Signal {
  if (!target.reachable) return 'red'
  const status = target.statusCode
  return status !== undefined && status >= 200 && status < 300 ? 'green' : 'yellow'
}

function overallSignal(
  report: OpenAICodexConnectivityReport | undefined,
  requestError: string | undefined,
): Signal {
  if (requestError !== undefined) return 'red'
  const signals = report?.targets.map(targetSignal) ?? []
  if (signals.includes('red')) return 'red'
  if (signals.length === 0 || signals.includes('yellow')) return 'yellow'
  return 'green'
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), Math.max(low, high))
}

function rectOf(element: Element): Bounds {
  const rect = element.getBoundingClientRect()
  return {
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height,
  }
}

function clampPoint(point: Point, bounds: Bounds): Point {
  return {
    x: clamp(point.x, bounds.left + EDGE_GAP, bounds.right - BALL_SIZE - EDGE_GAP),
    y: clamp(point.y, bounds.top + EDGE_GAP, bounds.bottom - BALL_SIZE - EDGE_GAP),
  }
}

function storageKey(sessionKey: string): string {
  return `dsh-codex-connect.proxy-ball.${sessionKey}`
}

function readRatio(sessionKey: string): Point {
  if (typeof localStorage === 'undefined') return { x: 1, y: 0 }
  try {
    const value = JSON.parse(localStorage.getItem(storageKey(sessionKey)) ?? 'null') as unknown
    if (typeof value !== 'object' || value === null) return { x: 1, y: 0 }
    const record = value as Record<string, unknown>
    return typeof record['x'] === 'number' && typeof record['y'] === 'number'
      && record['x'] >= 0 && record['x'] <= 1 && record['y'] >= 0 && record['y'] <= 1
      ? { x: record['x'], y: record['y'] }
      : { x: 1, y: 0 }
  } catch {
    return { x: 1, y: 0 }
  }
}

function pointFromRatio(ratio: Point, bounds: Bounds): Point {
  const width = Math.max(0, bounds.width - BALL_SIZE - EDGE_GAP * 2)
  const height = Math.max(0, bounds.height - BALL_SIZE - EDGE_GAP * 2)
  return clampPoint({
    x: bounds.left + EDGE_GAP + ratio.x * width,
    y: bounds.top + EDGE_GAP + ratio.y * height,
  }, bounds)
}

function ratioFromPoint(point: Point, bounds: Bounds): Point {
  const width = Math.max(1, bounds.width - BALL_SIZE - EDGE_GAP * 2)
  const height = Math.max(1, bounds.height - BALL_SIZE - EDGE_GAP * 2)
  return {
    x: clamp((point.x - bounds.left - EDGE_GAP) / width, 0, 1),
    y: clamp((point.y - bounds.top - EDGE_GAP) / height, 0, 1),
  }
}

/** Show and poll only while this session is routed through OpenAI Codex. */
export function OpenAICodexProxyIndicator({
  directory,
  configScope,
  sessionKey,
  t,
}: OpenAICodexProxyIndicatorInjected & { t: Translate }) {
  const model = useSyncExternalStore(
    listener => directory.subscribe(listener),
    () => directory.getSnapshot(),
    () => directory.getSnapshot(),
  )
  const settings = useSyncExternalStore(
    listener => configScope.subscribe(listener),
    () => configScope.getSnapshot(),
    () => configScope.getSnapshot(),
  )
  const selected = model.status === 'ready' && model.current?.provider === 'openai-codex'
  const active = settings.value?.enableProxy === true
  const proxyUrl = settings.value?.proxyUrl
  const rootRef = useRef<HTMLDivElement>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout>>()
  const drag = useRef<DragState>()
  const positionRef = useRef<Point>({ x: EDGE_GAP, y: EDGE_GAP })
  const ratioRef = useRef<Point>(readRatio(sessionKey))
  const boundsRef = useRef<Bounds>()
  const [position, setPosition] = useState<Point>(positionRef.current)
  const [bounds, setBounds] = useState<Bounds>()
  const [expanded, setExpanded] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [hoveredTarget, setHoveredTarget] = useState<string>()
  const [report, setReport] = useState<OpenAICodexConnectivityReport>()
  const [connectivityError, setConnectivityError] = useState<string>()
  const [refreshRevision, setRefreshRevision] = useState(0)
  const [checking, setChecking] = useState(false)
  const popupId = useId()

  const updatePosition = (next: Point): void => {
    const currentBounds = boundsRef.current
    const clamped = currentBounds === undefined ? next : clampPoint(next, currentBounds)
    positionRef.current = clamped
    setPosition(clamped)
  }

  useEffect(() => {
    let boundary: Element | null = null
    let resizeObserver: ResizeObserver | undefined
    const resolveRoot = (): HTMLElement | null => {
      if (rootRef.current !== null) return rootRef.current
      return Array.from(document.querySelectorAll<HTMLElement>('[data-openai-codex-proxy-indicator]'))
        .find(candidate => candidate.dataset['openaiCodexProxySession'] === sessionKey) ?? null
    }
    const sync = (): void => {
      if (boundary === null) return
      const nextBounds = rectOf(boundary)
      boundsRef.current = nextBounds
      setBounds(nextBounds)
      updatePosition(pointFromRatio(ratioRef.current, nextBounds))
    }
    const resolveBoundary = (): void => {
      const nextBoundary = resolveRoot()?.closest('[data-conversation-scroll]') ?? null
      if (nextBoundary === boundary) return
      resizeObserver?.disconnect()
      resizeObserver = undefined
      boundary = nextBoundary
      if (boundary === null) return
      sync()
      resizeObserver = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(sync)
      resizeObserver?.observe(boundary)
    }
    resolveBoundary()
    const placementObserver = typeof MutationObserver === 'undefined'
      ? undefined
      : new MutationObserver(resolveBoundary)
    placementObserver?.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-conversation-scroll'],
      childList: true,
      subtree: true,
    })
    window.addEventListener('resize', sync)
    return () => {
      placementObserver?.disconnect()
      resizeObserver?.disconnect()
      window.removeEventListener('resize', sync)
    }
  }, [sessionKey])

  useEffect(() => () => {
    if (closeTimer.current !== undefined) clearTimeout(closeTimer.current)
  }, [])

  useEffect(() => {
    if (!selected) {
      setReport(undefined)
      setConnectivityError(undefined)
      setChecking(false)
      return
    }
    let stopped = false
    let inFlight = false
    let requestController: AbortController | undefined
    const refresh = async (): Promise<void> => {
      if (stopped || inFlight || (typeof document !== 'undefined' && document.visibilityState === 'hidden')) return
      inFlight = true
      requestController = new AbortController()
      setChecking(true)
      try {
        const response = await fetch(OPENAI_CODEX_CONNECTIVITY_PATH, {
          credentials: 'same-origin',
          headers: { accept: 'application/json' },
          signal: requestController.signal,
        })
        const next = response.ok ? connectivityReport(await response.json().catch(() => undefined)) : undefined
        if (next === undefined) throw new Error(`HTTP ${String(response.status)}`)
        if (!stopped) {
          setReport(next)
          setConnectivityError(undefined)
        }
      } catch (error: unknown) {
        if (!stopped && !requestController.signal.aborted) {
          setConnectivityError(error instanceof Error ? error.message : String(error))
        }
      } finally {
        inFlight = false
        if (!stopped) setChecking(false)
      }
    }
    void refresh()
    const timer = setInterval(() => { void refresh() }, OPENAI_CODEX_CONNECTIVITY_INTERVAL_MS)
    return () => {
      stopped = true
      clearInterval(timer)
      requestController?.abort()
    }
  }, [selected, active, proxyUrl, refreshRevision])

  if (!selected) return null

  const signal = overallSignal(report, connectivityError)
  const signalText = t(signal === 'green'
    ? 'connectivitySignalGreen'
    : signal === 'red'
      ? 'connectivitySignalRed'
      : 'connectivitySignalYellow')
  const panelWidth = Math.max(220, Math.min(400, (bounds?.width ?? 432) - EDGE_GAP * 2))
  const panelHeight = Math.max(220, Math.min(600, (bounds?.height ?? 632) - EDGE_GAP * 2))
  const openRight = bounds === undefined || position.x + panelWidth <= bounds.right - EDGE_GAP
  const openDown = bounds === undefined || position.y + BALL_SIZE + panelHeight <= bounds.bottom - EDGE_GAP

  const openPanel = (): void => {
    if (closeTimer.current !== undefined) clearTimeout(closeTimer.current)
    closeTimer.current = undefined
    setExpanded(true)
  }
  const closePanelLater = (): void => {
    if (closeTimer.current !== undefined) clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(() => {
      closeTimer.current = undefined
      if (!drag.current) setExpanded(false)
    }, OPENAI_CODEX_PROXY_CLOSE_DELAY_MS)
  }
  const leaveFocus = (event: FocusEvent<HTMLDivElement>): void => {
    if (event.currentTarget.contains(event.relatedTarget)) return
    closePanelLater()
  }

  const pointerDown = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    if (event.button !== 0) return
    openPanel()
    drag.current = {
      pointerId: event.pointerId,
      startClient: { x: event.clientX, y: event.clientY },
      startPosition: positionRef.current,
      moved: false,
    }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }
  const pointerMove = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    const current = drag.current
    if (current === undefined || current.pointerId !== event.pointerId) return
    const dx = event.clientX - current.startClient.x
    const dy = event.clientY - current.startClient.y
    if (!current.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return
    current.moved = true
    setDragging(true)
    updatePosition({ x: current.startPosition.x + dx, y: current.startPosition.y + dy })
    event.preventDefault()
  }
  const pointerUp = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    const current = drag.current
    if (current === undefined || current.pointerId !== event.pointerId) return
    event.currentTarget.releasePointerCapture?.(event.pointerId)
    drag.current = undefined
    setDragging(false)
    const currentBounds = boundsRef.current
    if (current.moved && currentBounds !== undefined) {
      const ratio = ratioFromPoint(positionRef.current, currentBounds)
      ratioRef.current = ratio
      try {
        localStorage.setItem(storageKey(sessionKey), JSON.stringify(ratio))
      } catch {
        // Browser storage failure only makes the position session-ephemeral.
      }
    }
  }

  const popupStyle: CSSProperties = {
    position: 'absolute',
    ...(openRight ? { left: 0 } : { right: 0 }),
    ...(openDown ? { top: BALL_SIZE + 10 } : { bottom: BALL_SIZE + 10 }),
    zIndex: 1,
    boxSizing: 'border-box',
    width: panelWidth,
    maxHeight: panelHeight,
    overflowY: 'auto',
    padding: 14,
    border: '1px solid var(--dsw-alias-border-l2)',
    borderRadius: openRight
      ? openDown ? '8px 22px 22px 22px' : '22px 22px 22px 8px'
      : openDown ? '22px 8px 22px 22px' : '22px 22px 8px 22px',
    background: 'var(--dsw-alias-bg-layer-1, #fff)',
    boxShadow: 'var(--dsw-shadow-lv2, 0 12px 36px rgb(0 0 0 / 20%))',
    color: 'var(--dsw-alias-label-primary)',
    transformOrigin: `${openRight ? 'left' : 'right'} ${openDown ? 'top' : 'bottom'}`,
    animation: 'openaiCodexProxyWaterDrop 280ms cubic-bezier(.2,.9,.2,1) both',
  }

  return (
    <div
      ref={rootRef}
      data-openai-codex-proxy-indicator={active ? 'active' : 'direct'}
      data-openai-codex-connectivity={signal}
      data-openai-codex-proxy-placement="session-floating"
      data-openai-codex-proxy-session={sessionKey}
      data-openai-codex-proxy-dragging={dragging || undefined}
      style={{
        display: 'inline-flex',
        position: 'fixed',
        top: position.y,
        left: position.x,
        zIndex: 1100,
        visibility: bounds === undefined ? 'hidden' : 'visible',
      }}
      onMouseEnter={openPanel}
      onMouseLeave={closePanelLater}
      onFocus={openPanel}
      onBlur={leaveFocus}
    >
      <style>{`
        @keyframes openaiCodexProxyWaterDrop {
          0% { opacity: 0; transform: scale(.12); filter: blur(3px); }
          58% { opacity: 1; transform: scale(1.035); filter: blur(0); }
          100% { opacity: 1; transform: scale(1); filter: blur(0); }
        }
      `}</style>
      <button
        type="button"
        aria-label={t('connectivityBallLabel', { summary: signalText })}
        aria-describedby={expanded ? popupId : undefined}
        data-openai-codex-proxy-signal={signal}
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onPointerCancel={pointerUp}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: BALL_SIZE,
          height: BALL_SIZE,
          padding: 0,
          border: '2px solid color-mix(in srgb, white 72%, transparent)',
          borderRadius: '50%',
          background: signalColors[signal],
          color: signal === 'yellow' ? '#3b3200' : '#fff',
          boxShadow: `0 3px 12px color-mix(in srgb, ${signalColors[signal]} 45%, transparent)`,
          font: 'inherit',
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: '.07em',
          cursor: dragging ? 'grabbing' : 'grab',
          touchAction: 'none',
          userSelect: 'none',
        }}
      >
        PROXY
      </button>
      {expanded ? (
        <div id={popupId} role="dialog" aria-label={t('proxyHeaderPopup')} style={popupStyle}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <strong style={{ display: 'block', fontSize: 14 }}>{t('connectivityHeading')}</strong>
              <span style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 4, color: 'var(--dsw-alias-label-secondary)', fontSize: 12 }}>
                <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: signalColors[signal] }} />
                {signalText} · {active ? t('proxyHeaderActive') : t('proxyHeaderDirect')}
              </span>
            </div>
            <button type="button" style={buttonStyle} disabled={checking} onClick={() => { setRefreshRevision(value => value + 1) }}>
              {checking ? t('connectivityRefreshing') : t('connectivityRefresh')}
            </button>
          </div>
          <div role="list" style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 12 }}>
            {report?.targets.map(target => {
              const targetState = targetSignal(target)
              const detailsVisible = hoveredTarget === target.id
              return (
                <div
                  key={target.id}
                  role="listitem"
                  tabIndex={0}
                  data-openai-codex-domain={target.hostname}
                  data-openai-codex-domain-signal={targetState}
                  onMouseEnter={() => { setHoveredTarget(target.id) }}
                  onMouseLeave={() => { setHoveredTarget(current => current === target.id ? undefined : current) }}
                  onFocus={() => { setHoveredTarget(target.id) }}
                  onBlur={() => { setHoveredTarget(current => current === target.id ? undefined : current) }}
                  style={{
                    padding: '8px 10px',
                    border: '1px solid var(--dsw-alias-border-l2)',
                    borderRadius: 10,
                    outline: 'none',
                    background: detailsVisible ? 'var(--dsw-alias-bg-layer-2)' : 'transparent',
                    transition: 'background 140ms ease',
                  }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 600 }}>
                    <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: '50%', background: signalColors[targetState], boxShadow: `0 0 0 3px color-mix(in srgb, ${signalColors[targetState]} 16%, transparent)` }} />
                    {target.hostname}
                  </span>
                  {detailsVisible ? (
                    <div
                      data-openai-codex-domain-details={target.id}
                      style={{
                        marginTop: 6,
                        color: targetState === 'red'
                          ? 'var(--dsw-alias-state-error-primary, #d92d20)'
                          : 'var(--dsw-alias-label-secondary)',
                        fontSize: 11,
                        lineHeight: '16px',
                        overflowWrap: 'anywhere',
                      }}
                    >
                      {target.reachable
                        ? t('connectivityReachable', { status: target.statusCode ?? '-', latency: target.latencyMs })
                        : target.error ?? t('connectivityUnreachable', { latency: target.latencyMs })}
                    </div>
                  ) : null}
                </div>
              )
            })}
            {connectivityError !== undefined ? (
              <div role="alert" style={{ color: 'var(--dsw-alias-state-error-primary, #d92d20)', fontSize: 12 }}>
                {t('connectivityRequestFailed', { error: connectivityError })}
              </div>
            ) : null}
          </div>
          <OpenAICodexProxyConfiguration scope={configScope} t={t} compact />
        </div>
      ) : null}
    </div>
  )
}
