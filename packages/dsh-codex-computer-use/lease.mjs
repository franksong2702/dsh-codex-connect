/** Fail-closed, cross-process desktop lease. Never steals an orphaned lock. */
import { constants, closeSync, fstatSync, lstatSync, openSync, readFileSync, unlinkSync, writeSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

export async function acquireDesktopLease(directory = join(tmpdir(), `dsh-codex-cua-${process.getuid()}`)) {
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const parent = lstatSync(directory)
  if (!parent.isDirectory() || parent.isSymbolicLink() || parent.uid !== process.getuid() || (parent.mode & 0o077) !== 0) {
    throw new Error('CUA_LEASE_DIRECTORY_UNSAFE')
  }
  const filename = join(directory, 'desktop.lock')
  const token = randomUUID()
  const fd = openSync(filename, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600)
  const owned = fstatSync(fd)
  let closed = false
  try { writeSync(fd, token) } catch (error) { closeSync(fd); throw error }
  const valid = () => {
    if (closed) return false
    try {
      const current = lstatSync(filename)
      return current.isFile() && !current.isSymbolicLink() && current.dev === owned.dev && current.ino === owned.ino
        && current.uid === process.getuid() && readFileSync(filename, 'utf8') === token
    } catch { return false }
  }
  return {
    valid,
    /** Uncertain native cleanup deliberately leaves the lock for operator recovery. */
    release(quiescent) {
      if (closed) return
      if (quiescent && valid()) unlinkSync(filename)
      closed = true
      closeSync(fd)
    },
  }
}
