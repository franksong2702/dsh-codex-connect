import { expect, it } from 'vitest'
import { AdaptiveDecisionFlow } from '../src/adaptive-decision.ts'

const state = { baseEffort: 'low', effectiveEffort: 'high', revision: 2, generation: 1 } as const

it('keeps delegation admission, verified start and successful cleanup distinct in the shared flow', () => {
  const flow = new AdaptiveDecisionFlow()
  const ticket = flow.recommend(state, { kind: 'split-readonly' })
  expect(() => flow.settleDelegation(ticket, 'completed')).toThrow()
  flow.requestConsent(ticket)
  flow.admit(ticket, state)
  expect(() => flow.settleDelegation(ticket, 'completed')).toThrow()
  flow.applied(ticket)
  flow.settleDelegation(ticket, 'completed')
  expect(flow.snapshot().decisions.map(event => event.phase)).toEqual(['recommended', 'awaiting-user', 'queued', 'applied', 'completed'])
  expect(flow.snapshot().decisions.every(event => event.target === 'high')).toBe(true)
  expect(() => flow.applied(ticket)).toThrow()
})

it.each(['budget', 'approved', 'owner', 'model', 'files', 'children'])('does not accept delegation authority from advice field %s', field => {
  const flow = new AdaptiveDecisionFlow()
  expect(() => flow.recommend(state, { kind: 'split-readonly', [field]: true })).toThrow()
  expect(flow.snapshot().decisionCount).toBe(0)
})

it('cannot reuse a Think approval or copied ticket to complete a Split action', () => {
  const flow = new AdaptiveDecisionFlow()
  const think = flow.recommend(state, { kind: 'reasoning', effort: 'medium' })
  flow.requestConsent(think); flow.admit(think, state); flow.applied(think)
  expect(() => flow.settleDelegation(think, 'completed')).toThrow()
  const split = flow.recommend(state, { kind: 'split-readonly' })
  expect(() => flow.admit(split, state)).toThrow()
  expect(() => new AdaptiveDecisionFlow().requestConsent(split)).toThrow()
  expect(() => flow.settleDelegation({ ...split }, 'failed')).toThrow()
})

it.each(['failed', 'cancelled'] as const)('retains a started worker %s outcome without inventing success', outcome => {
  const flow = new AdaptiveDecisionFlow()
  const split = flow.recommend(state, { kind: 'split-readonly' })
  flow.requestConsent(split); flow.admit(split, state); flow.applied(split)
  flow.settleDelegation(split, outcome)
  expect(flow.snapshot().decisions.at(-1)?.phase).toBe(outcome)
  expect(() => flow.settleDelegation(split, 'completed')).toThrow()
})
