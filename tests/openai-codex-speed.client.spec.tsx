// @vitest-environment jsdom
import { act, cleanup, createEvent, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { ModelDirectoryState } from '@deepseek-ai/dsh-client-ui-model-selection/client'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import { OpenAICodexFastModeToggle } from '../src/client/OpenAICodexFastModeToggle.tsx'
import { en, zh } from '../src/client/locales.ts'
import type { OpenAICodexSettingsKey } from '../src/client/locales.ts'
import type { AccountSnapshot } from '../src/client/account-store.ts'
import { speedLifecycleFixture } from './support/speed-lifecycle-fixture.ts'
import { OPENAI_CODEX_FAST_MODE_PATH } from '../src/fast-mode-paths.ts'
import { BROWSER_REQUEST_TIMEOUT_MS } from '../src/client/request-json.ts'

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers() })
const t = (key: OpenAICodexSettingsKey) => en[key]
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } })
function directory(model = 'gpt-6.1-sol', provider = 'openai-codex') {
  let current: ModelDirectoryState = { current: { model, provider }, routable: true, groups: [], failures: [], status: 'ready', error: null }
  const listeners = new Set<() => void>()
  const store: SnapshotStore<ModelDirectoryState> = { getSnapshot: () => current, subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener) } }, update: () => undefined, set: () => undefined }
  return { store, change: (next: string) => { current = { ...current, current: { provider, model: next } }; listeners.forEach(listener => { listener() }) } }
}
async function backend() {
  const f = await speedLifecycleFixture()
  const fetch = vi.fn((path: string, init: RequestInit) => f.request(path, init))
  vi.stubGlobal('fetch', fetch)
  return Object.assign(fetch, f)
}
it('keeps a newer choice in view B when older view A with the same generation unmounts', async () => {
  const fetch = await backend(), d = directory()
  const props = { directory: d.store, sessionId: 'session', t }
  const a = render(<OpenAICodexFastModeToggle {...props} />)
  const b = render(<OpenAICodexFastModeToggle {...props} />)
  const aView = within(a.container), bView = within(b.container)
  await waitFor(() => { expect(aView.getByRole('button', { name: en.speedMenuStandardTitle }).getAttribute('aria-pressed')).toBe('false') })
  await waitFor(() => { expect(bView.getByRole('button', { name: en.speedMenuStandardTitle }).getAttribute('aria-pressed')).toBe('false') })
  const shared = fetch.registry.readSpeed('session', fetch.scope())
  fireEvent.click(bView.getByRole('button', { name: en.speedMenuStandardTitle }))
  fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitemradio', { name: 'Ultrafast' }))
  await waitFor(() => { expect(bView.getByRole('button', { name: en.speedMenuUltrafastTitle }).getAttribute('aria-pressed')).toBe('true') })
  expect(fetch.registry.readSpeed('session', fetch.scope())).toMatchObject({ generation: shared.generation, revision: shared.revision + 1, mode: 'ultrafast' })
  await act(async () => { a.unmount() })
  expect(fetch.registry.requestSpeed('session', fetch.scope())).toBe('ultrafast')
  expect(bView.getByRole('button', { name: en.speedMenuUltrafastTitle }).getAttribute('aria-pressed')).toBe('true')
  expect(fetch.mock.calls.filter(([, init]) => init.method === 'DELETE')).toHaveLength(0)
})
it('retains an explicit choice and its generation across navigation away and back', async () => {
  const fetch = await backend(), d = directory(), props = { directory: d.store, sessionId: 'session', t }
  const initial = render(<OpenAICodexFastModeToggle {...props} />)
  await waitFor(() => { expect(screen.getByRole('button', { name: en.speedMenuStandardTitle })).toHaveProperty('disabled', false) })
  fireEvent.click(screen.getByRole('button', { name: en.speedMenuStandardTitle }))
  fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitemradio', { name: 'Ultrafast' }))
  await waitFor(() => { expect(screen.getByRole('button', { name: en.speedMenuUltrafastTitle }).getAttribute('aria-pressed')).toBe('true') })
  const chosen = fetch.registry.readSpeed('session', fetch.scope())
  await act(async () => { initial.unmount() })
  render(<OpenAICodexFastModeToggle {...props} />)
  await waitFor(() => { expect(screen.getByRole('button', { name: en.speedMenuUltrafastTitle })).toHaveProperty('disabled', false) })
  expect(screen.getByRole('button', { name: en.speedMenuUltrafastTitle }).getAttribute('aria-pressed')).toBe('true')
  expect(fetch.registry.readSpeed('session', fetch.scope())).toEqual(chosen)
})
it('blocks only Ultrafast during shared account mutations and keeps Fast selectable', async () => {
  const fetch = await backend()
  let state: AccountSnapshot = { status: { status: 'signed-in', usage: { rateLimits: [] } }, busy: false,
    accounts: [{ accountKey: 'synthetic-a', active: true, displayName: 'offline', profileSource: 'generated' }], operation: { kind: 'idle' } }
  const listeners = new Set<() => void>()
  const account = { getSnapshot: () => state, subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } } }
  const view = render(<OpenAICodexFastModeToggle directory={directory().store} account={account} sessionId="session" t={t} />)
  await waitFor(() => { expect(view.getByRole('button', { name: en.speedMenuStandardTitle })).toHaveProperty('disabled', false) })
  // Pre-click wait: the shared account is idle, so every paid choice is available.
  await waitFor(() => {
    const menu = openSpeedMenu(view, en.speedMenuStandardTitle)
    expect(within(menu).getByRole('menuitemradio', { name: 'Fast' })).toHaveProperty('disabled', false)
    expect(within(menu).getByRole('menuitemradio', { name: 'Ultrafast' })).toHaveProperty('disabled', false)
  })
  fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitemradio', { name: 'Ultrafast' }))
  await waitFor(() => { expect(view.getByRole('button', { name: en.speedMenuUltrafastTitle }).getAttribute('aria-pressed')).toBe('true') })
  act(() => { fetch.accountChanged(); state = { ...state, busy: true, operation: { kind: 'activating', accountKey: 'synthetic-b' } }; listeners.forEach(listener => { listener() }) })
  // Main's account-gating contract: only Ultrafast is blocked; Fast stays
  // selectable exactly like Standard.
  await waitFor(() => { expect(view.getByRole('button', { name: en.speedMenuStandardTitle })).toHaveProperty('disabled', false) })
  let menu = openSpeedMenu(view, en.speedMenuStandardTitle)
  expect(within(menu).getByRole('menuitemradio', { name: 'Fast' })).toHaveProperty('disabled', false)
  expect(within(menu).getByRole('menuitemradio', { name: 'Ultrafast' })).toHaveProperty('disabled', true)
  expect(within(menu).getByRole('menuitemradio', { name: 'Ultrafast' }).getAttribute('title')).toBe(en.ultrafastUnavailable)
  expect(within(menu).getByRole('menuitemradio', { name: 'Standard' })).toHaveProperty('disabled', false)
  const postsBeforeDisabledActivation = fetch.mock.calls.filter(([, init]) => init.method === 'POST').length
  fireEvent.click(within(menu).getByRole('menuitemradio', { name: 'Ultrafast' }))
  expect(fetch.mock.calls.filter(([, init]) => init.method === 'POST')).toHaveLength(postsBeforeDisabledActivation)
  fireEvent.click(within(menu).getByRole('menuitemradio', { name: 'Fast' }))
  await waitFor(() => { expect(view.getByRole('button', { name: en.speedMenuFastTitle }).getAttribute('aria-pressed')).toBe('true') })
  expect(fetch.mock.calls.filter(([, init]) => init.method === 'POST').map(([, init]) => JSON.parse(String(init.body)).mode)).toEqual(['ultrafast', 'fast'])
  act(() => { state = { ...state, busy: false, operation: { kind: 'idle' }, accounts: [{ ...state.accounts[0]!, accountKey: 'synthetic-b' }] }; listeners.forEach(listener => { listener() }) })
  await waitFor(() => { expect(view.getByRole('button', { name: en.speedMenuFastTitle })).toHaveProperty('disabled', false) })
  menu = openSpeedMenu(view, en.speedMenuFastTitle)
  expect(within(menu).getByRole('menuitemradio', { name: 'Fast' })).toHaveProperty('disabled', false)
  expect(within(menu).getByRole('menuitemradio', { name: 'Ultrafast' })).toHaveProperty('disabled', false)
  expect(fetch.registry.readSpeed('session', fetch.scope()).mode).toBe('fast')
})
it.each(['gpt-6.1-sol', 'gpt-6-astra'])('starts %s in Standard and selects mutually exclusive Fast/Ultrafast without claiming service confirmation', async model => {
  const fetch = await backend(), d = directory(model)
  const view = render(<OpenAICodexFastModeToggle directory={d.store} sessionId="session" t={t} />)
  await waitFor(() => { expect(view.getByRole('button', { name: en.speedMenuStandardTitle })).toBeTruthy() })
  fireEvent.click(view.getByRole('button', { name: en.speedMenuStandardTitle }))
  fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitemradio', { name: 'Fast' }))
  await waitFor(() => { expect(view.getByRole('button', { name: en.speedMenuFastTitle }).getAttribute('aria-pressed')).toBe('true') })
  fireEvent.click(view.getByRole('button', { name: en.speedMenuFastTitle }))
  let menu = screen.getByRole('menu')
  expect(within(menu).getByRole('menuitemradio', { name: 'Fast' }).getAttribute('aria-checked')).toBe('true')
  expect(within(menu).getByText(en.ultrafastDisclosure)).toBeTruthy()
  fireEvent.click(within(menu).getByRole('menuitemradio', { name: 'Ultrafast' }))
  await waitFor(() => { expect(view.getByRole('button', { name: en.speedMenuUltrafastTitle }).getAttribute('aria-pressed')).toBe('true') })
  fireEvent.click(view.getByRole('button', { name: en.speedMenuUltrafastTitle }))
  menu = screen.getByRole('menu')
  expect(within(menu).getByRole('menuitemradio', { name: 'Ultrafast' }).getAttribute('aria-checked')).toBe('true')
  expect(within(menu).getByRole('menuitemradio', { name: 'Fast' }).getAttribute('aria-checked')).toBe('false')
  expect(within(menu).getByRole('menuitemradio', { name: 'Standard' }).getAttribute('aria-checked')).toBe('false')
  expect(fetch.mock.calls.filter(([, init]) => init.method === 'POST').map(([, init]) => JSON.parse(String(init.body)).mode)).toEqual(['fast', 'ultrafast'])
})
it.each(['gpt-6-luna', 'gpt-6.1-terra'])('keeps Standard/Fast selectable and explains the disabled Ultrafast row for %s', async model => {
  const fetch = await backend(), d = directory(model)
  const view = render(<OpenAICodexFastModeToggle directory={d.store} sessionId="session" t={t} />)
  await waitFor(() => { expect(view.getByRole('button', { name: en.speedMenuStandardTitle })).toHaveProperty('disabled', false) })
  // One control for every Codex GPT model: no legacy one-tap bolt and no bare
  // native disabled button pinned next to it.
  expect(view.container.querySelector('[data-openai-codex-speed-menu]')).not.toBeNull()
  expect(view.queryByRole('button', { name: 'Ultrafast' })).toBeNull()
  const menu = openSpeedMenu(view, en.speedMenuStandardTitle)
  expect(within(menu).getByRole('menuitemradio', { name: 'Fast' })).toHaveProperty('disabled', false)
  const ultrafast = within(menu).getByRole('menuitemradio', { name: 'Ultrafast' })
  expect(ultrafast).toHaveProperty('disabled', true)
  expect(ultrafast.getAttribute('title')).toBe(en.ultrafastUnsupported)
  fireEvent.click(ultrafast)
  expect(fetch.mock.calls.filter(([, init]) => init.method === 'POST')).toHaveLength(0)
  fireEvent.click(within(menu).getByRole('menuitemradio', { name: 'Fast' }))
  await waitFor(() => { expect(view.getByRole('button', { name: en.speedMenuFastTitle }).getAttribute('aria-pressed')).toBe('true') })
  expect(fetch.registry.captureSpeed('session').mode).toBe('fast')
  fireEvent.click(within(openSpeedMenu(view, en.speedMenuFastTitle)).getByRole('menuitemradio', { name: 'Standard' }))
  await waitFor(() => { expect(view.getByRole('button', { name: en.speedMenuStandardTitle }).getAttribute('aria-pressed')).toBe('false') })
  expect(fetch.registry.captureSpeed('session').mode).toBe('standard')
  expect(fetch.mock.calls.filter(([, init]) => init.method === 'POST').map(([, init]) => JSON.parse(String(init.body)).mode)).toEqual(['fast', 'standard'])
  view.rerender(<OpenAICodexFastModeToggle directory={directory('gpt-6.1-sol', 'other').store} sessionId="session" t={t} />)
  expect(view.container.querySelector('[data-openai-codex-speed-menu]')).toBeNull()
})
it.each([
  ['en', en, 'Ultrafast details'],
  ['zh', zh, 'Ultrafast 说明'],
] as const)('reveals the model-specific Ultrafast reason through the touch disclosure (%s)', async (_language, strings, infoName) => {
  await backend()
  const state: AccountSnapshot = { status: { status: 'signed-in', usage: { rateLimits: [] } }, busy: false,
    accounts: [{ accountKey: 'synthetic-a', active: true, displayName: 'offline', profileSource: 'generated' }], operation: { kind: 'idle' } }
  const account = { getSnapshot: () => state, subscribe: () => () => {} }
  const view = render(<OpenAICodexFastModeToggle directory={directory('gpt-6-luna').store} account={account} sessionId="session" t={key => strings[key]} />)
  await waitFor(() => { expect(view.getByRole('button', { name: strings.speedMenuStandardTitle })).toHaveProperty('disabled', false) })
  const menu = openSpeedMenu(view, strings.speedMenuStandardTitle)
  const ultrafast = within(menu).getByRole('menuitemradio', { name: 'Ultrafast' })
  const expected = `${strings.ultrafastUnsupported} ${strings.ultrafastDisclosure}`
  const disclosure = document.getElementById(ultrafast.getAttribute('aria-describedby')!)!
  // The honest reason must be reachable on touch, not only in a hover title on
  // a disabled button.
  expect(disclosure.textContent).toBe(expected)
  const info = within(menu).getByRole('menuitem', { name: infoName })
  fireEvent.click(info)
  expect(info.getAttribute('aria-expanded')).toBe('true')
  expect(disclosure.style.maxHeight).not.toBe('0px')
  expect(disclosure.textContent).toBe(expected)
})
it('adds the account reason to the disclosure while the account is signed out', async () => {
  await backend()
  const state: AccountSnapshot = { status: { status: 'signed-out' }, busy: false, accounts: [], operation: { kind: 'idle' } }
  const account = { getSnapshot: () => state, subscribe: () => () => {} }
  const view = render(<OpenAICodexFastModeToggle directory={directory().store} account={account} sessionId="session" t={t} />)
  await waitFor(() => { expect(view.getByRole('button', { name: en.speedMenuStandardTitle })).toHaveProperty('disabled', false) })
  const menu = openSpeedMenu(view, en.speedMenuStandardTitle)
  const ultrafast = within(menu).getByRole('menuitemradio', { name: 'Ultrafast' })
  const disclosure = document.getElementById(ultrafast.getAttribute('aria-describedby')!)!
  expect(disclosure.textContent).toBe(`${en.ultrafastUnavailable} ${en.ultrafastDisclosure}`)
})
it('invalidates and reads a fresh Standard selection after switching away/back without a request', async () => {
  const fetch = await backend(), d = directory()
  const view = render(<OpenAICodexFastModeToggle directory={d.store} sessionId="session" t={t} />)
  await waitFor(() => { expect(view.getByRole('button', { name: en.speedMenuStandardTitle })).toHaveProperty('disabled', false) })
  fireEvent.click(view.getByRole('button', { name: en.speedMenuStandardTitle }))
  fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitemradio', { name: 'Ultrafast' }))
  await waitFor(() => { expect(view.getByRole('button', { name: en.speedMenuUltrafastTitle }).getAttribute('aria-pressed')).toBe('true') })
  act(() => { fetch.modelChanged('gpt-6-astra'); d.change('gpt-6-astra') })
  await waitFor(() => { expect(view.getByRole('button', { name: en.speedMenuStandardTitle }).getAttribute('aria-pressed')).toBe('false') })
  act(() => { fetch.modelChanged('gpt-6.1-sol'); d.change('gpt-6.1-sol') })
  await waitFor(() => { expect(view.getByRole('button', { name: en.speedMenuStandardTitle }).getAttribute('aria-pressed')).toBe('false') })
  expect(fetch.mock.calls.filter(([, init]) => init.method === 'POST')).toHaveLength(1)
  expect(fetch.mock.calls.filter(([, init]) => init.method === 'DELETE')).toHaveLength(0)
})
it('recovers an uncertain POST by an explicit GET without replay or entitlement classification', async () => {
  const fetch = await backend(), normal = fetch.getMockImplementation()!
  fetch.mockImplementation((path, init) => init.method === 'POST' ? Promise.resolve(json({ error: 'forbidden' }, 403)) : normal(path, init))
  const view = render(<OpenAICodexFastModeToggle directory={directory().store} sessionId="session" t={t} />)
  await waitFor(() => { expect(view.getByRole('button', { name: en.speedMenuStandardTitle })).toHaveProperty('disabled', false) })
  fireEvent.click(view.getByRole('button', { name: en.speedMenuStandardTitle }))
  fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitemradio', { name: 'Ultrafast' }))
  await waitFor(() => { expect(view.getByRole('button', { name: en.speedRecover })).toBeTruthy() })
  fireEvent.click(view.getByRole('button', { name: en.speedRecover }))
  await waitFor(() => { expect(view.getByRole('button', { name: en.speedMenuStandardTitle }).getAttribute('aria-pressed')).toBe('false') })
  expect(fetch.mock.calls.filter(([, init]) => init.method === 'POST')).toHaveLength(1)
})

// The shared control must keep the view-level request-lifecycle guarantees the
// retired legacy toggle spec covered: bounded headers and bodies, no replay of
// an uncertain mutation, explicit-read recovery, and cancellation when the
// session is replaced or the view unmounts.
// The delayed answer deliberately conflicts with the recovered Standard state
// so a stale completion cannot hide behind an identical assertion.
const stalledState = { generation: 'stalled-generation', revision: 0, mode: 'fast' as const, model: 'gpt-6-luna',
  modelSupported: false, eligibility: 'unknown', hasAccount: true, selectionAvailable: true }
const speedBody = (value: unknown) => new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } })

it.each([['GET', 'headers'], ['GET', 'body'], ['POST', 'headers'], ['POST', 'body']] as const)(
  'bounds a stalled %s %s on an unsupported model and recovers only through an explicit read', async (method, kind) => {
    vi.useFakeTimers()
    const raw = await speedLifecycleFixture()
    let armed = true
    let signal: AbortSignal | undefined
    let releaseLate!: () => void
    const gate = new Promise<void>(done => { releaseLate = done })
    const fetchMock = vi.fn((path: string, init: RequestInit) => {
      const requestMethod = init.method ?? 'GET'
      if (armed && requestMethod === method) {
        armed = false
        signal = init.signal ?? undefined
        return kind === 'headers'
          ? gate.then(() => speedBody(stalledState))
          : Promise.resolve({ ok: true, json: () => gate.then(() => stalledState) } as unknown as Response)
      }
      return raw.request(path, init)
    })
    vi.stubGlobal('fetch', fetchMock)
    const view = render(<OpenAICodexFastModeToggle directory={directory('gpt-6-luna').store} sessionId="session" t={t} />)
    await act(async () => {})
    if (method === 'POST') fireEvent.click(within(openSpeedMenu(view, en.speedMenuStandardTitle)).getByRole('menuitemradio', { name: 'Fast' }))
    await act(async () => {})
    await act(async () => { await vi.advanceTimersByTimeAsync(BROWSER_REQUEST_TIMEOUT_MS) })
    expect(signal?.aborted).toBe(true)
    const recover = view.getByRole('button', { name: en.speedRecover })
    expect(recover).toHaveProperty('disabled', false)
    expect(vi.getTimerCount()).toBe(0)
    fireEvent.click(recover)
    await act(async () => {})
    expect(fetchMock.mock.calls.filter(([, init]) => (init.method ?? 'GET') === 'POST')).toHaveLength(method === 'POST' ? 1 : 0)
    // waitFor polls with real timers, which are faked here: flush microtasks instead.
    for (let tick = 0; tick < 8 && view.queryByRole('button', { name: en.speedMenuStandardTitle }) === null; tick++) await act(async () => {})
    expect(view.getByRole('button', { name: en.speedMenuStandardTitle }).getAttribute('aria-pressed')).toBe('false')
    // A late completion of the stalled request never replaces the explicit read:
    // it would have rendered Fast, and it must not trigger another mutation.
    await act(async () => { releaseLate(); await gate })
    expect(view.getByRole('button', { name: en.speedMenuStandardTitle }).getAttribute('aria-pressed')).toBe('false')
    expect(view.queryByRole('button', { name: en.speedMenuFastTitle })).toBeNull()
    expect(fetchMock.mock.calls.filter(([, init]) => (init.method ?? 'GET') === 'POST')).toHaveLength(method === 'POST' ? 1 : 0)
    expect(vi.getTimerCount()).toBe(0)
  })

it.each(['GET', 'POST'] as const)('cancels a late %s completion when the view switches sessions', async method => {
  const raw = await speedLifecycleFixture()
  let armed = true
  let signal: AbortSignal | undefined
  let releaseLate!: () => void
  const gate = new Promise<void>(done => { releaseLate = done })
  const fetchMock = vi.fn((path: string, init: RequestInit) => {
    if (armed && (init.method ?? 'GET') === method) {
      armed = false
      signal = init.signal ?? undefined
      return Promise.resolve({ ok: true, json: () => gate.then(() => ({ ...stalledState, mode: 'ultrafast' as const })) } as unknown as Response)
    }
    return raw.request(path, init)
  })
  vi.stubGlobal('fetch', fetchMock)
  const view = render(<OpenAICodexFastModeToggle directory={directory('gpt-6-luna').store} sessionId="session" t={t} />)
  await act(async () => {})
  if (method === 'POST') fireEvent.click(within(openSpeedMenu(view, en.speedMenuStandardTitle)).getByRole('menuitemradio', { name: 'Fast' }))
  await act(async () => {})
  view.rerender(<OpenAICodexFastModeToggle directory={directory('gpt-6-luna').store} sessionId="session-b" t={t} />)
  await waitFor(() => { expect(signal?.aborted).toBe(true) })
  await waitFor(() => { expect(view.getByRole('button', { name: en.speedMenuStandardTitle })).toHaveProperty('disabled', false) })
  await act(async () => { releaseLate(); await gate })
  expect(view.getByRole('button', { name: en.speedMenuStandardTitle }).getAttribute('aria-pressed')).toBe('false')
})

it('aborts an in-flight POST when the Composer control unmounts', async () => {
  const raw = await speedLifecycleFixture()
  let postSignal: AbortSignal | undefined
  const fetchMock = vi.fn((path: string, init: RequestInit) => (init.method ?? 'GET') === 'POST'
    ? ((postSignal = init.signal ?? undefined), new Promise<Response>(() => {}))
    : raw.request(path, init))
  vi.stubGlobal('fetch', fetchMock)
  const view = render(<OpenAICodexFastModeToggle directory={directory('gpt-6-luna').store} sessionId="session" t={t} />)
  await waitFor(() => { expect(view.getByRole('button', { name: en.speedMenuStandardTitle })).toHaveProperty('disabled', false) })
  fireEvent.click(within(openSpeedMenu(view, en.speedMenuStandardTitle)).getByRole('menuitemradio', { name: 'Fast' }))
  await waitFor(() => { expect(postSignal).toBeDefined() })
  await act(async () => { view.unmount() })
  expect(postSignal?.aborted).toBe(true)
})

// Compact menu control (candidate B, #378): one legacy-style bolt button opens a
// Standard/Fast/Ultrafast menu, mirroring the DSH permission-level toggle.
function speedTitle(key: 'speedMenuStandardTitle' | 'speedMenuFastTitle' | 'speedMenuUltrafastTitle'): string {
  const value = en[key]
  if (typeof value !== 'string' || value.length === 0) throw new Error(`locale key missing: ${key}`)
  return value
}
function openSpeedMenu(view: ReturnType<typeof render>, buttonName: string) {
  fireEvent.click(view.getByRole('button', { name: buttonName }))
  return screen.getByRole('menu')
}

it('renders one compact speed button instead of inline segmented choices on gpt-6.1-sol', async () => {
  const fetch = await backend()
  const view = render(<OpenAICodexFastModeToggle directory={directory().store} sessionId="session" t={t} />)
  await waitFor(() => { expect(view.getByRole('button', { name: speedTitle('speedMenuStandardTitle') })).toHaveProperty('disabled', false) })
  expect(view.container.querySelectorAll('button')).toHaveLength(1)
  const button = view.getByRole('button', { name: speedTitle('speedMenuStandardTitle') })
  expect(button.getAttribute('aria-haspopup')).toBe('menu')
  expect(button.getAttribute('aria-pressed')).toBe('false')
  expect(screen.queryByRole('menu')).toBeNull()
  expect(view.queryByRole('button', { name: 'Fast' })).toBeNull()
  expect(fetch.mock.calls.filter(([, init]) => init.method === 'POST')).toHaveLength(0)
})
it('opens a three-option menu with the current choice checked and the ultrafast disclosure', async () => {
  await backend()
  const view = render(<OpenAICodexFastModeToggle directory={directory().store} sessionId="session" t={t} />)
  await waitFor(() => { expect(view.getByRole('button', { name: speedTitle('speedMenuStandardTitle') })).toBeTruthy() })
  const menu = openSpeedMenu(view, speedTitle('speedMenuStandardTitle'))
  expect(menu.getAttribute('role')).toBe('menu')
  expect(within(menu).getByRole('menuitemradio', { name: 'Standard' }).getAttribute('aria-checked')).toBe('true')
  expect(within(menu).getByRole('menuitemradio', { name: 'Fast' }).getAttribute('aria-checked')).toBe('false')
  const ultrafast = within(menu).getByRole('menuitemradio', { name: 'Ultrafast' })
  expect(ultrafast.getAttribute('aria-checked')).toBe('false')
  expect(ultrafast.getAttribute('title')).toBe(en.ultrafastDisclosure)
  expect(within(menu).getByText(en.ultrafastDisclosure)).toBeTruthy()
  expect(view.getByRole('button', { name: speedTitle('speedMenuStandardTitle') }).getAttribute('aria-expanded')).toBe('true')
})
it('selecting Ultrafast in the menu posts once, closes the menu and reflects Ultrafast on the button', async () => {
  const fetch = await backend()
  const view = render(<OpenAICodexFastModeToggle directory={directory().store} sessionId="session" t={t} />)
  await waitFor(() => { expect(view.getByRole('button', { name: speedTitle('speedMenuStandardTitle') })).toBeTruthy() })
  fireEvent.click(within(openSpeedMenu(view, speedTitle('speedMenuStandardTitle'))).getByRole('menuitemradio', { name: 'Ultrafast' }))
  await waitFor(() => { expect(view.getByRole('button', { name: speedTitle('speedMenuUltrafastTitle') }).getAttribute('aria-pressed')).toBe('true') })
  expect(screen.queryByRole('menu')).toBeNull()
  expect(fetch.mock.calls.filter(([, init]) => init.method === 'POST').map(([, init]) => JSON.parse(String(init.body)).mode)).toEqual(['ultrafast'])
  expect(fetch.registry.readSpeed('session', fetch.scope()).mode).toBe('ultrafast')
})
it('Escape closes the menu without posting', async () => {
  const fetch = await backend()
  const view = render(<OpenAICodexFastModeToggle directory={directory().store} sessionId="session" t={t} />)
  await waitFor(() => { expect(view.getByRole('button', { name: speedTitle('speedMenuStandardTitle') })).toBeTruthy() })
  const menu = openSpeedMenu(view, speedTitle('speedMenuStandardTitle'))
  fireEvent.keyDown(menu, { key: 'Escape' })
  expect(screen.queryByRole('menu')).toBeNull()
  expect(view.getByRole('button', { name: speedTitle('speedMenuStandardTitle') }).getAttribute('aria-expanded')).toBe('false')
  expect(fetch.mock.calls.filter(([, init]) => init.method === 'POST')).toHaveLength(0)
})
it('an outside pointer press closes the menu without posting', async () => {
  const fetch = await backend()
  const view = render(<OpenAICodexFastModeToggle directory={directory().store} sessionId="session" t={t} />)
  await waitFor(() => { expect(view.getByRole('button', { name: speedTitle('speedMenuStandardTitle') })).toBeTruthy() })
  openSpeedMenu(view, speedTitle('speedMenuStandardTitle'))
  fireEvent.pointerDown(document.body)
  expect(screen.queryByRole('menu')).toBeNull()
  expect(fetch.mock.calls.filter(([, init]) => init.method === 'POST')).toHaveLength(0)
})
it('arrow keys move menu focus and Enter selects the focused option', async () => {
  const fetch = await backend()
  const view = render(<OpenAICodexFastModeToggle directory={directory().store} sessionId="session" t={t} />)
  await waitFor(() => { expect(view.getByRole('button', { name: speedTitle('speedMenuStandardTitle') })).toBeTruthy() })
  const menu = openSpeedMenu(view, speedTitle('speedMenuStandardTitle'))
  expect(document.activeElement).toBe(within(menu).getByRole('menuitemradio', { name: 'Standard' }))
  fireEvent.keyDown(menu, { key: 'ArrowDown' })
  expect(document.activeElement).toBe(within(menu).getByRole('menuitemradio', { name: 'Fast' }))
  fireEvent.keyDown(menu, { key: 'ArrowDown' })
  expect(document.activeElement).toBe(within(menu).getByRole('menuitemradio', { name: 'Ultrafast' }))
  fireEvent.keyDown(menu, { key: 'ArrowUp' })
  expect(document.activeElement).toBe(within(menu).getByRole('menuitemradio', { name: 'Fast' }))
  fireEvent.keyDown(menu, { key: 'ArrowDown' })
  fireEvent.keyDown(document.activeElement as Element, { key: 'Enter' })
  await waitFor(() => { expect(view.getByRole('button', { name: speedTitle('speedMenuUltrafastTitle') }).getAttribute('aria-pressed')).toBe('true') })
  expect(fetch.mock.calls.filter(([, init]) => init.method === 'POST').map(([, init]) => JSON.parse(String(init.body)).mode)).toEqual(['ultrafast'])
})
it('keeps the compact button enabled while the shared account is busy and blocks only Ultrafast', async () => {
  const fetch = await backend()
  let state: AccountSnapshot = { status: { status: 'signed-in', usage: { rateLimits: [] } }, busy: false,
    accounts: [{ accountKey: 'synthetic-a', active: true, displayName: 'offline', profileSource: 'generated' }], operation: { kind: 'idle' } }
  const listeners = new Set<() => void>()
  const account = { getSnapshot: () => state, subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } } }
  const view = render(<OpenAICodexFastModeToggle directory={directory().store} account={account} sessionId="session" t={t} />)
  await waitFor(() => { expect(view.getByRole('button', { name: speedTitle('speedMenuStandardTitle') })).toHaveProperty('disabled', false) })
  act(() => { state = { ...state, busy: true, operation: { kind: 'activating', accountKey: 'synthetic-b' } }; listeners.forEach(listener => { listener() }) })
  await waitFor(() => { expect(view.getByRole('button', { name: speedTitle('speedMenuStandardTitle') })).toHaveProperty('disabled', false) })
  const menu = openSpeedMenu(view, speedTitle('speedMenuStandardTitle'))
  expect(within(menu).getByRole('menuitemradio', { name: 'Fast' })).toHaveProperty('disabled', false)
  expect(within(menu).getByRole('menuitemradio', { name: 'Ultrafast' })).toHaveProperty('disabled', true)
  expect(within(menu).getByRole('menuitemradio', { name: 'Standard' })).toHaveProperty('disabled', false)
  fireEvent.click(within(menu).getByRole('menuitemradio', { name: 'Ultrafast' }))
  expect(fetch.mock.calls.filter(([, init]) => init.method === 'POST')).toHaveLength(0)
  act(() => { state = { ...state, busy: false, operation: { kind: 'idle' }, accounts: [{ ...state.accounts[0]!, accountKey: 'synthetic-b' }] }; listeners.forEach(listener => { listener() }) })
  await waitFor(() => {
    const reopened = openSpeedMenu(view, speedTitle('speedMenuStandardTitle'))
    expect(within(reopened).getByRole('menuitemradio', { name: 'Fast' })).toHaveProperty('disabled', false)
    expect(within(reopened).getByRole('menuitemradio', { name: 'Ultrafast' })).toHaveProperty('disabled', false)
  })
})
it('keeps Fast selectable while the shared account is signed out and blocks only Ultrafast', async () => {
  const fetch = await backend()
  const state: AccountSnapshot = { status: { status: 'signed-out' }, busy: false, accounts: [], operation: { kind: 'idle' } }
  const account = { getSnapshot: () => state, subscribe: () => () => {} }
  const view = render(<OpenAICodexFastModeToggle directory={directory().store} account={account} sessionId="session" t={t} />)
  await waitFor(() => { expect(view.getByRole('button', { name: speedTitle('speedMenuStandardTitle') })).toHaveProperty('disabled', false) })
  const menu = openSpeedMenu(view, speedTitle('speedMenuStandardTitle'))
  expect(within(menu).getByRole('menuitemradio', { name: 'Fast' })).toHaveProperty('disabled', false)
  expect(within(menu).getByRole('menuitemradio', { name: 'Ultrafast' })).toHaveProperty('disabled', true)
  expect(within(menu).getByRole('menuitemradio', { name: 'Standard' })).toHaveProperty('disabled', false)
  fireEvent.click(within(menu).getByRole('menuitemradio', { name: 'Ultrafast' }))
  expect(fetch.mock.calls.filter(([, init]) => init.method === 'POST')).toHaveLength(0)
  fireEvent.click(within(menu).getByRole('menuitemradio', { name: 'Fast' }))
  await waitFor(() => { expect(view.getByRole('button', { name: en.speedMenuFastTitle }).getAttribute('aria-pressed')).toBe('true') })
  expect(fetch.mock.calls.filter(([, init]) => init.method === 'POST').map(([, init]) => JSON.parse(String(init.body)).mode)).toEqual(['fast'])
})
it('keeps the Ultrafast menu option disabled without a confirmed account', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => json({ generation: 'stub-speed', revision: 0, mode: 'standard', model: 'gpt-6.1-sol',
    modelSupported: true, eligibility: 'unknown', hasAccount: false, selectionAvailable: true })))
  const view = render(<OpenAICodexFastModeToggle directory={directory().store} sessionId="session" t={t} />)
  await waitFor(() => { expect(view.getByRole('button', { name: speedTitle('speedMenuStandardTitle') })).toBeTruthy() })
  const menu = openSpeedMenu(view, speedTitle('speedMenuStandardTitle'))
  expect(within(menu).getByRole('menuitemradio', { name: 'Ultrafast' })).toHaveProperty('disabled', true)
  expect(within(menu).getByRole('menuitemradio', { name: 'Ultrafast' }).getAttribute('title')).toBe(en.ultrafastUnavailable)
  expect(within(menu).getByRole('menuitemradio', { name: 'Standard' })).toHaveProperty('disabled', false)
  expect(within(menu).getByRole('menuitemradio', { name: 'Fast' })).toHaveProperty('disabled', false)
})

it('anchors the open menu in a body portal placed above the trigger like the permission toggle', async () => {
  await backend()
  const view = render(<OpenAICodexFastModeToggle directory={directory().store} sessionId="session" t={t} />)
  await waitFor(() => { expect(view.getByRole('button', { name: speedTitle('speedMenuStandardTitle') })).toBeTruthy() })
  fireEvent.click(view.getByRole('button', { name: speedTitle('speedMenuStandardTitle') }))
  const menu = screen.getByRole('menu')
  expect(view.container.contains(menu)).toBe(false)
  expect(menu.parentElement).toBe(document.body)
  const anchorTop = view.getByRole('button', { name: speedTitle('speedMenuStandardTitle') }).getBoundingClientRect().top
  expect(Number.parseFloat(menu.style.top)).toBeLessThanOrEqual(anchorTop)
})
it('Tab inside the menu closes it, swallows the default focus move and returns focus to the button', async () => {
  await backend()
  const view = render(<OpenAICodexFastModeToggle directory={directory().store} sessionId="session" t={t} />)
  await waitFor(() => { expect(view.getByRole('button', { name: speedTitle('speedMenuStandardTitle') })).toBeTruthy() })
  const menu = openSpeedMenu(view, speedTitle('speedMenuStandardTitle'))
  const row = within(menu).getByRole('menuitemradio', { name: 'Fast' })
  row.focus()
  const tab = createEvent.keyDown(row, { key: 'Tab' })
  fireEvent(row, tab)
  expect(screen.queryByRole('menu')).toBeNull()
  expect(tab.defaultPrevented).toBe(true)
  expect(document.activeElement).toBe(view.getByRole('button', { name: speedTitle('speedMenuStandardTitle') }))
})

it('keeps a status live region announcing the read and each POST outcome', async () => {
  await backend()
  const view = render(<OpenAICodexFastModeToggle directory={directory().store} sessionId="session" t={t} />)
  const live = within(view.container).getByRole('status')
  expect(live.textContent).toBe(en.speedLoading)
  await waitFor(() => { expect(live.textContent).toBe(en.speedMenuStandardTitle) })
  fireEvent.click(view.getByRole('button', { name: speedTitle('speedMenuStandardTitle') }))
  fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitemradio', { name: 'Ultrafast' }))
  await waitFor(() => { expect(live.textContent).toBe(en.speedMenuUltrafastTitle) })
})

it('announces the Ultrafast quota disclosure through aria-describedby from the menu item', async () => {
  await backend()
  const view = render(<OpenAICodexFastModeToggle directory={directory().store} sessionId="session" t={t} />)
  await waitFor(() => { expect(view.getByRole('button', { name: speedTitle('speedMenuStandardTitle') })).toBeTruthy() })
  const menu = openSpeedMenu(view, speedTitle('speedMenuStandardTitle'))
  const describedBy = within(menu).getByRole('menuitemradio', { name: 'Ultrafast' }).getAttribute('aria-describedby')
  expect(describedBy).toBeTruthy()
  const disclosure = document.getElementById(describedBy!)
  expect(disclosure?.textContent).toBe(en.ultrafastDisclosure)
  expect(menu.contains(disclosure)).toBe(true)
})
it.each([
  ['en', en, 'Ultrafast details'],
  ['zh', zh, 'Ultrafast 说明'],
] as const)('labels the disclosure info action and preserves the collapsed full description (%s)', async (_language, strings, name) => {
  await backend()
  const view = render(<OpenAICodexFastModeToggle directory={directory().store} sessionId="session" t={key => strings[key]} />)
  await waitFor(() => { expect(view.getByRole('button', { name: strings.speedMenuStandardTitle })).toBeTruthy() })
  const menu = openSpeedMenu(view, strings.speedMenuStandardTitle)
  const info = within(menu).getByRole('menuitem', { name })
  const ultrafast = within(menu).getByRole('menuitemradio', { name: 'Ultrafast' })
  const disclosure = document.getElementById(ultrafast.getAttribute('aria-describedby')!)!
  expect(disclosure.textContent).toBe(strings.ultrafastDisclosure)
  expect(info.getAttribute('aria-controls')).toBe(disclosure.id)
  expect(info.getAttribute('aria-expanded')).toBe('false')
  // The zero-height description stays available to aria-describedby.
  expect(disclosure.style.position).not.toBe('absolute')
  expect(disclosure.style.maxHeight).toBe('0px')
  expect(disclosure.style.overflow).toBe('hidden')
  expect(disclosure.style.opacity).toBe('0')
  expect(disclosure.getAttribute('aria-hidden')).toBeNull()
  expect(getComputedStyle(disclosure).display).not.toBe('none')
  expect(ultrafast.contains(info)).toBe(false)
  expect((info as HTMLElement).style.width).toBe('32px')
  expect((info as HTMLElement).style.height).toBe('32px')
})
it('reveals the full disclosure above the choices without selecting or posting', async () => {
  const fetch = await backend()
  const view = render(<OpenAICodexFastModeToggle directory={directory().store} sessionId="session" t={t} />)
  await waitFor(() => { expect(view.getByRole('button', { name: en.speedMenuStandardTitle })).toBeTruthy() })
  const menu = openSpeedMenu(view, en.speedMenuStandardTitle)
  const info = within(menu).getByRole('menuitem', { name: 'Ultrafast details' })
  const disclosure = document.getElementById(info.getAttribute('aria-controls')!)!
  // A touch browser need not focus buttons on pointer activation; the action must.
  fireEvent.click(info)
  expect(info.getAttribute('aria-expanded')).toBe('true')
  expect(document.activeElement).toBe(info)
  expect(disclosure.style.position).not.toBe('absolute')
  expect(disclosure.style.width).toBe('138px')
  expect(disclosure.style.whiteSpace).toBe('normal')
  // Intrinsic open height preserves the complete copy at enlarged text sizes.
  expect(disclosure.style.maxHeight).toBe('none')
  expect(disclosure.style.opacity).toBe('1')
  expect(disclosure.style.transition).not.toContain('max-height')
  expect(disclosure.style.transition).toContain('opacity')
  expect(disclosure.compareDocumentPosition(within(menu).getByRole('menuitemradio', { name: 'Standard' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(within(menu).getByRole('menuitemradio', { name: 'Standard' }).getAttribute('aria-checked')).toBe('true')
  expect(fetch.mock.calls.filter(([, init]) => init.method === 'POST')).toHaveLength(0)
  fireEvent.click(info)
  expect(info.getAttribute('aria-expanded')).toBe('false')
  expect(document.getElementById(disclosure.id)).toBe(disclosure)
  expect(disclosure.style.maxHeight).toBe('0px')
  expect(disclosure.style.overflow).toBe('hidden')
})
it('walks onto the info action and toggles only disclosure with Enter and Space', async () => {
  const fetch = await backend()
  const view = render(<OpenAICodexFastModeToggle directory={directory().store} sessionId="session" t={t} />)
  await waitFor(() => { expect(view.getByRole('button', { name: en.speedMenuStandardTitle })).toBeTruthy() })
  const menu = openSpeedMenu(view, en.speedMenuStandardTitle)
  const info = within(menu).getByRole('menuitem', { name: 'Ultrafast details' })
  for (let i = 0; i < 3; i++) fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' })
  expect(document.activeElement).toBe(info)
  fireEvent.keyDown(info, { key: 'Enter' })
  expect(info.getAttribute('aria-expanded')).toBe('true')
  expect(document.activeElement).toBe(info)
  fireEvent.keyDown(info, { key: ' ' })
  expect(info.getAttribute('aria-expanded')).toBe('false')
  expect(document.activeElement).toBe(info)
  expect(fetch.mock.calls.filter(([, init]) => init.method === 'POST')).toHaveLength(0)
})
it.each(['Escape', 'Tab', 'outside', 'trigger', 'selection'] as const)('resets the disclosure when the menu closes via %s', async close => {
  const fetch = await backend()
  const view = render(<OpenAICodexFastModeToggle directory={directory().store} sessionId="session" t={t} />)
  await waitFor(() => { expect(view.getByRole('button', { name: en.speedMenuStandardTitle })).toBeTruthy() })
  const menu = openSpeedMenu(view, en.speedMenuStandardTitle)
  const info = within(menu).getByRole('menuitem', { name: 'Ultrafast details' })
  info.focus()
  fireEvent.click(info)
  if (close === 'outside') fireEvent.pointerDown(document.body)
  else if (close === 'trigger') fireEvent.click(view.getByRole('button', { name: en.speedMenuStandardTitle }))
  else if (close === 'selection') fireEvent.click(within(menu).getByRole('menuitemradio', { name: 'Standard' }))
  else {
    const event = createEvent.keyDown(info, { key: close })
    fireEvent(info, event)
    expect(event.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(view.getByRole('button', { name: en.speedMenuStandardTitle }))
  }
  expect(screen.queryByRole('menu')).toBeNull()
  await waitFor(() => { expect(view.getByRole('button', { name: en.speedMenuStandardTitle })).toHaveProperty('disabled', false) })
  const reopened = openSpeedMenu(view, en.speedMenuStandardTitle)
  expect(within(reopened).getByRole('menuitem', { name: 'Ultrafast details' }).getAttribute('aria-expanded')).toBe('false')
  expect(fetch.mock.calls.filter(([, init]) => init.method === 'POST')).toHaveLength(close === 'selection' ? 1 : 0)
})
it('keeps disclosure info available when Ultrafast selection is unavailable', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => json({ generation: 'stub-speed', revision: 0, mode: 'standard', model: 'gpt-6.1-sol',
    modelSupported: true, eligibility: 'unknown', hasAccount: false, selectionAvailable: true })))
  const view = render(<OpenAICodexFastModeToggle directory={directory().store} sessionId="session" t={t} />)
  await waitFor(() => { expect(view.getByRole('button', { name: en.speedMenuStandardTitle })).toBeTruthy() })
  const menu = openSpeedMenu(view, en.speedMenuStandardTitle)
  expect(within(menu).getByRole('menuitemradio', { name: 'Ultrafast' })).toHaveProperty('disabled', true)
  const info = within(menu).getByRole('menuitem', { name: 'Ultrafast details' })
  expect(info).toHaveProperty('disabled', false)
  fireEvent.click(info)
  expect(info.getAttribute('aria-expanded')).toBe('true')
})
it('removes the short quota footer and its orphan translations', async () => {
  await backend()
  const view = render(<OpenAICodexFastModeToggle directory={directory().store} sessionId="session" t={t} />)
  await waitFor(() => { expect(view.getByRole('button', { name: en.speedMenuStandardTitle })).toBeTruthy() })
  const menu = openSpeedMenu(view, en.speedMenuStandardTitle)
  expect(menu.querySelector('small')).toBeNull()
  expect(en).not.toHaveProperty('speedQuotaHintShort')
  expect(zh).not.toHaveProperty('speedQuotaHintShort')
})
it('keeps a standing hint next to the button while Ultrafast is the active mode', async () => {
  await backend()
  const view = render(<OpenAICodexFastModeToggle directory={directory().store} sessionId="session" t={t} />)
  await waitFor(() => { expect(view.getByRole('button', { name: speedTitle('speedMenuStandardTitle') })).toBeTruthy() })
  expect(view.container.querySelector('[data-openai-codex-speed-ultrafast-hint]')).toBeNull()
  fireEvent.click(within(openSpeedMenu(view, speedTitle('speedMenuStandardTitle'))).getByRole('menuitemradio', { name: 'Ultrafast' }))
  await waitFor(() => { expect(view.getByRole('button', { name: speedTitle('speedMenuUltrafastTitle') }).getAttribute('aria-pressed')).toBe('true') })
  const hint = view.container.querySelector('[data-openai-codex-speed-ultrafast-hint]') as HTMLElement
  expect(hint.getAttribute('title')).toBe(en.ultrafastDisclosure)
  fireEvent.click(within(openSpeedMenu(view, speedTitle('speedMenuUltrafastTitle'))).getByRole('menuitemradio', { name: 'Standard' }))
  await waitFor(() => { expect(view.getByRole('button', { name: speedTitle('speedMenuStandardTitle') }).getAttribute('aria-pressed')).toBe('false') })
  expect(view.container.querySelector('[data-openai-codex-speed-ultrafast-hint]')).toBeNull()
})

it('keeps the actual legacy Fast route consistent while Ultrafast is unavailable on an unsupported model', async () => {
  const fetch = await backend(), d = directory()
  const view = render(<OpenAICodexFastModeToggle directory={d.store} sessionId="session" t={t} />)
  await waitFor(() => { expect(view.getByRole('button', { name: en.speedMenuStandardTitle })).toHaveProperty('disabled', false) })
  fireEvent.click(view.getByRole('button', { name: en.speedMenuStandardTitle }))
  fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitemradio', { name: 'Ultrafast' }))
  await waitFor(() => { expect(view.getByRole('button', { name: en.speedMenuUltrafastTitle }).getAttribute('aria-pressed')).toBe('true') })
  act(() => { fetch.modelChanged('gpt-6-sol'); d.change('gpt-6-sol') })
  const response = await fetch(OPENAI_CODEX_FAST_MODE_PATH + '?sessionId=session', { method: 'GET' })
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ enabled: false })
  await waitFor(() => { expect(view.getByRole('button', { name: en.speedMenuStandardTitle })).toHaveProperty('disabled', false) })
  let menu = openSpeedMenu(view, en.speedMenuStandardTitle)
  const ultrafast = within(menu).getByRole('menuitemradio', { name: 'Ultrafast' })
  expect(ultrafast).toHaveProperty('disabled', true)
  expect(ultrafast.getAttribute('title')).toBe(en.ultrafastUnsupported)
  expect(fetch.registry.captureSpeed('session').mode).toBe('standard')
  fireEvent.click(within(menu).getByRole('menuitemradio', { name: 'Fast' }))
  await waitFor(() => { expect(view.getByRole('button', { name: en.speedMenuFastTitle }).getAttribute('aria-pressed')).toBe('true') })
  expect(fetch.registry.captureSpeed('session').mode).toBe('fast')
})

