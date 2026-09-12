import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { SplitApprovalCard } from '../../src/client/SplitApprovalCard.tsx'
import type { SplitApprovalView } from '../../src/split-approval-view.ts'
let host: HTMLDivElement
let root: Root
const view = (phase: SplitApprovalView['phase'] = 'awaiting-approval'): SplitApprovalView => ({
  id: 'offer-one', reviewDigest: 'b'.repeat(64), phase,
  review: { workspaceLabel: 'Fixture workspace', brief: '<script>untrusted task text</script>',
    files: [{ path: 'src/example.ts', sha256: 'a'.repeat(64), lines: 2 }], model: 'gpt-5.6-luna', effort: 'low',
    maximumRequests: 6, timeoutMs: 90000, contextPolicy: 'isolated-system-and-approved-snapshots', workerSystemPrompt: 'Inspect approved snapshots only.' },
})
beforeEach(async () => { await page.viewport(360, 800); host = document.createElement('div'); document.body.append(host); root = createRoot(host) })
afterEach(() => { root.unmount(); host.remove(); vi.restoreAllMocks() })
it.each(['en', 'zh'] as const)('shows exact scope and requires an explicit %s decision without HTML execution', async locale => {
  const decide = vi.fn(async () => true)
  root.render(createElement(SplitApprovalCard, { view: view(), locale, onDecide: decide, onRevoke: vi.fn(async () => {}) }))
  await vi.waitFor(() => expect(host.textContent).toContain('src/example.ts'))
  expect(host.textContent).toContain('a'.repeat(64)); expect(host.textContent).toContain('gpt-5.6-luna')
  expect(host.textContent).toContain('<script>untrusted task text</script>'); expect(host.querySelector('script')).toBeNull()
  expect(host.scrollWidth).toBeLessThanOrEqual(window.innerWidth)
  expect(decide).not.toHaveBeenCalled()
  await page.getByRole('button', { name: locale === 'en' ? 'Approve once' : '仅批准这一次', exact: true }).click()
  expect(decide).toHaveBeenCalledExactlyOnceWith('offer-one', 'b'.repeat(64), 'allow-once')
  expect(host.querySelector('button')?.disabled).toBe(true)
})
it('rejects separately and keeps unknown outcomes locked against duplicate decisions', async () => {
  const decide = vi.fn(async () => { throw new Error('transport lost') })
  root.render(createElement(SplitApprovalCard, { view: view(), onDecide: decide, onRevoke: vi.fn(async () => {}) }))
  await page.getByRole('button', { name: 'Reject', exact: true }).click()
  await vi.waitFor(() => expect(host.querySelector('[role="alert"]')).not.toBeNull())
  expect(decide).toHaveBeenCalledExactlyOnceWith('offer-one', 'b'.repeat(64), 'reject')
  expect([...host.querySelectorAll('button')].filter(button => ['Approve once', 'Reject'].includes(button.textContent!)).every(button => button.disabled)).toBe(true)
})
it('withdraws while running but does not display cleanup success until the host confirms it', async () => {
  const stopped = Promise.withResolvers<void>()
  const revoke = vi.fn(() => stopped.promise)
  const props = { view: view('running'), onDecide: vi.fn(async () => true), onRevoke: revoke }
  root.render(createElement(SplitApprovalCard, props))
  await page.getByRole('button', { name: 'Revoke and stop' }).click()
  expect(revoke).toHaveBeenCalledExactlyOnceWith('offer-one')
  expect(host.textContent).not.toContain('Revoked; worker cleanup confirmed')
  root.render(createElement(SplitApprovalCard, { ...props, view: view('revoking') }))
  await vi.waitFor(() => expect(host.textContent).toContain('Stopping; cleanup not yet confirmed'))
  stopped.resolve()
  root.render(createElement(SplitApprovalCard, { ...props, view: view('revoked') }))
  await vi.waitFor(() => expect(host.textContent).toContain('Revoked; worker cleanup confirmed'))
  expect(host.querySelector('button')).toBeNull()
})
it('isolates an old in-flight decision from a replacement offer', async () => {
  const first = Promise.withResolvers<boolean>()
  const decide = vi.fn((id: string) => id === 'offer-one' ? first.promise : Promise.resolve(true))
  const props = { view: view(), onDecide: decide, onRevoke: vi.fn(async () => {}) }
  root.render(createElement(SplitApprovalCard, props))
  await page.getByRole('button', { name: 'Approve once', exact: true }).click()
  root.render(createElement(SplitApprovalCard, { ...props, view: { ...view(), id: 'offer-two' } }))
  await vi.waitFor(() => expect(host.querySelector('button')?.disabled).toBe(false))
  first.reject(new Error('old request lost'))
  await page.getByRole('button', { name: 'Approve once', exact: true }).click()
  expect(decide).toHaveBeenLastCalledWith('offer-two', 'b'.repeat(64), 'allow-once')
  expect(host.querySelector('[role="alert"]')).toBeNull()
})
it('does not enable decisions for ready or terminal states', async () => {
  const decide = vi.fn(async () => true)
  for (const phase of ['ready', 'completed', 'rejected', 'cancelled', 'unavailable', 'failed', 'revoked', 'disabled'] as const) {
    root.render(createElement(SplitApprovalCard, { view: view(phase), onDecide: decide, onRevoke: vi.fn(async () => {}) }))
    await vi.waitFor(() => expect([...host.querySelectorAll('button')].some(button => button.textContent === 'Approve once')).toBe(false))
  }
  expect(decide).not.toHaveBeenCalled()
})
