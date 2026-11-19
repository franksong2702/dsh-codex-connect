// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { TaskRecoveryVisibility } from '../src/client/TaskRecoveryVisibility.tsx'
import { DEFAULT_OPENAI_CODEX_SETTINGS } from '../src/settings-contract.ts'
import type { OpenAICodexSettingsConfig } from '../src/settings-contract.ts'
import type { AdaptiveTaskState } from '../src/adaptive-task-contract.ts'
import { taskRecoveryConfigFixture } from './support/task-recovery-config-fixture.ts'

const state = (mode: AdaptiveTaskState['mode'] = 'interrupted'): AdaptiveTaskState => ({
  mode, revision: 5, reserved: 3, maximumRequests: 10, canStart: false,
  eligibility: 'not-probed', capabilities: [], unavailable: 'TASK_PUBLIC_RELEASE_PAUSED',
})
const hidden = { ...DEFAULT_OPENAI_CODEX_SETTINGS, showTaskRecoveryControls: false }
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}
beforeEach(() => {
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { configurable: true, value(this: HTMLDialogElement) { this.setAttribute('open', '') } },
    close: { configurable: true, value(this: HTMLDialogElement) { this.removeAttribute('open') } },
  })
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

it('does not read or render when disabled, including a saved-false remount', async () => {
  const fetch = vi.fn(async () => Response.json(state())); vi.stubGlobal('fetch', fetch)
  const config = taskRecoveryConfigFixture({ value: hidden })
  const first = render(<TaskRecoveryVisibility sessionId="fixture" configScope={config.scope} />)
  expect(first.container.innerHTML).toBe('')
  first.unmount()
  const second = render(<TaskRecoveryVisibility sessionId="fixture" configScope={config.scope} />)
  await act(async () => {})
  expect(second.container.innerHTML).toBe('')
  expect(fetch).not.toHaveBeenCalled()
})

it('waits through initial loading before respecting false with no task read', async () => {
  const fetch = vi.fn(async () => Response.json(state())); vi.stubGlobal('fetch', fetch)
  const config = taskRecoveryConfigFixture({ status: 'loading', value: undefined })
  const view = render(<TaskRecoveryVisibility sessionId="fixture" configScope={config.scope} />)
  await act(async () => {})
  expect(fetch).not.toHaveBeenCalled()
  await act(async () => { config.show(false) })
  expect(view.container.innerHTML).toBe('')
  expect(fetch).not.toHaveBeenCalled()
})

it.each(['ready', 'unavailable'] as const)('resolves initial loading to %s recovery access', async status => {
  const fetch = vi.fn(async () => Response.json(state())); vi.stubGlobal('fetch', fetch)
  const config = taskRecoveryConfigFixture({ status: 'loading', value: undefined })
  render(<TaskRecoveryVisibility sessionId="fixture" configScope={config.scope} />)
  expect(fetch).not.toHaveBeenCalled()
  await act(async () => { config.update({ status, value: status === 'ready' ? { ...DEFAULT_OPENAI_CODEX_SETTINGS } : undefined }) })
  await screen.findByRole('button', { name: 'Existing task controls' })
  expect(fetch).toHaveBeenCalledTimes(1)
})

it('retains unavailable memory-mode recovery access without a settings value', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json(state())))
  const config = taskRecoveryConfigFixture({ status: 'unavailable', mode: 'memory', value: undefined, writable: false })
  render(<TaskRecoveryVisibility sessionId="fixture" configScope={config.scope} />)
  expect(await screen.findByRole('button', { name: 'Existing task controls' })).toBeTruthy()
})

it('defaults a legacy accepted snapshot to visible', async () => {
  const { showTaskRecoveryControls: _omitted, ...legacy } = DEFAULT_OPENAI_CODEX_SETTINGS
  vi.stubGlobal('fetch', vi.fn(async () => Response.json(state())))
  const config = taskRecoveryConfigFixture({ value: legacy as OpenAICodexSettingsConfig })
  render(<TaskRecoveryVisibility sessionId="fixture" configScope={config.scope} />)
  expect(await screen.findByRole('button', { name: 'Existing task controls' })).toBeTruthy()
})

it('preserves accepted false through reconnect and unavailable snapshots', async () => {
  const fetch = vi.fn(async () => Response.json(state())); vi.stubGlobal('fetch', fetch)
  const config = taskRecoveryConfigFixture({ value: hidden })
  render(<TaskRecoveryVisibility sessionId="fixture" configScope={config.scope} />)
  await act(async () => { config.update({ status: 'loading' }) })
  await act(async () => { config.update({ status: 'unavailable' }) })
  expect(fetch).not.toHaveBeenCalled()
})

it('reacts to accepted settings without task mutations and resets on session change', async () => {
  const fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
    expect(init?.method).toBe('GET'); return Response.json(state())
  }); vi.stubGlobal('fetch', fetch)
  const config = taskRecoveryConfigFixture({ value: hidden })
  const view = render(<TaskRecoveryVisibility sessionId="first" configScope={config.scope} />)
  await act(async () => { config.show(true) })
  await screen.findByRole('button', { name: 'Existing task controls' })
  view.rerender(<TaskRecoveryVisibility sessionId="second" configScope={config.scope} />)
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
  expect(String(fetch.mock.calls[1]![0])).toContain('sessionId=second')
  await act(async () => { config.show(false) })
  expect(view.container.innerHTML).toBe('')
})

it('aborts an active read when hidden and ignores a stale completion', async () => {
  const pending = deferred<Response>()
  let signal: AbortSignal | undefined
  const fetch = vi.fn((_url: unknown, init?: RequestInit) => { signal = init?.signal ?? undefined; return pending.promise })
  vi.stubGlobal('fetch', fetch)
  const config = taskRecoveryConfigFixture()
  const view = render(<TaskRecoveryVisibility sessionId="fixture" configScope={config.scope} />)
  expect(fetch).toHaveBeenCalledTimes(1)
  await act(async () => { config.show(false) })
  expect(signal?.aborted).toBe(true)
  await act(async () => { pending.resolve(Response.json(state())) })
  expect(view.container.innerHTML).toBe('')
  expect(fetch).toHaveBeenCalledTimes(1)
})

it.each([['stop', 'Stop this task', 'stopped'], ['manual', 'Take over manually', 'manual']] as const)(
  'never replays an interrupted %s safety exit after hiding', async (action, label, resultingMode) => {
    let current = state(), postSignal: AbortSignal | undefined
    const reply = deferred<Response>()
    const actions: string[] = []
    const fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
      if (init?.method === 'POST') {
        actions.push(JSON.parse(String(init.body)).action)
        current = { ...current, mode: resultingMode, revision: 6 }
        postSignal = init.signal ?? undefined
        return reply.promise
      }
      return Response.json(current)
    })
    vi.stubGlobal('fetch', fetch)
    const config = taskRecoveryConfigFixture()
    const view = render(<TaskRecoveryVisibility sessionId="fixture" configScope={config.scope} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Existing task controls' }))
    await waitFor(() => expect(screen.getByRole('button', { name: label })).toHaveProperty('disabled', false))
    fireEvent.click(screen.getByRole('button', { name: label }))
    expect(actions).toEqual([action])
    await act(async () => { config.show(false) })
    expect(postSignal?.aborted).toBe(true)
    expect(view.container.querySelector('dialog')).toBeNull()
    await act(async () => { reply.resolve(Response.json(current)) })
    expect(view.container.innerHTML).toBe('')
    const readsBefore = fetch.mock.calls.filter(([, init]) => init?.method === 'GET').length
    await act(async () => { config.show(true) })
    fireEvent.click(await screen.findByRole('button', { name: 'Existing task controls' }))
    await screen.findByText(`Recorded state: ${resultingMode}`, { exact: false })
    expect(screen.getByText('Requests reserved: 3 / 10', { exact: false })).toBeTruthy()
    expect(fetch.mock.calls.filter(([, init]) => init?.method === 'GET').length).toBeGreaterThan(readsBefore)
    expect(actions).toEqual([action])
  },
)
