/** Model-independent checkpoint provenance extracted from the M1 journal validation. */
import { isDeepStrictEqual } from 'node:util'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import { compactCheckpointSource, isCompactCheckpointSource } from '@deepseek-ai/dsh-compaction'
import { foldSurface } from '@deepseek-ai/dsh-session/surface'
import { decodeNativeCompactionCheckpoint } from './native-compaction.ts'
import { taskFailure } from './adaptive-task-store.ts'

const PREAMBLE = 'This is an automatically generated checkpoint condensing an earlier span of the conversation to free up context. Treat the captured context as established background and build on it without restating it. Continue the task directly from the messages that follow, without acknowledging this checkpoint.'
const fail = (): never => taskFailure('TASK_HANDOFF_HISTORY_UNSUPPORTED')

export function taskCheckpointValidator(session: Session, events: readonly SessionEvent[]) {
  const folded = foldSurface(events)
  if (folded.replacements.length !== session.surface.replaceGeneration
    || !isDeepStrictEqual(folded.nodes, [...session.surface.nodes])) fail()
  const replacements = new Map(folded.replacements.map(item => [item.seq, item]))
  return (event: SessionEvent) => {
    if (event.type !== 'user/message' || !isCompactCheckpointSource(event.data.source)) return fail()
    const source = event.data.source
    const position = events.indexOf(event)
    const summary = events[position - 1]
    const starts = events.filter(item => item.type === 'compaction/start' && item.data.compactionId === source.compactionId)
    const ends = events.filter(item => item.type === 'compaction/end' && item.data.compactionId === source.compactionId)
    const start = starts[0]; const end = ends[0]; const range = replacements.get(event.seq)
    if (typeof source.compactionId !== 'string' || starts.length !== 1 || ends.length !== 1
      || start?.type !== 'compaction/start' || end?.type !== 'compaction/end'
      || summary?.type !== 'compaction/summary' || summary.data.compactionId !== source.compactionId
      || start.seq >= summary.seq || events[position + 1] !== end || end.data.error !== undefined
      || end.data.turn !== start.data.turn || summary.data.llmStreamCall !== true
      || source.sourceCommandId !== start.data.sourceCommandId || summary.data.sourceCommandId !== start.data.sourceCommandId
      || end.data.sourceCommandId !== start.data.sourceCommandId || range === undefined) return fail()
    if (!Array.isArray(summary.data.rawOutput)
      || !isDeepStrictEqual(summary.data.summary, summary.data.rawOutput.filter(block => block.type === 'text'))
      || !isDeepStrictEqual(source, compactCheckpointSource(start.data.compactionId, start.data.sourceCommandId))
      || !isDeepStrictEqual(summary.data.shadowedSeqs, range.shadowedSeqs)
      || summary.data.shadowedRange.start !== range.start || summary.data.shadowedRange.end !== range.end
      || !isDeepStrictEqual(event.sourceEventSeqs, [start.seq, summary.seq, ...range.shadowedSeqs])) return fail()
    const content = [{ type: 'text', text: `${PREAMBLE}\n\n<compacted-summary>` }, ...summary.data.summary,
      { type: 'text', text: '</compacted-summary>' }]
    if (!isDeepStrictEqual(event.data.content, content)) return fail()
    decodeNativeCompactionCheckpoint(event.data)
    return { summary, sourceSeqs: range.shadowedSeqs }
  }
}
