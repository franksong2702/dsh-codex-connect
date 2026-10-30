/** Secret-free runtime receipt shared by Host and browser; no Node imports. */
import { evaluateCompatibility, SUPPORTED_DSH_PLUGIN_API_RANGE, SUPPORTED_NODE_RANGE, SUPPORTED_PI_AI_RANGE } from './compatibility-policy.ts'
import type { CompatibilityEntry, CompatibilityReport, CompatibilityStatus } from './compatibility-policy.ts'

/** The observation surface, not proof that another process is running. */
export type OpenAICodexDiagnosticScope = 'standalone' | 'selected-installation' | 'host'
export type OpenAICodexPluginVersionState = 'match' | 'mismatch' | 'unknown'
export type OpenAICodexDshMetadataSource = 'plugin-installation' | 'explicit-install-anchor' | 'host-install-anchor' | 'unknown'

export interface OpenAICodexRuntimeIdentity {
  scope: OpenAICodexDiagnosticScope
  /** Version embedded in the code answering this diagnostic. */
  loadedPluginVersion: string
  /** Current manifest of that same plugin installation, not loaded code. */
  installedPluginVersion: string | null
  /** Version equality does not establish byte identity. */
  pluginVersionState: OpenAICodexPluginVersionState
  dshMetadataSource: OpenAICodexDshMetadataSource
}

export interface OpenAICodexRuntimeReport {
  schemaVersion: 1
  identity: OpenAICodexRuntimeIdentity & {
    scope: 'host'
    dshMetadataSource: 'host-install-anchor' | 'unknown'
  }
  /** Coherent selected installation metadata; not a loaded-module version. */
  currentDshVersion?: string
  compatibility: CompatibilityReport
}

/** Accept exact semantic versions only, never paths or arbitrary manifest text. */
export function isRuntimeMetadataVersion(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 128) return false
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u.exec(value)
  if (match === null) return false
  if (![match[1], match[2], match[3]].every(part => Number.isSafeInteger(Number(part)))) return false
  return match[4] === undefined || match[4].split('.').every(part => !/^\d+$/u.test(part) || part === '0' || !part.startsWith('0'))
}

/** Unknown installed metadata must never be represented as a match. */
export function openAICodexPluginVersionState(loaded: string, installed: string | null): OpenAICodexPluginVersionState {
  return installed === null ? 'unknown' : loaded === installed ? 'match' : 'mismatch'
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined
}

function status(value: unknown): value is CompatibilityStatus {
  return value === 'compatible' || value === 'unknown' || value === 'unverified' || value === 'incompatible'
}

const maximumSupportedRangeLength = Math.max(512, SUPPORTED_DSH_PLUGIN_API_RANGE.length, SUPPORTED_NODE_RANGE.length, SUPPORTED_PI_AI_RANGE.length)

function entry(value: unknown, node = false): CompatibilityEntry | undefined {
  const item = record(value)
  if (item === undefined || typeof item.supported !== 'string'
    || item.supported.length === 0 || item.supported.length > maximumSupportedRangeLength
    || !/^[0-9A-Za-z.*+^~<>=| -]+$/u.test(item.supported) || !status(item.status)) return undefined
  const installed = item.installed
  if (installed !== null) {
    if (typeof installed !== 'string' || !isRuntimeMetadataVersion(node && installed.startsWith('v') ? installed.slice(1) : installed)) return undefined
  }
  if (installed === null && item.status !== 'unknown') return undefined
  return { supported: item.supported, installed, status: item.status }
}

/** Validate and allowlist a fresh Host response; old empty receipts remain unknown. */
export function parseOpenAICodexRuntimeReport(value: unknown): OpenAICodexRuntimeReport | undefined {
  const report = record(value)
  if (report?.schemaVersion !== 1) return undefined
  const identity = record(report.identity)
  if (identity?.scope !== 'host' || !isRuntimeMetadataVersion(identity.loadedPluginVersion)
    || identity.installedPluginVersion !== null && !isRuntimeMetadataVersion(identity.installedPluginVersion)
    || identity.dshMetadataSource !== 'host-install-anchor' && identity.dshMetadataSource !== 'unknown') return undefined
  const installedPluginVersion = identity.installedPluginVersion
  const pluginVersionState = openAICodexPluginVersionState(identity.loadedPluginVersion, installedPluginVersion)
  if (identity.pluginVersionState !== pluginVersionState) return undefined

  const compatibility = record(report.compatibility)
  if (compatibility?.schemaVersion !== 1 || !status(compatibility.status)) return undefined
  const node = entry(compatibility.node, true)
  const packages = record(compatibility.packages)
  if (node === undefined || packages === undefined) return undefined
  const llm = entry(packages['@deepseek-ai/dsh-llm'])
  const adapter = entry(packages['@deepseek-ai/dsh-llm-pi-ai'])
  const compaction = entry(packages['@deepseek-ai/dsh-compaction'])
  const piAi = entry(packages['@earendil-works/pi-ai'])
  if (llm === undefined || adapter === undefined || compaction === undefined || piAi === undefined) return undefined
  // Recompute from versions using the same Node-free policy as the Host. A
  // syntactically valid status/range label is not evidence of compatibility.
  const computed = evaluateCompatibility({
    nodeVersion: node.installed,
    packageVersions: {
      '@deepseek-ai/dsh-llm': llm.installed,
      '@deepseek-ai/dsh-llm-pi-ai': adapter.installed,
      '@deepseek-ai/dsh-compaction': compaction.installed,
      '@earendil-works/pi-ai': piAi.installed,
    },
  })
  const entries = [
    [node, computed.node],
    [llm, computed.packages['@deepseek-ai/dsh-llm']],
    [adapter, computed.packages['@deepseek-ai/dsh-llm-pi-ai']],
    [compaction, computed.packages['@deepseek-ai/dsh-compaction']],
    [piAi, computed.packages['@earendil-works/pi-ai']],
  ] as const
  if (entries.some(([item, canonical]) => item.status !== canonical.status || item.supported !== canonical.supported)) return undefined
  if (identity.dshMetadataSource === 'unknown' && [llm, adapter, compaction].some(item => item.installed !== null)) return undefined
  const currentDshVersion = report.currentDshVersion
  if (currentDshVersion !== undefined && (!isRuntimeMetadataVersion(currentDshVersion)
    || identity.dshMetadataSource !== 'host-install-anchor'
    || [llm, adapter, compaction].some(item => item.installed !== currentDshVersion))) return undefined
  // The selected root can disagree with a coherent peer triple. Without the
  // root/triple version receipt it must remain unverified, never compatible.
  const computedStatus = computed.status === 'compatible' && currentDshVersion === undefined
    ? 'unverified' : computed.status
  if (compatibility.status !== computedStatus) return undefined
  return {
    schemaVersion: 1,
    identity: {
      scope: 'host',
      loadedPluginVersion: identity.loadedPluginVersion,
      installedPluginVersion,
      pluginVersionState,
      dshMetadataSource: identity.dshMetadataSource,
    },
    ...currentDshVersion === undefined ? {} : { currentDshVersion },
    compatibility: {
      schemaVersion: 1,
      status: computedStatus,
      node: computed.node,
      packages: {
        '@deepseek-ai/dsh-llm': computed.packages['@deepseek-ai/dsh-llm'],
        '@deepseek-ai/dsh-llm-pi-ai': computed.packages['@deepseek-ai/dsh-llm-pi-ai'],
        '@deepseek-ai/dsh-compaction': computed.packages['@deepseek-ai/dsh-compaction'],
        '@earendil-works/pi-ai': computed.packages['@earendil-works/pi-ai'],
      },
    },
  }
}
