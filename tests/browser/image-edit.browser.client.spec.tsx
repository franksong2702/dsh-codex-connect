import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import { CodexImageToolView } from '../../src/client/CodexImageToolView.tsx'
import type { CodexImageToolViewProps } from '../../src/client/CodexImageToolView.tsx'
import { en, zh } from '../../src/client/locales.ts'
import type { OpenAICodexSettingsKey } from '../../src/client/locales.ts'

const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC'), char => char.charCodeAt(0))
const preview = (suffix: string): ImageAttachmentRef => ({ attachmentId: `sha256:${suffix}` as ImageAttachmentRef['attachmentId'],
  mediaType: 'image/png', bytes: png.byteLength, width: 1, height: 1, name: `${suffix}.png` })
const original = (suffix: string) => ({ assetId: `img_${suffix.repeat(32)}`, mediaType: 'image/png', bytes: png.byteLength,
  width: 1, height: 1, name: `${suffix}.png`, sha256: suffix.repeat(64) })
const images = [{ original: original('a'), preview: preview('a') }, { original: original('b'), preview: preview('b') }]
const generated = (multi = false) => ({ kind: 'tool-result' as const, callId: 'image-call', seq: 3, time: 3, callTime: 2,
  call: { name: 'codex_connect_image_generate', argsRaw: '{"prompt":"draw"}' },
  content: [], isError: false, meta: { kind: 'codex-connect-images', schemaVersion: 1, prompt: 'draw', images: multi ? images : [images[0]] }, subCalls: [] })
let host: HTMLDivElement
let root: Root
let prompts: string[]
let pending: ((text: string) => Promise<unknown>) | undefined
let enabled: boolean
let listeners: Set<() => void>

beforeEach(async () => {
  await page.viewport(390, 844)
  prompts = []; pending = undefined; enabled = true; listeners = new Set()
  host = document.createElement('div'); host.style.width = '100%'; host.style.maxWidth = '360px'
  document.body.append(host); root = createRoot(host)
})
afterEach(() => { root.unmount(); host.remove(); vi.restoreAllMocks() })

function show(block: unknown, language: 'en' | 'zh' = 'en') {
  const strings = language === 'en' ? en : zh
  const t = (key: OpenAICodexSettingsKey, params: Record<string, unknown> = {}) => Object.entries(params).reduce(
    (value, [name, replacement]) => value.replace(`{${name}}`, String(replacement)), strings[key])
  const sessions = { binding: () => ({ session: {
    readAttachment: async (id: string) => ({ ok: true, value: { attachment: preview(id.endsWith('b') ? 'b' : 'a'), data: png } }),
    prompt: async (parts: Array<{ text: string }>) => {
      const text = parts[0]!.text; prompts.push(text)
      return pending === undefined ? { ok: true, value: { accepted: true } } : pending(text)
    }, cancel: async () => ({ ok: true }),
  } }) } as unknown as ISessions
  const configScope = { getSnapshot: () => ({ status: 'ready', value: { enableImageGeneration: enabled } }),
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } } }
  root.render(createElement(CodexImageToolView, { block, sessionId: 'session-1', sessions, t, configScope } as unknown as CodexImageToolViewProps))
}
function request(index = 0) {
  const text = prompts[index]!
  return JSON.parse(text.slice(text.indexOf('\n') + 1)) as Record<string, unknown>
}

describe('image editing browser workflow', () => {
  it.each(['en', 'zh'] as const)('selects the exact original without submitting until instructions are sent (%s)', async language => {
    const strings = language === 'en' ? en : zh
    show(generated(), language)
    await page.getByRole('button', { name: strings.editImage, exact: true }).click()
    expect(prompts).toHaveLength(0)
    await page.getByRole('textbox', { name: strings.editInstructions }).fill('Change only the background')
    const form = await page.getByRole('form', { name: strings.editImage, exact: true }).findElement()
    expect(form.getBoundingClientRect().right).toBeLessThanOrEqual(390)
    await page.getByRole('button', { name: strings.submitImageEdit }).click()
    await expect.poll(() => prompts.length).toBe(1)
    expect(request()).toEqual({ operation: 'edit', prompt: 'Change only the background', target: { assetId: original('a').assetId }, references: [] })
  })
  it('requires a concrete selection for a multi-image result and binds the second original', async () => {
    show(generated(true))
    await page.getByRole('button', { name: en.editImage, exact: true }).click()
    await page.getByRole('textbox', { name: en.editInstructions }).fill('Change the sky')
    const submit = await page.getByRole('button', { name: en.submitImageEdit }).findElement()
    expect((submit as HTMLButtonElement).disabled).toBe(true)
    await page.getByRole('combobox', { name: en.editTarget }).selectOptions('1')
    await page.getByRole('button', { name: en.submitImageEdit }).click()
    await expect.poll(() => prompts.length).toBe(1)
    expect(request().target).toEqual({ assetId: original('b').assetId })
  })
  it('review: never transfers an edit draft to a different original sharing the same preview', async () => {
    show(generated())
    await page.getByRole('button', { name: en.editImage, exact: true }).click()
    await page.getByRole('textbox', { name: en.editInstructions }).fill('Instructions intended only for original A')
    const replaced = { ...generated(), callId: 'replacement-call', meta: {
      kind: 'codex-connect-images', schemaVersion: 1, prompt: 'new result',
      images: [{ original: original('b'), preview: images[0]!.preview }],
    } }
    show(replaced)
    await expect.poll(async () => (await page.getByRole('textbox', { name: en.editInstructions }).findElement() as HTMLTextAreaElement).value).toBe('')
    expect(prompts).toHaveLength(0)
  })

  it('repeats a failed edit with the same target and ordered references', async () => {
    const input = { operation: 'edit', prompt: 'Keep the subject', target: { assetId: original('a').assetId },
      references: [{ image: { attachmentId: 'sha256:colors' }, purpose: 'colors only' }, { image: { attachmentId: 'sha256:texture' }, purpose: 'texture' }] }
    show({ ...generated(), isError: true, meta: undefined, call: { name: 'codex_connect_image_generate', argsRaw: JSON.stringify(input) },
      content: [{ type: 'text', text: 'Image editing timed out. The request may still be processing.' }], error: { name: 'Error', code: 'UNKNOWN' } })
    await expect.element(page.getByText(en.imageRequestUncertain)).toBeVisible()
    expect(prompts).toHaveLength(0)
    await page.getByRole('button', { name: en.retryImageEdit }).click()
    await expect.poll(() => prompts.length).toBe(1)
    expect(request()).toEqual(input)
  })
  it('repeating a successful edit uses its original inputs, not its output as the new target', async () => {
    const edit = { target: { assetId: original('b').assetId }, references: [] }
    show({ ...generated(), call: null, meta: { kind: 'codex-connect-images', schemaVersion: 2, operation: 'edit', prompt: 'blue background', images: [images[0]], edit } })
    await expect.element(page.getByText(en.imageEdited, { exact: true })).toBeVisible()
    await page.getByRole('button', { name: en.retryImageEdit }).click()
    await expect.poll(() => prompts.length).toBe(1)
    expect(request().target).toEqual(edit.target)
  })
  it('retains an unsent draft and never automatically repeats after a lost submission response', async () => {
    pending = async () => { throw new Error('synthetic lost response') }
    show(generated())
    await page.getByRole('button', { name: en.editImage, exact: true }).click()
    await page.getByRole('textbox', { name: en.editInstructions }).fill('Keep the foreground')
    await page.getByRole('button', { name: en.submitImageEdit }).click()
    await expect.element(page.getByText(en.actionFailed)).toBeVisible()
    expect(prompts).toHaveLength(1)
    expect((await page.getByRole('textbox', { name: en.editInstructions }).findElement() as HTMLTextAreaElement).value).toBe('Keep the foreground')
  })
  it('prevents a second submission while the same edit is still pending', async () => {
    let complete!: (value: unknown) => void
    pending = () => new Promise(resolve => { complete = resolve })
    show(generated())
    await page.getByRole('button', { name: en.editImage, exact: true }).click()
    await page.getByRole('textbox', { name: en.editInstructions }).fill('A single explicit edit')
    const form = await page.getByRole('form', { name: en.editImage, exact: true }).findElement()
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await expect.poll(() => prompts.length).toBe(1)
    complete({ ok: true, value: { accepted: true } })
    await expect.element(page.getByRole('textbox', { name: en.editInstructions })).not.toBeInTheDocument()
    expect(prompts).toHaveLength(1)
  })
  it('disables new image actions when the saved feature is switched off and keeps downloads', async () => {
    show(generated())
    await page.getByRole('button', { name: en.editImage, exact: true }).click()
    enabled = false
    for (const listener of listeners) listener()
    await expect.poll(async () => (await page.getByRole('button', { name: en.editImage, exact: true }).findElement() as HTMLButtonElement).disabled).toBe(true)
    await expect.element(page.getByRole('textbox', { name: en.editInstructions })).not.toBeInTheDocument()
    await expect.element(page.getByRole('button', { name: en.downloadOriginal })).toBeVisible()
    expect(prompts).toHaveLength(0)
  })
  it.each(['en', 'zh'] as const)('shows safe input failure guidance without an ineffective retry (%s)', async language => {
    const strings = language === 'en' ? en : zh
    const reason = 'Error: Target image: is unavailable or does not match a reference in this session. Select or attach the image again.'
    show({ ...generated(), isError: true, meta: undefined,
      call: { name: 'codex_connect_image_generate', argsRaw: JSON.stringify({ operation: 'edit', prompt: 'Change sky', target: { attachmentId: 'sha256:absent' } }) },
      content: [{ type: 'text', text: reason }], error: { name: 'Error', code: 'UNKNOWN' } }, language)
    await expect.element(page.getByText(reason, { exact: true })).toBeVisible()
    await expect.element(page.getByText(strings.imageInputRecovery)).toBeVisible()
    await expect.element(page.getByRole('button', { name: strings.retryImageEdit })).not.toBeInTheDocument()
    expect(prompts).toHaveLength(0)
  })
  it('hides raw service errors and still presents a safe explanation', async () => {
    const raw = 'Error: Target image: is required. Bearer PRIVATE_FIXTURE_TOKEN /Users/private-account/file.png'
    show({ ...generated(), isError: true, meta: undefined, content: [{ type: 'text', text: raw }], error: { name: 'Error', code: 'UNKNOWN' } })
    await expect.element(page.getByText(en.imageUnknownFailure)).toBeVisible()
    expect(host.textContent).not.toContain('PRIVATE_FIXTURE_TOKEN')
    expect(host.textContent).not.toContain('/Users/private-account')
    expect(prompts).toHaveLength(0)
  })

})
