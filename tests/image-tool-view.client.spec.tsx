// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import type { ISessions } from '@deepseek-ai/dsh-client-runtime/client'
import { en } from '../src/client/locales.ts'
import type { OpenAICodexSettingsKey } from '../src/client/locales.ts'

const gallery = vi.hoisted(() => vi.fn((_props: unknown) => <div data-testid="native-image-gallery" />))
vi.mock('@deepseek-ai/dsh-client-ui-attachment', () => ({ ImageGallery: gallery }))

import { CodexImageToolView } from '../src/client/CodexImageToolView.tsx'
import type { CodexImageToolViewProps } from '../src/client/CodexImageToolView.tsx'

function t(key: OpenAICodexSettingsKey, params: Record<string, unknown> = {}): string {
  let value: string = en[key]
  for (const [name, replacement] of Object.entries(params)) value = value.replace(`{${name}}`, String(replacement))
  return value
}

const image: ImageAttachmentRef = { attachmentId: 'sha256:one' as ImageAttachmentRef['attachmentId'], mediaType: 'image/png', width: 64, height: 32, bytes: 120, name: 'codex-image-1.png' }
const sessions = { binding: vi.fn(() => ({ session: { readAttachment: vi.fn(async () => ({ ok: true, value: { attachment: image, data: new Uint8Array([1, 2, 3]) } })) } })) } as unknown as ISessions
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

afterEach(() => { cleanup(); gallery.mockClear(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('Codex image Tool view', () => {
  it('shows a bounded waiting card for a running call', () => {
    render(<CodexImageToolView {...standard} t={t} sessions={sessions} block={{ callId: 'call-1', name: 'codex_connect_image_generate', argsRaw: '{}', turn: 1, step: 1, time: 1, callView: null, subCalls: [] }} />)
    expect(screen.getByText(en.generatingDetail)).toBeTruthy()
    expect(screen.getByRole('progressbar', { name: en.generating })).toBeTruthy()
  })

  it('passes durable references to native ImageGallery and cleans Blob URLs', async () => {
    const createObjectURL = vi.fn(() => 'blob:session-image')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })
    const { unmount } = render(<CodexImageToolView {...standard} t={t} sessions={sessions} block={{ kind: 'tool-result', seq: 2, time: 2, callId: 'call-1', call: null, callTime: 1, content: [], isError: false, meta: { kind: 'codex-connect-images', schemaVersion: 1, images: [image] }, callView: null, resultView: null, subCalls: [] }} />)
    expect(screen.getByTestId('native-image-gallery')).toBeTruthy()
    const props = gallery.mock.calls[0]?.[0] as { images: Array<{ attachment: ImageAttachmentRef }>; load(image: ImageAttachmentRef): Promise<string> }
    expect(props.images[0]?.attachment).toEqual(image)
    await expect(props.load(image)).resolves.toBe('blob:session-image')
    expect(sessions.binding).toHaveBeenCalledWith('session-1')
    expect(createObjectURL).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: en.download })).toBeTruthy()
    unmount()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:session-image')
  })

  it('renders fixed canceled and redacted failure states', () => {
    const base = { kind: 'tool-result' as const, seq: 2, time: 2, callId: 'call-1', call: null, callTime: 1, callView: null, resultView: null, subCalls: [] }
    const { rerender } = render(<CodexImageToolView {...standard} t={t} sessions={sessions} block={{ ...base, content: [{ type: 'text', text: 'raw secret' }], isError: true, error: { name: 'HarnessError', code: 'ABORTED' } }} />)
    expect(screen.getByText(en.canceledDetail)).toBeTruthy()
    expect(screen.queryByText('raw secret')).toBeNull()
    rerender(<CodexImageToolView {...standard} t={t} sessions={sessions} block={{ ...base, content: [{ type: 'text', text: 'private response' }], isError: true, error: { name: 'Error', code: 'UNKNOWN' } }} />)
    expect(screen.getByText(en.failed)).toBeTruthy()
    expect(screen.queryByText('private response')).toBeNull()
  })
})
