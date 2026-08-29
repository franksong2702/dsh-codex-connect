/** Draggable session-local Codex proxy signal and water-drop configuration panel. */

import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import type {
  ChangeEvent,
  CSSProperties,
  FocusEvent,
  PointerEvent as ReactPointerEvent,
} from 'react'
import type { SettingsScope, SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { ModelDirectoryState } from '@deepseek-ai/dsh-client-ui-model-selection/client'
import { OPENAI_CODEX_CONNECTIVITY_PATH } from '../proxy-paths.ts'
import {
  OPENAI_CODEX_AUTH_ACCOUNTS_PATH,
  OPENAI_CODEX_AUTH_LOGIN_PATH,
} from '../auth-paths.ts'
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

interface AccountSummary {
  accountId: string
  active: boolean
  expires: number
}

interface AccountsResponse {
  accounts: AccountSummary[]
}

export const OPENAI_CODEX_CONNECTIVITY_INTERVAL_MS = 3_000
export const OPENAI_CODEX_PROXY_CLOSE_DELAY_MS = 1_000

const BALL_SIZE = 54
const FLOW_LIGHT_GAP = 5
const FLOW_LIGHT_HEIGHT = 12
const INDICATOR_HEIGHT = BALL_SIZE + FLOW_LIGHT_GAP + FLOW_LIGHT_HEIGHT
const EDGE_GAP = 16
const DRAG_THRESHOLD = 4
const CONNECTIVITY_LIGHTS = [
  { id: 'codex-api', hostname: 'chatgpt.com' },
  { id: 'oauth', hostname: 'auth.openai.com' },
  { id: 'openai-api', hostname: 'api.openai.com' },
] as const

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
  minHeight: 32,
  padding: '5px 10px',
  border: '1px solid var(--dsw-alias-border-l2)',
  borderRadius: 9,
  background: 'var(--dsw-alias-bg-layer-2)',
  color: 'var(--dsw-alias-label-primary)',
  font: 'inherit',
  fontSize: 12,
  fontWeight: 550,
  cursor: 'pointer',
}

function accountsResponse(value: unknown): AccountsResponse | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const raw = (value as Record<string, unknown>)['accounts']
  if (!Array.isArray(raw)) return undefined
  const accounts: AccountSummary[] = []
  for (const item of raw) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) return undefined
    const record = item as Record<string, unknown>
    if (typeof record['accountId'] !== 'string' || typeof record['active'] !== 'boolean'
      || typeof record['expires'] !== 'number') return undefined
    accounts.push({
      accountId: record['accountId'],
      active: record['active'],
      expires: record['expires'],
    })
  }
  return { accounts }
}

function accountSuffix(accountId: string): string {
  return accountId.length <= 6 ? accountId : accountId.slice(-6)
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
  return target.reachable ? 'green' : 'red'
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
    y: clamp(point.y, bounds.top + EDGE_GAP, bounds.bottom - INDICATOR_HEIGHT - EDGE_GAP),
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
  const height = Math.max(0, bounds.height - INDICATOR_HEIGHT - EDGE_GAP * 2)
  return clampPoint({
    x: bounds.left + EDGE_GAP + ratio.x * width,
    y: bounds.top + EDGE_GAP + ratio.y * height,
  }, bounds)
}

function ratioFromPoint(point: Point, bounds: Bounds): Point {
  const width = Math.max(1, bounds.width - BALL_SIZE - EDGE_GAP * 2)
  const height = Math.max(1, bounds.height - INDICATOR_HEIGHT - EDGE_GAP * 2)
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
  const [accounts, setAccounts] = useState<AccountSummary[]>([])
  const [accountBusy, setAccountBusy] = useState(false)
  const [accountError, setAccountError] = useState<string>()
  const [accountNotice, setAccountNotice] = useState<string>()
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

  useEffect(() => {
    if (!selected || !expanded) return
    let stopped = false
    let controller: AbortController | undefined
    const refreshAccounts = async (): Promise<void> => {
      controller?.abort()
      controller = new AbortController()
      try {
        const response = await fetch(OPENAI_CODEX_AUTH_ACCOUNTS_PATH, {
          credentials: 'same-origin',
          headers: { accept: 'application/json' },
          signal: controller.signal,
        })
        const next = response.ok ? accountsResponse(await response.json().catch(() => undefined)) : undefined
        if (next === undefined) throw new Error(`HTTP ${String(response.status)}`)
        if (!stopped) {
          setAccounts(next.accounts)
          setAccountError(undefined)
        }
      } catch (error: unknown) {
        if (!stopped && controller.signal.aborted !== true) {
          setAccountError(error instanceof Error ? error.message : String(error))
        }
      }
    }
    void refreshAccounts()
    const timer = setInterval(() => { void refreshAccounts() }, OPENAI_CODEX_CONNECTIVITY_INTERVAL_MS)
    return () => {
      stopped = true
      clearInterval(timer)
      controller?.abort()
    }
  }, [selected, expanded])

  const switchAccount = async (event: ChangeEvent<HTMLSelectElement>): Promise<void> => {
    const accountId = event.currentTarget.value
    if (accountId.length === 0 || accounts.some(account => account.accountId === accountId) === false) return
    setAccountBusy(true)
    setAccountError(undefined)
    setAccountNotice(undefined)
    try {
      const response = await fetch(OPENAI_CODEX_AUTH_ACCOUNTS_PATH, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ accountId }),
      })
      const next = response.ok ? accountsResponse(await response.json().catch(() => undefined)) : undefined
      if (next === undefined) throw new Error(`HTTP ${String(response.status)}`)
      setAccounts(next.accounts)
      setAccountNotice(t('accountSwitched'))
    } catch (error: unknown) {
      setAccountError(error instanceof Error ? error.message : String(error))
    } finally {
      setAccountBusy(false)
    }
  }

  const addAccount = async (): Promise<void> => {
    const popup = window.open('about:blank', '_blank')
    if (popup !== null) popup.opener = null
    setAccountBusy(true)
    setAccountError(undefined)
    setAccountNotice(undefined)
    try {
      const response = await fetch(OPENAI_CODEX_AUTH_LOGIN_PATH, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { accept: 'application/json' },
      })
      const value: unknown = await response.json().catch(() => undefined)
      const url = typeof value === 'object' && value !== null && typeof (value as Record<string, unknown>)['url'] === 'string'
        ? (value as Record<string, string>)['url']
        : undefined
      if (!response.ok || url === undefined) throw new Error(`HTTP ${String(response.status)}`)
      if (popup === null) throw new Error(t('accountPopupBlocked'))
      popup.location.replace(url)
      setAccountNotice(t('accountAuthorizationOpened'))
    } catch (error: unknown) {
      popup?.close()
      setAccountError(error instanceof Error ? error.message : String(error))
    } finally {
      setAccountBusy(false)
    }
  }

  if (!selected) return null

  const signal = overallSignal(report, connectivityError)
  const signalText = t(signal === 'green'
    ? 'connectivitySignalGreen'
    : signal === 'red'
      ? 'connectivitySignalRed'
      : 'connectivitySignalYellow')
  const detailTarget = report?.targets.find(target => target.id === hoveredTarget)
  const panelWidth = Math.max(260, Math.min(420, (bounds?.width ?? 452) - EDGE_GAP * 2))
  const panelHeight = Math.max(220, Math.min(600, (bounds?.height ?? 632) - EDGE_GAP * 2))
  const openRight = bounds === undefined || position.x + panelWidth <= bounds.right - EDGE_GAP
  const openDown = bounds === undefined || position.y + INDICATOR_HEIGHT + panelHeight <= bounds.bottom - EDGE_GAP

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
    ...(openDown ? { top: INDICATOR_HEIGHT + 10 } : { bottom: INDICATOR_HEIGHT + 10 }),
    zIndex: 1,
    boxSizing: 'border-box',
    width: panelWidth,
    maxHeight: panelHeight,
    overflowY: 'auto',
    padding: 16,
    border: '1px solid var(--dsw-alias-border-l2)',
    borderRadius: 18,
    background: 'color-mix(in srgb, var(--dsw-alias-bg-layer-1, #fff) 94%, transparent)',
    backdropFilter: 'blur(18px) saturate(1.15)',
    boxShadow: '0 22px 58px rgb(0 0 0 / 24%), 0 2px 8px rgb(0 0 0 / 10%)',
    color: 'var(--dsw-alias-label-primary)',
    transformOrigin: `${openRight ? 'left' : 'right'} ${openDown ? 'top' : 'bottom'}`,
    animation: 'openaiCodexProxyPanelEnter 220ms cubic-bezier(.2,.8,.2,1) both',
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
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        width: BALL_SIZE,
        height: INDICATOR_HEIGHT,
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
        @keyframes openaiCodexProxyPanelEnter {
          0% { opacity: 0; transform: translateY(${openDown ? '-6px' : '6px'}) scale(.975); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes openaiCodexProxyOrbDrift {
          0% { transform: translate3d(-5%, -3%, 0) rotate(0deg) scale(1); }
          50% { transform: translate3d(4%, 2%, 0) rotate(170deg) scale(1.08); }
          100% { transform: translate3d(-2%, 4%, 0) rotate(360deg) scale(1.02); }
        }
        @keyframes openaiCodexProxyOrbScan {
          to { transform: rotate(360deg); }
        }
        [data-openai-codex-proxy-flow="water"] {
          transition: transform 200ms cubic-bezier(.2,.8,.2,1), box-shadow 200ms ease, border-color 200ms ease, background-color 200ms ease;
        }
        [data-openai-codex-proxy-flow="water"]:hover {
          transform: translateY(-2px);
          border-color: color-mix(in srgb, #38bdf8 62%, var(--dsw-alias-border-l2)) !important;
          box-shadow: 0 10px 25px rgb(2 132 199 / 24%), 0 3px 8px rgb(0 0 0 / 15%), inset 0 1px 0 rgb(255 255 255 / 44%) !important;
        }
        [data-openai-codex-proxy-dragging="true"] [data-openai-codex-proxy-flow="water"] {
          transform: scale(.96);
          box-shadow: 0 4px 12px rgb(0 0 0 / 18%), inset 0 1px 0 rgb(255 255 255 / 34%) !important;
        }
        [data-openai-codex-orb-layer="aurora"] {
          animation: openaiCodexProxyOrbDrift 6.4s cubic-bezier(.45,.05,.55,.95) infinite;
        }
        [data-openai-codex-orb-checking="true"] [data-openai-codex-orb-layer="scan"] {
          animation: openaiCodexProxyOrbScan 1.25s linear infinite;
        }
        [data-openai-codex-proxy-flow="water"]:focus-visible,
        [data-openai-codex-proxy-popup] button:focus-visible,
        [data-openai-codex-proxy-popup] select:focus-visible,
        [data-openai-codex-domain]:focus-visible {
          outline: 2px solid color-mix(in srgb, var(--dsw-alias-brand-primary) 76%, white) !important;
          outline-offset: 3px;
        }
        [data-openai-codex-proxy-popup] button {
          transition: border-color 180ms ease, background-color 180ms ease, transform 180ms ease;
        }
        [data-openai-codex-proxy-popup] button:not(:disabled):hover {
          border-color: color-mix(in srgb, var(--dsw-alias-brand-primary) 56%, var(--dsw-alias-border-l2));
          transform: translateY(-1px);
        }
        [data-openai-codex-proxy-popup]::-webkit-scrollbar { width: 8px; }
        [data-openai-codex-proxy-popup]::-webkit-scrollbar-thumb {
          border: 2px solid transparent;
          border-radius: 999px;
          background: color-mix(in srgb, var(--dsw-alias-label-tertiary) 42%, transparent);
          background-clip: padding-box;
        }
        @media (prefers-reduced-motion: reduce) {
          [data-openai-codex-proxy-indicator] *,
          [data-openai-codex-proxy-popup] { animation: none !important; transition: none !important; }
          [data-openai-codex-proxy-flow="water"]:hover,
          [data-openai-codex-proxy-popup] button:not(:disabled):hover { transform: none; }
        }
      `}</style>
      <button
        type="button"
        aria-label={t('connectivityBallLabel', { summary: signalText })}
        aria-describedby={expanded ? popupId : undefined}
        aria-controls={popupId}
        aria-expanded={expanded}
        data-openai-codex-proxy-flow="water"
        data-openai-codex-orb-checking={checking}
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
          border: '1px solid color-mix(in srgb, #38bdf8 34%, var(--dsw-alias-border-l2))',
          borderRadius: '50%',
          overflow: 'visible',
          position: 'relative',
          background: 'color-mix(in srgb, var(--dsw-alias-bg-layer-1, #fff) 92%, transparent)',
          backdropFilter: 'blur(12px) saturate(1.15)',
          color: '#fff',
          boxShadow: '0 7px 20px rgb(2 132 199 / 17%), 0 2px 6px rgb(0 0 0 / 14%), inset 0 1px 0 rgb(255 255 255 / 40%)',
          font: 'inherit',
          cursor: dragging ? 'grabbing' : 'grab',
          touchAction: 'none',
          userSelect: 'none',
        }}
      >
        <span
          aria-hidden="true"
          data-openai-codex-orb-shell="gradient"
          style={{
            position: 'absolute',
            inset: 5,
            overflow: 'hidden',
            borderRadius: '50%',
            background: 'radial-gradient(circle at 35% 26%, #7dd3fc 0%, #2563eb 34%, #312e81 72%, #172554 100%)',
            boxShadow: 'inset 0 1px 3px rgb(255 255 255 / 45%), inset 0 -4px 8px rgb(10 18 68 / 34%)',
          }}
        >
          <span
            data-openai-codex-orb-layer="aurora"
            style={{
              position: 'absolute',
              inset: '-38%',
              borderRadius: '43% 57% 52% 48%',
              background: 'conic-gradient(from 20deg, #22d3ee 0deg, #2563eb 92deg, #a855f7 176deg, #0ea5e9 264deg, #22d3ee 360deg)',
              filter: 'blur(4px) saturate(1.22)',
              mixBlendMode: 'screen',
              opacity: .88,
            }}
          />
          <span aria-hidden="true" style={{ position: 'absolute', inset: 0, borderRadius: 'inherit', background: 'radial-gradient(circle at 29% 20%, rgb(255 255 255 / 82%) 0 3%, rgb(255 255 255 / 20%) 12%, transparent 31%), radial-gradient(circle at 72% 78%, rgb(167 139 250 / 56%) 0%, transparent 52%)' }} />
        </span>
        <span
          aria-hidden="true"
          data-openai-codex-orb-layer="scan"
          style={{
            position: 'absolute',
            inset: 2,
            borderRadius: '50%',
            background: 'conic-gradient(from 0deg, transparent 0 68%, #67e8f9 82%, transparent 96%)',
            WebkitMask: 'radial-gradient(farthest-side, transparent calc(100% - 2px), #000 0)',
            mask: 'radial-gradient(farthest-side, transparent calc(100% - 2px), #000 0)',
            opacity: checking ? .9 : 0,
            transition: 'opacity 160ms ease',
          }}
        />
        <span aria-hidden="true" style={{ position: 'absolute', zIndex: 2, top: 16, left: 17, display: 'grid', placeItems: 'center', width: 20, height: 20, border: '1px solid rgb(255 255 255 / 20%)', borderRadius: 7, background: 'rgb(5 15 38 / 25%)', boxShadow: '0 2px 7px rgb(3 7 24 / 20%)', backdropFilter: 'blur(3px)' }}>
          <svg viewBox="0 0 20 20" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M8.1 12.1 6.6 13.6a2.8 2.8 0 0 1-4-4l2.3-2.3a2.8 2.8 0 0 1 4 0M11.9 7.9l1.5-1.5a2.8 2.8 0 1 1 4 4l-2.3 2.3a2.8 2.8 0 0 1-4 0M7.2 10h5.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <span style={{ position: 'absolute', zIndex: 3, left: '50%', bottom: 2, minWidth: 39, boxSizing: 'border-box', padding: '2px 5px 1px', border: '1px solid rgb(255 255 255 / 20%)', borderRadius: 999, background: 'rgb(4 12 31 / 76%)', boxShadow: '0 2px 6px rgb(0 0 0 / 22%)', color: '#f8fafc', fontSize: 8, fontWeight: 750, lineHeight: '10px', letterSpacing: '.08em', textAlign: 'center', textShadow: '0 1px 2px rgb(0 0 0 / 42%)', transform: 'translateX(-50%)' }}>PROXY</span>
      </button>
      <div
        role="list"
        aria-label={signalText}
        data-openai-codex-flow-lights="three-domains"
        style={{ boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, width: 38, height: FLOW_LIGHT_HEIGHT, marginTop: FLOW_LIGHT_GAP, padding: '3px 5px', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 999, background: 'color-mix(in srgb, var(--dsw-alias-bg-layer-1, #fff) 92%, transparent)', boxShadow: '0 3px 9px rgb(0 0 0 / 13%), inset 0 1px 0 rgb(255 255 255 / 32%)', backdropFilter: 'blur(8px)' }}
      >
        {CONNECTIVITY_LIGHTS.map(light => {
          const target = report?.targets.find(candidate => candidate.id === light.id)
          const lightSignal: Signal = connectivityError !== undefined
            ? 'red'
            : target === undefined ? 'yellow' : targetSignal(target)
          const color = signalColors[lightSignal]
          return (
            <span
              key={light.id}
              role="listitem"
              aria-label={`${light.hostname}: ${lightSignal}`}
              title={`${light.hostname}: ${lightSignal}`}
              data-openai-codex-flow-light={light.hostname}
              data-openai-codex-flow-light-signal={lightSignal}
              style={{
                width: 6,
                height: 4,
                borderRadius: 999,
                background: `linear-gradient(90deg, color-mix(in srgb, ${color} 70%, transparent), ${color})`,
                boxShadow: `0 0 6px color-mix(in srgb, ${color} 58%, transparent)`,
              }}
            />
          )
        })}
      </div>
      {expanded ? (
        <div id={popupId} role="dialog" aria-label={t('proxyHeaderPopup')} data-openai-codex-proxy-popup="status-and-settings" style={popupStyle}>
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              ...(openDown ? { top: -5 } : { bottom: -5 }),
              ...(openRight ? { left: 21 } : { right: 21 }),
              width: 9,
              height: 9,
              borderTop: openDown ? '1px solid var(--dsw-alias-border-l2)' : undefined,
              borderLeft: openRight ? '1px solid var(--dsw-alias-border-l2)' : undefined,
              borderRight: !openRight ? '1px solid var(--dsw-alias-border-l2)' : undefined,
              borderBottom: !openDown ? '1px solid var(--dsw-alias-border-l2)' : undefined,
              background: 'var(--dsw-alias-bg-layer-1, #fff)',
              transform: 'rotate(45deg)',
            }}
          />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <span aria-hidden="true" style={{ display: 'inline-grid', flex: '0 0 auto', placeItems: 'center', width: 34, height: 34, borderRadius: 11, background: 'linear-gradient(145deg, color-mix(in srgb, var(--dsw-alias-brand-primary) 24%, transparent), color-mix(in srgb, #38bdf8 13%, transparent))', color: 'var(--dsw-alias-brand-primary)' }}>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
                  <path d="M7 8.5h10M7 15.5h10M9.5 5.5 7 8.5l2.5 3M14.5 12.5l2.5 3-2.5 3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <div style={{ minWidth: 0 }}>
                <strong style={{ display: 'block', fontSize: 14, lineHeight: '20px' }}>{t('connectivityHeading')}</strong>
                <span style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 3, color: 'var(--dsw-alias-label-secondary)', fontSize: 11, lineHeight: '16px' }}>
                  <span aria-hidden="true" style={{ flex: '0 0 auto', width: 7, height: 7, borderRadius: '50%', background: signalColors[signal], boxShadow: `0 0 0 3px color-mix(in srgb, ${signalColors[signal]} 14%, transparent)` }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{signalText} · {active ? t('proxyHeaderActive') : t('proxyHeaderDirect')}</span>
                </span>
              </div>
            </div>
            <button type="button" style={{ ...buttonStyle, display: 'inline-flex', alignItems: 'center', gap: 6, flex: '0 0 auto' }} disabled={checking} onClick={() => { setRefreshRevision(value => value + 1) }}>
              <svg viewBox="0 0 20 20" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
                <path d="M15.8 7A6.2 6.2 0 1 0 16 12" strokeLinecap="round" />
                <path d="M12.8 3.8h3.5v3.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {checking ? t('connectivityRefreshing') : t('connectivityRefresh')}
            </button>
          </div>
          <section
            aria-labelledby={`${popupId}-accounts`}
            data-openai-codex-account-switcher="oauth-credentials"
            style={{
              marginTop: 14,
              padding: 10,
              border: '1px solid var(--dsw-alias-border-l2)',
              borderRadius: 14,
              background: 'color-mix(in srgb, var(--dsw-alias-bg-layer-2) 62%, transparent)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <strong id={`${popupId}-accounts`} style={{ display: 'block', fontSize: 12, lineHeight: '17px' }}>
                  {t('accountSwitcherHeading')}
                </strong>
                <span style={{ display: 'block', marginTop: 2, color: 'var(--dsw-alias-label-tertiary)', fontSize: 10, lineHeight: '14px' }}>
                  {t('accountSwitcherHelp')}
                </span>
              </div>
              <button
                type="button"
                disabled={accountBusy}
                onClick={() => { void addAccount() }}
                style={{ ...buttonStyle, flex: '0 0 auto', minHeight: 28, padding: '3px 8px', fontSize: 11 }}
              >
                {accountBusy ? t('accountWorking') : t('accountAdd')}
              </button>
            </div>
            <select
              aria-label={t('accountSelectLabel')}
              value={accounts.find(account => account.active)?.accountId ?? ''}
              disabled={accountBusy || accounts.length === 0}
              onChange={(event) => { void switchAccount(event) }}
              style={{
                boxSizing: 'border-box',
                width: '100%',
                minHeight: 34,
                marginTop: 9,
                padding: '5px 30px 5px 9px',
                border: '1px solid var(--dsw-alias-border-l2)',
                borderRadius: 9,
                background: 'var(--dsw-alias-bg-layer-1)',
                color: 'var(--dsw-alias-label-primary)',
                font: 'inherit',
                fontSize: 12,
                cursor: accounts.length === 0 ? 'not-allowed' : 'pointer',
              }}
            >
              {accounts.length === 0 ? <option value="">{t('accountUnavailable')}</option> : null}
              {accounts.map((account, index) => (
                <option key={account.accountId} value={account.accountId}>
                  {t('accountOption', { index: index + 1, suffix: accountSuffix(account.accountId) })}
                </option>
              ))}
            </select>
            {accountNotice !== undefined ? (
              <div role="status" style={{ marginTop: 6, color: 'var(--dsw-alias-state-success-primary, #16a34a)', fontSize: 10, lineHeight: '14px' }}>
                {accountNotice}
              </div>
            ) : null}
            {accountError !== undefined ? (
              <div role="alert" style={{ marginTop: 6, color: 'var(--dsw-alias-state-error-primary, #d92d20)', fontSize: 10, lineHeight: '14px', overflowWrap: 'anywhere' }}>
                {t('accountActionFailed', { error: accountError })}
              </div>
            ) : null}
          </section>
          <div
            style={{
              marginTop: 14,
              padding: 9,
              border: '1px solid var(--dsw-alias-border-l2)',
              borderRadius: 14,
              background: 'color-mix(in srgb, var(--dsw-alias-bg-layer-2) 62%, transparent)',
            }}
          >
          <div role="list" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
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
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                    minHeight: 34,
                    padding: '4px 7px 4px 9px',
                    border: '1px solid transparent',
                    borderRadius: 9,
                    background: detailsVisible ? 'var(--dsw-alias-bg-layer-1)' : 'transparent',
                    boxShadow: detailsVisible ? '0 1px 5px rgb(0 0 0 / 7%)' : 'none',
                    transition: 'background 160ms ease, border-color 160ms ease, box-shadow 160ms ease',
                  }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9, minWidth: 0, fontSize: 12, fontWeight: 600 }}>
                    <span aria-hidden="true" style={{ flex: '0 0 auto', width: 8, height: 8, borderRadius: '50%', background: signalColors[targetState], boxShadow: `0 0 0 3px color-mix(in srgb, ${signalColors[targetState]} 14%, transparent)` }} />
                    {target.hostname}
                  </span>
                  <span aria-hidden="true" style={{ flex: '0 0 auto', width: 22, height: 5, borderRadius: 999, background: `linear-gradient(90deg, color-mix(in srgb, ${signalColors[targetState]} 25%, transparent), ${signalColors[targetState]})`, boxShadow: `0 0 7px color-mix(in srgb, ${signalColors[targetState]} 48%, transparent)` }} />
                </div>
              )
            })}
          </div>
          {detailTarget !== undefined ? (
            <div
              data-openai-codex-domain-details={detailTarget.id}
              style={{
                marginTop: 8,
                padding: '8px 9px',
                borderRadius: 9,
                background: 'var(--dsw-alias-bg-layer-1)',
                color: detailTarget.reachable ? 'var(--dsw-alias-label-secondary)' : 'var(--dsw-alias-state-error-primary, #d92d20)',
                fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace',
                fontSize: 11,
                lineHeight: '16px',
                overflowWrap: 'anywhere',
              }}
            >
              {detailTarget.reachable
                ? t('connectivityReachable', { latency: detailTarget.latencyMs })
                : detailTarget.error ?? t('connectivityUnreachable', { latency: detailTarget.latencyMs })}
            </div>
          ) : null}
          {connectivityError !== undefined ? (
            <div role="alert" style={{ marginTop: 8, padding: '8px 9px', borderRadius: 9, background: 'color-mix(in srgb, var(--dsw-alias-state-error-primary, #d92d20) 9%, transparent)', color: 'var(--dsw-alias-state-error-primary, #d92d20)', fontSize: 11, lineHeight: '16px', overflowWrap: 'anywhere' }}>
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
