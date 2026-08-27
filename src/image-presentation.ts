import type { ImageAttachmentRef, ImageMediaType } from '@deepseek-ai/dsh-attachment'
import { decodeOpenAICodexOriginalImageRef } from './image-assets-contract.ts'
import type { OpenAICodexOriginalImageRef } from './image-assets-contract.ts'

/** Stable metadata marker for generated image result views. */
export const IMAGE_PRESENTATION_KIND = 'codex-connect-images'
export const IMAGE_PRESENTATION_SCHEMA_VERSION = 1

export interface ImagePresentationItem {
  preview: ImageAttachmentRef
  /** Missing only for sessions created before exact originals were persisted. */
  original?: OpenAICodexOriginalImageRef
}

export interface ImagePresentationMeta {
  kind: typeof IMAGE_PRESENTATION_KIND
  schemaVersion: typeof IMAGE_PRESENTATION_SCHEMA_VERSION
  prompt: string
  images: ImagePresentationItem[]
}

function positiveSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

function mediaType(value: unknown): value is Exclude<ImageMediaType, 'image/gif'> {
  return value === 'image/png' || value === 'image/jpeg' || value === 'image/webp'
}

function imageRef(value: unknown): ImageAttachmentRef | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const candidate = value as Record<string, unknown>
  if (typeof candidate.attachmentId !== 'string' || candidate.attachmentId.length === 0
    || !mediaType(candidate.mediaType)
    || !positiveSafeInteger(candidate.bytes)
    || !positiveSafeInteger(candidate.width)
    || !positiveSafeInteger(candidate.height)
    || (candidate.name !== undefined && (typeof candidate.name !== 'string' || candidate.name.length === 0))) return undefined
  return {
    attachmentId: candidate.attachmentId as ImageAttachmentRef['attachmentId'],
    mediaType: candidate.mediaType,
    bytes: candidate.bytes,
    width: candidate.width,
    height: candidate.height,
    ...(candidate.name === undefined ? {} : { name: candidate.name }),
  }
}

/** Decode durable tool-result metadata without trusting arbitrary session JSON. */
export function decodeImagePresentationMeta(value: unknown): ImagePresentationMeta | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const candidate = value as Record<string, unknown>
  if (candidate.kind !== IMAGE_PRESENTATION_KIND
    || typeof candidate.prompt !== 'string' || candidate.prompt.length < 1 || candidate.prompt.length > 32_000
    || !Array.isArray(candidate.images) || candidate.images.length < 1 || candidate.images.length > 4) return undefined
  if (candidate.schemaVersion === undefined) {
    const previews = candidate.images.map(imageRef)
    if (previews.some(image => image === undefined)) return undefined
    return {
      kind: IMAGE_PRESENTATION_KIND,
      schemaVersion: IMAGE_PRESENTATION_SCHEMA_VERSION,
      prompt: candidate.prompt,
      images: (previews as ImageAttachmentRef[]).map(preview => ({ preview })),
    }
  }
  if (candidate.schemaVersion !== IMAGE_PRESENTATION_SCHEMA_VERSION) return undefined
  const images: ImagePresentationItem[] = []
  for (const value of candidate.images) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
    const entry = value as Record<string, unknown>
    const preview = imageRef(entry.preview)
    const original = decodeOpenAICodexOriginalImageRef(entry.original)
    if (preview === undefined || original === undefined) return undefined
    images.push({ preview, original })
  }
  return {
    kind: IMAGE_PRESENTATION_KIND,
    schemaVersion: IMAGE_PRESENTATION_SCHEMA_VERSION,
    prompt: candidate.prompt,
    images,
  }
}
