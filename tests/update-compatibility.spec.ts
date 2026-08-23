import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import {
  evaluateOpenAICodexDshCompatibility,
  parseOpenAICodexVerifiedCompatibility,
} from '../src/update.ts'

const catalog = {
  schemaVersion: 1 as const,
  checkedAt: '2026-08-23',
  latestDshVersion: '0.1.1-rc.2',
  pluginVersions: [
    { version: '0.1.0-alpha.4.14', verifiedDshVersions: ['0.1.0-rc.7'] },
    { version: '0.1.0-alpha.4.15', verifiedDshVersions: ['0.1.1-rc.2'] },
    { version: '0.1.0-alpha.4.16', verifiedDshVersions: ['0.1.1-rc.2'] },
  ],
}

describe('Codex Connect verified DSH compatibility', () => {
  it('keeps the committed public catalog valid', async () => {
    const contents = await readFile(new URL('../verified-compatibility.json', import.meta.url), 'utf8')
    expect(parseOpenAICodexVerifiedCompatibility(JSON.parse(contents) as unknown)).toBeDefined()
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

  it('returns green only for the exact installed plugin and latest DSH pair', () => {
    expect(evaluateOpenAICodexDshCompatibility('0.1.0-alpha.4.15', '0.1.0-alpha.4.15', catalog)).toEqual({
      status: 'compatible',
      latestPluginVersion: '0.1.0-alpha.4.15',
      latestDshVersion: '0.1.1-rc.2',
    })
    expect(evaluateOpenAICodexDshCompatibility('0.1.0-alpha.4.16', '0.1.0-alpha.4.16', catalog)).toEqual({
      status: 'compatible',
      latestPluginVersion: '0.1.0-alpha.4.16',
      latestDshVersion: '0.1.1-rc.2',
    })
  })

  it('returns yellow when only the latest plugin has been verified', () => {
    expect(evaluateOpenAICodexDshCompatibility('0.1.0-alpha.4.14', '0.1.0-alpha.4.15', catalog)).toEqual({
      status: 'plugin-update-required',
      latestPluginVersion: '0.1.0-alpha.4.15',
      latestDshVersion: '0.1.1-rc.2',
    })
  })

  it('returns red when no published plugin is verified and gray when the record is unavailable', () => {
    expect(evaluateOpenAICodexDshCompatibility('0.1.0-alpha.4.14', '0.1.0-alpha.4.17', catalog)).toEqual({
      status: 'not-yet-compatible',
      latestPluginVersion: '0.1.0-alpha.4.17',
      latestDshVersion: '0.1.1-rc.2',
    })
    expect(evaluateOpenAICodexDshCompatibility('0.1.0-alpha.4.15', '0.1.0-alpha.4.15')).toEqual({
      status: 'unverified',
      latestPluginVersion: '0.1.0-alpha.4.15',
    })
  })
})
