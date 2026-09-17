import { expect, it } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { zstdCompressSync, zstdDecompressSync } from 'node:zlib'
import { createSessionFormatCatalog } from '@deepseek-ai/dsh-session-format'
import { assertReleasedPayloadSemantics, releasedV0SessionFormatCodec, releasedV1SessionFormatCodec, sessionFormatV0ToV1 } from '@deepseek-ai/dsh-session-format-v0-to-v1'
import { releasedV2SessionFormatCodec, sessionFormatV1ToV2 } from '@deepseek-ai/dsh-session-format-v1-to-v2'
import { assertReleasedV3Header, releasedV3SessionFormatCodec, restoreReleasedV3Artifact, sessionFormatV2ToV3 } from '@deepseek-ai/dsh-session-format-v2-to-v3'
import { repairAstraHistory, repairAstraHistoryFile } from '../src/astra-history-repair.ts'
import { scanZstdFrames } from '../src/history-migration.ts'
import { ASTRA_REASONING_SOURCE, createReasoningUpdateMessage, readReasoningUpdate, readReasoningSelectionOrdinal } from '../src/reasoning-update.ts'

const update = { version: 1 as const, sessionId: 'astra-history-fixture', baseEffort: 'low' as const, previousEffort: 'low' as const, effort: 'high' as const }
const notice = () => createReasoningUpdateMessage(update)
const legacy = () => ({ ...structuredClone(notice()), source: {
  kind: 'plugin' as const, plugin: 'dsh-codex-connect', form: 'notice' as const,
  summary: 'Approved Astra reasoning: low → high', reasoningUpdate: { ...update },
} })
const header = { type: 'session', version: 0, id: update.sessionId, createdAt: 1, cwd: '/fixture', delegationDepth: 0 }
const rows = () => {
  const message = legacy()
  return [header, { type: 'agent/inbox/spliced', seq: 0, time: 1, data: { target: 'next-step', start: 0, inserted: [message] } },
    { type: 'user/message', seq: 1, time: 2, data: message, surfaceOp: 'append' }]
}
const encode = (values: unknown[]) => values.map(value => JSON.stringify(value)).join('\n') + '\n'

const vocabulary = new Set(['agent/inbox/spliced', 'user/message', 'model/selection', 'turn/start', 'step/start', 'system/message'])
const catalog = createSessionFormatCatalog({
  currentVersion: 3,
  codecs: [releasedV0SessionFormatCodec, releasedV1SessionFormatCodec, releasedV2SessionFormatCodec, releasedV3SessionFormatCodec],
  migrations: [sessionFormatV0ToV1, sessionFormatV1ToV2, sessionFormatV2ToV3],
  currentEncoder: releasedV3SessionFormatCodec,
  restoreCurrent: artifact => restoreReleasedV3Artifact(artifact, vocabulary),
  restoreTransformedCurrent: artifact => restoreReleasedV3Artifact(artifact, vocabulary),
  restoreCurrentHeader: header => { assertReleasedV3Header(header); return header },
})
const restore = (jsonl: string) => {
  const values = jsonl.trimEnd().split('\n').map(line => JSON.parse(line))
  const reader = catalog.createRestore(values[0], { recovery: 'strict', validation: 'current' })
  values.slice(1).forEach(value => reader.decodeRow(value))
  return reader.finish()
}

it('completes all three actual migration edges, not only the first payload validator', () => {
  const withStep = (values: unknown[]) => [header,
    { type: 'turn/start', seq: 0, time: 1, data: { turn: 1 } },
    { type: 'step/start', seq: 1, time: 1, data: { turn: 1, step: 1 } },
    ...values.slice(1).map((value, index) => ({ ...(value as object), seq: index + 2 })),
  ]
  const original = encode(withStep(rows()))
  expect(() => restore(original)).toThrow(/reasoningUpdate/)
  const repaired = repairAstraHistory(original)
  const artifact = restore(repaired.jsonl)
  expect(artifact.header.version).toBe(3)
  const messages = artifact.events.filter(event => event.type === 'user/message')
  expect(messages).toHaveLength(1)
  expect(readReasoningUpdate(messages[0]!.data as never)).toEqual(update)
  const fresh = [{ ...header }, { type: 'user/message', seq: 0, time: 1, data: notice(), surfaceOp: 'append' }]
  expect(restore(encode(withStep(fresh))).header.version).toBe(3)
  const manual = legacy()
  const selected = withStep([header,
    { type: 'model/selection', time: 1, data: { provider: 'openai-codex', model: 'gpt-6-astra', reasoningEffort: 'high' } },
    { type: 'user/message', time: 2, surfaceOp: 'append', data: { ...manual, source: { ...manual.source, reasoningSelectionSeq: 2 } } },
  ])
  const migrated = restore(repairAstraHistory(encode(selected)).jsonl)
  const selection = migrated.events.find(event => event.type === 'model/selection')!
  expect(selection.seq).not.toBe(2)
  expect(readReasoningSelectionOrdinal(migrated.events.find(event => event.type === 'user/message')!.data as never)).toBe(1)
})

it('new Astra messages pass the actual released-v0 migrator and preserve the approval', () => {
  const message = notice()
  expect(message.source).toMatchObject({ kind: 'plugin', form: 'snapshot' })
  expect(() => assertReleasedPayloadSemantics({ type: 'user/message', seq: 0, time: 1, data: message } as never, 0)).not.toThrow()
  expect(readReasoningUpdate(message)).toEqual(update)
})

it('repairs both persisted occurrences without dropping data or changing order, IDs, or text', () => {
  const original = rows()
  expect(() => assertReleasedPayloadSemantics(original[1] as never, 0)).toThrow(/reasoningUpdate/)
  const result = repairAstraHistory(encode(original))
  expect(result.changed).toBe(2)
  const repaired = result.jsonl.trim().split('\n').map(line => JSON.parse(line))
  for (const row of repaired.slice(1)) {
    expect(() => assertReleasedPayloadSemantics(row, 0)).not.toThrow()
    const message = row.type === 'user/message' ? row.data : row.data.inserted[0]
    expect(readReasoningUpdate(message)).toEqual(update)
    message.source = legacy().source
  }
  expect(repaired).toEqual(original)
  expect(repairAstraHistory(result.jsonl)).toEqual({ jsonl: result.jsonl, changed: 0 })
})

it('rejects unsupported artifacts, unknown locations, malformed approvals and inconsistent text', () => {
  expect(() => repairAstraHistory(encode([{ ...header, version: 1 }]))).toThrow(/v0/)
  expect(() => repairAstraHistory(encode([header, { other: legacy() }]))).toThrow(/unsupported location/)
  for (const patch of [{ effort: 'invalid' }, { sessionId: 'another-session' }, { unexpected: true }]) {
    const message = legacy()
    Object.assign(message.source.reasoningUpdate, patch)
    expect(() => repairAstraHistory(encode([header, { type: 'user/message', data: message }]))).toThrow()
  }
  const message = legacy()
  message.content = [{ type: 'text', text: 'unconfirmed change' }]
  expect(() => repairAstraHistory(encode([header, { type: 'user/message', data: message }]))).toThrow()
  expect(() => repairAstraHistory(encode(rows()) + '{broken')).toThrow()
})

it('reads legacy records but rejects invalid structured snapshot JSON', () => {
  expect(readReasoningUpdate(legacy())).toEqual(update)
  const message = structuredClone(notice())
  if (message.source.kind !== 'plugin' || message.source.form !== 'snapshot') throw new Error('fixture')
  const broken = { ...message, source: { ...message.source, sections: [{ name: ASTRA_REASONING_SOURCE, text: '{broken' }] } }
  expect(() => readReasoningUpdate(broken)).toThrow(/JSON/)
})

it('creates an exclusive compressed copy and never overwrites either file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'astra-history-test-'))
  try {
    const input = join(dir, 'source.jsonl.zstd'), output = join(dir, 'repaired.jsonl.zstd')
    // Production persistence appends frames; decoding only the first frame loses the body.
    const originalRows = rows()
    const bytes = Buffer.concat(originalRows.map(row => zstdCompressSync(Buffer.from(encode([row])))))
    await writeFile(input, bytes)
    expect(await repairAstraHistoryFile(input, output)).toBe(2)
    const repaired = await readFile(output)
    const frames = scanZstdFrames(repaired).map(({ start, end }) => zstdDecompressSync(repaired.subarray(start, end)).toString())
    expect(frames[0]).toBe(encode([header]))
    expect(frames.join('')).toBe(repairAstraHistory(encode(originalRows)).jsonl)
    expect(frames[1]).toContain(ASTRA_REASONING_SOURCE)
    await expect(repairAstraHistoryFile(input, input)).rejects.toThrow(/differ/)
    await expect(repairAstraHistoryFile(input, output)).rejects.toThrow()
    expect(await readFile(input)).toEqual(bytes)
    expect(await readFile(output)).toEqual(repaired)
    const damaged = join(dir, 'damaged.jsonl.zstd')
    await writeFile(damaged, Buffer.concat([bytes, Buffer.from('truncated')]))
    await expect(repairAstraHistoryFile(damaged, join(dir, 'refused.jsonl'))).rejects.toThrow()
  } finally { await rm(dir, { recursive: true, force: true }) }
})

it('retains a manual-selection sequence reference in both old and new provenance', () => {
  const message = legacy()
  const marked = { ...message, source: { ...message.source, reasoningSelectionSeq: 1 } }
  const result = repairAstraHistory(encode([header, { type: 'model/selection', seq: 1, time: 2, data: {} }, { type: 'user/message', seq: 2, time: 3, data: marked }]))
  const row = JSON.parse(result.jsonl.trim().split('\n')[2]!)
  expect(readReasoningSelectionOrdinal(row.data)).toBe(1)
  expect(() => assertReleasedPayloadSemantics(row, 0)).not.toThrow()
  expect(readReasoningUpdate(row.data)).toEqual(update)
})
