import { describe, expect, it } from 'vitest'
import { decodeImagePresentationMeta } from '../src/image-presentation.ts'

const image = { attachmentId: 'sha256:one', mediaType: 'image/png', width: 64, height: 32, bytes: 120, name: 'codex-image-1.png' }
const original = {
  assetId: `img_${'a'.repeat(32)}`,
  mediaType: 'image/png',
  width: 4096,
  height: 2048,
  bytes: 12_000_000,
  name: 'codex-image-1.png',
  sha256: 'b'.repeat(64),
}

describe('generated image presentation contract', () => {
  it('decodes legacy preview-only metadata for existing sessions', () => {
    const decoded = decodeImagePresentationMeta({ kind: 'codex-connect-images', prompt: 'draw a pixel', images: [image] })
    expect(decoded).toMatchObject({ schemaVersion: 1, prompt: 'draw a pixel', images: [{ preview: image }] })
  })

  it('accepts bounded versioned original and preview metadata', () => {
    const decoded = decodeImagePresentationMeta({
      kind: 'codex-connect-images',
      schemaVersion: 1,
      prompt: 'draw a pixel',
      images: [{ original, preview: image }],
    })
    expect(decoded).toMatchObject({ schemaVersion: 1, prompt: 'draw a pixel', images: [{ original, preview: image }] })
  })

  it('rejects malformed, oversized, or unknown metadata', () => {
    expect(decodeImagePresentationMeta({ kind: 'codex-connect-images', images: [image] })).toBeUndefined()
    expect(decodeImagePresentationMeta({ kind: 'codex-connect-images', prompt: '', images: [image] })).toBeUndefined()
    expect(decodeImagePresentationMeta({ kind: 'codex-connect-images', prompt: 'x'.repeat(32_001), images: [image] })).toBeUndefined()
    expect(decodeImagePresentationMeta({ kind: 'codex-connect-images', prompt: 'draw', images: [{ ...image, attachmentId: undefined }] })).toBeUndefined()
    expect(decodeImagePresentationMeta({ kind: 'codex-connect-images', prompt: 'draw', images: Array.from({ length: 5 }, () => image) })).toBeUndefined()
    expect(decodeImagePresentationMeta({ kind: 'codex-connect-images', schemaVersion: 2, prompt: 'draw', images: [{ original, preview: image }] })).toBeUndefined()
    expect(decodeImagePresentationMeta({ kind: 'codex-connect-images', schemaVersion: 1, prompt: 'draw', images: [{ original: { ...original, assetId: '../secret' }, preview: image }] })).toBeUndefined()
    expect(decodeImagePresentationMeta({ kind: 'codex-connect-images', schemaVersion: 1, prompt: 'draw', images: [{ original, preview: { ...image, attachmentId: undefined } }] })).toBeUndefined()
  })
})
