/** Portable handoff from the original host journal; never interprets prose as permission. */
import type { ContentBlock, Message } from '@deepseek-ai/dsh-llm'
import { isDeepStrictEqual } from 'node:util'
import type { Session } from '@deepseek-ai/dsh-session'
import { taskFailure } from './adaptive-task-store.ts'
const MAX_TRANSFER_BYTES = 512_000
function portableBlocks(blocks: readonly ContentBlock[], assistant: boolean): ContentBlock[] {
  const result: ContentBlock[] = []
  for (const block of blocks) {
    if (block.type === 'reasoning' && assistant) continue
    if (block.type === 'text' || block.type === 'tool-call' || block.type === 'image') result.push(structuredClone(block))
    else if (block.type === 'tool-result') result.push({ ...block, content: portableBlocks(block.content, false) })
    else taskFailure('TASK_HANDOFF_CONTENT_UNSUPPORTED')
  }
  return result
}
/** Reconstruct visible facts, not encrypted thoughts or model-authored summaries, for a new route. */
export function portableTaskMessages(session: Session, current: readonly Message[], target: { afterSeq: number; model: string }): Message[] {
  const messages: Message[] = []
  const ids = new Set<string>()
  const events = session.snapshotEvents()
  const bySeq = new Map(events.map(event => [Number(event.seq), event]))
  const byId = new Map(events.flatMap(event => {
    const message = session.deriveEventMessage(event)
    return message === null ? [] : [[message.id, event] as const]
  }))
  const add = (message: Message, depth = 0): void => {
    if (ids.has(message.id)) return
    if (depth > 64) taskFailure('TASK_HANDOFF_HISTORY_UNSUPPORTED')
    ids.add(message.id)
    const event = byId.get(message.id)
    if (message.source.kind === 'plugin' && message.source.plugin === 'compact') {
      if (event?.type !== 'user/message' || !isDeepStrictEqual(event.data, message)
        || !('sourceEventSeqs' in event) || !Array.isArray(event.sourceEventSeqs)
        || event.sourceEventSeqs.length === 0 || new Set(event.sourceEventSeqs).size !== event.sourceEventSeqs.length) taskFailure('TASK_HANDOFF_HISTORY_UNSUPPORTED')
      const source = message.source as typeof message.source & { compactionId?: string }
      const summary = events.find(item => item.type === 'compaction/summary' && item.data.compactionId === source.compactionId)
      const ended = events.find(item => item.type === 'compaction/end' && item.data.compactionId === source.compactionId)
      if (typeof source.compactionId !== 'string' || summary?.type !== 'compaction/summary'
        || ended?.type !== 'compaction/end' || ended.data.error !== undefined || ended.seq <= event.seq || summary.seq >= event.seq) taskFailure('TASK_HANDOFF_HISTORY_UNSUPPORTED')
      // A checkpoint produced on the target route after this handoff remains useful. Older
      // or foreign checkpoints expand from their exact source range, including for compaction requests.
      if (!(event.seq > target.afterSeq && summary.data.provider === 'openai-codex' && summary.data.model === target.model)) {
        for (const seq of [...event.sourceEventSeqs].sort((a, b) => a - b)) {
          const original = bySeq.get(seq)
          if (original === undefined || original.seq >= event.seq) taskFailure('TASK_HANDOFF_HISTORY_UNSUPPORTED')
          const content = session.deriveEventMessage(original)
          if (content !== null && content.role !== 'system') add(content, depth + 1)
        }
        return
      }
    } else if (event !== undefined && 'surfaceOp' in event && event.surfaceOp !== undefined
      && event.surfaceOp !== 'append' && message.role !== 'system') taskFailure('TASK_HANDOFF_HISTORY_UNSUPPORTED')
    const content = portableBlocks(message.content, message.role === 'assistant')
    if (content.length === 0) return
    const source = message.source.kind === 'model'
      ? { kind: 'model' as const, provider: message.source.provider, model: message.source.model }
      : structuredClone(message.source)
    messages.push({ ...message, content, source })
  }
  // Preserve exactly the requested surface/range and current system head, not every
  // archived event on every turn. This allows post-handoff compaction to reduce context again.
  for (const message of current) add(message)
  // Do not silently truncate requirements or tool results to make a handoff succeed.
  if (Buffer.byteLength(JSON.stringify(messages)) > MAX_TRANSFER_BYTES) taskFailure('TASK_HANDOFF_TOO_LARGE')
  return messages
}
