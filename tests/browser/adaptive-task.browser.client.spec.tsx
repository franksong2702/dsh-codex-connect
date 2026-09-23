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
it.each(['en', 'zh'])('distinguishes GPT-5.6 and GPT-6 recorded/requested routes in %s', async language => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ ...initial(), mode: 'auto', canStart: false, reserved: 1,
    current: { model: 'gpt-5.6-sol', effort: 'medium' }, requested: { model: 'gpt-6-sol', effort: 'max' } })))
  mount(language)
  await page.getByRole('button', { name: language === 'zh' ? '模型选择' : 'Model choice', exact: true }).click()
  await expect.element(page.getByText('gpt-5.6-sol / medium', { exact: false })).toBeVisible()
  await expect.element(page.getByText('gpt-6-sol / max', { exact: false })).toBeVisible()
})
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
  await expect.element(page.getByText(language === 'zh' ? '现在开始将授权的主模型与档位：gpt-5.6-sol: medium'
    : 'Main model and effort allowed if started now: gpt-5.6-sol: medium', { exact: true })).toBeVisible()
  await expect.element(page.getByRole('spinbutton', { name: language === 'zh' ? '整项任务的请求上限' : 'Request limit (whole task)' })).toBeVisible()
  expect(mutations).toHaveLength(0)
  const dialog = document.querySelector('dialog')!
  expect(dialog.getBoundingClientRect().width).toBeLessThanOrEqual(390)
  expect(dialog.scrollWidth).toBeLessThanOrEqual(dialog.clientWidth + 1)
  await start.click()
  await expect.element(page.getByRole('button', { name: language === 'zh' ? '切回手动' : 'Take over manually' })).toBeEnabled()
  expect(mutations).toHaveLength(1)
  expect(mutations[0]).toMatchObject({ action: 'start', sessionId: 'fixture-session', revision: 0, maximumRequests: 40, models: [ADAPTIVE_TASK_START.model] })
  expect(mutations[0].operationId).toMatch(/^[0-9a-f-]{36}$/)
  expect(mutations[0].efforts).toEqual({ [ADAPTIVE_TASK_START.model]: [ADAPTIVE_TASK_START.effort] })
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

it('requires an explicit additional model and effort before expanding the grant', async () => {
  let command: any
  vi.stubGlobal('fetch', vi.fn(async (_url: unknown, init?: RequestInit) => {
    if (init?.method === 'POST') command = JSON.parse(String(init.body))
    return Response.json(initial())
  }))
  mount('en'); await page.getByRole('button', { name: 'Model choice', exact: true }).click()
  await expect.element(page.getByRole('button', { name: 'Start with these limits' })).toBeEnabled()
  await page.getByText('Allowed main models and effort levels', { exact: true }).click()
  await expect.element(page.getByRole('checkbox', { name: 'gpt-5.6-sol / medium', exact: true })).toBeDisabled()
  await page.getByRole('checkbox', { name: /^gpt-5\.6-luna:/ }).click()
  await expect.element(page.getByRole('button', { name: 'Start with these limits' })).toBeDisabled()
  await page.getByRole('checkbox', { name: 'gpt-5.6-luna / max', exact: true }).click()
  await expect.element(page.getByText('Main model and effort allowed if started now: gpt-5.6-sol: medium; gpt-5.6-luna: max', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Start with these limits' }).click()
  await vi.waitFor(() => expect(command).toBeDefined())
  expect(command.models).toEqual(['gpt-5.6-sol', 'gpt-5.6-luna'])
  expect(command.efforts).toEqual({ 'gpt-5.6-sol': ['medium'], 'gpt-5.6-luna': ['max'] })
})
it('keeps unavailable state non-actionable and never calls an activation endpoint', async () => {
  const fetch = vi.fn(async () => new Response(null, { status: 401 })); vi.stubGlobal('fetch', fetch)
  mount('zh'); await page.getByRole('button', { name: '模型选择', exact: true }).click()
  await expect.element(page.getByRole('alert')).toBeVisible()
  expect(document.querySelectorAll('input')).toHaveLength(0)
  expect(fetch.mock.calls).toHaveLength(1)
  expect(document.body.textContent).toContain('尚未确认当前任务状态')
  expect(document.body.textContent).not.toContain('手动选择，尚未开启自动安排')
})
it('waits only for a restoring live root and renders its interrupted grant without dispatching', async () => {
  let calls = 0
  const fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
    expect(init?.method).not.toBe('POST')
    if (++calls < 3) return Response.json({ error: 'TASK_LIVE_ROOT_REQUIRED' }, { status: 409 })
    return Response.json({ ...initial(), mode: 'interrupted', canStart: false, revision: 3, reserved: 2 })
  })
  vi.stubGlobal('fetch', fetch); mount('en')
  await page.getByRole('button', { name: 'Model choice', exact: true }).click()
  await expect.element(page.getByRole('button', { name: 'Resume with the same limits' })).toBeEnabled()
  expect(calls).toBe(3)
  expect(document.body.textContent).toContain('Requests reserved: 2 / 40')
})
it('bounds restoration reads and does not describe unavailable authority as disabled', async () => {
  const fetch = vi.fn(async () => Response.json({ error: 'TASK_LIVE_ROOT_REQUIRED' }, { status: 409 }))
  vi.stubGlobal('fetch', fetch); mount('en')
  await page.getByRole('button', { name: 'Model choice', exact: true }).click()
  await expect.element(page.getByRole('alert')).toBeVisible()
  expect(fetch).toHaveBeenCalledTimes(3)
  expect(document.body.textContent).toContain('Current task state has not been confirmed')
  expect(document.body.textContent).not.toContain('Manual selection; automation is off')
  expect(document.querySelectorAll('input')).toHaveLength(0)
})
it('cancels pending restoration retries when the session changes', async () => {
  const fetch = vi.fn(async () => Response.json({ error: 'TASK_LIVE_ROOT_REQUIRED' }, { status: 409 }))
  vi.stubGlobal('fetch', fetch); mount('en', 'first')
  await page.getByRole('button', { name: 'Model choice', exact: true }).click()
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
  root!.render(createElement(AdaptiveTaskControl, { language: 'en', sessionId: 'second' }))
  await vi.waitFor(() => expect(document.querySelector('dialog')).toBeNull())
  await new Promise(resolve => setTimeout(resolve, 800))
  expect(fetch).toHaveBeenCalledTimes(1)
})
it('cancels a pending restoration retry when the panel is closed', async () => {
  const fetch = vi.fn(async () => Response.json({ error: 'TASK_LIVE_ROOT_REQUIRED' }, { status: 409 }))
  vi.stubGlobal('fetch', fetch); mount('en')
  await page.getByRole('button', { name: 'Model choice', exact: true }).click()
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await new Promise(resolve => setTimeout(resolve, 800))
  expect(fetch).toHaveBeenCalledTimes(1)
})
it('does not confuse manual Default effort with a task that has never requested a model', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ ...initial(), mode: 'manual', canStart: false, reserved: 4 })))
  mount('en'); await page.getByRole('button', { name: 'Model choice', exact: true }).click()
  await expect.element(page.getByText('Manual selection; automation is off', { exact: true })).toBeVisible()
  expect(document.body.textContent).toContain('No explicit Codex model/effort pair recorded')
  expect(document.body.textContent).not.toContain('No model request yet')
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
