import { describe, expect, it } from 'vitest'
import { decodeImageInputRef, decodeImageToolRequest, decodeImageEditSources } from '../src/image-input-contract.ts'

const attachment = { attachmentId: `sha256:${'a'.repeat(64)}`, mediaType: 'image/png', width: 100, height: 50, bytes: 123,
  name: 'input.png', originalDimensions: { width: 200, height: 100 } }
const target = { attachment }

describe('explicit image edit contract', () => {
  it('retains prompt-only generation without borrowing any history images', () => {
    expect(decodeImageToolRequest({ prompt: ' new picture ' })).toEqual({ operation: 'generate', prompt: 'new picture' })
    expect(decodeImageToolRequest({ operation: 'generate', prompt: 'new picture' })).toEqual({ operation: 'generate', prompt: 'new picture' })
  })
  it('copies full host attachment metadata and preserves ordered reference purposes', () => {
    const sources = { target, references: [{ image: { assetId: `img_${'b'.repeat(32)}` }, purpose: ' colors only ' },
      { image: { attachmentId: 'sha256:second', usePreview: true }, purpose: 'texture' }] }
    const decoded = decodeImageToolRequest({ operation: 'edit', prompt: ' change background ', ...sources })
    expect(decoded).toEqual({ operation: 'edit', prompt: 'change background', edit: {
      target, references: [{ ...sources.references[0], purpose: 'colors only' }, sources.references[1]],
    } })
    expect(decoded?.operation).toBe('edit')
    if (decoded?.operation !== 'edit' || !('attachment' in decoded.edit.target)) throw new Error('expected full attachment')
    expect(decoded.edit.target.attachment).not.toBe(attachment)
    expect(decoded.edit.target.attachment.originalDimensions).not.toBe(attachment.originalDimensions)
  })
  it.each([
    { prompt: 'edit this', target },
    { operation: 'generate', prompt: 'edit', target },
    { operation: 'edit', prompt: 'edit' },
    { operation: 'edit', prompt: 'edit', target: {} },
    { operation: 'edit', prompt: 'edit', target, references: [{ image: target, purpose: '' }] },
    { operation: 'edit', prompt: 'edit', target, references: [{ image: target, purpose: 'x'.repeat(513) }] },
    { operation: 'edit', prompt: 'edit', target, references: Array.from({ length: 5 }, () => ({ image: target, purpose: 'style' })) },
    { operation: 'edit', prompt: 'edit', target, references: null },
    { operation: 'edit', prompt: 'edit', target, references: [], endpoint: 'https://invalid.example' },
  ])('rejects missing/ambiguous/conflicting intent without changing operation %#', value => {
    expect(decodeImageToolRequest(value)).toBeUndefined()
  })
  it.each([
    { assetId: '../private' }, { attachmentId: 'https://invalid.example' }, { attachmentId: '/private/image.png' },
    { assetId: `img_${'b'.repeat(32)}`, attachmentId: 'sha256:one' }, { attachmentId: 'sha256:one', usePreview: false },
    { attachment: { ...attachment, bytes: -1 } }, { attachment: { ...attachment, mediaType: 'image/gif' } },
    { attachment: { ...attachment, originalDimensions: { width: 1.5, height: 2 } } },
    { attachment: { ...attachment, secret: 'not allowed' } }, { attachmentId: 'sha256:one', owner: 'another-session' },
  ])('rejects malformed sources and unsupported metadata %#', value => { expect(decodeImageInputRef(value)).toBeUndefined() })
  it('does not persist turn-relative ordinal selectors in edit requests', () => {
    expect(decodeImageInputRef({ currentMessageImage: 1 })).toBeUndefined()
  })
  it('does not accept a source object as an implicit edit record', () => {
    expect(decodeImageEditSources({ ...target, references: [] })).toBeUndefined()
  })
})
