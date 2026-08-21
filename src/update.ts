/** Public update metadata and bounded version checking for Codex Connect. */

export const OPENAI_CODEX_PACKAGE_NAME = 'dsh-codex-connect'
export const OPENAI_CODEX_NPM_METADATA_URL = `https://registry.npmjs.org/${OPENAI_CODEX_PACKAGE_NAME}`
export const OPENAI_CODEX_RELEASE_API_BASE = 'https://api.github.com/repos/franksong2702/dsh-codex-connect/releases/tags/v'
export const OPENAI_CODEX_RELEASE_PAGE_BASE = 'https://github.com/franksong2702/dsh-codex-connect/releases/tag/v'
export const OPENAI_CODEX_UPDATE_TIMEOUT_MS = 8_000
export const OPENAI_CODEX_UPDATE_MAX_METADATA_BYTES = 64 * 1024
export const OPENAI_CODEX_UPDATE_MAX_RELEASE_BYTES = 32 * 1024

export type OpenAICodexUpdateResult =
  | {
      status: 'up-to-date'
      currentVersion: string
      latestVersion: string
    }
  | {
      status: 'update-available'
      currentVersion: string
      latestVersion: string
      releaseUrl: string
      releaseName?: string
      releaseNotes?: string
      publishedAt?: string
    }
  | {
      status: 'unavailable'
      currentVersion: string
      reason: 'invalid-current-version' | 'registry-unavailable' | 'invalid-registry-response'
    }

interface ParsedVersion {
  major: number
  minor: number
  patch: number
  prerelease: Array<number | string>
}

interface UpdateCheckOptions {
  currentVersion: string
  fetchImpl?: FetchImpl
  timeoutMs?: number
}

type FetchImpl = (input: string, init?: RequestInit) => Promise<Response>

function parseVersionParts(raw: string): ParsedVersion | undefined {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u.exec(raw)
  if (match === null) return undefined
  const rawPrerelease = match[4] === undefined ? [] : match[4].split('.')
  if (rawPrerelease.some(identifier => /^\d+$/u.test(identifier) && !/^(0|[1-9]\d*)$/u.test(identifier))) return undefined
  const prerelease = rawPrerelease.map(identifier => /^(0|[1-9]\d*)$/u.test(identifier) ? Number(identifier) : identifier)
  if (prerelease.some(identifier => typeof identifier === 'number' && !Number.isSafeInteger(identifier))) return undefined
  const parsed = {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease,
  }
  return [parsed.major, parsed.minor, parsed.patch].every(Number.isSafeInteger) ? parsed : undefined
}

/** Parse one exact package version, accepting the conventional leading `v`. */
export function parseOpenAICodexVersion(raw: string): ParsedVersion | undefined {
  if (typeof raw !== 'string') return undefined
  const normalized = raw.startsWith('v') ? raw.slice(1) : raw
  return parseVersionParts(normalized)
}

function compareIdentifiers(left: number | string, right: number | string): number {
  if (typeof left === 'number' && typeof right === 'number') return left < right ? -1 : left > right ? 1 : 0
  if (typeof left === 'number') return -1
  if (typeof right === 'number') return 1
  return left < right ? -1 : left > right ? 1 : 0
}

/** Compare two package versions using SemVer precedence (build metadata ignored). */
export function compareOpenAICodexVersions(left: string, right: string): number {
  const a = parseOpenAICodexVersion(left)
  const b = parseOpenAICodexVersion(right)
  if (a === undefined || b === undefined) throw new TypeError('invalid OpenAI Codex version')
  for (const [aPart, bPart] of [[a.major, b.major], [a.minor, b.minor], [a.patch, b.patch]] as const) {
    if (aPart !== bPart) return aPart < bPart ? -1 : 1
  }
  if (a.prerelease.length === 0 && b.prerelease.length !== 0) return 1
  if (a.prerelease.length !== 0 && b.prerelease.length === 0) return -1
  for (let index = 0; index < Math.max(a.prerelease.length, b.prerelease.length); index += 1) {
    const aPart = a.prerelease[index]
    const bPart = b.prerelease[index]
    if (aPart === undefined) return -1
    if (bPart === undefined) return 1
    const comparison = compareIdentifiers(aPart, bPart)
    if (comparison !== 0) return comparison
  }
  return 0
}

function boundedText(value: string, maxBytes: number): string {
  const bytes = new TextEncoder().encode(value)
  if (bytes.byteLength > maxBytes) throw new RangeError('update response is too large')
  return value
}

async function readBoundedText(response: Response, maxBytes: number): Promise<string> {
  if (response.body === null) return boundedText(await response.text(), maxBytes)
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  const chunks: string[] = []
  let total = 0
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      total += next.value.byteLength
      if (total > maxBytes) {
        await reader.cancel()
        throw new RangeError('update response is too large')
      }
      chunks.push(decoder.decode(next.value, { stream: true }))
    }
    chunks.push(decoder.decode())
    return chunks.join('')
  } finally {
    reader.releaseLock()
  }
}

async function fetchBounded(
  fetchImpl: FetchImpl,
  url: string,
  maxBytes: number,
  timeoutMs: number,
  headers: Record<string, string>,
): Promise<{ response: Response; text: string }> {
  const controller = new AbortController()
  const timer = setTimeout(() => { controller.abort(new Error('update request timed out')) }, timeoutMs)
  try {
    const response = await fetchImpl(url, { headers, signal: controller.signal })
    const text = await readBoundedText(response, maxBytes)
    return { response, text }
  } finally {
    clearTimeout(timer)
  }
}

function cleanReleaseText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string' || value.length === 0) return undefined
  const clean = value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu, '')
    .replace(/\r\n?/gu, '\n')
    .trim()
    .slice(0, maxLength)
  return clean.length === 0 ? undefined : clean
}

function registryCandidates(value: unknown): string[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return []
  const tags = (value as Record<string, unknown>)['dist-tags']
  if (typeof tags !== 'object' || tags === null || Array.isArray(tags)) return []
  return ['latest', 'alpha']
    .map(tag => (tags as Record<string, unknown>)[tag])
    .filter((candidate): candidate is string => typeof candidate === 'string' && parseOpenAICodexVersion(candidate) !== undefined)
}

function releaseUrl(version: string): string {
  return `${OPENAI_CODEX_RELEASE_PAGE_BASE}${version}`
}

function releaseApiUrl(version: string): string {
  return `${OPENAI_CODEX_RELEASE_API_BASE}${version}`
}

async function releaseDetails(
  version: string,
  fetchImpl: FetchImpl,
  timeoutMs: number,
): Promise<Pick<Extract<OpenAICodexUpdateResult, { status: 'update-available' }>, 'releaseName' | 'releaseNotes' | 'publishedAt'>> {
  try {
    const { response, text } = await fetchBounded(
      fetchImpl,
      releaseApiUrl(version),
      OPENAI_CODEX_UPDATE_MAX_RELEASE_BYTES,
      timeoutMs,
      { accept: 'application/vnd.github+json' },
    )
    if (!response.ok) return {}
    const value = JSON.parse(text) as unknown
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
    const release = value as Record<string, unknown>
    const releaseName = cleanReleaseText(release['name'], 200)
    const releaseNotes = cleanReleaseText(release['body'], 16_000)
    const publishedAt = typeof release['published_at'] === 'string' && /^\d{4}-\d{2}-\d{2}T/iu.test(release['published_at'])
      ? release['published_at'].slice(0, 64)
      : undefined
    return {
      ...releaseName === undefined ? {} : { releaseName },
      ...releaseNotes === undefined ? {} : { releaseNotes },
      ...publishedAt === undefined ? {} : { publishedAt },
    }
  } catch {
    return {}
  }
}

/** Check npm's public dist-tags and enrich an available update with public release notes. */
export async function checkForOpenAICodexUpdate(options: UpdateCheckOptions): Promise<OpenAICodexUpdateResult> {
  const { currentVersion } = options
  if (parseOpenAICodexVersion(currentVersion) === undefined) {
    return { status: 'unavailable', currentVersion, reason: 'invalid-current-version' }
  }
  const fetchImpl = options.fetchImpl ?? fetch
  const timeoutMs = options.timeoutMs ?? OPENAI_CODEX_UPDATE_TIMEOUT_MS
  let metadata: unknown
  try {
    const { response, text } = await fetchBounded(
      fetchImpl,
      OPENAI_CODEX_NPM_METADATA_URL,
      OPENAI_CODEX_UPDATE_MAX_METADATA_BYTES,
      timeoutMs,
      { accept: 'application/json' },
    )
    if (!response.ok) return { status: 'unavailable', currentVersion, reason: 'registry-unavailable' }
    metadata = JSON.parse(text) as unknown
  } catch (error: unknown) {
    return {
      status: 'unavailable',
      currentVersion,
      reason: error instanceof SyntaxError || error instanceof RangeError ? 'invalid-registry-response' : 'registry-unavailable',
    }
  }
  const candidates = registryCandidates(metadata)
  if (candidates.length === 0) return { status: 'unavailable', currentVersion, reason: 'invalid-registry-response' }
  const latestVersion = candidates.reduce((best, candidate) => compareOpenAICodexVersions(candidate, best) > 0 ? candidate : best)
  if (compareOpenAICodexVersions(latestVersion, currentVersion) <= 0) {
    return { status: 'up-to-date', currentVersion, latestVersion: currentVersion }
  }
  return {
    status: 'update-available',
    currentVersion,
    latestVersion,
    releaseUrl: releaseUrl(latestVersion),
    ...await releaseDetails(latestVersion, fetchImpl, timeoutMs),
  }
}

/** Validate a route response before it is rendered by the browser. */
export function parseOpenAICodexUpdateResult(value: unknown): OpenAICodexUpdateResult | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  const currentVersion = record['currentVersion']
  if (typeof currentVersion !== 'string' || parseOpenAICodexVersion(currentVersion) === undefined) return undefined
  if (record['status'] === 'unavailable') {
    const reason = record['reason']
    return reason === 'invalid-current-version' || reason === 'registry-unavailable' || reason === 'invalid-registry-response'
      ? { status: 'unavailable', currentVersion, reason }
      : undefined
  }
  const latestVersion = record['latestVersion']
  if (typeof latestVersion !== 'string' || parseOpenAICodexVersion(latestVersion) === undefined) return undefined
  if (record['status'] === 'up-to-date') {
    return { status: 'up-to-date', currentVersion, latestVersion }
  }
  if (record['status'] !== 'update-available' || compareOpenAICodexVersions(latestVersion, currentVersion) <= 0) return undefined
  const expectedUrl = releaseUrl(latestVersion)
  if (record['releaseUrl'] !== expectedUrl) return undefined
  const releaseName = cleanReleaseText(record['releaseName'], 200)
  const releaseNotes = cleanReleaseText(record['releaseNotes'], 16_000)
  const publishedAt = typeof record['publishedAt'] === 'string' && /^\d{4}-\d{2}-\d{2}T/iu.test(record['publishedAt'])
    ? record['publishedAt'].slice(0, 64)
    : undefined
  return {
    status: 'update-available',
    currentVersion,
    latestVersion,
    releaseUrl: expectedUrl,
    ...releaseName === undefined ? {} : { releaseName },
    ...releaseNotes === undefined ? {} : { releaseNotes },
    ...publishedAt === undefined ? {} : { publishedAt },
  }
}
