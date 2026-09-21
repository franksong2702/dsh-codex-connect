/** Explicitly approved source snapshots for the opt-in Split experiment. No directory discovery. */
import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, open, realpath } from 'node:fs/promises'
import { isAbsolute, join, relative, sep } from 'node:path'

export const SPLIT_EVIDENCE_LIMITS = Object.freeze({ files: 16, fileBytes: 32_000, totalBytes: 128_000, reads: 24, readBytes: 16_000 })
export interface ApprovedSplitSource { readonly path: string; readonly sha256: string }
export interface SplitReference { readonly path: string; readonly sha256: string; readonly startLine: number; readonly endLine: number }
export interface SplitSourceView { readonly path: string; readonly sha256: string; readonly lines: number }
export interface SplitEvidence {
  readonly catalog: readonly SplitSourceView[]
  read(path: string, startLine: number, endLine: number): Readonly<SplitReference & { text: string }>
  observed(reference: SplitReference): boolean
}
const snapshots = new WeakSet<object>()
const digest = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex')
function fail(code: string): never { throw new Error(code) }

/** Relative source identities only; known private locations and credential formats are never evidence. */
export function validSplitSourcePath(path: unknown): path is string {
  if (typeof path !== 'string' || path.length === 0 || Buffer.byteLength(path) > 256 || /[\\\x00-\x1f\x7f:]/u.test(path)) return false
  const parts = path.split('/')
  if (parts.some(part => !part || part.startsWith('.') || /^(?:private|secrets?|credentials?|node_modules)$/iu.test(part))) return false
  const name = parts.at(-1)!
  if (/^(?:auth|credentials?|tokens?|id_rsa|id_ed25519)(?:\.|$)/iu.test(name) && !/\.(?:ts|tsx|js|mjs)$/u.test(name)) return false
  return /\.(?:ts|tsx|js|jsx|mjs|cjs|json|md|txt|ya?ml)$/u.test(name)
}
function inside(root: string, path: string): boolean {
  const suffix = relative(root, path)
  return suffix !== '' && !isAbsolute(suffix) && suffix !== '..' && !suffix.startsWith(`..${sep}`)
}
function secretLike(text: string): boolean {
  return /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----|\bsk-[A-Za-z0-9_-]{20,}|["'](?:access_token|refresh_token)["']\s*:\s*["'][^"']{20,}/u.test(text)
}

/**
 * Host-only approval boundary. The caller supplies exact relative paths AND reviewed content hashes.
 * Worker arguments never reach this function. Reject symlinks, hardlinks, special files and changed bytes.
 * Once fulfilled, all worker reads are from detached memory, not the live filesystem.
 */
async function loadApprovedSnapshot(root: string, approved: readonly ApprovedSplitSource[], signal: AbortSignal): Promise<SplitEvidence> {
  signal.throwIfAborted()
  if (!isAbsolute(root) || approved.length === 0 || approved.length > SPLIT_EVIDENCE_LIMITS.files) fail('SPLIT_EVIDENCE_SCOPE_INVALID')
  const manifest = approved.map(item => {
    if (!validSplitSourcePath(item.path) || !/^[a-f0-9]{64}$/u.test(item.sha256)) fail('SPLIT_EVIDENCE_SCOPE_INVALID')
    return { path: item.path, sha256: item.sha256 }
  })
  if (new Set(manifest.map(item => item.path.toLowerCase())).size !== manifest.length) fail('SPLIT_EVIDENCE_DUPLICATE')
  const canonicalRoot = await realpath(root)
  const files = new Map<string, { sha256: string; lines: readonly string[] }>()
  let total = 0
  for (const item of manifest) {
    signal.throwIfAborted()
    const target = join(canonicalRoot, item.path)
    if (!inside(canonicalRoot, target)) fail('SPLIT_EVIDENCE_SCOPE_INVALID')
    let current = canonicalRoot
    for (const part of item.path.split('/')) {
      current = join(current, part)
      const info = await lstat(current)
      if (info.isSymbolicLink()) fail('SPLIT_EVIDENCE_LINK_DENIED')
    }
    const handle = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
    try {
      const before = await handle.stat()
      if (!before.isFile() || before.nlink !== 1) fail('SPLIT_EVIDENCE_FILE_DENIED')
      if (before.size > SPLIT_EVIDENCE_LIMITS.fileBytes) fail('SPLIT_EVIDENCE_TOO_LARGE')
      const resolved = await realpath(target)
      if (resolved !== target || !inside(canonicalRoot, resolved)) fail('SPLIT_EVIDENCE_LINK_DENIED')
      const named = await lstat(target)
      if (named.dev !== before.dev || named.ino !== before.ino) fail('SPLIT_EVIDENCE_CHANGED')
      // One extra byte detects growth without an unbounded readFile allocation.
      const buffer = Buffer.alloc(SPLIT_EVIDENCE_LIMITS.fileBytes + 1)
      let count = 0
      while (count < buffer.length) {
        signal.throwIfAborted()
        const { bytesRead } = await handle.read(buffer, count, buffer.length - count, count)
        if (bytesRead === 0) break
        count += bytesRead
      }
      const after = await handle.stat()
      if (count > SPLIT_EVIDENCE_LIMITS.fileBytes || total + count > SPLIT_EVIDENCE_LIMITS.totalBytes) fail('SPLIT_EVIDENCE_TOO_LARGE')
      if (before.size !== count || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) fail('SPLIT_EVIDENCE_CHANGED')
      const bytes = buffer.subarray(0, count)
      if (digest(bytes) !== item.sha256) fail('SPLIT_EVIDENCE_CHANGED')
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
      if (text.includes('\0') || secretLike(text)) fail('SPLIT_EVIDENCE_CONTENT_DENIED')
      total += count
      files.set(item.path, { sha256: item.sha256, lines: Object.freeze(text.split('\n')) })
    } finally { await handle.close() }
  }
  signal.throwIfAborted()
  let reads = 0
  let returnedBytes = 0
  const observations: SplitReference[] = []
  const evidence: SplitEvidence = Object.freeze({
    catalog: Object.freeze([...files].map(([path, file]) => Object.freeze({ path, sha256: file.sha256, lines: file.lines.length }))),
    read(path: string, startLine: number, endLine: number) {
      signal.throwIfAborted()
      const file = files.get(path)
      if (!file || !Number.isSafeInteger(startLine) || !Number.isSafeInteger(endLine) || startLine < 1 || endLine < startLine || endLine > file.lines.length) fail('SPLIT_EVIDENCE_RANGE_DENIED')
      const text = file.lines.slice(startLine - 1, endLine).join('\n')
      const bytes = Buffer.byteLength(text)
      if (++reads > SPLIT_EVIDENCE_LIMITS.reads || bytes > SPLIT_EVIDENCE_LIMITS.readBytes || returnedBytes + bytes > SPLIT_EVIDENCE_LIMITS.totalBytes) fail('SPLIT_EVIDENCE_READ_BUDGET')
      returnedBytes += bytes
      const reference = Object.freeze({ path, sha256: file.sha256, startLine, endLine })
      observations.push(reference)
      return Object.freeze({ ...reference, text })
    },
    observed(reference: SplitReference) {
      return observations.some(item => item.path === reference.path && item.sha256 === reference.sha256
        && reference.startLine >= item.startLine && reference.endLine <= item.endLine && reference.startLine <= reference.endLine)
    },
  })
  snapshots.add(evidence)
  return evidence
}

/** Preserve stable evidence failure codes without leaking absolute filesystem paths from IO errors. */
export async function snapshotSplitEvidence(root: string, approved: readonly ApprovedSplitSource[], signal: AbortSignal): Promise<SplitEvidence> {
  try { return await loadApprovedSnapshot(root, approved, signal) }
  catch (error) {
    if (signal.aborted) throw signal.reason
    if (error instanceof Error && /^SPLIT_EVIDENCE_[A-Z_]+$/u.test(error.message)) throw error
    throw new Error('SPLIT_EVIDENCE_UNAVAILABLE')
  }
}

/** Nominal runtime check: model-authored JSON cannot manufacture a snapshot capability. */
export function isSplitEvidence(value: unknown): value is SplitEvidence {
  return typeof value === 'object' && value !== null && snapshots.has(value)
}
