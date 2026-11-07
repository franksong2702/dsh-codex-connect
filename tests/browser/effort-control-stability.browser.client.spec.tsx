import { createRoot, type Root } from 'react-dom/client'
import type { ModelDirectoryState } from '@deepseek-ai/dsh-client-ui-model-selection/client'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import { afterEach, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { OpenAICodexFastModeToggle } from '../../src/client/OpenAICodexFastModeToggle.tsx'
import { OpenAICodexQuotaIndicator } from '../../src/client/OpenAICodexQuotaIndicator.tsx'
import { en, type OpenAICodexSettingsKey } from '../../src/client/locales.ts'

let root: Root | undefined, host: HTMLDivElement | undefined
afterEach(() => { root?.unmount(); host?.remove(); vi.unstubAllGlobals() })
const t = (key: OpenAICodexSettingsKey, params: Record<string, unknown> = {}) =>
  Object.entries(params).reduce((value, [name, replacement]) => value.replace(`{${name}}`, String(replacement)), en[key])
const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => { requestAnimationFrame(() => { resolve() }) }))

it.each([{ width: 1280, height: 720 }, { width: 390, height: 844 }])(
  'keeps a synthetic composer stable through repeated/interrupted effort changes at $width × $height',
  async ({ width, height }) => {
    await page.viewport(width, height)
    let snapshot: ModelDirectoryState = { current: { provider: 'openai-codex', model: 'gpt-6.1-sol', reasoningEffort: 'high' },
      status: 'ready', routable: true, groups: [], failures: [], error: null }
    const listeners = new Set<() => void>()
    const directory: SnapshotStore<ModelDirectoryState> = {
      getSnapshot: () => snapshot,
      subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener) } },
      update: () => undefined,
      set: next => { snapshot = next; listeners.forEach(listener => { listener() }) },
    }
    const change = (next: Partial<ModelDirectoryState>) => { directory.set({ ...snapshot, ...next }) }
    let effort = 'high', revision = 0, mode = 'standard', generation = 0
    let quotaReads = 0, speedReads = 0, posts = 0
    vi.stubGlobal('fetch', vi.fn(async (path: string, init: RequestInit) => {
      if (!path.includes('/speed-mode')) {
        quotaReads++
        return new Response(JSON.stringify({ status: 'signed-in', usage: { rateLimits: [
          { id: 'codex', windows: [{ windowSeconds: 604800, remainingPercent: 72.5 }] },
          { id: 'codex_bengalfox', windows: [{ windowSeconds: 604800, remainingPercent: 18.5 }] },
        ] } }), { headers: { 'content-type': 'application/json' } })
      }
      if (init.method === 'POST') { posts++; mode = JSON.parse(String(init.body)).mode; revision++ }
      else speedReads++
      return new Response(JSON.stringify({ generation: `synthetic-${generation}`, revision, mode,
        model: snapshot.current!.model, modelSupported: true, hasAccount: true, selectionAvailable: true, eligibility: 'unknown' }),
      { headers: { 'content-type': 'application/json' } })
    }))
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    const begin = (next: string) => { effort = next; change({ status: 'selecting' }) }
    const settle = () => {
      generation++; revision = 0; mode = 'standard'
      change({ status: 'ready', current: { ...snapshot.current!, reasoningEffort: effort } })
    }
    root.render(<>
      <button onClick={() => { begin('high') }}>High</button>
      <button onClick={() => { begin('medium') }}>Medium</button>
      <button onClick={settle}>Complete</button>
      <button onClick={() => { change({ status: 'error', error: 'Synthetic failure' }) }}>Fail</button>
      <button onClick={() => { change({ status: 'idle' }) }}>Cancel</button>
      <button onClick={() => { change({ status: 'ready', error: null }) }}>Retry</button>
      <button onClick={() => { change({ current: { provider: 'openai-codex', model: 'gpt-5.3-codex-spark' }, status: 'selecting' }) }}>Spark</button>
      <button onClick={() => { change({ current: { provider: 'other', model: 'gpt-6.1-sol' }, status: 'ready' }) }}>Other provider</button>
      {/* Synthetic flex row: 28px model entry vs 30px speed entry reproduces
          the reported 76→74px mechanism. This is NOT Claude Style/DSH UI. */}
      <div data-testid="composer" style={{ position: 'fixed', bottom: 0, right: 0, left: 0,
        display: 'flex', alignItems: 'center', gap: 8, padding: '23px 12px' }}>
        <span style={{ display: 'inline-block', height: 28 }}>Model</span>
        <OpenAICodexFastModeToggle directory={directory} sessionId="synthetic-session" t={t} />
        <OpenAICodexQuotaIndicator directory={directory} t={t} />
      </div>
    </>)
    const trigger = page.getByRole('button', { name: en.speedMenuStandardTitle, exact: true })
    await expect.element(trigger).toBeEnabled()
    await expect.element(page.getByRole('status', { name: /^Codex/ })).toBeVisible()
    const button = await trigger.findElement()
    const quota = await page.getByRole('status', { name: /^Codex/ }).findElement()
    const composer = await page.getByTestId('composer').findElement()
    expect(composer.getBoundingClientRect().height).toBe(76)
    for (const next of ['Medium', 'High', 'Medium']) {
      await page.getByRole('button', { name: en.speedMenuStandardTitle, exact: true }).click()
      await expect.element(page.getByRole('menu')).toBeVisible()
      await page.getByRole('button', { name: next, exact: true }).click()
      await frame()
      expect(document.querySelector('[data-openai-codex-speed-menu]')).toBe(button)
      expect(button).toHaveProperty('disabled', true)
      expect(button.getAttribute('aria-expanded')).toBe('false')
      expect(document.querySelector('[data-openai-codex-quota]')).toBe(quota)
      expect(composer.getBoundingClientRect().height).toBe(76)
      expect(document.querySelector('[role="menu"]')).toBeNull()
      expect(posts).toBe(0)
      expect(quotaReads).toBe(1)
      await page.getByRole('button', { name: 'Complete', exact: true }).click()
      await expect.element(trigger).toBeEnabled()
      await frame()
      expect(document.querySelector('[data-openai-codex-speed-menu]')).toBe(button)
      expect(document.querySelector('[data-openai-codex-quota]')).toBe(quota)
      expect(composer.getBoundingClientRect().height).toBe(76)
      expect(document.querySelector('[role="menu"]')).toBeNull()
    }
    expect(speedReads).toBe(4)
    expect(quotaReads).toBe(1)
    // Failed/cancelled Host updates still lose eligibility and recover only
    // when the directory is ready again. Dismissal must not reopen the menu.
    for (const end of ['Fail', 'Cancel']) {
      await page.getByRole('button', { name: 'Medium', exact: true }).click()
      await page.getByRole('button', { name: end, exact: true }).click()
      await expect.poll(() => document.querySelector('[data-openai-codex-speed-menu]')).toBeNull()
      expect(document.querySelector('[data-openai-codex-quota]')).toBeNull()
      await page.getByRole('button', { name: 'Retry', exact: true }).click()
      await expect.element(trigger).toBeEnabled()
      await expect.element(page.getByRole('status', { name: /^Codex/ })).toBeVisible()
      expect(document.querySelector('[role="menu"]')).toBeNull()
    }
    await page.getByRole('button', { name: 'Spark', exact: true }).click()
    await expect.element(page.getByRole('status', { name: /18.5%/ })).toBeVisible()
    await expect.element(page.getByRole('button', { name: en.speedLoading, exact: true })).toBeDisabled()
    await page.getByRole('button', { name: 'Complete', exact: true }).click()
    await expect.element(trigger).toBeEnabled()
    await page.getByRole('button', { name: 'Other provider', exact: true }).click()
    await expect.poll(() => document.querySelector('[data-openai-codex-speed-menu]')).toBeNull()
    expect(document.querySelector('[data-openai-codex-quota]')).toBeNull()
    expect(posts).toBe(0)
  },
)
