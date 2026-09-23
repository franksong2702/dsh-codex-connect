import { readFile, realpath } from 'node:fs/promises'
import { basename, dirname, join, parse as parsePath } from 'node:path'
import { fileURLToPath } from 'node:url'

export const COMPATIBILITY_SCHEMA_VERSION = 1 as const
export const SUPPORTED_NODE_RANGE = '^22.19.0 || >=24.0.0'
export const SUPPORTED_DSH_PLUGIN_API_VERSION = '0.1.7-rc.1'
export const SUPPORTED_DSH_PLUGIN_API_VERSIONS = [SUPPORTED_DSH_PLUGIN_API_VERSION] as const
export const SUPPORTED_DSH_PLUGIN_API_RANGE = SUPPORTED_DSH_PLUGIN_API_VERSIONS.join(' || ')
export const SUPPORTED_PI_AI_RANGE = '0.85.1'
export const PI_AI_PACKAGE = '@earendil-works/pi-ai'

export const DSH_PLUGIN_API_PACKAGES = [
  '@deepseek-ai/dsh-agent',
  '@deepseek-ai/dsh-atomic-write',
  '@deepseek-ai/dsh-attachment',
  '@deepseek-ai/dsh-compaction',
  '@deepseek-ai/dsh-home-paths',
  '@deepseek-ai/dsh-host-webserver',
  '@deepseek-ai/dsh-invariants',
  '@deepseek-ai/dsh-llm',
  '@deepseek-ai/dsh-llm-pi-ai',
  '@deepseek-ai/dsh-fs',
  '@deepseek-ai/dsh-session',
  '@deepseek-ai/dsh-settings',
  '@deepseek-ai/dsh-tools',
  '@deepseek-ai/dsh-util-values',
  '@deepseek-ai/dsh-web',
] as const

export const COMPATIBILITY_PACKAGES = [
  '@deepseek-ai/dsh-llm',
  '@deepseek-ai/dsh-llm-pi-ai',
  '@deepseek-ai/dsh-compaction',
  PI_AI_PACKAGE,
] as const

export type CompatibilityPackageName = (typeof COMPATIBILITY_PACKAGES)[number]
/** Version metadata proves a declared match, not behavioral failure for an untested package. */
export type CompatibilityStatus = 'compatible' | 'unverified' | 'incompatible' | 'unknown'

export interface CompatibilityEntry {
  supported: string
  installed: string | null
  status: CompatibilityStatus
}

export interface CompatibilityReport {
  schemaVersion: typeof COMPATIBILITY_SCHEMA_VERSION
  status: CompatibilityStatus
  node: CompatibilityEntry
  packages: Record<CompatibilityPackageName, CompatibilityEntry>
}

export interface CompatibilityEvaluationInput {
  /** Node version to evaluate; defaults to the running process in detectCompatibility. */
  nodeVersion?: string | null
  /** Alias accepted by callers that already group installed values. */
  node?: string | null
  /** Installed package versions keyed by package name. */
  packageVersions?: Partial<Record<CompatibilityPackageName, string | null | undefined>>
  /** Alias accepted by callers that already group installed values. */
  packages?: Partial<Record<CompatibilityPackageName, string | null | undefined>>
  /** Nested installed values are useful when feeding a captured diagnostic fixture. */
  installed?: {
    node?: string | null
    packages?: Partial<Record<CompatibilityPackageName, string | null | undefined>>
  }
}

export interface CompatibilityDetectionOptions extends CompatibilityEvaluationInput {
  /** Test seam for package metadata resolution; no package paths are returned. */
  readPackageVersion?: (name: CompatibilityPackageName) => string | null | undefined | Promise<string | null | undefined>
  /** Explicit package.json of the DSH installation owning a standalone CLI invocation. */
  installAnchor?: string
}

/** Public contract data mirrored by compatibility.json without importing JSON at runtime. */
export const COMPATIBILITY_CONTRACT = {
  schemaVersion: COMPATIBILITY_SCHEMA_VERSION,
  engines: { node: SUPPORTED_NODE_RANGE },
  dshPluginApi: {
    version: SUPPORTED_DSH_PLUGIN_API_VERSION,
    versions: SUPPORTED_DSH_PLUGIN_API_VERSIONS,
    packages: DSH_PLUGIN_API_PACKAGES,
  },
  piAi: { package: PI_AI_PACKAGE, version: SUPPORTED_PI_AI_RANGE },
} as const

interface PackageJson {
  name?: unknown
  version?: unknown
}

const PACKAGE_JSON_SEARCH_DEPTH = 8

/** Whether the API version is one of the explicitly targeted host versions. */
export function isSupportedDshPluginApiVersion(value: string): boolean {
  return SUPPORTED_DSH_PLUGIN_API_VERSIONS.some(version => version === value)
}

function piAiVersionStatus(value: string): CompatibilityStatus {
  return value.trim() === SUPPORTED_PI_AI_RANGE ? 'compatible' : 'unverified'
}

function parseNodeVersion(value: string): [number, number, number] | undefined {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+][0-9A-Za-z.-]+)?$/u.exec(value.trim())
  if (match === null) return undefined
  const major = Number(match[1])
  const minor = Number(match[2])
  const patch = Number(match[3])
  if (![major, minor, patch].every(Number.isSafeInteger)) return undefined
  return [major, minor, patch]
}

function nodeStatus(value: string | null | undefined): CompatibilityStatus {
  if (value === undefined || value === null || value.trim() === '') return 'unknown'
  const parsed = parseNodeVersion(value)
  if (parsed === undefined) return 'unknown'
  const [major, minor, patch] = parsed
  if (major === 22) return minor > 19 || (minor === 19 && patch >= 0) ? 'compatible' : 'incompatible'
  return major >= 24 ? 'compatible' : 'incompatible'
}

function packageEntry(
  supported: string,
  installed: string | null | undefined,
  status: (value: string) => CompatibilityStatus,
): CompatibilityEntry {
  return {
    supported,
    installed: installed ?? null,
    status: installed === undefined || installed === null || installed === ''
      ? 'unknown'
      : status(installed),
  }
}

function nodeEntry(installed: string | null | undefined): CompatibilityEntry {
  return {
    supported: SUPPORTED_NODE_RANGE,
    installed: installed ?? null,
    status: nodeStatus(installed),
  }
}

function aggregateStatus(entries: readonly CompatibilityEntry[]): CompatibilityStatus {
  if (entries.some(entry => entry.status === 'incompatible')) return 'incompatible'
  if (entries.some(entry => entry.status === 'unknown')) return 'unknown'
  if (entries.some(entry => entry.status === 'unverified')) return 'unverified'
  return 'compatible'
}

/** Evaluate a captured set of versions without touching the filesystem. */
export function evaluateCompatibility(input: CompatibilityEvaluationInput = {}): CompatibilityReport {
  const installedNode = input.nodeVersion ?? input.node ?? input.installed?.node
  const suppliedPackages = input.packageVersions ?? input.packages ?? input.installed?.packages ?? {}
  const packages = {
    '@deepseek-ai/dsh-llm': packageEntry(SUPPORTED_DSH_PLUGIN_API_RANGE, suppliedPackages['@deepseek-ai/dsh-llm'], value => isSupportedDshPluginApiVersion(value) ? 'compatible' : 'unverified'),
    '@deepseek-ai/dsh-llm-pi-ai': packageEntry(SUPPORTED_DSH_PLUGIN_API_RANGE, suppliedPackages['@deepseek-ai/dsh-llm-pi-ai'], value => isSupportedDshPluginApiVersion(value) ? 'compatible' : 'unverified'),
    '@deepseek-ai/dsh-compaction': packageEntry(SUPPORTED_DSH_PLUGIN_API_RANGE, suppliedPackages['@deepseek-ai/dsh-compaction'], value => isSupportedDshPluginApiVersion(value) ? 'compatible' : 'unverified'),
    [PI_AI_PACKAGE]: packageEntry(SUPPORTED_PI_AI_RANGE, suppliedPackages[PI_AI_PACKAGE], piAiVersionStatus),
  } as Record<CompatibilityPackageName, CompatibilityEntry>
  const node = nodeEntry(installedNode)
  const status = aggregateStatus([node, ...Object.values(packages)])
  const dshVersion = packages['@deepseek-ai/dsh-llm'].installed
  const piVersion = packages[PI_AI_PACKAGE].installed
  const matchedPair = dshVersion === packages['@deepseek-ai/dsh-llm-pi-ai'].installed
    && dshVersion === packages['@deepseek-ai/dsh-compaction'].installed
    && dshVersion === SUPPORTED_DSH_PLUGIN_API_VERSION
    && piVersion === SUPPORTED_PI_AI_RANGE
  return {
    schemaVersion: COMPATIBILITY_SCHEMA_VERSION,
    status: status === 'compatible' && !matchedPair ? 'unverified' : status,
    node,
    packages,
  }
}

/** Alias for callers that prefer assessment terminology. */
export const assessCompatibility = evaluateCompatibility

/**
 * Resolve installed package metadata without returning a filesystem path.
 * @param name - package to resolve from this plugin installation.
 * @returns its version, or undefined when metadata cannot be read.
 */
export async function readInstalledPackageVersion(name: string, installAnchor?: string): Promise<string | undefined> {
  if (installAnchor !== undefined) {
    let anchor: string
    try {
      anchor = await realpath(installAnchor)
      const manifest = JSON.parse(await readFile(anchor, 'utf8')) as PackageJson
      if (manifest.name !== '@deepseek-ai/dsh') return undefined
    } catch {
      return undefined
    }
    const packageDirectory = dirname(anchor)
    const scopeDirectory = dirname(packageDirectory)
    const modulesDirectory = dirname(scopeDirectory)
    if (basename(packageDirectory) !== 'dsh' || basename(scopeDirectory) !== '@deepseek-ai'
      || basename(modulesDirectory) !== 'node_modules') return undefined
    try {
      const parsed = JSON.parse(await readFile(join(modulesDirectory, name, 'package.json'), 'utf8')) as PackageJson
      return parsed.name === name && typeof parsed.version === 'string' ? parsed.version : undefined
    } catch {
      // The exact host installation does not expose this package's metadata.
      return undefined
    }
  }
  let entry: string
  try {
    const resolved = import.meta.resolve(name)
    if (!resolved.startsWith('file:')) return undefined
    entry = fileURLToPath(resolved)
  } catch {
    return undefined
  }
  let directory = dirname(entry)
  for (let depth = 0; depth < PACKAGE_JSON_SEARCH_DEPTH; depth += 1) {
    const candidate = join(directory, 'package.json')
    try {
      const parsed = JSON.parse(await readFile(candidate, 'utf8')) as PackageJson
      if (parsed.name === name && typeof parsed.version === 'string') return parsed.version
    } catch {
      // A package can have an unreadable or unrelated parent manifest. Keep the
      // search bounded and report unknown rather than exposing filesystem detail.
    }
    const parent = parsePath(directory).root === directory ? directory : dirname(directory)
    if (parent === directory) break
    directory = parent
  }
  return undefined
}

/** Read installed package metadata and return only versions and statuses. */
export async function detectCompatibility(options: CompatibilityDetectionOptions = {}): Promise<CompatibilityReport> {
  const readVersion = options.readPackageVersion ?? ((name: CompatibilityPackageName) => readInstalledPackageVersion(name, options.installAnchor))
  const packageVersions = options.packageVersions ?? options.packages ?? options.installed?.packages
  const resolvedPackages = packageVersions === undefined
    ? Object.fromEntries(await Promise.all(COMPATIBILITY_PACKAGES.map(async name => [name, await readVersion(name)] as const)))
    : packageVersions
  return evaluateCompatibility({
    nodeVersion: options.nodeVersion ?? options.node ?? options.installed?.node ?? process.version,
    packageVersions: resolvedPackages,
  })
}
