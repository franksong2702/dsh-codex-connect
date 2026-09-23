/** Explicit host-approved text only. No path supplied by a child is ever opened. */
import { randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, open, realpath } from 'node:fs/promises'
import { isAbsolute, join, parse, relative, resolve, sep } from 'node:path'
import { ledgerHash, ledgerId, ledgerInteger } from './adaptive-task-delegation-contract.ts'
import { taskRecord } from './adaptive-task-contract.ts'
import { taskFailure, taskIdentity } from './adaptive-task-store.ts'

export const TASK_EVIDENCE_FILE_BYTES = 64 * 1024
export const TASK_EVIDENCE_TOTAL_BYTES = 256 * 1024
export interface TaskEvidenceSnapshot {
  version: 1
  manifest: string
  files: Array<{ id: string; digest: string; text: string }>
}
export interface TaskEvidenceReference { sourceId: string; start: number; end: number; digest: string }
export interface TaskFindings { summary: string; findings: Array<{ text: string; references: TaskEvidenceReference[] }> }
const exact = (value: unknown, keys: string): value is Record<string, unknown> => taskRecord(value)
  && Object.keys(value).sort().join(',') === keys.split(',').sort().join(',')
const boundedText = (value: unknown, max: number): value is string => typeof value === 'string'
  && value.trim().length > 0 && Buffer.byteLength(value) <= max && !value.includes('\0')
const same = (a: Awaited<ReturnType<typeof lstat>>, b: Awaited<ReturnType<typeof lstat>>): boolean =>
  a.dev === b.dev && a.ino === b.ino && a.mode === b.mode && a.nlink === b.nlink
  && a.size === b.size && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs

/** All existing components must be real directories; callers must use canonical absolute paths. */
export async function taskSafeDirectories(path: string): Promise<Array<{ path: string; dev: number; ino: number }>> {
  if (!isAbsolute(path) || resolve(path) !== path) taskFailure('TASK_EVIDENCE_PATH_DENIED')
  let cursor = parse(path).root
  const result = []
  for (const part of path.slice(cursor.length).split(sep).filter(Boolean)) {
    cursor = join(cursor, part)
    const stat = await lstat(cursor)
    if (!stat.isDirectory() || stat.isSymbolicLink()) taskFailure('TASK_EVIDENCE_PATH_DENIED')
    result.push({ path: cursor, dev: stat.dev, ino: stat.ino })
  }
  return result
}
function safeRelative(path: string): boolean {
  return path.length > 0 && path.length <= 4096 && !isAbsolute(path) && !path.includes('\\')
    && path.split('/').every(part => part !== '' && part !== '.' && part !== '..' && !part.startsWith('.')
      && !/(?:secret|credential|password|token|auth|config|private[-_]?key)/iu.test(part)
      && !/\.(?:pem|key|p12|pfx|keystore)$/iu.test(part) && !/^id_(?:rsa|dsa|ecdsa|ed25519)(?:\.|$)/iu.test(part))
}
async function readApproved(root: string, path: string): Promise<string> {
  if (!safeRelative(path)) taskFailure('TASK_EVIDENCE_PATH_DENIED')
  const filename = resolve(root, path)
  if (relative(root, filename) !== path) taskFailure('TASK_EVIDENCE_PATH_DENIED')
  const parents = await taskSafeDirectories(resolve(filename, '..'))
  const before = await lstat(filename)
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.size > TASK_EVIDENCE_FILE_BYTES) taskFailure('TASK_EVIDENCE_FILE_DENIED')
  const file = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  try {
    if (!same(before, await file.stat())) taskFailure('TASK_EVIDENCE_CHANGED')
    const bytes = Buffer.alloc(TASK_EVIDENCE_FILE_BYTES + 1)
    const { bytesRead } = await file.read(bytes, 0, bytes.length, 0)
    if (bytesRead !== before.size || bytesRead > TASK_EVIDENCE_FILE_BYTES
      || !same(before, await file.stat()) || !same(before, await lstat(filename))) taskFailure('TASK_EVIDENCE_CHANGED')
    for (const parent of parents) {
      const stat = await lstat(parent.path)
      if (!stat.isDirectory() || stat.isSymbolicLink() || stat.dev !== parent.dev || stat.ino !== parent.ino) taskFailure('TASK_EVIDENCE_CHANGED')
    }
    let text: string
    try { text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes.subarray(0, bytesRead)) }
    catch { taskFailure('TASK_EVIDENCE_NOT_TEXT') }
    if (text.includes('\0') || /[\x01-\x08\x0b\x0e-\x1f]/u.test(text)) taskFailure('TASK_EVIDENCE_NOT_TEXT')
    if (/-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/u.test(text)) taskFailure('TASK_EVIDENCE_FILE_DENIED')
    return text
  } finally { await file.close() }
}

/** Host-only approval object; the model receives IDs, never a constructor or file-access capability. */
export class TaskEvidenceManifest {
  readonly digest: string
  private constructor(private readonly root: string, private readonly entries: readonly { id: string; path: string }[]) {
    this.digest = taskIdentity(JSON.stringify({ root, entries }))
  }
  static async approve(root: string, paths: readonly string[]): Promise<TaskEvidenceManifest> {
    const input = [...paths]
    if (!isAbsolute(root) || resolve(root) !== root || await realpath(root) !== root
      || input.length === 0 || input.length > 32 || new Set(input).size !== input.length) taskFailure('TASK_EVIDENCE_MANIFEST_INVALID')
    await taskSafeDirectories(root)
    const entries = []
    let total = 0
    for (const path of input) {
      total += Buffer.byteLength(await readApproved(root, path))
      if (total > TASK_EVIDENCE_TOTAL_BYTES) taskFailure('TASK_EVIDENCE_TOO_LARGE')
      entries.push({ id: randomUUID(), path })
    }
    return new TaskEvidenceManifest(root, entries)
  }
  sources(): Array<{ id: string; path: string }> { return structuredClone([...this.entries]) }
  serialize(): { root: string; entries: Array<{ id: string; path: string }> } { return { root: this.root, entries: this.sources() } }
  /** Restores only a digest-bound artifact selected by the root ledger, never model-provided consent. */
  static restore(value: unknown, digest: string): TaskEvidenceManifest {
    if (!exact(value, 'root,entries') || typeof value.root !== 'string' || !isAbsolute(value.root) || resolve(value.root) !== value.root
      || !Array.isArray(value.entries) || value.entries.length === 0 || value.entries.length > 32
      || value.entries.some(item => !exact(item, 'id,path') || !ledgerId(item.id) || typeof item.path !== 'string' || !safeRelative(item.path))
      || new Set(value.entries.map(item => item.id)).size !== value.entries.length
      || new Set(value.entries.map(item => item.path)).size !== value.entries.length) taskFailure('TASK_EVIDENCE_MANIFEST_INVALID')
    const restored = new TaskEvidenceManifest(value.root, structuredClone(value.entries))
    if (restored.digest !== digest) taskFailure('TASK_EVIDENCE_MANIFEST_INVALID')
    return restored
  }
  async snapshot(ids: readonly string[]): Promise<TaskEvidenceSnapshot> {
    const selected = [...ids].sort()
    if (selected.length === 0 || selected.length > 32 || new Set(selected).size !== selected.length) taskFailure('TASK_EVIDENCE_SCOPE_DENIED')
    const files = []; let total = 0
    for (const id of selected) {
      const entry = this.entries.find(item => item.id === id)
      if (entry === undefined) taskFailure('TASK_EVIDENCE_SCOPE_DENIED')
      const text = await readApproved(this.root, entry.path)
      total += Buffer.byteLength(text)
      if (total > TASK_EVIDENCE_TOTAL_BYTES) taskFailure('TASK_EVIDENCE_TOO_LARGE')
      files.push({ id, digest: taskIdentity(text), text })
    }
    return { version: 1, manifest: this.digest, files }
  }
}
export function parseTaskEvidence(value: unknown): TaskEvidenceSnapshot {
  if (!exact(value, 'version,manifest,files') || value.version !== 1 || !ledgerHash(value.manifest)
    || !Array.isArray(value.files) || value.files.length === 0 || value.files.length > 32) taskFailure('TASK_EVIDENCE_INVALID')
  let total = 0
  for (const item of value.files) {
    if (!exact(item, 'id,digest,text') || !ledgerId(item.id) || !ledgerHash(item.digest) || typeof item.text !== 'string'
      || item.text.includes('\0') || Buffer.byteLength(item.text) > TASK_EVIDENCE_FILE_BYTES
      || taskIdentity(item.text) !== item.digest) taskFailure('TASK_EVIDENCE_INVALID')
    total += Buffer.byteLength(item.text)
  }
  if (total > TASK_EVIDENCE_TOTAL_BYTES || new Set(value.files.map(item => item.id)).size !== value.files.length) taskFailure('TASK_EVIDENCE_INVALID')
  return structuredClone(value) as unknown as TaskEvidenceSnapshot
}
export function parseTaskFindings(value: unknown): TaskFindings {
  if (!exact(value, 'summary,findings') || !boundedText(value.summary, 16 * 1024) || !Array.isArray(value.findings)
    || value.findings.length > 10 || Buffer.byteLength(JSON.stringify(value)) > 16 * 1024) taskFailure('TASK_FINDINGS_INVALID')
  for (const finding of value.findings) {
    if (!exact(finding, 'text,references') || !boundedText(finding.text, 16 * 1024) || !Array.isArray(finding.references)
      || finding.references.length === 0 || finding.references.length > 8) taskFailure('TASK_FINDINGS_INVALID')
    for (const ref of finding.references) if (!exact(ref, 'sourceId,start,end,digest') || !ledgerId(ref.sourceId)
      || !ledgerInteger(ref.start, 1) || !ledgerInteger(ref.end, Number(ref.start)) || !ledgerHash(ref.digest)) taskFailure('TASK_FINDINGS_INVALID')
  }
  return structuredClone(value) as unknown as TaskFindings
}
/** Observations are per run. Exactly one submission; any further action invalidates the unit. */
export class TaskEvidenceReader {
  private readonly snapshot: TaskEvidenceSnapshot
  private readonly observed = new Set<string>()
  private result: TaskFindings | undefined
  private failed = false
  constructor(snapshot: TaskEvidenceSnapshot) { this.snapshot = parseTaskEvidence(snapshot) }
  private check(): void {
    if (this.failed || this.result !== undefined) { this.failed = true; taskFailure('TASK_CHILD_EXTRA_ACTION') }
  }
  read(value: unknown): TaskEvidenceReference & { text: string } {
    this.check()
    if (!exact(value, 'sourceId,start,end') || !ledgerId(value.sourceId) || !ledgerInteger(value.start, 1)
      || !ledgerInteger(value.end, Number(value.start), Number(value.start) + 199)) taskFailure('TASK_EVIDENCE_RANGE_INVALID')
    const file = this.snapshot.files.find(item => item.id === value.sourceId)
    if (file === undefined) taskFailure('TASK_EVIDENCE_SCOPE_DENIED')
    const lines = file.text.split('\n')
    if (Number(value.end) > lines.length) taskFailure('TASK_EVIDENCE_RANGE_INVALID')
    const text = lines.slice(Number(value.start) - 1, Number(value.end)).join('\n')
    if (Buffer.byteLength(text) > 16 * 1024) taskFailure('TASK_EVIDENCE_RANGE_TOO_LARGE')
    const ref = { sourceId: file.id, start: Number(value.start), end: Number(value.end), digest: taskIdentity(text) }
    this.observed.add(JSON.stringify(ref))
    return { ...ref, text }
  }
  submit(value: unknown): { accepted: true } {
    this.check()
    try {
      const result = parseTaskFindings(value)
      for (const finding of result.findings) for (const ref of finding.references) {
        const normalized = { sourceId: ref.sourceId, start: ref.start, end: ref.end, digest: ref.digest }
        if (!this.observed.has(JSON.stringify(normalized))) taskFailure('TASK_FINDINGS_UNOBSERVED')
      }
      this.result = result
      return { accepted: true }
    } catch (error) { this.failed = true; throw error }
  }
  finish(): TaskFindings {
    if (this.failed || this.result === undefined) taskFailure('TASK_FINDINGS_MISSING_OR_INVALID')
    return structuredClone(this.result)
  }
}
