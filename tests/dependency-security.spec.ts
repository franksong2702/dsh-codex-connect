import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const presetRequire = createRequire(require.resolve('@deepseek-ai/dsh-agent-presets'))
const includeRequire = createRequire(require.resolve('@deepseek-ai/cordis-plugin-include'))
const attachmentRequire = createRequire(require.resolve('@deepseek-ai/dsh-attachment-local'))

// Resolve the dependencies used by the host consumers, not separate test-only copies.
const yaml = presetRequire('js-yaml') as {
  load(source: string, options?: { maxTotalMergeKeys: number }): unknown
}
interface ImagePipeline {
  avif(): ImagePipeline
  png(): ImagePipeline
  toBuffer(): Promise<Buffer>
  metadata(): Promise<{ format?: string; width?: number; height?: number }>
}
const sharp = attachmentRequire('sharp') as {
  (input: Buffer): ImagePipeline
  versions: { heif?: string }
}
const sharpRequire = createRequire(attachmentRequire.resolve('sharp'))
const semver = sharpRequire('semver') as { gte(version: string, minimum: string): boolean }
const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC', 'base64')

describe('host development dependency security regressions', () => {
  it.each([
    'empty: &empty [{}, {}, {}]\ntarget: {<<: *empty}\n',
    'empty: &empty {}\ntarget: {<<: [*empty, *empty, *empty]}\n',
  ])('counts empty mappings against the YAML merge budget (%#)', source => {
    expect(() => yaml.load(source, { maxTotalMergeKeys: 1 })).toThrow(/merge/iu)
  })

  it('retains ordinary YAML merges and uses one parser for both host consumers', () => {
    expect(includeRequire.resolve('js-yaml')).toBe(presetRequire.resolve('js-yaml'))
    expect(yaml.load('defaults: &defaults {model: astra}\nselected: {<<: *defaults, enabled: true}\n'))
      .toEqual({ defaults: { model: 'astra' }, selected: { model: 'astra', enabled: true } })
  })

  it('uses patched libheif while retaining an AVIF decode and PNG round trip', async () => {
    expect(sharp.versions.heif).toBeDefined()
    expect(semver.gte(sharp.versions.heif!, '1.23.2')).toBe(true)
    const avif = await sharp(pixel).avif().toBuffer()
    const png = await sharp(avif).png().toBuffer()
    expect(await sharp(png).metadata()).toMatchObject({ format: 'png', width: 1, height: 1 })
    await expect(sharp(Buffer.from('invalid-image')).metadata()).rejects.toThrow()
  })
})
