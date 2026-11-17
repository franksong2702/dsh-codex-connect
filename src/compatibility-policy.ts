/** Shared deterministic policy for Host and browser; no filesystem, process or runtime imports. */
import { dshAdmission, dshPluginApi } from './dsh-admission.mjs'

export const COMPATIBILITY_SCHEMA_VERSION = 1 as const
export const SUPPORTED_NODE_RANGE = '^22.19.0 || >=24.0.0'
export const SUPPORTED_DSH_PLUGIN_API_VERSION = dshPluginApi.version
export const SUPPORTED_DSH_PLUGIN_API_VERSIONS = dshAdmission.verifiedVersions
export const SUPPORTED_DSH_PLUGIN_API_RANGE = dshAdmission.range
export const SUPPORTED_PI_AI_RANGE = '0.85.1'
export const PI_AI_PACKAGE = '@earendil-works/pi-ai'

export const DSH_PLUGIN_API_PACKAGES = [
  '@deepseek-ai/dsh-agent',
  '@deepseek-ai/dsh-atomic-write',
  '@deepseek-ai/dsh-attachment',
  '@deepseek-ai/dsh-client-ui-chat',
  '@deepseek-ai/dsh-client-ui-layout',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-tool',
  '@deepseek-ai/dsh-compaction',
  '@deepseek-ai/dsh-home-paths',
  '@deepseek-ai/dsh-host-webserver',
  '@deepseek-ai/dsh-llm',
  '@deepseek-ai/dsh-llm-pi-ai',
  '@deepseek-ai/dsh-fs',
  '@deepseek-ai/dsh-session',
  '@deepseek-ai/dsh-settings',
  '@deepseek-ai/dsh-timeout',
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
export type CompatibilityStatus = 'compatible' | 'unverified-in-range' | 'known-bad' | 'unverified' | 'incompatible' | 'unknown'

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

/** Public contract data mirrored by compatibility.json without importing JSON at runtime. */
export const COMPATIBILITY_CONTRACT = {
  schemaVersion: COMPATIBILITY_SCHEMA_VERSION,
  engines: { node: SUPPORTED_NODE_RANGE },
  dshPluginApi: {
    version: SUPPORTED_DSH_PLUGIN_API_VERSION,
    versions: dshPluginApi.versions,
    admission: dshPluginApi.admission,
    packages: DSH_PLUGIN_API_PACKAGES,
  },
  piAi: { package: PI_AI_PACKAGE, version: SUPPORTED_PI_AI_RANGE },
} as const

/** Whether this exact version has verified coverage and remains admitted. */
export function isSupportedDshPluginApiVersion(value: string): boolean {
  return dshAdmission.classify(value) === 'verified'
}

function dshVersionStatus(value: string): CompatibilityStatus {
  const admission = dshAdmission.classify(value)
  if (admission === 'verified') return 'compatible'
  if (admission === 'outside-range') return 'unverified'
  return admission
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
  if (entries.some(entry => entry.status === 'known-bad')) return 'known-bad'
  if (entries.some(entry => entry.status === 'incompatible')) return 'incompatible'
  if (entries.some(entry => entry.status === 'unknown')) return 'unknown'
  if (entries.some(entry => entry.status === 'unverified')) return 'unverified'
  if (entries.some(entry => entry.status === 'unverified-in-range')) return 'unverified-in-range'
  return 'compatible'
}

/** Evaluate a captured set of versions without touching the filesystem. */
export function evaluateCompatibility(input: CompatibilityEvaluationInput = {}): CompatibilityReport {
  const installedNode = input.nodeVersion ?? input.node ?? input.installed?.node
  const suppliedPackages = input.packageVersions ?? input.packages ?? input.installed?.packages ?? {}
  const packages = {
    '@deepseek-ai/dsh-llm': packageEntry(SUPPORTED_DSH_PLUGIN_API_RANGE, suppliedPackages['@deepseek-ai/dsh-llm'], dshVersionStatus),
    '@deepseek-ai/dsh-llm-pi-ai': packageEntry(SUPPORTED_DSH_PLUGIN_API_RANGE, suppliedPackages['@deepseek-ai/dsh-llm-pi-ai'], dshVersionStatus),
    '@deepseek-ai/dsh-compaction': packageEntry(SUPPORTED_DSH_PLUGIN_API_RANGE, suppliedPackages['@deepseek-ai/dsh-compaction'], dshVersionStatus),
    [PI_AI_PACKAGE]: packageEntry(SUPPORTED_PI_AI_RANGE, suppliedPackages[PI_AI_PACKAGE], piAiVersionStatus),
  } as Record<CompatibilityPackageName, CompatibilityEntry>
  const node = nodeEntry(installedNode)
  const status = aggregateStatus([node, ...Object.values(packages)])
  const dshVersion = packages['@deepseek-ai/dsh-llm'].installed
  const piVersion = packages[PI_AI_PACKAGE].installed
  const matchedPair = dshVersion === packages['@deepseek-ai/dsh-llm-pi-ai'].installed
    && dshVersion === packages['@deepseek-ai/dsh-compaction'].installed
    && typeof dshVersion === 'string'
    && piVersion === SUPPORTED_PI_AI_RANGE
  return {
    schemaVersion: COMPATIBILITY_SCHEMA_VERSION,
    status: (status === 'compatible' || status === 'unverified-in-range') && !matchedPair ? 'unverified' : status,
    node,
    packages,
  }
}

/** Alias for callers that prefer assessment terminology. */
export const assessCompatibility = evaluateCompatibility
