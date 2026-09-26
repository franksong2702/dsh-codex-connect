/** Recover a generated-image result from one durable Tool row. */

import type { ToolCallBlock, ToolResultNode } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { decodeImagePresentationMeta, decodeImageResultContent } from '../image-presentation.ts'
import { decodeImageToolRequest } from '../image-input-contract.ts'
import type { ImageToolRequest } from '../image-input-contract.ts'


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

/** Recover the exact operation and selections for an explicit user retry. */
export function imageRequestForToolBlock(block: ToolCallBlock): ImageToolRequest | undefined {
  const raw = !('kind' in block) ? (block.phase === 'start' ? block.argsRaw : undefined) : block.call?.argsRaw
  if (raw !== undefined) {
    try { return decodeImageToolRequest(JSON.parse(raw)) } catch { return undefined }
  }
  if (!('kind' in block) || block.isError) return undefined
  const decoded = imagePresentationForResult(block)
  if (decoded === undefined) return undefined
  return decoded.edit === undefined ? { operation: 'generate', prompt: decoded.prompt }
    : { operation: 'edit', prompt: decoded.prompt, edit: decoded.edit }
}

/** Host-supported text submission with explicit source handles, not forged attachment admission. */
export function imageRequestFollowUp(request: ImageToolRequest): string {
  if (request.operation === 'generate') return request.prompt
  const args = { operation: 'edit', prompt: request.prompt, target: request.edit.target, references: request.edit.references }
  return `Edit the explicitly selected image in this conversation using codex_connect_image_generate. Use these exact inputs; if unavailable, report the problem rather than generating a replacement.\n${JSON.stringify(args)}`
}

/** Only a successful image Tool result can enter the visible answer gallery. */
export function imagePresentationForResult(block: ToolResultNode) {
  if (block.isError || (block.call !== null && block.call.name !== IMAGE_TOOL)) return undefined
  if (block.meta !== undefined) return decodeImagePresentationMeta(block.meta)
  const prompt = promptForImageToolBlock(block)
  return prompt === undefined ? undefined : decodeImageResultContent(block.content, prompt)
}
