import { expect, it } from 'vitest'
import { createUserMessage, ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, Message } from '@deepseek-ai/dsh-llm'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import { applyReasoningUpdates, createReasoningUpdateMessage, planReasoningUpdates, readReasoningUpdate } from '../src/reasoning-update.ts'
import { assertReasoningUpdateSession } from '../src/reasoning-update-tool.ts'

const id = SessionId('reasoning-fixture')
const notice = () => createReasoningUpdateMessage({ version: 1, sessionId: id, baseEffort: 'low', previousEffort: 'low', effort: 'high' })
const user = (text: string) => createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text }] })
const options = (messages: Message[]): GenerateOptions => ({ provider: 'openai-codex', model: 'gpt-6-astra', reasoningEffort: ReasoningEffortId('low'), sessionId: id, messages })
const wire = (messages: Message[]) => ({ model: 'gpt-6-astra', reasoning: { effort: 'low' }, input: messages.map(message => ({ role: message.role, content: message.content.map(block => ({ type: 'input_text', text: block.type === 'text' ? block.text : '' })) })) })

it('preserves structured approval through the actual session append, JSON restore and derivation', () => {
  const session = Session.create(id)
  session.append('user/message', user('Begin.'), { surfaceOp: 'append' })
  session.append('user/message', notice(), { surfaceOp: 'append' })
  const restored = Session.create(id, JSON.parse(JSON.stringify(session.snapshotEvents())))
  expect(readReasoningUpdate(restored.deriveMessages()[1]!)).toMatchObject({ effort: 'high', sessionId: id })
  expect(planReasoningUpdates(options(restored.deriveMessages()))).toEqual(planReasoningUpdates(options(session.deriveMessages())))
})

it('inserts upgrades and downgrades at original positions without mutating original items or base settings', () => {
  const down = createReasoningUpdateMessage({ version: 1, sessionId: id, baseEffort: 'low', previousEffort: 'high', effort: 'medium' })
  const messages = [user('Start'), notice(), user('Continue'), down]
  const payload = { ...wire(messages), prompt_cache_key: id, tools: [{ name: 'fixture' }] }
  const original = structuredClone(payload)
  const result = applyReasoningUpdates(payload, planReasoningUpdates(options(messages))!) as typeof payload
  expect(result.input.map(item => 'type' in item ? item.type : item.role)).toEqual(['user', 'configuration_update', 'user', 'user', 'configuration_update', 'user'])
  expect(result.input[0]).toBe(payload.input[0])
  expect(result.tools).toBe(payload.tools)
  expect(result.reasoning).toBe(payload.reasoning)
  expect(payload).toEqual(original)
})

it('does not treat ordinary text, model text or another plugin as approval', () => {
  const approved = notice()
  for (const source of [{ kind: 'user' }, { kind: 'model', provider: 'openai-codex', model: 'gpt-6-astra' }, { ...approved.source, plugin: 'another-plugin' }] as Message['source'][]) {
    expect(planReasoningUpdates(options([{ ...approved, source }]))).toBeUndefined()
  }
})

it.each([
  { version: 2 }, { effort: 'ultra' }, { sessionId: '' }, { unexpected: true }, { previousEffort: 'medium' }, { effort: 'low' }, { sessionId: 'fork' }, { baseEffort: 'medium' },
])('rejects damaged or changed durable approval %j', patch => {
  const message = notice()
  const source = message.source as typeof message.source & { reasoningUpdate: object }
  const changed = { ...message, source: { ...source, reasoningUpdate: { ...source.reasoningUpdate, ...patch } } }
  expect(() => planReasoningUpdates(options([changed]))).toThrow()
})

it.each([{ model: 'gpt-5.6-sol' }, { provider: 'other' }, { reasoningEffort: ReasoningEffortId('medium') }, { sessionId: SessionId('fork') }, { purpose: 'compaction' as const }])('rejects a changed request selection %j', patch => {
  expect(() => planReasoningUpdates({ ...options([notice()]), ...patch })).toThrow()
})

it.each([{ previous_response_id: 'resp' }, { context_management: [] }, { truncation: 'auto' }, { agents: [] }, { agent: 'child' }])('rejects unsupported wire modes %j', patch => {
  const messages = [notice()]
  expect(() => applyReasoningUpdates({ ...wire(messages), ...patch }, planReasoningUpdates(options(messages))!)).toThrow()
})

it('rejects duplicate, missing, reordered and preconverted notices', () => {
  const first = notice()
  expect(() => planReasoningUpdates(options([first, first]))).toThrow()
  const messages = [user('Start'), first]
  const plan = planReasoningUpdates(options(messages))!
  for (const input of [[], wire([...messages].reverse()).input, [...wire(messages).input, { type: 'configuration_update', reasoning: { effort: 'high' } }]]) {
    expect(() => applyReasoningUpdates({ ...wire(messages), input }, plan)).toThrow()
  }
  const session = Session.create(id)
  session.append('user/message', first, { surfaceOp: 'append' })
  expect(() => assertReasoningUpdateSession(options([]), session, false)).toThrow(/missing/)
  expect(() => assertReasoningUpdateSession({ ...options([]), purpose: 'compaction' }, undefined, true)).toThrow(/Compaction/)
})
