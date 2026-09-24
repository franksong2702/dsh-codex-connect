import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { page } from 'vitest/browser'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import { CodexImageTurnTail } from '../../src/client/CodexImageTurnTail.tsx'
import { en } from '../../src/client/locales.ts'
import type { OpenAICodexSettingsKey } from '../../src/client/locales.ts'

const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='), character => character.charCodeAt(0))
const preview: ImageAttachmentRef = {
  attachmentId: 'sha256:visible-answer' as ImageAttachmentRef['attachmentId'],
  mediaType: 'image/png', bytes: png.byteLength, width: 1, height: 1, name: 'generated.png',
}
const result = {
  kind: 'tool-result' as const, callId: 'image-call', seq: 3, time: 3, callTime: 2,
  call: { name: 'codex_connect_image_generate', argsRaw: '{"prompt":"draw"}' },
  content: [{ type: 'image' as const, attachment: preview }], isError: false,
  meta: { kind: 'codex-connect-images', prompt: 'draw', images: [preview] }, subCalls: [],
}
const rows = [{ root: result }]
const source = { getSnapshot: () => rows, subscribe: () => () => {} }
const sessions = { binding: () => ({ session: { readAttachment: async () => ({ ok: true, value: { attachment: preview, data: png } }) } }) } as unknown as ISessions
const t = (key: OpenAICodexSettingsKey) => en[key]

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})

afterEach(() => {
  root.unmount()
  host.remove()
})

it('shows a completed image below the answer without opening processing details in Chromium', async () => {
  root.render(createElement(CodexImageTurnTail, {
    sessionId: 'session-1', turn: { turn: 1 }, seq: 10,
    useChat: () => source, sessions, t,
  } as unknown as React.ComponentProps<typeof CodexImageTurnTail>))

  const image = await page.getByAltText('generated.png').findElement()
  expect(image.closest('[hidden]')).toBeNull()
  expect(image.closest('[data-turn-image-results]')).not.toBeNull()
  expect(image.getBoundingClientRect().width).toBeGreaterThan(0)
  expect(await page.getByRole('button', { name: en.download }).findElement()).toBeTruthy()
})
