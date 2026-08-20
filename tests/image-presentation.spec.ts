import { describe, expect, it } from 'vitest'
import { decodeImagePresentationMeta } from '../src/image-presentation.ts'

const image = { attachmentId: 'sha256:one', mediaType: 'image/png', width: 64, height: 32, bytes: 120, name: 'codex-image-1.png' }

describe('generated image presentation contract', () => {
  it('accepts bounded durable metadata and rejects malformed references', () => {
    const decoded = decodeImagePresentationMeta({ kind: 'codex-connect-images', prompt: 'draw a pixel', images: [image] })
    expect(decoded).toMatchObject({ prompt: 'draw a pixel', images: [image] })
    expect(decodeImagePresentationMeta({ kind: 'codex-connect-images', images: [image] })).toBeUndefined()
    expect(decodeImagePresentationMeta({ kind: 'codex-connect-images', prompt: '', images: [image] })).toBeUndefined()
    expect(decodeImagePresentationMeta({ kind: 'codex-connect-images', prompt: 'x'.repeat(32_001), images: [image] })).toBeUndefined()
    expect(decodeImagePresentationMeta({ kind: 'codex-connect-images', prompt: 'draw', images: [{ ...image, attachmentId: undefined }] })).toBeUndefined()
    expect(decodeImagePresentationMeta({ kind: 'codex-connect-images', prompt: 'draw', images: Array.from({ length: 5 }, () => image) })).toBeUndefined()
  })
})
