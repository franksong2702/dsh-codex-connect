import { describe, expect, it } from 'vitest'
import type { StreamChunk } from '@deepseek-ai/dsh-llm'
import { ADAPTIVE_OBSERVATION_LIMIT, AdaptiveDecisionFlow, adaptiveUsage, observeAdaptiveState } from '../src/adaptive-decision.ts'

const state = () => ({ baseEffort: 'low' as const, effectiveEffort: 'low' as const, revision: -1, generation: 0 })
const consume = async (stream: AsyncIterable<StreamChunk>) => { const items = []; for await (const item of stream) items.push(item); return items }
async function* chunks(items: StreamChunk[]) { yield* items }
const stop: StreamChunk = { type: 'finish', reason: { kind: 'stop' } }

describe('Adaptive Runtime reasoning decision contract', () => {
  it('makes keep and a same-effort recommendation no-ops without admission authority', () => {
    const flow = new AdaptiveDecisionFlow()
    for (const candidate of [{ kind: 'keep' }, { kind: 'reasoning', effort: 'low' }]) {
      const result = flow.recommend(state(), candidate)
      expect(result.action.kind).toBe('keep')
      expect(() => flow.requestConsent(result)).toThrow()
      expect(() => flow.admit(result, state())).toThrow()
      expect(() => flow.applied(result)).toThrow()
    }
    expect(flow.snapshot().decisions.map(item => item.phase)).toEqual(['unchanged', 'unchanged'])
    expect(flow.snapshot().requestCount).toBe(0)
  })

  it('orders recommendation, native consent, queueing and local application without permitting reuse', () => {
    const flow = new AdaptiveDecisionFlow()
    const recommendation = flow.recommend(state(), { kind: 'reasoning', effort: 'high' })
    expect(() => flow.admit(recommendation, state())).toThrow()
    expect(() => flow.applied(recommendation)).toThrow()
    flow.requestConsent(recommendation)
    flow.admit(recommendation, state())
    expect(flow.snapshot().decisions.at(-1)?.phase).toBe('queued')
    flow.applied(recommendation)
    expect(() => flow.applied(recommendation)).toThrow()
    flow.discard(recommendation, 'cancelled')
    expect(flow.snapshot().decisions.map(item => item.phase)).toEqual(['recommended', 'awaiting-user', 'queued', 'applied'])
  })

  it('does not accept a copied ticket or another live flow as the issuer', () => {
    const flow = new AdaptiveDecisionFlow()
    const recommendation = flow.recommend(state(), { kind: 'reasoning', effort: 'high' })
    expect(() => flow.requestConsent({ ...recommendation })).toThrow()
    expect(() => new AdaptiveDecisionFlow().requestConsent(recommendation)).toThrow()
    expect(() => flow.discard({ ...recommendation }, 'failed')).toThrow()
  })

  it.each(['baseEffort', 'effectiveEffort', 'revision', 'generation'] as const)('invalidates a recommendation after the host changes %s', key => {
    const flow = new AdaptiveDecisionFlow()
    const recommendation = flow.recommend(state(), { kind: 'reasoning', effort: 'high' })
    flow.requestConsent(recommendation)
    const changed = { ...state(), [key]: key.endsWith('Effort') ? 'medium' : 1 }
    expect(() => flow.admit(recommendation, changed as ReturnType<typeof state>)).toThrow('host state changed')
    expect(flow.snapshot().decisions.at(-1)?.phase).toBe('stale')
    expect(() => flow.applied(recommendation)).toThrow()
  })

  it.each(['declined', 'cancelled', 'stale', 'failed'] as const)('cannot apply a %s decision', phase => {
    const flow = new AdaptiveDecisionFlow()
    const recommendation = flow.recommend(state(), { kind: 'reasoning', effort: 'high' })
    flow.requestConsent(recommendation)
    flow.discard(recommendation, phase)
    expect(() => flow.admit(recommendation, state())).toThrow()
    expect(() => flow.applied(recommendation)).toThrow()
  })

  it.each([null, [], { kind: 'split', children: 1 }, { kind: 'reasoning', effort: 'default' },
    { kind: 'keep', approved: true }, { kind: 'reasoning', effort: 'high', owner: 'model-supplied-owner' }])(
    'rejects malformed or unsupported advice without retaining it (%j)', candidate => {
      const flow = new AdaptiveDecisionFlow()
      expect(() => flow.recommend(state(), candidate)).toThrow()
      expect(flow.snapshot().decisionCount).toBe(0)
    },
  )

  it('copies and freezes only safe host fields instead of retaining a mutable observation', () => {
    const original = { ...state(), privateContent: 'DO_NOT_RETAIN' }
    const observation = observeAdaptiveState(original)
    original.generation = 9
    expect(observation.generation).toBe(0)
    expect(JSON.stringify(observation)).not.toContain('DO_NOT_RETAIN')
    expect(Object.isFrozen(observation)).toBe(true)
    expect(() => observeAdaptiveState({ ...state(), generation: NaN })).toThrow()
    expect(() => observeAdaptiveState({ ...state(), revision: -2 })).toThrow()
  })

  it('bounds history without making retained observations a permission or durable state store', async () => {
    const flow = new AdaptiveDecisionFlow()
    for (let i = 0; i < ADAPTIVE_OBSERVATION_LIMIT + 6; i++) {
      flow.recommend(state(), { kind: 'keep' })
      await consume(flow.measure({ purpose: 'task', effort: 'low' }, chunks([stop])))
    }
    const snapshot = flow.snapshot()
    expect(snapshot.decisionCount).toBe(70)
    expect(snapshot.requestCount).toBe(70)
    expect(snapshot.decisions).toHaveLength(64)
    expect(snapshot.requests).toHaveLength(64)
    expect(snapshot.decisions[0]?.ordinal).toBe(7)
    expect(Object.isFrozen(snapshot.decisions)).toBe(true)
    expect(Object.isFrozen(snapshot.requests[0])).toBe(true)
    expect(new AdaptiveDecisionFlow().snapshot().decisionCount).toBe(0)
  })
})

describe('bounded adapter observations, not savings claims', () => {
  it('passes original chunks through and retains the last usage observation without summing cumulative values', async () => {
    const flow = new AdaptiveDecisionFlow()
    const first: StreamChunk = { type: 'usage', usage: { inputTokens: 100, outputTokens: 3 } }
    const last: StreamChunk = { type: 'usage', usage: { inputTokens: 100, outputTokens: 8, cacheReadTokens: 20, reasoningTokens: 5 } }
    const text: StreamChunk = { type: 'text-delta', index: 0, text: 'PRIVATE_RESPONSE' }
    const items = [first, text, last, stop]
    const result = await consume(flow.measure({ purpose: 'task', effort: 'high' }, chunks(items)))
    expect(result).toEqual(items)
    expect(result[1]).toBe(text)
    const sample = flow.snapshot().requests[0]!
    expect(sample).toMatchObject({ effort: 'high', purpose: 'task', outcome: 'stop', usage: last.usage })
    expect(sample.usage?.totalTokens).toBeUndefined()
    expect(sample.durationMs).toBeGreaterThanOrEqual(0)
    expect(JSON.stringify(flow.snapshot())).not.toMatch(/PRIVATE_RESPONSE|savings|price|account|prompt/)
    expect(flow.snapshot().decisions).toEqual([])
  })

  it('preserves missing and invalid usage as unknown, not zero', () => {
    expect(adaptiveUsage(undefined)).toBeUndefined()
    expect(adaptiveUsage({ inputTokens: NaN, outputTokens: -1, totalTokens: Infinity })).toBeUndefined()
    expect(adaptiveUsage({ inputTokens: 2.5, outputTokens: 0, reasoningTokens: Number.MAX_SAFE_INTEGER + 1,
      prompt: 'secret', token: 'secret', price: 99 })).toEqual({ outputTokens: 0 })
  })

  it('records an exception without swallowing it or treating partial usage as success', async () => {
    const flow = new AdaptiveDecisionFlow(); const error = new Error('PRIVATE_FAILURE')
    async function* failed(): AsyncIterable<StreamChunk> { yield { type: 'usage', usage: { inputTokens: 12, outputTokens: 2 } }; throw error }
    await expect(consume(flow.measure({ purpose: 'compaction', effort: undefined }, failed()))).rejects.toBe(error)
    expect(flow.snapshot().requests[0]).toMatchObject({ purpose: 'compaction', effort: 'unknown', outcome: 'error' })
    expect(JSON.stringify(flow.snapshot())).not.toContain('PRIVATE_FAILURE')
  })

  it('does not invent a completion when the consumer stops early and still closes the delegate', async () => {
    const flow = new AdaptiveDecisionFlow(); let closed = false
    async function* partial(): AsyncIterable<StreamChunk> {
      try { yield { type: 'text-delta', index: 0, text: 'private' }; yield stop } finally { closed = true }
    }
    const stream = flow.measure({ purpose: 'task', effort: 'medium' }, partial())
    expect(flow.snapshot().requestCount).toBe(0)
    for await (const item of stream) { void item; break }
    expect(closed).toBe(true)
    expect(flow.snapshot().requests[0]?.outcome).toBe('incomplete')
  })

  it('keeps concurrent stream measurements independent and distinguishes cancellation', async () => {
    const flow = new AdaptiveDecisionFlow(); const controller = new AbortController()
    const error = new Error('private cancellation')
    async function* canceled(): AsyncIterable<StreamChunk> { controller.abort(error); throw error }
    await Promise.all([
      consume(flow.measure({ purpose: 'task', effort: 'high' }, chunks([stop]))),
      expect(consume(flow.measure({ purpose: 'compaction', effort: 'medium', signal: controller.signal }, canceled()))).rejects.toBe(error),
    ])
    expect(flow.snapshot().requests.map(sample => sample.ordinal).sort()).toEqual([1, 2])
    expect(flow.snapshot().requests.find(sample => sample.purpose === 'compaction')?.outcome).toBe('aborted')
    expect(flow.snapshot().requests.find(sample => sample.purpose === 'task')?.outcome).toBe('stop')
  })
})
