import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import {
  evaluateOpenAICodexDshCompatibility,
  parseOpenAICodexVerifiedCompatibility,
} from '../src/update.ts'

const catalog = {
  schemaVersion: 1 as const,
  checkedAt: '2026-09-02',
  latestDshVersion: '0.1.2-alpha.5',
  pluginVersions: [
    { version: '0.1.0-alpha.4.14', verifiedDshVersions: ['0.1.0-rc.7'] },
    { version: '0.1.0-alpha.4.15', verifiedDshVersions: ['0.1.1-rc.2'] },
    { version: '0.1.0-alpha.4.16', verifiedDshVersions: ['0.1.1-rc.2'] },
    { version: '0.1.0-alpha.4.17', verifiedDshVersions: ['0.1.1-rc.2'] },
    { version: '0.1.0-alpha.4.18', verifiedDshVersions: ['0.1.1-rc.2'] },
    { version: '0.1.0-alpha.4.19', verifiedDshVersions: ['0.1.1-rc.2'] },
    { version: '0.1.0-alpha.4.20', verifiedDshVersions: ['0.1.1-rc.2'] },
    { version: '0.1.0-alpha.4.21', verifiedDshVersions: ['0.1.1-rc.2'] },
    { version: '0.1.0-alpha.4.22', verifiedDshVersions: ['0.1.2-alpha.2'] },
    { version: '0.1.0-alpha.4.23', verifiedDshVersions: ['0.1.2-alpha.2'] },
    { version: '0.1.0-alpha.4.24', verifiedDshVersions: ['0.1.2-alpha.5'] },
  ],
}

describe('Codex Connect verified DSH compatibility', () => {
  it('keeps the committed public catalog valid', async () => {
    const contents = await readFile(new URL('../verified-compatibility.json', import.meta.url), 'utf8')
    expect(parseOpenAICodexVerifiedCompatibility(JSON.parse(contents) as unknown)).toMatchObject({
      latestDshVersion: '0.1.2-alpha.5',
      pluginVersions: catalog.pluginVersions,
    })
  })

  it('parses exact plugin-to-DSH verification records', () => {
    expect(parseOpenAICodexVerifiedCompatibility(catalog)).toEqual(catalog)
    expect(parseOpenAICodexVerifiedCompatibility({ ...catalog, schemaVersion: 2 })).toBeUndefined()
    expect(parseOpenAICodexVerifiedCompatibility({
      ...catalog,
      pluginVersions: [catalog.pluginVersions[1], catalog.pluginVersions[1]],
    })).toBeUndefined()
    expect(parseOpenAICodexVerifiedCompatibility({
      ...catalog,
      pluginVersions: [{ version: '0.1.0-alpha.4.15', verifiedDshVersions: ['bad-version'] }],
    })).toBeUndefined()
  })

  it('returns green for exact current plugin and DSH pairs, including a historical DSH release', () => {
    expect(evaluateOpenAICodexDshCompatibility('0.1.0-alpha.4.14', '0.1.0-alpha.4.16', '0.1.0-rc.7', catalog)).toEqual({
      status: 'compatible',
      latestPluginVersion: '0.1.0-alpha.4.16',
      latestDshVersion: '0.1.2-alpha.5',
    })
    expect(evaluateOpenAICodexDshCompatibility('0.1.0-alpha.4.20', '0.1.0-alpha.4.20', '0.1.1-rc.2', catalog)).toEqual({
      status: 'compatible',
      latestPluginVersion: '0.1.0-alpha.4.20',
      latestDshVersion: '0.1.2-alpha.5',
    })
  })

  it('returns yellow when only the latest plugin has been verified', () => {
    expect(evaluateOpenAICodexDshCompatibility('0.1.0-alpha.4.14', '0.1.0-alpha.4.15', '0.1.1-rc.2', catalog)).toEqual({
      status: 'plugin-update-required',
      latestPluginVersion: '0.1.0-alpha.4.15',
      latestDshVersion: '0.1.2-alpha.5',
    })
  })

  it('returns red only for a known DSH version with no current or latest plugin match', () => {
    expect(evaluateOpenAICodexDshCompatibility('0.1.0-alpha.4.13', '0.1.0-alpha.4.17', '0.1.0-rc.7', catalog)).toEqual({
      status: 'not-yet-compatible',
      latestPluginVersion: '0.1.0-alpha.4.17',
      latestDshVersion: '0.1.2-alpha.5',
    })
    expect(evaluateOpenAICodexDshCompatibility('0.1.0-alpha.4.16', '0.1.0-alpha.4.17', '0.1.2-alpha.5', {
      ...catalog,
      pluginVersions: [],
    })).toEqual({
      status: 'not-yet-compatible',
      latestPluginVersion: '0.1.0-alpha.4.17',
      latestDshVersion: '0.1.2-alpha.5',
    })
  })

  it('returns gray for an unknown DSH version, missing local detection, or an unavailable catalog', () => {
    expect(evaluateOpenAICodexDshCompatibility('0.1.0-alpha.4.16', '0.1.0-alpha.4.16', '0.1.1-rc.3', catalog)).toEqual({
      status: 'unverified',
      latestPluginVersion: '0.1.0-alpha.4.16',
      latestDshVersion: '0.1.2-alpha.5',
    })
    expect(evaluateOpenAICodexDshCompatibility('0.1.0-alpha.4.16', '0.1.0-alpha.4.16', undefined, catalog)).toEqual({
      status: 'unverified',
      latestPluginVersion: '0.1.0-alpha.4.16',
      latestDshVersion: '0.1.2-alpha.5',
    })
    expect(evaluateOpenAICodexDshCompatibility('0.1.0-alpha.4.15', '0.1.0-alpha.4.15', '0.1.1-rc.2')).toEqual({
      status: 'unverified',
      latestPluginVersion: '0.1.0-alpha.4.15',
    })
  })
})
