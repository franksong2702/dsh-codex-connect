/** Read declared host image events, never image-looking JSON embedded in user prose. */
import { deriveEventMessage } from '@deepseek-ai/dsh-session'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import { decodeImageInputAttachment, imageInputObject } from './image-input-contract.ts'
import { decodeImagePresentationMeta, decodeImageResultContent } from './image-presentation.ts'
import type { ImagePresentationMeta } from './image-presentation.ts'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import type { OpenAICodexOriginalImageRef } from './image-assets-contract.ts'

/** Result metadata is evidence only in the host's successful result envelope. */
export function imagePresentationFromEvent(event: unknown): ImagePresentationMeta | undefined {
  const entry = imageInputObject(event)
  const data = imageInputObject(entry?.data)
  if (data === undefined) return undefined
  if (entry?.type === 'tool/result') {
    const message = imageInputObject(data.message)
    if (message?.isError !== false) return undefined
    return decodeImagePresentationMeta(data.meta)
  }
  if (entry?.type !== 'tool/ptc-dispatch' && entry?.type !== 'tool/code-dispatch') return undefined
  if (data.name !== 'codex_connect_image_generate' || data.isError !== false || !Array.isArray(data.content)) return undefined
  const args = imageInputObject(data.arguments)
  return typeof args?.prompt === 'string' ? decodeImageResultContent(data.content, args.prompt.trim()) : undefined
}

/** Original access in a fork remains confined to the actual inherited event prefix. */
export function inheritedImageOriginal(session: Session | undefined, assetId: string): OpenAICodexOriginalImageRef | undefined {
  if (session?.header.parentSession === undefined) return undefined
  for (const event of session.snapshotEvents()) {
    if (event.seq >= session.inheritedEventCount) break
    const original = imagePresentationFromEvent(event)?.images.find(image => image.original?.assetId === assetId)?.original
    if (original !== undefined) return original
  }
  return undefined
}

export interface SessionImageInventory {
  attachments: Map<string, ImageAttachmentRef>
  ambiguousResults: Set<string>
  results: Map<string, { preview: ImageAttachmentRef; original?: OpenAICodexOriginalImageRef }>
  originals: Map<string, OpenAICodexOriginalImageRef>
}

/** Read one current session's immutable log, including restored and inherited events. */
export function sessionImageInventory(session: Session): SessionImageInventory {
  const result: SessionImageInventory = { attachments: new Map(), results: new Map(), originals: new Map(), ambiguousResults: new Set() }
  const add = (content: unknown): void => {
    if (!Array.isArray(content)) return
    for (const block of content) {
      const candidate = imageInputObject(block)
      if (candidate?.type !== 'image') continue
      const ref = decodeImageInputAttachment(candidate.attachment)
      if (ref !== undefined) result.attachments.set(String(ref.attachmentId), ref)
    }
  }
  for (const event of session.snapshotEvents()) {
    const presentation = imagePresentationFromEvent(event)
    for (const image of presentation?.images ?? []) {
      const id = String(image.preview.attachmentId)
      const existing = result.results.get(id)
      if (existing !== undefined && existing.original?.assetId !== image.original?.assetId) result.ambiguousResults.add(id)
      result.results.set(id, image)
      result.attachments.set(id, image.preview)
      if (image.original !== undefined) result.originals.set(image.original.assetId, image.original)
    }
    // Mirror the host's known content boundaries, without recursing through arbitrary data.
    const data = imageInputObject(event.data)
    if (event.type === 'tool/ptc-dispatch' || String(event.type) === 'tool/code-dispatch') {
      if (data?.isError === false) add(data.content)
      continue
    }
    if (event.type === 'agent/inbox/spliced') {
      if (Array.isArray(data?.inserted)) for (const message of data.inserted) add(imageInputObject(message)?.content)
      continue
    }
    if (event.type === 'compaction/summary') {
      add(data?.summary)
      add(data?.rawOutput)
      continue
    }
    const message = deriveEventMessage(event as SessionEvent)
    if (message !== null) add(message.content)
  }
  return result
}
