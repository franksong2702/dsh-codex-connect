import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import { afterEach, describe, expect, it } from 'vitest'
import { ReserveRequestPermits, ReserveReturnStore, parseReserveReturn } from '../src/reserve-state.ts'
import { reserveIdentity } from '../src/reserve-usage.ts'
import { reserveToken } from './reserve-fixture.ts'

let root: string | undefined
afterEach(async () => { if (root !== undefined) await rm(root, { recursive: true, force: true }); root = undefined })
const access = reserveToken()
const key = reserveIdentity(access)!.key
const target = {
  version: 1 as const,
  identityKey: key,
  ordinary: { provider: 'openai-codex', model: 'gpt-6-astra', reasoningEffort: ReasoningEffortId('max'), maxTokens: 2048, temperature: 0.5 },
}

describe('Reserve return targets', () => {
  it('survives a new store instance, retains exact controls, and stores neither raw identity nor credentials', async () => {
    root = await mkdtemp(join(tmpdir(), 'codex-reserve-state-'))
    const store = new ReserveReturnStore(root)
    expect(await store.load('session')).toBeUndefined()
    await store.save('session', target)
    expect(await new ReserveReturnStore(root).load('session')).toEqual(target)
    const files = await readdir(root)
    expect(files).toHaveLength(1)
    expect(files[0]).toMatch(/^[a-f0-9]{64}\.json$/u)
    const path = join(root, files[0]!)
    const content = await readFile(path, 'utf8')
    expect(content).not.toContain('fixture-account')
    expect(content).not.toContain('fixture-user')
    expect(content).not.toContain(access)
    if (process.platform !== 'win32') expect((await stat(path)).mode & 0o777).toBe(0o600)
    await store.save('session', { ...target, ordinary: { provider: 'openai-codex', model: 'gpt-5.6-sol' } })
    expect((await store.load('session'))?.ordinary.model).toBe('gpt-5.6-sol')
  })

  it('hashes path-like session ids and rejects corrupt or oversized state without reading arbitrary paths', async () => {
    root = await mkdtemp(join(tmpdir(), 'codex-reserve-state-'))
    const store = new ReserveReturnStore(root)
    await store.save('../fixture/../../session', target)
    const file = join(root, (await readdir(root))[0]!)
    expect(await store.load('../fixture/../../session')).toEqual(target)
    await writeFile(file, 'private malformed state')
    await expect(store.load('../fixture/../../session')).rejects.toThrow('return target is invalid')
    await writeFile(file, ' '.repeat(8193))
    await expect(store.load('../fixture/../../session')).rejects.toThrow('return target is invalid')
  })

  it.each([
    { ...target, version: 2 },
    { ...target, identityKey: 'raw-account' },
    { ...target, ordinary: { provider: 'other', model: 'gpt-6-astra' } },
    { ...target, ordinary: { provider: 'openai-codex', model: 'gpt-reserve' } },
    { ...target, ordinary: { ...target.ordinary, reasoningEffort: {} } },
    { ...target, ordinary: { ...target.ordinary, maxTokens: -1 } },
  ])('rejects invalid durable return records', value => {
    expect(() => parseReserveReturn(value)).toThrow('return target is invalid')
  })
})

describe('Reserve one-shot dispatch permits', () => {
  it('authorizes only the matching account/user and consumes every attempted permit once', () => {
    const permits = new ReserveRequestPermits()
    expect(() => permits.consume('session', access)).toThrow('fresh server-authorized')
    permits.issue('session', key, new AbortController().signal)
    permits.consume('session', access)
    expect(() => permits.consume('session', access)).toThrow('fresh server-authorized')
    for (const token of [reserveToken('other-account'), reserveToken('fixture-account', 'other-user'), 'malformed']) {
      permits.issue('session', key, new AbortController().signal)
      expect(() => permits.consume('session', token)).toThrow('same account')
      expect(() => permits.consume('session', access)).toThrow('same account')
    }
  })

  it('isolates sessions and revokes aborted or disposed attempts', () => {
    const permits = new ReserveRequestPermits()
    const aborted = new AbortController()
    permits.issue('first', key, aborted.signal)
    permits.issue('second', key, new AbortController().signal)
    aborted.abort()
    expect(() => permits.consume('first', access)).toThrow()
    permits.consume('second', access)
    permits.issue('third', key, new AbortController().signal)
    permits.clear()
    expect(() => permits.consume('third', access)).toThrow()
    expect(() => permits.issue('never', key, AbortSignal.abort())).toThrow()
  })
})
