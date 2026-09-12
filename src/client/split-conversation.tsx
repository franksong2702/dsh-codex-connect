/** Opt-in Split task creation and the Session-scoped approval card. */
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { SplitApprovalRemoteCard } from './SplitApprovalRemoteCard.tsx'
import { SplitApprovalRemoteStore } from './split-approval-remote.ts'

export const SPLIT_CONVERSATION_PATH = '/api/codex-connect/split-conversation'

export interface SplitConversationTarget {
  readonly epoch: string
  readonly sessionId: string
  readonly offerId: string
}

export interface SplitConversationTask {
  readonly operationId: string
  readonly state: 'pending' | 'ready' | 'failed'
  readonly target?: SplitConversationTarget
}

interface SplitConversationSnapshot {
  readonly version: 1
  readonly epoch: string
  readonly tasks: readonly SplitConversationTask[]
}

interface SplitConversationState {
  readonly status: 'disconnected' | 'loading' | 'ready' | 'unknown'
  readonly epoch?: string
  readonly tasks: readonly SplitConversationTask[]
  readonly mutationLocked: boolean
}

type ConnectionLike = Pick<ConnectionHandle, 'generation'>

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function decode(value: unknown): SplitConversationSnapshot {
  if (!record(value) || value.version !== 1 || typeof value.epoch !== 'string' || value.epoch.length > 128 || !Array.isArray(value.tasks) || value.tasks.length > 1) throw new Error('SPLIT_CONVERSATION_RESPONSE_INVALID')
  const tasks = value.tasks.map(task => {
    if (!record(task) || typeof task.operationId !== 'string' || task.operationId.length > 128 || !['pending', 'ready', 'failed'].includes(String(task.state))) throw new Error('SPLIT_CONVERSATION_TASK_INVALID')
    let target: SplitConversationTarget | undefined
    if (task.target !== undefined) {
      if (!record(task.target) || typeof task.target.epoch !== 'string' || task.target.epoch.length > 128 || typeof task.target.sessionId !== 'string' || task.target.sessionId.length > 256 || typeof task.target.offerId !== 'string' || task.target.offerId.length > 128) throw new Error('SPLIT_CONVERSATION_TARGET_INVALID')
      target = Object.freeze({ epoch: task.target.epoch, sessionId: task.target.sessionId, offerId: task.target.offerId })
    }
    return Object.freeze({ operationId: task.operationId, state: task.state as SplitConversationTask['state'], ...(target ? { target } : {}) })
  })
  return Object.freeze({ version: 1, epoch: value.epoch, tasks: Object.freeze(tasks) })
}

function operationId(): string {
  return crypto.randomUUID()
}

function boundedSignal(parent: AbortSignal): { signal: AbortSignal; cancel: () => void } {
  const timeout = new AbortController()
  const timer = setTimeout(() => { timeout.abort() }, 5_000)
  return { signal: AbortSignal.any([parent, timeout.signal]), cancel: () => { clearTimeout(timer) } }
}

/** Reconnecting, generation-scoped client for the host-owned task route. */
export class SplitConversationStore {
  private state: SplitConversationState = { status: 'disconnected', tasks: [], mutationLocked: false }
  private readonly listeners = new Set<() => void>()
  private readonly unsubscribe: () => void
  private generation: unknown
  private stopped = false
  private reading: Promise<void> | undefined
  private generationController = new AbortController()
  private pollTimer: ReturnType<typeof setTimeout> | undefined
  private readonly opened = new Set<string>()
  private readonly opening = new Map<string, AbortSignal>()
  private mutationOperation: string | undefined
  private mutationConfirmed = false

  constructor(readonly connection: ConnectionLike, private readonly fetcher: typeof fetch = (input, init) => fetch(input, init), private readonly openSession?: (sessionId: SessionId, signal: AbortSignal) => void | Promise<void>) {
    this.unsubscribe = connection.generation.subscribe(() => this.reset())
    this.reset()
  }

  getSnapshot = (): SplitConversationState => this.state
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }

  private publish(state: SplitConversationState): void {
    if (this.stopped) return
    this.state = Object.freeze(state)
    for (const listener of [...this.listeners]) listener()
  }

  private reset(): void {
    const generation = this.connection.generation.getSnapshot()
    if (generation === this.generation && generation !== undefined) return
    this.generationController.abort(); this.generationController = new AbortController()
    this.opening.clear()
    clearTimeout(this.pollTimer); this.pollTimer = undefined; this.reading = undefined
    this.generation = generation
    if (generation === undefined) { this.publish({ ...this.state, status: 'disconnected' }); return }
    this.publish({ ...this.state, status: 'loading' })
    void this.refresh()
  }

  private request(body: Record<string, unknown>, signal: AbortSignal): Promise<SplitConversationSnapshot> {
    return this.fetcher(SPLIT_CONVERSATION_PATH, {
      method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error',
      headers: { 'content-type': 'application/json', 'x-dsh-split-request': '1' }, body: JSON.stringify(body), signal,
    }).then(async response => {
      if (!response.ok || !response.headers.get('content-type')?.startsWith('application/json')) throw new Error('SPLIT_CONVERSATION_UNAVAILABLE')
      const reader = response.body?.getReader()
      if (!reader) throw new Error('SPLIT_CONVERSATION_RESPONSE_INVALID')
      const parts: Uint8Array[] = []
      let length = 0
      try {
        while (true) {
          signal.throwIfAborted()
          const part = await reader.read()
          if (part.done) break
          length += part.value.byteLength
          if (length > 64_000) throw new Error('SPLIT_CONVERSATION_RESPONSE_TOO_LARGE')
          parts.push(part.value)
        }
      } finally {
        await reader.cancel().catch(() => undefined)
        reader.releaseLock()
      }
      const bytes = new Uint8Array(length)
      let offset = 0
      for (const part of parts) { bytes.set(part, offset); offset += part.byteLength }
      return decode(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)))
    })
  }

  private accept(snapshot: SplitConversationSnapshot, generation: unknown, expectedOperation?: string): void {
    if (this.stopped || this.generation !== generation) return
    const expected = expectedOperation ?? this.mutationOperation
    if (expected !== undefined && snapshot.tasks[0]?.operationId !== expected) throw new Error('SPLIT_CONVERSATION_OPERATION_MISMATCH')
    const tasks = snapshot.tasks
    const task = tasks[0]
    if (this.mutationOperation !== undefined && task?.operationId === this.mutationOperation) {
      if (this.mutationConfirmed && task.state === 'pending') return
      if (task.state === 'ready' || task.state === 'failed') this.mutationConfirmed = true
    }
    this.publish({ ...this.state, status: 'ready', epoch: snapshot.epoch, tasks })
    for (const task of tasks) {
      if (task.state === 'ready' && task.target && !this.opened.has(task.operationId) && !this.opening.has(task.operationId)) {
        const signal = this.generationController.signal
        this.opening.set(task.operationId, signal)
        void Promise.resolve().then(() => { signal.throwIfAborted(); return this.openSession?.(task.target!.sessionId as SessionId, signal) }).then(() => {
          if (!signal.aborted) this.opened.add(task.operationId)
        }).catch(() => {
          if (!signal.aborted && !this.stopped) this.publish({ ...this.state, status: 'unknown' })
        }).finally(() => {
          if (this.opening.get(task.operationId) === signal) this.opening.delete(task.operationId)
        })
      }
    }
    clearTimeout(this.pollTimer)
    if (tasks.some(task => task.state === 'pending')) this.pollTimer = setTimeout(() => { this.pollTimer = undefined; void this.refresh() }, 1000)
  }

  refresh = (): Promise<void> => {
    if (this.reading) return this.reading
    const generation = this.generation
    if (generation === undefined || this.stopped) return Promise.resolve()
    const request = boundedSignal(this.generationController.signal)
    const reading = this.request({ action: 'status' }, request.signal).then(snapshot => {
      this.accept(snapshot, generation)
    }).catch(() => {
      if (this.generation === generation && !this.stopped) this.publish({ ...this.state, status: 'unknown' })
    }).finally(() => { request.cancel(); if (this.reading === reading) this.reading = undefined })
    this.reading = reading
    return reading
  }

  create = (brief: string): Promise<void> => {
    if (this.state.status !== 'ready' || this.state.epoch === undefined || this.state.mutationLocked || this.state.tasks.length > 0 || brief.trim().length === 0 || brief.length > 2_000) return Promise.resolve()
    const generation = this.generation
    const operation = operationId()
    this.mutationOperation = operation
    this.mutationConfirmed = false
    this.publish({ ...this.state, mutationLocked: true, tasks: [{ operationId: operation, state: 'pending' }] })
    const request = boundedSignal(this.generationController.signal)
    return this.request({ action: 'create', epoch: this.state.epoch, operationId: operation, brief }, request.signal).then(snapshot => {
      this.accept(snapshot, generation, operation)
    }).catch(() => { if (this.generation === generation && !this.stopped) this.publish({ ...this.state, status: 'unknown' }) }).finally(() => { request.cancel() })
  }

  dispose(): void { this.stopped = true; this.generationController.abort(); clearTimeout(this.pollTimer); this.unsubscribe(); this.listeners.clear() }
}

function useStore(store: SplitConversationStore): SplitConversationState {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
}

function Overlay({ store }: { store: SplitConversationStore }): JSX.Element {
  const state = useStore(store)
  const [brief, setBrief] = useState('')
  const [busy, setBusy] = useState(false)
  return <section aria-label="Split conversation" style={{ padding: 12 }}>
    <label>Read-only task brief <textarea maxLength={2000} value={brief} onChange={event => { setBrief(event.target.value) }} disabled={busy || state.tasks.length > 0} /></label>
    <button type="button" disabled={busy || state.status !== 'ready' || state.tasks.length > 0 || brief.trim().length === 0} onClick={() => { setBusy(true); void store.create(brief).finally(() => { setBusy(false) }) }}>Start Split task</button>
    {state.status === 'unknown' && <button type="button" onClick={() => { void store.refresh() }}>Refresh status</button>}
    {state.status === 'unknown' && <p role="alert">Task status is unconfirmed.</p>}
    {state.tasks.map(task => <p key={task.operationId} role="status">{task.state === 'pending' ? 'Starting…' : task.state === 'ready' ? 'Ready' : 'Failed'}</p>)}
  </section>
}

function Dock({ store, sessionId }: { store: SplitConversationStore; sessionId: SessionId }): JSX.Element | null {
  const state = useStore(store)
  const task = state.tasks.find(item => item.state === 'ready' && item.target?.sessionId === sessionId)
  const approvalStore = useMemo(() => task?.target ? new SplitApprovalRemoteStore(store.connection.generation, task.target) : undefined, [store, task?.target])
  useEffect(() => () => { approvalStore?.dispose() }, [approvalStore])
  return approvalStore ? <SplitApprovalRemoteCard store={approvalStore} /> : null
}

/** Explicit opt-in client plugin: root task form plus active-session approval dock. */
export function apply(ctx: Context): void {
  const connection = ctx.get('connection') as ConnectionHandle | undefined
  const sessions = ctx.get('sessions') as { open(id: SessionId): void; refresh(): Promise<void> } | undefined
  if (!connection || ctx.get('slots') === undefined) throw new Error('SPLIT_CONVERSATION_CLIENT_UNAVAILABLE')
  if (!sessions) throw new Error('SPLIT_CONVERSATION_SESSIONS_UNAVAILABLE')
  const store = new SplitConversationStore(connection, (input, init) => fetch(input, init), async (id, signal) => {
    await sessions.refresh()
    signal.throwIfAborted()
    sessions.open(id)
  })
  ctx.effect(() => () => store.dispose(), 'split-conversation: client store')
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({ name: 'shell.overlay', id: 'split-conversation', order: 60, inject: () => ({ store }) }, Overlay))
  ctx.inject(['slots'], (scope: Context) => {
    scope.slots.inject('conversation.input.dock', () => scope.slots.register({ name: 'conversation.input.dock', id: 'split-conversation-card', order: 10, inject: (sessionId: SessionId) => ({ store, sessionId }) }, Dock))
  })
}

export const name = 'dsh-codex-connect-split-conversation'
export const inject = ['connection', 'slots', 'sessions']
