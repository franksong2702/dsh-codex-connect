/** Bounded byte-to-wire projection for the Codex OAuth image edit route. */

import { detectEncodedImage } from './image-format.ts'
import type { CodexImageMediaType } from './image-format.ts'

/** Conservative plugin admission limits, not a statement of account entitlement. */
export const IMAGE_EDIT_MAX_INPUTS = 5
export const IMAGE_EDIT_MAX_IMAGE_BYTES = 10 * 1024 * 1024
export const IMAGE_EDIT_MAX_TOTAL_BYTES = 20 * 1024 * 1024
export const IMAGE_EDIT_MAX_REQUEST_BYTES = 32 * 1024 * 1024
export const IMAGE_EDIT_MAX_PIXELS = 50_000_000
export const IMAGE_EDIT_MAX_DIMENSION = 32_768

/** Bytes must already have passed the caller's session/attachment authorization. */
export interface ImageEditInputBytes {
  readonly data: Uint8Array
  readonly mediaType: CodexImageMediaType
}

/** A host-only request. Model-visible attachment IDs are never provider file IDs. */
export interface ImageEditRequest {
  readonly prompt: string
  readonly images: readonly ImageEditInputBytes[]
}

export interface InlineEditImage {
  readonly image_url: string
}

function invalid(): never {
  // Never interpolate caller content, local paths or image data in an error.
  throw new TypeError('Invalid Codex image edit input')
}

/**
 * Validate the complete batch before encoding, then snapshot it synchronously.
 * No account, network, file read, normalization or fallback is performed here.
 * The caller must also enforce its resolved host limits and image permissions.
 */
export function snapshotImageEditRequest(input: ImageEditRequest): {
  readonly prompt: string
  readonly images: readonly InlineEditImage[]
} {
  if (typeof input !== 'object' || input === null || Array.isArray(input)
    || Object.keys(input).some(key => key !== 'prompt' && key !== 'images')
    || typeof input.prompt !== 'string' || input.prompt.trim().length === 0 || input.prompt.length > 32_000
    || !Array.isArray(input.images) || input.images.length < 1 || input.images.length > IMAGE_EDIT_MAX_INPUTS) invalid()

  let total = 0
  for (const image of input.images) {
    if (typeof image !== 'object' || image === null || Array.isArray(image)
      || Object.keys(image).some(key => key !== 'data' && key !== 'mediaType')
      || !(image.data instanceof Uint8Array) || image.data.byteLength < 1
      || image.data.byteLength > IMAGE_EDIT_MAX_IMAGE_BYTES) invalid()
    total += image.data.byteLength
    if (total > IMAGE_EDIT_MAX_TOTAL_BYTES) invalid()
    const actual = detectEncodedImage(image.data)
    if (actual === undefined || actual.mediaType !== image.mediaType
      || actual.width > IMAGE_EDIT_MAX_DIMENSION || actual.height > IMAGE_EDIT_MAX_DIMENSION
      || actual.width * actual.height > IMAGE_EDIT_MAX_PIXELS) invalid()
  }
  // Encoding before any await/queue wait prevents mutable buffers changing the request.
  return {
    prompt: input.prompt,
    images: input.images.map(image => ({
      image_url: `data:${image.mediaType};base64,${Buffer.from(image.data).toString('base64')}`,
    })),
  }
}
