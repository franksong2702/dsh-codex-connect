import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
interface IsolatedDom {
  window: {
    document: {
      querySelector(selector: 'button'): {
        addEventListener(type: 'click', listener: () => void): void
        click(): void
      } | null
      querySelector(selector: 'output'): { textContent: string | null } | null
    }
    close(): void
  }
}
const { JSDOM } = require('jsdom') as { JSDOM: new (html: string) => IsolatedDom }
const defaultModelRequire = createRequire(require.resolve('@deepseek-ai/dsh-agent-default-model'))
const includeRequire = createRequire(require.resolve('@deepseek-ai/cordis-plugin-include'))
const attachmentRequire = createRequire(require.resolve('@deepseek-ai/dsh-attachment-local'))

// Resolve the dependencies used by the host consumers, not separate test-only copies.
const yaml = defaultModelRequire('js-yaml') as {
  load(source: string, options?: { maxTotalMergeKeys: number }): unknown
}
interface ImagePipeline {
  avif(): ImagePipeline
  jpeg(): ImagePipeline
  webp(): ImagePipeline
  gif(): ImagePipeline
  png(): ImagePipeline
  ensureAlpha(alpha?: number): ImagePipeline
  withMetadata(options: { orientation: number }): ImagePipeline
  toBuffer(): Promise<Buffer>
  metadata(): Promise<{
    format?: string; width?: number; height?: number; hasAlpha?: boolean
    orientation?: number; exif?: Buffer; icc?: Buffer
  }>
}
function loadSharp() {
  return attachmentRequire('sharp') as {
    (input: Buffer): ImagePipeline
    versions: { sharp?: string; heif?: string; rsvg?: string }
  }
}
const sharpRequire = createRequire(attachmentRequire.resolve('sharp'))
const semver = sharpRequire('semver') as {
  gte(version: string, minimum: string): boolean
  satisfies(version: string, range: string): boolean
}
const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC', 'base64')

function consumerRequire(...chain: string[]): NodeJS.Require {
  return chain.reduce((consumer, name) => createRequire(consumer.resolve(name)), require)
}

function dependencyVersion(consumer: NodeJS.Require, name: string): string {
  let directory = dirname(consumer.resolve(name))
  for (;;) {
    const manifest = join(directory, 'package.json')
    if (existsSync(manifest)) {
      const metadata = JSON.parse(readFileSync(manifest, 'utf8')) as { name?: string; version?: string }
      if (metadata.name === name && metadata.version) return metadata.version
    }
    const parent = dirname(directory)
    if (parent === directory) throw new Error(`Cannot locate metadata for ${name}`)
    directory = parent
  }
}

// These are local development consumers; independently installed Host packages are not repaired here.
describe('host development dependency security regressions', () => {
  it.each([
    [[], 'undici', '8.12.3', 8],
    [['jsdom'], 'undici', '7.29.1', 7],
    [['@deepseek-ai/dsh-attachment-local'], 'sharp', '0.35.5', 0],
    [['@deepseek-ai/dsh-host-webserver'], 'compression', '1.8.2', 1],
    [['vitest', 'vite', 'postcss'], 'source-map-js', '1.2.2', 1],
    [['jsdom', 'css-tree'], 'source-map-js', '1.2.2', 1],
    [['eslint', '@eslint/config-array', 'minimatch'], 'brace-expansion', '5.0.12', 5],
    [['typescript-eslint', '@typescript-eslint/typescript-estree', 'minimatch'], 'brace-expansion', '5.0.12', 5],
  ] as const)('keeps the patched consumer floor for %j → %s', (chain, name, minimum, major) => {
    const version = dependencyVersion(consumerRequire(...chain), name)
    expect(semver.gte(version, minimum)).toBe(true)
    expect(Number(version.split('.')[0])).toBe(major)
    if (name === 'sharp') expect(version.startsWith('0.35.')).toBe(true)
  })

  it('excludes vulnerable product Undici manifest resolutions without moving the patched lock copy', () => {
    const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
      dependencies: { undici: string }
    }
    expect(semver.satisfies('8.10.0', manifest.dependencies.undici)).toBe(false)
    expect(semver.satisfies('8.10.1', manifest.dependencies.undici)).toBe(false)
    for (const version of ['8.11.2', '8.12.0', '8.12.1', '8.12.2', '9.0.0']) {
      expect(semver.satisfies(version, manifest.dependencies.undici)).toBe(false)
    }
    for (const version of ['8.12.3', '8.12.4', '8.13.0']) {
      expect(semver.satisfies(version, manifest.dependencies.undici)).toBe(true)
    }
  })

  it('uses patched librsvg and retains the libheif floor in the loaded native artifact', () => {
    const sharp = loadSharp()
    expect(sharp.versions.sharp).toBeDefined()
    expect(semver.gte(sharp.versions.sharp!, '0.35.5')).toBe(true)
    expect(sharp.versions.rsvg).toBeDefined()
    expect(semver.gte(sharp.versions.rsvg!, '2.63.2')).toBe(true)
    expect(sharp.versions.heif).toBeDefined()
    expect(semver.gte(sharp.versions.heif!, '1.23.2')).toBe(true)
  })

  it.each(['png', 'jpeg', 'webp', 'gif'] as const)('retains ordinary %s image decoding and PNG normalization', async format => {
    const sharp = loadSharp()
    const encoded = await sharp(pixel)[format]().toBuffer()
    expect(await sharp(encoded).metadata()).toMatchObject({ format, width: 1, height: 1 })
    const normalized = await sharp(encoded).png().toBuffer()
    expect(await sharp(normalized).metadata()).toMatchObject({ format: 'png', width: 1, height: 1 })
  })

  it('retains alpha channels and strips ordinary image metadata on normalization', async () => {
    const sharp = loadSharp()
    const transparent = await sharp(pixel).ensureAlpha(0.5).png().toBuffer()
    const alphaRoundTrip = await sharp(transparent).png().toBuffer()
    expect(await sharp(alphaRoundTrip).metadata()).toMatchObject({
      format: 'png', width: 1, height: 1, hasAlpha: true,
    })
    const annotated = await sharp(pixel).withMetadata({ orientation: 1 }).jpeg().toBuffer()
    expect((await sharp(annotated).metadata()).orientation).toBe(1)
    const stripped = await sharp(annotated).png().toBuffer()
    const metadata = await sharp(stripped).metadata()
    expect(metadata).toMatchObject({ format: 'png', width: 1, height: 1 })
    expect(metadata.orientation).toBeUndefined()
    expect(metadata.exif).toBeUndefined()
    expect(metadata.icc).toBeUndefined()
  })

  it('retains ordinary CSS previous-map consumption', () => {
    const sourceMap = consumerRequire('vitest', 'vite', 'postcss')('source-map-js') as {
      SourceMapGenerator: new () => {
        addMapping(mapping: unknown): void
        toString(): string
      }
      SourceMapConsumer: new (source: string) => {
        originalPositionFor(position: { line: number; column: number }): unknown
      }
    }
    const map = new sourceMap.SourceMapGenerator()
    map.addMapping({ generated: { line: 1, column: 0 }, original: { line: 3, column: 2 }, source: 'ordinary.css' })
    expect(new sourceMap.SourceMapConsumer(map.toString()).originalPositionFor({ line: 1, column: 0 }))
      .toMatchObject({ source: 'ordinary.css', line: 3, column: 2 })
  })

  it('retains ordinary isolated UI events and DOM rendering without external resources', () => {
    const dom = new JSDOM('<button type="button">Select account</button><output></output>')
    try {
      const button = dom.window.document.querySelector('button')!
      const output = dom.window.document.querySelector('output')!
      button.addEventListener('click', () => { output.textContent = 'Selected' })
      button.click()
      expect(output.textContent).toBe('Selected')
    } finally {
      dom.window.close()
    }
  })

  it('retains ordinary lint brace patterns', () => {
    const minimatch = consumerRequire('eslint', '@eslint/config-array')('minimatch') as {
      minimatch(path: string, pattern: string): boolean
    }
    expect(minimatch.minimatch('src/example.ts', 'src/*.{ts,tsx}')).toBe(true)
    expect(minimatch.minimatch('src/example.tsx', 'src/*.{ts,tsx}')).toBe(true)
    expect(minimatch.minimatch('src/example.js', 'src/*.{ts,tsx}')).toBe(false)
  })

  it.each([
    'empty: &empty [{}, {}, {}]\ntarget: {<<: *empty}\n',
    'empty: &empty {}\ntarget: {<<: [*empty, *empty, *empty]}\n',
  ])('counts empty mappings against the YAML merge budget (%#)', source => {
    expect(() => yaml.load(source, { maxTotalMergeKeys: 1 })).toThrow(/merge/iu)
  })

  it('retains ordinary YAML merges and uses one parser for both host consumers', () => {
    expect(includeRequire.resolve('js-yaml')).toBe(defaultModelRequire.resolve('js-yaml'))
    expect(yaml.load('defaults: &defaults {model: astra}\nselected: {<<: *defaults, enabled: true}\n'))
      .toEqual({ defaults: { model: 'astra' }, selected: { model: 'astra', enabled: true } })
  })

  it('uses patched libheif while retaining an AVIF decode and PNG round trip', async () => {
    const sharp = loadSharp()
    expect(sharp.versions.heif).toBeDefined()
    expect(semver.gte(sharp.versions.heif!, '1.23.2')).toBe(true)
    const avif = await sharp(pixel).avif().toBuffer()
    const png = await sharp(avif).png().toBuffer()
    expect(await sharp(png).metadata()).toMatchObject({ format: 'png', width: 1, height: 1 })
    await expect(sharp(Buffer.from('invalid-image')).metadata()).rejects.toThrow()
  })
})
