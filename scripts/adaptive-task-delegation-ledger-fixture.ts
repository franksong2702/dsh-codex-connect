/** Fresh-process, store-only recovery fixture: no adapters, accounts, agents or transport. */
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { Socket } from 'node:net'
import { AdaptiveTaskStore, taskIdentity } from '../src/adaptive-task-store.ts'
import { AdaptiveTaskDelegationLedger } from '../src/adaptive-task-delegation-ledger.ts'
import type { TaskLedgerDocument } from '../src/adaptive-task-delegation-contract.ts'

const [directory, phase] = process.argv.slice(2)
assert.ok(directory && ['write', 'recover'].includes(phase!))
globalThis.fetch = async () => { throw new Error('No network in ledger fixture') }
Socket.prototype.connect = function () { throw new Error('No network in ledger fixture') }
const h = taskIdentity, path = join(directory, 'tasks')
const who = { sessionId: 'ledger-cold-root', sessionKey: h('session'), owner: h('synthetic-owner') }
const oldEpoch = h('process-one'), newEpoch = h('process-two')
const route = { model: 'gpt-5.6-sol', effort: 'medium' }
const attempt = 'reserved-before-process-exit'
const fence = { epoch: oldEpoch, grantRevision: 1, revocationGeneration: 1 }
const input = { callId: 'original-parent-tool-call', argumentDigest: h('original arguments'), route,
  sourceIds: ['approved-source-0001'], evidenceDigest: h('synthetic snapshot') }
const ledger = new AdaptiveTaskDelegationLedger(path, () => 1000)
const old = new AdaptiveTaskStore(path)
if (phase === 'write') {
  await old.update(who.sessionId, () => ({ version: 1, ...who, runtime: oldEpoch, revision: 1, mode: 'auto', route,
    capabilities: [{ model: route.model, efforts: [route.effort] }], maximumRequests: 10, reserved: 2,
    selectionSeq: -1, portable: false, handoffSeq: -1, receipts: [{ id: 'synthetic-start-receipt', digest: h('start') }] }))
  let doc = await ledger.migrate(who, 1)
  doc = await ledger.configure(who, doc.revision, { routes: [route], sourceManifest: h('manifest'),
    sourceIds: input.sourceIds, maxRequests: 6, timeoutMs: 1000 })
  await ledger.resume(who, doc.revision, oldEpoch)
  const { run } = await ledger.prepare(who, fence, input)
  const child = { sessionId: 'synthetic-child', sessionKey: h('child'), route }
  await ledger.publish(who, run.id, fence, child)
  doc = await ledger.reserveChild(who, run.id, fence, child, attempt)
  assert.equal(doc.reserved, 3)
  // End without a result or delivery acknowledgment after the durable debit.
} else {
  const before = await ledger.read(who) as TaskLedgerDocument
  assert.equal(before.reserved, 3)
  const doc = await ledger.recover(who, before.revision, oldEpoch, newEpoch)
  assert.equal(doc.mode, 'interrupted'); assert.equal(doc.reserved, 3)
  const run = doc.delegation.runs[0]!
  assert.equal(run.state, 'interrupted'); assert.equal(run.cleanup, 'pending')
  assert.deepEqual(await ledger.recover(who, before.revision, oldEpoch, newEpoch), doc)
  assert.deepEqual(await ledger.lookupReservation(who, attempt), { runId: run.id, epoch: oldEpoch, debited: true, dispatch: 'unknown', delivery: 'none' })
  await assert.rejects(old.read(who.sessionId), /TASK_STATE_INVALID/)
  await assert.rejects(ledger.reserveChild(who, run.id, fence,
    { sessionId: 'synthetic-child', sessionKey: h('child'), route }, attempt), /TASK_STALE_EPOCH/)
  await ledger.cleanup(who, run.id, newEpoch, true)
  const current = await ledger.read(who)
  await ledger.resume(who, current.revision, newEpoch)
  const duplicate = await ledger.prepare(who, fence, input)
  assert.equal(duplicate.created, false); assert.equal(duplicate.run.id, run.id)
  assert.equal((await ledger.read(who)).reserved, 3)
}
console.log(JSON.stringify({ kind: 'task-delegation-ledger-process', phase, pid: process.pid, node: process.version,
  reserved: (await ledger.read(who)).reserved, syntheticOnly: true, realProviderRequests: 0, passed: true }))
