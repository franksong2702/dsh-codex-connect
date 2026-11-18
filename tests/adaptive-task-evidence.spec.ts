import { chmod, link, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { restoreTaskEvidenceManifest, parseTaskFindings } from '../src/adaptive-task-evidence.ts'
import { TaskDelegationArtifacts } from '../src/adaptive-task-artifacts.ts'
import { taskIdentity } from '../src/adaptive-task-store.ts'

const roots: string[] = []
async function setup() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'archived-task-evidence-')))
  roots.push(root)
  return { root }
}
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

it('restores the exact saved manifest without opening its former source files', async () => {
  const { root } = await setup()
  const store = new TaskDelegationArtifacts(join(root, 'artifacts'))
  const saved = { root, entries: [{ id: 'archived-source-001', path: 'missing-notes.txt' }] }
  const digest = await store.put(saved)
  const restored = restoreTaskEvidenceManifest(await store.get(digest), digest)
  expect(restored).toEqual(saved)
  restored.entries[0]!.path = 'other.txt'
  expect(() => restoreTaskEvidenceManifest(restored, digest)).toThrow('TASK_EVIDENCE_MANIFEST_INVALID')
  expect(await store.get(digest)).toEqual(saved)
})
it.each(['../outside.txt', '/absolute.txt', '.env', 'credentials.txt', 'private.key', 'id_ed25519', 'sub/../notes.txt', 'sub\\notes.txt'])(
  'rejects an archived manifest with an invalid source path %s', async path => {
    const { root } = await setup()
    const saved = { root, entries: [{ id: 'archived-source-001', path }] }
    expect(() => restoreTaskEvidenceManifest(saved, taskIdentity(JSON.stringify(saved)))).toThrow('TASK_EVIDENCE_MANIFEST_INVALID')
  },
)
it('preserves saved findings and rejects invalid references', () => {
  const findings = { summary: 'Saved summary', findings: [{ text: 'Saved finding',
    references: [{ sourceId: 'archived-source-001', start: 7, end: 9, digest: taskIdentity('exact archived bytes') }] }] }
  expect(parseTaskFindings(findings)).toEqual(findings)
  const bad = structuredClone(findings)
  bad.findings[0]!.references[0]!.end = 6
  expect(() => parseTaskFindings(bad)).toThrow('TASK_FINDINGS_INVALID')
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
