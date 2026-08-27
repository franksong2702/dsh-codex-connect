/** Node-free contract shared by original-image storage, routes, and the Client view. */

import type { CodexImageMediaType } from './image-format.ts'

/** Same-origin endpoint serving one session-owned original generated image. */
export const OPENAI_CODEX_ORIGINAL_IMAGE_PATH = '/plugins/dsh-codex-connect/images/original'

/** Opaque identifier format for one plugin-owned original image. */
export const OPENAI_CODEX_IMAGE_ASSET_ID_PATTERN = /^img_[0-9a-f]{32}$/u

/** Durable facts for the exact bytes returned by GPT Image before DSH preview normalization. */
export interface OpenAICodexOriginalImageRef {
  assetId: string
  mediaType: CodexImageMediaType
  width: number
  height: number
  bytes: number
  name: string
  sha256: string
}

function positiveSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

/** Decode session-log metadata without trusting an asset id, filename, or media type. */
export function decodeOpenAICodexOriginalImageRef(value: unknown): OpenAICodexOriginalImageRef | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const candidate = value as Record<string, unknown>
  if (typeof candidate.assetId !== 'string' || !OPENAI_CODEX_IMAGE_ASSET_ID_PATTERN.test(candidate.assetId)
    || (candidate.mediaType !== 'image/png' && candidate.mediaType !== 'image/jpeg' && candidate.mediaType !== 'image/webp')
    || !positiveSafeInteger(candidate.width) || !positiveSafeInteger(candidate.height)
    || !positiveSafeInteger(candidate.bytes) || candidate.bytes > 48 * 1024 * 1024
    || typeof candidate.name !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(candidate.name)
    || typeof candidate.sha256 !== 'string' || !/^[0-9a-f]{64}$/u.test(candidate.sha256)) return undefined
  return {
    assetId: candidate.assetId,
    mediaType: candidate.mediaType,
    width: candidate.width,
    height: candidate.height,
    bytes: candidate.bytes,
    name: candidate.name,
    sha256: candidate.sha256,
  }
}

/** Build a same-origin URL without allowing either opaque id to become a path segment. */
export function openAICodexOriginalImageUrl(sessionId: string, assetId: string): string {
  const query = new URLSearchParams({ sessionId, assetId })
  return `${OPENAI_CODEX_ORIGINAL_IMAGE_PATH}?${query.toString()}`
}
