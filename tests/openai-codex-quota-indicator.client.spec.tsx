// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ModelDirectoryState } from '@deepseek-ai/dsh-client-ui-model-selection/client'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import { formatOpenAICodexResetAt } from '../src/client/OpenAICodexSettings.tsx'
import { OpenAICodexQuotaIndicator } from '../src/client/OpenAICodexQuotaIndicator.tsx'
import { en } from '../src/client/locales.ts'
import type { OpenAICodexSettingsKey } from '../src/client/locales.ts'

function t(key: OpenAICodexSettingsKey, params: Record<string, unknown> = {}): string {
  return Object.entries(params).reduce(
    (value, [name, replacement]) => value.replace(`{${name}}`, String(replacement)),
    en[key],
  )
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function directoryState(model: string, provider = 'openai-codex'): ModelDirectoryState {
  return {
    current: { provider, model },
    routable: true,
    groups: [],
    failures: [],
    status: 'ready',
    error: null,
  }
}

function usage(resetAt?: number, remainingPercent = 72.5): unknown {
  return {
    rateLimits: [{
      id: 'codex',
      name: 'Codex',
      windows: [{
        remainingPercent,
        windowSeconds: 7 * 24 * 60 * 60,
        ...resetAt === undefined ? {} : { resetAt },
      }],
    }],
  }
}

function directoryStore(state: ModelDirectoryState): SnapshotStore<ModelDirectoryState> {
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => state,
    subscribe: listener => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    update: () => undefined,
    set: () => undefined,
  }
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('OpenAI Codex Composer weekly quota', () => {
  it('shows only for a GPT model on the exact OpenAI Codex provider', async () => {
    const resetAt = 1_735_689_600
    const fetchMock = vi.fn(async () => json({ status: 'signed-in', usage: usage(resetAt) }))
    vi.stubGlobal('fetch', fetchMock)
    const directory = directoryStore(directoryState('gpt-5-codex'))

    render(<OpenAICodexQuotaIndicator directory={directory} t={t} />)
    const indicator = await screen.findByRole('status')
    const localReset = formatOpenAICodexResetAt(resetAt)
    expect(indicator.textContent).toBe('')
    expect(indicator.querySelector('svg[data-openai-codex-quota-ring="weekly"]')).toBeNull()
    const track = indicator.querySelector<HTMLElement>('[data-openai-codex-quota-track="weekly"]')
    expect(track?.style.width).toBe('48px')
    expect(track?.style.height).toBe('6px')
    const progress = indicator.querySelector<HTMLElement>('[data-openai-codex-quota-progress="weekly"]')
    expect(progress?.style.width).toBe('72.5%')
    expect(progress?.getAttribute('data-openai-codex-quota-color')).toBe('green')
    expect(indicator.textContent).not.toContain(en.composerWeeklyQuota)
    expect(indicator.textContent).not.toContain(localReset)
    expect(indicator.getAttribute('title')).toBe(indicator.getAttribute('aria-label'))
    expect(indicator.getAttribute('title')).toContain(en.composerWeeklyQuota)
    expect(indicator.getAttribute('title')).toContain('72.5%')
    expect(indicator.getAttribute('title')).toContain(localReset)
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it.each([
    [80, 'green'],
    [50, 'yellow'],
    [35, 'orange'],
    [10, 'red'],
  ] as const)('maps %s%% remaining quota to the %s progress color', async (remainingPercent, color) => {
    const fetchMock = vi.fn(async () => json({ status: 'signed-in', usage: usage(undefined, remainingPercent) }))
    vi.stubGlobal('fetch', fetchMock)
    const directory = directoryStore(directoryState('gpt-5'))

    render(<OpenAICodexQuotaIndicator directory={directory} t={t} />)
    const indicator = await screen.findByRole('status')
    const progress = indicator.querySelector<HTMLElement>('[data-openai-codex-quota-progress="weekly"]')
    expect(progress?.style.width).toBe(`${remainingPercent}%`)
    expect(progress?.getAttribute('data-openai-codex-quota-color')).toBe(color)
  })

  it.each([
    ['non-GPT model', directoryState('o3')],
    ['wrong provider', directoryState('gpt-5', 'openai')],
  ])('hides for a %s', async (_label, state) => {
    const fetchMock = vi.fn(async () => json({ status: 'signed-in', usage: usage() }))
    vi.stubGlobal('fetch', fetchMock)
    const directory = directoryStore(state)

    render(<OpenAICodexQuotaIndicator directory={directory} t={t} />)
    expect(screen.queryByRole('status')).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('keeps the indicator visible with an explicit unavailable reset time', async () => {
    const fetchMock = vi.fn(async () => json({ status: 'signed-in', usage: usage() }))
    vi.stubGlobal('fetch', fetchMock)
    const directory = directoryStore(directoryState('gpt-5'))

    render(<OpenAICodexQuotaIndicator directory={directory} t={t} />)
    const indicator = await screen.findByRole('status')
    expect(indicator.textContent).not.toContain(en.resetUnavailable)
    expect(indicator.getAttribute('title')).toContain(en.resetUnavailable)
    expect(indicator.getAttribute('aria-label')).toContain(en.resetUnavailable)
  })

  it('hides on signed-out or failed quota requests', async () => {
    const fetchMock = vi.fn(async () => { throw new Error('request failed') })
    vi.stubGlobal('fetch', fetchMock)
    const directory = directoryStore(directoryState('gpt-5'))

    render(<OpenAICodexQuotaIndicator directory={directory} t={t} />)
    await waitFor(() => { expect(fetchMock).toHaveBeenCalledOnce() })
    await waitFor(() => { expect(screen.queryByRole('status')).toBeNull() })
  })

  it('hides when the signed-in response has no codex weekly window', async () => {
    const fetchMock = vi.fn(async () => json({ status: 'signed-in', usage: { rateLimits: [] } }))
    vi.stubGlobal('fetch', fetchMock)
    const directory = directoryStore(directoryState('gpt-5'))

    render(<OpenAICodexQuotaIndicator directory={directory} t={t} />)
    await waitFor(() => { expect(fetchMock).toHaveBeenCalledOnce() })
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('aborts an in-flight status request when the entry unmounts', async () => {
    let signal: AbortSignal | undefined
    const fetchMock = vi.fn((_input: string | URL | Request, init?: RequestInit) => {
      signal = init?.signal instanceof AbortSignal ? init.signal : undefined
      return new Promise<Response>(() => {})
    })
    vi.stubGlobal('fetch', fetchMock)
    const directory = directoryStore(directoryState('gpt-5'))

    const rendered = render(<OpenAICodexQuotaIndicator directory={directory} t={t} />)
    await waitFor(() => { expect(fetchMock).toHaveBeenCalledOnce() })
    rendered.unmount()
    expect(signal?.aborted).toBe(true)
  })
})
