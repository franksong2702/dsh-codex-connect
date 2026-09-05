/** Public update metadata and bounded version checking for Codex Connect. */

export const OPENAI_CODEX_PACKAGE_NAME = 'dsh-codex-connect'
export const OPENAI_CODEX_NPM_METADATA_URL = `https://registry.npmjs.org/-/package/${OPENAI_CODEX_PACKAGE_NAME}/dist-tags`
export const OPENAI_CODEX_RELEASE_API_BASE = 'https://api.github.com/repos/franksong2702/dsh-codex-connect/releases/tags/v'
export const OPENAI_CODEX_RELEASE_PAGE_BASE = 'https://github.com/franksong2702/dsh-codex-connect/releases/tag/v'
export const OPENAI_CODEX_UPDATE_HIGHLIGHTS_URL = 'https://raw.githubusercontent.com/franksong2702/dsh-codex-connect/main/update-highlights.json'
export const OPENAI_CODEX_VERIFIED_COMPATIBILITY_URL = 'https://raw.githubusercontent.com/franksong2702/dsh-codex-connect/main/verified-compatibility.json'
export const OPENAI_CODEX_CANARY_TRACKER_SEARCH_API_URL = 'https://api.github.com/search/issues'
export const OPENAI_CODEX_UPDATE_TIMEOUT_MS = 8_000
export const OPENAI_CODEX_UPDATE_MAX_METADATA_BYTES = 64 * 1024
export const OPENAI_CODEX_UPDATE_MAX_HIGHLIGHTS_BYTES = 64 * 1024
export const OPENAI_CODEX_UPDATE_MAX_COMPATIBILITY_BYTES = 64 * 1024
export const OPENAI_CODEX_UPDATE_MAX_RELEASE_BYTES = 32 * 1024
export const OPENAI_CODEX_UPDATE_MAX_TRACKER_BYTES = 32 * 1024

export type OpenAICodexUpdateHighlightKind =
  | 'trusted-origins'
  | 'runtime-compatibility'
  | 'quota-fast-mode'
  | 'dsh-rc7'
  | 'search-stability'
  | 'image-generation'
  | 'oauth-history'
  | 'model-visibility'
  | 'proxy-connection'
  | 'models-account'
  | 'context-budget'
  | 'auto-review-probe'
  | 'auto-review'
  | 'astra-compatibility'
  | 'multi-account'
  | 'search-route'

export interface OpenAICodexUpdateHighlight {
  version: string
  kind: OpenAICodexUpdateHighlightKind
}

export interface OpenAICodexUpdateCatalogRelease {
  version: string
  highlights: OpenAICodexUpdateHighlightKind[]
}

export interface OpenAICodexUpdateCatalog {
  schemaVersion: 1
  releases: OpenAICodexUpdateCatalogRelease[]
}

export type OpenAICodexDshCompatibilityStatus =
  | 'compatible'
  | 'plugin-update-required'
  | 'dsh-update-required'
  | 'not-yet-compatible'
  | 'unverified'

export interface OpenAICodexDshCompatibilityAdvice {
  status: OpenAICodexDshCompatibilityStatus
  latestPluginVersion: string
  latestDshVersion?: string
  reportCompatibilityGap?: true
  trackerUrl?: string
}

export interface OpenAICodexVerifiedPluginVersion {
  version: string
  verifiedDshVersions: string[]
}

export interface OpenAICodexVerifiedCompatibilityCatalog {
  schemaVersion: 1
  checkedAt: string
  latestDshVersion: string
  pluginVersions: OpenAICodexVerifiedPluginVersion[]
}

const HIGHLIGHT_KINDS: readonly OpenAICodexUpdateHighlightKind[] = [
  'trusted-origins',
  'runtime-compatibility',
  'quota-fast-mode',
  'dsh-rc7',
  'search-stability',
  'image-generation',
  'oauth-history',
  'model-visibility',
  'proxy-connection',
  'models-account',
  'context-budget',
  'auto-review-probe',
  'auto-review',
  'astra-compatibility',
  'multi-account',
  'search-route',
]

function isHighlightKind(value: unknown): value is OpenAICodexUpdateHighlightKind {
  return typeof value === 'string' && HIGHLIGHT_KINDS.includes(value as OpenAICodexUpdateHighlightKind)
}

/** Parse the public release-summary catalog without trusting arbitrary fields. */
export function parseOpenAICodexUpdateHighlights(value: unknown): OpenAICodexUpdateCatalog | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  if (record['schemaVersion'] !== 1 || !Array.isArray(record['releases']) || record['releases'].length > 256) return undefined
  const releases: OpenAICodexUpdateCatalogRelease[] = []
  const seenVersions = new Set<string>()
  for (const rawRelease of record['releases']) {
    if (typeof rawRelease !== 'object' || rawRelease === null || Array.isArray(rawRelease)) continue
    const release = rawRelease as Record<string, unknown>
    const version = release['version']
    const kinds = release['highlights']
    if (typeof version !== 'string' || parseOpenAICodexVersion(version) === undefined || !Array.isArray(kinds) || kinds.length > 32) continue
    if (seenVersions.has(version)) continue
    seenVersions.add(version)
    const validKinds: OpenAICodexUpdateHighlightKind[] = []
    for (const kind of kinds) if (isHighlightKind(kind) && !validKinds.includes(kind)) validKinds.push(kind)
    releases.push({ version, highlights: validKinds })
  }
  return { schemaVersion: 1, releases }
}

export type OpenAICodexUpdateResult =
  | {
      status: 'up-to-date'
      currentVersion: string
      currentDshVersion?: string
      latestVersion: string
      compatibility: OpenAICodexDshCompatibilityAdvice
    }
  | {
      status: 'update-available'
      currentVersion: string
      currentDshVersion?: string
      latestVersion: string
      releaseUrl: string
      highlights: OpenAICodexUpdateHighlight[]
      versionsBehind?: number
      releaseName?: string
      releaseNotes?: string
      publishedAt?: string
      compatibility: OpenAICodexDshCompatibilityAdvice
    }
  | {
      status: 'unavailable'
      currentVersion: string
      currentDshVersion?: string
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
  currentDshVersion?: string
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

/** Parse the repository-owned compatibility catalog without assuming version ranges are monotonic. */
export function parseOpenAICodexVerifiedCompatibility(value: unknown): OpenAICodexVerifiedCompatibilityCatalog | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  const checkedAt = record['checkedAt']
  const latestDshVersion = record['latestDshVersion']
  const rawPluginVersions = record['pluginVersions']
  if (record['schemaVersion'] !== 1
    || typeof checkedAt !== 'string'
    || !/^\d{4}-\d{2}-\d{2}$/u.test(checkedAt)
    || typeof latestDshVersion !== 'string'
    || parseOpenAICodexVersion(latestDshVersion) === undefined
    || !Array.isArray(rawPluginVersions)
    || rawPluginVersions.length > 256) return undefined
  const pluginVersions: OpenAICodexVerifiedPluginVersion[] = []
  const seenPluginVersions = new Set<string>()
  for (const rawPluginVersion of rawPluginVersions) {
    if (typeof rawPluginVersion !== 'object' || rawPluginVersion === null || Array.isArray(rawPluginVersion)) return undefined
    const pluginVersion = rawPluginVersion as Record<string, unknown>
    const version = pluginVersion['version']
    const rawVerified = pluginVersion['verifiedDshVersions']
    if (typeof version !== 'string'
      || parseOpenAICodexVersion(version) === undefined
      || seenPluginVersions.has(version)
      || !Array.isArray(rawVerified)
      || rawVerified.length > 64) return undefined
    const verifiedDshVersions: string[] = []
    for (const rawDshVersion of rawVerified) {
      if (typeof rawDshVersion !== 'string'
        || parseOpenAICodexVersion(rawDshVersion) === undefined
        || verifiedDshVersions.includes(rawDshVersion)) return undefined
      verifiedDshVersions.push(rawDshVersion)
    }
    seenPluginVersions.add(version)
    pluginVersions.push({ version, verifiedDshVersions })
  }
  return { schemaVersion: 1, checkedAt, latestDshVersion, pluginVersions }
}

/** Combine installed, published, and repository-verified versions into one user decision. */
export function evaluateOpenAICodexDshCompatibility(
  currentVersion: string,
  latestPluginVersion: string,
  currentDshVersion?: string,
  catalog?: OpenAICodexVerifiedCompatibilityCatalog,
): OpenAICodexDshCompatibilityAdvice {
  if (catalog === undefined) return { status: 'unverified', latestPluginVersion }
  if (currentDshVersion === undefined) {
    return { status: 'unverified', latestPluginVersion, latestDshVersion: catalog.latestDshVersion }
  }
  const verified = (version: string): boolean => catalog.pluginVersions.some(plugin => (
    plugin.version === version && plugin.verifiedDshVersions.includes(currentDshVersion)
  ))
  if (verified(currentVersion)) {
    return { status: 'compatible', latestPluginVersion, latestDshVersion: catalog.latestDshVersion }
  }
  if (latestPluginVersion !== currentVersion && verified(latestPluginVersion)) {
    return { status: 'plugin-update-required', latestPluginVersion, latestDshVersion: catalog.latestDshVersion }
  }
  const latestPairVerified = catalog.pluginVersions.some(plugin => (
    plugin.version === latestPluginVersion
    && plugin.verifiedDshVersions.includes(catalog.latestDshVersion)
  ))
  if (latestPairVerified && compareOpenAICodexVersions(currentDshVersion, catalog.latestDshVersion) < 0) {
    return {
      status: 'dsh-update-required',
      latestPluginVersion,
      latestDshVersion: catalog.latestDshVersion,
    }
  }
  const currentDshAtOrBeyondLatest = compareOpenAICodexVersions(currentDshVersion, catalog.latestDshVersion) >= 0
  return {
    status: currentDshAtOrBeyondLatest ? 'not-yet-compatible' : 'unverified',
    latestPluginVersion,
    latestDshVersion: catalog.latestDshVersion,
    ...currentDshAtOrBeyondLatest ? { reportCompatibilityGap: true as const } : {},
  }
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
  const record = value as Record<string, unknown>
  const tags = record['dist-tags'] ?? record
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

function releaseHighlightsBetween(
  catalog: OpenAICodexUpdateCatalog,
  currentVersion: string,
  latestVersion: string,
): { highlights: OpenAICodexUpdateHighlight[]; versionsBehind?: number } {
  const releases = catalog.releases
    .filter(release => compareOpenAICodexVersions(release.version, currentVersion) > 0)
    .filter(release => compareOpenAICodexVersions(release.version, latestVersion) <= 0)
  return {
    ...releases.length === 0 ? {} : { versionsBehind: releases.length },
    highlights: releases.flatMap(release => release.highlights.map(kind => ({ version: release.version, kind }))),
  }
}

async function releaseHighlights(
  currentVersion: string,
  latestVersion: string,
  fetchImpl: FetchImpl,
  timeoutMs: number,
): Promise<{ highlights: OpenAICodexUpdateHighlight[]; versionsBehind?: number }> {
  try {
    const { response, text } = await fetchBounded(
      fetchImpl,
      OPENAI_CODEX_UPDATE_HIGHLIGHTS_URL,
      OPENAI_CODEX_UPDATE_MAX_HIGHLIGHTS_BYTES,
      timeoutMs,
      { accept: 'application/json' },
    )
    if (!response.ok) return { highlights: [] }
    const parsed = parseOpenAICodexUpdateHighlights(JSON.parse(text) as unknown)
    return parsed === undefined ? { highlights: [] } : releaseHighlightsBetween(parsed, currentVersion, latestVersion)
  } catch {
    return { highlights: [] }
  }
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

async function dshCompatibilityAdvice(
  currentVersion: string,
  latestPluginVersion: string,
  currentDshVersion: string | undefined,
  fetchImpl: FetchImpl,
  timeoutMs: number,
): Promise<OpenAICodexDshCompatibilityAdvice> {
  let catalog: OpenAICodexVerifiedCompatibilityCatalog | undefined
  try {
    const { response, text } = await fetchBounded(
      fetchImpl,
      OPENAI_CODEX_VERIFIED_COMPATIBILITY_URL,
      OPENAI_CODEX_UPDATE_MAX_COMPATIBILITY_BYTES,
      timeoutMs,
      { accept: 'application/json' },
    )
    if (response.ok) catalog = parseOpenAICodexVerifiedCompatibility(JSON.parse(text) as unknown)
  } catch {
    catalog = undefined
  }
  const advice = evaluateOpenAICodexDshCompatibility(currentVersion, latestPluginVersion, currentDshVersion, catalog)
  if (advice.reportCompatibilityGap !== true || currentDshVersion === undefined) return advice
  const trackerUrl = await findOpenAICodexCanaryTracker(currentDshVersion, fetchImpl, timeoutMs)
  return trackerUrl === undefined ? advice : { ...advice, trackerUrl }
}

function canaryTrackerSearchUrl(version: string): string {
  const params = new URLSearchParams({
    q: `repo:franksong2702/dsh-codex-connect is:issue in:title "compatibility: track DSH ${version}"`,
    per_page: '5',
  })
  return `${OPENAI_CODEX_CANARY_TRACKER_SEARCH_API_URL}?${params.toString()}`
}

function validCanaryTrackerUrl(value: unknown): value is string {
  return typeof value === 'string'
    && /^https:\/\/github\.com\/franksong2702\/dsh-codex-connect\/issues\/[1-9]\d*$/u.test(value)
}

async function findOpenAICodexCanaryTracker(
  version: string,
  fetchImpl: FetchImpl,
  timeoutMs: number,
): Promise<string | undefined> {
  try {
    const { response, text } = await fetchBounded(
      fetchImpl,
      canaryTrackerSearchUrl(version),
      OPENAI_CODEX_UPDATE_MAX_TRACKER_BYTES,
      timeoutMs,
      { accept: 'application/vnd.github+json' },
    )
    if (!response.ok) return undefined
    const value = JSON.parse(text) as unknown
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
    const items = (value as Record<string, unknown>)['items']
    if (!Array.isArray(items) || items.length > 5) return undefined
    const expectedTitle = `compatibility: track DSH ${version}`
    const expectedMarker = `<!-- dsh-canary:${version} -->`
    for (const item of items) {
      if (typeof item !== 'object' || item === null || Array.isArray(item)) continue
      const issue = item as Record<string, unknown>
      if (issue['title'] === expectedTitle
        && typeof issue['body'] === 'string'
        && issue['body'].includes(expectedMarker)
        && issue['pull_request'] === undefined
        && validCanaryTrackerUrl(issue['html_url'])) {
        return issue['html_url']
      }
    }
    return undefined
  } catch {
    return undefined
  }
}

/** Check npm's public dist-tags and enrich an available update with public release notes. */
export async function checkForOpenAICodexUpdate(options: UpdateCheckOptions): Promise<OpenAICodexUpdateResult> {
  const { currentVersion, currentDshVersion } = options
  const currentDsh = currentDshVersion === undefined ? {} : { currentDshVersion }
  if (parseOpenAICodexVersion(currentVersion) === undefined) {
    return { status: 'unavailable', currentVersion, ...currentDsh, reason: 'invalid-current-version' }
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
    if (!response.ok) return { status: 'unavailable', currentVersion, ...currentDsh, reason: 'registry-unavailable' }
    metadata = JSON.parse(text) as unknown
  } catch (error: unknown) {
    return {
      status: 'unavailable',
      currentVersion,
      ...currentDsh,
      reason: error instanceof SyntaxError || error instanceof RangeError ? 'invalid-registry-response' : 'registry-unavailable',
    }
  }
  const candidates = registryCandidates(metadata)
  if (candidates.length === 0) return { status: 'unavailable', currentVersion, ...currentDsh, reason: 'invalid-registry-response' }
  const latestVersion = candidates.reduce((best, candidate) => compareOpenAICodexVersions(candidate, best) > 0 ? candidate : best)
  if (compareOpenAICodexVersions(latestVersion, currentVersion) <= 0) {
    const compatibility = await dshCompatibilityAdvice(currentVersion, currentVersion, currentDshVersion, fetchImpl, timeoutMs)
    return { status: 'up-to-date', currentVersion, ...currentDsh, latestVersion: currentVersion, compatibility }
  }
  const [highlightResult, details, compatibility] = await Promise.all([
    releaseHighlights(currentVersion, latestVersion, fetchImpl, timeoutMs),
    releaseDetails(latestVersion, fetchImpl, timeoutMs),
    dshCompatibilityAdvice(currentVersion, latestVersion, currentDshVersion, fetchImpl, timeoutMs),
  ])
  return {
    status: 'update-available',
    currentVersion,
    ...currentDsh,
    latestVersion,
    releaseUrl: releaseUrl(latestVersion),
    highlights: highlightResult.highlights,
    compatibility,
    ...highlightResult.versionsBehind === undefined ? {} : { versionsBehind: highlightResult.versionsBehind },
    ...details,
  }
}

/** Validate a route response before it is rendered by the browser. */
export function parseOpenAICodexUpdateResult(value: unknown): OpenAICodexUpdateResult | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  const currentVersion = record['currentVersion']
  if (typeof currentVersion !== 'string' || parseOpenAICodexVersion(currentVersion) === undefined) return undefined
  const rawCurrentDshVersion = record['currentDshVersion']
  const currentDshVersion = rawCurrentDshVersion === undefined
    ? undefined
    : typeof rawCurrentDshVersion === 'string' && parseOpenAICodexVersion(rawCurrentDshVersion) !== undefined
      ? rawCurrentDshVersion
      : undefined
  if (rawCurrentDshVersion !== undefined && currentDshVersion === undefined) return undefined
  const currentDsh = currentDshVersion === undefined ? {} : { currentDshVersion }
  if (record['status'] === 'unavailable') {
    const reason = record['reason']
    return reason === 'invalid-current-version' || reason === 'registry-unavailable' || reason === 'invalid-registry-response'
      ? { status: 'unavailable', currentVersion, ...currentDsh, reason }
      : undefined
  }
  const latestVersion = record['latestVersion']
  if (typeof latestVersion !== 'string' || parseOpenAICodexVersion(latestVersion) === undefined) return undefined
  const compatibility = parseOpenAICodexDshCompatibilityAdvice(record['compatibility'], latestVersion)
  if (compatibility === undefined) return undefined
  if (currentDshVersion === undefined && compatibility.status !== 'unverified') return undefined
  if (record['status'] === 'up-to-date') {
    return { status: 'up-to-date', currentVersion, ...currentDsh, latestVersion, compatibility }
  }
  if (record['status'] !== 'update-available' || compareOpenAICodexVersions(latestVersion, currentVersion) <= 0) return undefined
  const expectedUrl = releaseUrl(latestVersion)
  if (record['releaseUrl'] !== expectedUrl) return undefined
  const rawVersionsBehind = record['versionsBehind']
  const versionsBehind = rawVersionsBehind === undefined
    ? undefined
    : typeof rawVersionsBehind === 'number' && Number.isSafeInteger(rawVersionsBehind) && rawVersionsBehind > 0 && rawVersionsBehind <= 256
      ? rawVersionsBehind
      : undefined
  if (rawVersionsBehind !== undefined && versionsBehind === undefined) return undefined
  const rawHighlights = record['highlights']
  const highlights = rawHighlights === undefined
    ? []
    : Array.isArray(rawHighlights)
      ? rawHighlights.flatMap(value => {
          if (typeof value !== 'object' || value === null || Array.isArray(value)) return []
          const highlight = value as Record<string, unknown>
          const version = highlight['version']
          const kind = highlight['kind']
          if (typeof version !== 'string' || parseOpenAICodexVersion(version) === undefined) return []
          if (!isHighlightKind(kind)) return []
          return [{ version, kind }]
        })
      : undefined
  if (highlights === undefined || (Array.isArray(rawHighlights) && highlights.length !== rawHighlights.length)) return undefined
  const releaseName = cleanReleaseText(record['releaseName'], 200)
  const releaseNotes = cleanReleaseText(record['releaseNotes'], 16_000)
  const publishedAt = typeof record['publishedAt'] === 'string' && /^\d{4}-\d{2}-\d{2}T/iu.test(record['publishedAt'])
    ? record['publishedAt'].slice(0, 64)
    : undefined
  return {
    status: 'update-available',
    currentVersion,
    ...currentDsh,
    latestVersion,
    releaseUrl: expectedUrl,
    highlights,
    compatibility,
    ...versionsBehind === undefined ? {} : { versionsBehind },
    ...releaseName === undefined ? {} : { releaseName },
    ...releaseNotes === undefined ? {} : { releaseNotes },
    ...publishedAt === undefined ? {} : { publishedAt },
  }
}

function parseOpenAICodexDshCompatibilityAdvice(
  value: unknown,
  latestPluginVersion: string,
): OpenAICodexDshCompatibilityAdvice | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  const status = record['status']
  if (status !== 'compatible' && status !== 'plugin-update-required' && status !== 'dsh-update-required' && status !== 'not-yet-compatible' && status !== 'unverified') return undefined
  if (record['latestPluginVersion'] !== latestPluginVersion) return undefined
  const latestDshVersion = record['latestDshVersion']
  const reportCompatibilityGap = record['reportCompatibilityGap']
  const trackerUrl = record['trackerUrl']
  if (reportCompatibilityGap !== undefined && reportCompatibilityGap !== true) return undefined
  if (reportCompatibilityGap === true && status !== 'not-yet-compatible') return undefined
  if (trackerUrl !== undefined && (reportCompatibilityGap !== true || !validCanaryTrackerUrl(trackerUrl))) return undefined
  if (status === 'unverified') {
    if (latestDshVersion === undefined) return { status, latestPluginVersion }
    if (typeof latestDshVersion !== 'string' || parseOpenAICodexVersion(latestDshVersion) === undefined) return undefined
    return { status, latestPluginVersion, latestDshVersion }
  }
  if (typeof latestDshVersion !== 'string' || parseOpenAICodexVersion(latestDshVersion) === undefined) return undefined
  return {
    status,
    latestPluginVersion,
    latestDshVersion,
    ...reportCompatibilityGap === true ? { reportCompatibilityGap: true as const } : {},
    ...trackerUrl === undefined ? {} : { trackerUrl },
  }
}
