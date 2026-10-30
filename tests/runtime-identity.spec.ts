import { describe, expect, it } from 'vitest'
import { evaluateCompatibility, LOCAL_DSH_PLUGIN_API_VERSIONS, SUPPORTED_DSH_PLUGIN_API_VERSIONS } from '../src/compatibility-policy.ts'
import { inconsistentRuntimeReports } from './runtime-identity-fixtures.ts'
import {
  isRuntimeMetadataVersion,
  parseOpenAICodexRuntimeReport,
} from '../src/runtime-identity.ts'
import type { OpenAICodexRuntimeReport } from '../src/runtime-identity.ts'

function receipt(): OpenAICodexRuntimeReport {
  return {
    schemaVersion: 1,
    identity: {
      scope: 'host',
      loadedPluginVersion: '0.2.0-alpha.4',
      installedPluginVersion: '0.2.0-alpha.4',
      pluginVersionState: 'match',
      dshMetadataSource: 'host-install-anchor',
    },
    currentDshVersion: '0.2.0-rc.2',
    compatibility: evaluateCompatibility({ nodeVersion: 'v24.21.0', packageVersions: {
      '@deepseek-ai/dsh-llm': '0.2.0-rc.2',
      '@deepseek-ai/dsh-llm-pi-ai': '0.2.0-rc.2',
      '@deepseek-ai/dsh-compaction': '0.2.0-rc.2',
      '@earendil-works/pi-ai': '0.85.1',
    } }),
  }
}

describe('node-free runtime receipt decoder', () => {
  it('projects only allowlisted fields and does not reuse arbitrary server currentVersion', () => {
    const report = receipt()
    const input = {
      ...report,
      currentVersion: '0.2.0-alpha.5',
      path: '/private/fixture-installation',
      access_token: 'must-not-leak',
      identity: { ...report.identity, profileId: 'private-profile' },
      compatibility: { ...report.compatibility, credentialFile: { path: '/private/credential' } },
    }
    expect(parseOpenAICodexRuntimeReport(input)).toEqual(report)
    expect(JSON.stringify(parseOpenAICodexRuntimeReport(input))).not.toMatch(/private|must-not-leak|currentVersion/u)
  })

  it('represents missing installed or Host DSH metadata as unknown, not a match', () => {
    const report: OpenAICodexRuntimeReport = {
      schemaVersion: 1,
      identity: { ...receipt().identity, installedPluginVersion: null, pluginVersionState: 'unknown', dshMetadataSource: 'unknown' },
      compatibility: evaluateCompatibility({ nodeVersion: 'v24.21.0', packageVersions: { '@earendil-works/pi-ai': '0.85.1' } }),
    }
    expect(parseOpenAICodexRuntimeReport(report)).toEqual(report)
    expect(parseOpenAICodexRuntimeReport({ ...report, identity: { ...report.identity, pluginVersionState: 'match' } })).toBeUndefined()
    expect(parseOpenAICodexRuntimeReport({ ...report, compatibility: { ...report.compatibility, status: 'compatible' } })).toBeUndefined()
  })

  it('preserves declared version mismatches without interpreting them as byte or process identity', () => {
    const report = receipt()
    report.identity.installedPluginVersion = '0.2.0-alpha.5'
    report.identity.pluginVersionState = 'mismatch'
    expect(parseOpenAICodexRuntimeReport(report)).toEqual(report)
    report.identity.pluginVersionState = 'match'
    expect(parseOpenAICodexRuntimeReport(report)).toBeUndefined()
  })

  it.each([undefined, null, {}, [], { schemaVersion: 2 }, { currentDshVersion: '0.2.0-rc.2' }])('rejects old or malformed receipt %j', input => {
    expect(parseOpenAICodexRuntimeReport(input)).toBeUndefined()
  })

  it.each([
    (report: Record<string, any>) => { report.identity.scope = 'standalone' },
    (report: Record<string, any>) => { report.identity.dshMetadataSource = 'plugin-installation' },
    (report: Record<string, any>) => { report.identity.loadedPluginVersion = '/private/token' },
    (report: Record<string, any>) => { report.identity.installedPluginVersion = '0.2.0-alpha.04' },
    (report: Record<string, any>) => { delete report.identity.installedPluginVersion },
    (report: Record<string, any>) => { report.compatibility.schemaVersion = 2 },
    (report: Record<string, any>) => { report.compatibility.node.installed = '/private/node' },
    (report: Record<string, any>) => { report.compatibility.packages['@deepseek-ai/dsh-llm'].supported += 'X'.repeat(1024) },
    (report: Record<string, any>) => { report.compatibility.packages['@deepseek-ai/dsh-llm'].installed = null },
    (report: Record<string, any>) => { delete report.compatibility.packages['@deepseek-ai/dsh-compaction'] },
    (report: Record<string, any>) => { report.currentDshVersion = '0.2.1-alpha.3' },
    (report: Record<string, any>) => { report.identity.dshMetadataSource = 'unknown' },
  ])('rejects invalid or incoherent metadata without trusting a compatible label', mutate => {
    const report = receipt()
    mutate(report)
    expect(parseOpenAICodexRuntimeReport(report)).toBeUndefined()
  })

  it.each(inconsistentRuntimeReports())('rejects $name instead of aggregating incoming labels', ({ report }) => {
    expect(parseOpenAICodexRuntimeReport(report)).toBeUndefined()
  })

  it.each([...SUPPORTED_DSH_PLUGIN_API_VERSIONS, ...LOCAL_DSH_PLUGIN_API_VERSIONS])('preserves the exact coherent %s policy', version => {
    const report = receipt()
    report.currentDshVersion = version
    for (const name of ['@deepseek-ai/dsh-llm', '@deepseek-ai/dsh-llm-pi-ai', '@deepseek-ai/dsh-compaction'] as const) {
      report.compatibility.packages[name].installed = version
    }
    expect(parseOpenAICodexRuntimeReport(report)).toEqual(report)
  })

  it('preserves truthful incompatible/unverified reports and Node precedence', () => {
    for (const { report } of inconsistentRuntimeReports().slice(0, 4)) {
      report.compatibility = evaluateCompatibility({
        nodeVersion: report.compatibility.node.installed,
        packageVersions: Object.fromEntries(Object.entries(report.compatibility.packages).map(([name, item]) => [name, item.installed])),
      })
      expect(report.compatibility.status).not.toBe('compatible')
      expect(parseOpenAICodexRuntimeReport(report)).toEqual(report)
    }
  })

  it('preserves an anchored root mismatch only as unverified when peers themselves are coherent', () => {
    const report = receipt()
    delete report.currentDshVersion
    report.compatibility.status = 'unverified'
    expect(parseOpenAICodexRuntimeReport(report)).toEqual(report)
    report.compatibility.status = 'compatible'
    expect(parseOpenAICodexRuntimeReport(report)).toBeUndefined()
  })

  it('validates exact semantic version metadata without normalizing its spelling', () => {
    for (const version of ['0.2.0-alpha.4', '0.2.0', '0.2.0-alpha.4+fixture']) expect(isRuntimeMetadataVersion(version)).toBe(true)
    for (const version of ['', 'v0.2.0', ' 0.2.0', '0.2.0-alpha.04', '0.2.0-', '999999999999999999999.0.0']) expect(isRuntimeMetadataVersion(version)).toBe(false)
  })
})
