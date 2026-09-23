import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, expect, it, vi } from 'vitest'
import { AdaptiveTaskStore, AtomicTaskDocumentStore, taskIdentity } from '../src/adaptive-task-store.ts'
import { parseTaskLedger } from '../src/adaptive-task-delegation-contract.ts'
import type { TaskLedgerDocument } from '../src/adaptive-task-delegation-contract.ts'
import { AdaptiveTaskDelegationLedger } from '../src/adaptive-task-delegation-ledger.ts'
import { TaskDelegationArtifacts } from '../src/adaptive-task-artifacts.ts'
import { AdaptiveTaskTransitions } from '../src/adaptive-task-transitions.ts'
import type { LedgerIdentity } from '../src/adaptive-task-delegation-ledger.ts'

const roots: string[] = []
const route = { model: 'gpt-5.6-sol', effort: 'medium' }
async function fixture(mode: 'auto' | 'interrupted' = 'auto') {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'task-transitions-'))); roots.push(root)
  const identity: LedgerIdentity = { sessionId: 'transition-root', sessionKey: taskIdentity('session'), owner: taskIdentity('owner') }
  const store = new AdaptiveTaskStore(join(root, 'tasks'))
  await store.update(identity.sessionId, () => ({ version: 1, ...identity, runtime: taskIdentity('epoch'), revision: 1, mode, route,
    capabilities: [{ model: route.model, efforts: [route.effort] }], maximumRequests: 20, reserved: 2, selectionSeq: -1,
    portable: false, handoffSeq: -1, receipts: [{ id: 'initial-receipt-0001', digest: taskIdentity('start') }] }))
  return { root, identity, store, artifacts: new TaskDelegationArtifacts(join(root, 'artifacts')), transitions: new AdaptiveTaskTransitions(join(root, 'tasks')) }
}
afterEach(async () => { vi.restoreAllMocks(); for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })

it('migrates v1 auto to interrupted v2 without enabling or resetting counters', async () => {
  const f = await fixture(); let guarded = 0
  const result = await f.transitions.migrate(f.identity, 1, { id: 'migrate-operation-0001', digest: taskIdentity('migrate') }, () => { guarded++ }, f.artifacts)
  expect(result).toMatchObject({ version: 2, mode: 'interrupted', reserved: 2, delegation: { grant: null, runs: [] } })
  expect(result.runtime).not.toBe(taskIdentity('epoch')); expect(guarded).toBe(2)
  expect((await new AdaptiveTaskDelegationLedger(join(f.root, 'tasks')).read(f.identity)).mode).toBe('interrupted')
})

it('is idempotent for the same operation and rejects changed operation digest', async () => {
  const f = await fixture(); const operation = { id: 'migrate-operation-0002', digest: taskIdentity('same') }
  const first = await f.transitions.migrate(f.identity, 1, operation, () => {}, f.artifacts)
  const second = await f.transitions.migrate(f.identity, 1, operation, () => {}, f.artifacts)
  expect(second).toEqual(first)
  await expect(f.transitions.migrate(f.identity, first.revision, { ...operation, digest: taskIdentity('changed') }, () => {}, f.artifacts)).rejects.toThrow('TASK_OPERATION_CONFLICT')
})

it('downgrades only manual v2, archives exact provenance, and preserves counters', async () => {
  const f = await fixture(); const migrated = await f.transitions.migrate(f.identity, 1, { id: 'migrate-operation-0003', digest: taskIdentity('migrate') }, () => {}, f.artifacts)
  const ledger = new AdaptiveTaskDelegationLedger(join(f.root, 'tasks')); await ledger.revoke(f.identity, migrated.revision, 'manual', 7)
  const operation = { id: 'downgrade-operation-01', digest: taskIdentity('downgrade') }
  const result = await f.transitions.downgrade(f.identity, (await ledger.read(f.identity)).revision, (await ledger.read(f.identity)).runtime, operation, () => {}, f.artifacts)
  expect(result).toMatchObject({ version: 1, mode: 'manual', portable: true, reserved: 2 })
  expect(result.runtime).toMatch(/^[a-f0-9]{64}$/u); expect(result.receipts.some(receipt => receipt.id === operation.id)).toBe(true)
  expect((await f.store.read(f.identity.sessionId))!.runtime).toBe(result.runtime)
  expect(await f.transitions.downgrade(f.identity, migrated.revision + 1, migrated.runtime, operation, () => {}, f.artifacts)).toEqual(result)
})

it('blocks missing archive provenance and refuses wrong owner/key/CAS', async () => {
  const f = await fixture('interrupted')
  await expect(f.transitions.migrate({ ...f.identity, owner: taskIdentity('wrong') }, 1, { id: 'migrate-operation-0004', digest: taskIdentity('x') }, () => {}, f.artifacts)).rejects.toThrow('TASK_OWNER_MISMATCH')
  await expect(f.transitions.migrate({ ...f.identity, sessionKey: taskIdentity('wrong') }, 1, { id: 'migrate-operation-0004', digest: taskIdentity('x') }, () => {}, f.artifacts)).rejects.toThrow('TASK_SESSION_MISMATCH')
  await expect(f.transitions.migrate(f.identity, 99, { id: 'migrate-operation-0004', digest: taskIdentity('x') }, () => {}, f.artifacts)).rejects.toThrow('TASK_STALE_REVISION')
  const manual = await f.store.update(f.identity.sessionId, current => ({ ...current!, mode: 'manual', runtime: taskIdentity('missing-archive') }))
  await expect(f.transitions.migrate(f.identity, manual.revision, { id: 'migrate-operation-0004', digest: taskIdentity('x') }, () => {}, f.artifacts)).rejects.toThrow('TASK_ARCHIVE_MISSING')
})

async function completed() {
  const f = await fixture(), operation = { id: 'completed-migrate-0001', digest: taskIdentity('migrate') }
  let doc = await f.transitions.migrate(f.identity, 1, operation, () => {}, f.artifacts) as TaskLedgerDocument
  const ledger = new AdaptiveTaskDelegationLedger(join(f.root, 'tasks'))
  const sourceIds = ['approved-source-0001'], evidenceDigest = await f.artifacts.put({ fixture: 'immutable evidence' })
  doc = await ledger.configure(f.identity, doc.revision, { routes: [route], sourceIds, sourceManifest: taskIdentity('manifest'), maxRequests: 2, timeoutMs: 90000 })
  doc = await ledger.resume(f.identity, doc.revision, doc.runtime)
  const fence = { epoch: doc.runtime, grantRevision: doc.delegation.grantRevision, revocationGeneration: doc.delegation.revocationGeneration }
  const run = (await ledger.prepare(f.identity, fence, { route, sourceIds, evidenceDigest, callId: 'original-parent-call-01', argumentDigest: taskIdentity('arguments') })).run
  const child = { sessionId: 'owned-child', sessionKey: taskIdentity('child'), route }
  await ledger.publish(f.identity, run.id, fence, child)
  await ledger.reserveChild(f.identity, run.id, fence, child, 'original-attempt-001')
  await ledger.settle(f.identity, run.id, fence, 'succeeded', await f.artifacts.put({ summary: 'findings', findings: [] }))
  await ledger.cleanup(f.identity, run.id, doc.runtime, true)
  await ledger.delivery(f.identity, run.id, doc.runtime, 'pending', 'recorded')
  doc = await ledger.revoke(f.identity, (await ledger.read(f.identity)).revision, 'manual', 7)
  doc = await ledger.configure(f.identity, doc.revision, null)
  return { ...f, ledger, doc, run }
}
it('preserves current higher counters and retained child replay records after old v1 receipts are evicted', async () => {
  const f = await completed()
  const down = await f.transitions.downgrade(f.identity, f.doc.revision, f.doc.runtime,
    { id: 'completed-downgrade-01', digest: taskIdentity('down') }, () => {}, f.artifacts)
  await f.store.update(f.identity.sessionId, current => ({ ...current!, reserved: 9, handoffSeq: 40, selectionSeq: 8,
    revision: down.revision + 1, receipts: [{ id: 'old-v1-later-command-01', digest: taskIdentity('later') }] }))
  const restored = await f.transitions.migrate(f.identity, down.revision + 1,
    { id: 'completed-remigrate-01', digest: taskIdentity('up') }, () => {}, f.artifacts) as TaskLedgerDocument
  expect(restored).toMatchObject({ mode: 'interrupted', reserved: 9, handoffSeq: 40, selectionSeq: 8, delegation: { grant: null } })
  expect(restored.delegation.runs[0]).toMatchObject({ id: f.run.id, callId: f.run.callId, attempts: ['original-attempt-001'], delivery: 'recorded' })
})
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

it('requires downgrade guard and keeps document unchanged when artifact validation fails', async () => {
  const f = await fixture(); const migrated = await f.transitions.migrate(f.identity, 1, { id: 'migrate-operation-0005', digest: taskIdentity('migrate') }, () => {}, f.artifacts)
  const ledger = new AdaptiveTaskDelegationLedger(join(f.root, 'tasks')); await ledger.revoke(f.identity, migrated.revision, 'manual')
  const before = await ledger.read(f.identity)
  await expect(f.transitions.downgrade(f.identity, before.revision, before.runtime, { id: 'downgrade-operation-02', digest: taskIdentity('downgrade') }, () => { throw new Error('guard') }, f.artifacts)).rejects.toThrow('guard')
  expect(await ledger.read(f.identity)).toEqual(before)
})

it('round-trips manual v1 through its retained archive and rejects archive tampering', async () => {
  const f = await fixture(); const migrated = await f.transitions.migrate(f.identity, 1, { id: 'migrate-operation-0006', digest: taskIdentity('migrate') }, () => {}, f.artifacts)
  const ledger = new AdaptiveTaskDelegationLedger(join(f.root, 'tasks')); await ledger.revoke(f.identity, migrated.revision, 'manual')
  const before = await ledger.read(f.identity)
  const downgraded = await f.transitions.downgrade(f.identity, before.revision, before.runtime, { id: 'downgrade-operation-03', digest: taskIdentity('downgrade') }, () => {}, f.artifacts)
  const restored = await f.transitions.migrate(f.identity, downgraded.revision, { id: 'migrate-operation-0007', digest: taskIdentity('remigrate') }, () => {}, f.artifacts)
  expect(restored.mode).toBe('interrupted'); expect(restored.reserved).toBe(2)
  expect(restored.receipts.some(receipt => receipt.id === 'downgrade-operation-03')).toBe(true)
  const g = await fixture(); const gMigrated = await g.transitions.migrate(g.identity, 1, { id: 'migrate-operation-0009', digest: taskIdentity('migrate') }, () => {}, g.artifacts)
  const gLedger = new AdaptiveTaskDelegationLedger(join(g.root, 'tasks')); await gLedger.revoke(g.identity, gMigrated.revision, 'manual')
  const gBefore = await gLedger.read(g.identity), gDown = await g.transitions.downgrade(g.identity, gBefore.revision, gBefore.runtime, { id: 'downgrade-operation-04', digest: taskIdentity('downgrade') }, () => {}, g.artifacts)
  await writeFile(join(g.root, 'artifacts', `${gDown.runtime}.json`), '{}')
  await expect(g.transitions.migrate(g.identity, gDown.revision, { id: 'migrate-operation-0010', digest: taskIdentity('tampered') }, () => {}, g.artifacts)).rejects.toThrow('TASK_ARTIFACT_CORRUPT')
})
