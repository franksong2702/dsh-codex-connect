import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { AdaptiveTaskControl } from '../../src/client/AdaptiveTaskControl.tsx'
import type { AdaptiveTaskState, TaskDelegationState } from '../../src/adaptive-task-contract.ts'

let element: HTMLDivElement | undefined
let root: Root | undefined

const capabilities = [
  { model: 'gpt-5.6-sol', efforts: ['low', 'medium', 'high', 'max'] },
  { model: 'gpt-5.6-terra', efforts: ['low', 'medium', 'high'] },
]
const delegation = (overrides: Partial<TaskDelegationState> = {}): TaskDelegationState => ({
  version: 2, idle: true, enabled: false, canDowngrade: false, files: [], routes: [],
  maxRequests: 6, timeoutMs: 90_000, runs: [], ...overrides,
})
const state = (overrides: Partial<AdaptiveTaskState> = {}): AdaptiveTaskState => ({
  mode: 'off', revision: 4, reserved: 0, maximumRequests: 40, canStart: true,
  eligibility: 'not-probed', capabilities, ...overrides,
})
const v1 = (): AdaptiveTaskState => state({ delegation: delegation({ version: 1 }) })
const v2 = (overrides: Partial<TaskDelegationState> = {}): AdaptiveTaskState => state({
  mode: 'auto', canStart: false, delegation: delegation(overrides),
})
const mount = (language = 'en', sessionId = 'fixture-session') => {
  element = document.createElement('div'); document.body.append(element)
  root = createRoot(element); root.render(createElement(AdaptiveTaskControl, { language, sessionId }))
}
const open = async (language = 'en') => {
  await page.getByRole('button', { name: language === 'zh' ? '模型选择' : 'Model choice', exact: true }).click()
  await expect.element(page.getByRole('dialog')).toBeVisible()
  await expect.element(page.getByRole('button', { name: language === 'zh' ? '重新读取状态' : 'Read state again', exact: true })).toBeVisible()
}

afterEach(() => {
  root?.unmount(); element?.remove(); root = undefined; element = undefined; vi.unstubAllGlobals()
})

it.each(['en', 'zh'])('does not render delegation controls when the host omits capability (%s)', async language => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json(state())))
  mount(language); await open(language)
  expect(document.querySelector('[aria-label="Optional read-only helper"], [aria-label="可选只读子任务"]')).toBeNull()
})

it('requires an explicit v1 upgrade and never grants delegation during upgrade', async () => {
  let current = v1(); const posts: any[] = []
  vi.stubGlobal('fetch', vi.fn(async (_url: unknown, init?: RequestInit) => {
    if (init?.method === 'POST') {
      const command = JSON.parse(String(init.body)); posts.push(command)
      current = { ...current, revision: 5, delegation: v2().delegation! }
    }
    return Response.json(current)
  }))
  mount(); await open()
  await expect.element(page.getByRole('button', { name: 'Prepare task upgrade', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Prepare task upgrade', exact: true }).click()
  await vi.waitFor(() => expect(posts).toHaveLength(1))
  expect(posts[0]).toMatchObject({ action: 'upgrade', sessionId: 'fixture-session', revision: 4 })
  expect(posts[0]).not.toHaveProperty('files'); expect(posts[0]).not.toHaveProperty('routes')
  expect(posts[0]).not.toHaveProperty('disclose'); expect(posts[0]).not.toHaveProperty('maxChildRequests')
  await expect.element(page.getByText('No delegation permission', { exact: true })).toBeVisible()
  expect(document.body.textContent).not.toContain('Read-only delegation is authorized')
})

it('starts v2 consent unchecked and sends the exact bounded authorization payload', async () => {
  let current = v2(); let command: any
  vi.stubGlobal('fetch', vi.fn(async (_url: unknown, init?: RequestInit) => {
    if (init?.method === 'POST') command = JSON.parse(String(init.body))
    return Response.json(current)
  }))
  mount(); await open()
  await page.getByText('Set explicit helper scope', { exact: true }).click()
  await expect.element(page.getByRole('checkbox', { name: 'Child gpt-5.6-sol / medium', exact: true })).not.toBeChecked()
  await expect.element(page.getByRole('button', { name: 'Authorize exactly this scope', exact: true })).toBeDisabled()
  await page.getByRole('checkbox', { name: 'Child gpt-5.6-sol / medium', exact: true }).click()
  await page.getByRole('textbox').fill('docs/brief.md\nnotes/plan.txt')
  await page.getByRole('checkbox', { name: /I reviewed these files and allow their contents/ }).click()
  await expect.element(page.getByRole('button', { name: 'Authorize exactly this scope', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Authorize exactly this scope', exact: true }).click()
  await vi.waitFor(() => expect(command).toBeDefined())
  expect(command).toMatchObject({ action: 'delegate-enable', sessionId: 'fixture-session', revision: 4,
    files: ['docs/brief.md', 'notes/plan.txt'], routes: [{ model: 'gpt-5.6-sol', effort: 'medium' }],
    maxChildRequests: 6, timeoutMs: 90_000, disclose: true })
  expect(Object.keys(command).sort()).toEqual(['action', 'disclose', 'files', 'maxChildRequests', 'operationId', 'revision', 'routes', 'sessionId', 'timeoutMs'])
  expect(command.maxChildRequests).toBeGreaterThanOrEqual(1); expect(command.maxChildRequests).toBeLessThanOrEqual(6)
  expect(command.timeoutMs).toBeGreaterThanOrEqual(1_000); expect(command.timeoutMs).toBeLessThanOrEqual(90_000)
})

it('shows unknown delivery and keeps downgrade disabled', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json(v2({ enabled: true,
    files: ['docs/brief.md'], routes: [{ model: 'gpt-5.6-sol', effort: 'medium' }],
    runs: [{ id: 'run-1234567890123456', state: 'failed', cleanup: 'verified', delivery: 'unknown', reserved: 1 }] }))))
  mount(); await open()
  await expect.element(page.getByText(/delivery unknown/)).toBeVisible()
  await expect.element(page.getByRole('button', { name: 'Archive and return to Phase 1 manual', exact: true })).toBeDisabled()
  expect(document.body.textContent).toContain('Unknown delivery or unverified cleanup blocks further delegation and downgrade.')
})

it('does not replay a lost authorization response and unlocks only after a fresh read', async () => {
  let posts = 0; let reads = 0
  vi.stubGlobal('fetch', vi.fn(async (_url: unknown, init?: RequestInit) => {
    if (init?.method === 'POST') { posts++; throw new Error('synthetic response loss') }
    reads++; return Response.json(v2())
  }))
  mount(); await open(); await page.getByText('Set explicit helper scope', { exact: true }).click()
  await page.getByRole('checkbox', { name: 'Child gpt-5.6-sol / medium', exact: true }).click()
  await page.getByRole('textbox').fill('docs/brief.md')
  await page.getByRole('checkbox', { name: /I reviewed these files and allow their contents/ }).click()
  await page.getByRole('button', { name: 'Authorize exactly this scope', exact: true }).click()
  await expect.element(page.getByRole('alert')).toBeVisible(); expect(posts).toBe(1)
  await expect.element(page.getByRole('checkbox', { name: 'Child gpt-5.6-sol / medium', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Read state again', exact: true }).click()
  await vi.waitFor(() => expect(reads).toBe(2))
  await expect.element(page.getByRole('checkbox', { name: 'Child gpt-5.6-sol / medium', exact: true })).toBeEnabled()
  expect(posts).toBe(1)
})

it('resets draft scope and authority when the session changes', async () => {
  const first = v2(); const second = state(); let active = first
  vi.stubGlobal('fetch', vi.fn(async (_url: string) => Response.json(active)))
  mount('en', 'first'); await open()
  await page.getByText('Set explicit helper scope', { exact: true }).click()
  await page.getByRole('checkbox', { name: 'Child gpt-5.6-sol / medium', exact: true }).click()
  await page.getByRole('textbox').fill('docs/brief.md')
  active = second; root!.render(createElement(AdaptiveTaskControl, { language: 'en', sessionId: 'second' }))
  await vi.waitFor(() => expect(document.querySelector('dialog')).toBeNull())
  await open()
  expect(document.querySelector('[aria-label="Optional read-only helper"]')).toBeNull()
  expect(document.body.textContent).not.toContain('docs/brief.md')
})
