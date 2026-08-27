// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SettingsScope, SettingsScopeSnapshot, SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { ModelDirectoryState } from '@deepseek-ai/dsh-client-ui-model-selection/client'
import {
  OPENAI_CODEX_CONNECTIVITY_INTERVAL_MS,
  OPENAI_CODEX_PROXY_CLOSE_DELAY_MS,
  OpenAICodexProxyIndicator,
} from '../src/client/OpenAICodexProxyIndicator.tsx'
import { en } from '../src/client/locales.ts'
import type { OpenAICodexSettingsKey } from '../src/client/locales.ts'
import { DEFAULT_OPENAI_CODEX_SETTINGS } from '../src/settings-contract.ts'
import type { OpenAICodexSettingsConfig } from '../src/settings-contract.ts'
import { OPENAI_CODEX_CONNECTIVITY_PATH } from '../src/proxy-paths.ts'

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } })
}

function requestPath(input: string | URL | Request): string {
  return typeof input === 'string' ? input : input instanceof URL ? input.pathname : new URL(input.url).pathname
}

function t(key: OpenAICodexSettingsKey, params: Record<string, unknown> = {}): string {
  return Object.entries(params).reduce(
    (value, [name, replacement]) => value.replace(`{${name}}`, String(replacement)),
    en[key],
  )
}

function directoryStore(provider = 'openai-codex'): SnapshotStore<ModelDirectoryState> {
  const listeners = new Set<() => void>()
  let snapshot: ModelDirectoryState = {
    current: { provider, model: 'gpt-5.6-sol' },
    routable: true,
    groups: [],
    failures: [],
    status: 'ready',
    error: null,
  }
  return {
    getSnapshot: () => snapshot,
    subscribe: listener => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    update: () => undefined,
    set: next => {
      snapshot = next
      listeners.forEach(listener => { listener() })
    },
  }
}

function settingsScope(): {
  scope: SettingsScope<OpenAICodexSettingsConfig>
  set: ReturnType<typeof vi.fn>
} {
  let snapshot: SettingsScopeSnapshot<OpenAICodexSettingsConfig> = {
    status: 'ready',
    value: {
      ...DEFAULT_OPENAI_CODEX_SETTINGS,
      enableProxy: true,
      proxyUrl: 'http://127.0.0.1:7890',
    },
    base: { ...DEFAULT_OPENAI_CODEX_SETTINGS },
    user: undefined,
    revision: 0,
    writable: true,
    mode: 'host',
  }
  const listeners = new Set<() => void>()
  const set = vi.fn(async (field: string, value: unknown) => {
    snapshot = {
      ...snapshot,
      value: { ...snapshot.value, [field]: value } as OpenAICodexSettingsConfig,
      revision: (snapshot.revision ?? 0) + 1,
    }
    listeners.forEach(listener => { listener() })
  })
  const scope: SettingsScope<OpenAICodexSettingsConfig> = {
    getSnapshot() {
      if (this !== scope) throw new TypeError('SettingsScope.getSnapshot lost its receiver')
      return snapshot
    },
    subscribe(listener) {
      if (this !== scope) throw new TypeError('SettingsScope.subscribe lost its receiver')
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    set,
    unset: vi.fn(async () => undefined),
  }
  return {
    set,
    scope,
  }
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('OpenAI Codex session proxy indicator', () => {
  it('shows live domain failures, keeps the popup interactive, and switches immediately to direct mode', async () => {
    const report = {
      checkedAt: Date.now(),
      mode: 'proxy',
      targets: [
        { id: 'codex-api', hostname: 'chatgpt.com', reachable: true, latencyMs: 18, statusCode: 401 },
        { id: 'oauth', hostname: 'auth.openai.com', reachable: false, latencyMs: 2500, error: 'ECONNREFUSED: proxy tunnel failed' },
        { id: 'openai-api', hostname: 'api.openai.com', reachable: true, latencyMs: 31, statusCode: 200 },
      ],
    }
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      expect(requestPath(input)).toBe(OPENAI_CODEX_CONNECTIVITY_PATH)
      return json(report)
    })
    vi.stubGlobal('fetch', fetchMock)
    const { scope, set } = settingsScope()
    render(
      <div data-conversation-scroll="">
        <OpenAICodexProxyIndicator directory={directoryStore()} configScope={scope} sessionKey="session-test" t={t} />
      </div>,
    )

    expect(OPENAI_CODEX_CONNECTIVITY_INTERVAL_MS).toBe(3_000)
    await waitFor(() => { expect(fetchMock).toHaveBeenCalledOnce() })
    const trigger = await screen.findByRole('button', { name: en.connectivityBallLabel.replace('{summary}', en.connectivitySignalRed) })
    expect(document.querySelector('[data-openai-codex-proxy-indicator="active"]')).toBeTruthy()
    expect(document.querySelector('[data-openai-codex-connectivity="red"]')).toBeTruthy()
    expect(trigger.textContent).toBe('PROXY')
    expect(screen.queryByRole('dialog')).toBeNull()

    fireEvent.mouseEnter(trigger)
    const popup = await screen.findByRole('dialog', { name: en.proxyHeaderPopup })
    expect(popup.textContent).toContain('http://127.0.0.1:7890')
    expect(popup.textContent).toContain('chatgpt.com')
    expect(popup.textContent).toContain('auth.openai.com')
    expect(popup.textContent).not.toContain('ECONNREFUSED: proxy tunnel failed')
    expect(document.querySelector('[data-openai-codex-domain="chatgpt.com"]')?.getAttribute('data-openai-codex-domain-signal')).toBe('yellow')
    expect(document.querySelector('[data-openai-codex-domain="auth.openai.com"]')?.getAttribute('data-openai-codex-domain-signal')).toBe('red')
    expect(document.querySelector('[data-openai-codex-domain="api.openai.com"]')?.getAttribute('data-openai-codex-domain-signal')).toBe('green')
    fireEvent.mouseEnter(screen.getByText('auth.openai.com'))
    expect(popup.textContent).toContain('ECONNREFUSED: proxy tunnel failed')
    expect(screen.getByRole('button', { name: en.connectivityRefresh })).toBeTruthy()
    expect(screen.getByRole('button', { name: en.proxyDetect })).toBeTruthy()
    expect(screen.getByRole('button', { name: en.proxyTest })).toBeTruthy()
    expect(screen.getByRole('button', { name: en.proxyActivate })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: en.connectivityRefresh }))
    await waitFor(() => { expect(fetchMock).toHaveBeenCalledTimes(2) })

    fireEvent.click(screen.getByRole('button', { name: en.proxyDisable }))
    await waitFor(() => { expect(set).toHaveBeenCalledWith('enableProxy', false) })
    expect(document.querySelector('[data-openai-codex-proxy-indicator="direct"]')).toBeTruthy()
    expect(popup.textContent).toContain(en.proxyHeaderDirect)
  })

  it('does not render outside an OpenAI Codex conversation', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { scope } = settingsScope()
    render(<OpenAICodexProxyIndicator directory={directoryStore('openai')} configScope={scope} sessionKey="session-other" t={t} />)
    expect(document.querySelector('[data-openai-codex-proxy-indicator]')).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('stops monitoring and removes the ball when the session switches adapters', async () => {
    let signal: AbortSignal | undefined
    const fetchMock = vi.fn((_input: string | URL | Request, init?: RequestInit) => {
      signal = init?.signal instanceof AbortSignal ? init.signal : undefined
      return new Promise<Response>(() => {})
    })
    vi.stubGlobal('fetch', fetchMock)
    const { scope } = settingsScope()
    const directory = directoryStore()
    render(<OpenAICodexProxyIndicator directory={directory} configScope={scope} sessionKey="session-switch" t={t} />)
    await waitFor(() => { expect(fetchMock).toHaveBeenCalledOnce() })

    directory.set({
      current: { provider: 'deepseek', model: 'deepseek-chat' },
      routable: true,
      groups: [],
      failures: [],
      status: 'ready',
      error: null,
    })

    await waitFor(() => { expect(document.querySelector('[data-openai-codex-proxy-indicator]')).toBeNull() })
    expect(signal?.aborted).toBe(true)
  })

  it('keeps the water-drop panel open for one second after pointer leave', () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})))
    const { scope } = settingsScope()
    render(
      <div data-conversation-scroll="">
        <OpenAICodexProxyIndicator directory={directoryStore()} configScope={scope} sessionKey="session-sticky" t={t} />
      </div>,
    )
    const trigger = screen.getByRole('button', { name: en.connectivityBallLabel.replace('{summary}', en.connectivitySignalYellow) })

    fireEvent.mouseEnter(trigger)
    expect(screen.getByRole('dialog', { name: en.proxyHeaderPopup })).toBeTruthy()
    fireEvent.mouseLeave(trigger.closest('[data-openai-codex-proxy-indicator]')!)
    act(() => { vi.advanceTimersByTime(OPENAI_CODEX_PROXY_CLOSE_DELAY_MS - 1) })
    expect(screen.getByRole('dialog', { name: en.proxyHeaderPopup })).toBeTruthy()
    act(() => { vi.advanceTimersByTime(1) })
    expect(screen.queryByRole('dialog', { name: en.proxyHeaderPopup })).toBeNull()
  })

  it('clamps dragging to the current conversation and saves a session-relative position', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})))
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      if (this.hasAttribute('data-conversation-scroll')) {
        return {
          x: 280, y: 40, left: 280, top: 40, right: 780, bottom: 440,
          width: 500, height: 400, toJSON: () => undefined,
        } as DOMRect
      }
      return {
        x: 0, y: 0, left: 0, top: 0, right: 0, bottom: 0,
        width: 0, height: 0, toJSON: () => undefined,
      } as DOMRect
    })
    const { scope } = settingsScope()
    render(
      <div data-conversation-scroll="">
        <OpenAICodexProxyIndicator directory={directoryStore()} configScope={scope} sessionKey="session-drag" t={t} />
      </div>,
    )
    const trigger = screen.getByText('PROXY')
    const root = trigger.closest<HTMLElement>('[data-openai-codex-proxy-indicator]')!
    expect(root.style.left).toBe('710px')
    expect(root.style.top).toBe('56px')

    fireEvent.pointerDown(trigger, { pointerId: 1, button: 0, clientX: 730, clientY: 76 })
    fireEvent.pointerMove(trigger, { pointerId: 1, clientX: -500, clientY: 900 })
    fireEvent.pointerUp(trigger, { pointerId: 1, clientX: -500, clientY: 900 })

    expect(root.style.left).toBe('296px')
    expect(root.style.top).toBe('370px')
    expect(localStorage.getItem('dsh-codex-connect.proxy-ball.session-drag')).not.toBeNull()
  })

  it('resolves the conversation boundary after the extension host inserts the slot', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})))
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      if (this.hasAttribute('data-conversation-scroll')) {
        return {
          x: 280, y: 0, left: 280, top: 0, right: 1280, bottom: 720,
          width: 1000, height: 720, toJSON: () => undefined,
        } as DOMRect
      }
      return {
        x: 0, y: 0, left: 0, top: 0, right: 0, bottom: 0,
        width: 0, height: 0, toJSON: () => undefined,
      } as DOMRect
    })
    const detachedSlot = document.createElement('div')
    const boundary = document.createElement('div')
    boundary.setAttribute('data-conversation-scroll', '')
    const { scope } = settingsScope()
    render(
      <OpenAICodexProxyIndicator directory={directoryStore()} configScope={scope} sessionKey="session-late-slot" t={t} />,
      { container: detachedSlot },
    )
    const root = detachedSlot.querySelector<HTMLElement>('[data-openai-codex-proxy-indicator]')!
    expect(root.dataset['openaiCodexProxySession']).toBe('session-late-slot')
    expect(root.style.left).toBe('16px')
    expect(root.style.visibility).toBe('hidden')

    document.body.append(boundary)
    boundary.append(detachedSlot)

    await waitFor(() => { expect(root.style.left).toBe('1210px') })
    expect(root.style.top).toBe('16px')
    expect(root.style.visibility).toBe('visible')
  })
})
