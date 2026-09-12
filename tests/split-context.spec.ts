import { createToolResultMessage, ToolCallId } from '@deepseek-ai/dsh-llm'
import type { Message } from '@deepseek-ai/dsh-llm'
import { expect, it } from 'vitest'
import { assertSplitRequestContext } from '../src/split-context.ts'
import type { SplitRequestContext } from '../src/split-context.ts'
import { SPLIT_WORKER_PROMPT } from '../src/split-worker.ts'

const brief = 'Inspect the single approved source snapshot.'
const text = (value: string) => [{ type: 'text' as const, text: value }]
const task = (): Message => ({ id: 'task' as Message['id'], role: 'user', source: { kind: 'user' }, content: text(brief) })
const system = (): Message => ({ id: 'system' as Message['id'], role: 'system', source: { kind: 'plugin', plugin: '@deepseek-ai/dsh-system-prompt' }, content: text(SPLIT_WORKER_PROMPT) })
const assistant = (): Message => ({ id: 'assistant' as Message['id'], role: 'assistant', source: { kind: 'model', provider: 'openai-codex', model: 'gpt-5.6-luna' }, content: text('Inspecting evidence.') })
const result = (): Message => createToolResultMessage({ callId: ToolCallId('read'), isError: false, content: text('Approved snapshot text.') })
function request(form: 'field' | 'history'): SplitRequestContext {
  return form === 'field' ? { system: SPLIT_WORKER_PROMPT, messages: [task()] } : { messages: [system(), task()] }
}
const check = (value: SplitRequestContext) => assertSplitRequestContext(value, SPLIT_WORKER_PROMPT, brief)
it.each(['field', 'history'] as const)('accepts the exact %s prompt without mutating a frozen host request', form => {
  const value = request(form)
  for (const message of value.messages) { Object.freeze(message.source); message.content.forEach(Object.freeze); Object.freeze(message.content); Object.freeze(message) }
  Object.freeze(value.messages); Object.freeze(value)
  const before = JSON.stringify(value)
  expect(() => check(value)).not.toThrow()
  expect(JSON.stringify(value)).toBe(before)
})
it.each(['field', 'history'] as const)('accepts model/tool continuation after the approved task in %s form', form => {
  const base = request(form)
  expect(() => check({ ...base, messages: [...base.messages, assistant(), result()] })).not.toThrow()
})
it('validates text semantically without depending on property insertion order', () => {
  expect(() => check({ messages: [{ ...system(), content: [{ text: SPLIT_WORKER_PROMPT, type: 'text' }] }, task()] })).not.toThrow()
})
it.each(['field', 'history'] as const)('rejects additional system or user context after valid %s history', form => {
  const base = request(form)
  for (const extra of [system(), task(), { ...task(), source: { kind: 'plugin' as const, plugin: 'fixture' } }]) {
    expect(() => check({ ...base, messages: [...base.messages, assistant(), result(), extra] })).toThrow('SPLIT_CONTEXT_DENIED')
  }
})
it.each([
  'no-system', 'empty-system', 'wrong-field', 'wrong-history-text', 'wrong-origin', 'user-origin',
  'two-representations', 'empty-field-with-history', 'duplicate-system', 'late-system',
  'system-after-task', 'missing-task', 'changed-task', 'task-role', 'extra-user', 'extra-plugin',
  'system-extra-block', 'system-empty-content', 'task-extra-block', 'system-form',
] as const)('rejects %s rather than relaxing the isolation boundary', kind => {
  let value: SplitRequestContext = request('history')
  const head = system(); const approved = task()
  if (kind === 'no-system') value = { messages: [approved] }
  if (kind === 'empty-system') value = { system: '', messages: [approved] }
  if (kind === 'wrong-field') value = { system: 'Unapproved instructions', messages: [approved] }
  if (kind === 'wrong-history-text') value = { messages: [{ ...head, content: text('Unapproved instructions') }, approved] }
  if (kind === 'wrong-origin') value = { messages: [{ ...head, source: { kind: 'plugin', plugin: 'other-plugin' } }, approved] }
  if (kind === 'user-origin') value = { messages: [{ ...head, source: { kind: 'user' } }, approved] }
  if (kind === 'two-representations') value = { system: SPLIT_WORKER_PROMPT, messages: [head, approved] }
  if (kind === 'empty-field-with-history') value = { system: '', messages: [head, approved] }
  if (kind === 'duplicate-system') value = { messages: [head, system(), approved] }
  if (kind === 'late-system') value = { messages: [approved, head] }
  if (kind === 'system-after-task') value = { messages: [head, approved, system()] }
  if (kind === 'missing-task') value = { messages: [head] }
  if (kind === 'changed-task') value = { messages: [head, { ...approved, content: text('A different task') }] }
  if (kind === 'task-role') value = { system: SPLIT_WORKER_PROMPT, messages: [{ ...approved, role: 'system' }] }
  if (kind === 'extra-user') value = { messages: [head, approved, task()] }
  if (kind === 'extra-plugin') value = { messages: [head, approved, { ...approved, source: { kind: 'plugin', plugin: 'fixture' } }] }
  if (kind === 'system-extra-block') value = { messages: [{ ...head, content: [...head.content, ...text('Extra context')] }, approved] }
  if (kind === 'system-empty-content') value = { messages: [{ ...head, content: [] }, approved] }
  if (kind === 'task-extra-block') value = { messages: [head, { ...approved, content: [...approved.content, ...text('Extra scope')] }] }
  if (kind === 'system-form') value = { messages: [{ ...head, source: { kind: 'plugin', plugin: '@deepseek-ai/dsh-system-prompt', form: 'recall' } }, approved] }
  expect(() => check(value)).toThrow('SPLIT_CONTEXT_DENIED')
})
