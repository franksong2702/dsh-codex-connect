import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { createUserMessage, ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, Message, UserMessage } from '@deepseek-ai/dsh-llm'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import { applyReasoningUpdates, ASTRA_REASONING_SOURCE, createReasoningUpdateMessage,
  planReasoningUpdates, readReasoningUpdate, readReasoningSelectionOrdinal } from '../src/reasoning-update.ts'
import { prepareReasoningReplay } from '../src/reasoning-update-history.ts'
import { AstraReasoningRequestScope } from '../src/reasoning-update-provider.ts'

const id = SessionId('think-replay-fixture')
const user = (text: string) => createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text }] })
const update = (previousEffort: 'low' | 'high' = 'low', effort: 'high' | 'medium' = 'high') =>
  createReasoningUpdateMessage({ version: 1, sessionId: id, baseEffort: 'low', previousEffort, effort })
const options = (messages: Message[]): GenerateOptions => ({ provider: 'openai-codex', model: 'gpt-6-astra',
  reasoningEffort: ReasoningEffortId('low'), sessionId: id, messages })
const wire = (messages: Message[]) => ({ model: 'gpt-6-astra', reasoning: { effort: 'low', summary: 'auto' },
  input: messages.map(message => ({ role: message.role,
    content: message.content.map(block => ({ type: 'input_text', text: block.type === 'text' ? block.text : '' })) })) })
function saved(messages: UserMessage[]) {
  const session = Session.create(id)
  for (const message of messages) session.append('user/message', message, { surfaceOp: 'append' })
  return session
}

it('replays upgrades and downgrades through real Session append, JSON restoration and derivation', () => {
  const session = saved([user('Start'), update(), user('Continue'), update('high', 'medium')])
  const restored = Session.create(id, JSON.parse(JSON.stringify(session.snapshotEvents())))
  const messages = restored.deriveMessages()
  const config = { ...options(messages), reasoningEffort: ReasoningEffortId('medium') }
  const plan = prepareReasoningReplay(config, restored)!
  const payload = { ...wire(messages), reasoning: { effort: 'medium', summary: 'auto' }, tools: [{ name: 'read_fixture' }] }
  const snapshot = structuredClone(payload)
  const result = applyReasoningUpdates(payload, plan) as typeof payload
  expect(result.input.map(item => 'type' in item ? item.type : item.role)).toEqual([
    'user', 'configuration_update', 'user', 'user', 'configuration_update', 'user',
  ])
  expect(plan.effectiveEffort).toBe('medium')
  expect(result.reasoning).toEqual({ effort: 'low', summary: 'auto' })
  expect(result.input[0]).toBe(payload.input[0]); expect(result.tools).toBe(payload.tools)
  expect(payload).toEqual(snapshot)
  expect(Object.isFrozen(plan)).toBe(true); expect(Object.isFrozen(plan.updates)).toBe(true)
  expect(Object.isFrozen(plan.updates[0])).toBe(true)
})

it('does not turn copied text, model content or another plugin into an approval', () => {
  const notice = update()
  for (const source of [{ kind: 'user' }, { kind: 'model', provider: 'openai-codex', model: 'gpt-6-astra' },
    { ...notice.source, plugin: 'another-plugin' }] as Message['source'][]) {
    const messages = [{ ...notice, source }]
    expect(planReasoningUpdates(options(messages))).toBeUndefined()
    expect(prepareReasoningReplay(options(messages))).toBeUndefined()
  }
})

it('requires the exact recorded notice, not just a matching id or plausible metadata', () => {
  const notice = update(); const session = saved([notice])
  const different = { ...update('low', 'medium'), id: notice.id }
  expect(() => prepareReasoningReplay(options([different]), session)).toThrow(/differs/)
  expect(() => prepareReasoningReplay(options([notice]), Session.create(id))).toThrow(/unrecorded/)
  expect(() => prepareReasoningReplay(options([notice]))).toThrow(/host-owned/)
  expect(() => prepareReasoningReplay(options([notice]), Session.create(SessionId('other')))).toThrow(/host-owned/)
})

it('rejects a dropped update even when no marker remains in the outgoing messages', () => {
  const session = saved([update()])
  expect(() => prepareReasoningReplay(options([]), session)).toThrow(/missing/)
})

it('rejects changed update order and duplicate request notices', () => {
  const first = update(); const second = update('high', 'medium'); const session = saved([first, second])
  expect(() => prepareReasoningReplay(options([second, first]), session)).toThrow(/order/)
  expect(() => prepareReasoningReplay(options([first, first]), session)).toThrow(/order/)
  expect(() => planReasoningUpdates(options([first, first]))).toThrow()
})

it.each(['moved-notice', 'dropped-background', 'edited-background'])('rejects %s in admitted history', kind => {
  const first = user('Original task'); const notice = update(); const last = user('Follow-up')
  const session = saved([first, notice, last])
  const messages = kind === 'moved-notice' ? [first, last, notice]
    : kind === 'dropped-background' ? [notice, last]
      : [{ ...user('Changed task'), id: first.id }, notice, last]
  expect(() => prepareReasoningReplay(options(messages), session)).toThrow(/surface/)
})

it('leaves ordinary sessions and ordinary compaction requests outside the Think guard', () => {
  const messages = [user('A normal request')]
  expect(prepareReasoningReplay(options(messages), saved(messages))).toBeUndefined()
  expect(prepareReasoningReplay({ ...options(messages), purpose: 'compaction' }, saved(messages))).toBeUndefined()
})

it('rejects surface replacement without rewriting or attempting to repair the saved session', () => {
  const session = saved([update()])
  const before = JSON.stringify(session.snapshotEvents())
  // Unit fault injection: emulate the host reporting a replaced surface.
  Object.defineProperty(session.surface, 'replaceGeneration', { value: 1 })
  expect(() => prepareReasoningReplay(options(session.deriveMessages()), session)).toThrow(/Compaction/)
  expect(JSON.stringify(session.snapshotEvents())).toBe(before)
})

it.each([{ purpose: 'compaction' as const }, { provider: 'other' }, { model: 'other-model' },
  { sessionId: SessionId('fork') }, { reasoningEffort: ReasoningEffortId('max') }])(
  'rejects unsupported replay config %j before a delegate can run', async patch => {
    const notice = update(); const session = saved([notice]); let delegates = 0
    const stream = new AstraReasoningRequestScope().stream({ ...options([notice]), ...patch }, () => {
      delegates++; return { async *[Symbol.asyncIterator]() {} }
    }, session)
    await expect((async () => { for await (const value of stream) void value })()).rejects.toThrow()
    expect(delegates).toBe(0)
  })

it.each([{ version: 2 }, { effort: 'ultra' }, { sessionId: '' }, { unexpected: true },
  { previousEffort: 'medium' }, { effort: 'low' }, { sessionId: 'fork' }, { baseEffort: 'medium' }])(
  'rejects damaged canonical snapshot data %j', patch => {
    const notice = update()
    const data = { ...readReasoningUpdate(notice), ...patch }
    const changed: UserMessage = { ...notice, source: { kind: 'plugin', plugin: 'dsh-codex-connect', form: 'snapshot',
      sections: [{ name: ASTRA_REASONING_SOURCE, text: JSON.stringify(data) }] } }
    expect(() => planReasoningUpdates(options([changed]))).toThrow()
  })

it.each(['invalid-json', 'duplicate-section', 'unknown-section', 'legacy-side-channel'])('rejects %s metadata', kind => {
  const notice = update()
  if (notice.source.kind !== 'plugin' || notice.source.form !== 'snapshot') throw Error('fixture')
  const sections = [...notice.source.sections]
  if (kind === 'invalid-json') sections[0] = { name: ASTRA_REASONING_SOURCE, text: '{' }
  if (kind === 'duplicate-section') sections.push(sections[0]!)
  if (kind === 'unknown-section') sections.push({ name: 'unreviewed', text: 'x' })
  const source = { ...notice.source, sections, ...(kind === 'legacy-side-channel' ? { reasoningUpdate: readReasoningUpdate(notice) } : {}) }
  expect(() => readReasoningUpdate({ ...notice, source })).toThrow()
})

it.each([0, -1, 0.5, Number.MAX_SAFE_INTEGER + 1])('rejects invalid selection ordinal %j at construction', ordinal => {
  expect(() => createReasoningUpdateMessage({ version: 1, sessionId: id, baseEffort: 'low', previousEffort: 'low', effort: 'high' }, ordinal)).toThrow()
})
it('preserves canonical selection ordinals without accepting legacy event sequence fields', () => {
  const notice = createReasoningUpdateMessage({ version: 1, sessionId: id, baseEffort: 'low', previousEffort: 'low', effort: 'high' }, 3)
  expect(readReasoningSelectionOrdinal(notice)).toBe(3)
  const legacySource = { ...notice.source, reasoningSelectionSeq: 3 }
  expect(() => readReasoningUpdate({ ...notice, source: legacySource })).toThrow(/Legacy/)
})

it.each([{ previous_response_id: 'resp' }, { context_management: [] }, { truncation: 'auto' }, { agents: [] }, { agent: 'child' }])(
  'rejects unsupported wire configuration %j', patch => {
    const messages = [update()]
    expect(() => applyReasoningUpdates({ ...wire(messages), ...patch }, planReasoningUpdates(options(messages))!)).toThrow()
  })

it.each(['configuration_update', 'compaction', 'compaction_trigger'])('rejects preconverted %s input', type => {
  const messages = [update()]
  expect(() => applyReasoningUpdates({ ...wire(messages), input: [...wire(messages).input, { type }] }, planReasoningUpdates(options(messages))!)).toThrow()
})

it('rejects conversion that moves or removes a notice', () => {
  const messages = [user('Start'), update()]; const plan = planReasoningUpdates(options(messages))!
  for (const input of [[], wire([...messages].reverse()).input]) {
    expect(() => applyReasoningUpdates({ ...wire(messages), input }, plan)).toThrow()
  }
})

it('exposes the mechanism only through guarded host integration, not direct client or package entry points', () => {
  const entry = readFileSync('src/index.ts', 'utf8')
  expect(entry).toContain('registerThinkHostIntegration(ctx)')
  expect(entry).toContain('enableReasoningUpdates: z.boolean().default(false)')
  expect(entry).not.toMatch(/createReasoningUpdateMessage|from ['"]\.\/reasoning-update\.ts['"]/)
  for (const path of ['src/adapter.ts', 'src/client/index.tsx', 'cordis.patch.yml', 'tsdown.config.ts']) {
    expect(readFileSync(path, 'utf8')).not.toMatch(/reasoning-update|think-replay/)
  }
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
  expect(JSON.stringify(pkg.exports)).not.toMatch(/reasoning-update|think-replay/)
})
