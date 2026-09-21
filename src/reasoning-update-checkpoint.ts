/** Think state is derived from the host's append-only journal, never from summary prose. */
import { isDeepStrictEqual } from 'node:util'
import { ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, Message } from '@deepseek-ai/dsh-llm'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-compaction/types'
import { foldSurface, isSurfaceEvent } from '@deepseek-ai/dsh-session/surface'
import { decodeNativeCompactionCheckpoint } from './native-compaction.ts'
import { isAstraReasoningEffort, planReasoningUpdates, readReasoningUpdate, reasoningUpdateError } from './reasoning-update.ts'
import type { AstraReasoningEffort, AstraReasoningPlan } from './reasoning-update.ts'

/** The wire projection of one source-validated compacted prefix. No new authority is persisted. */
export interface ThinkCheckpointProjection {
  readonly userIndex: number
  readonly content: Message['content']
  readonly nativeItems?: readonly unknown[]
  readonly effort?: AstraReasoningEffort
}
interface StateNode { readonly seq: number; readonly eventType: string; readonly message: Message | null; readonly absorbed: number }
interface ThinkJournal {
  readonly base: AstraReasoningEffort
  readonly notices: readonly Message[]
  readonly nodes: readonly StateNode[]
  readonly checkpoints: ReadonlyMap<string, number>
}
const PREAMBLE = 'This is an automatically generated checkpoint condensing an earlier span of the conversation to free up context. Treat the captured context as established background and build on it without restating it. Continue the task directly from the messages that follow, without acknowledging this checkpoint.'

function fail(): never {
  return reasoningUpdateError('Compaction cannot preserve Think authority: the host checkpoint journal is incomplete or inconsistent.')
}

/** Newer declared hosts add this discriminator; the pinned baseline type union predates it. */
function isSystemEvent(event: { readonly type: string }): boolean {
  return event.type === 'system/message'
}

/** Find canonical admitted state even when its notices are hidden from the model surface. */
export function recordedReasoningBase(session: Session): AstraReasoningEffort | undefined {
  for (const event of session.snapshotEvents()) {
    if (event.type === 'user/message') {
      const update = readReasoningUpdate(event.data)
      if (update !== undefined) return update.baseEffort
    }
  }
  return undefined
}

function checkpointCount(
  events: readonly SessionEvent[], event: SessionEvent, shadowed: readonly StateNode[],
  noticeIndices: ReadonlyMap<string, number>,
  range: { readonly start: number; readonly end: number; readonly shadowedSeqs: readonly number[] },
): number {
  if (event.type !== 'user/message' || event.data.source.kind !== 'plugin' || event.data.source.plugin !== 'compact') fail()
  const source = event.data.source as typeof event.data.source & { compactionId?: unknown; sourceCommandId?: unknown }
  if (typeof source.compactionId !== 'string' || event.surfaceOp === undefined || event.surfaceOp === 'append') fail()
  const position = events.indexOf(event)
  const summary = events[position - 1]
  const starts = events.filter(candidate => candidate.type === 'compaction/start' && candidate.data.compactionId === source.compactionId)
  const ends = events.filter(candidate => candidate.type === 'compaction/end' && candidate.data.compactionId === source.compactionId)
  const start = starts[0]; const end = ends[0]
  if (starts.length !== 1 || ends.length !== 1 || start?.type !== 'compaction/start' || end?.type !== 'compaction/end'
    || start.seq >= event.seq || end.seq <= event.seq || end.data.error !== undefined || end.data.turn !== start.data.turn
    || summary?.type !== 'compaction/summary' || summary.data.compactionId !== source.compactionId
    || summary.data.provider !== 'openai-codex' || summary.data.model !== 'gpt-6-astra'
    || summary.data.llmStreamCall !== true || events[position + 1] !== end
    || source.sourceCommandId !== start.data.sourceCommandId || summary.data.sourceCommandId !== start.data.sourceCommandId
    || end.data.sourceCommandId !== start.data.sourceCommandId) fail()
  if (!Array.isArray(summary.data.rawOutput)
    || !isDeepStrictEqual(summary.data.summary, summary.data.rawOutput.filter(block => block.type === 'text'))
    || !isDeepStrictEqual(source, { kind: 'plugin', plugin: 'compact', compactionId: start.data.compactionId,
      ...(start.data.sourceCommandId === undefined ? {} : { sourceCommandId: start.data.sourceCommandId }) })) fail()
  const seqs = shadowed.map(node => node.seq)
  if (!isDeepStrictEqual(range.shadowedSeqs, seqs) || !isDeepStrictEqual(summary.data.shadowedSeqs, seqs)
    || summary.data.shadowedRange.start !== range.start || summary.data.shadowedRange.end !== range.end
    || !isDeepStrictEqual(event.sourceEventSeqs, [start.seq, summary.seq, ...seqs])) fail()
  const content = [{ type: 'text', text: `${PREAMBLE}\n\n<compacted-summary>` }, ...summary.data.summary,
    { type: 'text', text: '</compacted-summary>' }]
  if (!isDeepStrictEqual(event.data.content, content)) fail()
  let count = 0
  for (const node of shadowed) {
    if (node.absorbed > 0) {
      if (count !== 0) fail()
      count = node.absorbed
    }
    const index = node.message === null ? undefined : noticeIndices.get(node.message.id)
    if (index !== undefined) {
      if (index !== count) fail()
      count += 1
    }
  }
  return count
}

function journal(session: Session): ThinkJournal | undefined {
  const events = session.snapshotEvents()
  const notices = events.flatMap(event => event.type === 'user/message' && readReasoningUpdate(event.data) !== undefined ? [event.data] : [])
  const first = notices[0] === undefined ? undefined : readReasoningUpdate(notices[0])
  if (first === undefined) return undefined
  // Validate every archived transition, not only the visible suffix. A checkpoint cannot repair a bad chain.
  planReasoningUpdates({ provider: 'openai-codex', model: 'gpt-6-astra', sessionId: session.id,
    reasoningEffort: ReasoningEffortId(first.baseEffort), messages: notices })
  const folded = foldSurface(events)
  if (folded.replacements.length !== session.surface.replaceGeneration
    || !isDeepStrictEqual(folded.nodes, [...session.surface.nodes])) fail()
  // The host validates its own persisted operation schema and projects stable start/end fields.
  // Newer hosts renamed raw start/end to startSeq/endSeq; never reinterpret those bytes here.
  const replacements = new Map(folded.replacements.map(replacement => [replacement.seq, replacement]))
  const indices = new Map(notices.map((notice, index) => [notice.id, index]))
  const nodes: StateNode[] = []
  const checkpoints = new Map<string, number>()
  for (const event of events) {
    const message = session.deriveEventMessage(event)
    if (!isSurfaceEvent(event)) continue
    if (event.surfaceOp === 'append') {
      if (message?.source.kind === 'plugin' && message.source.plugin === 'compact') fail()
      // Keep non-message surface nodes: newer hosts persist an empty system head and usage-only assistant nodes.
      nodes.push({ seq: event.seq, eventType: event.type, message, absorbed: 0 })
      continue
    }
    // Canonical host system-head refresh is not a compaction and cannot absorb a Think notice.
    const op = replacements.get(event.seq)
    if (op === undefined) fail()
    const start = nodes.findIndex(node => node.seq === op.start)
    const end = nodes.findIndex(node => node.seq === op.end)
    if (isSystemEvent(event) && start === 0 && end === 0 && nodes[0]?.eventType === 'system/message') {
      if (nodes[0].absorbed !== 0) fail()
      nodes[0] = { seq: event.seq, eventType: event.type, message, absorbed: 0 }
      continue
    }
    const firstCompactable = nodes[0]?.eventType === 'system/message' ? 1 : 0
    if (start !== firstCompactable || end < start || message === null) {
      reasoningUpdateError(`Think refuses an unsupported surface replacement (type=${event.type}; start=${start}; end=${end}; head=${nodes[0]?.eventType}; message=${message === null ? 'none' : message.role}).`)
    }
    const absorbed = checkpointCount(events, event, nodes.slice(start, end + 1), indices, op)
    // Validate native bytes even if all updates happen after this particular checkpoint.
    decodeNativeCompactionCheckpoint(message)
    checkpoints.set(message.id, absorbed)
    nodes.splice(start, end - start + 1, { seq: event.seq, eventType: event.type, message, absorbed })
  }
  if (!isDeepStrictEqual(nodes.flatMap(node => node.message === null ? [] : [node.message]), session.deriveMessages())) fail()
  let count = 0
  for (const node of nodes) {
    if (node.absorbed > 0) {
      if (count !== 0) fail()
      count = node.absorbed
    }
    const index = node.message === null ? undefined : indices.get(node.message.id)
    if (index !== undefined) { if (index !== count) fail(); count += 1 }
  }
  if (count !== notices.length) fail()
  const visible = new Map(nodes.flatMap(node => node.message !== null && checkpoints.has(node.message.id)
    ? [[node.message.id, checkpoints.get(node.message.id)!] as const] : []))
  return { base: first.baseEffort, notices, nodes, checkpoints: visible }
}

function plan(options: GenerateOptions, state: ThinkJournal, messages: readonly Message[], compaction: boolean): AstraReasoningPlan {
  if (options.provider !== 'openai-codex' || options.model !== 'gpt-6-astra'
    || (options.purpose !== undefined && !compaction)) {
    reasoningUpdateError('Think checkpoint state requires the original Astra route; other auxiliary or delegated requests are unsupported.')
  }
  let effective = state.base
  let previous = state.base
  let userCount = 0
  const checkpoints: ThinkCheckpointProjection[] = []
  const updates: Array<{ userIndex: number; text: string; effort: AstraReasoningEffort }> = []
  for (const message of messages) {
    const absorbed = state.checkpoints.get(message.id)
    if (absorbed !== undefined) {
      if (message.source.kind !== 'plugin' || message.source.plugin !== 'compact'
        || !isDeepStrictEqual(state.nodes.find(node => node.message?.id === message.id)?.message, message)) fail()
      const nativeItems = decodeNativeCompactionCheckpoint(message)
      const hidden = absorbed === 0 ? undefined : readReasoningUpdate(state.notices[absorbed - 1]!)!
      if (hidden !== undefined) { previous = effective; effective = hidden.effort }
      checkpoints.push({ userIndex: userCount, content: structuredClone(message.content),
        ...(nativeItems === undefined ? {} : { nativeItems: structuredClone(nativeItems) }),
        ...(hidden === undefined ? {} : { effort: effective }) })
    }
    const update = readReasoningUpdate(message)
    if (update !== undefined) {
      if (update.sessionId !== options.sessionId || update.baseEffort !== state.base
        || update.previousEffort !== effective || update.effort === effective) fail()
      previous = effective; effective = update.effort
      const text = message.content[0]
      if (text?.type !== 'text') fail()
      updates.push({ userIndex: userCount, text: text.text, effort: update.effort })
    }
    if (message.role === 'assistant') continue
    const results = message.content.filter(block => block.type === 'tool-result')
    if (results.length > 0) {
      if (message.role !== 'user' || message.source.kind !== 'tool' || message.content.length !== 1) fail()
      continue
    }
    userCount += 1
  }
  const requestEffort = compaction ? effective : options.reasoningEffort
  if (!isAstraReasoningEffort(requestEffort) || ![state.base, previous, effective].includes(requestEffort)) {
    reasoningUpdateError('Think checkpoint effort does not match the admitted state.')
  }
  const leading = messages[0]
  const leadingSystemText = options.system === undefined && leading?.role === 'system'
    ? leading.content.filter(block => block.type === 'text').map(block => block.text).join('') : undefined
  return Object.freeze({ baseEffort: state.base, effectiveEffort: effective, requestEffort, userCount,
    updates: Object.freeze(updates.map(update => Object.freeze(update))),
    checkpoints: Object.freeze(checkpoints.map(checkpoint => Object.freeze(checkpoint))),
    ...(compaction ? { compaction: true as const } : {}),
    ...(leadingSystemText === undefined ? {} : { leadingSystemText }) })
}

/** Validate the complete visible surface, or an exact host compaction prefix plus its instruction. */
export function prepareCheckpointReasoningReplay(options: GenerateOptions, session: Session): AstraReasoningPlan | undefined {
  const state = journal(session)
  if (state === undefined) return undefined
  if (options.sessionId !== session.id) fail()
  const surface = state.nodes.flatMap(node => node.message === null ? [] : [node.message])
  if (options.purpose === 'compaction') {
    const lifecycle = session.snapshotEvents().filter(event => event.type === 'compaction/start' || event.type === 'compaction/end').at(-1)
    const instruction = options.messages.at(-1)
    const prefix = options.messages.slice(0, -1)
    if (lifecycle?.type !== 'compaction/start' || prefix.length === 0 || prefix.length >= surface.length
      || !isDeepStrictEqual(prefix, surface.slice(0, prefix.length))
      || instruction?.role !== 'user' || instruction.source.kind !== 'plugin' || instruction.source.plugin !== 'dsh-compaction-basic'
      || instruction.content.length !== 1 || instruction.content[0]?.type !== 'text' || instruction.content[0].text.trim() === '') fail()
    return plan(options, state, options.messages, true)
  }
  if (options.purpose !== undefined || !isDeepStrictEqual(options.messages, surface)) fail()
  return plan(options, state, surface, false)
}

/** Trusted pre-step planning only; never admits these not-yet-recorded additions for provider dispatch. */
export function planCheckpointReasoningAdmission(options: GenerateOptions, session: Session, additions: readonly Message[]): AstraReasoningPlan | undefined {
  const state = journal(session)
  if (state === undefined) return planReasoningUpdates(options)
  if (options.sessionId !== session.id || options.purpose !== undefined
    || !isDeepStrictEqual(options.messages, [...session.deriveMessages(), ...additions])) fail()
  return plan(options, state, options.messages, false)
}
