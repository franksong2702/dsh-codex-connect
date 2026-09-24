// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import { en } from '../src/client/locales.ts'
import type { OpenAICodexSettingsKey } from '../src/client/locales.ts'
import { IMAGE_RESULT_PREFIX } from '../src/image-presentation.ts'
import { CodexImageTurnTail, selectTurnImageResults } from '../src/client/CodexImageTurnTail.tsx'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  IconCopyOutlineRegular: () => <svg aria-hidden="true" />,
  IconCheckOutlineRegular: () => <svg aria-hidden="true" />,
  writeClipboard: async () => true,
  Modal: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

const preview: ImageAttachmentRef = {
  attachmentId: 'sha256:one' as ImageAttachmentRef['attachmentId'],
  mediaType: 'image/png', width: 64, height: 32, bytes: 3, name: 'generated.png',
}
const original = {
  assetId: `img_${'a'.repeat(32)}`, mediaType: 'image/png' as const,
  width: 64, height: 32, bytes: 3, name: 'generated.png', sha256: 'b'.repeat(64),
}
const sessions = { binding: vi.fn(() => ({ session: {
  readAttachment: vi.fn(async () => ({ ok: true, value: { attachment: preview, data: new Uint8Array([1, 2, 3]) } })),
} })) } as unknown as ISessions

function t(key: OpenAICodexSettingsKey): string { return en[key] }

function result(callId: string, seq: number, meta: unknown, name = 'codex_connect_image_generate') {
  return {
    kind: 'tool-result' as const, callId, seq, time: seq, callTime: seq - 1,
    call: { name, argsRaw: JSON.stringify({ prompt: 'draw' }) },
    content: [{ type: 'image' as const, attachment: preview }], isError: false,
    meta, subCalls: [],
  }
}

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('generated images outside the folded process', () => {
  it('projects only successful Codex image results before the closing answer, including nested PTC', () => {
    const direct = result('direct', 2, { kind: 'codex-connect-images', prompt: 'draw', images: [preview] })
    const nested = { ...result('nested', 3, undefined), content: [
      { type: 'text' as const, text: IMAGE_RESULT_PREFIX + JSON.stringify([{ original, preview }]) },
      { type: 'image' as const, attachment: preview },
    ] }
    const failed = { ...result('failed', 4, direct.meta), isError: true }
    const unrelated = result('other', 5, direct.meta, 'another_tool')
    const orphan = { ...result('orphan', 7, direct.meta), call: null }
    const later = result('later', 20, direct.meta)
    const toolRows = [
      { root: direct },
      { root: { ...result('run-code', 6, undefined, 'run_code'), subCalls: [nested, failed, unrelated] } },
      { root: orphan },
      { root: later },
    ]
    expect(selectTurnImageResults(toolRows, 10).map(item => item.callId)).toEqual(['direct', 'nested', 'orphan'])
  })

  it('renders the image card in the completed turn tail without opening processing details', async () => {
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:generated'), revokeObjectURL: vi.fn() })
    const rows = [{ root: result('direct', 2, { kind: 'codex-connect-images', prompt: 'draw', images: [preview] }) }]
    const source = { getSnapshot: () => rows, subscribe: () => () => {} }
    render(<CodexImageTurnTail {...({
      sessionId: 'session-1', turn: { turn: 1 }, seq: 10,
      useChat: () => source, sessions, t,
    } as unknown as React.ComponentProps<typeof CodexImageTurnTail>)} />)
    const gallery = screen.getByTestId('codex-image-gallery')
    expect(gallery.closest('[hidden]')).toBeNull()
    expect(gallery.closest('[data-turn-image-results]')).not.toBeNull()
    await waitFor(() => { expect(URL.createObjectURL).toHaveBeenCalled() })
  })
})
