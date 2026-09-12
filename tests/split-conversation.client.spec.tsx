import { afterEach, expect, it, vi } from 'vitest'
import type { ConnectionGeneration } from '@deepseek-ai/dsh-client-connection/client'
import { SPLIT_CONVERSATION_PATH, SplitConversationStore } from '../src/client/split-conversation.tsx'

function source(initial = true) {
  let current: ConnectionGeneration | undefined = initial ? { id: 1, host: { home: '' } } : undefined
  const listeners = new Set<() => void>()
  return {
    generation: {
      getSnapshot: () => current,
      subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    },
    set(id?: number) { current = id === undefined ? undefined : { id, host: { home: '' } }; for (const listener of listeners) listener() },
  }
}

const target = { epoch: 'epoch', sessionId: 'session', offerId: 'offer' }
const snapshot = (tasks: readonly Record<string, unknown>[] = [{ operationId: 'op', state: 'ready', target }]) => ({ version: 1, epoch: 'epoch', tasks })
const response = (value: unknown) => new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } })

const stores: SplitConversationStore[] = []
afterEach(() => { for (const store of stores.splice(0)) store.dispose(); vi.restoreAllMocks() })

it('waits for the real Gateway generation and recovers the task through status', async () => {
  const host = source(false)
  const fetcher = vi.fn(async (path: RequestInfo | URL, init?: RequestInit) => {
    expect(path).toBe(SPLIT_CONVERSATION_PATH)
    expect(init?.credentials).toBe('same-origin')
    expect(JSON.parse(String(init?.body))).toEqual({ action: 'status' })
    return response(snapshot())
  })
  const opened: string[] = []
  const store = new SplitConversationStore(host, fetcher, id => { opened.push(id) }); stores.push(store)
  expect(fetcher).not.toHaveBeenCalled()
  host.set(2)
  await store.refresh()
  expect(store.getSnapshot().tasks[0]?.target).toEqual(target)
  expect(opened).toEqual(['session'])
})

it('creates at most one task locally and does not persist or retry mutations', async () => {
  const host = source()
  const writes: unknown[] = []
  const fetcher = vi.fn(async (_path: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)); writes.push(body)
    return response(body.action === 'create' ? snapshot() : { version: 1, epoch: 'epoch', tasks: [] })
  })
  const store = new SplitConversationStore(host, fetcher); stores.push(store)
  await store.refresh()
  await store.create('approved brief')
  await store.create('second brief')
  expect(writes).toHaveLength(2)
  expect(writes[1]).toEqual({ action: 'create', epoch: 'epoch', operationId: expect.any(String), brief: 'approved brief' })
  expect(writes.some(value => JSON.stringify(value).includes('localStorage'))).toBe(false)
})

it('polls a pending task and does not reopen the same Session after repeated status reads', async () => {
  const host = source()
  const opened: string[] = []
  let pending = true
  const fetcher = vi.fn(async (_path: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body))
    if (body.action === 'create') return response(snapshot([{ operationId: body.operationId, state: 'pending' }]))
    pending = !pending
    return response(snapshot(pending ? [{ operationId: 'op', state: 'pending' }] : [{ operationId: 'op', state: 'ready', target }]))
  })
  const store = new SplitConversationStore(host, fetcher, id => { opened.push(id) }); stores.push(store)
  await store.refresh(); await store.create('brief')
  await new Promise(resolve => setTimeout(resolve, 1100)); await store.refresh()
  expect(opened).toEqual(['session'])
})

it('keeps an unconfirmed create locked when a later status omits the task', async () => {
  const host = source()
  let create = true
  const fetcher = vi.fn(async (_path: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body))
    if (body.action === 'create' && create) { create = false; throw new Error('reply lost') }
    return response({ version: 1, epoch: 'epoch', tasks: [] })
  })
  const store = new SplitConversationStore(host, fetcher); stores.push(store)
  await store.refresh(); await store.create('brief'); await store.refresh(); await store.create('second')
  expect(fetcher.mock.calls.filter(([, init]) => JSON.parse(String(init?.body)).action === 'create')).toHaveLength(1)
})

it('cancels the old generation read and starts a fresh status read', async () => {
  const host = source()
  const first = Promise.withResolvers<Response>()
  let calls = 0
  const fetcher = vi.fn(async () => ++calls === 1 ? first.promise : response(snapshot()))
  const store = new SplitConversationStore(host, fetcher); stores.push(store)
  host.set(2); await vi.waitFor(() => expect(calls).toBe(2)); first.resolve(response(snapshot()))
  await store.refresh(); expect(store.getSnapshot().status).toBe('ready')
})

it('keeps task state across a generation loss and refreshes after reconnect', async () => {
  const host = source()
  let reads = 0
  const fetcher = vi.fn(async () => response(snapshot([{ operationId: `op-${++reads}`, state: 'ready', target }])))
  const store = new SplitConversationStore(host, fetcher); stores.push(store)
  await store.refresh(); host.set(); expect(store.getSnapshot().status).toBe('disconnected'); host.set(3); await store.refresh()
  expect(fetcher).toHaveBeenCalledTimes(2)
  expect(store.getSnapshot().tasks[0]?.target?.sessionId).toBe('session')
})

it('bounds streamed status responses before decoding them', async () => {
  const host = source(false)
  const oversized = new Uint8Array(64_001)
  const fetcher = vi.fn(async () => new Response(new ReadableStream({
    start(controller) { controller.enqueue(oversized); controller.close() },
  }), { status: 200, headers: { 'content-type': 'application/json' } }))
  const store = new SplitConversationStore(host, fetcher); stores.push(store)
  host.set(2)
  await store.refresh()
  expect(store.getSnapshot().status).toBe('unknown')
})

it('publishes unknown when a same-generation status request times out', async () => {
  vi.useFakeTimers()
  const host = source(false)
  const fetcher = vi.fn(async (_path: RequestInfo | URL, init?: RequestInit) => await new Promise<never>((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => { reject(new DOMException('aborted', 'AbortError')) }, { once: true })
  }))
  const store = new SplitConversationStore(host, fetcher); stores.push(store)
  host.set(2)
  const pending = store.refresh()
  await vi.advanceTimersByTimeAsync(5_001)
  await pending
  expect(store.getSnapshot().status).toBe('unknown')
  vi.useRealTimers()
})

it('does not let a late pending status read regress a confirmed receipt', async () => {
  const host = source(false)
  const late = Promise.withResolvers<Response>()
  let createSeen = false
  const fetcher = vi.fn(async (_path: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body))
    if (body.action === 'create') {
      createSeen = true
      return response(snapshot([{ operationId: body.operationId, state: 'ready', target }]))
    }
    if (createSeen) return late.promise
    return response({ version: 1, epoch: 'epoch', tasks: [] })
  })
  const store = new SplitConversationStore(host, fetcher); stores.push(store)
  host.set(2)
  await store.refresh()
  await store.create('brief')
  expect(store.getSnapshot().tasks[0]?.state).toBe('ready')
  const read = store.refresh()
  late.resolve(response(snapshot([{ operationId: store.getSnapshot().tasks[0]!.operationId, state: 'pending' }])))
  await read
  expect(store.getSnapshot().tasks[0]?.state).toBe('ready')
})
