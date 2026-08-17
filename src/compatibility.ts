import { readFile } from 'node:fs/promises'
import { dirname, join, parse as parsePath } from 'node:path'
import { fileURLToPath } from 'node:url'

export const COMPATIBILITY_SCHEMA_VERSION = 1 as const
export const SUPPORTED_NODE_RANGE = '^22.19.0 || >=24.0.0'
export const SUPPORTED_DSH_PLUGIN_API_VERSION = '0.1.0-rc.6'
export const SUPPORTED_PI_AI_VERSION = '0.82.1'
export const PI_AI_PACKAGE = '@earendil-works/pi-ai'

export const DSH_PLUGIN_API_PACKAGES = [
  '@deepseek-ai/dsh-agent',
  '@deepseek-ai/dsh-atomic-write',
  '@deepseek-ai/dsh-attachment',
  '@deepseek-ai/dsh-home-paths',
  '@deepseek-ai/dsh-host-webserver',
  '@deepseek-ai/dsh-invariants',
  '@deepseek-ai/dsh-llm',
  '@deepseek-ai/dsh-llm-pi-ai',
  '@deepseek-ai/dsh-fs',
  '@deepseek-ai/dsh-session',
  '@deepseek-ai/dsh-settings',
  '@deepseek-ai/dsh-tools',
  '@deepseek-ai/dsh-web',
] as const

export const COMPATIBILITY_PACKAGES = [
  '@deepseek-ai/dsh-llm',
  '@deepseek-ai/dsh-llm-pi-ai',
  PI_AI_PACKAGE,
] as const

export type CompatibilityPackageName = (typeof COMPATIBILITY_PACKAGES)[number]
export type CompatibilityStatus = 'compatible' | 'incompatible' | 'unknown'

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
}

/** Public contract data mirrored by compatibility.json without importing JSON at runtime. */
export const COMPATIBILITY_CONTRACT = {
  schemaVersion: COMPATIBILITY_SCHEMA_VERSION,
  engines: { node: SUPPORTED_NODE_RANGE },
  dshPluginApi: {
    version: SUPPORTED_DSH_PLUGIN_API_VERSION,
    packages: DSH_PLUGIN_API_PACKAGES,
  },
  piAi: { package: PI_AI_PACKAGE, version: SUPPORTED_PI_AI_VERSION },
} as const

interface PackageJson {
  name?: unknown
  version?: unknown
}

const PACKAGE_JSON_SEARCH_DEPTH = 8

function compareVersion(left: string, right: string): CompatibilityStatus {
  return left === right ? 'compatible' : 'incompatible'
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
): CompatibilityEntry {
  return {
    supported,
    installed: installed ?? null,
    status: installed === undefined || installed === null || installed === ''
      ? 'unknown'
      : compareVersion(installed, supported),
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
  return 'compatible'
}

/** Evaluate a captured set of versions without touching the filesystem. */
export function evaluateCompatibility(input: CompatibilityEvaluationInput = {}): CompatibilityReport {
  const installedNode = input.nodeVersion ?? input.node ?? input.installed?.node
  const suppliedPackages = input.packageVersions ?? input.packages ?? input.installed?.packages ?? {}
  const packages = {
    '@deepseek-ai/dsh-llm': packageEntry(SUPPORTED_DSH_PLUGIN_API_VERSION, suppliedPackages['@deepseek-ai/dsh-llm']),
    '@deepseek-ai/dsh-llm-pi-ai': packageEntry(SUPPORTED_DSH_PLUGIN_API_VERSION, suppliedPackages['@deepseek-ai/dsh-llm-pi-ai']),
    [PI_AI_PACKAGE]: packageEntry(SUPPORTED_PI_AI_VERSION, suppliedPackages[PI_AI_PACKAGE]),
  } as Record<CompatibilityPackageName, CompatibilityEntry>
  const node = nodeEntry(installedNode)
  return {
    schemaVersion: COMPATIBILITY_SCHEMA_VERSION,
    status: aggregateStatus([node, ...Object.values(packages)]),
    node,
    packages,
  }
}

/** Alias for callers that prefer assessment terminology. */
export const assessCompatibility = evaluateCompatibility

async function readPackageVersionFromEntry(name: CompatibilityPackageName): Promise<string | undefined> {
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
  const readVersion = options.readPackageVersion ?? readPackageVersionFromEntry
  const packageVersions = options.packageVersions ?? options.packages ?? options.installed?.packages
  const resolvedPackages = packageVersions === undefined
    ? Object.fromEntries(await Promise.all(COMPATIBILITY_PACKAGES.map(async name => [name, await readVersion(name)] as const)))
    : packageVersions
  return evaluateCompatibility({
    nodeVersion: options.nodeVersion ?? options.node ?? options.installed?.node ?? process.version,
    packageVersions: resolvedPackages,
  })
}
