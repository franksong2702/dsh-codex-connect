import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { parseOpenAICodexVerifiedCompatibility } from '../src/update.ts'

const catalog = {
  schemaVersion: 1 as const,
  checkedAt: '2026-09-11',
  latestDshVersion: '0.1.5-rc.1',
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
    { version: '0.1.0-alpha.4.25', verifiedDshVersions: ['0.1.2-alpha.5'] },
    { version: '0.1.0-alpha.4.26', verifiedDshVersions: ['0.1.2-rc.1'] },
    { version: '0.1.0-alpha.4.27', verifiedDshVersions: ['0.1.2-rc.1'] },
    { version: '0.1.0-alpha.4.28', verifiedDshVersions: ['0.1.2-rc.1'] },
    { version: '0.1.0-alpha.4.29', verifiedDshVersions: ['0.1.2-rc.1'] },
    { version: '0.1.0-alpha.4.30', verifiedDshVersions: ['0.1.2-rc.1'] },
    { version: '0.1.0-alpha.4.31', verifiedDshVersions: ['0.1.2-rc.1'] },
    { version: '0.1.0-alpha.4.32', verifiedDshVersions: ['0.1.2-rc.1'] },
    { version: '0.1.0-alpha.4.33', verifiedDshVersions: ['0.1.2-rc.1', '0.1.5-alpha.1'] },
    { version: '0.1.0-alpha.4.34', verifiedDshVersions: ['0.1.2-rc.1', '0.1.5-alpha.1', '0.1.5-rc.1', '0.1.5-rc.2'] },
    { version: '0.1.0-alpha.4.35', verifiedDshVersions: ['0.1.2-rc.1', '0.1.5-alpha.1', '0.1.5-rc.1', '0.1.5-rc.2'] },
  ],
}

describe('Codex Connect verified DSH compatibility', () => {
  it('keeps the committed public catalog valid', async () => {
    const contents = await readFile(new URL('../verified-compatibility.json', import.meta.url), 'utf8')
    expect(parseOpenAICodexVerifiedCompatibility(JSON.parse(contents) as unknown)).toMatchObject({
      latestDshVersion: '0.1.5-rc.1',
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

})
