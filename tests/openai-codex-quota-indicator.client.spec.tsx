// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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

function usageWithSparkBucket(resetAt?: number): unknown {
  return {
    rateLimits: [
      {
        id: 'codex',
        name: 'Codex',
        windows: [{
          remainingPercent: 72.5,
          windowSeconds: 7 * 24 * 60 * 60,
          ...resetAt === undefined ? {} : { resetAt },
        }],
      },
      {
        id: 'codex_bengalfox',
        name: 'GPT-5.3-Codex-Spark',
        windows: [{
          remainingPercent: 18.5,
          windowSeconds: 7 * 24 * 60 * 60,
          ...resetAt === undefined ? {} : { resetAt },
        }],
      },
    ],
  }
}

function directoryStore(state: ModelDirectoryState): SnapshotStore<ModelDirectoryState> {
  const listeners = new Set<() => void>()
  let snapshot = state
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
    expect(indicator.hasAttribute('title')).toBe(false)
    expect(indicator.getAttribute('aria-label')).toContain(en.composerWeeklyQuota)
    expect(indicator.getAttribute('aria-label')).toContain('72.5%')
    expect(indicator.getAttribute('aria-label')).toContain(localReset)
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('shows a visible tooltip on hover and keyboard focus', async () => {
    const resetAt = 1_735_689_600
    const fetchMock = vi.fn(async () => json({ status: 'signed-in', usage: usage(resetAt) }))
    vi.stubGlobal('fetch', fetchMock)
    const directory = directoryStore(directoryState('gpt-5-codex'))

    render(<OpenAICodexQuotaIndicator directory={directory} t={t} />)
    const indicator = await screen.findByRole('status')
    const localReset = formatOpenAICodexResetAt(resetAt)
    expect(screen.queryByRole('tooltip')).toBeNull()

    fireEvent.mouseEnter(indicator)
    const hoverTooltip = await screen.findByRole('tooltip')
    expect(hoverTooltip.textContent).toContain('72.5%')
    expect(hoverTooltip.textContent).toContain(localReset)
    fireEvent.mouseLeave(indicator)
    await waitFor(() => { expect(screen.queryByRole('tooltip')).toBeNull() })

    fireEvent.focus(indicator)
    const focusTooltip = await screen.findByRole('tooltip')
    expect(focusTooltip.textContent).toContain('72.5%')
    expect(focusTooltip.textContent).toContain(localReset)
    fireEvent.blur(indicator)
    await waitFor(() => { expect(screen.queryByRole('tooltip')).toBeNull() })
  })

  it('selects Spark quota for the exact model and follows directory model changes', async () => {
    const fetchMock = vi.fn(async () => json({ status: 'signed-in', usage: usageWithSparkBucket() }))
    vi.stubGlobal('fetch', fetchMock)
    const directory = directoryStore(directoryState('gpt-5.3-codex-spark'))

    render(<OpenAICodexQuotaIndicator directory={directory} t={t} />)
    let indicator = await screen.findByRole('status')
    expect(indicator.getAttribute('aria-label')).toContain('18.5%')
    expect(indicator.querySelector<HTMLElement>('[data-openai-codex-quota-progress="weekly"]')?.style.width).toBe('18.5%')

    directory.set(directoryState('gpt-5-codex'))
    await waitFor(() => {
      indicator = screen.getByRole('status')
      expect(indicator.getAttribute('aria-label')).toContain('72.5%')
    })
    expect(indicator.querySelector<HTMLElement>('[data-openai-codex-quota-progress="weekly"]')?.style.width).toBe('72.5%')
  })

  it('hides the exact Spark model when its bucket is missing without falling back', async () => {
    const fetchMock = vi.fn(async () => json({ status: 'signed-in', usage: usage() }))
    vi.stubGlobal('fetch', fetchMock)
    const directory = directoryStore(directoryState('gpt-5.3-codex-spark'))

    render(<OpenAICodexQuotaIndicator directory={directory} t={t} />)
    await waitFor(() => { expect(fetchMock).toHaveBeenCalledOnce() })
    await waitFor(() => { expect(screen.queryByRole('status')).toBeNull() })
  })

  it('does not treat a model name containing the Spark id as an exact match', async () => {
    const fetchMock = vi.fn(async () => json({ status: 'signed-in', usage: usageWithSparkBucket() }))
    vi.stubGlobal('fetch', fetchMock)
    const directory = directoryStore(directoryState('gpt-5.3-codex-spark-preview'))

    render(<OpenAICodexQuotaIndicator directory={directory} t={t} />)
    const indicator = await screen.findByRole('status')
    expect(indicator.getAttribute('aria-label')).toContain('72.5%')
    expect(indicator.querySelector<HTMLElement>('[data-openai-codex-quota-progress="weekly"]')?.style.width).toBe('72.5%')
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
