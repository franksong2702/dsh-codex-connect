/** Explicit idle transitions. Same root lock; immutable archives retain provenance, not authority. */
import { randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { taskRecord } from './adaptive-task-contract.ts'
import { AtomicTaskDocumentStore, taskFailure, taskIdentity } from './adaptive-task-store.ts'
import type { TaskDocument } from './adaptive-task-store.ts'
import { childTerminal, ledgerHash, ledgerId, parseTaskLedger } from './adaptive-task-delegation-contract.ts'
import type { TaskLedgerDocument } from './adaptive-task-delegation-contract.ts'
import type { LedgerIdentity, TaskControlReceipt } from './adaptive-task-delegation-ledger.ts'
import type { TaskDelegationArtifacts } from './adaptive-task-artifacts.ts'

type Stored = TaskDocument | TaskLedgerDocument
function identify(value: Stored | undefined, identity: LedgerIdentity): Stored {
  if (value === undefined) taskFailure('TASK_STATE_MISSING')
  if (value.owner !== identity.owner) taskFailure('TASK_OWNER_MISMATCH')
  if (value.sessionId !== identity.sessionId || value.sessionKey !== identity.sessionKey) taskFailure('TASK_SESSION_MISMATCH')
  return value
}
function duplicate(value: Stored, operation: TaskControlReceipt): boolean {
  if (!ledgerId(operation.id) || !ledgerHash(operation.digest)) taskFailure('TASK_OPERATION_INVALID')
  const prior = value.receipts.find(receipt => receipt.id === operation.id)
  if (prior !== undefined && prior.digest !== operation.digest) taskFailure('TASK_OPERATION_CONFLICT')
  return prior !== undefined
}
function append(value: Stored, operation: TaskControlReceipt): void {
  if (value.receipts.length >= 64) taskFailure('TASK_RECEIPT_CAPACITY')
  value.receipts.push(structuredClone(operation))
}
function canArchive(doc: TaskLedgerDocument): void {
  if (doc.mode !== 'manual' || doc.delegation.grant !== null || doc.delegation.runs.some(run => !childTerminal(run)
    || run.cleanup !== 'verified' || run.delivery !== 'recorded')) taskFailure('TASK_DOWNGRADE_UNAVAILABLE')
}
async function verifyArtifacts(doc: TaskLedgerDocument, artifacts: TaskDelegationArtifacts): Promise<void> {
  for (const run of doc.delegation.runs) {
    await artifacts.get(run.evidenceDigest)
    if (run.resultDigest !== null) await artifacts.get(run.resultDigest)
  }
}
export class AdaptiveTaskTransitions {
  private readonly store: AtomicTaskDocumentStore<Stored>
  constructor(directory: string) { this.store = new AtomicTaskDocumentStore(directory, parseTaskLedger) }
  async migrate(identity: LedgerIdentity, expectedRevision: number, operation: TaskControlReceipt,
    guard: () => void, artifacts: TaskDelegationArtifacts): Promise<Stored> {
    return this.store.update(identity.sessionId, async current => {
      guard()
      const existing = identify(current, identity)
      if (duplicate(existing, operation)) return existing
      if (existing.revision !== expectedRevision) taskFailure('TASK_STALE_REVISION')
      if (existing.version !== 1) taskFailure('TASK_ALREADY_MIGRATED')
      let delegation: TaskLedgerDocument['delegation'] = { grant: null, grantRevision: 0, revocationGeneration: 0, runs: [] }
      if (existing.mode === 'manual' || existing.mode === 'stopped') {
        // Old v1 commands preserve runtime in manual/stopped mode even if their receipt ring evicts entries.
        let archive: unknown
        try { archive = await artifacts.get(existing.runtime) }
        catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') taskFailure('TASK_ARCHIVE_MISSING'); throw error }
        if (!taskRecord(archive) || Object.keys(archive).sort().join(',') !== 'document,kind,version'
          || archive.kind !== 'task-v2-downgrade' || archive.version !== 1) taskFailure('TASK_ARCHIVE_INVALID')
        const document = parseTaskLedger(archive.document, identity.sessionId)
        if (document.version !== 2 || document.sessionKey !== existing.sessionKey || document.owner !== existing.owner
          || document.maximumRequests !== existing.maximumRequests || document.reserved > existing.reserved
          || !isDeepStrictEqual(document.capabilities, existing.capabilities)) taskFailure('TASK_ARCHIVE_INVALID')
        canArchive(document); await verifyArtifacts(document, artifacts)
        delegation = { ...document.delegation, grant: null, revocationGeneration: document.delegation.revocationGeneration + 1 }
      } else if (!['auto', 'interrupted'].includes(existing.mode)) taskFailure('TASK_MIGRATION_UNAVAILABLE')
      // Current v1 counters/history fields win; the archived snapshot may be older and must not roll them back.
      const next: TaskLedgerDocument = { ...existing, version: 2, revision: existing.revision + 1,
        runtime: taskIdentity(randomUUID()), mode: 'interrupted', delegation }
      append(next, operation); guard(); return next
    })
  }
  async downgrade(identity: LedgerIdentity, expectedRevision: number, expectedEpoch: string, operation: TaskControlReceipt,
    guard: () => void, artifacts: TaskDelegationArtifacts): Promise<Stored> {
    return this.store.update(identity.sessionId, async current => {
      guard()
      const doc = identify(current, identity)
      if (duplicate(doc, operation)) return doc
      if (doc.revision !== expectedRevision) taskFailure('TASK_STALE_REVISION')
      if (doc.version !== 2) taskFailure('TASK_LEDGER_MIGRATION_REQUIRED')
      if (doc.runtime !== expectedEpoch) taskFailure('TASK_STALE_EPOCH')
      canArchive(doc); await verifyArtifacts(doc, artifacts)
      // Capacity may forbid new authority, never an otherwise safe downgrade.
      // Keep all prior receipts; a lost unrecorded response is resolved by reading state.
      if (doc.receipts.length < 64) append(doc, operation)
      const archive = { kind: 'task-v2-downgrade', version: 1, document: structuredClone(doc) }
      const digest = await artifacts.put(archive)
      if (!isDeepStrictEqual(await artifacts.get(digest), archive)) taskFailure('TASK_ARCHIVE_VERIFY_FAILED')
      guard()
      const { delegation: _delegation, ...base } = doc
      return { ...base, version: 1, revision: doc.revision + 1, mode: 'manual', portable: true, runtime: digest }
    })
  }
}
