/** Internal HTTP client: generation-scoped reads, no automatic mutation retry. */
import type { ConnectionGeneration, ConnectionGenerationState } from '@deepseek-ai/dsh-client-connection/client'
import type { SplitApprovalChoice } from '../split-approval-view.ts'
import { decodeSplitSnapshot, SPLIT_APPROVAL_PATH } from '../split-transport-contract.ts'
import type { SplitApprovalTarget, SplitTransportRequest, SplitTransportSnapshot } from '../split-transport-contract.ts'
export interface SplitRemoteState {
  readonly status: 'disconnected' | 'loading' | 'ready' | 'unknown' | 'unavailable'
  readonly snapshot?: SplitTransportSnapshot
  readonly decisionLocked: boolean
  readonly revokeLocked: boolean
}
export type SplitApprovalFetch = (input: string, init: RequestInit) => Promise<Response>
const finalPhases = new Set(['disabled', 'completed', 'rejected', 'cancelled', 'unavailable', 'failed', 'revoked'])
class RemoteUnavailable extends Error {}
export class SplitApprovalRemoteStore {
  private state: SplitRemoteState = { status: 'disconnected', decisionLocked: false, revokeLocked: false }
  private readonly listeners = new Set<() => void>()
  private generation: ConnectionGeneration | undefined
  private controller = new AbortController()
  private timer: ReturnType<typeof setTimeout> | undefined
  private reading: Promise<void> | undefined
  private stopped = false
  private readonly unsubscribe: () => void
  readonly target: SplitApprovalTarget
  constructor(private readonly generations: ConnectionGenerationState, target: SplitApprovalTarget,
    private readonly fetcher: SplitApprovalFetch = (input, init) => fetch(input, init), private readonly pollMs = 1000) {
    this.target = Object.freeze({ ...target })
    this.unsubscribe = generations.subscribe(() => this.reset())
    this.reset()
  }
  getSnapshot = (): SplitRemoteState => this.state
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private publish(state: SplitRemoteState): void {
    if (this.stopped) return
    this.state = Object.freeze(state)
    for (const listener of [...this.listeners]) { try { listener() } catch { /* View observers do not control admission. */ } }
  }
  private reset(): void {
    if (this.stopped) return
    const generation = this.generations.getSnapshot()
    if (generation === this.generation && generation !== undefined) return
    this.generation = generation
    this.controller.abort(); this.controller = new AbortController()
    clearTimeout(this.timer); this.reading = undefined
    this.publish({ status: generation ? 'loading' : 'disconnected', decisionLocked: this.state.decisionLocked, revokeLocked: this.state.revokeLocked })
    if (generation) void this.refresh()
  }
  private current(generation: ConnectionGeneration | undefined, signal: AbortSignal): boolean {
    return !this.stopped && !signal.aborted && generation !== undefined && this.generation === generation
  }
  private async request(body: SplitTransportRequest, signal: AbortSignal): Promise<SplitTransportSnapshot> {
    const response = await this.fetcher(SPLIT_APPROVAL_PATH, {
      method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error',
      headers: { 'content-type': 'application/json', 'x-dsh-split-request': '1' }, body: JSON.stringify(body),
      signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]),
    })
    if (!response.ok || !response.headers.get('content-type')?.startsWith('application/json')) {
      await response.body?.cancel()
      if ([401, 403, 404, 503].includes(response.status)) throw new RemoteUnavailable()
      throw new Error('SPLIT_RESPONSE_UNCONFIRMED')
    }
    const reader = response.body?.getReader()
    if (!reader) throw new Error('SPLIT_RESPONSE_INVALID')
    const parts: Uint8Array[] = []; let length = 0
    try {
      while (true) {
        signal.throwIfAborted()
        const part = await reader.read()
        if (part.done) break
        length += part.value.byteLength
        if (length > 64_000) throw new Error('SPLIT_RESPONSE_TOO_LARGE')
        parts.push(part.value)
      }
    } finally { await reader.cancel().catch(() => undefined); reader.releaseLock() }
    const bytes = new Uint8Array(length); let offset = 0
    for (const part of parts) { bytes.set(part, offset); offset += part.byteLength }
    return decodeSplitSnapshot(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)), this.target)
  }
  private accept(snapshot: SplitTransportSnapshot): void {
    const prior = this.state.snapshot
    if (prior && (snapshot.revision < prior.revision || snapshot.view.reviewDigest !== prior.view.reviewDigest)) return
    this.publish({ status: 'ready', snapshot, decisionLocked: this.state.decisionLocked || snapshot.decision !== undefined,
      revokeLocked: this.state.revokeLocked || snapshot.revocation !== undefined })
  }
  private problem(error: unknown): void {
    if (error instanceof RemoteUnavailable) this.publish({ status: 'unavailable', decisionLocked: true, revokeLocked: true })
    else this.publish({ ...this.state, status: 'unknown' })
  }
  private schedule(): void {
    clearTimeout(this.timer)
    if (!this.stopped && this.generation && this.state.status !== 'unavailable'
      && !finalPhases.has(this.state.snapshot?.view.phase ?? '') && this.pollMs > 0) {
      this.timer = setTimeout(() => { void this.refresh() }, this.pollMs)
    }
  }
  refresh = (): Promise<void> => {
    if (this.reading) return this.reading
    const generation = this.generation; const signal = this.controller.signal
    if (!this.current(generation, signal)) return Promise.resolve()
    const reading = (async () => {
      try {
        const snapshot = await this.request({ ...this.target, action: 'status' }, signal)
        if (this.current(generation, signal)) this.accept(snapshot)
      } catch (error) { if (this.current(generation, signal)) this.problem(error) }
      finally {
        if (this.current(generation, signal)) { this.reading = undefined; this.schedule() }
      }
    })()
    this.reading = reading
    return reading
  }
  decide = async (id: string, digest: string, choice: SplitApprovalChoice): Promise<boolean> => {
    const snapshot = this.state.snapshot
    if (this.state.status !== 'ready' || this.state.decisionLocked || !snapshot || snapshot.view.phase !== 'awaiting-approval'
      || id !== snapshot.offerId || digest !== snapshot.view.reviewDigest || (choice !== 'allow-once' && choice !== 'reject')) return false
    this.publish({ ...this.state, decisionLocked: true })
    const result = await this.mutate('decide', choice)
    return result?.decision?.state === 'accepted'
  }
  revoke = async (id: string): Promise<void> => {
    if (!this.generation || !this.state.snapshot || id !== this.target.offerId || this.state.revokeLocked
      || this.state.status === 'unavailable' || this.state.status === 'disconnected') throw new Error('SPLIT_REVOCATION_UNCONFIRMED')
    this.publish({ ...this.state, revokeLocked: true })
    const result = await this.mutate('revoke')
    if (!result || result.revocation?.state === 'failed') throw new Error('SPLIT_REVOCATION_UNCONFIRMED')
  }
  private async mutate(action: 'decide' | 'revoke', choice?: SplitApprovalChoice): Promise<SplitTransportSnapshot | undefined> {
    const generation = this.generation; const signal = this.controller.signal; const snapshot = this.state.snapshot
    if (!snapshot || !this.current(generation, signal)) return undefined
    try {
      const operationId = crypto.randomUUID()
      const result = await this.request({ ...this.target, action, operationId,
        reviewDigest: snapshot.view.reviewDigest, expectedRevision: snapshot.revision, ...choice ? { choice } : {} }, signal)
      if (!this.current(generation, signal)) return undefined
      const receipt = action === 'decide' ? result.decision : result.revocation
      if (receipt?.operationId !== operationId) throw new Error('SPLIT_RECEIPT_MISMATCH')
      this.accept(result); return result
    } catch (error) { if (this.current(generation, signal)) this.problem(error); return undefined }
    finally { if (this.current(generation, signal)) this.schedule() }
  }
  dispose(): void {
    if (this.stopped) return
    this.stopped = true; this.controller.abort(); this.unsubscribe(); clearTimeout(this.timer); this.listeners.clear()
  }
}
