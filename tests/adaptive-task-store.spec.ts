import { mkdtemp, rm, readFile, lstat, chmod, symlink, link, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { afterEach, expect, it } from 'vitest'
import { AdaptiveTaskStore, taskIdentity } from '../src/adaptive-task-store.ts'
import type { TaskDocument } from '../src/adaptive-task-store.ts'
import { decodeTaskCommand, ADAPTIVE_TASK_START, ADAPTIVE_TASK_MODELS } from '../src/adaptive-task-contract.ts'
let root: string | undefined
const document = (): TaskDocument => ({ version: 1, sessionId: 'fixture', sessionKey: 'a'.repeat(64), owner: 'b'.repeat(64),
  runtime: 'c'.repeat(64), revision: 1, mode: 'auto', route: ADAPTIVE_TASK_START,
  capabilities: [{ model: ADAPTIVE_TASK_START.model, efforts: ['medium'] }], maximumRequests: 50, reserved: 0,
  selectionSeq: -1, portable: false, handoffSeq: -1, receipts: [{ id: randomUUID(), digest: 'd'.repeat(64) }] })
async function setup() {
  root = await mkdtemp(join(tmpdir(), 'task-store-'))
  const path = join(root, 'state'); const store = new AdaptiveTaskStore(path)
  const file = join(path, taskIdentity('fixture') + '.json')
  return { path, file, store }
}
afterEach(async () => { if (root !== undefined) await rm(root, { recursive: true, force: true }); root = undefined })
it('persists all six explicitly granted models and never expands an older grant on read', async () => {
  const f = await setup()
  const old = document(); await f.store.update('fixture', () => old)
  expect((await f.store.read('fixture'))!.capabilities).toEqual(old.capabilities)
  const fresh = { ...document(), capabilities: ADAPTIVE_TASK_MODELS.map(model => ({ model, efforts: ['medium'] })) }
  await f.store.update('fixture', () => fresh)
  const restarted = new AdaptiveTaskStore(f.path)
  expect((await restarted.read('fixture'))!.capabilities).toEqual(fresh.capabilities)
  expect((await restarted.read('fixture'))!.route).toEqual({ model: 'gpt-5.6-sol', effort: 'medium' })
  await expect(f.store.update('fixture', current => ({ ...current!, capabilities: [...fresh.capabilities,
    { model: 'unapproved-model', efforts: ['medium'] }] }))).rejects.toThrow('TASK_STATE_INVALID')
})
it('uses private atomic state and never stores unrelated prompt or credential fields', async () => {
  const f = await setup(); expect(await f.store.read('fixture')).toBeUndefined()
  await f.store.update('fixture', document)
  const stat = await lstat(f.file)
  if (process.platform !== 'win32') expect(stat.mode & 0o777).toBe(0o600)
  expect(JSON.parse(await readFile(f.file, 'utf8')).reserved).toBe(0)
  await expect(f.store.update('fixture', current => ({ ...current!, credential: 'must not persist' }))).rejects.toThrow('TASK_STATE_INVALID')
  expect(await readFile(f.file, 'utf8')).not.toContain('must not persist')
})
it('serializes reservations across independent store objects instead of losing parallel updates', async () => {
  const f = await setup(); await f.store.update('fixture', document)
  await Promise.all(Array.from({ length: 12 }, () => new AdaptiveTaskStore(f.path).update('fixture', current => {
    current!.reserved++; return current!
  })))
  expect((await f.store.read('fixture'))!.reserved).toBe(12)
})
it.each(['unknown-version', 'over-budget', 'new-authority', 'foreign-session', 'duplicate-route'])(
  'does not accept %s as trusted state or replace the old valid grant', async kind => {
    const f = await setup(); await f.store.update('fixture', document)
    await expect(f.store.update('fixture', current => {
      const value = current! as TaskDocument & { forged?: boolean }
      if (kind === 'unknown-version') (value as { version: number }).version = 99
      if (kind === 'over-budget') value.reserved = 51
      if (kind === 'new-authority') value.forged = true
      if (kind === 'foreign-session') value.sessionId = 'other'
      if (kind === 'duplicate-route') value.capabilities = [...value.capabilities, ...value.capabilities]
      return value
    })).rejects.toThrow('TASK_STATE_INVALID')
    expect((await f.store.read('fixture'))!.reserved).toBe(0)
  },
)
it('rejects symlinks, hardlinks and oversized content without following external state', async () => {
  const f = await setup(); await f.store.update('fixture', document)
  const target = join(root!, 'outside.json'); await writeFile(target, JSON.stringify(document()), { mode: 0o600 })
  await rm(f.file); await symlink(target, f.file)
  await expect(f.store.read('fixture')).rejects.toThrow('TASK_STATE_UNAVAILABLE')
  await rm(f.file); await link(target, f.file)
  await expect(f.store.read('fixture')).rejects.toThrow('TASK_STATE_UNSAFE')
  await rm(f.file); await writeFile(f.file, 'x'.repeat(66000), { mode: 0o600 })
  await expect(f.store.read('fixture')).rejects.toThrow('TASK_STATE_UNSAFE')
})
it('rejects world-readable state on POSIX', async () => {
  const f = await setup(); await f.store.update('fixture', document)
  if (process.platform !== 'win32') {
    await chmod(f.file, 0o644); await expect(f.store.read('fixture')).rejects.toThrow('TASK_STATE_UNSAFE')
  }
})
it('accepts only explicit bounded user commands, never model-authored approval fields', () => {
  const start = { action: 'start', revision: 0, sessionId: 'fixture', operationId: randomUUID(), maximumRequests: 40, models: [...ADAPTIVE_TASK_MODELS], efforts: Object.fromEntries(ADAPTIVE_TASK_MODELS.map(model => [model, ['medium']])) }
  expect(decodeTaskCommand(start)).toEqual(start)
  for (const change of [{ approved: true }, { maximumRequests: 0 }, { maximumRequests: 201 }, { models: ['gpt-6-astra'] },
    { operationId: '' }, { revision: -1 }, { sessionId: '../../escape' }, { models: [ADAPTIVE_TASK_START.model, ADAPTIVE_TASK_START.model] }]) {
    expect(decodeTaskCommand({ ...start, ...change })).toBeUndefined()
  }
  expect(decodeTaskCommand({ ...start, action: 'manual' })).toBeUndefined()
})
