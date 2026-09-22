/** Private immutable artifacts contain evidence/results, never grant authority. */
import { constants } from 'node:fs'
import { lstat, mkdir, open } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { withFileLock, writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import { ledgerHash } from './adaptive-task-delegation-contract.ts'
import { taskSafeDirectories } from './adaptive-task-evidence.ts'
import { taskFailure, taskIdentity } from './adaptive-task-store.ts'

const MAX_BYTES = 2 * 1024 * 1024 // Includes JSON escaping of a bounded 256 KiB snapshot.
export class TaskDelegationArtifacts {
  /** Parent must already exist, canonical and trusted. This directory is private to the exact root. */
  constructor(private readonly directory: string) {}
  private async safe(create: boolean): Promise<void> {
    await taskSafeDirectories(dirname(this.directory))
    if (create) await mkdir(this.directory, { mode: 0o700 }).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'EEXIST') throw error
    })
    const stat = await lstat(this.directory)
    if (!stat.isDirectory() || stat.isSymbolicLink() || (process.platform !== 'win32' && (stat.mode & 0o077) !== 0)) taskFailure('TASK_ARTIFACT_UNSAFE')
  }
  async put(value: unknown): Promise<string> {
    const text = JSON.stringify(value)
    if (typeof text !== 'string' || Buffer.byteLength(text) > MAX_BYTES) taskFailure('TASK_ARTIFACT_TOO_LARGE')
    const digest = taskIdentity(text)
    await this.safe(true)
    const filename = join(this.directory, digest + '.json')
    await withFileLock(filename, async () => {
      await this.safe(false)
      try { await this.get(digest); return } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
      await writeFileAtomic(filename, text, { mode: 0o600, dirMode: 0o700 })
      const file = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW)
      try { await file.sync() } finally { await file.close() }
      if (process.platform !== 'win32') {
        const directory = await open(this.directory, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW)
        try { await directory.sync() } finally { await directory.close() }
      }
    })
    return digest
  }
  async get(digest: string): Promise<unknown> {
    if (!ledgerHash(digest)) taskFailure('TASK_ARTIFACT_INVALID')
    await this.safe(false)
    const file = await open(join(this.directory, digest + '.json'), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
    try {
      const stat = await file.stat()
      if (!stat.isFile() || stat.nlink !== 1 || stat.size > MAX_BYTES || (process.platform !== 'win32' && (stat.mode & 0o077) !== 0)) taskFailure('TASK_ARTIFACT_UNSAFE')
      const bytes = Buffer.alloc(MAX_BYTES + 1)
      const { bytesRead } = await file.read(bytes, 0, bytes.length, 0)
      const after = await file.stat()
      if (bytesRead !== stat.size || after.size !== stat.size || after.mtimeMs !== stat.mtimeMs
        || after.ctimeMs !== stat.ctimeMs || taskIdentity(bytes.subarray(0, bytesRead).toString('utf8')) !== digest) taskFailure('TASK_ARTIFACT_CORRUPT')
      return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, bytesRead))) as unknown
    } finally { await file.close() }
  }
}
