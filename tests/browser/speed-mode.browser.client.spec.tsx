import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { OpenAICodexSpeedControl } from '../../src/client/OpenAICodexSpeedControl.tsx'
import { en, zh } from '../../src/client/locales.ts'
let root: Root | undefined
let host: HTMLDivElement | undefined
afterEach(() => { root?.unmount(); host?.remove(); vi.unstubAllGlobals() })
it.each(['en', 'zh'] as const)('keeps speed choices explicit and mutually exclusive in a compact menu in Chromium (%s)', async language => {
  await page.viewport(390, 844)
  let revision = 0, mode = 'standard'
  const calls: string[] = []
  vi.stubGlobal('fetch', vi.fn(async (_path: string, init: RequestInit) => {
    if (init.method === 'DELETE') return new Response('{}', { headers: { 'content-type': 'application/json' } })
    if (init.method === 'POST') { mode = JSON.parse(String(init.body)).mode; revision++; calls.push(mode) }
    return new Response(JSON.stringify({ generation: 'browser-speed', revision, mode, model: 'gpt-6.1-sol', modelSupported: true,
      hasAccount: true, selectionAvailable: true, eligibility: 'unknown' }), { headers: { 'content-type': 'application/json' } })
  }))
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  const strings = language === 'en' ? en : zh
  root.render(<OpenAICodexSpeedControl sessionId="browser-session" model="gpt-6.1-sol" t={key => strings[key]} />)
  await expect.element(page.getByRole('button', { name: strings.speedMenuStandardTitle, exact: true })).toHaveAttribute('aria-pressed', 'false')
  await page.getByRole('button', { name: strings.speedMenuStandardTitle, exact: true }).click()
  const menu = page.getByRole('menu')
  await expect.element(menu).toBeVisible()
  await expect.element(menu).toBeInViewport({ ratio: 1 })
  await expect.element(page.getByRole('menuitemradio', { name: strings.speedStandard, exact: true })).toHaveAttribute('aria-checked', 'true')
  const info = page.getByRole('menuitem', { name: language === 'en' ? 'Ultrafast details' : 'Ultrafast 说明', exact: true })
  await expect.element(info).toHaveAttribute('aria-expanded', 'false')
  const collapsedWidth = (await menu.findElement()).getBoundingClientRect().width
  expect(collapsedWidth).toBeGreaterThanOrEqual(144)
  expect(collapsedWidth).toBeLessThanOrEqual(145)
  await info.click()
  await expect.element(info).toHaveAttribute('aria-expanded', 'true')
  await expect.element(page.getByText(strings.ultrafastDisclosure, { exact: true })).toBeVisible()
  await expect.element(menu).toBeInViewport({ ratio: 1 })
  const revealedWidth = (await menu.findElement()).getBoundingClientRect().width
  expect(Math.abs(revealedWidth - collapsedWidth)).toBeLessThanOrEqual(1)
  expect(calls).toEqual([])
  await page.getByRole('menuitemradio', { name: 'Ultrafast', exact: true }).click()
  await expect.element(page.getByRole('button', { name: strings.speedMenuUltrafastTitle, exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect.element(page.getByRole('button', { name: strings.speedMenuUltrafastTitle, exact: true })).toHaveAttribute('aria-expanded', 'false')
  await page.getByRole('button', { name: strings.speedMenuUltrafastTitle, exact: true }).click()
  await expect.element(page.getByRole('menuitemradio', { name: 'Ultrafast', exact: true })).toHaveAttribute('aria-checked', 'true')
  await expect.element(page.getByRole('menuitemradio', { name: strings.speedFast, exact: true })).toHaveAttribute('aria-checked', 'false')
  await page.getByRole('menuitemradio', { name: strings.speedFast, exact: true }).click()
  await expect.element(page.getByRole('button', { name: strings.speedMenuFastTitle, exact: true })).toHaveAttribute('aria-pressed', 'true')
  expect(calls).toEqual(['ultrafast', 'fast'])
})

it('opens the menu upward from a bottom-anchored composer row and keeps it inside the 390x844 viewport', async () => {
  await page.viewport(390, 844)
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ generation: 'browser-speed', revision: 0, mode: 'standard', model: 'gpt-6.1-sol',
    modelSupported: true, hasAccount: true, selectionAvailable: true, eligibility: 'unknown' }), { headers: { 'content-type': 'application/json' } })))
  // Composer position (conversation.input.right): the bottom-anchored row, hard against the right edge.
  host = document.createElement('div')
  host.style.position = 'fixed'
  host.style.right = '16px'
  host.style.bottom = '12px'
  document.body.append(host)
  root = createRoot(host)
  root.render(<OpenAICodexSpeedControl sessionId="browser-session" model="gpt-6.1-sol" t={key => en[key]} />)
  const button = page.getByRole('button', { name: en.speedMenuStandardTitle, exact: true })
  await expect.element(button).toHaveAttribute('aria-pressed', 'false')
  await button.click()
  const menu = page.getByRole('menu')
  await expect.element(menu).toBeVisible()
  const menuElement = await menu.findElement()
  const buttonElement = await button.findElement()
  // Same anchored-popup mechanics as the DSH permission toggle: a viewport-fixed list in document.body.
  expect(getComputedStyle(menuElement).position).toBe('fixed')
  expect(menuElement.parentElement).toBe(document.body)
  const menuRect = menuElement.getBoundingClientRect()
  const buttonRect = buttonElement.getBoundingClientRect()
  // Opens UPWARD: the list sits above the trigger, never under the fold.
  expect(menuRect.bottom).toBeLessThanOrEqual(buttonRect.top + 1)
  // Fully inside the viewport on both axes (8px hard allowance).
  expect(menuRect.left).toBeGreaterThanOrEqual(8)
  expect(menuRect.top).toBeGreaterThanOrEqual(8)
  expect(menuRect.right).toBeLessThanOrEqual(390 - 8)
  expect(menuRect.bottom).toBeLessThanOrEqual(844 - 8)
  // Right-edge alignment: the list hugs the button's right edge instead of overflowing it.
  expect(Math.abs(menuRect.right - buttonRect.right)).toBeLessThanOrEqual(1)
  expect(menuRect.width).toBeGreaterThanOrEqual(144)
  expect(menuRect.width).toBeLessThanOrEqual(145)
  const info = page.getByRole('menuitem', { name: 'Ultrafast details', exact: true })
  const infoElement = await info.findElement()
  const infoTop = infoElement.getBoundingClientRect().top
  const ultrafastTop = (await page.getByRole('menuitemradio', { name: 'Ultrafast', exact: true }).findElement()).getBoundingClientRect().top
  await info.click()
  await expect.element(info).toHaveAttribute('aria-expanded', 'true')
  await expect.element(menu).toBeInViewport({ ratio: 1 })
  await expect.poll(() => menuElement.getBoundingClientRect().bottom).toBeCloseTo(menuRect.bottom, 0)
  const expanded = menuElement.getBoundingClientRect()
  expect(expanded.width).toBeCloseTo(menuRect.width, 0)
  expect(expanded.top).toBeLessThan(menuRect.top)
  expect(expanded.left).toBeGreaterThanOrEqual(8)
  expect(expanded.top).toBeGreaterThanOrEqual(8)
  expect(expanded.right).toBeLessThanOrEqual(390 - 8)
  expect(Math.abs(infoElement.getBoundingClientRect().top - infoTop)).toBeLessThanOrEqual(1)
  expect(Math.abs((await page.getByRole('menuitemradio', { name: 'Ultrafast', exact: true }).findElement()).getBoundingClientRect().top - ultrafastTop)).toBeLessThanOrEqual(1)
  expect(document.activeElement).toBe(infoElement)
})

it('keeps the upward menu fully on screen from the bottom-left corner of the viewport', async () => {
  await page.viewport(390, 844)
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ generation: 'browser-speed', revision: 0, mode: 'standard', model: 'gpt-6.1-sol',
    modelSupported: true, hasAccount: true, selectionAvailable: true, eligibility: 'unknown' }), { headers: { 'content-type': 'application/json' } })))
  host = document.createElement('div')
  host.style.position = 'fixed'
  host.style.left = '8px'
  host.style.bottom = '12px'
  document.body.append(host)
  root = createRoot(host)
  root.render(<OpenAICodexSpeedControl sessionId="browser-session" model="gpt-6.1-sol" t={key => en[key]} />)
  const button = page.getByRole('button', { name: en.speedMenuStandardTitle, exact: true })
  await expect.element(button).toHaveAttribute('aria-pressed', 'false')
  await button.click()
  const menu = page.getByRole('menu')
  await expect.element(menu).toBeVisible()
  const menuRect = (await menu.findElement()).getBoundingClientRect()
  const buttonRect = (await button.findElement()).getBoundingClientRect()
  // Measured-width alignment keeps the list on screen with no left overflow, still above the trigger.
  expect(menuRect.left).toBeGreaterThanOrEqual(8)
  expect(menuRect.right).toBeLessThanOrEqual(390 - 8)
  expect(menuRect.bottom).toBeLessThanOrEqual(buttonRect.top + 1)
})

const enlargedDisclosureCases = (['en', 'zh'] as const).flatMap(language =>
  [390, 320].flatMap(width => [1.5, 2].map(scale => ({ language, width, scale }))))

it.each(enlargedDisclosureCases)('shows every disclosure line at $width px with $scale× text ($language)', async ({ language, width, scale }) => {
  await page.viewport(width, 844)
  const posts: string[] = []
  vi.stubGlobal('fetch', vi.fn(async (_path: string, init: RequestInit) => {
    if (init.method === 'POST') posts.push(String(init.body))
    return new Response(JSON.stringify({ generation: 'enlarged-speed', revision: 0, mode: 'standard', model: 'gpt-6.1-sol',
      modelSupported: true, hasAccount: true, selectionAvailable: true, eligibility: 'unknown' }),
    { headers: { 'content-type': 'application/json' } })
  }))
  host = document.createElement('div')
  Object.assign(host.style, { position: 'fixed', right: '16px', bottom: '12px' })
  document.body.append(host)
  root = createRoot(host)
  const strings = language === 'en' ? en : zh
  root.render(<OpenAICodexSpeedControl sessionId="enlarged-session" model="gpt-6.1-sol" t={key => strings[key]} />)
  const trigger = page.getByRole('button', { name: strings.speedMenuStandardTitle, exact: true })
  await expect.element(trigger).toHaveAttribute('aria-pressed', 'false')
  await trigger.click()
  const menu = page.getByRole('menu')
  await expect.element(menu).toBeVisible()
  const info = page.getByRole('menuitem', { name: strings.speedUltrafastDetails, exact: true })
  const infoElement = await info.findElement()
  const disclosure = document.getElementById(infoElement.getAttribute('aria-controls')!)!
  const ultrafast = await page.getByRole('menuitemradio', { name: 'Ultrafast', exact: true }).findElement()
  expect(ultrafast.getAttribute('aria-describedby')).toBe(disclosure.id)
  expect(disclosure.clientHeight).toBe(0)
  // Enlarge actual text metrics, independent of the fixture's default serif
  // font. This is CSS text enlargement, not deviceScaleFactor or native zoom.
  disclosure.style.fontFamily = 'Arial, sans-serif'
  const original = getComputedStyle(disclosure)
  const fontSize = Number.parseFloat(original.fontSize)
  const lineHeight = Number.parseFloat(original.lineHeight)
  disclosure.style.fontSize = `${fontSize * scale}px`
  disclosure.style.lineHeight = `${lineHeight * scale}px`
  const infoTop = infoElement.getBoundingClientRect().top
  const menuElement = await menu.findElement()
  const collapsed = menuElement.getBoundingClientRect()
  const frames: Array<{ infoTop: number; top: number; bottom: number }> = []
  let frame = 0
  const sample = () => {
    if (infoElement.getAttribute('aria-expanded') === 'true') {
      const rect = menuElement.getBoundingClientRect()
      frames.push({ infoTop: infoElement.getBoundingClientRect().top, top: rect.top, bottom: rect.bottom })
    }
    frame = requestAnimationFrame(sample)
  }
  frame = requestAnimationFrame(sample)
  try {
    await info.click()
    await expect.element(info).toHaveAttribute('aria-expanded', 'true')
    await expect.poll(() => getComputedStyle(disclosure).opacity).toBe('1')
    await expect.poll(() => menuElement.getBoundingClientRect().bottom).toBeCloseTo(collapsed.bottom, 0)
  } finally { cancelAnimationFrame(frame) }
  expect(frames.length).toBeGreaterThan(0)
  expect(Math.max(...frames.map(value => Math.abs(value.infoTop - infoTop)))).toBeLessThanOrEqual(1)
  expect(Math.min(...frames.map(value => value.top))).toBeGreaterThanOrEqual(8)
  expect(Math.max(...frames.map(value => value.bottom))).toBeLessThanOrEqual(844 - 8)
  expect(disclosure.textContent).toBe(strings.ultrafastDisclosure)
  expect(getComputedStyle(disclosure).fontSize).toBe(`${fontSize * scale}px`)
  // Visibility matchers do not detect overflow clipping. Check the actual
  // glyph-line rectangles, including the final line, against the clip box.
  const range = document.createRange()
  range.selectNodeContents(disclosure)
  const lines = Array.from(range.getClientRects())
  expect(lines.length).toBeGreaterThan(1)
  const clip = disclosure.getBoundingClientRect()
  const clipBottom = clip.top + disclosure.clientTop + disclosure.clientHeight
  expect(Math.max(...lines.map(line => line.bottom))).toBeLessThanOrEqual(clipBottom + 1)
  expect(Math.min(...lines.map(line => line.top))).toBeGreaterThanOrEqual(clip.top - 1)
  await expect.element(menu).toBeInViewport({ ratio: 1 })
  expect(Math.abs(infoElement.getBoundingClientRect().top - infoTop)).toBeLessThanOrEqual(1)
  expect(menuElement.getBoundingClientRect().width).toBeCloseTo(collapsed.width, 0)
  expect(document.activeElement).toBe(infoElement)
  expect(posts).toEqual([])
  await info.click()
  await expect.element(info).toHaveAttribute('aria-expanded', 'false')
  await expect.poll(() => disclosure.clientHeight).toBe(0)
  expect(ultrafast.getAttribute('aria-describedby')).toBe(disclosure.id)
  expect(disclosure.textContent).toBe(strings.ultrafastDisclosure)
})
