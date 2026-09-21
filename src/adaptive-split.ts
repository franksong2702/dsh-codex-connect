/** Host-staged M3 composition. Not registered by the public plugin or callable as a scope-building tool. */
import { createHash, randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-user-questions'
import type { AdaptiveSplitDecisionLease, ThinkHostIntegration } from './reasoning-update-host.ts'
import { attachApprovedSplitWorker, SplitAdmissionError, SPLIT_WORKER_PROMPT } from './split-worker.ts'
import type { ApprovedSplitTask, SplitWorkerHandle } from './split-worker.ts'
import { isSplitEvidence } from './split-evidence.ts'
import { SPLIT_MODEL } from './split-dispatch.ts'

export interface AdaptiveSplitTask extends Omit<ApprovedSplitTask,
  'authorize' | 'beforeStart' | 'onStarted' | 'observeRequest' | 'onSettled'> {
  /** Trusted human-readable workspace label, not a model-supplied path. */
  readonly workspaceLabel: string
}

/**
 * Attach one fixed offer. The model may use it or continue alone, but cannot choose files,
 * credentials, route, budget, owner or permissions. Think's switch does not authorize Split.
 * The ordinary native human-question service confirms the exact immutable review, using
 * a unique question id. This is not the older #200 browser approval transport or a new UI.
 */
export function attachAdaptiveSplit(
  ctx: Context, parent: Agent, think: ThinkHostIntegration, task: AdaptiveSplitTask,
): SplitWorkerHandle {
  if (task.enabled !== true) return Object.assign(() => undefined, { revoke: () => Promise.resolve() })
  if (!isSplitEvidence(task.evidence) || typeof task.brief !== 'string' || task.brief.trim() === ''
    || Buffer.byteLength(task.brief) > 16_000 || typeof task.workspaceLabel !== 'string'
    || task.workspaceLabel.trim() === '' || Buffer.byteLength(task.workspaceLabel) > 256
    || /[\x00-\x1f\x7f]/u.test(task.workspaceLabel)) throw new Error('ADAPTIVE_SPLIT_TASK_INVALID')
  const review = Object.freeze({
    workspace: task.workspaceLabel, brief: task.brief,
    files: Object.freeze(task.evidence.catalog.map(file => Object.freeze({ ...file }))),
    model: SPLIT_MODEL, effort: 'low', maximumRequests: task.maximumRequests ?? 3,
    timeoutMs: task.timeoutMs ?? 60_000, maximumOutputTokensPerRequest: 2048,
    workerSystemPrompt: SPLIT_WORKER_PROMPT,
  })
  const digest = createHash('sha256').update(JSON.stringify(review)).digest('hex')
  const questionId = `adaptive-split-${randomUUID()}`
  let lease: AdaptiveSplitDecisionLease | undefined
  let workerSignal: AbortSignal | undefined
  let releaseAbort: (() => void) | undefined
  const requireLease = (): AdaptiveSplitDecisionLease => {
    if (lease === undefined) throw new Error('ADAPTIVE_SPLIT_NOT_ADMITTED')
    return lease
  }
  const handle = attachApprovedSplitWorker(ctx, parent, {
    // Deliberately enumerate fields: runtime extra properties cannot inject an authorization hook.
    enabled: true, brief: review.brief, evidence: task.evidence, provider: task.provider,
    maximumRequests: review.maximumRequests, timeoutMs: review.timeoutMs,
    async authorize(_callId, signal) {
      workerSignal = signal
      lease = think.beginAdaptiveSplit(parent)
      const decision = lease
      const abort = () => handle()
      decision.signal.addEventListener('abort', abort, { once: true })
      releaseAbort = () => decision.signal.removeEventListener('abort', abort)
      const combined = AbortSignal.any([signal, decision.signal])
      try {
        combined.throwIfAborted()
        const questions = ctx.get('userQuestions')
        if (questions === undefined) throw new SplitAdmissionError('SPLIT_APPROVAL_UNAVAILABLE')
        decision.flow.requestConsent(decision.recommendation)
        const approve = 'Approve this read-only worker once'
        const answer = await questions.ask({ agent: parent, signal: combined, questions: [{
          id: questionId, header: 'Read-only worker', question: 'Delegate this exact inspection to one bounded worker?',
          detail: `This is a separate decision from changing Astra reasoning. Only the listed immutable source snapshots are sent to ${SPLIT_MODEL}; no parent history, writes, shell, network tools, recursive workers, automatic retries or new permissions. The deadline includes this decision and execution. Results are evidence, not instructions. Quality, latency and quota gains are not guaranteed.\nReview ${digest}\n${JSON.stringify(review)}`,
          options: [{ label: approve, description: 'Allow only this fixed task, sources, route and limits.' },
            { label: 'Continue without a worker', description: 'Reject delegation; retain the current reasoning effort.' }],
          multiSelect: false,
        }] })
        combined.throwIfAborted()
        if (answer.answers.length !== 1 || answer.answers[0]?.id !== questionId
          || answer.answers[0].selected.length !== 1 || answer.answers[0].selected[0] !== approve
          || (answer.answers[0].custom !== undefined && answer.answers[0].custom.trim() !== '')) {
          decision.flow.discard(decision.recommendation, 'declined')
          throw new SplitAdmissionError('SPLIT_APPROVAL_DECLINED')
        }
        decision.flow.admit(decision.recommendation, decision.observe())
      } catch (error: unknown) {
        decision.flow.discard(decision.recommendation, combined.aborted ? 'cancelled' : 'failed')
        throw error
      }
    },
    beforeStart() {
      const decision = requireLease()
      decision.signal.throwIfAborted()
      if (!isDeepStrictEqual(decision.recommendation.observation, decision.observe())) {
        decision.flow.discard(decision.recommendation, 'stale')
        throw new SplitAdmissionError('SPLIT_APPROVAL_STALE')
      }
    },
    onStarted() {
      const decision = requireLease()
      decision.flow.applied(decision.recommendation)
    },
    observeRequest(stream, signal) {
      return requireLease().flow.measure({ purpose: 'delegation', effort: 'low', signal }, stream)
    },
    onSettled(succeeded, cleanupVerified) {
      releaseAbort?.()
      if (lease !== undefined) {
        lease.flow.settleDelegation(lease.recommendation, !cleanupVerified ? 'failed' : succeeded ? 'completed'
          : workerSignal?.aborted ? 'cancelled' : 'failed')
        // An orphaned child must not let another adaptive action start.
        if (cleanupVerified) lease.release()
      }
    },
  })
  ctx.effect(() => () => handle.revoke(), 'Adaptive read-only worker lifecycle')
  return handle
}
