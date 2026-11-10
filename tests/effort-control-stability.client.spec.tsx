// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ModelDirectoryState } from '@deepseek-ai/dsh-client-ui-model-selection/client'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import { afterEach, expect, it, vi } from 'vitest'
import { OpenAICodexFastModeToggle } from '../src/client/OpenAICodexFastModeToggle.tsx'
import { OpenAICodexQuotaIndicator } from '../src/client/OpenAICodexQuotaIndicator.tsx'
import { en, type OpenAICodexSettingsKey } from '../src/client/locales.ts'
import { speedLifecycleFixture } from './support/speed-lifecycle-fixture.ts'

const t = (key: OpenAICodexSettingsKey, params: Record<string, unknown> = {}) =>
  Object.entries(params).reduce((value, [name, replacement]) => value.replace(`{${name}}`, String(replacement)), en[key])
const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } })
const usage = { status: 'signed-in', usage: { rateLimits: [
  { id: 'codex', windows: [{ windowSeconds: 604800, remainingPercent: 72.5 }] },
  { id: 'codex_bengalfox', windows: [{ windowSeconds: 604800, remainingPercent: 18.5 }] },
] } }
function directory() {
  let snapshot: ModelDirectoryState = { current: { provider: 'openai-codex', model: 'gpt-6.1-sol', reasoningEffort: 'high' },
    status: 'ready', routable: true, groups: [], failures: [], error: null }
  const listeners = new Set<() => void>()
  const store: SnapshotStore<ModelDirectoryState> = {
    getSnapshot: () => snapshot, subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener) } },
    update: () => undefined, set: next => { snapshot = next; listeners.forEach(listener => { listener() }) },
  }
  const change = (next: Partial<ModelDirectoryState>) => { store.set({ ...snapshot, ...next }) }
  return { store, change }
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers() })

it('keeps control nodes and quota through repeated effort saves, but revalidates the Host speed generation', async () => {
  const f = await speedLifecycleFixture(), d = directory()
  const quota = vi.fn(async () => json(usage))
  const speed = vi.fn((path: string, init: RequestInit) => f.request(path, init))
  vi.stubGlobal('fetch', (path: string, init: RequestInit) => path.includes('/speed-mode') ? speed(path, init) : quota())
  const view = render(<><OpenAICodexFastModeToggle directory={d.store} sessionId="session" t={t} />
    <OpenAICodexQuotaIndicator directory={d.store} t={t} /></>)
  const button = await screen.findByRole('button', { name: en.speedMenuStandardTitle })
  const indicator = await screen.findByRole('status', { name: /^Codex/ })
  fireEvent.click(button)
  fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitemradio', { name: 'Ultrafast' }))
  await screen.findByRole('button', { name: en.speedMenuUltrafastTitle })
  for (const effort of ['medium', 'high', 'medium']) {
    fireEvent.click(button)
    const staleRow = within(screen.getByRole('menu')).getByRole('menuitemradio', { name: 'Fast' })
    const posts = speed.mock.calls.filter(([, init]) => init.method === 'POST').length
    act(() => { d.change({ status: 'selecting' }) })
    expect(view.container.querySelector('[data-openai-codex-speed-menu]')).toBe(button)
    expect(button).toHaveProperty('disabled', true)
    expect(screen.getByRole('status', { name: /^Codex/ })).toBe(indicator)
    expect(indicator.getAttribute('aria-label')).toContain('72.5%')
    expect(screen.queryByRole('menu')).toBeNull()
    fireEvent.click(staleRow)
    fireEvent.click(button)
    expect(speed.mock.calls.filter(([, init]) => init.method === 'POST')).toHaveLength(posts)
    // The real Host event invalidates even an effort-only selection. Keeping
    // a mounted view must not keep its old paid-tier generation usable.
    act(() => {
      f.session.append('model/selection', { provider: 'openai-codex', model: 'gpt-6.1-sol', reasoningEffort: effort })
      d.change({ status: 'ready', current: { ...d.store.getSnapshot().current!, reasoningEffort: effort } })
    })
    await waitFor(() => { expect(button).toHaveProperty('disabled', false) })
    expect(screen.getByRole('button', { name: en.speedMenuStandardTitle })).toBe(button)
    expect(screen.getByRole('status', { name: /^Codex/ })).toBe(indicator)
    expect(quota).toHaveBeenCalledOnce()
    expect(screen.queryByRole('menu')).toBeNull()
  }
  expect(speed.mock.calls.filter(([, init]) => init.method === 'GET')).toHaveLength(4)
  fireEvent.click(button)
  fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitemradio', { name: 'Fast' }))
  await screen.findByRole('button', { name: en.speedMenuFastTitle })
  expect(f.registry.readSpeed('session', f.scope()).mode).toBe('fast')
})

it.each(['error', 'idle', 'loading'] as const)('still cancels quota on %s after selecting and rejects late results', async status => {
  const d = directory()
  let finish!: (response: Response) => void
  let signal!: AbortSignal
  const fetch = vi.fn((_path: string, init: RequestInit) => {
    signal = init.signal!
    return new Promise<Response>(resolve => { finish = resolve })
  })
  vi.stubGlobal('fetch', fetch)
  render(<OpenAICodexQuotaIndicator directory={d.store} t={t} />)
  act(() => { d.change({ status: 'selecting' }) })
  expect(signal.aborted).toBe(false)
  expect(fetch).toHaveBeenCalledOnce()
  act(() => { d.change({ status, error: status === 'error' ? 'selection failed' : null }) })
  expect(signal.aborted).toBe(true)
  await act(async () => { finish(json(usage)) })
  expect(screen.queryByRole('status', { name: /^Codex/ })).toBeNull()
})

it('preserves quota refresh deadline across an effort save and still follows model buckets/provider loss', async () => {
  vi.useFakeTimers()
  const d = directory(), fetch = vi.fn(async () => json(usage))
  vi.stubGlobal('fetch', fetch)
  render(<OpenAICodexQuotaIndicator directory={d.store} t={t} />)
  await act(async () => {})
  const indicator = screen.getByRole('status', { name: /^Codex/ })
  await act(async () => { await vi.advanceTimersByTimeAsync(30_000); d.change({ status: 'selecting' }) })
  await act(async () => { d.change({ status: 'ready' }); await vi.advanceTimersByTimeAsync(29_999) })
  expect(fetch).toHaveBeenCalledOnce()
  expect(screen.getByRole('status', { name: /^Codex/ })).toBe(indicator)
  await act(async () => { await vi.advanceTimersByTimeAsync(1) })
  expect(fetch).toHaveBeenCalledTimes(2)
  act(() => { d.change({ current: { provider: 'openai-codex', model: 'gpt-5.3-codex-spark' }, status: 'selecting' }) })
  expect(screen.getByRole('status', { name: /^Codex/ }).getAttribute('aria-label')).toContain('18.5%')
  act(() => { d.change({ current: { provider: 'other', model: 'gpt-6.1-sol' } }) })
  expect(screen.queryByRole('status', { name: /^Codex/ })).toBeNull()
  expect(vi.getTimerCount()).toBe(0)
})

it('aborts a pending quota read when the session directory is replaced and ignores the old result', async () => {
  const a = directory(), b = directory()
  let finish!: (response: Response) => void
  let signal!: AbortSignal
  const fetch = vi.fn((_path: string, init: RequestInit) => {
    if (fetch.mock.calls.length === 1) {
      signal = init.signal!
      return new Promise<Response>(resolve => { finish = resolve })
    }
    return Promise.resolve(json({ status: 'signed-out' }))
  })
  vi.stubGlobal('fetch', fetch)
  const view = render(<OpenAICodexQuotaIndicator directory={a.store} t={t} />)
  view.rerender(<OpenAICodexQuotaIndicator directory={b.store} t={t} />)
  expect(signal.aborted).toBe(true)
  await act(async () => { finish(json(usage)) })
  expect(fetch).toHaveBeenCalledTimes(2)
  expect(screen.queryByRole('status', { name: /^Codex/ })).toBeNull()
})
it.each(['GET', 'POST'] as const)('aborts an in-flight speed %s on selection and rejects its late result', async method => {
  const d = directory()
  let finish!: (response: Response) => void
  let signal!: AbortSignal
  let defer = method === 'GET'
  let generation = 'before'
  const fetch = vi.fn((_path: string, init: RequestInit) => {
    if (defer && init.method === method) {
      signal = init.signal!
      return new Promise<Response>(resolve => { finish = resolve })
    }
    return Promise.resolve(json({ generation, revision: 0, mode: 'standard', model: 'gpt-6.1-sol',
      modelSupported: true, hasAccount: true, selectionAvailable: true, eligibility: 'unknown' }))
  })
  vi.stubGlobal('fetch', fetch)
  const view = render(<OpenAICodexFastModeToggle directory={d.store} sessionId="session" t={t} />)
  if (method === 'POST') {
    fireEvent.click(await screen.findByRole('button', { name: en.speedMenuStandardTitle }))
    defer = true
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitemradio', { name: 'Fast' }))
  }
  const button = view.container.querySelector('[data-openai-codex-speed-menu]')
  act(() => { d.change({ status: 'selecting' }) })
  expect(signal.aborted).toBe(true)
  expect(view.container.querySelector('[data-openai-codex-speed-menu]')).toBe(button)
  expect(button).toHaveProperty('disabled', true)
  defer = false; generation = 'after'
  act(() => { d.change({ status: 'ready' }) })
  await screen.findByRole('button', { name: en.speedMenuStandardTitle })
  await act(async () => { finish(json({ generation: 'before', revision: 1, mode: 'fast', model: 'gpt-6.1-sol',
    modelSupported: true, hasAccount: true, selectionAvailable: true, eligibility: 'unknown' })) })
  expect(screen.getByRole('button', { name: en.speedMenuStandardTitle })).toBe(button)
  expect(button).toHaveProperty('disabled', false)
  expect(fetch.mock.calls.filter(([, init]) => init.method === 'POST')).toHaveLength(method === 'POST' ? 1 : 0)
  view.unmount()
})

