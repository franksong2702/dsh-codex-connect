/** Owner-only allowlist for browser origins that may reach the Web OAuth routes. */

import { lstat, mkdir, readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { withFileLock, writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'

/** Basename of the DSH-home-scoped browser-origin allowlist. */
export const OPENAI_CODEX_TRUSTED_ORIGINS_FILENAME = '.openai-codex-trusted-origins.json'
/** Current on-disk format. Readers reject every other version. */
export const TRUSTED_ORIGINS_FORMAT_VERSION = 1
/** Only supported policy mode; a future mode must not be silently accepted. */
export const TRUSTED_ORIGINS_MODE = 'allowlist'

type TrustedOriginsMode = typeof TRUSTED_ORIGINS_MODE

interface TrustedOriginsDocument {
  version: typeof TRUSTED_ORIGINS_FORMAT_VERSION
  mode: TrustedOriginsMode
  origins: string[]
}

/** Whether a filesystem error reports an absent path. */
function isENOENT(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | null)?.code === 'ENOENT'
}

/** Reject a sidecar readable by another POSIX user. */
async function assertOwnerOnly(filename: string): Promise<void> {
  let metadata: Awaited<ReturnType<typeof lstat>>
  try {
    metadata = await lstat(filename)
  } catch (error) {
    if (isENOENT(error)) return
    throw error
  }
  if (!metadata.isFile()) throw new Error(`openai-codex: ${filename} is not a regular file`)
  /* v8 ignore next -- native Windows coverage takes the mode-less branch */
  if (process.platform === 'win32') return
  /* v8 ignore start -- POSIX tests cover this branch; Windows cannot express it */
  if ((metadata.mode & 0o077) !== 0) {
    throw new Error(
      `openai-codex: ${filename} is readable beyond its owner (mode ${(metadata.mode & 0o777).toString(8)});`
      + ` run "chmod 600 ${filename}" before starting again`,
    )
  }
  /* v8 ignore stop */
}

/** Reject malformed input without echoing its contents into an error. */
function parseDocument(text: string, filename: string): TrustedOriginsDocument {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new Error(`openai-codex: ${filename} is not valid JSON`)
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`openai-codex: ${filename} must contain an object`)
  }
  const document = value as Record<string, unknown>
  if (Object.keys(document).some(key => !['version', 'mode', 'origins'].includes(key))) {
    throw new Error(`openai-codex: ${filename} contains an unknown top-level field`)
  }
  if (document['version'] !== TRUSTED_ORIGINS_FORMAT_VERSION) {
    throw new Error(`openai-codex: ${filename} has unsupported trusted-origins format version ${String(document['version'])}`)
  }
  if (document['mode'] !== TRUSTED_ORIGINS_MODE) {
    throw new Error(`openai-codex: ${filename} has unsupported trusted-origins mode`)
  }
  const rawOrigins = document['origins']
  if (!Array.isArray(rawOrigins)) throw new Error(`openai-codex: ${filename} origins must be an array`)
  const origins = new Set<string>()
  for (const rawOrigin of rawOrigins) {
    if (typeof rawOrigin !== 'string') throw new Error(`openai-codex: ${filename} origins must contain strings`)
    try {
      origins.add(normalizeTrustedOrigin(rawOrigin))
    } catch {
      throw new Error(`openai-codex: ${filename} contains an invalid trusted origin`)
    }
  }
  return {
    version: TRUSTED_ORIGINS_FORMAT_VERSION,
    mode: TRUSTED_ORIGINS_MODE,
    origins: [...origins].sort(),
  }
}

/**
 * Normalize one exact browser origin.
 *
 * Only HTTP(S) origins are accepted. Credentials, non-root paths, queries,
 * fragments, wildcards, and CIDR-looking host paths are rejected. WHATWG URL
 * normalization lowercases the scheme/host and removes default ports.
 */
export function normalizeTrustedOrigin(rawOrigin: string): string {
  if (typeof rawOrigin !== 'string' || rawOrigin.length === 0 || rawOrigin.trim() !== rawOrigin) {
    throw new Error('trusted origin must be a non-empty URL without surrounding whitespace')
  }
  let origin: URL
  try {
    origin = new URL(rawOrigin)
  } catch {
    throw new Error('trusted origin must be a valid URL')
  }
  if (origin.protocol !== 'http:' && origin.protocol !== 'https:') {
    throw new Error('trusted origin protocol must be http or https')
  }
  if (origin.username !== '' || origin.password !== '') throw new Error('trusted origin must not contain credentials')
  if (origin.pathname !== '/' || origin.search !== '' || origin.hash !== '') {
    throw new Error('trusted origin must not contain a path, query, or fragment')
  }
  if (origin.hostname === '' || origin.hostname.includes('*')) throw new Error('trusted origin host must be exact')
  // A CIDR is parsed as a non-root path by URL, but keep this explicit so a
  // future parser change cannot accidentally turn a network range into trust.
  if (origin.pathname !== '/' || /(?:^|\/)\d+\/\d+$/u.test(rawOrigin)) {
    throw new Error('trusted origin must not be a CIDR or path')
  }
  if (origin.origin === 'null') throw new Error('trusted origin must have an HTTP(S) host')
  return origin.origin
}

/** Resolve the sidecar path under one DSH home. */
export function openAICodexTrustedOriginsPath(dshHome?: string): string {
  return resolve(join(resolveDshHome(dshHome), OPENAI_CODEX_TRUSTED_ORIGINS_FILENAME))
}

/** File-backed exact-origin allowlist. */
export class OpenAICodexTrustedOriginsStore {
  /** Absolute sidecar path. */
  readonly filename: string

  constructor(filename: string = openAICodexTrustedOriginsPath()) {
    this.filename = resolve(filename)
  }

  private async readCurrent(): Promise<TrustedOriginsDocument> {
    await assertOwnerOnly(this.filename)
    let text: string
    try {
      text = await readFile(this.filename, 'utf8')
    } catch (error) {
      if (isENOENT(error)) {
        return { version: TRUSTED_ORIGINS_FORMAT_VERSION, mode: TRUSTED_ORIGINS_MODE, origins: [] }
      }
      throw error
    }
    return parseDocument(text, this.filename)
  }

  /** Read the current canonical list without acquiring the writer lock. */
  async list(): Promise<readonly string[]> {
    return [...(await this.readCurrent()).origins]
  }

  /** Whether an exact normalized origin is currently trusted. */
  async has(origin: string): Promise<boolean> {
    const normalized = normalizeTrustedOrigin(origin)
    return (await this.readCurrent()).origins.includes(normalized)
  }

  /** Add one origin idempotently and return the resulting sorted list. */
  async trust(origin: string): Promise<readonly string[]> {
    const normalized = normalizeTrustedOrigin(origin)
    await mkdir(dirname(this.filename), { recursive: true, mode: 0o700 })
    return withFileLock(this.filename, async () => {
      const current = await this.readCurrent()
      if (current.origins.includes(normalized)) return [...current.origins]
      const next: TrustedOriginsDocument = {
        version: TRUSTED_ORIGINS_FORMAT_VERSION,
        mode: TRUSTED_ORIGINS_MODE,
        origins: [...current.origins, normalized].sort(),
      }
      await writeFileAtomic(this.filename, `${JSON.stringify(next, null, 2)}\n`, {
        mode: 0o600,
        dirMode: 0o700,
      })
      return [...next.origins]
    })
  }

  /** Remove one origin idempotently and return the resulting sorted list. */
  async untrust(origin: string): Promise<readonly string[]> {
    const normalized = normalizeTrustedOrigin(origin)
    await mkdir(dirname(this.filename), { recursive: true, mode: 0o700 })
    return withFileLock(this.filename, async () => {
      const current = await this.readCurrent()
      if (!current.origins.includes(normalized)) return [...current.origins]
      const next: TrustedOriginsDocument = {
        version: TRUSTED_ORIGINS_FORMAT_VERSION,
        mode: TRUSTED_ORIGINS_MODE,
        origins: current.origins.filter(candidate => candidate !== normalized),
      }
      await writeFileAtomic(this.filename, `${JSON.stringify(next, null, 2)}\n`, {
        mode: 0o600,
        dirMode: 0o700,
      })
      return [...next.origins]
    })
  }
}
