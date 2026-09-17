import { describe, expect, it } from 'vitest'
import { decodeImagePresentationMeta, decodeImageResultContent, IMAGE_RESULT_PREFIX } from '../src/image-presentation.ts'

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
  it('recovers old PTC previews without inventing an original reference', () => {
    expect(decodeImageResultContent([{ type: 'image', attachment: image }], 'draw')).toMatchObject({ images: [{ preview: image }] })
    expect(decodeImageResultContent([{ type: 'image', attachment: image }], 'draw')?.images[0]?.original).toBeUndefined()
  })

  it('recovers exact references from bounded rendered PTC envelopes', () => {
    const content = [
      { type: 'text', text: IMAGE_RESULT_PREFIX + JSON.stringify([{ original, preview: image }]) },
      { type: 'image', attachment: image },
    ]
    expect(decodeImageResultContent(content, 'draw')).toMatchObject({ images: [{ original, preview: image }] })
    expect(decodeImageResultContent([content[0]], 'draw')).toBeUndefined()
    expect(decodeImageResultContent([...content, content[0]], 'draw')).toBeUndefined()
    expect(decodeImageResultContent([content[0], { type: 'image', attachment: { ...image, width: 999 } }], 'draw')).toBeUndefined()
    expect(decodeImageResultContent([{ type: 'text', text: IMAGE_RESULT_PREFIX + '{bad' }, content[1]], 'draw')).toBeUndefined()
    expect(decodeImageResultContent([{ type: 'text', text: IMAGE_RESULT_PREFIX + 'x'.repeat(16_001) }, content[1]], 'draw')).toBeUndefined()
    expect(decodeImageResultContent(content, '')).toBeUndefined()
    expect(decodeImageResultContent(Array.from({ length: 5 }, () => content[1]), 'draw')).toBeUndefined()
    expect(decodeImageResultContent([{ type: 'image', attachment: { ...image, bytes: -1 } }], 'draw')).toBeUndefined()
  })
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
