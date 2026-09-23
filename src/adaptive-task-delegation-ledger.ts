/** Store-only Phase 2 primitives. Not registered in the runtime; never spawn or dispatch. */
import { randomUUID } from 'node:crypto'
import { allowsTaskRoute, taskRoute } from './adaptive-task-contract.ts'
import type { TaskRoute } from './adaptive-task-contract.ts'
import { AtomicTaskDocumentStore, taskFailure } from './adaptive-task-store.ts'
import type { TaskDocument } from './adaptive-task-store.ts'
import { childTerminal, childUnresolved, ledgerHash, ledgerId, ledgerInteger, MAX_TASK_CHILD_RUNS,
  parseDelegationGrant, parseTaskLedger } from './adaptive-task-delegation-contract.ts'
import type { ChildOutcome, DelegationGrant, TaskChildRun, TaskLedgerDocument } from './adaptive-task-delegation-contract.ts'

export interface LedgerIdentity { sessionId: string; sessionKey: string; owner: string }
export interface TaskControlReceipt { id: string; digest: string }
export interface ChildFence { epoch: string; grantRevision: number; revocationGeneration: number }
export interface PrepareChild {
  callId: string
  argumentDigest: string
  route: TaskRoute
  sourceIds: string[]
  evidenceDigest: string
}
type Stored = TaskDocument | TaskLedgerDocument
const sameRoute = (a: TaskRoute, b: TaskRoute): boolean => a.model === b.model && a.effort === b.effort
function identify(current: Stored | undefined, who: LedgerIdentity): Stored {
  if (current === undefined) taskFailure('TASK_STATE_MISSING')
  if (current.owner !== who.owner) taskFailure('TASK_OWNER_MISMATCH')
  if (current.sessionId !== who.sessionId || current.sessionKey !== who.sessionKey) taskFailure('TASK_SESSION_MISMATCH')
  return current
}
function v2(current: Stored): TaskLedgerDocument {
  if (current.version !== 2) taskFailure('TASK_LEDGER_MIGRATION_REQUIRED')
  return current
}
function revision(current: Stored, expected: number): void {
  if (!ledgerInteger(expected, 1) || current.revision !== expected) taskFailure('TASK_STALE_REVISION')
}
function epoch(current: TaskLedgerDocument, expected: string): void {
  if (!ledgerHash(expected) || current.runtime !== expected) taskFailure('TASK_STALE_EPOCH')
}
function active(current: TaskLedgerDocument, fence: ChildFence): DelegationGrant {
  epoch(current, fence.epoch)
  const d = current.delegation
  if (current.mode !== 'auto' || d.grant === null || d.grantRevision !== fence.grantRevision
    || d.revocationGeneration !== fence.revocationGeneration) taskFailure('TASK_DELEGATION_REVOKED')
  return d.grant
}
function find(current: TaskLedgerDocument, id: string): TaskChildRun {
  const run = current.delegation.runs.find(item => item.id === id)
  if (run === undefined) taskFailure('TASK_CHILD_UNKNOWN')
  return run
}
function fenceRun(current: TaskLedgerDocument, run: TaskChildRun, fence: ChildFence, now: number): void {
  active(current, fence)
  if (run.epoch !== fence.epoch || run.grantRevision !== fence.grantRevision
    || run.revocationGeneration !== fence.revocationGeneration) taskFailure('TASK_CHILD_BINDING_MISMATCH')
  if (!ledgerInteger(now, 1) || now >= run.deadlineAt) taskFailure('TASK_CHILD_DEADLINE')
}
/** Reserve enough document space for all future cleanup/result/attempt fields before publication. */
function capacity(document: TaskLedgerDocument): void {
  const worst = structuredClone(document)
  worst.revision = Number.MAX_SAFE_INTEGER
  worst.delegation.grantRevision = Number.MAX_SAFE_INTEGER
  worst.delegation.revocationGeneration = Number.MAX_SAFE_INTEGER
  worst.reserved = worst.maximumRequests
  for (const run of worst.delegation.runs) {
    if (!childTerminal(run) || run.cleanup !== 'verified') {
      run.childSessionId = 'x'.repeat(160); run.childSessionKey = 'a'.repeat(64)
      run.attempts = Array.from({ length: run.maxRequests }, () => 'x'.repeat(80))
      run.resultDigest = 'a'.repeat(64); run.state = 'interrupted'; run.outcome = 'interrupted'
      run.cleanup = 'verified'; run.delivery = 'recorded'
    }
  }
  if (Buffer.byteLength(JSON.stringify(worst) + '\n') > 64 * 1024) taskFailure('TASK_LEDGER_CAPACITY')
}

export class AdaptiveTaskDelegationLedger {
  private readonly store: AtomicTaskDocumentStore<Stored>
  constructor(directory: string, private readonly now: () => number = Date.now) {
    this.store = new AtomicTaskDocumentStore(directory, parseTaskLedger)
  }
  async read(identity: LedgerIdentity): Promise<Stored> {
    const who = structuredClone(identity)
    return structuredClone(identify(await this.store.read(who.sessionId), who))
  }
  private async update(identity: LedgerIdentity, change: (doc: TaskLedgerDocument) => void): Promise<TaskLedgerDocument> {
    const who = structuredClone(identity)
    const result = await this.store.update(who.sessionId, current => {
      const doc = v2(identify(current, who)); change(doc); capacity(doc); return doc
    })
    return v2(result)
  }
  async migrate(identity: LedgerIdentity, expectedRevision: number): Promise<TaskLedgerDocument> {
    const who = structuredClone(identity)
    const result = await this.store.update(who.sessionId, current => {
      const doc = identify(current, who); revision(doc, expectedRevision)
      if (doc.version === 2) return doc
      return { ...doc, version: 2, revision: doc.revision + 1, mode: doc.mode === 'auto' ? 'interrupted' : doc.mode,
        delegation: { grant: null, grantRevision: 0, revocationGeneration: 0, runs: [] } }
    })
    return v2(result)
  }
  private control(doc: TaskLedgerDocument, expectedRevision: number, operation?: TaskControlReceipt, reducing = false): boolean {
    if (operation !== undefined) {
      if (!ledgerId(operation.id) || !ledgerHash(operation.digest)) taskFailure('TASK_COMMAND_INVALID')
      const previous = doc.receipts.find(item => item.id === operation.id)
      if (previous !== undefined) {
        if (previous.digest !== operation.digest) taskFailure('TASK_OPERATION_CONFLICT')
        return true
      }
    }
    revision(doc, expectedRevision)
    if (operation !== undefined) {
      if (doc.receipts.length >= 64) {
        // Never let replay-record capacity prevent safe withdrawal. No eviction;
        // an unrecorded response loss requires a fresh read, not command replay.
        if (!reducing) taskFailure('TASK_LEDGER_CAPACITY')
      } else doc.receipts.push(structuredClone(operation))
    }
    return false
  }
  async configure(identity: LedgerIdentity, expectedRevision: number, requested: DelegationGrant | null, operation?: TaskControlReceipt): Promise<TaskLedgerDocument> {
    const grant = structuredClone(requested)
    return this.update(identity, doc => {
      if (this.control(doc, expectedRevision, operation, grant === null)) return
      if (doc.delegation.runs.some(childUnresolved)) taskFailure('TASK_CHILD_UNRESOLVED')
      doc.delegation.grant = grant === null ? null : parseDelegationGrant(grant, doc.capabilities)
      doc.delegation.grantRevision++; doc.delegation.revocationGeneration++; doc.revision++
    })
  }
  /** Caller must additionally verify host-idle ownership before invoking this primitive. */
  async resume(identity: LedgerIdentity, expectedRevision: number, expectedEpoch: string, operation?: TaskControlReceipt): Promise<TaskLedgerDocument> {
    return this.update(identity, doc => {
      if (this.control(doc, expectedRevision, operation)) return
      epoch(doc, expectedEpoch)
      if (doc.mode !== 'interrupted' || doc.reserved >= doc.maximumRequests
        || doc.delegation.runs.some(childUnresolved)) taskFailure('TASK_RESUME_UNAVAILABLE')
      doc.mode = 'auto'; doc.revision++
    })
  }
  /** Host verifies portable history and current model catalog before selecting a new main route. */
  async selectRoot(identity: LedgerIdentity, expectedRevision: number, expectedEpoch: string, requested: TaskRoute,
    selectionSeq: number, handoffSeq: number): Promise<TaskLedgerDocument> {
    const route = structuredClone(requested)
    return this.update(identity, doc => {
      revision(doc, expectedRevision); epoch(doc, expectedEpoch)
      if (doc.mode !== 'auto' || !taskRoute(route) || !allowsTaskRoute(doc.capabilities, route)) taskFailure('TASK_MODEL_NOT_ALLOWED')
      if (doc.reserved >= doc.maximumRequests) taskFailure('TASK_REQUEST_LIMIT')
      if (doc.delegation.runs.some(childUnresolved)) taskFailure('TASK_CHILD_UNRESOLVED')
      if (!ledgerInteger(selectionSeq, -1) || selectionSeq !== doc.selectionSeq || !ledgerInteger(handoffSeq, -1)) taskFailure('TASK_MANUAL_SELECTION_CHANGED')
      if (!sameRoute(doc.route, route)) {
        doc.route = route; doc.portable = true; doc.handoffSeq = handoffSeq; doc.revision++
      }
    })
  }
  async prepare(identity: LedgerIdentity, captured: ChildFence, request: PrepareChild): Promise<{ created: boolean; run: TaskChildRun }> {
    const fence = structuredClone(captured), input = structuredClone(request)
    let runId = '', created = false
    const result = await this.update(identity, doc => {
      if (Object.keys(input).sort().join(',') !== 'argumentDigest,callId,evidenceDigest,route,sourceIds'
        || !ledgerId(input.callId) || !ledgerHash(input.argumentDigest) || !ledgerHash(input.evidenceDigest)
        || !taskRoute(input.route) || !Array.isArray(input.sourceIds) || input.sourceIds.length === 0
        || input.sourceIds.length > 32 || input.sourceIds.some(id => !ledgerId(id))
        || new Set(input.sourceIds).size !== input.sourceIds.length) taskFailure('TASK_CHILD_ARGUMENTS_INVALID')
      const existing = doc.delegation.runs.find(run => run.callId === input.callId)
      if (existing !== undefined) {
        if (existing.argumentDigest !== input.argumentDigest || !sameRoute(existing.route, input.route)
          || existing.evidenceDigest !== input.evidenceDigest
          || [...existing.sourceIds].sort().join(',') !== [...input.sourceIds].sort().join(',')) taskFailure('TASK_OPERATION_CONFLICT')
        runId = existing.id; return // Status only; caller must branch on created, never re-publish this run.
      }
      const grant = active(doc, fence)
      if (doc.delegation.runs.some(childUnresolved)) taskFailure('TASK_CHILD_UNRESOLVED')
      if (doc.delegation.runs.length >= MAX_TASK_CHILD_RUNS) taskFailure('TASK_LEDGER_CAPACITY')
      if (!grant.routes.some(route => sameRoute(route, input.route))
        || input.sourceIds.some(id => !grant.sourceIds.includes(id))) taskFailure('TASK_CHILD_SCOPE_DENIED')
      if (doc.maximumRequests - doc.reserved < 2) taskFailure('TASK_PARENT_RESERVE_REQUIRED')
      const now = this.now()
      if (!ledgerInteger(now, 1) || !ledgerInteger(now + grant.timeoutMs, 1)) taskFailure('TASK_CHILD_DEADLINE')
      runId = randomUUID(); created = true
      doc.delegation.runs.push({ id: runId, ...input, epoch: fence.epoch, grantRevision: fence.grantRevision,
        revocationGeneration: fence.revocationGeneration, childSessionId: null, childSessionKey: null,
        maxRequests: grant.maxRequests, attempts: [], deadlineAt: now + grant.timeoutMs,
        state: 'prepared', outcome: null, cleanup: 'pending', resultDigest: null, delivery: 'none' })
      doc.revision++
    })
    return { created, run: structuredClone(find(result, runId)) }
  }
  async publish(identity: LedgerIdentity, runId: string, captured: ChildFence, child: { sessionId: string; sessionKey: string }): Promise<TaskLedgerDocument> {
    const fence = structuredClone(captured), binding = structuredClone(child)
    return this.update(identity, doc => {
      const run = find(doc, runId); fenceRun(doc, run, fence, this.now())
      if (run.state !== 'prepared') taskFailure('TASK_CHILD_TRANSITION_INVALID')
      run.childSessionId = binding.sessionId; run.childSessionKey = binding.sessionKey
      run.state = 'running'; doc.revision++
    })
  }
  async reserveChild(identity: LedgerIdentity, runId: string, captured: ChildFence,
    binding: { sessionId: string; sessionKey: string; route: TaskRoute }, attemptId: string): Promise<TaskLedgerDocument> {
    const fence = structuredClone(captured), child = structuredClone(binding)
    return this.update(identity, doc => {
      const run = find(doc, runId); fenceRun(doc, run, fence, this.now())
      if (run.state !== 'running' || run.childSessionId !== child.sessionId || run.childSessionKey !== child.sessionKey
        || !sameRoute(run.route, child.route)) taskFailure('TASK_CHILD_BINDING_MISMATCH')
      if (!ledgerId(attemptId)) taskFailure('TASK_ATTEMPT_INVALID')
      if (doc.delegation.runs.some(item => item.attempts.includes(attemptId))) taskFailure('TASK_ATTEMPT_ALREADY_RESERVED')
      if (run.attempts.length >= run.maxRequests) taskFailure('TASK_CHILD_REQUEST_LIMIT')
      if (doc.maximumRequests - doc.reserved < 2) taskFailure('TASK_PARENT_RESERVE_REQUIRED')
      run.attempts.push(attemptId); doc.reserved++; doc.revision++
    })
  }
  /** Read-only reconciliation; a found debit does not say transport occurred or authorize replay. */
  async lookupReservation(identity: LedgerIdentity, attemptId: string): Promise<{ runId: string; epoch: string; debited: true; dispatch: 'unknown'; delivery: TaskChildRun['delivery'] } | undefined> {
    const doc = v2(await this.read(identity))
    const run = doc.delegation.runs.find(item => item.attempts.includes(attemptId))
    return run && { runId: run.id, epoch: run.epoch, debited: true, dispatch: 'unknown', delivery: run.delivery }
  }
  /** Later integration must call this once per managed root attempt, through the existing governor. */
  async reserveRoot(identity: LedgerIdentity, expectedEpoch: string, route: TaskRoute, kind: 'main' | 'auxiliary', expectedSelectionSeq?: number): Promise<TaskLedgerDocument> {
    const selected = structuredClone(route)
    return this.update(identity, doc => {
      epoch(doc, expectedEpoch)
      if (doc.mode !== 'auto' || !allowsTaskRoute(doc.capabilities, selected)) taskFailure('TASK_REQUIRES_USER_RESUME')
      if ((kind === 'main' && !sameRoute(doc.route, selected))
        || (expectedSelectionSeq !== undefined && doc.selectionSeq !== expectedSelectionSeq)) taskFailure('TASK_REQUEST_STALE')
      if (kind !== 'main' && kind !== 'auxiliary') taskFailure('TASK_CHILD_ARGUMENTS_INVALID')
      if (kind === 'main' && doc.delegation.runs.some(childUnresolved)) taskFailure('TASK_CHILD_UNRESOLVED')
      if (doc.reserved >= doc.maximumRequests) taskFailure('TASK_REQUEST_LIMIT')
      doc.reserved++; doc.revision++
    })
  }
  async settle(identity: LedgerIdentity, runId: string, captured: ChildFence, outcome: Exclude<ChildOutcome, 'interrupted'>, resultDigest: string | null): Promise<TaskLedgerDocument> {
    const fence = structuredClone(captured)
    return this.update(identity, doc => {
      const run = find(doc, runId); epoch(doc, fence.epoch)
      if (run.epoch !== fence.epoch || run.grantRevision !== fence.grantRevision
        || run.revocationGeneration !== fence.revocationGeneration || !['prepared', 'running'].includes(run.state)) taskFailure('TASK_CHILD_TRANSITION_INVALID')
      if (!['succeeded', 'failed', 'cancelled'].includes(outcome)
        || (outcome === 'succeeded' ? !ledgerHash(resultDigest) || run.state !== 'running' : resultDigest !== null)) taskFailure('TASK_CHILD_RESULT_INVALID')
      if (outcome === 'succeeded') fenceRun(doc, run, fence, this.now())
      run.state = 'settling'; run.outcome = outcome; run.resultDigest = resultDigest; doc.revision++
    })
  }
  /** Trusted integration acknowledgment only: this store cannot prove handles have been disposed. */
  async cleanup(identity: LedgerIdentity, runId: string, expectedEpoch: string, verified: boolean): Promise<TaskLedgerDocument> {
    return this.update(identity, doc => {
      epoch(doc, expectedEpoch)
      const run = find(doc, runId)
      if (!['settling', 'interrupted'].includes(run.state) || run.cleanup === 'verified' || typeof verified !== 'boolean') taskFailure('TASK_CHILD_TRANSITION_INVALID')
      run.cleanup = verified ? 'verified' : 'failed'
      if (verified && run.state === 'settling') { run.state = run.outcome!; run.delivery = 'pending' }
      doc.revision++
    })
  }
  /** Call only after matching the host's original tool-call/result; never infer delivery from success. */
  async delivery(identity: LedgerIdentity, runId: string, expectedEpoch: string, expected: 'pending' | 'unknown', next: 'recorded' | 'unknown'): Promise<TaskLedgerDocument> {
    return this.update(identity, doc => {
      epoch(doc, expectedEpoch)
      const run = find(doc, runId)
      if (!['pending', 'unknown'].includes(expected) || !['recorded', 'unknown'].includes(next)
        || !childTerminal(run) || run.cleanup !== 'verified' || run.delivery !== expected
        || (expected === 'unknown' && next !== 'recorded')) taskFailure('TASK_CHILD_TRANSITION_INVALID')
      run.delivery = next; doc.revision++
    })
  }
  async revoke(identity: LedgerIdentity, expectedRevision: number, mode: 'manual' | 'stopped', handoffSeq?: number, operation?: TaskControlReceipt): Promise<TaskLedgerDocument> {
    return this.update(identity, doc => {
      if (this.control(doc, expectedRevision, operation, true)) return
      if (mode !== 'manual' && mode !== 'stopped') taskFailure('TASK_CHILD_ARGUMENTS_INVALID')
      if (handoffSeq !== undefined && !ledgerInteger(handoffSeq, -1)) taskFailure('TASK_CHILD_ARGUMENTS_INVALID')
      doc.mode = mode; doc.delegation.revocationGeneration++; doc.revision++
      if (mode === 'manual') { doc.portable = true; if (handoffSeq !== undefined) doc.handoffSeq = handoffSeq }
      for (const run of doc.delegation.runs) if (!childTerminal(run)) {
        run.state = 'settling'; run.outcome = 'cancelled'; run.resultDigest = null
      }
    })
  }
  /** CAS recovery fences an old process; same-target repeats are idempotent. Never grants execution. */
  async recover(identity: LedgerIdentity, expectedRevision: number, oldEpoch: string, newEpoch: string): Promise<TaskLedgerDocument> {
    if (!ledgerHash(newEpoch) || !ledgerHash(oldEpoch) || oldEpoch === newEpoch) taskFailure('TASK_STALE_EPOCH')
    return this.update(identity, doc => {
      if (doc.runtime === newEpoch) return
      revision(doc, expectedRevision); epoch(doc, oldEpoch)
      doc.runtime = newEpoch; doc.revision++; doc.delegation.revocationGeneration++
      if (doc.mode === 'auto') doc.mode = 'interrupted'
      for (const run of doc.delegation.runs) {
        if (!childTerminal(run)) {
          run.state = 'interrupted'; run.outcome = 'interrupted'; run.resultDigest = null
        }
        if (run.delivery === 'pending') run.delivery = 'unknown'
      }
    })
  }
}
