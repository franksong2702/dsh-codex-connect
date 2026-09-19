import { afterEach, expect, it, vi } from 'vitest'
import type { ConnectionGeneration } from '@deepseek-ai/dsh-client-connection/client'
import { SplitApprovalRemoteStore } from '../src/client/split-approval-remote.ts'
import type { SplitApprovalFetch } from '../src/client/split-approval-remote.ts'
import { SPLIT_APPROVAL_PATH } from '../src/split-transport-contract.ts'
import type { SplitTransportSnapshot } from '../src/split-transport-contract.ts'
const target = { epoch: 'host-epoch', sessionId: 'parent-one', offerId: 'offer-one' }
const snapshot = (revision = 1, phase: SplitTransportSnapshot['view']['phase'] = 'awaiting-approval'): SplitTransportSnapshot => ({
  version: 1, ...target, revision, view: { id: target.offerId, reviewDigest: 'b'.repeat(64), phase,
    review: { workspaceLabel: 'Fixture', brief: 'Inspect fixture.', files: [{ path: 'src/test.ts', sha256: 'a'.repeat(64), lines: 2 }],
      model: 'gpt-5.6-luna', effort: 'low', maximumRequests: 6, timeoutMs: 90000,
      contextPolicy: 'isolated-system-and-approved-snapshots', workerSystemPrompt: 'Inspect fixture only.' } },
})
const json = (value: unknown) => Response.json(value)
function generations(initial = true) {
  let current: ConnectionGeneration | undefined = initial ? { id: 1, host: { home: '' } } : undefined
  const listeners = new Set<() => void>()
  return { getSnapshot: () => current, subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn) } },
    set(id?: number) { current = id === undefined ? undefined : { id, host: { home: '' } }; for (const fn of listeners) fn() },
    listeners,
  }
}
const stores: SplitApprovalRemoteStore[] = []
function fixture(fetcher: SplitApprovalFetch, initial = true) {
  const source = generations(initial)
  const store = new SplitApprovalRemoteStore(source, target, fetcher, 0); stores.push(store)
  return { store, source }
}
afterEach(() => { for (const store of stores.splice(0)) store.dispose(); vi.restoreAllMocks() })
it('waits for generation readiness and uses same-origin authenticated JSON without sending credentials in the body', async () => {
  const fetcher = vi.fn(async (path: string, init: RequestInit) => {
    expect(path).toBe(SPLIT_APPROVAL_PATH); expect(init.credentials).toBe('same-origin'); expect(init.redirect).toBe('error')
    expect(new Headers(init.headers).get('x-dsh-split-request')).toBe('1')
    expect(JSON.parse(String(init.body))).toEqual({ ...target, action: 'status' })
    return json(snapshot())
  })
  const { store, source } = fixture(fetcher, false)
  expect(fetcher).not.toHaveBeenCalled(); source.set(1); await store.refresh()
  expect(store.getSnapshot().status).toBe('ready'); expect(fetcher).toHaveBeenCalledTimes(1)
})
it('never replays an unconfirmed decision, including after reconnect and a fresh status read', async () => {
  let view = snapshot(); const writes: unknown[] = []
  const fetcher = vi.fn(async (_path: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body))
    if (body.action === 'decide') { writes.push(body); view = { ...snapshot(4, 'running'), decision: { operationId: body.operationId, state: 'accepted' } }; throw new Error('reply lost') }
    return json(view)
  })
  const { store, source } = fixture(fetcher); await store.refresh()
  expect(await store.decide(target.offerId, 'b'.repeat(64), 'allow-once')).toBe(false)
  expect(store.getSnapshot().status).toBe('unknown'); expect(store.getSnapshot().decisionLocked).toBe(true)
  source.set(); expect(store.getSnapshot().snapshot).toBeUndefined()
  source.set(2); await store.refresh()
  expect(store.getSnapshot().snapshot?.view.phase).toBe('running')
  expect(await store.decide(target.offerId, 'b'.repeat(64), 'allow-once')).toBe(false)
  expect(writes).toHaveLength(1)
})
it('does not unlock a lost decision even when status still says awaiting approval', async () => {
  let writes = 0
  const { store } = fixture(async (_path, init) => {
    if (JSON.parse(String(init.body)).action !== 'status') { writes++; throw new Error('not acknowledged') }
    return json(snapshot())
  })
  await store.refresh(); await store.decide(target.offerId, 'b'.repeat(64), 'allow-once'); await store.refresh()
  expect(store.getSnapshot().decisionLocked).toBe(true)
  await store.decide(target.offerId, 'b'.repeat(64), 'reject'); expect(writes).toBe(1)
})
it('ignores a late response from the disconnected generation', async () => {
  const old = Promise.withResolvers<Response>(); let calls = 0
  const { store, source } = fixture(async () => ++calls === 1 ? old.promise : json(snapshot(7, 'running')))
  source.set(); source.set(2); await store.refresh(); old.resolve(json(snapshot(1)))
  await vi.waitFor(() => expect(store.getSnapshot().snapshot?.revision).toBe(7))
  expect(store.getSnapshot().snapshot?.view.phase).toBe('running')
})
it('does not let an older status overwrite the accepted decision response', async () => {
  const old = Promise.withResolvers<Response>(); let reads = 0
  const { store } = fixture(async (_path, init) => {
    const body = JSON.parse(String(init.body))
    if (body.action === 'status') return ++reads === 1 ? json(snapshot()) : old.promise
    return json({ ...snapshot(9, 'running'), decision: { operationId: body.operationId, state: 'accepted' } })
  })
  await store.refresh(); const pending = store.refresh()
  expect(await store.decide(target.offerId, 'b'.repeat(64), 'allow-once')).toBe(true)
  old.resolve(json(snapshot(2))); await pending
  expect(store.getSnapshot().snapshot?.revision).toBe(9)
})
it.each([401, 403, 404, 503])('clears review data and locks actions on HTTP %s', async status => {
  let fail = false; const { store } = fixture(async () => fail ? new Response('', { status }) : json(snapshot()))
  await store.refresh(); fail = true; await store.refresh()
  expect(store.getSnapshot()).toEqual({ status: 'unavailable', decisionLocked: true, revokeLocked: true })
})
it.each(['session', 'epoch', 'model', 'too-large'])('rejects %s response without presenting an approval', async kind => {
  const value = snapshot()
  const raw: unknown = kind === 'session' ? { ...value, sessionId: 'other' } : kind === 'epoch' ? { ...value, epoch: 'other' }
    : kind === 'model' ? { ...value, view: { ...value.view, review: { ...value.view.review, model: 'other' } } } : { padding: 'x'.repeat(64001) }
  const { store } = fixture(async () => json(raw)); await store.refresh()
  expect(store.getSnapshot().status).toBe('unknown'); expect(store.getSnapshot().snapshot).toBeUndefined()
})
it('shows revoking until a later authoritative read confirms cleanup, without a repeated revoke', async () => {
  let view = snapshot(1, 'running'); let writes = 0
  const { store } = fixture(async (_path, init) => {
    const body = JSON.parse(String(init.body))
    if (body.action === 'revoke') { writes++; view = { ...snapshot(2, 'revoking'), revocation: { operationId: body.operationId, state: 'pending' } } }
    return json(view)
  })
  await store.refresh(); await store.revoke(target.offerId)
  expect(store.getSnapshot().snapshot?.view.phase).toBe('revoking')
  view = { ...snapshot(3, 'revoked'), revocation: { operationId: 'same', state: 'accepted' } }; await store.refresh()
  expect(store.getSnapshot().snapshot?.view.phase).toBe('revoked'); expect(writes).toBe(1)
})
it('does not confirm a decision using a different operation receipt', async () => {
  const { store } = fixture(async (_path, init) => JSON.parse(String(init.body)).action === 'status' ? json(snapshot())
    : json({ ...snapshot(4, 'running'), decision: { operationId: 'another-request', state: 'accepted' } }))
  await store.refresh()
  expect(await store.decide(target.offerId, 'b'.repeat(64), 'allow-once')).toBe(false)
  expect(store.getSnapshot().status).toBe('unknown'); expect(store.getSnapshot().decisionLocked).toBe(true)
})
it('refuses stale target decisions and stops refreshing after disposal', async () => {
  const fetcher = vi.fn(async () => json(snapshot())); const { store, source } = fixture(fetcher)
  await store.refresh(); expect(await store.decide('wrong-offer', 'b'.repeat(64), 'allow-once')).toBe(false)
  store.dispose(); source.set(2); await store.refresh()
  expect(source.listeners.size).toBe(0); expect(fetcher).toHaveBeenCalledTimes(1)
})
