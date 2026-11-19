/** Recovery-only shipping surface; activation and delegation consent UI are retired. */
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { TaskRecoveryVisibility } from '../../src/client/TaskRecoveryVisibility.tsx'
import { taskRecoveryConfigFixture } from '../support/task-recovery-config-fixture.ts'
import { afterEach, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { PublishedAdaptiveTaskControl } from '../../src/client/PublishedAdaptiveTaskControl.tsx'
import type { AdaptiveTaskState } from '../../src/adaptive-task-contract.ts'
let element: HTMLDivElement | undefined, root: Root | undefined
const state = (mode: AdaptiveTaskState['mode'] = 'off'): AdaptiveTaskState => ({ mode, revision: mode === 'off' ? 0 : 5,
  reserved: mode === 'off' ? 0 : 3, maximumRequests: 10, canStart: false, eligibility: 'not-probed', capabilities: [],
  unavailable: 'TASK_PUBLIC_RELEASE_PAUSED' })
const mount = (language = 'en', sessionId = 'release-fixture') => {
  element = document.createElement('div'); document.body.append(element); root = createRoot(element)
  root.render(createElement(PublishedAdaptiveTaskControl, { language, sessionId }))
}
afterEach(() => { root?.unmount(); element?.remove(); root = undefined; element = undefined; vi.unstubAllGlobals() })
const mountVisibility = (config: ReturnType<typeof taskRecoveryConfigFixture>) => {
  element = document.createElement('div'); document.body.append(element); root = createRoot(element)
  flushSync(() => { root!.render(createElement(TaskRecoveryVisibility, { configScope: config.scope, sessionId: 'visibility-fixture' })) })
}
it('waits for saved false before issuing any task read in Chromium', () => {
  const fetch = vi.fn(async () => Response.json(state('interrupted'))); vi.stubGlobal('fetch', fetch)
  const config = taskRecoveryConfigFixture({ status: 'loading', value: undefined })
  mountVisibility(config)
  expect(fetch).not.toHaveBeenCalled()
  flushSync(() => { config.show(false) })
  expect(element!.innerHTML).toBe('')
  expect(fetch).not.toHaveBeenCalled()
})
it('restores recovery when initially loading settings become unavailable in Chromium', async () => {
  const fetch = vi.fn(async () => Response.json(state('interrupted'))); vi.stubGlobal('fetch', fetch)
  const config = taskRecoveryConfigFixture({ status: 'loading', value: undefined })
  mountVisibility(config)
  expect(fetch).not.toHaveBeenCalled()
  flushSync(() => { config.update({ status: 'unavailable', mode: 'memory', writable: false }) })
  await expect.element(page.getByRole('button', { name: 'Existing task controls', exact: true })).toBeVisible()
  expect(fetch).toHaveBeenCalledTimes(1)
})
it('closes a hidden recovery dialog and restores fresh safety exits without resetting counters', async () => {
  await page.viewport(390, 844)
  let current = state('interrupted'); const actions: string[] = []
  const fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
    if (init?.method === 'POST') {
      const command = JSON.parse(String(init.body)); actions.push(command.action)
      current = { ...current, mode: command.action === 'manual' ? 'manual' : 'stopped', revision: current.revision + 1 }
    }
    return Response.json(current)
  }); vi.stubGlobal('fetch', fetch)
  const config = taskRecoveryConfigFixture()
  mountVisibility(config)
  const opener = page.getByRole('button', { name: 'Existing task controls', exact: true })
  await opener.click()
  await expect.element(page.getByRole('dialog', { name: 'Existing task recovery' })).toBeVisible()
  flushSync(() => { config.show(false) })
  expect(document.querySelector('dialog')).toBeNull()
  expect(element!.innerHTML).toBe('')
  expect(actions).toEqual([])
  const before = fetch.mock.calls.length
  flushSync(() => { config.show(true) })
  await opener.click()
  await expect.element(page.getByText('Requests reserved: 3 / 10', { exact: false })).toBeVisible()
  expect(fetch.mock.calls.length).toBeGreaterThan(before)
  await page.getByRole('button', { name: 'Stop this task', exact: true }).click()
  await vi.waitFor(() => expect(current.mode).toBe('stopped'))
  await page.getByRole('button', { name: 'Take over manually', exact: true }).click()
  await vi.waitFor(() => expect(actions).toEqual(['stop', 'manual']))
  expect(current.reserved).toBe(3)
})
it.each(['en', 'zh'])('hides the public entry and all opt-in choices for a confirmed ordinary conversation in %s', async language => {
  const fetch = vi.fn(async () => Response.json(state())); vi.stubGlobal('fetch', fetch); mount(language)
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
  expect(element!.querySelectorAll('button,input,select,dialog')).toHaveLength(0)
  expect(fetch.mock.calls[0]).not.toBeUndefined()
})
it.each(['en', 'zh'])('retains only safety exits for an existing task in %s at phone width', async language => {
  await page.viewport(390, 844)
  let current = state('interrupted'); const actions: string[] = []
  vi.stubGlobal('fetch', vi.fn(async (_url: unknown, init?: RequestInit) => {
    if (init?.method === 'POST') { const command = JSON.parse(String(init.body)); actions.push(command.action)
      current = { ...current, mode: command.action === 'manual' ? 'manual' : 'stopped', revision: current.revision + 1 } }
    return Response.json(current)
  }))
  mount(language)
  await page.getByRole('button', { name: language === 'zh' ? '已有任务控制' : 'Existing task controls', exact: true }).click()
  const stop = page.getByRole('button', { name: language === 'zh' ? '停止这项任务' : 'Stop this task', exact: true })
  await expect.element(stop).toBeEnabled()
  expect(document.querySelectorAll('input,select')).toHaveLength(0)
  expect(element!.textContent).toContain(language === 'zh' ? '已冻结' : 'are frozen')
  expect(element!.textContent).not.toContain(language === 'zh' ? '等待维护者验收' : 'pending maintainer acceptance')
  expect(element!.textContent).toContain('3 / 10')
  const dialog = document.querySelector('dialog')!
  expect(dialog.getBoundingClientRect().width).toBeLessThanOrEqual(390)
  expect(dialog.scrollWidth).toBeLessThanOrEqual(dialog.clientWidth + 1)
  await stop.click(); await vi.waitFor(() => expect(current.mode).toBe('stopped'))
  const manual = page.getByRole('button', { name: language === 'zh' ? '切回手动' : 'Take over manually', exact: true })
  await expect.element(manual).toBeEnabled(); await manual.click()
  await vi.waitFor(() => expect(actions).toEqual(['stop', 'manual']))
  expect(current.reserved).toBe(3)
})
it('does not replay a lost manual-exit response and requires a fresh authenticated read', async () => {
  let current = state('interrupted'), writes = 0
  vi.stubGlobal('fetch', vi.fn(async (_url: unknown, init?: RequestInit) => {
    if (init?.method === 'POST') { writes++; current = { ...current, mode: 'manual', revision: 6 }; throw new Error('Lost after commit') }
    return Response.json(current)
  }))
  mount(); await page.getByRole('button', { name: 'Existing task controls', exact: true }).click()
  const manual = page.getByRole('button', { name: 'Take over manually', exact: true })
  await expect.element(manual).toBeEnabled(); await manual.click()
  await expect.element(page.getByRole('alert')).toBeVisible()
  expect(writes).toBe(1); expect(element!.textContent).not.toContain('Recorded state: manual')
  await page.getByRole('button', { name: 'Read state again', exact: true }).click()
  await expect.element(page.getByText('Recorded state: manual', { exact: false })).toBeVisible()
  expect(writes).toBe(1); expect(current.reserved).toBe(3)
})
it('keeps unknown state distinct from off without exposing activation or assuming a task exists', async () => {
  const fetch = vi.fn(async () => Response.json({ error: 'TASK_BROWSER_AUTH_REQUIRED' }, { status: 401 }))
  vi.stubGlobal('fetch', fetch); mount()
  await page.getByRole('button', { name: 'Existing task controls', exact: true }).click()
  await expect.element(page.getByRole('alert')).toBeVisible()
  expect(element!.textContent).not.toContain('Recorded state: off')
  expect(element!.querySelectorAll('input')).toHaveLength(0)
  expect(fetch.mock.calls.length).toBeLessThanOrEqual(2)
  expect(await page.getByRole('button', { name: 'Take over manually', exact: true }).elements()).toHaveLength(0)
})
it('bounds read-only readiness retries without sending any mutation', async () => {
  let reads = 0
  vi.stubGlobal('fetch', vi.fn(async (_url: unknown, init?: RequestInit) => {
    expect(init?.method).toBe('GET')
    return ++reads < 3 ? Response.json({ error: 'TASK_LIVE_ROOT_REQUIRED' }, { status: 409 }) : Response.json(state('interrupted'))
  }))
  mount(); await expect.element(page.getByRole('button', { name: 'Existing task controls', exact: true })).toBeVisible()
  expect(reads).toBe(3)
})
it.each([404, 405, 409])('keeps an initially routeless or rootless conversation entry-free after bounded GET retries: %s', async status => {
  const fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
    expect(init?.method).toBe('GET')
    return status === 409 ? Response.json({ error: 'TASK_LIVE_ROOT_REQUIRED' }, { status }) : new Response('', { status })
  })
  vi.stubGlobal('fetch', fetch); mount()
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(3), { timeout: 2_500 })
  // Absence is not decoded into an invented off state or an existing-task entry.
  await vi.waitFor(() => expect(element!.querySelectorAll('button,dialog')).toHaveLength(0))
  expect(element!.textContent).not.toContain('Recorded state: off')
})
it.each([[404, 409], [409, 405], [405, 404]])('recovers a returning task route after mixed initial gaps %s then %s', async (first, second) => {
  let reads = 0
  const fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
    expect(init?.method).toBe('GET')
    const status = [first, second][reads++]
    if (status === undefined) return Response.json(state('interrupted'))
    return status === 409 ? Response.json({ error: 'TASK_LIVE_ROOT_REQUIRED' }, { status }) : new Response('', { status })
  })
  vi.stubGlobal('fetch', fetch); mount()
  await expect.element(page.getByRole('button', { name: 'Existing task controls', exact: true })).toBeVisible()
  expect(reads).toBe(3)
})
it('does not mistake other conflict errors for missing live-root evidence', async () => {
  const fetch = vi.fn(async () => Response.json({ error: 'TASK_STATE_UNAVAILABLE' }, { status: 409 }))
  vi.stubGlobal('fetch', fetch); mount()
  await page.getByRole('button', { name: 'Existing task controls', exact: true }).click()
  await expect.element(page.getByRole('alert')).toBeVisible()
  expect(fetch).toHaveBeenCalledTimes(2)
  expect(element!.textContent).not.toContain('Recorded state: off')
  expect(await page.getByRole('button', { name: 'Take over manually', exact: true }).elements()).toHaveLength(0)
})
it.each([['stop', 404], ['stop', 405], ['stop', 409], ['manual', 404], ['manual', 405], ['manual', 409]] as const)
  ('retains a known task re-read path after %s fails with %s and never replays POST', async (action, status) => {
  let broken = false, writes = 0
  const fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
    if (init?.method === 'POST') { writes++; broken = true }
    if (!broken) return Response.json(state('interrupted'))
    return status === 409 ? Response.json({ error: 'TASK_LIVE_ROOT_REQUIRED' }, { status }) : new Response('', { status })
  })
  vi.stubGlobal('fetch', fetch); mount()
  await page.getByRole('button', { name: 'Existing task controls', exact: true }).click()
  await page.getByRole('button', { name: action === 'stop' ? 'Stop this task' : 'Take over manually', exact: true }).click()
  await expect.element(page.getByRole('alert')).toBeVisible()
  expect(writes).toBe(1)
  expect(await page.getByRole('button', { name: 'Take over manually', exact: true }).elements()).toHaveLength(0)
  await page.getByRole('button', { name: 'Read state again', exact: true }).click()
  await expect.element(page.getByRole('alert')).toBeVisible()
  expect(writes).toBe(1)
  broken = false
  await page.getByRole('button', { name: 'Read state again', exact: true }).click()
  await expect.element(page.getByRole('button', { name: 'Take over manually', exact: true })).toBeEnabled()
  expect(writes).toBe(1)
})
it('does not parse missing-route bodies and cancels initial backoff when the session changes', async () => {
  let oldSignal: AbortSignal | undefined, bodyReads = 0
  const fetch = vi.fn(async (url: unknown, init?: RequestInit) => {
    if (!String(url).includes('sessionId=old')) return Response.json(state())
    oldSignal = init?.signal as AbortSignal
    const response = new Response('', { status: 404 })
    response.json = async () => { bodyReads++; throw new Error('Missing route has no JSON body') }
    return response
  })
  vi.stubGlobal('fetch', fetch); mount('en', 'old')
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
  root!.render(createElement(PublishedAdaptiveTaskControl, { language: 'en', sessionId: 'new' }))
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
  expect(oldSignal!.aborted).toBe(true)
  await new Promise(resolve => setTimeout(resolve, 800))
  expect(fetch).toHaveBeenCalledTimes(2)
  expect(bodyReads).toBe(0)
  expect(element!.querySelectorAll('button,dialog')).toHaveLength(0)
})
it('keeps a failed legacy-task read recoverable without enabling stale safety exits', async () => {
  let broken = false
  vi.stubGlobal('fetch', vi.fn(async (_url: unknown, init?: RequestInit) => {
    expect(init?.method).toBe('GET')
    return broken ? new Response('', { status: 400 }) : Response.json(state('interrupted'))
  }))
  mount()
  await expect.element(page.getByRole('button', { name: 'Existing task controls', exact: true })).toBeVisible()
  broken = true
  await page.getByRole('button', { name: 'Existing task controls', exact: true }).click()
  await expect.element(page.getByRole('alert')).toBeVisible()
  expect(await page.getByRole('button', { name: 'Take over manually', exact: true }).elements()).toHaveLength(0)
  expect(element!.textContent).not.toContain('Recorded state: off')
  broken = false
  await page.getByRole('button', { name: 'Read state again', exact: true }).click()
  await expect.element(page.getByText('Recorded state: interrupted', { exact: false })).toBeVisible()
  await expect.element(page.getByRole('button', { name: 'Take over manually', exact: true })).toBeEnabled()
})
it('cancels an old session read and never lets its late response create controls in the new session', async () => {
  let resolveOld!: (value: Response) => void, oldSignal: AbortSignal | undefined
  const fetch = vi.fn(async (url: unknown, init?: RequestInit) => {
    if (String(url).includes('sessionId=old')) { oldSignal = init?.signal as AbortSignal; return new Promise<Response>(resolve => { resolveOld = resolve }) }
    return Response.json(state())
  })
  vi.stubGlobal('fetch', fetch); mount('en', 'old')
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
  root!.render(createElement(PublishedAdaptiveTaskControl, { language: 'en', sessionId: 'new' }))
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2)); expect(oldSignal!.aborted).toBe(true)
  resolveOld(Response.json(state('auto')))
  await new Promise(resolve => setTimeout(resolve, 40))
  expect(element!.querySelectorAll('button,input')).toHaveLength(0)
})
it.each(['en', 'zh'])('explains alpha.3 recovery-only without offering activation in %s', async language => {
  const current = { ...state('interrupted'), unavailable: 'TASK_HOST_RECOVERY_ONLY' }
  vi.stubGlobal('fetch', vi.fn(async () => Response.json(current)))
  mount(language)
  await page.getByRole('button', { name: language === 'zh' ? '已有任务控制' : 'Existing task controls', exact: true }).click()
  expect(element!.textContent).toContain(language === 'zh' ? '当前 Harness 版本仅支持旧任务恢复' : 'This Harness version supports recovery of old tasks only')
  expect(element!.textContent).toContain('3 / 10')
  expect(element!.querySelectorAll('input,select')).toHaveLength(0)
  await expect.element(page.getByRole('button', { name: language === 'zh' ? '停止这项任务' : 'Stop this task', exact: true })).toBeEnabled()
  await expect.element(page.getByRole('button', { name: language === 'zh' ? '切回手动' : 'Take over manually', exact: true })).toBeEnabled()
})
