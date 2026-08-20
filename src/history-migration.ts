/** Offline compatibility migration for the private Codex search event emitted by Alpha 4.10. */

import { randomBytes } from 'node:crypto'
import { constants as fsConstants } from 'node:fs'
import type { BigIntStats } from 'node:fs'
import { link, open, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { constants as zlibConstants, zstdCompressSync, zstdDecompressSync } from 'node:zlib'
import { withFileLock } from '@deepseek-ai/dsh-atomic-write'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'

/** Private event written by Alpha 4.10 before the provider stopped persisting it. */
export const OPENAI_CODEX_SEARCH_MODEL_REQUEST_EVENT = 'web/openai-codex-search-llm-request'
/** Backup suffix created beside every changed session artifact. */
export const OPENAI_CODEX_HISTORY_BACKUP_SUFFIX = '.pre-codex-search-history-migration'

const ZSTD_MAGIC = 0xfd2fb528
const CHECKSUM_OPTIONS = { params: { [zlibConstants.ZSTD_c_checksumFlag]: 1 } }
const STABLE_READ_ATTEMPTS = 3

interface FrameRange {
  readonly start: number
  readonly end: number
}

export interface OpenAICodexHistoryMigrationOptions {
  /** Apply changes; omitted/false performs a read-only dry run. */
  readonly apply?: boolean
  /** Required acknowledgement that every DSH writer using this root is stopped. */
  readonly confirmStopped?: boolean
  /** Explicit JSONL persistence root. Defaults to `<DSH_HOME>/sessions`. */
  readonly root?: string
  /** Optional Harness home override used only when `root` is omitted. */
  readonly dshHome?: string
}

export interface OpenAICodexHistoryMigrationFile {
  readonly path: string
  readonly changedEvents: number
  readonly backupPath?: string
}

export interface OpenAICodexHistoryMigrationResult {
  readonly mode: 'apply' | 'dry-run'
  readonly root: string
  readonly changedFiles: number
  readonly changedEvents: number
  readonly files: readonly OpenAICodexHistoryMigrationFile[]
}

function scanZstdFrames(buffer: Buffer): readonly FrameRange[] {
  const frames: FrameRange[] = []
  let offset = 0
  while (offset < buffer.length) {
    const start = offset
    if (buffer.length - offset < 4) throw new Error(`incomplete Zstandard frame magic at byte ${offset}`)
    if (buffer.readUInt32LE(offset) !== ZSTD_MAGIC) throw new Error(`invalid Zstandard frame magic at byte ${offset}`)
    offset += 4
    if (offset === buffer.length) throw new Error(`incomplete Zstandard frame descriptor at byte ${offset}`)
    const descriptor = buffer.readUInt8(offset)
    offset += 1
    if ((descriptor & 24) !== 0) throw new Error(`reserved Zstandard frame-header bit at byte ${offset - 1}`)
    const contentSizeFlag = descriptor >>> 6
    const singleSegment = (descriptor & 32) !== 0
    const checksum = (descriptor & 4) !== 0
    const dictionaryFlag = descriptor & 3
    const dictionaryBytes = dictionaryFlag === 3 ? 4 : dictionaryFlag
    const contentSizeBytes = contentSizeFlag === 0 ? (singleSegment ? 1 : 0) : 1 << contentSizeFlag
    const remainingHeaderBytes = (singleSegment ? 0 : 1) + dictionaryBytes + contentSizeBytes
    if (buffer.length - offset < remainingHeaderBytes) throw new Error(`incomplete Zstandard frame header at byte ${start}`)
    offset += remainingHeaderBytes
    for (;;) {
      if (buffer.length - offset < 3) throw new Error(`incomplete Zstandard block header at byte ${offset}`)
      const blockHeader = buffer.readUIntLE(offset, 3)
      offset += 3
      const lastBlock = (blockHeader & 1) !== 0
      const blockType = (blockHeader >>> 1) & 3
      const blockSize = blockHeader >>> 3
      if (blockType === 3) throw new Error(`reserved Zstandard block type at byte ${offset - 3}`)
      const payloadBytes = blockType === 1 ? 1 : blockSize
      if (buffer.length - offset < payloadBytes) throw new Error(`incomplete Zstandard block payload at byte ${offset}`)
      offset += payloadBytes
      if (lastBlock) break
    }
    if (checksum) {
      if (buffer.length - offset < 4) throw new Error(`incomplete Zstandard checksum at byte ${offset}`)
      offset += 4
    }
    frames.push({ start, end: offset })
  }
  return frames
}

function markLegacyEventIgnorable(line: string): string | undefined {
  let record: unknown
  try {
    record = JSON.parse(line)
  } catch {
    return undefined
  }
  if (typeof record !== 'object' || record === null || Array.isArray(record)) return undefined
  const event = record as Record<string, unknown>
  if (event['type'] !== OPENAI_CODEX_SEARCH_MODEL_REQUEST_EVENT || event['ignorable'] === true) return undefined
  if (event['ignorable'] !== undefined) {
    throw new Error(`legacy Codex search event seq ${String(event['seq'])} has an unexpected ignorable value`)
  }
  let objectEnd = line.length - 1
  while (objectEnd >= 0 && /\s/u.test(line[objectEnd] ?? '')) objectEnd -= 1
  if (line[objectEnd] !== '}') throw new Error(`legacy Codex search event seq ${String(event['seq'])} is not a JSON object`)
  return `${line.slice(0, objectEnd)},"ignorable":true${line.slice(objectEnd)}`
}

function rewriteFrame(frame: Buffer): { readonly frame: Buffer, readonly changedEvents: number } {
  const lines = zstdDecompressSync(frame).toString('utf8').split('\n')
  let changedEvents = 0
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (line === undefined || line.length === 0) continue
    const migrated = markLegacyEventIgnorable(line)
    if (migrated === undefined) continue
    lines[index] = migrated
    changedEvents += 1
  }
  if (changedEvents === 0) return { frame, changedEvents }
  return {
    frame: zstdCompressSync(Buffer.from(lines.join('\n')), CHECKSUM_OPTIONS),
    changedEvents,
  }
}

function validateMigration(original: Buffer, migrated: Buffer, expectedChanges: number): void {
  const beforeFrames = scanZstdFrames(original)
  const afterFrames = scanZstdFrames(migrated)
  if (beforeFrames.length !== afterFrames.length) throw new Error('Zstandard frame count changed during migration')
  let changes = 0
  for (let index = 0; index < beforeFrames.length; index += 1) {
    const beforeRange = beforeFrames[index]
    const afterRange = afterFrames[index]
    if (beforeRange === undefined || afterRange === undefined) throw new Error('missing Zstandard frame during validation')
    const beforeLines = zstdDecompressSync(original.subarray(beforeRange.start, beforeRange.end)).toString('utf8').split('\n')
    const afterLines = zstdDecompressSync(migrated.subarray(afterRange.start, afterRange.end)).toString('utf8').split('\n')
    if (beforeLines.length !== afterLines.length) throw new Error(`logical line count changed in frame ${index}`)
    for (let line = 0; line < beforeLines.length; line += 1) {
      if (beforeLines[line] === afterLines[line]) continue
      const expected = markLegacyEventIgnorable(beforeLines[line] ?? '')
      if (expected === undefined) throw new Error(`non-target record changed in frame ${index}, line ${line + 1}`)
      if (afterLines[line] !== expected) {
        throw new Error(`legacy event changed beyond its ignorable marker in frame ${index}, line ${line + 1}`)
      }
      changes += 1
    }
  }
  if (changes !== expectedChanges) throw new Error(`validated ${changes} changes, expected ${expectedChanges}`)
}

function revision(metadata: BigIntStats): string {
  return [metadata.dev, metadata.ino, metadata.size, metadata.mtimeNs, metadata.ctimeNs].join(':')
}

async function readStableFile(path: string): Promise<Buffer> {
  for (let attempt = 0; attempt < STABLE_READ_ATTEMPTS; attempt += 1) {
    const before = revision(await stat(path, { bigint: true }))
    const content = await readFile(path)
    const after = revision(await stat(path, { bigint: true }))
    if (before === after) return content
  }
  throw new Error(`session kept changing during ${STABLE_READ_ATTEMPTS} stable-read attempts: ${path}`)
}

function renderMigration(original: Buffer): { readonly migrated: Buffer, readonly changedEvents: number } {
  const frames = scanZstdFrames(original)
  const output: Buffer[] = []
  let changedEvents = 0
  for (const frame of frames) {
    const rewritten = rewriteFrame(original.subarray(frame.start, frame.end))
    output.push(rewritten.frame)
    changedEvents += rewritten.changedEvents
  }
  const migrated = Buffer.concat(output)
  if (changedEvents > 0) validateMigration(original, migrated, changedEvents)
  return { migrated, changedEvents }
}

async function *sessionArtifacts(root: string): AsyncGenerator<string> {
  const pending = [root]
  while (pending.length > 0) {
    const current = pending.pop()
    if (current === undefined) continue
    let entries
    try {
      entries = await readdir(current, { withFileTypes: true })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue
      throw error
    }
    for (const entry of entries) {
      const path = join(current, entry.name)
      if (entry.isDirectory()) pending.push(path)
      else if (entry.isFile() && entry.name === 'session.jsonl.zstd') yield path
    }
  }
}

async function syncParentDirectory(path: string): Promise<void> {
  const directory = await open(dirname(path), 'r')
  try {
    await directory.sync()
  } finally {
    await directory.close()
  }
}

async function migrateArtifact(path: string, apply: boolean): Promise<OpenAICodexHistoryMigrationFile | undefined> {
  if (!apply) {
    const original = await readStableFile(path)
    const { changedEvents } = renderMigration(original)
    return changedEvents === 0 ? undefined : { path, changedEvents }
  }

  return withFileLock(path, async () => {
    const original = await readStableFile(path)
    const { migrated, changedEvents } = renderMigration(original)
    if (changedEvents === 0) return undefined

    const metadata = await stat(path)
    const sourceIdentity = await stat(path, { bigint: true })
    const backupPath = path + OPENAI_CODEX_HISTORY_BACKUP_SUFFIX
    // A hard-link backup keeps the replaced inode reachable. If an already-open
    // writer violates the offline precondition, its late bytes remain recoverable
    // from the backup instead of disappearing with the renamed-over inode.
    try {
      await link(path, backupPath)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    }
    const backupHandle = await open(backupPath, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW)
    try {
      const backupIdentity = await backupHandle.stat({ bigint: true })
      if (!backupIdentity.isFile()) {
        throw new Error(`migration backup path is not a regular file: ${backupPath}`)
      }
      if (backupIdentity.dev !== sourceIdentity.dev || backupIdentity.ino !== sourceIdentity.ino) {
        throw new Error(`migration backup does not reference the current Session artifact: ${backupPath}`)
      }
      if (!(await backupHandle.readFile()).equals(original)) {
        throw new Error(`migration backup already exists with different content: ${backupPath}`)
      }
      await backupHandle.sync()
    } finally {
      await backupHandle.close()
    }
    await syncParentDirectory(backupPath)

    const temporary = `${path}.codex-search-history-${randomBytes(6).toString('hex')}.tmp`
    try {
      await writeFile(temporary, migrated, { flag: 'wx', mode: metadata.mode & 0o777 })
      const handle = await open(temporary, 'r')
      try {
        await handle.sync()
      } finally {
        await handle.close()
      }
      if (!(await readStableFile(path)).equals(original)) {
        throw new Error(`session changed while migration was prepared: ${path}`)
      }
      await rename(temporary, path)
      try {
        await syncParentDirectory(path)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        throw new Error(`session was repaired and backed up at ${backupPath}, but synchronizing its directory failed: ${message}`, { cause: error })
      }
      if (!(await readStableFile(backupPath)).equals(original)) {
        throw new Error(`a Session writer changed the preserved backup during migration; stop DSH and restore ${backupPath}`)
      }
    } finally {
      await rm(temporary, { force: true })
    }
    return { path, changedEvents, backupPath }
  })
}

/**
 * Mark the retired Alpha 4.10 search event ignorable in compressed JSONL logs.
 * Applying is an offline maintenance operation and fails closed without the
 * caller's explicit acknowledgement that all DSH writers are stopped.
 */
export async function migrateOpenAICodexSearchHistory(
  options: OpenAICodexHistoryMigrationOptions = {},
): Promise<OpenAICodexHistoryMigrationResult> {
  const apply = options.apply === true
  if (apply && options.confirmStopped !== true) {
    throw new Error('refusing to rewrite Session history without confirmStopped=true after stopping every DSH writer')
  }
  if (apply && process.platform === 'win32') {
    throw new Error('applying this history migration is not supported on Windows; dry-run only')
  }

  const root = resolve(options.root ?? join(resolveDshHome(options.dshHome), 'sessions'))
  const files: OpenAICodexHistoryMigrationFile[] = []
  for await (const path of sessionArtifacts(root)) {
    try {
      const result = await migrateArtifact(path, apply)
      if (result !== undefined) files.push(result)
    } catch (error) {
      const partial = apply && files.length > 0
        ? `; ${files.length} earlier file(s) were already repaired and remain backed up`
        : ''
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`Codex search history migration failed at ${path}${partial}: ${message}`, { cause: error })
    }
  }
  return {
    mode: apply ? 'apply' : 'dry-run',
    root,
    changedFiles: files.length,
    changedEvents: files.reduce((sum, file) => sum + file.changedEvents, 0),
    files,
  }
}
