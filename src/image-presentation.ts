import type { ImageAttachmentRef, ImageMediaType } from '@deepseek-ai/dsh-attachment'

/** Stable metadata marker for generated image result views. */
export const IMAGE_PRESENTATION_KIND = 'codex-connect-images'
export const IMAGE_PRESENTATION_SCHEMA_VERSION = 1

export interface ImagePresentationMeta {
  kind: typeof IMAGE_PRESENTATION_KIND
  schemaVersion: typeof IMAGE_PRESENTATION_SCHEMA_VERSION
  images: ImageAttachmentRef[]
}

const IMAGE_LINE = /^(\d+)\. (image\/(?:png|jpeg|webp)), (\d+)x(\d+) px, (\d+) bytes, attachment (.+)$/u

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
  if (candidate.kind !== IMAGE_PRESENTATION_KIND || candidate.schemaVersion !== IMAGE_PRESENTATION_SCHEMA_VERSION
    || !Array.isArray(candidate.images) || candidate.images.length < 1 || candidate.images.length > 4) return undefined
  const images = candidate.images.map(imageRef)
  if (images.some(image => image === undefined)) return undefined
  return {
    kind: IMAGE_PRESENTATION_KIND,
    schemaVersion: IMAGE_PRESENTATION_SCHEMA_VERSION,
    images: images as ImageAttachmentRef[],
  }
}

/** Parse only the fixed result summary for older replay logs without metadata. */
export function decodeImagePresentationText(text: string): ImagePresentationMeta | undefined {
  const lines = text.split('\n')
  const header = /^Generated ([1-4]) images?:$/u.exec(lines[0] ?? '')
  if (header === null || lines.length !== Number(header[1]) + 1) return undefined
  const images: ImageAttachmentRef[] = []
  for (const [index, line] of lines.slice(1).entries()) {
    const match = IMAGE_LINE.exec(line)
    if (match === null || Number(match[1]) !== index + 1) return undefined
    const width = Number(match[3])
    const height = Number(match[4])
    const bytes = Number(match[5])
    const attachmentId = match[6]
    const type = match[2]
    if (!positiveSafeInteger(width) || !positiveSafeInteger(height) || !positiveSafeInteger(bytes)
      || attachmentId === undefined || attachmentId.length === 0 || !mediaType(type)) return undefined
    images.push({
      attachmentId: attachmentId as ImageAttachmentRef['attachmentId'],
      mediaType: type,
      width,
      height,
      bytes,
      name: `codex-image-${String(index + 1)}.${type === 'image/jpeg' ? 'jpg' : type.slice('image/'.length)}`,
    })
  }
  return { kind: IMAGE_PRESENTATION_KIND, schemaVersion: IMAGE_PRESENTATION_SCHEMA_VERSION, images }
}
