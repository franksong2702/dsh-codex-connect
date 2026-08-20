import { describe, expect, it } from 'vitest'
import { decodeImagePresentationMeta, decodeImagePresentationText } from '../src/image-presentation.ts'

const image = { attachmentId: 'sha256:one', mediaType: 'image/png', width: 64, height: 32, bytes: 120, name: 'codex-image-1.png' }

describe('generated image presentation contract', () => {
  it('accepts bounded durable metadata and rejects malformed references', () => {
    expect(decodeImagePresentationMeta({ kind: 'codex-connect-images', schemaVersion: 1, images: [image] })?.images).toEqual([image])
    expect(decodeImagePresentationMeta({ kind: 'codex-connect-images', schemaVersion: 1, images: [{ ...image, attachmentId: undefined }] })).toBeUndefined()
    expect(decodeImagePresentationMeta({ kind: 'codex-connect-images', schemaVersion: 2, images: [image] })).toBeUndefined()
    expect(decodeImagePresentationMeta({ kind: 'codex-connect-images', schemaVersion: 1, images: Array.from({ length: 5 }, () => image) })).toBeUndefined()
  })

  it('parses only the fixed legacy result summary', () => {
    const text = 'Generated 1 image:\n1. image/png, 64x32 px, 120 bytes, attachment sha256:one'
    expect(decodeImagePresentationText(text)?.images[0]).toMatchObject({ attachmentId: 'sha256:one', width: 64, height: 32, bytes: 120 })
    expect(decodeImagePresentationText(`model said: ${text}`)).toBeUndefined()
    expect(decodeImagePresentationText(`${text}\nsecret`)).toBeUndefined()
    expect(decodeImagePresentationText('Generated 1 image:\n2. image/png, 64x32 px, 120 bytes, attachment sha256:one')).toBeUndefined()
  })
})
