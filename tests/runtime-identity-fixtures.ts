import type { OpenAICodexRuntimeReport } from '../src/runtime-identity.ts'
import { SUPPORTED_DSH_PLUGIN_API_RANGE } from '../src/compatibility-policy.ts'

/** Synthetic, credential-free evidence shared by unit and real-browser tests. */
export function runtimeReport(loaded = '0.2.0-alpha.4', installed: string | null = loaded): OpenAICodexRuntimeReport {
  const supported = SUPPORTED_DSH_PLUGIN_API_RANGE
  const entry = () => ({ supported, installed: '0.2.1-alpha.1', status: 'compatible' as const })
  return {
    schemaVersion: 1,
    identity: {
      scope: 'host', loadedPluginVersion: loaded, installedPluginVersion: installed,
      pluginVersionState: installed === null ? 'unknown' : installed === loaded ? 'match' : 'mismatch',
      dshMetadataSource: 'host-install-anchor',
    },
    currentDshVersion: '0.2.1-alpha.1',
    compatibility: {
      schemaVersion: 1, status: 'compatible',
      node: { supported: '^22.19.0 || >=24.0.0', installed: 'v24.21.0', status: 'compatible' },
      packages: {
        '@deepseek-ai/dsh-llm': entry(), '@deepseek-ai/dsh-llm-pi-ai': entry(), '@deepseek-ai/dsh-compaction': entry(),
        '@earendil-works/pi-ai': { supported: '0.85.1', installed: '0.85.1', status: 'compatible' },
      },
    },
  }
}

/** Valid shape but contradictory policy/root claims; none may become evidence. */
export function inconsistentRuntimeReports(): { name: string; report: OpenAICodexRuntimeReport }[] {
  const node20 = runtimeReport()
  node20.compatibility.node.installed = 'v20.0.0'
  const mixed = runtimeReport()
  delete mixed.currentDshVersion
  mixed.compatibility.packages['@deepseek-ai/dsh-compaction'].installed = '0.2.1-alpha.3'
  const piAi = runtimeReport()
  piAi.compatibility.packages['@earendil-works/pi-ai'].installed = '0.99.0'
  const future = runtimeReport()
  future.currentDshVersion = '9.0.0'
  for (const name of ['@deepseek-ai/dsh-llm', '@deepseek-ai/dsh-llm-pi-ai', '@deepseek-ai/dsh-compaction'] as const) {
    future.compatibility.packages[name].installed = '9.0.0'
  }
  const changedPolicy = runtimeReport()
  changedPolicy.compatibility.node.supported = '*'
  const missingRoot = runtimeReport()
  delete missingRoot.currentDshVersion
  const falseUnknown = runtimeReport()
  falseUnknown.compatibility.node.status = 'unknown'
  falseUnknown.compatibility.status = 'unknown'
  return [
    { name: 'unsupported Node labelled compatible', report: node20 },
    { name: 'mixed peers without currentDshVersion labelled compatible', report: mixed },
    { name: 'unverified pi-ai labelled compatible', report: piAi },
    { name: 'future DSH peers labelled compatible', report: future },
    { name: 'a forged supported policy range', report: changedPolicy },
    { name: 'compatible peers without a root coherence receipt', report: missingRoot },
    { name: 'known Node metadata labelled unknown', report: falseUnknown },
  ]
}
