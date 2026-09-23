/** Owner-only task grants and conservative request reservations; never contains OAuth or prompt content. */
import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, mkdir, open } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { withFileLock, writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import { ADAPTIVE_TASK_MAX_REQUESTS, ADAPTIVE_TASK_MODELS, allowsTaskRoute, taskRecord, taskRoute, validTaskSessionId } from './adaptive-task-contract.ts'
import type { TaskCapability, TaskMode, TaskRoute } from './adaptive-task-contract.ts'

export interface TaskDocument {
  version: 1
  sessionId: string
  sessionKey: string
  owner: string
  runtime: string
  revision: number
  mode: TaskMode
  route: TaskRoute
  capabilities: readonly TaskCapability[]
  maximumRequests: number
  reserved: number
  selectionSeq: number
  portable: boolean
  handoffSeq: number
  receipts: Array<{ id: string; digest: string }>
}
const MAX_BYTES = 64 * 1024
const hash = (text: string): string => createHash('sha256').update(text).digest('hex')
export const taskIdentity = hash
export class AdaptiveTaskError extends Error {
  constructor(readonly code: string) { super(code) }
}
export function taskFailure(code: string): never { throw new AdaptiveTaskError(code) }
export function parseTaskDocument(value: unknown, sessionId: string): TaskDocument {
  if (!taskRecord(value) || Object.keys(value).sort().join(',') !== 'capabilities,handoffSeq,maximumRequests,mode,owner,portable,receipts,reserved,revision,route,runtime,selectionSeq,sessionId,sessionKey,version'
    || value.version !== 1 || value.sessionId !== sessionId || !validTaskSessionId(value.sessionId)
    || !['auto', 'manual', 'stopped', 'interrupted', 'limit'].includes(String(value.mode))
    || !Number.isSafeInteger(value.revision) || Number(value.revision) < 1
    || !Number.isSafeInteger(value.reserved) || Number(value.reserved) < 0
    || !Number.isSafeInteger(value.maximumRequests) || Number(value.maximumRequests) < 1
    || Number(value.maximumRequests) > ADAPTIVE_TASK_MAX_REQUESTS || Number(value.reserved) > Number(value.maximumRequests)
    || !Number.isSafeInteger(value.selectionSeq) || Number(value.selectionSeq) < -1
    || !Number.isSafeInteger(value.handoffSeq) || Number(value.handoffSeq) < -1
    || typeof value.portable !== 'boolean' || !taskRoute(value.route)
    || !Array.isArray(value.capabilities) || value.capabilities.length < 1 || value.capabilities.length > ADAPTIVE_TASK_MODELS.length
    || !Array.isArray(value.receipts) || value.receipts.length < 1 || value.receipts.length > 64) taskFailure('TASK_STATE_INVALID')
  for (const key of ['sessionKey', 'owner', 'runtime'] as const) {
    if (typeof value[key] !== 'string' || !/^[a-f0-9]{64}$/u.test(value[key])) taskFailure('TASK_STATE_INVALID')
  }
  const models = new Set<string>()
  for (const item of value.capabilities) {
    if (!taskRecord(item) || Object.keys(item).sort().join(',') !== 'efforts,model'
      || typeof item.model !== 'string' || !ADAPTIVE_TASK_MODELS.includes(item.model as typeof ADAPTIVE_TASK_MODELS[number])
      || models.has(item.model) || !Array.isArray(item.efforts)
      || item.efforts.length === 0 || item.efforts.length > 16 || new Set(item.efforts).size !== item.efforts.length
      || item.efforts.some(effort => !taskRoute({ model: item.model, effort }))) taskFailure('TASK_STATE_INVALID')
    models.add(item.model)
  }
  const receiptIds = new Set<string>()
  for (const receipt of value.receipts) {
    if (!taskRecord(receipt) || Object.keys(receipt).sort().join(',') !== 'digest,id'
      || typeof receipt.id !== 'string' || !/^[A-Za-z0-9_-]{16,80}$/u.test(receipt.id) || receiptIds.has(receipt.id)
      || typeof receipt.digest !== 'string' || !/^[a-f0-9]{64}$/u.test(receipt.digest)) taskFailure('TASK_STATE_INVALID')
    receiptIds.add(receipt.id)
  }
  const document = value as unknown as TaskDocument
  if (!allowsTaskRoute(document.capabilities, document.route)) taskFailure('TASK_STATE_INVALID')
  return document
}
/** One private file/lock per root. Codecs cannot change identity or storage safety checks. */
export class AtomicTaskDocumentStore<T> {
  constructor(private readonly directory: string, private readonly parse: (value: unknown, sessionId: string) => T) {}
  private filename(sessionId: string): string {
    if (!validTaskSessionId(sessionId)) taskFailure('TASK_SESSION_INVALID')
    return join(this.directory, hash(sessionId) + '.json')
  }
  /** Reads do not create a directory or grant anything. */
  async read(sessionId: string): Promise<T | undefined> {
    const filename = this.filename(sessionId)
    try {
      const parent = await lstat(this.directory)
      if (!parent.isDirectory() || parent.isSymbolicLink()
        || (process.platform !== 'win32' && (parent.mode & 0o077) !== 0)) taskFailure('TASK_STATE_UNSAFE')
      const file = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
      try {
        const stat = await file.stat()
        if (!stat.isFile() || stat.nlink !== 1 || stat.size > MAX_BYTES
          || (process.platform !== 'win32' && (stat.mode & 0o077) !== 0)) taskFailure('TASK_STATE_UNSAFE')
        const bytes = Buffer.alloc(MAX_BYTES + 1)
        const { bytesRead } = await file.read(bytes, 0, bytes.length, 0)
        if (bytesRead > MAX_BYTES || bytesRead !== stat.size) taskFailure('TASK_STATE_INVALID')
        return this.parse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, bytesRead))), sessionId)
      } finally { await file.close() }
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
      if (error instanceof AdaptiveTaskError) throw error
      taskFailure('TASK_STATE_UNAVAILABLE')
    }
  }
  /** Lock, reread and atomically reserve before dispatch. A lost reply never refunds a request. */
  async update(sessionId: string, change: (current: T | undefined) => T | Promise<T>): Promise<T> {
    const filename = this.filename(sessionId)
    await mkdir(dirname(filename), { recursive: true, mode: 0o700 })
    const parent = await lstat(this.directory)
    if (!parent.isDirectory() || parent.isSymbolicLink()
      || (process.platform !== 'win32' && (parent.mode & 0o077) !== 0)) taskFailure('TASK_STATE_UNSAFE')
    return withFileLock(filename, async () => {
      const current = await this.read(sessionId)
      const next = this.parse(await change(current), sessionId)
      const text = JSON.stringify(next)
      if (Buffer.byteLength(text) > MAX_BYTES) taskFailure('TASK_STATE_TOO_LARGE')
      await writeFileAtomic(filename, text + '\n', { mode: 0o600, dirMode: 0o700 })
      const file = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW)
      try { await file.sync() } finally { await file.close() }
      // Ensure the replacement name is committed before a request reservation may leave this process.
      if (process.platform !== 'win32') {
        const directory = await open(this.directory, constants.O_RDONLY)
        try { await directory.sync() } finally { await directory.close() }
      }
      return structuredClone(next)
    })
  }
}
/** Phase 1 never accepts or silently resets a v2 ledger. */
export class AdaptiveTaskStore extends AtomicTaskDocumentStore<TaskDocument> {
  constructor(directory: string) { super(directory, parseTaskDocument) }
}
