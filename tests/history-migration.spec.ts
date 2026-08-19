import { constants as zlibConstants, zstdCompressSync, zstdDecompressSync } from 'node:zlib'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  installOpenAICodexSearchEvent,
  migrateOpenAICodexSearchHistory,
  OPENAI_CODEX_HISTORY_BACKUP_SUFFIX,
  OPENAI_CODEX_SEARCH_MODEL_REQUEST_EVENT,
  recordOpenAICodexSearchRequest,
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

afterEach(async () => {
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

describe('legacy Codex search history migration', () => {
  it('dry-runs, backs up, repairs, and remains idempotent across concatenated frames', async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-codex-history-'))
    const directory = join(root, '--fixture--', 'session-fixture')
    await mkdir(directory, { recursive: true })
    const path = join(directory, 'session.jsonl.zstd')
    const header = { type: 'session', version: 0, id: 'session-fixture', createdAt: 1, delegationDepth: 0 }
    const legacyLine = `{"type":"${OPENAI_CODEX_SEARCH_MODEL_REQUEST_EVENT}","seq":9007199254740993,"time":-0,"data":{"escaped":"\\u0061"}}`
    const ordinary = { type: 'turn/end', seq: 1, time: 3, data: { reason: 'complete' } }
    const original = Buffer.concat([
      frame(`${JSON.stringify(header)}\n`),
      frame(`${legacyLine}\n${JSON.stringify(ordinary)}\n`),
    ])
    await writeFile(path, original)

    await expect(migrateOpenAICodexSearchHistory({ root })).resolves.toMatchObject({
      mode: 'dry-run',
      changedFiles: 1,
      changedEvents: 1,
      files: [{ path, changedEvents: 1 }],
    })
    await expect(readFile(path)).resolves.toEqual(original)

    await expect(migrateOpenAICodexSearchHistory({ root, apply: true })).resolves.toMatchObject({
      mode: 'apply',
      changedFiles: 1,
      changedEvents: 1,
      files: [{ path, changedEvents: 1, backupPath: path + OPENAI_CODEX_HISTORY_BACKUP_SUFFIX }],
    })
    await expect(readFile(path + OPENAI_CODEX_HISTORY_BACKUP_SUFFIX)).resolves.toEqual(original)
    const migrated = await readFile(path)
    const decoded = decodeFrames(migrated)
    expect(decoded).toHaveLength(2)
    expect(JSON.parse(decoded[0]?.trim() ?? 'null')).toEqual(header)
    const migratedEventFrame = decoded[1] ?? ''
    expect(migratedEventFrame).toBe(`${legacyLine.slice(0, -1)},"ignorable":true}\n${JSON.stringify(ordinary)}\n`)
    expect(JSON.parse(migratedEventFrame.split('\n')[0] ?? 'null')).toMatchObject({
      type: OPENAI_CODEX_SEARCH_MODEL_REQUEST_EVENT,
      ignorable: true,
    })

    await expect(migrateOpenAICodexSearchHistory({ root, apply: true })).resolves.toMatchObject({
      mode: 'apply',
      changedFiles: 0,
      changedEvents: 0,
      files: [],
    })
  })

  it('refuses a torn compressed artifact without changing or backing it up', async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-codex-history-torn-'))
    const directory = join(root, '--fixture--', 'session-torn')
    await mkdir(directory, { recursive: true })
    const path = join(directory, 'session.jsonl.zstd')
    const complete = frame(`{"type":"session","version":0,"id":"session-torn","createdAt":1,"delegationDepth":0}\n`)
    const torn = complete.subarray(0, -1)
    await writeFile(path, torn)

    await expect(migrateOpenAICodexSearchHistory({ root, apply: true }))
      .rejects.toThrow(`Codex search history migration failed at ${path}`)
    await expect(readFile(path)).resolves.toEqual(torn)
    await expect(readFile(path + OPENAI_CODEX_HISTORY_BACKUP_SUFFIX)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('keeps the removed Alpha 4.10 event helpers as non-writing compatibility shells', () => {
    const append = vi.fn()
    installOpenAICodexSearchEvent()
    recordOpenAICodexSearchRequest({
      get: () => ({ currentInitiator: () => ({ session: { append } }) }),
    } as never, {
      endpoint: 'https://chatgpt.com/backend-api/codex/alpha/search',
      body: {
        id: 'fixture',
        model: 'gpt-search',
        input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: 'fixture' }] }],
        commands: { search_query: [{ q: 'fixture' }] },
        settings: { search_context_size: 'medium', allowed_callers: ['direct'], external_web_access: true },
        max_output_tokens: 100,
      },
    })
    expect(append).not.toHaveBeenCalled()
  })
})
