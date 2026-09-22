import { mkdtemp, mkdir, writeFile, readFile, rm, realpath, symlink, link, chmod } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { TaskEvidenceManifest, TaskEvidenceReader, parseTaskEvidence } from '../src/adaptive-task-evidence.ts'
import { TaskDelegationArtifacts } from '../src/adaptive-task-artifacts.ts'
import { taskIdentity } from '../src/adaptive-task-store.ts'

const roots: string[] = []
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
async function setup() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'task-evidence-'))); roots.push(root)
  await writeFile(join(root, 'notes.txt'), 'first\nsecond\nthird')
  return { root, approve: () => TaskEvidenceManifest.approve(root, ['notes.txt']) }
}
it('uses immutable snapshots and host IDs, not child-supplied paths', async () => {
  const f = await setup(), manifest = await f.approve(), source = manifest.sources()[0]!
  const snapshot = await manifest.snapshot([source.id])
  await writeFile(join(f.root, 'notes.txt'), 'changed')
  const reader = new TaskEvidenceReader(snapshot)
  expect(reader.read({ sourceId: source.id, start: 1, end: 2 }).text).toBe('first\nsecond')
  expect((await manifest.snapshot([source.id])).files[0]!.text).toBe('changed')
  expect(manifest.digest).toBe(snapshot.manifest)
  await expect(manifest.snapshot(['notes.txt'])).rejects.toThrow('TASK_EVIDENCE_SCOPE_DENIED')
})
it.each(['../outside.txt', '/absolute.txt', '.env', '.git/HEAD', 'credentials.txt', 'config.json', 'private.key', 'auth.json', 'sub/../notes.txt', 'sub\\notes.txt'])(
  'rejects excluded or noncanonical path %s before opening it', async path => {
    const f = await setup()
    await expect(TaskEvidenceManifest.approve(f.root, [path])).rejects.toThrow('TASK_EVIDENCE_PATH_DENIED')
  })
it('rejects a symlink file, directory component and root', async () => {
  const f = await setup()
  await symlink(join(f.root, 'notes.txt'), join(f.root, 'alias.txt'))
  await expect(TaskEvidenceManifest.approve(f.root, ['alias.txt'])).rejects.toThrow('TASK_EVIDENCE_FILE_DENIED')
  await mkdir(join(f.root, 'sub')); await writeFile(join(f.root, 'sub', 'text.txt'), 'test')
  await symlink(join(f.root, 'sub'), join(f.root, 'alias'))
  await expect(TaskEvidenceManifest.approve(f.root, ['alias/text.txt'])).rejects.toThrow('TASK_EVIDENCE_PATH_DENIED')
  await expect(TaskEvidenceManifest.approve(join(f.root, 'alias'), ['text.txt'])).rejects.toThrow('TASK_EVIDENCE_MANIFEST_INVALID')
})
it('rejects hardlinks and a file replaced with symlink after approval', async () => {
  const f = await setup(), manifest = await f.approve()
  await link(join(f.root, 'notes.txt'), join(f.root, 'linked.txt'))
  await expect(manifest.snapshot([manifest.sources()[0]!.id])).rejects.toThrow('TASK_EVIDENCE_FILE_DENIED')
  await rm(join(f.root, 'notes.txt')); await symlink(join(f.root, 'linked.txt'), join(f.root, 'notes.txt'))
  await expect(manifest.snapshot([manifest.sources()[0]!.id])).rejects.toThrow('TASK_EVIDENCE_FILE_DENIED')
})
it.each([Buffer.from([0xff]), Buffer.from('binary\0data'), Buffer.from('control\x01data')])('rejects invalid UTF8/binary bytes', async bytes => {
  const f = await setup(); await writeFile(join(f.root, 'notes.txt'), bytes)
  await expect(f.approve()).rejects.toThrow('TASK_EVIDENCE_NOT_TEXT')
})
it('rejects oversized files and total snapshots without truncation', async () => {
  const f = await setup(); await writeFile(join(f.root, 'notes.txt'), 'x'.repeat(65537))
  await expect(f.approve()).rejects.toThrow('TASK_EVIDENCE_FILE_DENIED')
  const paths = Array.from({ length: 5 }, (_, i) => `text-${i}.txt`)
  for (const path of paths) await writeFile(join(f.root, path), 'x'.repeat(65536))
  await expect(TaskEvidenceManifest.approve(f.root, paths)).rejects.toThrow('TASK_EVIDENCE_TOO_LARGE')
})
it('rejects empty, duplicate, too many, and out-of-scope source choices', async () => {
  const f = await setup()
  await expect(TaskEvidenceManifest.approve(f.root, [])).rejects.toThrow('TASK_EVIDENCE_MANIFEST_INVALID')
  await expect(TaskEvidenceManifest.approve(f.root, ['notes.txt', 'notes.txt'])).rejects.toThrow('TASK_EVIDENCE_MANIFEST_INVALID')
  const manifest = await f.approve(), id = manifest.sources()[0]!.id
  await expect(manifest.snapshot([])).rejects.toThrow('TASK_EVIDENCE_SCOPE_DENIED')
  await expect(manifest.snapshot([id, id])).rejects.toThrow('TASK_EVIDENCE_SCOPE_DENIED')
  await expect(manifest.snapshot(['unknown-source-00001'])).rejects.toThrow('TASK_EVIDENCE_SCOPE_DENIED')
})
it('detaches manifest listings and snapshot reader inputs from caller mutation', async () => {
  const f = await setup(), manifest = await f.approve(), id = manifest.sources()[0]!.id
  manifest.sources()[0]!.path = '../outside'
  const snapshot = await manifest.snapshot([id]), reader = new TaskEvidenceReader(snapshot)
  snapshot.files[0]!.text = 'forged'
  expect(reader.read({ sourceId: id, start: 1, end: 1 }).text).toBe('first')
})
it('accepts only actually observed range hashes and exactly one final submission', async () => {
  const f = await setup(), manifest = await f.approve(), id = manifest.sources()[0]!.id
  const reader = new TaskEvidenceReader(await manifest.snapshot([id]))
  const { text: _text, ...ref } = reader.read({ sourceId: id, start: 2, end: 3 })
  const value = { summary: 'Reviewed', findings: [{ text: 'Finding', references: [ref] }] }
  expect(reader.submit(value)).toEqual({ accepted: true }); expect(reader.finish()).toEqual(value)
  expect(() => reader.submit(value)).toThrow('TASK_CHILD_EXTRA_ACTION')
  expect(() => reader.finish()).toThrow('TASK_FINDINGS_MISSING_OR_INVALID')
})
it('an unobserved but correct file hash is not an observed citation', async () => {
  const f = await setup(), manifest = await f.approve(), id = manifest.sources()[0]!.id
  const reader = new TaskEvidenceReader(await manifest.snapshot([id]))
  expect(() => reader.submit({ summary: 'Claim', findings: [{ text: 'Unobserved', references: [{ sourceId: id, start: 1, end: 1, digest: taskIdentity('first') }] }] })).toThrow('TASK_FINDINGS_UNOBSERVED')
  expect(() => reader.finish()).toThrow('TASK_FINDINGS_MISSING_OR_INVALID')
})
it('rejects empty references, oversized results and extra fields', async () => {
  const f = await setup(), manifest = await f.approve(), snap = await manifest.snapshot([manifest.sources()[0]!.id])
  for (const value of [{ summary: 'Bad', findings: [{ text: 'Claim', references: [] }] },
    { summary: 'x'.repeat(16385), findings: [] }, { summary: 'Bad', findings: [], authority: true }]) {
    expect(() => new TaskEvidenceReader(snap).submit(value)).toThrow('TASK_FINDINGS_INVALID')
  }
})
it('rejects out of bounds, arbitrary path and oversized line requests', async () => {
  const f = await setup(), manifest = await f.approve(), id = manifest.sources()[0]!.id
  const reader = new TaskEvidenceReader(await manifest.snapshot([id]))
  for (const range of [{ start: 0, end: 1 }, { start: 1, end: 201 }, { start: 2, end: 1 }, { start: 1, end: 4 }]) {
    expect(() => reader.read({ sourceId: id, ...range })).toThrow('TASK_EVIDENCE_RANGE_INVALID')
  }
  expect(() => reader.read({ sourceId: id, start: 1, end: 1, path: '/etc/passwd' })).toThrow('TASK_EVIDENCE_RANGE_INVALID')
  await writeFile(join(f.root, 'notes.txt'), 'x'.repeat(16385))
  expect(() => new TaskEvidenceReader({ version: 1, manifest: manifest.digest, files: [{ id, text: 'x'.repeat(16385), digest: taskIdentity('x'.repeat(16385)) }] }).read({ sourceId: id, start: 1, end: 1 })).toThrow('TASK_EVIDENCE_RANGE_TOO_LARGE')
})
it('detects malformed snapshot hash and duplicate IDs', async () => {
  const f = await setup(), manifest = await f.approve(), snap = await manifest.snapshot([manifest.sources()[0]!.id])
  const bad = structuredClone(snap); bad.files[0]!.text = 'changed'
  expect(() => parseTaskEvidence(bad)).toThrow('TASK_EVIDENCE_INVALID')
  snap.files.push(snap.files[0]!); expect(() => parseTaskEvidence(snap)).toThrow('TASK_EVIDENCE_INVALID')
})
it('artifacts survive new store instances, are private and detect tampering', async () => {
  const f = await setup(), path = join(f.root, 'artifacts'), store = new TaskDelegationArtifacts(path)
  const value = { result: 'immutable' }, digest = await store.put(value)
  expect(await store.put(value)).toBe(digest)
  expect(await new TaskDelegationArtifacts(path).get(digest)).toEqual(value)
  await writeFile(join(path, digest + '.json'), '{}')
  await expect(store.get(digest)).rejects.toThrow('TASK_ARTIFACT_CORRUPT')
  await expect(store.put(value)).rejects.toThrow('TASK_ARTIFACT_CORRUPT')
})
it('restores the exact approved manifest from a digest-bound artifact, without issuing new source IDs', async () => {
  const f = await setup(), manifest = await f.approve(), store = new TaskDelegationArtifacts(join(f.root, 'artifacts'))
  const digest = await store.put(manifest.serialize())
  expect(digest).toBe(manifest.digest)
  const restored = TaskEvidenceManifest.restore(await store.get(digest), digest)
  expect(restored.sources()).toEqual(manifest.sources())
  expect(await restored.snapshot([restored.sources()[0]!.id])).toEqual(await manifest.snapshot([manifest.sources()[0]!.id]))
  const altered = manifest.serialize(); altered.entries[0]!.path = 'other.txt'
  expect(() => TaskEvidenceManifest.restore(altered, digest)).toThrow('TASK_EVIDENCE_MANIFEST_INVALID')
})
it('rejects known private-key paths and PEM payloads even under an ordinary text filename', async () => {
  const f = await setup()
  await expect(TaskEvidenceManifest.approve(f.root, ['id_ed25519'])).rejects.toThrow('TASK_EVIDENCE_PATH_DENIED')
  await writeFile(join(f.root, 'notes.txt'), '-----BEGIN RSA PRIVATE KEY-----\nsynthetic-placeholder')
  await expect(f.approve()).rejects.toThrow('TASK_EVIDENCE_FILE_DENIED')
})
it('artifacts reject symlink directories, hardlinks, public modes, traversal and oversize', async () => {
  const f = await setup(), path = join(f.root, 'artifacts'), store = new TaskDelegationArtifacts(path)
  await expect(store.get('../escape')).rejects.toThrow('TASK_ARTIFACT_INVALID')
  await expect(store.put('x'.repeat(2 * 1024 * 1024))).rejects.toThrow('TASK_ARTIFACT_TOO_LARGE')
  const digest = await store.put({ ok: true }), file = join(path, digest + '.json')
  await link(file, join(f.root, 'copy.json'))
  await expect(store.get(digest)).rejects.toThrow('TASK_ARTIFACT_UNSAFE')
  await rm(join(f.root, 'copy.json')); await chmod(file, 0o644)
  await expect(store.get(digest)).rejects.toThrow('TASK_ARTIFACT_UNSAFE')
  await chmod(file, 0o600); await chmod(path, 0o755)
  await expect(store.get(digest)).rejects.toThrow('TASK_ARTIFACT_UNSAFE')
  await symlink(path, join(f.root, 'alias'))
  await expect(new TaskDelegationArtifacts(join(f.root, 'alias')).put({ ok: true })).rejects.toThrow('TASK_ARTIFACT_UNSAFE')
  expect(await readFile(file, 'utf8')).toBe('{"ok":true}')
})
