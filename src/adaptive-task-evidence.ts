/** Validate archived Task manifests and findings and the directories holding their artifacts. */
import { lstat } from 'node:fs/promises'
import { isAbsolute, join, parse, resolve, sep } from 'node:path'
import { ledgerHash, ledgerId, ledgerInteger } from './adaptive-task-delegation-contract.ts'
import { taskRecord } from './adaptive-task-contract.ts'
import { taskFailure, taskIdentity } from './adaptive-task-store.ts'

export interface TaskEvidenceReference { sourceId: string; start: number; end: number; digest: string }
export interface TaskFindings { summary: string; findings: Array<{ text: string; references: TaskEvidenceReference[] }> }
const exact = (value: unknown, keys: string): value is Record<string, unknown> => taskRecord(value)
  && Object.keys(value).sort().join(',') === keys.split(',').sort().join(',')
const boundedText = (value: unknown, max: number): value is string => typeof value === 'string'
  && value.trim().length > 0 && Buffer.byteLength(value) <= max && !value.includes('\0')
/** All existing components must be real directories; callers must use canonical absolute paths. */
export async function taskSafeDirectories(path: string): Promise<Array<{ path: string; dev: number; ino: number }>> {
  if (!isAbsolute(path) || resolve(path) !== path) taskFailure('TASK_EVIDENCE_PATH_DENIED')
  let cursor = parse(path).root
  const result = []
  for (const part of path.slice(cursor.length).split(sep).filter(Boolean)) {
    cursor = join(cursor, part)
    const stat = await lstat(cursor)
    if (!stat.isDirectory() || stat.isSymbolicLink()) taskFailure('TASK_EVIDENCE_PATH_DENIED')
    result.push({ path: cursor, dev: stat.dev, ino: stat.ino })
  }
  return result
}
function safeRelative(path: string): boolean {
  return path.length > 0 && path.length <= 4096 && !isAbsolute(path) && !path.includes('\\')
    && path.split('/').every(part => part !== '' && part !== '.' && part !== '..' && !part.startsWith('.')
      && !/(?:secret|credential|password|token|auth|config|private[-_]?key)/iu.test(part)
      && !/\.(?:pem|key|p12|pfx|keystore)$/iu.test(part) && !/^id_(?:rsa|dsa|ecdsa|ed25519)(?:\.|$)/iu.test(part))
}
interface ArchivedTaskManifest {
  root: string
  entries: Array<{ id: string; path: string }>
}

/** Validates the exact saved manifest digest without accessing its historical source files. */
export function restoreTaskEvidenceManifest(value: unknown, digest: string): ArchivedTaskManifest {
  if (!exact(value, 'root,entries') || typeof value.root !== 'string' || !isAbsolute(value.root) || resolve(value.root) !== value.root
    || !Array.isArray(value.entries) || value.entries.length === 0 || value.entries.length > 32
    || value.entries.some(item => !exact(item, 'id,path') || !ledgerId(item.id) || typeof item.path !== 'string' || !safeRelative(item.path))
    || new Set(value.entries.map(item => item.id)).size !== value.entries.length
    || new Set(value.entries.map(item => item.path)).size !== value.entries.length) taskFailure('TASK_EVIDENCE_MANIFEST_INVALID')
  const restored = { root: value.root, entries: structuredClone(value.entries) }
  if (taskIdentity(JSON.stringify(restored)) !== digest) taskFailure('TASK_EVIDENCE_MANIFEST_INVALID')
  return restored
}
export function parseTaskFindings(value: unknown): TaskFindings {
  if (!exact(value, 'summary,findings') || !boundedText(value.summary, 16 * 1024) || !Array.isArray(value.findings)
    || value.findings.length > 10 || Buffer.byteLength(JSON.stringify(value)) > 16 * 1024) taskFailure('TASK_FINDINGS_INVALID')
  for (const finding of value.findings) {
    if (!exact(finding, 'text,references') || !boundedText(finding.text, 16 * 1024) || !Array.isArray(finding.references)
      || finding.references.length === 0 || finding.references.length > 8) taskFailure('TASK_FINDINGS_INVALID')
    for (const ref of finding.references) if (!exact(ref, 'sourceId,start,end,digest') || !ledgerId(ref.sourceId)
      || !ledgerInteger(ref.start, 1) || !ledgerInteger(ref.end, Number(ref.start)) || !ledgerHash(ref.digest)) taskFailure('TASK_FINDINGS_INVALID')
  }
  return structuredClone(value) as unknown as TaskFindings
}
