/** Shipping closed-gate surface. Original full controls retain their separate internal tests. */
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
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
