/** Compatibility migration for the private Codex search event emitted by Alpha 4.10. */

import { copyFile, open, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { constants as fsConstants } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { constants as zlibConstants, zstdCompressSync, zstdDecompressSync } from 'node:zlib'
import type { Context } from '@deepseek-ai/cordis'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import type { OpenAICodexSearchRequestRecord } from './search.ts'

/** Private event written by Alpha 4.10 before the provider stopped persisting it. */
export const OPENAI_CODEX_SEARCH_MODEL_REQUEST_EVENT = 'web/openai-codex-search-llm-request'
/** Backup suffix created beside every changed session artifact. */
export const OPENAI_CODEX_HISTORY_BACKUP_SUFFIX = '.pre-codex-search-history-migration'

const ZSTD_MAGIC = 0xfd2fb528
const CHECKSUM_OPTIONS = { params: { [zlibConstants.ZSTD_c_checksumFlag]: 1 } }

interface FrameRange {
  readonly start: number
  readonly end: number
}

export interface OpenAICodexHistoryMigrationOptions {
  /** Apply changes; omitted/false performs a read-only dry run. */
  readonly apply?: boolean
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

/**
 * Compatibility shell retained for Alpha 4.10 consumers. External plugins
 * cannot register required-on-read events in the Host persistence vocabulary.
 * @deprecated The provider now records searches through standard Tool events.
 */
export function installOpenAICodexSearchEvent(): void {}

/**
 * Compatibility shell retained without writing another private Session event.
 * @deprecated The provider now records searches through standard Tool events.
 */
export function recordOpenAICodexSearchRequest(
  _ctx: Context,
  _request: OpenAICodexSearchRequestRecord,
): void {}

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
  if (process.platform === 'win32') return
  const directory = await open(dirname(path), 'r')
  try {
    await directory.sync()
  } finally {
    await directory.close()
  }
}

async function migrateArtifact(path: string, apply: boolean): Promise<OpenAICodexHistoryMigrationFile | undefined> {
  const original = await readFile(path)
  const frames = scanZstdFrames(original)
  const output: Buffer[] = []
  let changedEvents = 0
  for (const frame of frames) {
    const rewritten = rewriteFrame(original.subarray(frame.start, frame.end))
    output.push(rewritten.frame)
    changedEvents += rewritten.changedEvents
  }
  if (changedEvents === 0) return undefined
  const migrated = Buffer.concat(output)
  validateMigration(original, migrated, changedEvents)
  if (!apply) return { path, changedEvents }

  const metadata = await stat(path)
  const backupPath = path + OPENAI_CODEX_HISTORY_BACKUP_SUFFIX
  try {
    await copyFile(path, backupPath, fsConstants.COPYFILE_EXCL)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    if (!(await readFile(backupPath)).equals(original)) {
      throw new Error(`migration backup already exists with different content: ${backupPath}`)
    }
  }
  const backupHandle = await open(backupPath, 'r')
  try {
    await backupHandle.sync()
  } finally {
    await backupHandle.close()
  }
  await syncParentDirectory(backupPath)

  const temporary = `${path}.codex-search-history-${process.pid}.tmp`
  try {
    await writeFile(temporary, migrated, { flag: 'wx', mode: metadata.mode & 0o777 })
    const handle = await open(temporary, 'r')
    try {
      await handle.sync()
    } finally {
      await handle.close()
    }
    if (!(await readFile(path)).equals(original)) throw new Error(`session changed while migration was prepared: ${path}`)
    await rename(temporary, path)
    await syncParentDirectory(path)
  } finally {
    await rm(temporary, { force: true })
  }
  return { path, changedEvents, backupPath }
}

/**
 * Mark the retired Alpha 4.10 search event ignorable in compressed JSONL logs.
 * The command is deliberately explicit: callers should stop DSH before apply.
 */
export async function migrateOpenAICodexSearchHistory(
  options: OpenAICodexHistoryMigrationOptions = {},
): Promise<OpenAICodexHistoryMigrationResult> {
  const root = resolve(options.root ?? join(resolveDshHome(options.dshHome), 'sessions'))
  const files: OpenAICodexHistoryMigrationFile[] = []
  for await (const path of sessionArtifacts(root)) {
    try {
      const result = await migrateArtifact(path, options.apply === true)
      if (result !== undefined) files.push(result)
    } catch (error) {
      const partial = options.apply === true && files.length > 0
        ? `; ${files.length} earlier file(s) were already repaired and remain safely backed up`
        : ''
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`Codex search history migration failed at ${path}${partial}: ${message}`, { cause: error })
    }
  }
  return {
    mode: options.apply === true ? 'apply' : 'dry-run',
    root,
    changedFiles: files.length,
    changedEvents: files.reduce((sum, file) => sum + file.changedEvents, 0),
    files,
  }
}
