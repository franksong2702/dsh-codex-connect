import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, expect, it, vi } from 'vitest'
import { AtomicTaskDocumentStore, taskIdentity } from '../src/adaptive-task-store.ts'
import { parseTaskLedger } from '../src/adaptive-task-delegation-contract.ts'
import type { TaskLedgerDocument } from '../src/adaptive-task-delegation-contract.ts'
import { AdaptiveTaskDelegationLedger } from '../src/adaptive-task-delegation-ledger.ts'
import { TaskDelegationArtifacts } from '../src/adaptive-task-artifacts.ts'
import { AdaptiveTaskTransitions } from '../src/adaptive-task-transitions.ts'
import type { LedgerIdentity } from '../src/adaptive-task-delegation-ledger.ts'

const roots: string[] = []
const route = { model: 'gpt-5.6-sol', effort: 'medium' }
async function fixture(mode: 'auto' | 'interrupted' | 'manual' = 'manual') {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'task-transitions-'))); roots.push(root)
  const identity: LedgerIdentity = { sessionId: 'transition-root', sessionKey: taskIdentity('session'), owner: taskIdentity('owner') }
  const store = new AtomicTaskDocumentStore(join(root, 'tasks'), parseTaskLedger)
  const doc: TaskLedgerDocument = { version: 2, ...identity, runtime: taskIdentity('epoch'), revision: 5, mode, route,
    capabilities: [{ model: route.model, efforts: [route.effort] }], maximumRequests: 20, reserved: 2, selectionSeq: -1,
    portable: mode === 'manual', handoffSeq: -1,
    receipts: [{ id: 'initial-receipt-0001', digest: taskIdentity('start') }],
    delegation: { grant: null, grantRevision: 2, revocationGeneration: 3, runs: [] } }
  await store.update(identity.sessionId, () => doc)
  return { root, identity, store, doc, artifacts: new TaskDelegationArtifacts(join(root, 'artifacts')),
    transitions: new AdaptiveTaskTransitions(join(root, 'tasks')) }
}
afterEach(async () => { vi.restoreAllMocks(); for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })

it('archives manual v2 with exact provenance and preserves counters and receipts', async () => {
  const f = await completed(), operation = { id: 'completed-downgrade-01', digest: taskIdentity('down') }
  const down = await f.transitions.downgrade(f.identity, f.doc.revision, f.doc.runtime, operation, () => {}, f.artifacts)
  expect(down).toMatchObject({ version: 1, mode: 'manual', portable: true, reserved: 3 })
  expect(down.receipts).toEqual([...f.doc.receipts, operation])
  expect(await f.artifacts.get(down.runtime)).toEqual({
    kind: 'task-v2-downgrade', version: 1, document: { ...f.doc, receipts: down.receipts },
  })
  expect(await f.store.read(f.identity.sessionId)).toEqual(down)
  expect(await f.transitions.downgrade(f.identity, f.doc.revision, f.doc.runtime, operation, () => {}, f.artifacts)).toEqual(down)
  await expect(f.transitions.downgrade(f.identity, f.doc.revision, f.doc.runtime,
    { ...operation, digest: taskIdentity('changed') }, () => {}, f.artifacts)).rejects.toThrow('TASK_OPERATION_CONFLICT')
})

it('refuses active grants, wrong owner, wrong live session and stale archive commands', async () => {
  const f = await fixture('interrupted'), operation = { id: 'archive-operation-0001', digest: taskIdentity('down') }
  const run = (identity = f.identity, revision = f.doc.revision, epoch = f.doc.runtime) =>
    f.transitions.downgrade(identity, revision, epoch, operation, () => {}, f.artifacts)
  await expect(run({ ...f.identity, owner: taskIdentity('wrong') })).rejects.toThrow('TASK_OWNER_MISMATCH')
  await expect(run({ ...f.identity, sessionKey: taskIdentity('wrong') })).rejects.toThrow('TASK_SESSION_MISMATCH')
  await expect(run(f.identity, f.doc.revision - 1)).rejects.toThrow('TASK_STALE_REVISION')
  await expect(run(f.identity, f.doc.revision, taskIdentity('stale'))).rejects.toThrow('TASK_STALE_EPOCH')
  await expect(run()).rejects.toThrow('TASK_DOWNGRADE_UNAVAILABLE')
  expect(await f.store.read(f.identity.sessionId)).toEqual(f.doc)
})

async function completed() {
  const f = await fixture()
  const evidenceDigest = await f.artifacts.put({ fixture: 'immutable evidence' })
  const resultDigest = await f.artifacts.put({ summary: 'saved findings', findings: [] })
  const run: TaskLedgerDocument['delegation']['runs'][number] = {
    id: 'saved-child-run-0001', callId: 'original-parent-call-01', argumentDigest: taskIdentity('arguments'),
    grantRevision: 1, revocationGeneration: 2, epoch: f.doc.runtime,
    childSessionId: 'owned-child', childSessionKey: taskIdentity('child'), route,
    sourceIds: ['approved-source-0001'], evidenceDigest, maxRequests: 2,
    attempts: ['original-attempt-001'], deadlineAt: 1, state: 'succeeded', outcome: 'succeeded',
    cleanup: 'verified', resultDigest, delivery: 'recorded',
  }
  const doc = { ...f.doc, reserved: 3, delegation: { ...f.doc.delegation, runs: [run] } }
  await f.store.update(f.identity.sessionId, () => doc)
  return { ...f, ledger: new AdaptiveTaskDelegationLedger(join(f.root, 'tasks')), doc }
}
it('rejects unknown delivery and missing evidence before creating a representable downgrade', async () => {
  const f = await completed(), store = new AtomicTaskDocumentStore(join(f.root, 'tasks'), parseTaskLedger)
  await store.update(f.identity.sessionId, current => {
    const doc = current as TaskLedgerDocument; doc.delegation.runs[0]!.delivery = 'unknown'; return doc
  })
  const operation = { id: 'blocked-downgrade-0001', digest: taskIdentity('down') }
  await expect(f.transitions.downgrade(f.identity, f.doc.revision, f.doc.runtime, operation, () => {}, f.artifacts)).rejects.toThrow('TASK_DOWNGRADE_UNAVAILABLE')
  await store.update(f.identity.sessionId, current => {
    const doc = current as TaskLedgerDocument; doc.delegation.runs[0]!.delivery = 'recorded'; return doc
  })
  vi.spyOn(f.artifacts, 'get').mockRejectedValue(new Error('Missing evidence'))
  await expect(f.transitions.downgrade(f.identity, f.doc.revision, f.doc.runtime, operation, () => {}, f.artifacts)).rejects.toThrow('Missing evidence')
  expect((await f.ledger.read(f.identity)).version).toBe(2)
})
it('keeps v2 authority unchanged if interrupted after archive persistence but before root replacement', async () => {
  const f = await completed(), before = await f.ledger.read(f.identity)
  let guards = 0
  await expect(f.transitions.downgrade(f.identity, f.doc.revision, f.doc.runtime,
    { id: 'interrupted-down-0001', digest: taskIdentity('down') }, () => { if (++guards === 2) throw new Error('Interrupted after archive') }, f.artifacts)).rejects.toThrow('Interrupted after archive')
  expect(await f.ledger.read(f.identity)).toEqual(before)
})

it('requires the live maintenance guard before persisting an archive', async () => {
  const f = await fixture()
  await expect(f.transitions.downgrade(f.identity, f.doc.revision, f.doc.runtime,
    { id: 'downgrade-operation-02', digest: taskIdentity('downgrade') },
    () => { throw new Error('guard') }, f.artifacts)).rejects.toThrow('guard')
  expect(await f.store.read(f.identity.sessionId)).toEqual(f.doc)
})
