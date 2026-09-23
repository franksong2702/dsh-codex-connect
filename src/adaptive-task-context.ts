/** Portable handoff from the original host journal; never interprets prose as permission. */
import type { ContentBlock, Message, RequestMessage } from '@deepseek-ai/dsh-llm'
import { isCompactCheckpointSource } from '@deepseek-ai/dsh-compaction'
import { isDeepStrictEqual } from 'node:util'
import type { Session } from '@deepseek-ai/dsh-session'
import { taskFailure } from './adaptive-task-store.ts'
import { taskCheckpointValidator } from './adaptive-task-checkpoint.ts'
const MAX_TRANSFER_BYTES = 512_000
function portableBlocks(blocks: readonly ContentBlock[], assistant: boolean): ContentBlock[] {
  const result: ContentBlock[] = []
  for (const block of blocks) {
    if (block.type === 'reasoning' && assistant) continue
    if (block.type === 'text' || block.type === 'tool-call' || block.type === 'image') result.push(structuredClone(block))
    else taskFailure('TASK_HANDOFF_CONTENT_UNSUPPORTED')
  }
  return result
}
/** Reconstruct visible facts, not encrypted thoughts or model-authored summaries, for a new route. */
function isPersistedMessage(message: RequestMessage): message is Message {
  return 'id' in message && typeof message.id === 'string'
}

/** Reconstruct persistent messages and preserve one-off user input that has no session identity. */
export function portableTaskMessages(session: Session, current: readonly RequestMessage[], target: { afterSeq: number; model: string }): RequestMessage[] {
  const messages: RequestMessage[] = []
  const ids = new Set<string>()
  const events = session.snapshotEvents()
  const validateCheckpoint = taskCheckpointValidator(session, events)
  const bySeq = new Map(events.map(event => [Number(event.seq), event]))
  const byId = new Map(events.flatMap(event => {
    const message = session.deriveEventMessage(event)
    return message === null ? [] : [[message.id, event] as const]
  }))
  const add = (message: RequestMessage, depth = 0): void => {
    if (!isPersistedMessage(message)) {
      if (message.role !== 'user') return
      const content = portableBlocks(message.content, false)
      if (content.length > 0) messages.push({ role: 'user', content })
      return
    }
    if (ids.has(message.id)) return
    if (depth > 64) taskFailure('TASK_HANDOFF_HISTORY_UNSUPPORTED')
    ids.add(message.id)
    const event = byId.get(message.id)
    if (isCompactCheckpointSource(message.source)) {
      if (event?.type !== 'user/message' || !isDeepStrictEqual(event.data, message)
        || !('sourceEventSeqs' in event) || !Array.isArray(event.sourceEventSeqs)
        || event.sourceEventSeqs.length === 0 || new Set(event.sourceEventSeqs).size !== event.sourceEventSeqs.length) taskFailure('TASK_HANDOFF_HISTORY_UNSUPPORTED')
      const { summary, sourceSeqs } = validateCheckpoint(event)
      // A checkpoint produced on the target route after this handoff remains useful. Older
      // or foreign checkpoints expand from their exact source range, including for compaction requests.
      if (!(event.seq > target.afterSeq && summary.data.provider === 'openai-codex' && summary.data.model === target.model)) {
        for (const seq of sourceSeqs) {
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
    if (message.role === 'system') {
      messages.push({ ...message, content, source: structuredClone(message.source) })
    } else if (message.role === 'assistant') {
      messages.push({ ...message, content, source: {
        kind: 'model' as const, provider: message.source.provider, model: message.source.model,
      } })
    } else if (message.role === 'tool') {
      messages.push({ ...message, content, source: {
        kind: 'tool' as const, callId: message.source.callId,
      } })
    } else {
      messages.push({ ...message, content, source: { ...message.source } })
    }
  }
  // Preserve exactly the requested surface/range and current system head, not every
  // archived event on every turn. This allows post-handoff compaction to reduce context again.
  for (const message of current) add(message)
  // Do not silently truncate requirements or tool results to make a handoff succeed.
  if (Buffer.byteLength(JSON.stringify(messages)) > MAX_TRANSFER_BYTES) taskFailure('TASK_HANDOFF_TOO_LARGE')
  return messages
}
