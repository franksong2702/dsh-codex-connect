/** Validate credential-directory ownership before any read, lock, migration or write. */
import { lstat, realpath } from 'node:fs/promises'
import { dirname, join, parse, resolve } from 'node:path'
import { CredentialStorageError } from './secure-store.ts'

export async function assertCredentialParent(filename: string, allowMissing = false): Promise<void> {
  const directory = dirname(resolve(filename))
  await validateDirectoryChain(directory, allowMissing, true)
  // Validate the resolved chain as well: a trusted OS alias must not conceal
  // a writable or foreign-owned target ancestor. Missing descendants are
  // checked again after prepareDirectory creates them.
  let existing = directory
  let canonical: string
  while (true) {
    try { canonical = await realpath(existing); break } catch (error) {
      if (!allowMissing || (error as NodeJS.ErrnoException).code !== 'ENOENT' || dirname(existing) === existing) {
        throw new CredentialStorageError('The resolved credential directory cannot be validated.')
      }
      existing = dirname(existing)
    }
  }
  await validateDirectoryChain(canonical, false, existing === directory)
}

async function validateDirectoryChain(directory: string, allowMissing: boolean, requireFinalUser: boolean): Promise<void> {
  const { root } = parse(directory)
  const parts = directory.slice(root.length).split(/[\\/]/u).filter(Boolean)
  const uid = process.getuid?.()
  let current = root
  // Root-owned, non-writable OS aliases (/var and /tmp on macOS) are trusted.
  // User-controlled directory symlinks and writable ancestors are not.
  let previousSafeForAlias = true
  for (const [index, part] of parts.entries()) {
    current = join(current, part)
    let info
    try { info = await lstat(current) } catch (error) {
      if (allowMissing && (error as NodeJS.ErrnoException).code === 'ENOENT') return
      throw new CredentialStorageError('The credential parent directory cannot be validated; no credentials were read or written.')
    }
    const final = index === parts.length - 1
    if (info.isSymbolicLink()) {
      if (uid === undefined || info.uid !== 0 || !previousSafeForAlias || final) {
        throw new CredentialStorageError('Credential parent directory symlinks are not allowed.')
      }
      continue
    }
    if (!info.isDirectory()) throw new CredentialStorageError('The credential parent must be a directory.')
    if (uid !== undefined) {
      if (final && requireFinalUser ? info.uid !== uid : info.uid !== uid && info.uid !== 0) {
        throw new CredentialStorageError('The credential directory chain has an untrusted owner.')
      }
      const writable = (info.mode & 0o022) !== 0
      const sharedTemporaryAncestor = (!final || !requireFinalUser) && info.uid === 0 && (info.mode & 0o1000) !== 0
      if (writable && !sharedTemporaryAncestor) throw new CredentialStorageError('The credential directory chain is writable by another user; fix its permissions before proceeding.')
      previousSafeForAlias = !writable
    } else {
      previousSafeForAlias = false
    }
  }
}
