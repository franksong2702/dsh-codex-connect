import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { AdaptiveTaskControl } from '../../src/client/AdaptiveTaskControl.tsx'
import { ADAPTIVE_TASK_MODELS, ADAPTIVE_TASK_START } from '../../src/adaptive-task-contract.ts'
import type { AdaptiveTaskState } from '../../src/adaptive-task-contract.ts'
let element: HTMLDivElement | undefined
let root: Root | undefined
const initial = (): AdaptiveTaskState => ({ mode: 'off', revision: 0, reserved: 0, maximumRequests: 40,
  canStart: true, eligibility: 'not-probed', capabilities: ADAPTIVE_TASK_MODELS.map(model => ({ model, efforts: ['low', 'medium', 'high', 'max'] })) })
const mount = (language: string, sessionId = 'fixture-session') => {
  element = document.createElement('div'); document.body.append(element); root = createRoot(element)
  root.render(createElement(AdaptiveTaskControl, { language, sessionId }))
}
afterEach(() => { root?.unmount(); element?.remove(); root = undefined; element = undefined; vi.unstubAllGlobals() })
it.each(['en', 'zh'])('requires a visible scoped opt-in and permits manual exit in %s at phone width', async language => {
  await page.viewport(390, 844)
  let state = initial(); const mutations: any[] = []
  const fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
    if (init?.method === 'POST') {
      const command = JSON.parse(String(init.body)); mutations.push(command)
      state = command.action === 'start' ? { ...state, mode: 'auto', revision: 1, canStart: false, requested: ADAPTIVE_TASK_START }
        : { ...state, mode: 'manual', revision: 2 }
    }
    return Response.json(state)
  })
  vi.stubGlobal('fetch', fetch); mount(language)
  const button = language === 'zh' ? '模型选择' : 'Model choice'
  await expect.element(page.getByRole('button', { name: button, exact: true })).toBeVisible()
  expect(fetch).not.toHaveBeenCalled()
  await page.getByRole('button', { name: button, exact: true }).click()
  const start = page.getByRole('button', { name: language === 'zh' ? '按这些范围开始' : 'Start with these limits' })
  await expect.element(start).toBeEnabled()
  expect(mutations).toHaveLength(0)
  const dialog = document.querySelector('dialog')!
  expect(dialog.getBoundingClientRect().width).toBeLessThanOrEqual(390)
  expect(dialog.scrollWidth).toBeLessThanOrEqual(dialog.clientWidth + 1)
  await start.click()
  await expect.element(page.getByRole('button', { name: language === 'zh' ? '切回手动' : 'Take over manually' })).toBeEnabled()
  expect(mutations).toHaveLength(1)
  expect(mutations[0]).toMatchObject({ action: 'start', sessionId: 'fixture-session', revision: 0, maximumRequests: 40, models: [...ADAPTIVE_TASK_MODELS] })
  expect(mutations[0].operationId).toMatch(/^[0-9a-f-]{36}$/)
  expect(dialog.textContent).toContain(language === 'zh' ? '尚未发起模型请求' : 'No model request yet')
  await page.getByRole('button', { name: language === 'zh' ? '切回手动' : 'Take over manually' }).click()
  await vi.waitFor(() => expect(mutations).toHaveLength(2))
  expect(mutations[1]).toMatchObject({ action: 'manual', revision: 1 })
})
it('does not retry a lost mutation response or present unconfirmed success', async () => {
  let state = initial(); let mutations = 0
  vi.stubGlobal('fetch', vi.fn(async (_url: unknown, init?: RequestInit) => {
    if (init?.method === 'POST') {
      mutations++; state = { ...state, mode: 'auto', revision: 1, requested: ADAPTIVE_TASK_START, canStart: false }
      throw new Error('Synthetic response loss after commit')
    }
    return Response.json(state)
  }))
  mount('en'); await page.getByRole('button', { name: 'Model choice', exact: true }).click()
  await page.getByRole('button', { name: 'Start with these limits' }).click()
  await expect.element(page.getByRole('alert')).toBeVisible()
  expect(mutations).toBe(1)
  await expect.element(page.getByRole('button', { name: 'Start with these limits' })).toBeDisabled()
  await page.getByRole('button', { name: 'Read state again' }).click()
  await expect.element(page.getByRole('button', { name: 'Take over manually' })).toBeEnabled()
  expect(mutations).toBe(1)
})
it('keeps unavailable state non-actionable and never calls an activation endpoint', async () => {
  const fetch = vi.fn(async () => new Response(null, { status: 401 })); vi.stubGlobal('fetch', fetch)
  mount('zh'); await page.getByRole('button', { name: '模型选择', exact: true }).click()
  await expect.element(page.getByRole('alert')).toBeVisible()
  expect(document.querySelectorAll('input')).toHaveLength(0)
  expect(fetch.mock.calls).toHaveLength(1)
})
it('does not carry an old session response or authority into a new conversation', async () => {
  let release!: (response: Response) => void
  vi.stubGlobal('fetch', vi.fn(async () => new Promise<Response>(resolve => { release = resolve })))
  mount('en', 'first'); await page.getByRole('button', { name: 'Model choice', exact: true }).click()
  await vi.waitFor(() => expect(release).toBeDefined())
  root!.render(createElement(AdaptiveTaskControl, { language: 'en', sessionId: 'second' }))
  release(Response.json({ ...initial(), mode: 'auto', revision: 1, requested: ADAPTIVE_TASK_START }))
  await vi.waitFor(() => expect(document.querySelector('dialog')).toBeNull())
  expect(document.body.textContent).not.toContain('Automatic selection is allowed')
})
