/** Internal user-consent bridge. No HTTP route, model tool for decisions, or production registration. */
import { createHash, randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { ApprovalOutcome, ApprovalRequest } from '@deepseek-ai/dsh-user-approval'
import { attachApprovedSplitWorker, SPLIT_INSPECT_TOOL, SPLIT_WORKER_PROMPT } from './split-worker.ts'
import type { ApprovedSplitTask, SplitWorkerHandle } from './split-worker.ts'
import type { SplitApprovalChoice, SplitApprovalPhase, SplitApprovalReview, SplitApprovalView } from './split-approval-view.ts'
import { isSplitEvidence } from './split-evidence.ts'

export interface SplitApprovalTask extends Omit<ApprovedSplitTask, 'authorize' | 'onSettled'> {
  /** Trusted display name for the selected workspace, not a model-supplied filesystem root. */
  readonly workspaceLabel: string
}
export interface SplitApprovalHandle {
  getSnapshot(): SplitApprovalView
  subscribe(listener: () => void): () => void
  /** Called only by a trusted user-interaction controller for this exact parent. */
  decide(id: string, reviewDigest: string, choice: SplitApprovalChoice): boolean
  /** Synchronously withdraws permission; fulfillment acknowledges actual cleanup. */
  revoke(): Promise<void>
}

/**
 * Stage one immutable offer. DSH owns the turn-enclosed approval audit; this bridge owns the
 * exact user decision. An unrelated answerer's allowed-once is insufficient without our receipt.
 * Existing host-approved low-level fixtures remain separate; this entry never skips user consent.
 */
export function attachSplitApprovalRequest(ctx: Context, parent: Agent, task: SplitApprovalTask): SplitApprovalHandle {
  if (!isSplitEvidence(task.evidence) || typeof task.brief !== 'string' || task.brief.trim().length === 0
    || Buffer.byteLength(task.brief) > 16_000) throw new Error('SPLIT_APPROVAL_INVALID')
  if (typeof task.workspaceLabel !== 'string' || task.workspaceLabel.trim().length === 0
    || Buffer.byteLength(task.workspaceLabel) > 256 || /[\x00-\x1f\x7f]/u.test(task.workspaceLabel)) throw new Error('SPLIT_WORKSPACE_LABEL_INVALID')
  const id = randomUUID()
  const review: SplitApprovalReview = Object.freeze({
    workspaceLabel: task.workspaceLabel, brief: task.brief,
    files: Object.freeze(task.evidence.catalog.map(file => Object.freeze({ ...file }))),
    model: 'gpt-5.6-luna', effort: 'low', maximumRequests: task.maximumRequests ?? 6,
    timeoutMs: task.timeoutMs ?? 90_000, contextPolicy: 'isolated-system-and-approved-snapshots',
    workerSystemPrompt: SPLIT_WORKER_PROMPT,
  })
  const reviewDigest = createHash('sha256').update(JSON.stringify(review)).digest('hex')
  let view: SplitApprovalView = Object.freeze({ id, reviewDigest, review, phase: task.enabled === true ? 'ready' : 'disabled' })
  const listeners = new Set<() => void>()
  const update = (phase: SplitApprovalPhase): void => {
    view = Object.freeze({ ...view, phase })
    for (const listener of [...listeners]) { try { listener() } catch { /* Presentation is not authority. */ } }
  }
  let ownedRequest: ApprovalRequest | undefined
  let pending: { signal: AbortSignal; settle(outcome: ApprovalOutcome): void } | undefined
  let receipt: SplitApprovalChoice | undefined
  let worker: SplitWorkerHandle
  let revocation: Promise<void> | undefined
  let releaseAnswerer: () => void = () => undefined
  let releaseParent: () => void = () => undefined
  const finishObservation = (succeeded: boolean): void => {
    releaseAnswerer(); releaseParent()
    if (view.phase === 'running' || view.phase === 'ready' || view.phase === 'deciding') update(succeeded ? 'completed' : 'failed')
  }
  if (task.enabled === true) {
    releaseAnswerer = parent.ctx.on('approval/request', (request, next) => {
      if (request !== ownedRequest) return next()
      const signal = request.signal!
      if (signal.aborted) return Promise.resolve('cancelled')
      return new Promise<ApprovalOutcome>(resolve => {
        const settle = (outcome: ApprovalOutcome): void => {
          signal.removeEventListener('abort', abort)
          pending = undefined
          resolve(outcome)
        }
        const abort = (): void => settle('cancelled')
        pending = { signal, settle }
        signal.addEventListener('abort', abort, { once: true })
        update('awaiting-approval')
      })
    })
  }
  try {
    worker = attachApprovedSplitWorker(ctx, parent, {
      enabled: task.enabled, brief: review.brief, evidence: task.evidence, provider: task.provider,
      maximumRequests: review.maximumRequests, timeoutMs: review.timeoutMs,
      async authorize(callId, signal) {
        const approval = parent.ctx.get('approval')
        if (approval === undefined) { update('unavailable'); throw new Error('SPLIT_APPROVAL_UNAVAILABLE') }
        // Review data is for this approval UI/session audit only; it is never generic telemetry.
        const request: ApprovalRequest = Object.freeze({ agent: parent, toolName: SPLIT_INSPECT_TOOL,
          callId, reason: `Approve one read-only inspection. Source snapshots will be sent to ordinary Luna; no writes, shell, network tools, retries or model fallback. The deadline includes approval and execution.\n${JSON.stringify({ id, reviewDigest, review })}`, signal })
        ownedRequest = request
        let outcome: ApprovalOutcome
        try { outcome = await approval.request(request) }
        catch { update('failed'); throw new Error('SPLIT_APPROVAL_FAILED') }
        finally { ownedRequest = undefined; pending?.settle('cancelled') }
        if (signal.aborted) {
          if (view.phase !== 'revoking' && view.phase !== 'revoked') update('cancelled')
          throw new Error('SPLIT_APPROVAL_CANCELLED')
        }
        if (outcome !== 'allowed-once' || receipt !== 'allow-once') {
          update(outcome === 'rejected' ? 'rejected' : outcome === 'cancelled' ? 'cancelled' : 'unavailable')
          throw new Error('SPLIT_APPROVAL_NOT_GRANTED')
        }
        update('running')
      },
      onSettled: finishObservation,
    })
  } catch (error) { releaseAnswerer(); throw error }
  const handle: SplitApprovalHandle = {
    getSnapshot: () => view,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener) } },
    decide(candidateId, candidateDigest, choice) {
      if (candidateId !== id || candidateDigest !== reviewDigest || view.phase !== 'awaiting-approval'
        || pending === undefined || pending.signal.aborted || ctx.agents.get(parent.id) !== parent
        || (choice !== 'allow-once' && choice !== 'reject')) return false
      receipt = choice
      const decision = pending
      // Set phase before resolving or notifying, so double clicks and reentrant observers cannot grant twice.
      view = Object.freeze({ ...view, phase: 'deciding' })
      decision.settle(choice === 'allow-once' ? 'allowed-once' : 'rejected')
      update('deciding')
      return true
    },
    revoke() {
      if (revocation !== undefined) return revocation
      // Withdraw before notifying presentation callbacks. Never show revoked until cleanup has completed.
      const done = Promise.withResolvers<void>()
      revocation = done.promise
      worker()
      update('revoking')
      void worker.revoke().then(() => { releaseAnswerer(); releaseParent(); update('revoked'); done.resolve() }, () => {
        releaseAnswerer(); releaseParent(); update('failed'); done.reject(new Error('SPLIT_REVOCATION_FAILED'))
      })
      return revocation
    },
  }
  if (task.enabled === true) releaseParent = ctx.on('agent/disposed', ({ agent }) => {
    if (agent === parent) void handle.revoke().catch(() => { /* The authoritative view retains failure. */ })
  })
  return handle
}
