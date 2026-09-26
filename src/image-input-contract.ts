/** Browser-safe image selection contract. References identify inputs; they never grant access. */
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import { OPENAI_CODEX_IMAGE_ASSET_ID_PATTERN } from './image-assets-contract.ts'

export const IMAGE_INPUT_MAX_COUNT = 5
export const IMAGE_REFERENCE_PURPOSE_MAX_LENGTH = 512

type PreviewChoice = { usePreview?: true }
export type ImageInputAttachment = Omit<ImageAttachmentRef, 'mediaType'> & { mediaType: 'image/png' | 'image/jpeg' | 'image/webp' }

export type ImageInputRef =
  | { assetId: string }
  | ({ attachmentId: string } & PreviewChoice)
  | ({ attachment: ImageInputAttachment } & PreviewChoice)

export type ImageReferenceInput = {
  image: ImageInputRef
  purpose: string
}
export type ImageEditSources = {
  target: ImageInputRef
  references: ImageReferenceInput[]
}
export type ImageToolRequest =
  | { operation: 'generate'; prompt: string }
  | { operation: 'edit'; prompt: string; edit: ImageEditSources }

export function imageInputObject(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined
}
function positive(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}
function identifier(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9:._-]{0,255}$/u.test(value)
}
function only(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every(key => keys.includes(key))
}

/** Copy the exact published host reference vocabulary, including normalization metadata. */
export function decodeImageInputAttachment(value: unknown): ImageInputAttachment | undefined {
  const ref = imageInputObject(value)
  if (ref === undefined || !only(ref, ['attachmentId', 'mediaType', 'width', 'height', 'bytes', 'name', 'originalDimensions'])
    || !identifier(ref.attachmentId)
    || !['image/png', 'image/jpeg', 'image/webp'].includes(String(ref.mediaType))
    || !positive(ref.width) || !positive(ref.height) || !positive(ref.bytes)
    || (ref.name !== undefined && (typeof ref.name !== 'string' || ref.name.length < 1 || ref.name.length > 512))) return undefined
  const dimensions = ref.originalDimensions === undefined ? undefined : imageInputObject(ref.originalDimensions)
  if (ref.originalDimensions !== undefined && (dimensions === undefined || !only(dimensions, ['width', 'height'])
    || !positive(dimensions.width) || !positive(dimensions.height))) return undefined
  return {
    attachmentId: ref.attachmentId as ImageAttachmentRef['attachmentId'],
    mediaType: ref.mediaType as ImageInputAttachment['mediaType'],
    width: ref.width, height: ref.height, bytes: ref.bytes,
    ...(ref.name === undefined ? {} : { name: ref.name as string }),
    ...(dimensions === undefined ? {} : { originalDimensions: { width: dimensions.width as number, height: dimensions.height as number } }),
  }
}

/** Exactly one selector; a guessed ID or caller-provided metadata is not an authorization proof. */
export function decodeImageInputRef(value: unknown): ImageInputRef | undefined {
  const ref = imageInputObject(value)
  if (ref === undefined) return undefined
  if (typeof ref.assetId === 'string' && OPENAI_CODEX_IMAGE_ASSET_ID_PATTERN.test(ref.assetId)
    && only(ref, ['assetId'])) return { assetId: ref.assetId }
  const preview = ref.usePreview === true ? { usePreview: true as const } : {}
  if (ref.usePreview !== undefined && ref.usePreview !== true) return undefined
  if (identifier(ref.attachmentId) && only(ref, ['attachmentId', 'usePreview'])) {
    return { attachmentId: ref.attachmentId, ...preview }
  }
  const attachment = decodeImageInputAttachment(ref.attachment)
  if (attachment !== undefined && only(ref, ['attachment', 'usePreview'])) return { attachment, ...preview }
  return undefined
}

export function decodeImageEditSources(value: unknown): ImageEditSources | undefined {
  const candidate = imageInputObject(value)
  if (candidate === undefined || !only(candidate, ['target', 'references'])) return undefined
  const target = decodeImageInputRef(candidate.target)
  if (target === undefined || !Array.isArray(candidate.references) || candidate.references.length >= IMAGE_INPUT_MAX_COUNT) return undefined
  const references: ImageReferenceInput[] = []
  for (const item of candidate.references) {
    const ref = imageInputObject(item)
    if (ref === undefined || !only(ref, ['image', 'purpose']) || typeof ref.purpose !== 'string'
      || ref.purpose.trim().length === 0 || ref.purpose.length > IMAGE_REFERENCE_PURPOSE_MAX_LENGTH) return undefined
    const image = decodeImageInputRef(ref.image)
    if (image === undefined) return undefined
    references.push({ image, purpose: ref.purpose.trim() })
  }
  return { target, references }
}

/** Preserve prompt-only calls; edit intent can never degrade to generation on invalid inputs. */
export function decodeImageToolRequest(value: unknown): ImageToolRequest | undefined {
  const request = imageInputObject(value)
  if (request === undefined || typeof request.prompt !== 'string') return undefined
  const prompt = request.prompt.trim()
  if (prompt.length < 1 || prompt.length > 32_000) return undefined
  if ((request.operation === undefined || request.operation === 'generate') && only(request, ['prompt', 'operation'])) {
    return { operation: 'generate', prompt }
  }
  if (request.operation !== 'edit' || !only(request, ['operation', 'prompt', 'target', 'references'])) return undefined
  const edit = decodeImageEditSources({ target: request.target, references: request.references === undefined ? [] : request.references })
  return edit === undefined ? undefined : { operation: 'edit', prompt, edit }
}

export const IMAGE_ATTACHMENT_INPUT_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    attachmentId: { type: 'string', required: true },
    mediaType: { type: 'string', required: true, enum: ['image/png', 'image/jpeg', 'image/webp'] },
    width: { type: 'integer', required: true }, height: { type: 'integer', required: true }, bytes: { type: 'integer', required: true },
    name: { type: 'string' },
    originalDimensions: { type: 'object', additionalProperties: false, properties: {
      width: { type: 'integer', required: true }, height: { type: 'integer', required: true },
    } },
  },
} as const
export const IMAGE_INPUT_SCHEMA = {
  type: 'object', additionalProperties: false,
  description: 'Select exactly one: assetId for an original result, attachmentId from this session, or a complete attachment reference. For uploaded copies, including first/second attached image, copy the complete attachment reference from the adjacent handle line. A bare attachmentId shared with a generated result is ambiguous; assetId explicitly selects a stored original. usePreview=true is only for an explicitly chosen lower-resolution preview.',
  properties: {
    assetId: { type: 'string' }, attachmentId: { type: 'string' }, attachment: IMAGE_ATTACHMENT_INPUT_SCHEMA,
    usePreview: { type: 'boolean' },
  },
} as const
export const IMAGE_REFERENCES_SCHEMA = {
  type: 'array', description: 'Reference images only, kept in the same order the user specified; never place the edit target here.', items: { type: 'object', additionalProperties: false, properties: {
    image: { ...IMAGE_INPUT_SCHEMA, required: true },
    purpose: { type: 'string', required: true, description: 'What to borrow, such as colors or texture, without replacing the target.' },
  } },
} as const
export const IMAGE_EDIT_SOURCES_SCHEMA = {
  type: 'object', additionalProperties: false, properties: {
    target: { ...IMAGE_INPUT_SCHEMA, required: true },
    references: { ...IMAGE_REFERENCES_SCHEMA, required: true },
  },
} as const
