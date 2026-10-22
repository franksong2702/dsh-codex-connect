import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { commands, page } from 'vitest/browser'
import { OpenAICodexSpeedControl } from '../../src/client/OpenAICodexSpeedControl.tsx'
import { en } from '../../src/client/locales.ts'

let root: Root | undefined
let host: HTMLDivElement | undefined
let outside: HTMLButtonElement | undefined
const touchCommands = commands as unknown as {
  tapTouch(selector: string): Promise<void>
}
afterEach(() => { root?.unmount(); host?.remove(); outside?.remove(); vi.unstubAllGlobals() })

it('uses Playwright touchscreen input in a 390x844 touch-capable context without accidental selection', async () => {
  await page.viewport(390, 844)
  expect(window.innerWidth).toBe(390)
  expect(window.innerHeight).toBe(844)
  expect(window.navigator.maxTouchPoints).toBeGreaterThan(0)

  let revision = 0
  let mode = 'standard'
  const posts: string[] = []
  vi.stubGlobal('fetch', vi.fn(async (_path: string, init: RequestInit) => {
    if (init.method === 'POST') {
      mode = JSON.parse(String(init.body)).mode
      revision++
      posts.push(mode)
    }
    return new Response(JSON.stringify({ generation: 'touch-speed', revision, mode, model: 'gpt-6.1-sol',
      modelSupported: true, hasAccount: true, selectionAvailable: true, eligibility: 'unknown' }),
    { headers: { 'content-type': 'application/json' } })
  }))

  host = document.createElement('div')
  host.style.position = 'fixed'
  host.style.right = '16px'
  host.style.bottom = '12px'
  document.body.append(host)
  outside = document.createElement('button')
  outside.type = 'button'
  outside.setAttribute('aria-label', 'Outside dismissal target')
  outside.setAttribute('data-touch-outside', '')
  outside.style.position = 'fixed'
  outside.style.left = '12px'
  outside.style.top = '12px'
  outside.style.width = '40px'
  outside.style.height = '40px'
  document.body.append(outside)

  root = createRoot(host)
  root.render(<OpenAICodexSpeedControl sessionId="touch-session" model="gpt-6.1-sol" t={key => en[key]} />)
  const trigger = page.getByRole('button', { name: en.speedMenuStandardTitle, exact: true })
  await expect.element(trigger).toHaveAttribute('aria-expanded', 'false')

  await touchCommands.tapTouch('[data-openai-codex-speed-menu="standard"]')
  const menu = page.getByRole('menu')
  await expect.element(menu).toBeVisible()
  expect(posts).toEqual([])

  await touchCommands.tapTouch('[data-openai-codex-speed-menu="standard"]')
  await expect.element(trigger).toHaveAttribute('aria-expanded', 'false')
  expect(posts).toEqual([])
  await touchCommands.tapTouch('[data-openai-codex-speed-menu="standard"]')
  await expect.element(page.getByRole('menu')).toBeVisible()

  await touchCommands.tapTouch(`[aria-label="${en.speedUltrafastDetails}"]`)
  await expect.element(page.getByRole('menuitem', { name: en.speedUltrafastDetails, exact: true })).toHaveAttribute('aria-expanded', 'true')
  await expect.element(page.getByText(en.ultrafastDisclosure, { exact: true })).toBeVisible()
  expect(posts).toEqual([])

  await touchCommands.tapTouch('[data-touch-outside]')
  await expect.poll(() => document.querySelector('[role="menu"]')).toBeNull()
  expect(posts).toEqual([])

  await touchCommands.tapTouch('[data-openai-codex-speed-menu="standard"]')
  await expect.element(page.getByRole('menu')).toBeVisible()
  await touchCommands.tapTouch('[data-speed-mode="fast"]')
  await expect.element(page.getByRole('button', { name: en.speedMenuFastTitle, exact: true })).toHaveAttribute('aria-pressed', 'true')
  expect(posts).toEqual(['fast'])
})
