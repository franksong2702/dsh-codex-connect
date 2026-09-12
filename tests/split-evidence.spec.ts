import { createHash } from 'node:crypto'
import { link, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { isSplitEvidence, snapshotSplitEvidence, validSplitSourcePath } from '../src/split-evidence.ts'

let root: string
const text = 'export const answer = 42\n// inspected source\n'
const hash = (value: string) => createHash('sha256').update(value).digest('hex')
const signal = () => new AbortController().signal
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'split-evidence-test-'))
  await mkdir(join(root, 'src'))
  await writeFile(join(root, 'src/example.ts'), text)
})
afterEach(async () => { await rm(root, { force: true, recursive: true }) })
it('detaches approved bytes, bounds source ranges and records exact observed citations', async () => {
  const source = await snapshotSplitEvidence(root, [{ path: 'src/example.ts', sha256: hash(text) }], signal())
  expect(isSplitEvidence(source)).toBe(true)
  expect(isSplitEvidence({ catalog: source.catalog })).toBe(false)
  await writeFile(join(root, 'src/example.ts'), 'changed after snapshot')
  expect(source.read('src/example.ts', 1, 1).text).toBe('export const answer = 42')
  expect(source.observed({ path: 'src/example.ts', sha256: hash(text), startLine: 1, endLine: 1 })).toBe(true)
  expect(source.observed({ path: 'src/example.ts', sha256: hash(text), startLine: 1, endLine: 2 })).toBe(false)
  expect(() => source.read('src/unapproved.ts', 1, 1)).toThrow('SPLIT_EVIDENCE_RANGE_DENIED')
  expect(() => source.read('src/example.ts', 0, 1)).toThrow('SPLIT_EVIDENCE_RANGE_DENIED')
})
it.each(['../outside.ts', '/etc/passwd', 'src/../outside.ts', 'src\\outside.ts', '.env', 'private/data.json', '.ssh/key.txt', 'auth.json', 'src//example.ts', 'src/example.ts\0'])('rejects unauthorized path shape %s before reading', async path => {
  expect(validSplitSourcePath(path)).toBe(false)
  await expect(snapshotSplitEvidence(root, [{ path, sha256: hash(text) }], signal())).rejects.toThrow('SPLIT_EVIDENCE_SCOPE_INVALID')
})
it('rejects changed bytes rather than silently expanding a stale approval', async () => {
  await expect(snapshotSplitEvidence(root, [{ path: 'src/example.ts', sha256: 'a'.repeat(64) }], signal())).rejects.toThrow('SPLIT_EVIDENCE_CHANGED')
})
it('rejects both file and directory symlinks', async () => {
  await symlink(join(root, 'src/example.ts'), join(root, 'alias.ts'))
  await symlink(join(root, 'src'), join(root, 'alias'))
  for (const path of ['alias.ts', 'alias/example.ts']) await expect(snapshotSplitEvidence(root, [{ path, sha256: hash(text) }], signal())).rejects.toThrow('SPLIT_EVIDENCE_LINK_DENIED')
})
it('rejects hardlinks', async () => {
  await link(join(root, 'src/example.ts'), join(root, 'alias.ts'))
  await expect(snapshotSplitEvidence(root, [{ path: 'alias.ts', sha256: hash(text) }], signal())).rejects.toThrow('SPLIT_EVIDENCE_FILE_DENIED')
})
it('rejects oversized and secret-bearing content even when its hash is approved', async () => {
  for (const [value, code] of [['x'.repeat(32_001), 'SPLIT_EVIDENCE_TOO_LARGE'], ['-----BEGIN PRIVATE KEY-----\nfixture only', 'SPLIT_EVIDENCE_CONTENT_DENIED']]) {
    await writeFile(join(root, 'src/example.ts'), value!)
    await expect(snapshotSplitEvidence(root, [{ path: 'src/example.ts', sha256: hash(value!) }], signal())).rejects.toThrow(code)
  }
})
it('cancels snapshots and later reads without granting new access', async () => {
  const controller = new AbortController()
  const evidence = await snapshotSplitEvidence(root, [{ path: 'src/example.ts', sha256: hash(text) }], controller.signal)
  controller.abort(new Error('fixture-cancel'))
  expect(() => evidence.read('src/example.ts', 1, 1)).toThrow('fixture-cancel')
  await expect(snapshotSplitEvidence(root, [{ path: 'src/example.ts', sha256: hash(text) }], controller.signal)).rejects.toThrow('fixture-cancel')
})
it('redacts missing-file IO errors', async () => {
  await expect(snapshotSplitEvidence(root, [{ path: 'src/missing.ts', sha256: hash(text) }], signal())).rejects.toThrow(/^SPLIT_EVIDENCE_UNAVAILABLE$/u)
})
it('rejects duplicate approvals and excessive file counts', async () => {
  const item = { path: 'src/example.ts', sha256: hash(text) }
  await expect(snapshotSplitEvidence(root, [item, item], signal())).rejects.toThrow('SPLIT_EVIDENCE_DUPLICATE')
  await expect(snapshotSplitEvidence(root, Array.from({ length: 17 }, () => item), signal())).rejects.toThrow('SPLIT_EVIDENCE_SCOPE_INVALID')
})
it('bounds total snapshot bytes even when every file fits', async () => {
  const value = 'x'.repeat(32_000)
  const manifest = Array.from({ length: 5 }, (_, index) => ({ path: `src/file${index}.ts`, sha256: hash(value) }))
  for (const item of manifest) await writeFile(join(root, item.path), value)
  await expect(snapshotSplitEvidence(root, manifest, signal())).rejects.toThrow('SPLIT_EVIDENCE_TOO_LARGE')
})
it('enforces total read count without exposing arbitrary filesystem paths', async () => {
  const evidence = await snapshotSplitEvidence(root, [{ path: 'src/example.ts', sha256: hash(text) }], signal())
  for (let i = 0; i < 24; i += 1) evidence.read('src/example.ts', 1, 1)
  expect(() => evidence.read('src/example.ts', 1, 1)).toThrow('SPLIT_EVIDENCE_READ_BUDGET')
})
