/** Recover a generated-image result from one durable Tool row. */

import type { ToolCallBlock, ToolResultNode } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { decodeImagePresentationMeta, decodeImageResultContent } from '../image-presentation.ts'

const IMAGE_TOOL = 'codex_connect_image_generate'

function promptFromArgs(raw: string): string | undefined {
  try {
    const value: unknown = JSON.parse(raw)
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
    const prompt = (value as Record<string, unknown>).prompt
    if (typeof prompt !== 'string') return undefined
    const trimmed = prompt.trim()
    return trimmed.length > 0 && trimmed.length <= 32_000 ? trimmed : undefined
  } catch {
    return undefined
  }
}

/** Return the bounded prompt that belongs to this image Tool row. */
export function promptForImageToolBlock(block: ToolCallBlock): string | undefined {
  if (!('kind' in block)) return block.phase === 'start' ? promptFromArgs(block.argsRaw) : undefined
  const decoded = decodeImagePresentationMeta(block.meta)
  if (decoded !== undefined) return decoded.prompt
  return block.call === null ? undefined : promptFromArgs(block.call.argsRaw)
}

/** Only a successful image Tool result can enter the visible answer gallery. */
export function imagePresentationForResult(block: ToolResultNode) {
  if (block.isError || (block.call !== null && block.call.name !== IMAGE_TOOL)) return undefined
  if (block.meta !== undefined) return decodeImagePresentationMeta(block.meta)
  const prompt = promptForImageToolBlock(block)
  return prompt === undefined ? undefined : decodeImageResultContent(block.content, prompt)
}
