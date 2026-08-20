import type { ImageAttachmentRef, ImageMediaType } from '@deepseek-ai/dsh-attachment'

/** Stable metadata marker for generated image result views. */
export const IMAGE_PRESENTATION_KIND = 'codex-connect-images'

export interface ImagePresentationMeta {
  kind: typeof IMAGE_PRESENTATION_KIND
  prompt: string
  images: ImageAttachmentRef[]
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
  const images = candidate.images.map(imageRef)
  if (images.some(image => image === undefined)) return undefined
  return {
    kind: IMAGE_PRESENTATION_KIND,
    prompt: candidate.prompt,
    images: images as ImageAttachmentRef[],
  }
}
