import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { compareOpenAICodexVersions, parseOpenAICodexVerifiedCompatibility } from '../src/update.ts'

describe('independent plugin versioning', () => {
  it('orders the existing counter and a possible future sequence above the current release', () => {
    expect(compareOpenAICodexVersions('0.1.0-alpha.4.30', '0.1.0-alpha.4.29')).toBeGreaterThan(0)
    expect(compareOpenAICodexVersions('0.2.0-alpha.1', '0.1.0-alpha.4.29')).toBeGreaterThan(0)
    expect(compareOpenAICodexVersions('0.1.0-alpha.1', '0.1.0-alpha.4.29')).toBeLessThan(0)
  })

  it('does not treat build metadata as an available update', () => {
    expect(compareOpenAICodexVersions('0.1.2-rc.1+build.5', '0.1.2-rc.1+build.0')).toBe(0)
  })

  it('orders phases independently of the host version', () => {
    const versions = ['0.2.0-alpha.1', '0.2.0-alpha.2', '0.2.0-beta.1', '0.2.0-rc.1', '0.2.0', '0.2.1']
    for (let index = 1; index < versions.length; index += 1) {
      expect(compareOpenAICodexVersions(versions[index]!, versions[index - 1]!)).toBeGreaterThan(0)
    }
  })

  it('keeps compatibility evidence readable by the existing V1 consumer', async () => {
    const value: unknown = JSON.parse(await readFile(new URL('../verified-compatibility.json', import.meta.url), 'utf8'))
    const parsed = parseOpenAICodexVerifiedCompatibility(value)
    expect(parsed?.schemaVersion).toBe(1)
    expect(parsed?.pluginVersions).toEqual(expect.arrayContaining([
      { version: '0.1.0-alpha.4.14', verifiedDshVersions: ['0.1.0-rc.7'] },
      { version: '0.1.0-alpha.4.29', verifiedDshVersions: ['0.1.2-rc.1'] },
    ]))
    expect(parseOpenAICodexVerifiedCompatibility({
      '0.1.0-alpha.4.29': { primary_target: '0.1.2-rc.1', verified_with: ['0.1.2-rc.1'] },
    })).toBeUndefined()
  })

  it('records the reviewed bilingual policy and preserves shared identifiers', async () => {
    const record = await readFile(new URL('../docs/versioning.i18n.yaml', import.meta.url), 'utf8')
    for (const path of ['VERSIONING.md', 'docs/VERSIONING.zh.md']) {
      const bytes = await readFile(new URL(`../${path}`, import.meta.url))
      const hash = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')
      expect(record).toContain(`${path}: ${hash}`)
      for (const term of ['0.1.0-alpha.4.x', '+build.n', '0.2.0-alpha.1', 'schemaVersion: 1', 'pnpm run check', 'pnpm run test:browser', 'pnpm run check:dsh-install']) {
        expect(bytes.toString('utf8')).toContain(term)
      }
    }
  })

  it('includes both policy documents in the package configuration', async () => {
    const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as { files: string[] }
    expect(manifest.files).toContain('VERSIONING.md')
    expect(manifest.files).toContain('docs')
  })
})
