// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import type { ISessions } from '@deepseek-ai/dsh-client-runtime/client'
import { en } from '../src/client/locales.ts'
import type { OpenAICodexSettingsKey } from '../src/client/locales.ts'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
    IconCopyOutline16: () => <svg aria-hidden="true" data-icon="copy" />,
    IconCheckOutline16: () => <svg aria-hidden="true" data-icon="check" />,
    writeClipboard: async (value: string) => {
      if (navigator.clipboard?.writeText !== undefined) {
        await navigator.clipboard.writeText(value)
        return true
      }
      if (typeof document.execCommand !== 'function') return false
      const textarea = document.createElement('textarea')
      textarea.value = value
      document.body.append(textarea)
      textarea.select()
      try {
        return document.execCommand('copy')
      } finally {
        textarea.remove()
      }
    },
}))

import { CodexImageToolView } from '../src/client/CodexImageToolView.tsx'
import type { CodexImageToolViewProps } from '../src/client/CodexImageToolView.tsx'

function t(key: OpenAICodexSettingsKey, params: Record<string, unknown> = {}): string {
  let value: string = en[key]
  for (const [name, replacement] of Object.entries(params)) value = value.replace(`{${name}}`, String(replacement))
  return value
}

const image: ImageAttachmentRef = { attachmentId: 'sha256:one' as ImageAttachmentRef['attachmentId'], mediaType: 'image/png', width: 64, height: 32, bytes: 120, name: 'codex-image-1.png' }
const sessions = { binding: vi.fn(() => ({ session: { readAttachment: vi.fn(async () => ({ ok: true, value: { attachment: image, data: new Uint8Array([1, 2, 3]) } })) } })) } as unknown as ISessions
const actionPrompt = vi.fn(async () => ({ ok: true as const, value: { accepted: true as const } }))
const actionCancel = vi.fn(async () => ({ ok: true as const, value: { accepted: true as const } }))
const actionSessions = { binding: vi.fn(() => ({ session: {
  readAttachment: vi.fn(async () => ({ ok: true, value: { attachment: image, data: new Uint8Array([1, 2, 3]) } })),
  prompt: actionPrompt,
  cancel: actionCancel,
} })) } as unknown as ISessions
const standard = {
  sessionId: 'session-1' as Parameters<ISessions['binding']>[0],
  callId: 'call-1',
  toolName: 'codex_connect_image_generate',
  cwd: undefined,
  openFile: vi.fn(),
  inspect: undefined,
  useSession: vi.fn(),
  useProjection: vi.fn(),
  useSessions: vi.fn(),
  useWorkspaces: vi.fn(),
} as unknown as Omit<CodexImageToolViewProps, 'block' | 't' | 'sessions'>

afterEach(() => { cleanup(); actionPrompt.mockClear(); actionCancel.mockClear(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('Codex image Tool view', () => {
  it('uses a responsive two-region card and an icon-only prompt copy control while generating', async () => {
    const writeText = vi.fn(async () => undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const prompt = 'A detailed city at sunset\nwith flying trains'
    render(<CodexImageToolView {...standard} t={t} sessions={sessions} block={{ callId: 'call-1', name: 'codex_connect_image_generate', argsRaw: JSON.stringify({ prompt }), turn: 1, step: 1, time: 1, callView: null, subCalls: [] }} />)
    expect(screen.getByTestId('image-generation-layout').getAttribute('data-responsive-layout')).toBe('visual-prompt')
    expect(screen.getByTestId('image-generation-visual')).toBeTruthy()
    expect(screen.getByTestId('image-generation-prompt')).toBeTruthy()
    expect(screen.getByText(en.generatingDetail)).toBeTruthy()
    expect(screen.getByRole('progressbar', { name: en.generating })).toBeTruthy()
    const promptText = screen.getByText((_content, element) => element?.tagName === 'PRE' && element.textContent === prompt)
    expect(promptText.style.maxHeight).toBe('96px')
    expect(promptText.style.overflowY).toBe('auto')
    const copy = screen.getByRole('button', { name: en.copyPrompt })
    expect(copy.textContent).toBe('')
    expect(copy.querySelector('svg')).toBeTruthy()
    expect(copy.style.opacity).toBe('0')
    fireEvent.mouseEnter(promptText.parentElement as HTMLElement)
    expect(copy.style.opacity).toBe('1')
    fireEvent.mouseEnter(copy)
    expect((await screen.findByRole('tooltip')).textContent).toBe(en.copyPrompt)
    fireEvent.click(copy)
    await waitFor(() => { expect(writeText).toHaveBeenCalledWith(prompt) })
    const copied = screen.getByRole('button', { name: en.promptCopied })
    expect(copied.querySelector('svg')).toBeTruthy()
  })

  it('renders durable references through its own gallery and cleans Blob URLs', async () => {
    const createObjectURL = vi.fn(() => 'blob:session-image')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })
    const { unmount } = render(<CodexImageToolView {...standard} t={t} sessions={sessions} block={{ kind: 'tool-result', seq: 2, time: 2, callId: 'call-1', call: null, callTime: 1, content: [], isError: false, meta: { kind: 'codex-connect-images', prompt: 'draw a pixel', images: [image] }, callView: null, resultView: null, subCalls: [] }} />)
    expect(screen.getByTestId('codex-image-gallery')).toBeTruthy()
    expect(screen.getByTestId('image-generation-layout').getAttribute('data-responsive-layout')).toBe('visual-prompt')
    expect(screen.getByText('draw a pixel')).toBeTruthy()
    await waitFor(() => { expect(createObjectURL).toHaveBeenCalledOnce() })
    expect(sessions.binding).toHaveBeenCalledWith('session-1')
    expect(screen.getByRole('button', { name: en.openNamed.replace('{name}', image.name ?? en.image) })).toBeTruthy()
    expect(screen.getByRole('button', { name: en.download })).toBeTruthy()
    expect(screen.getByText(en.imageDetails)).toBeTruthy()
    expect(screen.getByText('codex-image-1.png: PNG · 64 × 32 · 120 B')).toBeTruthy()
    unmount()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:session-image')
  })

  it('keeps hook order stable when a running result settles into an image result', () => {
    const createObjectURL = vi.fn(() => 'blob:session-image')
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL: vi.fn() })
    const running = { callId: 'call-1', name: 'codex_connect_image_generate', argsRaw: JSON.stringify({ prompt: 'settle this image' }), turn: 1, step: 1, time: 1, callView: null, subCalls: [] }
    const settled = { kind: 'tool-result' as const, seq: 2, time: 2, callId: 'call-1', call: null, callTime: 1, content: [], isError: false, meta: { kind: 'codex-connect-images' as const, prompt: 'settle this image', images: [image] }, callView: null, resultView: null, subCalls: [] }
    const { rerender } = render(<CodexImageToolView {...standard} t={t} sessions={sessions} block={running} />)
    expect(screen.getByText(en.generatingDetail)).toBeTruthy()
    rerender(<CodexImageToolView {...standard} t={t} sessions={sessions} block={settled} />)
    expect(screen.getByTestId('codex-image-gallery')).toBeTruthy()
  })

  it('copies the prompt on an HTTP page without the async clipboard API', async () => {
    const originalExecCommand = document.execCommand
    const execCommand = vi.fn(() => true)
    Object.defineProperty(document, 'execCommand', { configurable: true, value: execCommand })
    vi.stubGlobal('navigator', {})
    try {
      render(<CodexImageToolView {...standard} t={t} sessions={sessions} block={{ callId: 'call-1', name: 'codex_connect_image_generate', argsRaw: JSON.stringify({ prompt: 'copy on LAN' }), turn: 1, step: 1, time: 1, callView: null, subCalls: [] }} />)
      fireEvent.click(screen.getByRole('button', { name: en.copyPrompt }))
      await waitFor(() => { expect(execCommand).toHaveBeenCalledWith('copy') })
      expect(screen.getByRole('button', { name: en.promptCopied })).toBeTruthy()
    } finally {
      Object.defineProperty(document, 'execCommand', { configurable: true, value: originalExecCommand })
    }
  })

  it('can stop a running generation through the owning session', async () => {
    const prompt = 'a quiet mountain lake'
    render(<CodexImageToolView {...standard} t={t} sessions={actionSessions} block={{ callId: 'call-1', name: 'codex_connect_image_generate', argsRaw: JSON.stringify({ prompt }), turn: 1, step: 1, time: 1, callView: null, subCalls: [] }} />)
    fireEvent.click(screen.getByRole('button', { name: en.cancelGeneration }))
    await waitFor(() => { expect(actionCancel).toHaveBeenCalledOnce() })
    expect(actionPrompt).not.toHaveBeenCalled()
  })

  it('offers retry after failure and queues the original prompt', async () => {
    const prompt = 'a red paper boat'
    render(<CodexImageToolView {...standard} t={t} sessions={actionSessions} block={{ kind: 'tool-result', seq: 2, time: 2, callId: 'call-1', call: { name: 'codex_connect_image_generate', argsRaw: JSON.stringify({ prompt }) }, callTime: 1, content: [], isError: true, error: { name: 'Error', code: 'UNKNOWN' }, callView: null, resultView: null, subCalls: [] }} />)
    fireEvent.click(screen.getByRole('button', { name: en.retryGeneration }))
    await waitFor(() => { expect(actionPrompt).toHaveBeenCalledOnce() })
    expect(actionPrompt).toHaveBeenCalledWith([{ type: 'text', text: prompt }], 'queue')
  })

  it('keeps an old failed card bound to its own prompt after a later image', async () => {
    const failedPrompt = 'the original failed prompt'
    const laterPrompt = 'a later unrelated prompt'
    render(<>
      <CodexImageToolView {...standard} t={t} sessions={actionSessions} block={{ kind: 'tool-result', seq: 2, time: 2, callId: 'call-1', call: { name: 'codex_connect_image_generate', argsRaw: JSON.stringify({ prompt: failedPrompt }) }, callTime: 1, content: [], isError: true, error: { name: 'Error', code: 'UNKNOWN' }, callView: null, resultView: null, subCalls: [] }} />
      <CodexImageToolView {...standard} t={t} sessions={actionSessions} block={{ kind: 'tool-result', seq: 4, time: 4, callId: 'call-2', call: null, callTime: 3, content: [], isError: false, meta: { kind: 'codex-connect-images', prompt: laterPrompt, images: [image] }, callView: null, resultView: null, subCalls: [] }} />
    </>)
    fireEvent.click(screen.getByRole('button', { name: en.retryGeneration }))
    await waitFor(() => { expect(actionPrompt).toHaveBeenCalledOnce() })
    expect(actionPrompt).toHaveBeenCalledWith([{ type: 'text', text: failedPrompt }], 'queue')
    expect(actionPrompt).not.toHaveBeenCalledWith([{ type: 'text', text: laterPrompt }], 'queue')
  })

  it('offers regenerate and edit follow-ups after success', async () => {
    const prompt = 'a glass city at dawn'
    render(<CodexImageToolView {...standard} t={t} sessions={actionSessions} block={{ kind: 'tool-result', seq: 2, time: 2, callId: 'call-1', call: null, callTime: 1, content: [], isError: false, meta: { kind: 'codex-connect-images', prompt, images: [image] }, callView: null, resultView: null, subCalls: [] }} />)
    fireEvent.click(screen.getByRole('button', { name: en.regenerate }))
    await waitFor(() => { expect(actionPrompt).toHaveBeenCalledOnce() })
    expect(actionPrompt).toHaveBeenCalledWith([{ type: 'text', text: prompt }], 'queue')
    actionPrompt.mockClear()
    fireEvent.click(screen.getByRole('button', { name: en.editImage }))
    await waitFor(() => { expect(actionPrompt).toHaveBeenCalledOnce() })
    expect(actionPrompt).toHaveBeenCalledWith([{ type: 'text', text: `${prompt}\n\n${en.editRequest}` }], 'queue')
  })

  it('renders fixed canceled and redacted failure states', () => {
    const base = { kind: 'tool-result' as const, seq: 2, time: 2, callId: 'call-1', call: { name: 'codex_connect_image_generate', argsRaw: JSON.stringify({ prompt: 'private but user-visible prompt' }) }, callTime: 1, callView: null, resultView: null, subCalls: [] }
    const { rerender } = render(<CodexImageToolView {...standard} t={t} sessions={sessions} block={{ ...base, content: [{ type: 'text', text: 'raw secret' }], isError: true, error: { name: 'HarnessError', code: 'ABORTED' } }} />)
    expect(screen.getByText(en.canceledDetail)).toBeTruthy()
    expect(screen.getByText('private but user-visible prompt')).toBeTruthy()
    expect(screen.queryByText('raw secret')).toBeNull()
    rerender(<CodexImageToolView {...standard} t={t} sessions={sessions} block={{ ...base, content: [{ type: 'text', text: 'private response' }], isError: true, error: { name: 'Error', code: 'UNKNOWN' } }} />)
    expect(screen.getByText(en.failed)).toBeTruthy()
    expect(screen.queryByText('private response')).toBeNull()
  })
})
