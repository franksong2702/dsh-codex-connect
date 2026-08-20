import { constants as zlibConstants, zstdCompressSync, zstdDecompressSync } from 'node:zlib'
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  migrateOpenAICodexSearchHistory,
  OPENAI_CODEX_HISTORY_BACKUP_SUFFIX,
  OPENAI_CODEX_SEARCH_MODEL_REQUEST_EVENT,
} from '../src/history-migration.ts'

const CHECKSUM_OPTIONS = { params: { [zlibConstants.ZSTD_c_checksumFlag]: 1 } }
const ZSTD_MAGIC = 0xfd2fb528
let root: string | undefined

function frame(text: string): Buffer {
  return zstdCompressSync(Buffer.from(text), CHECKSUM_OPTIONS)
}

function decodeFrames(buffer: Buffer): string[] {
  const frames: string[] = []
  let offset = 0
  while (offset < buffer.length) {
    const start = offset
    expect(buffer.readUInt32LE(offset)).toBe(ZSTD_MAGIC)
    offset += 4
    const descriptor = buffer.readUInt8(offset)
    offset += 1
    const contentSizeFlag = descriptor >>> 6
    const singleSegment = (descriptor & 32) !== 0
    const checksum = (descriptor & 4) !== 0
    const dictionaryFlag = descriptor & 3
    offset += (singleSegment ? 0 : 1)
      + (dictionaryFlag === 3 ? 4 : dictionaryFlag)
      + (contentSizeFlag === 0 ? (singleSegment ? 1 : 0) : 1 << contentSizeFlag)
    for (;;) {
      const blockHeader = buffer.readUIntLE(offset, 3)
      offset += 3
      const lastBlock = (blockHeader & 1) !== 0
      const blockType = (blockHeader >>> 1) & 3
      const blockSize = blockHeader >>> 3
      offset += blockType === 1 ? 1 : blockSize
      if (lastBlock) break
    }
    if (checksum) offset += 4
    frames.push(zstdDecompressSync(buffer.subarray(start, offset)).toString('utf8'))
  }
  return frames
}

async function createLegacyArtifact(name: string): Promise<{ path: string, original: Buffer, legacyLine: string, ordinaryLine: string }> {
  if (root === undefined) root = await mkdtemp(join(tmpdir(), 'dsh-codex-history-'))
  const directory = join(root, '--fixture--', name)
  await mkdir(directory, { recursive: true })
  const path = join(directory, 'session.jsonl.zstd')
  const header = JSON.stringify({ type: 'session', version: 0, id: name, createdAt: 1, delegationDepth: 0 })
  const legacyLine = `{"type":"${OPENAI_CODEX_SEARCH_MODEL_REQUEST_EVENT}","seq":9007199254740993,"time":-0,"data":{"escaped":"\\u0061"}}`
  const ordinaryLine = JSON.stringify({ type: 'turn/end', seq: 1, time: 3, data: { reason: 'complete' } })
  const original = Buffer.concat([frame(`${header}\n`), frame(`${legacyLine}\n${ordinaryLine}\n`)])
  await writeFile(path, original)
  return { path, original, legacyLine, ordinaryLine }
}

function currentRoot(): string {
  if (root === undefined) throw new Error('fixture root was not initialized')
  return root
}

afterEach(async () => {
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

describe('legacy Codex search history migration', () => {
  it('dry-runs, backs up, repairs, and remains idempotent across concatenated frames', async () => {
    const artifact = await createLegacyArtifact('session-fixture')

    await expect(migrateOpenAICodexSearchHistory({ root: currentRoot() })).resolves.toMatchObject({
      mode: 'dry-run',
      changedFiles: 1,
      changedEvents: 1,
      files: [{ path: artifact.path, changedEvents: 1 }],
    })
    await expect(readFile(artifact.path)).resolves.toEqual(artifact.original)

    await expect(migrateOpenAICodexSearchHistory({ root: currentRoot(), apply: true, confirmStopped: true })).resolves.toMatchObject({
      mode: 'apply',
      changedFiles: 1,
      changedEvents: 1,
      files: [{ path: artifact.path, changedEvents: 1, backupPath: artifact.path + OPENAI_CODEX_HISTORY_BACKUP_SUFFIX }],
    })
    await expect(readFile(artifact.path + OPENAI_CODEX_HISTORY_BACKUP_SUFFIX)).resolves.toEqual(artifact.original)
    const migratedFrames = decodeFrames(await readFile(artifact.path))
    expect(migratedFrames).toHaveLength(2)
    expect(migratedFrames[0]).toBe(`${JSON.stringify({ type: 'session', version: 0, id: 'session-fixture', createdAt: 1, delegationDepth: 0 })}\n`)
    expect(migratedFrames[1]).toBe(`${artifact.legacyLine.slice(0, -1)},"ignorable":true}\n${artifact.ordinaryLine}\n`)
    expect(JSON.parse(migratedFrames[1]?.split('\n')[0] ?? 'null')).toMatchObject({
      type: OPENAI_CODEX_SEARCH_MODEL_REQUEST_EVENT,
      ignorable: true,
    })

    await expect(migrateOpenAICodexSearchHistory({ root: currentRoot(), apply: true, confirmStopped: true })).resolves.toMatchObject({
      mode: 'apply',
      changedFiles: 0,
      changedEvents: 0,
      files: [],
    })
  })

  it('refuses apply without explicit stopped-writer confirmation', async () => {
    const artifact = await createLegacyArtifact('session-unconfirmed')

    await expect(migrateOpenAICodexSearchHistory({ root: currentRoot(), apply: true })).rejects.toThrow('confirmStopped=true')
    await expect(readFile(artifact.path)).resolves.toEqual(artifact.original)
    await expect(readFile(artifact.path + OPENAI_CODEX_HISTORY_BACKUP_SUFFIX)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('refuses a torn compressed artifact without changing or backing it up', async () => {
    if (root === undefined) root = await mkdtemp(join(tmpdir(), 'dsh-codex-history-torn-'))
    const directory = join(root, '--fixture--', 'session-torn')
    await mkdir(directory, { recursive: true })
    const path = join(directory, 'session.jsonl.zstd')
    const complete = frame('{"type":"session","version":0,"id":"session-torn","createdAt":1,"delegationDepth":0}\n')
    const torn = complete.subarray(0, -1)
    await writeFile(path, torn)

    await expect(migrateOpenAICodexSearchHistory({ root: currentRoot(), apply: true, confirmStopped: true }))
      .rejects.toThrow(`Codex search history migration failed at ${path}`)
    await expect(readFile(path)).resolves.toEqual(torn)
    await expect(readFile(path + OPENAI_CODEX_HISTORY_BACKUP_SUFFIX)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it.skipIf(process.platform === 'win32')('refuses to follow a planted backup symlink', async () => {
    const artifact = await createLegacyArtifact('session-symlink')
    const outside = join(currentRoot(), 'outside-backup')
    await writeFile(outside, artifact.original)
    await symlink(outside, artifact.path + OPENAI_CODEX_HISTORY_BACKUP_SUFFIX)

    await expect(migrateOpenAICodexSearchHistory({
      root: currentRoot(),
      apply: true,
      confirmStopped: true,
    })).rejects.toThrow(`Codex search history migration failed at ${artifact.path}`)
    await expect(readFile(artifact.path)).resolves.toEqual(artifact.original)
    await expect(readFile(outside)).resolves.toEqual(artifact.original)
  })

  it('refuses a same-content backup that is not linked to the current artifact', async () => {
    const artifact = await createLegacyArtifact('session-detached-backup')
    await writeFile(artifact.path + OPENAI_CODEX_HISTORY_BACKUP_SUFFIX, artifact.original)

    await expect(migrateOpenAICodexSearchHistory({
      root: currentRoot(),
      apply: true,
      confirmStopped: true,
    })).rejects.toThrow('backup does not reference the current Session artifact')
    await expect(readFile(artifact.path)).resolves.toEqual(artifact.original)
  })

  it('serializes concurrent apply calls with one lock and one actual modification', async () => {
    const artifact = await createLegacyArtifact('session-concurrent')

    const results = await Promise.all([
      migrateOpenAICodexSearchHistory({ root: currentRoot(), apply: true, confirmStopped: true }),
      migrateOpenAICodexSearchHistory({ root: currentRoot(), apply: true, confirmStopped: true }),
    ])
    expect(results.map(result => result.changedEvents).sort()).toEqual([0, 1])
    expect(results.map(result => result.changedFiles).sort()).toEqual([0, 1])
    await expect(readFile(artifact.path + OPENAI_CODEX_HISTORY_BACKUP_SUFFIX)).resolves.toEqual(artifact.original)
    const migrated = (await decodeFrames(await readFile(artifact.path))).join('')
    expect(migrated.match(/"ignorable":true/gu)).toHaveLength(1)
  })

  it('fails closed for apply on Windows while retaining dry-run support', async () => {
    const artifact = await createLegacyArtifact('session-windows')
    const platform = vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
    try {
      await expect(migrateOpenAICodexSearchHistory({ root: currentRoot(), apply: true, confirmStopped: true }))
        .rejects.toThrow('not supported on Windows; dry-run only')
      await expect(readFile(artifact.path)).resolves.toEqual(artifact.original)
      await expect(readFile(artifact.path + OPENAI_CODEX_HISTORY_BACKUP_SUFFIX)).rejects.toMatchObject({ code: 'ENOENT' })
      await expect(migrateOpenAICodexSearchHistory({ root: currentRoot() })).resolves.toMatchObject({ mode: 'dry-run', changedFiles: 1, changedEvents: 1 })
    } finally {
      platform.mockRestore()
    }
  })
})
