/** Internal decision bookkeeping, not a permission service or a second durable state store. */
import type { StreamChunk, TokenUsage } from '@deepseek-ai/dsh-llm'
import { isAstraReasoningEffort } from './reasoning-update.ts'
import type { AstraReasoningEffort } from './reasoning-update.ts'

export const ADAPTIVE_OBSERVATION_LIMIT = 64

/** Constructed from the live host's validated selection/journal, never tool arguments. */
export interface AdaptiveObservation {
  readonly baseEffort: AstraReasoningEffort
  readonly effectiveEffort: AstraReasoningEffort
  readonly revision: number
  readonly generation: number
}
export type AdaptiveAction = Readonly<{ kind: 'keep' } | { kind: 'reasoning'; effort: AstraReasoningEffort }>
export interface AdaptiveRecommendation {
  readonly ordinal: number
  readonly observation: AdaptiveObservation
  readonly action: AdaptiveAction
}
export type AdaptiveDecisionPhase = 'recommended' | 'awaiting-user' | 'queued' | 'applied'
  | 'unchanged' | 'declined' | 'cancelled' | 'stale' | 'failed'
export interface AdaptiveDecisionEvent {
  readonly ordinal: number
  readonly kind: AdaptiveAction['kind']
  readonly from: AstraReasoningEffort
  readonly target: AstraReasoningEffort
  readonly phase: AdaptiveDecisionPhase
}
export type AdaptiveRequestOutcome = 'stop' | 'tool-calls' | 'max-tokens' | 'error' | 'aborted' | 'incomplete' | 'unknown'
export interface AdaptiveRequestSample {
  readonly ordinal: number
  readonly purpose: 'task' | 'compaction' | 'auxiliary'
  readonly effort: AstraReasoningEffort | 'unknown'
  readonly outcome: AdaptiveRequestOutcome
  readonly durationMs: number
  /** Last adapter-reported counters, not a sum of cumulative updates or an estimate of subscription cost. */
  readonly usage?: Readonly<Partial<TokenUsage>>
}
export interface AdaptiveDecisionSnapshot {
  readonly decisionCount: number
  readonly requestCount: number
  readonly decisions: readonly AdaptiveDecisionEvent[]
  readonly requests: readonly AdaptiveRequestSample[]
}

function invalid(message: string): never { throw new TypeError(`Adaptive decision: ${message}`) }
function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function appendBounded<T>(items: T[], item: T): void {
  items.push(item)
  if (items.length > ADAPTIVE_OBSERVATION_LIMIT) items.shift()
}
/** Project only the four non-content fields needed to invalidate an obsolete recommendation. */
export function observeAdaptiveState(state: AdaptiveObservation): AdaptiveObservation {
  if (!isAstraReasoningEffort(state.baseEffort) || !isAstraReasoningEffort(state.effectiveEffort)
    || !Number.isSafeInteger(state.revision) || state.revision < -1
    || !Number.isSafeInteger(state.generation) || state.generation < 0) invalid('invalid host observation')
  return Object.freeze({ baseEffort: state.baseEffort, effectiveEffort: state.effectiveEffort,
    revision: state.revision, generation: state.generation })
}
function sameObservation(a: AdaptiveObservation, b: AdaptiveObservation): boolean {
  return a.baseEffort === b.baseEffort && a.effectiveEffort === b.effectiveEffort
    && a.revision === b.revision && a.generation === b.generation
}
function actionFor(value: unknown, observation: AdaptiveObservation): AdaptiveAction {
  if (!object(value)) invalid('expected an action object')
  const keys = Object.keys(value).sort().join(',')
  if (value.kind === 'keep' && keys === 'kind') return Object.freeze({ kind: 'keep' })
  if (value.kind !== 'reasoning' || keys !== 'effort,kind' || !isAstraReasoningEffort(value.effort)) {
    invalid('unsupported action or authority-bearing extra fields')
  }
  return value.effort === observation.effectiveEffort ? Object.freeze({ kind: 'keep' })
    : Object.freeze({ kind: 'reasoning', effort: value.effort })
}
const USAGE_FIELDS = ['inputTokens', 'outputTokens', 'totalTokens', 'cacheReadTokens', 'cacheWriteTokens', 'reasoningTokens'] as const
/** Unknown/malformed counters stay absent. Never retain content, ids, prices or arbitrary provider fields. */
export function adaptiveUsage(value: unknown): Readonly<Partial<TokenUsage>> | undefined {
  if (!object(value)) return undefined
  const counters: Partial<TokenUsage> = {}
  for (const key of USAGE_FIELDS) {
    const count = value[key]
    if (typeof count === 'number' && Number.isSafeInteger(count) && count >= 0) counters[key] = count
  }
  return Object.keys(counters).length === 0 ? undefined : Object.freeze(counters)
}

/** One live Agent owns a flow. Tickets and telemetry never replace the host journal or human answer. */
export class AdaptiveDecisionFlow {
  private decisionCount = 0
  private requestCount = 0
  private readonly phases = new WeakMap<AdaptiveRecommendation, AdaptiveDecisionPhase>()
  private readonly decisions: AdaptiveDecisionEvent[] = []
  private readonly requests: AdaptiveRequestSample[] = []

  /** Model advice may select an action; it cannot supply ownership, approval, budget or effective state. */
  recommend(observation: AdaptiveObservation, candidate: unknown): AdaptiveRecommendation {
    const captured = observeAdaptiveState(observation)
    const action = actionFor(candidate, captured)
    const recommendation = Object.freeze({ ordinal: ++this.decisionCount, observation: captured, action })
    this.record(recommendation, action.kind === 'keep' ? 'unchanged' : 'recommended')
    return recommendation
  }

  private require(recommendation: AdaptiveRecommendation, expected: AdaptiveDecisionPhase): void {
    if (this.phases.get(recommendation) !== expected) invalid('unknown, copied, or already consumed recommendation')
  }
  private record(recommendation: AdaptiveRecommendation, phase: AdaptiveDecisionPhase): void {
    this.phases.set(recommendation, phase)
    appendBounded(this.decisions, Object.freeze({ ordinal: recommendation.ordinal, kind: recommendation.action.kind,
      from: recommendation.observation.effectiveEffort,
      target: recommendation.action.kind === 'keep' ? recommendation.observation.effectiveEffort : recommendation.action.effort,
      phase }))
  }

  /** Called by the existing native-question owner, not by a model-callable approval endpoint. */
  requestConsent(recommendation: AdaptiveRecommendation): void {
    this.require(recommendation, 'recommended')
    this.record(recommendation, 'awaiting-user')
  }

  /** The host has verified the exact native human answer; recheck its captured state before queueing. */
  admit(recommendation: AdaptiveRecommendation, current: AdaptiveObservation): void {
    this.require(recommendation, 'awaiting-user')
    if (!sameObservation(recommendation.observation, observeAdaptiveState(current))) {
      this.record(recommendation, 'stale')
      invalid('host state changed while awaiting consent')
    }
    this.record(recommendation, 'queued')
  }

  /** Record local application only after the host validates the canonical notice and request header. */
  applied(recommendation: AdaptiveRecommendation): void {
    this.require(recommendation, 'queued')
    this.record(recommendation, 'applied')
  }

  /** Terminal bookkeeping cannot roll back a durable change or turn cancellation into approval. */
  discard(recommendation: AdaptiveRecommendation, phase: 'declined' | 'cancelled' | 'stale' | 'failed'): void {
    const previous = this.phases.get(recommendation)
    if (previous === undefined) invalid('unknown recommendation')
    if (previous === 'recommended' || previous === 'awaiting-user' || previous === 'queued') this.record(recommendation, phase)
  }

  /** Observe the existing adapter stream once, without a second model call or changing its chunks/errors. */
  async *measure(
    descriptor: { purpose: AdaptiveRequestSample['purpose']; effort: unknown; signal?: AbortSignal | undefined },
    stream: AsyncIterable<StreamChunk>,
  ): AsyncIterable<StreamChunk> {
    const ordinal = ++this.requestCount
    const started = performance.now()
    const effort = isAstraReasoningEffort(descriptor.effort) ? descriptor.effort : 'unknown'
    let outcome: AdaptiveRequestOutcome = 'incomplete'
    let usage: Readonly<Partial<TokenUsage>> | undefined
    try {
      for await (const chunk of stream) {
        if (chunk.type === 'usage') usage = adaptiveUsage(chunk.usage)
        if (chunk.type === 'finish') {
          const kind: string = chunk.reason.kind
          outcome = kind === 'stop' || kind === 'tool-calls' || kind === 'max-tokens' || kind === 'error' || kind === 'aborted' ? kind : 'unknown'
        }
        yield chunk
      }
    } catch (error: unknown) {
      outcome = descriptor.signal?.aborted === true ? 'aborted' : 'error'
      throw error
    } finally {
      if (outcome === 'incomplete' && descriptor.signal?.aborted) outcome = 'aborted'
      const elapsed = performance.now() - started
      appendBounded(this.requests, Object.freeze({ ordinal, purpose: descriptor.purpose, effort, outcome,
        durationMs: Number.isFinite(elapsed) ? Math.max(0, Math.round(elapsed)) : 0,
        ...(usage === undefined ? {} : { usage }) }))
    }
  }

  /** A bounded, content-free process-local snapshot; no persistence, networking, or authority restoration. */
  snapshot(): AdaptiveDecisionSnapshot {
    return Object.freeze({ decisionCount: this.decisionCount, requestCount: this.requestCount,
      decisions: Object.freeze([...this.decisions]), requests: Object.freeze([...this.requests]) })
  }
}
