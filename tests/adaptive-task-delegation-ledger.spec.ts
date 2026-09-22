import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { afterEach, expect, it } from 'vitest'
import { AdaptiveTaskStore, taskIdentity } from '../src/adaptive-task-store.ts'
import type { TaskDocument } from '../src/adaptive-task-store.ts'
import { AdaptiveTaskDelegationLedger } from '../src/adaptive-task-delegation-ledger.ts'
import type { ChildFence, LedgerIdentity } from '../src/adaptive-task-delegation-ledger.ts'
import { parseTaskLedger } from '../src/adaptive-task-delegation-contract.ts'
import type { DelegationGrant, TaskChildRun, TaskLedgerDocument } from '../src/adaptive-task-delegation-contract.ts'

const roots: string[] = []
const hash = (value: string) => taskIdentity(value)
const identity: LedgerIdentity = { sessionId: 'root', sessionKey: hash('session'), owner: hash('owner') }
const route = { model: 'gpt-5.6-sol', effort: 'medium' }
const luna = { model: 'gpt-5.6-luna', effort: 'max' }
const initialEpoch = hash('epoch-one')
const nextEpoch = hash('epoch-two')
const source = 'approved-source-0001'
const grant: DelegationGrant = { routes: [route, luna], sourceManifest: hash('manifest'), sourceIds: [source], maxRequests: 6, timeoutMs: 1000 }
const base = (): TaskDocument => ({ version: 1, ...identity, runtime: initialEpoch, revision: 1, mode: 'auto', route,
  capabilities: [{ model: route.model, efforts: [route.effort] }, { model: luna.model, efforts: [luna.effort] }],
  maximumRequests: 40, reserved: 3, selectionSeq: 4, portable: true, handoffSeq: 2,
  receipts: [{ id: randomUUID(), digest: hash('start') }] })
const captured = (doc: TaskLedgerDocument): ChildFence => ({ epoch: doc.runtime,
  grantRevision: doc.delegation.grantRevision, revocationGeneration: doc.delegation.revocationGeneration })
async function setup(patch: Partial<TaskDocument> = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'task-ledger-')); roots.push(dir)
  const path = join(dir, 'tasks'), old = new AdaptiveTaskStore(path)
  const first = { ...base(), ...patch }; await old.update(identity.sessionId, () => first)
  let clock = 1000
  const ledger = new AdaptiveTaskDelegationLedger(path, () => clock)
  const read = async () => await ledger.read(identity) as TaskLedgerDocument
  const migrate = () => ledger.migrate(identity, first.revision)
  const ready = async () => {
    let doc = await migrate(); doc = await ledger.configure(identity, doc.revision, grant)
    return ledger.resume(identity, doc.revision, doc.runtime)
  }
  const input = () => ({ callId: randomUUID(), argumentDigest: hash(randomUUID()), route: luna, sourceIds: [source], evidenceDigest: hash('snapshot') })
  const prepare = async () => ledger.prepare(identity, captured(await read()), input())
  const running = async () => {
    const result = await prepare(); const fence = captured(await read())
    const child = { sessionId: 'child-' + randomUUID(), sessionKey: hash(randomUUID()), route: result.run.route }
    await ledger.publish(identity, result.run.id, fence, child)
    return { run: result.run, fence, child }
  }
  const finish = async (run: TaskChildRun, supplied?: ChildFence) => {
    const fence = supplied ?? captured(await read())
    await ledger.settle(identity, run.id, fence, 'failed', null)
    await ledger.cleanup(identity, run.id, fence.epoch, true)
    await ledger.delivery(identity, run.id, fence.epoch, 'pending', 'recorded')
  }
  return { dir, path, file: join(path, hash(identity.sessionId) + '.json'), old, ledger, first, read, migrate, ready, input, prepare, running, finish,
    clock(value: number) { clock = value } }
}
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })

it('reads v1 unchanged and migrates only explicitly, preserving root authority/history/counts', async () => {
  const f = await setup(); expect(await f.ledger.read(identity)).toEqual(f.first)
  const doc = await f.migrate()
  expect(doc).toEqual({ ...f.first, version: 2, revision: 2, mode: 'interrupted',
    delegation: { grant: null, grantRevision: 0, revocationGeneration: 0, runs: [] } })
  await expect(f.old.read('root')).rejects.toThrow('TASK_STATE_INVALID')
  await expect(f.old.update('root', base)).rejects.toThrow('TASK_STATE_INVALID')
  await expect(f.ledger.prepare(identity, captured(doc), f.input())).rejects.toThrow('TASK_DELEGATION_REVOKED')
})
it('main route changes preserve budget and fence stale queued attempts, selection and revision', async () => {
  const f = await setup(), doc = await f.ready()
  const selected = await f.ledger.selectRoot(identity, doc.revision, doc.runtime, luna, doc.selectionSeq, 20)
  expect(selected).toMatchObject({ route: luna, portable: true, handoffSeq: 20, reserved: doc.reserved })
  await expect(f.ledger.reserveRoot(identity, doc.runtime, route, 'main', doc.selectionSeq)).rejects.toThrow('TASK_REQUEST_STALE')
  await expect(f.ledger.reserveRoot(identity, doc.runtime, luna, 'main', doc.selectionSeq + 1)).rejects.toThrow('TASK_REQUEST_STALE')
  await expect(f.ledger.selectRoot(identity, doc.revision, doc.runtime, route, doc.selectionSeq, 21)).rejects.toThrow('TASK_STALE_REVISION')
  await expect(f.ledger.selectRoot(identity, selected.revision, nextEpoch, route, doc.selectionSeq, 21)).rejects.toThrow('TASK_STALE_EPOCH')
  await expect(f.ledger.selectRoot(identity, selected.revision, doc.runtime, route, doc.selectionSeq + 1, 21)).rejects.toThrow('TASK_MANUAL_SELECTION_CHANGED')
  expect(await f.read()).toEqual(selected)
  expect((await f.ledger.reserveRoot(identity, doc.runtime, luna, 'main', doc.selectionSeq)).reserved).toBe(doc.reserved + 1)
})
it.each(['manual', 'stopped', 'interrupted', 'limit'] as const)('migration preserves %s state', async mode => {
  const f = await setup({ mode }); expect((await f.migrate()).mode).toBe(mode)
})
it('refuses wrong owner, root key, stale revision and missing state without creating new grants', async () => {
  const f = await setup()
  await expect(f.ledger.migrate({ ...identity, owner: hash('other') }, 1)).rejects.toThrow('TASK_OWNER_MISMATCH')
  await expect(f.ledger.migrate({ ...identity, sessionKey: hash('other') }, 1)).rejects.toThrow('TASK_SESSION_MISMATCH')
  await expect(f.ledger.migrate(identity, 0)).rejects.toThrow('TASK_STALE_REVISION')
  await expect(f.ledger.migrate({ ...identity, sessionId: 'absent' }, 1)).rejects.toThrow('TASK_STATE_MISSING')
  expect(await f.old.read('root')).toEqual(f.first)
})
it.each([
  { timeoutMs: 90001 }, { timeoutMs: 999 }, { maxRequests: 7 }, { maxRequests: 0 }, { sourceManifest: 'forged' },
  { sourceIds: [source, source] }, { routes: [{ model: 'gpt-6-astra', effort: 'max' }] },
  { routes: [route, { effort: route.effort, model: route.model }] }, { approved: true },
])('rejects expanded or malformed consent %j', async change => {
  const f = await setup(); const before = await f.migrate()
  await expect(f.ledger.configure(identity, before.revision, { ...grant, ...change })).rejects.toThrow('TASK_DELEGATION_GRANT_INVALID')
  expect(await f.read()).toEqual(before)
})
it('requires consent and exact fencing, supports different authorized routes, and isolates roots', async () => {
  const f = await setup(); await f.ready(); const fence = captured(await f.read())
  for (const choice of [route, luna]) {
    const p = await f.ledger.prepare(identity, fence, { ...f.input(), route: choice })
    expect(p.run.route).toEqual(choice); await f.finish(p.run)
  }
  await expect(f.ledger.prepare(identity, { ...fence, grantRevision: 0 }, f.input())).rejects.toThrow('TASK_DELEGATION_REVOKED')
  await expect(f.ledger.prepare({ ...identity, sessionId: 'other' }, fence, f.input())).rejects.toThrow('TASK_STATE_MISSING')
  await expect(f.ledger.prepare(identity, fence, { ...f.input(), sourceIds: ['not-authorized-source'] })).rejects.toThrow('TASK_CHILD_SCOPE_DENIED')
})
it('snapshots queued arguments and rejects duplicate call conflicts without spawning twice', async () => {
  const f = await setup(); await f.ready(); const fence = captured(await f.read()); const args = f.input()
  const original = structuredClone(args); const first = f.ledger.prepare(identity, fence, args)
  args.sourceIds.push('extra-unauthorized'); args.route = route
  const admitted = await first
  const duplicate = await f.ledger.prepare(identity, fence, original)
  expect(admitted.created).toBe(true); expect(duplicate).toEqual({ ...admitted, created: false })
  await expect(f.ledger.prepare(identity, fence, { ...original, argumentDigest: hash('changed') })).rejects.toThrow('TASK_OPERATION_CONFLICT')
  expect((await f.read()).reserved).toBe(3)
  await f.finish(admitted.run)
  expect((await f.ledger.prepare(identity, fence, original)).created).toBe(false)
  expect((await f.read()).delegation.runs).toHaveLength(1)
})
it('rejects empty evidence units and changed duplicate route, sources or snapshot even with the same digest', async () => {
  const f = await setup(); await f.ready(); const fence = captured(await f.read()), args = f.input()
  await expect(f.ledger.prepare(identity, fence, { ...args, sourceIds: [] })).rejects.toThrow('TASK_CHILD_ARGUMENTS_INVALID')
  await f.ledger.prepare(identity, fence, args)
  for (const changed of [{ route }, { sourceIds: ['another-source-0001'] }, { evidenceDigest: hash('changed snapshot') }]) {
    await expect(f.ledger.prepare(identity, fence, { ...args, ...changed })).rejects.toThrow('TASK_OPERATION_CONFLICT')
  }
  expect((await f.read()).delegation.runs).toHaveLength(1)
})
it('serializes two independent admissions to one active child', async () => {
  const f = await setup(); await f.ready(); const fence = captured(await f.read())
  const other = new AdaptiveTaskDelegationLedger(f.path, () => 1000)
  const results = await Promise.allSettled([f.ledger.prepare(identity, fence, f.input()), other.prepare(identity, fence, f.input())])
  expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
  expect((await f.read()).delegation.runs).toHaveLength(1)
})
it('binds exact child identity/route and rejects replayed attempts without a second permit', async () => {
  const f = await setup(); await f.ready(); const { run, fence, child } = await f.running()
  const attempt = randomUUID()
  await f.ledger.reserveChild(identity, run.id, fence, child, attempt)
  await expect(f.ledger.reserveChild(identity, run.id, fence, child, attempt)).rejects.toThrow('TASK_ATTEMPT_ALREADY_RESERVED')
  await expect(f.ledger.reserveChild(identity, run.id, fence, { ...child, sessionKey: hash('forged') }, randomUUID())).rejects.toThrow('TASK_CHILD_BINDING_MISMATCH')
  await expect(f.ledger.reserveChild(identity, run.id, fence, { ...child, route }, randomUUID())).rejects.toThrow('TASK_CHILD_BINDING_MISMATCH')
  expect((await f.read()).reserved).toBe(4)
  expect(await f.ledger.lookupReservation(identity, attempt)).toMatchObject({ runId: run.id, debited: true, dispatch: 'unknown', epoch: fence.epoch })
  expect(await f.ledger.lookupReservation(identity, randomUUID())).toBeUndefined()
})
it('shares the root lock for child/auxiliary debits and enforces child cap and parent floor', async () => {
  const f = await setup({ maximumRequests: 10, reserved: 0 }); await f.ready(); const { run, fence, child } = await f.running()
  const contenders = Array.from({ length: 12 }, () => new AdaptiveTaskDelegationLedger(f.path, () => 1000).reserveChild(identity, run.id, fence, child, randomUUID()))
  const results = await Promise.allSettled([...contenders, ...Array.from({ length: 2 }, () => f.ledger.reserveRoot(identity, fence.epoch, route, 'auxiliary'))])
  // The host lock has a bounded 2s wait: contention may safely reject a permit.
  // Account for actual successful admission, never assume scheduler/IO throughput.
  for (const result of results) if (result.status === 'rejected') expect(String(result.reason))
    .toMatch(/TASK_CHILD_REQUEST_LIMIT|atomic-write: timed out waiting for the writer lock at/u)
  const successful = results.filter(r => r.status === 'fulfilled').length
  const children = results.slice(0, 12).filter(r => r.status === 'fulfilled').length
  const auxiliaries = results.slice(12).filter(r => r.status === 'fulfilled').length
  const doc = await f.read(); expect(successful).toBeGreaterThan(0)
  expect(doc.reserved).toBe(successful); expect(doc.delegation.runs[0]!.attempts).toHaveLength(children)
  expect(children).toBeLessThanOrEqual(6); expect(auxiliaries).toBeLessThanOrEqual(2)
  // New independent attempts without contention prove the cap separately.
  for (let n = children; n < 6; n++) await f.ledger.reserveChild(identity, run.id, fence, child, randomUUID())
  for (let n = auxiliaries; n < 2; n++) await f.ledger.reserveRoot(identity, fence.epoch, route, 'auxiliary')
  expect((await f.read()).reserved).toBe(8)
  await expect(f.ledger.reserveChild(identity, run.id, fence, child, randomUUID())).rejects.toThrow('TASK_CHILD_REQUEST_LIMIT')
  await expect(f.ledger.reserveRoot(identity, fence.epoch, route, 'main')).rejects.toThrow('TASK_CHILD_UNRESOLVED')
  const g = await setup({ maximumRequests: 3, reserved: 0 }); await g.ready(); const child2 = await g.running()
  await g.ledger.reserveChild(identity, child2.run.id, child2.fence, child2.child, randomUUID())
  await g.ledger.reserveChild(identity, child2.run.id, child2.fence, child2.child, randomUUID())
  await expect(g.ledger.reserveChild(identity, child2.run.id, child2.fence, child2.child, randomUUID())).rejects.toThrow('TASK_PARENT_RESERVE_REQUIRED')
  await g.finish(child2.run); await g.ledger.reserveRoot(identity, child2.fence.epoch, route, 'main')
  await expect(g.ledger.reserveRoot(identity, child2.fence.epoch, route, 'main')).rejects.toThrow('TASK_REQUEST_LIMIT')
})
it.each(['manual', 'stopped'] as const)('revocation to %s fences publication/reservation/late success', async mode => {
  const f = await setup(); await f.ready(); const { run, fence, child } = await f.running()
  await f.ledger.reserveChild(identity, run.id, fence, child, randomUUID())
  const before = await f.read(); await f.ledger.revoke(identity, before.revision, mode)
  await expect(f.ledger.reserveChild(identity, run.id, fence, child, randomUUID())).rejects.toThrow('TASK_DELEGATION_REVOKED')
  await expect(f.ledger.settle(identity, run.id, fence, 'succeeded', hash('result'))).rejects.toThrow('TASK_CHILD_TRANSITION_INVALID')
  const doc = await f.read(); expect(doc.reserved).toBe(4); expect(doc.delegation.revocationGeneration).toBe(fence.revocationGeneration + 1)
  expect(doc.delegation.runs[0]).toMatchObject({ state: 'settling', outcome: 'cancelled' })
  await f.ledger.cleanup(identity, run.id, fence.epoch, true)
  expect((await f.read()).delegation.runs[0]!.state).toBe('cancelled')
})
it('stop after preparation prevents publication and an expired deadline prevents reservation', async () => {
  const f = await setup(); await f.ready(); const { run } = await f.prepare(); const doc = await f.read()
  await f.ledger.revoke(identity, doc.revision, 'stopped')
  await expect(f.ledger.publish(identity, run.id, captured(doc), { sessionId: 'child', sessionKey: hash('child') })).rejects.toThrow('TASK_DELEGATION_REVOKED')
  const g = await setup(); await g.ready(); const c = await g.running(); g.clock(c.run.deadlineAt)
  await expect(g.ledger.reserveChild(identity, c.run.id, c.fence, c.child, randomUUID())).rejects.toThrow('TASK_CHILD_DEADLINE')
})
it('requires verified cleanup and separately reconciled delivery; neither is inferred from success', async () => {
  const f = await setup(); await f.ready(); const { run, fence } = await f.running()
  await f.ledger.settle(identity, run.id, fence, 'succeeded', hash('result'))
  await f.ledger.cleanup(identity, run.id, fence.epoch, false)
  await expect(f.prepare()).rejects.toThrow('TASK_CHILD_UNRESOLVED')
  await expect(f.ledger.delivery(identity, run.id, fence.epoch, 'pending', 'recorded')).rejects.toThrow('TASK_CHILD_TRANSITION_INVALID')
  await f.ledger.cleanup(identity, run.id, fence.epoch, true)
  expect((await f.read()).delegation.runs[0]).toMatchObject({ state: 'succeeded', resultDigest: hash('result'), delivery: 'pending' })
  await f.ledger.delivery(identity, run.id, fence.epoch, 'pending', 'unknown')
  await expect(f.prepare()).rejects.toThrow('TASK_CHILD_UNRESOLVED')
  await f.ledger.delivery(identity, run.id, fence.epoch, 'unknown', 'recorded')
  expect((await f.prepare()).created).toBe(true)
})
it.each(['prepared', 'running', 'settling', 'succeeded'] as const)('recovers %s without replay or refund; old epoch loses all mutation authority', async state => {
  const f = await setup(); await f.ready()
  const p = state === 'prepared' ? await f.prepare() : await f.running()
  const fence = captured(await f.read())
  if ('child' in p) await f.ledger.reserveChild(identity, p.run.id, fence, p.child, randomUUID())
  if (state === 'settling' || state === 'succeeded') await f.ledger.settle(identity, p.run.id, fence, 'succeeded', hash('result'))
  if (state === 'succeeded') await f.ledger.cleanup(identity, p.run.id, fence.epoch, true)
  const before = await f.read()
  const recovered = await f.ledger.recover(identity, before.revision, before.runtime, nextEpoch)
  expect(recovered.mode).toBe('interrupted'); expect(recovered.reserved).toBe(before.reserved)
  expect(recovered.delegation.runs[0]).toMatchObject(state === 'succeeded'
    ? { state: 'succeeded', delivery: 'unknown' } : { state: 'interrupted', cleanup: 'pending', resultDigest: null })
  expect(await f.ledger.recover(identity, before.revision, before.runtime, nextEpoch)).toEqual(recovered)
  await expect(f.ledger.cleanup(identity, p.run.id, before.runtime, true)).rejects.toThrow('TASK_STALE_EPOCH')
  await expect(f.ledger.settle(identity, p.run.id, fence, 'failed', null)).rejects.toThrow('TASK_STALE_EPOCH')
  await expect(f.ledger.resume(identity, recovered.revision, nextEpoch)).rejects.toThrow('TASK_RESUME_UNAVAILABLE')
  if (state !== 'succeeded') await f.ledger.cleanup(identity, p.run.id, nextEpoch, true)
  else await f.ledger.delivery(identity, p.run.id, nextEpoch, 'unknown', 'recorded')
  expect((await f.ledger.resume(identity, (await f.read()).revision, nextEpoch)).mode).toBe('auto')
})
it('CAS recovery allows only one competing process epoch, not a stale process takeover', async () => {
  const f = await setup(); const doc = await f.ready()
  const results = await Promise.allSettled([f.ledger.recover(identity, doc.revision, doc.runtime, nextEpoch),
    new AdaptiveTaskDelegationLedger(f.path).recover(identity, doc.revision, doc.runtime, hash('third'))])
  expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
  expect((await f.read()).reserved).toBe(doc.reserved)
})
it('retains all 32 admitted cancelled/failed run receipts and rejects the 33rd before any work', async () => {
  const f = await setup(); await f.ready(); const firstInput = f.input(); const fence = captured(await f.read())
  const first = await f.ledger.prepare(identity, fence, firstInput); await f.finish(first.run)
  for (let n = 1; n < 32; n++) { const p = await f.prepare(); await f.finish(p.run) }
  const before = await f.read(); expect(before.delegation.runs).toHaveLength(32)
  await expect(f.prepare()).rejects.toThrow('TASK_LEDGER_CAPACITY')
  expect((await f.ledger.prepare(identity, fence, firstInput)).created).toBe(false)
  expect(await f.read()).toEqual(before); expect(Buffer.byteLength(await readFile(f.file, 'utf8'))).toBeLessThan(65536)
})
it('refuses byte capacity before admission while leaving room to finish the last accepted run', async () => {
  const f = await setup(); let doc = await f.migrate()
  const sources = Array.from({ length: 32 }, (_, n) => String(n).padStart(80, 's'))
  doc = await f.ledger.configure(identity, doc.revision, { ...grant, sourceIds: sources }); await f.ledger.resume(identity, doc.revision, doc.runtime)
  let accepted = 0
  for (;;) {
    let p
    try { p = await f.ledger.prepare(identity, captured(await f.read()), { ...f.input(), sourceIds: sources }) }
    catch (error) { expect(String(error)).toContain('TASK_LEDGER_CAPACITY'); break }
    accepted++; await f.finish(p.run)
  }
  expect(accepted).toBeGreaterThan(0); expect(accepted).toBeLessThan(32)
  expect((await f.read()).delegation.runs).toHaveLength(accepted)
})
it.each(['extra-root', 'extra-run', 'unsafe-number', 'unknown-version', 'duplicate-call', 'lost-debit', 'fake-success', 'bad-source', 'oversize-id'])(
  'strictly rejects corrupt %s without replacing the valid file', async kind => {
    const f = await setup(); await f.ready(); const c = await f.running()
    await f.ledger.reserveChild(identity, c.run.id, c.fence, c.child, randomUUID())
    const doc = await f.read(), bad = structuredClone(doc) as any
    if (kind === 'extra-root') bad.approved = true
    if (kind === 'extra-run') bad.delegation.runs[0].credential = 'not-allowed'
    if (kind === 'unsafe-number') bad.delegation.revocationGeneration = Number.MAX_SAFE_INTEGER + 1
    if (kind === 'unknown-version') bad.version = 3
    if (kind === 'duplicate-call') bad.delegation.runs.push(structuredClone(bad.delegation.runs[0]))
    if (kind === 'lost-debit') bad.reserved = 0
    if (kind === 'fake-success') bad.delegation.runs[0].state = 'succeeded'
    if (kind === 'bad-source') bad.delegation.runs[0].sourceIds = ['unapproved-source']
    if (kind === 'oversize-id') bad.delegation.runs[0].callId = 'x'.repeat(81)
    expect(() => parseTaskLedger(bad, 'root')).toThrow()
    expect(await f.read()).toEqual(doc)
    await writeFile(f.file, JSON.stringify(bad), { mode: 0o600 })
    await expect(f.ledger.migrate(identity, doc.revision)).rejects.toThrow()
    expect(await readFile(f.file, 'utf8')).toBe(JSON.stringify(bad))
  },
)
