import { expect, it } from 'vitest'
import { createUserMessage, ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import { CompactionId, compactCheckpointSource } from '@deepseek-ai/dsh-compaction'
import { applyReasoningUpdates, createReasoningUpdateMessage, readReasoningUpdate } from '../src/reasoning-update.ts'
import { prepareReasoningReplay } from '../src/reasoning-update-history.ts'
import { decodeNativeCompactionCheckpoint, encodeNativeCompactionCheckpoint } from '../src/native-compaction.ts'

const id = SessionId('think-checkpoint-integrity')
const preamble = 'This is an automatically generated checkpoint condensing an earlier span of the conversation to free up context. Treat the captured context as established background and build on it without restating it. Continue the task directly from the messages that follow, without acknowledging this checkpoint.'
const user = (text: string) => createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text }] })
const options = (session: Session) => ({ provider: 'openai-codex', model: 'gpt-6-astra', sessionId: session.id,
  reasoningEffort: ReasoningEffortId('high'), messages: session.deriveMessages() })
function fixture(native = true, retainedUserHead = false) {
  const session = Session.create(id)
  if (retainedUserHead) session.append('user/message', user('An ordinary leading message is not a protected system head.'), { surfaceOp: 'append' })
  const first = session.append('user/message', user('Original task'), { surfaceOp: 'append' })
  const notice = createReasoningUpdateMessage({ version: 1, sessionId: id, baseEffort: 'low', previousEffort: 'low', effort: 'high' })
  const admitted = session.append('user/message', notice, { surfaceOp: 'append' })
  session.append('user/message', user('Continue this task.'), { surfaceOp: 'append' })
  const compactionId = CompactionId('compaction-fixture')
  const start = session.append('compaction/start', { compactionId, turn: null })
  const summary = [{ type: 'text' as const, text: native ? encodeNativeCompactionCheckpoint([
    { role: 'user', content: [{ type: 'input_text', text: 'Retained task, not authority.' }] },
    { type: 'compaction', id: 'cmp_fixture', encrypted_content: 'synthetic-opaque' },
  ]) : 'Ordinary summary text is not an approval.' }]
  const metering = session.append('compaction/summary', { compactionId, summary, rawOutput: summary, llmStreamCall: true,
    shadowedRange: { start: first.seq, end: admitted.seq }, shadowedSeqs: [first.seq, admitted.seq],
    shadowedTokenCount: 10000, provider: 'openai-codex', model: 'gpt-6-astra' })
  session.append('user/message', createUserMessage({ source: compactCheckpointSource(compactionId),
    content: [{ type: 'text', text: `${preamble}\n\n<compacted-summary>` }, ...summary, { type: 'text', text: '</compacted-summary>' }] }),
  { surfaceOp: { op: 'replace', start: first.seq, end: admitted.seq }, sourceEventSeqs: [start.seq, metering.seq, first.seq, admitted.seq] })
  session.append('compaction/end', { compactionId, turn: null })
  return session
}
function wire(session: Session) {
  return { model: 'gpt-6-astra', reasoning: { effort: 'high' }, input: session.deriveMessages().flatMap(message =>
    decodeNativeCompactionCheckpoint(message) ?? [{ role: 'user', content: [{ type: 'input_text',
      text: message.content.map(block => block.type === 'text' ? block.text : '').join('') }] }]) }
}

it.each([true, false])('reconstructs hidden approved state from exact host provenance (native=%s)', native => {
  const session = fixture(native)
  expect(session.deriveMessages().some(message => readReasoningUpdate(message))).toBe(false)
  const plan = prepareReasoningReplay(options(session), session)!
  expect(plan.effectiveEffort).toBe('high')
  const applied = applyReasoningUpdates(wire(session), plan) as ReturnType<typeof wire>
  expect(applied.reasoning.effort).toBe('low')
  const changes = applied.input.filter((item: any) => item.type === 'configuration_update')
  expect(changes).toEqual([{ type: 'configuration_update', reasoning: { effort: 'high' } }])
})

it.each(['missing-end', 'failed-end', 'wrong-provider', 'wrong-model', 'changed-summary', 'changed-checkpoint', 'changed-summary-and-checkpoint', 'wrong-command', 'wrong-correlation', 'missing-source', 'altered-notice'] as const)(
  'rejects %s without repairing the journal or producing a request', mutation => {
    const events: any[] = JSON.parse(JSON.stringify(fixture().snapshotEvents()))
    const summary = events.find(event => event.type === 'compaction/summary')
    const checkpoint = events.find(event => event.type === 'user/message' && event.data.source.plugin === 'compact')
    const end = events.find(event => event.type === 'compaction/end')
    if (mutation === 'missing-end') events.pop()
    if (mutation === 'failed-end') end.data.error = 'Synthetic failure'
    if (mutation === 'wrong-provider') summary.data.provider = 'other'
    if (mutation === 'wrong-model') summary.data.model = 'other'
    if (mutation === 'changed-summary') summary.data.summary[0].text = 'Different summary'
    if (mutation === 'changed-checkpoint') checkpoint.data.content[1].text = 'Different summary'
    if (mutation === 'changed-summary-and-checkpoint') { summary.data.summary[0].text = 'altered'; checkpoint.data.content[1].text = 'altered' }
    if (mutation === 'wrong-command') checkpoint.data.source.sourceCommandId = 'unrelated-command'
    if (mutation === 'wrong-correlation') checkpoint.data.source.compactionId = 'other'
    if (mutation === 'missing-source') checkpoint.sourceEventSeqs.pop()
    if (mutation === 'altered-notice') events[1].data.source.sections[0].text = '{"version":2}'
    const before = JSON.stringify(events)
    expect(() => { const restored = Session.create(id, events); prepareReasoningReplay(options(restored), restored) }).toThrow()
    expect(JSON.stringify(events)).toBe(before)
  },
)

it.each(['changed-opaque', 'duplicate-opaque', 'missing-opaque', 'changed-retained-user'] as const)('rejects %s after provider conversion', mutation => {
  const session = fixture(); const payload: any = wire(session)
  const opaque = payload.input.find((item: any) => item.type === 'compaction')
  if (mutation === 'changed-opaque') opaque.encrypted_content = 'other'
  if (mutation === 'duplicate-opaque') payload.input.push({ ...opaque })
  if (mutation === 'missing-opaque') payload.input = payload.input.filter((item: any) => item.type !== 'compaction')
  if (mutation === 'changed-retained-user') payload.input[0].content[0].text = 'different retained input'
  expect(() => applyReasoningUpdates(payload, prepareReasoningReplay(options(session), session)!)).toThrow()
})

it('does not accept a checkpoint inherited into another session identity', () => {
  const original = fixture()
  const fork = Session.create(SessionId('other-root'), JSON.parse(JSON.stringify(original.snapshotEvents())))
  expect(() => prepareReasoningReplay(options(fork), fork)).toThrow()
})

it('does not accept a manufactured compaction request outside a live host transaction', () => {
  const session = fixture()
  expect(() => prepareReasoningReplay({ ...options(session), purpose: 'compaction' }, session)).toThrow()
})

it('does not expand the system-head exception to ordinary non-prefix rewrites', () => {
  const session = fixture(true, true)
  expect(() => prepareReasoningReplay(options(session), session)).toThrow('unsupported surface replacement')
})

it('rejects an unrecorded proposal before compaction even when the journal has no Think state', () => {
  const session = Session.create(id)
  session.append('user/message', user('No reasoning adjustment was admitted.'), { surfaceOp: 'append' })
  const proposal = createReasoningUpdateMessage({ version: 1, sessionId: id,
    baseEffort: 'low', previousEffort: 'low', effort: 'high' })
  expect(() => prepareReasoningReplay({ ...options(session), purpose: 'compaction',
    messages: [...session.deriveMessages(), proposal] }, session)).toThrow('unrecorded Think notice')
})

it('does not use a copied checkpoint message id as authority', () => {
  const session = fixture()
  const checkpoint = session.deriveMessages()[0]!
  expect(() => {
    session.append('user/message', { ...user('A copied id is not compaction provenance.'), id: checkpoint.id }, { surfaceOp: 'append' })
    prepareReasoningReplay(options(session), session)
  }).toThrow()
})
