import { expect, it } from 'vitest'
import type { Context } from '@earendil-works/pi-ai'
import { createUserMessage, ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import { applyReasoningUpdates, createReasoningUpdateMessage, planReasoningUpdates } from '../src/reasoning-update.ts'
import { projectReasoningPlan } from '../src/reasoning-update-provider.ts'

const sessionId = SessionId('system-projection-fixture')
const text = (value: string) => createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: value }] })
const approval = createReasoningUpdateMessage({ version: 1, sessionId, baseEffort: 'low', previousEffort: 'low', effort: 'high' })
const approvalBlock = approval.content[0]
const approvalText = approvalBlock?.type === 'text' ? approvalBlock.text : ''
const converted = (values: string[]): Context['messages'] => values.map(content => ({ role: 'user', content, timestamp: 0 }))
const makePlan = (prompt: string, system?: string) => planReasoningUpdates({
  provider: 'openai-codex', model: 'gpt-6-astra', reasoningEffort: ReasoningEffortId('low'), sessionId,
  messages: [{ ...text(prompt), role: 'system' }, text('Begin'), approval], ...(system === undefined ? {} : { system }),
})!

it.each(['System instructions', ''])('preserves approval positions when the host promotes the leading system prompt %j', prompt => {
  const original = makePlan(prompt)
  const context = { ...(prompt ? { systemPrompt: prompt } : {}), messages: converted(['Begin', approvalText]) }
  const plan = projectReasoningPlan(original, context)
  expect(plan.userCount).toBe(2)
  expect(plan.updates[0]!.userIndex).toBe(1)
  expect(original.userCount).toBe(3)
  const payload = { model: 'gpt-6-astra', reasoning: { effort: 'low' }, instructions: prompt || 'Provider default', input: ['Begin', approvalText].map(value => ({ role: 'user', content: [{ type: 'input_text', text: value }] })) }
  const result = applyReasoningUpdates(payload, plan) as typeof payload
  expect(result.input).toEqual([payload.input[0], { type: 'configuration_update', reasoning: { effort: 'high' } }, payload.input[1]])
  expect(result.instructions).toBe(payload.instructions)
})

it('keeps the legacy in-history prompt and the explicit system override at their original positions', () => {
  for (const explicit of [undefined, 'Explicit override']) {
    const plan = makePlan('History system', explicit)
    expect(projectReasoningPlan(plan, { ...(explicit === undefined ? {} : { systemPrompt: explicit }), messages: converted(['History system', 'Begin', approvalText]) })).toBe(plan)
  }
})

it('does not mistake identical user text for a leading system message', () => {
  const plan = makePlan('Begin')
  const projected = projectReasoningPlan(plan, { systemPrompt: 'Begin', messages: converted(['Begin', approvalText]) })
  expect(projected.updates[0]!.userIndex).toBe(1)
})

it.each(['wrong-prompt', 'dropped-user', 'extra-user', 'explicit-override', 'no-leading-system'] as const)('rejects an unexplained conversion change (%s)', scenario => {
  const plan = scenario === 'no-leading-system'
    ? planReasoningUpdates({ provider: 'openai-codex', model: 'gpt-6-astra', reasoningEffort: ReasoningEffortId('low'), sessionId, messages: [text('Begin'), approval] })!
    : makePlan('System', scenario === 'explicit-override' ? 'Explicit' : undefined)
  const values = scenario === 'dropped-user' || scenario === 'no-leading-system' ? [approvalText]
    : scenario === 'extra-user' ? ['System', 'Extra', 'Begin', approvalText] : ['Begin', approvalText]
  expect(() => projectReasoningPlan(plan, { systemPrompt: scenario === 'wrong-prompt' ? 'Other' : 'System', messages: converted(values) })).toThrow(/context conversion/)
})
