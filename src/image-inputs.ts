/** Resolve all edit inputs through the current host session before any provider request. */
import type { Context } from '@deepseek-ai/cordis'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import type { ToolRunContext } from '@deepseek-ai/dsh-tools'
import type { OpenAICodexImageAssetStore } from './image-assets.ts'
import type { OpenAICodexOriginalImageRef } from './image-assets-contract.ts'
import { decodeImageEditSources, decodeImageInputAttachment } from './image-input-contract.ts'
import type { ImageInputRef, ImageEditSources } from './image-input-contract.ts'
import { inheritedImageOriginal, sessionImageInventory } from './image-history.ts'
import { detectEncodedImage } from './image-format.ts'
import {
  IMAGE_EDIT_MAX_INPUTS, IMAGE_EDIT_MAX_IMAGE_BYTES, IMAGE_EDIT_MAX_TOTAL_BYTES,
  IMAGE_EDIT_MAX_PIXELS, IMAGE_EDIT_MAX_DIMENSION,
} from './image-edit-request.ts'
import type { ImageEditInputBytes } from './image-edit-request.ts'

export class ImageInputError extends Error {}
function fail(label: string, reason: string): never {
  throw new ImageInputError(`${label}: ${reason}`)
}

/** Includes no input IDs or raw metadata in error messages. */
export function promptForImageEdit(prompt: string, sources: ImageEditSources): string {
  const roles = ['Image 1 is the target to edit. Preserve aspects not requested to change.',
    ...sources.references.map((ref, index) => `Image ${String(index + 2)} is a reference only. Reference purpose: ${ref.purpose}`)]
  const value = `${roles.join('\n')}\n\nRequested edit:\n${prompt}`
  if (value.length > 32_000) fail('Edit instructions', 'shorten the instructions or reference descriptions.')
  return value
}

interface Candidate {
  label: string
  source: ImageInputRef
  ref: ImageAttachmentRef | OpenAICodexOriginalImageRef
}

export async function resolveImageEditInputs(
  ctx: Context,
  assets: OpenAICodexImageAssetStore,
  sources: ImageEditSources,
  exec: ToolRunContext,
): Promise<{ images: ImageEditInputBytes[]; edit: ImageEditSources }> {
  exec.signal.throwIfAborted()
  const snapshot = decodeImageEditSources(sources)
  if (snapshot === undefined) fail('Image editing', 'requires valid, bounded image selections.')
  sources = snapshot
  const session = exec.agent?.session
  if (session === undefined || typeof session.snapshotEvents !== 'function' || session.id !== exec.agent?.id) {
    fail('Image editing', 'requires the current session and its image history.')
  }
  const inventory = sessionImageInventory(session)
  const limits = ctx.attachments.imageLimits
  if (![limits.maxImageBytes, limits.maxMessageImageBytes, limits.maxImagesPerMessage, limits.maxImagePixels, limits.maxImageDimension]
    .every(value => Number.isSafeInteger(value) && value > 0)) fail('Image editing', 'requires complete host image limits.')
  const inputs = [sources.target, ...sources.references.map(ref => ref.image)]
  if (inputs.length > Math.min(IMAGE_EDIT_MAX_INPUTS, limits.maxImagesPerMessage)) fail('Image batch', 'too many inputs for this deployment.')
  const candidates: Candidate[] = inputs.map((source, index) => {
    const label = index === 0 ? 'Target image' : `Reference image ${String(index)}`
    if ('assetId' in source) {
      const ref = inventory.originals.get(source.assetId)
      if (ref === undefined) fail(label, 'is unavailable in this session. Select or attach the image again.')
      return { label, source: { assetId: ref.assetId }, ref }
    }
    const id = 'attachment' in source ? String(source.attachment.attachmentId) : source.attachmentId
    const ref = inventory.attachments.get(id)
    if (ref === undefined) fail(label, 'is unavailable in this session. Select or attach the image again.')
    if ('attachment' in source && JSON.stringify(decodeImageInputAttachment(ref)) !== JSON.stringify(source.attachment)) {
      fail(label, 'the attachment reference does not match the session record.')
    }
    const result = inventory.results.get(id)
    if (result !== undefined && source.usePreview !== true) {
      if (inventory.ambiguousResults.has(id)) fail(label, 'matches several original results. Select one exact original image.')
      if (result.original === undefined) fail(label, 'only a preview is available. Explicitly choose that preview or attach an original.')
      return { label, source: { assetId: result.original.assetId }, ref: result.original }
    }
    const attachment = decodeImageInputAttachment(ref)
    if (attachment === undefined) fail(label, 'has unsupported attachment metadata.')
    return { label, source: { attachment, ...(source.usePreview === true ? { usePreview: true as const } : {}) }, ref }
  })

  let total = 0
  for (const candidate of candidates) {
    const ref = candidate.ref
    if (ref.bytes > Math.min(IMAGE_EDIT_MAX_IMAGE_BYTES, limits.maxImageBytes)
      || ref.width * ref.height > Math.min(IMAGE_EDIT_MAX_PIXELS, limits.maxImagePixels)
      || Math.max(ref.width, ref.height) > Math.min(IMAGE_EDIT_MAX_DIMENSION, limits.maxImageDimension)
      || !limits.mediaTypes.includes(ref.mediaType)) fail(candidate.label, 'exceeds this deployment\'s image limits or uses an unsupported format.')
    total += ref.bytes
    if (!Number.isSafeInteger(total) || total > Math.min(IMAGE_EDIT_MAX_TOTAL_BYTES, limits.maxMessageImageBytes)) {
      fail('Image batch', 'exceeds this deployment\'s total input limit.')
    }
  }
  const images: ImageEditInputBytes[] = []
  for (const candidate of candidates) {
    exec.signal.throwIfAborted()
    let data: Uint8Array
    try {
      if ('assetId' in candidate.ref) {
        const stored = await assets.read(String(session.id), candidate.ref.assetId, inheritedImageOriginal(session, candidate.ref.assetId))
        if (stored === undefined || JSON.stringify(stored.ref) !== JSON.stringify(candidate.ref)) {
          fail(candidate.label, 'the original is unavailable or failed integrity checks; no preview was substituted.')
        }
        data = stored.data
      } else {
        const stored = await ctx.attachments.readImage(candidate.ref, exec.signal)
        data = stored.data
      }
      const actual = detectEncodedImage(data)
      if (actual === undefined || actual.mediaType !== candidate.ref.mediaType || actual.width !== candidate.ref.width
        || actual.height !== candidate.ref.height || data.byteLength !== candidate.ref.bytes) {
        fail(candidate.label, 'the stored bytes do not match the image reference.')
      }
      await ctx.attachments.validateImage({ data, mediaType: actual.mediaType })
      exec.signal.throwIfAborted()
      images.push({ data: Uint8Array.from(data), mediaType: actual.mediaType })
    } catch (error) {
      exec.signal.throwIfAborted()
      if (error instanceof ImageInputError) throw error
      fail(candidate.label, 'cannot be read or validated. No image request was sent.')
    }
  }
  const target = candidates[0]?.source
  if (target === undefined) fail('Target image', 'is required.')
  return { images, edit: { target, references: sources.references.map((ref, index) => ({
    image: candidates[index + 1]!.source, purpose: ref.purpose,
  })) } }
}
