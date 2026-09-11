/** Private return targets and single-dispatch permits for server-authorized Reserve requests. */

import { createHash } from 'node:crypto'
import { open } from 'node:fs/promises'
import { join } from 'node:path'
import { writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import { ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import type { LlmCallConfig } from '@deepseek-ai/dsh-llm'
import { OPENAI_CODEX_PROVIDER } from './store.ts'
import { OPENAI_CODEX_RESERVE_MODEL, reserveIdentity } from './reserve-usage.ts'

/** Bounded private record required before changing a conversation's model. */
export interface ReserveReturnTarget {
  version: 1
  /** SHA-256 of the account/user pair; no bearer tokens or raw identity fields are stored. */
  identityKey: string
  ordinary: LlmCallConfig
}

const MAX_RETURN_BYTES = 8192

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Parse the private on-disk format without accepting another provider or a recursive Reserve target. */
export function parseReserveReturn(value: unknown): ReserveReturnTarget {
  if (!isRecord(value) || value['version'] !== 1 || typeof value['identityKey'] !== 'string'
    || !/^[a-f0-9]{64}$/u.test(value['identityKey']) || !isRecord(value['ordinary'])) {
    throw new Error('Codex Reserve return target is invalid')
  }
  const config = value['ordinary']
  const model = config['model']
  const effort = config['reasoningEffort']
  const temperature = config['temperature']
  const maxTokens = config['maxTokens']
  const stop = config['stop']
  if (config['provider'] !== OPENAI_CODEX_PROVIDER || typeof model !== 'string'
    || !/^(?=.{1,128}$)[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(model) || model === OPENAI_CODEX_RESERVE_MODEL
    || (effort !== undefined && (typeof effort !== 'string' || !/^[a-z][a-z0-9_-]{0,63}$/u.test(effort)))
    || (temperature !== undefined && (typeof temperature !== 'number' || !Number.isFinite(temperature)))
    || (maxTokens !== undefined && (typeof maxTokens !== 'number' || !Number.isSafeInteger(maxTokens) || maxTokens < 1))
    || (stop !== undefined && (!Array.isArray(stop) || stop.length > 32
      || stop.some(value => typeof value !== 'string' || value.length > 4096)))) {
    throw new Error('Codex Reserve return target is invalid')
  }
  return {
    version: 1,
    identityKey: value['identityKey'],
    ordinary: {
      provider: OPENAI_CODEX_PROVIDER,
      model,
      ...typeof effort === 'string' ? { reasoningEffort: ReasoningEffortId(effort) } : {},
      ...typeof temperature === 'number' ? { temperature } : {},
      ...typeof maxTokens === 'number' ? { maxTokens } : {},
      ...Array.isArray(stop) ? { stop: [...stop] as string[] } : {},
    },
  }
}

/** Session ids are hashed into fixed filenames, never interpreted as filesystem paths. */
export class ReserveReturnStore {
  constructor(private readonly directory: string) {}

  private filename(sessionId: string): string {
    if (sessionId.length === 0 || sessionId.length > 256) throw new Error('Codex Reserve session id is invalid')
    return join(this.directory, `${createHash('sha256').update(sessionId).digest('hex')}.json`)
  }

  /** Read at most one bounded target; absence is not permission to guess a previous model. */
  async load(sessionId: string): Promise<ReserveReturnTarget | undefined> {
    let handle
    try {
      handle = await open(this.filename(sessionId), 'r')
    } catch (error: unknown) {
      if (isRecord(error) && error['code'] === 'ENOENT') return undefined
      throw new Error('Codex Reserve return target could not be read')
    }
    try {
      if (!(await handle.stat()).isFile()) throw new Error('invalid file')
      const bytes = Buffer.alloc(MAX_RETURN_BYTES + 1)
      let offset = 0
      while (offset < bytes.length) {
        const result = await handle.read(bytes, offset, bytes.length - offset, offset)
        if (result.bytesRead === 0) break
        offset += result.bytesRead
      }
      if (offset > MAX_RETURN_BYTES) throw new Error('oversized file')
      return parseReserveReturn(JSON.parse(bytes.subarray(0, offset).toString('utf8')))
    } catch {
      throw new Error('Codex Reserve return target is invalid; select an ordinary model explicitly')
    } finally {
      await handle.close()
    }
  }

  /** Atomically save the exact ordinary controls before authorizing an automatic switch. */
  async save(sessionId: string, target: ReserveReturnTarget): Promise<void> {
    const content = `${JSON.stringify(parseReserveReturn(target))}\n`
    if (Buffer.byteLength(content) > MAX_RETURN_BYTES) throw new Error('Codex Reserve return target is too large')
    try {
      await writeFileAtomic(this.filename(sessionId), content, { mode: 0o600, dirMode: 0o700 })
    } catch {
      throw new Error('Codex Reserve return target could not be saved; no automatic switch was made')
    }
  }
}

interface ReservePermit {
  identityKey: string
  signal: AbortSignal
  onAbort: () => void
}

/** One-shot authorization from agent/request to the exact account used by pi-ai dispatch. */
export class ReserveRequestPermits {
  private readonly pending = new Map<string, ReservePermit>()

  /** Replace an undispatched attempt for this session; abort revokes it immediately. */
  issue(sessionId: string, identityKey: string, signal: AbortSignal): void {
    this.revoke(sessionId)
    signal.throwIfAborted()
    if (this.pending.size >= 256) throw new Error('Too many pending Codex Reserve requests')
    const permit: ReservePermit = { identityKey, signal, onAbort: () => {
      if (this.pending.get(sessionId) === permit) this.revoke(sessionId)
    } }
    this.pending.set(sessionId, permit)
    signal.addEventListener('abort', permit.onAbort, { once: true })
  }

  /** Reject manual routes, stale permits, and an account switch between usage and dispatch. */
  consume(sessionId: string | undefined, access: string | undefined): void {
    const permit = sessionId === undefined ? undefined : this.pending.get(sessionId)
    if (sessionId !== undefined) this.revoke(sessionId)
    const identity = access === undefined ? undefined : reserveIdentity(access)
    if (permit === undefined || permit.signal.aborted || identity?.key !== permit.identityKey) {
      throw new Error('Codex Reserve requires a fresh server-authorized request for the same account')
    }
  }

  /** Forget one cancelled, replaced, or completed attempt without retaining account state. */
  revoke(sessionId: string): void {
    const permit = this.pending.get(sessionId)
    if (permit === undefined) return
    permit.signal.removeEventListener('abort', permit.onAbort)
    this.pending.delete(sessionId)
  }

  /** Remove every pending permit when the plugin is disposed. */
  clear(): void {
    for (const sessionId of this.pending.keys()) this.revoke(sessionId)
  }
}
