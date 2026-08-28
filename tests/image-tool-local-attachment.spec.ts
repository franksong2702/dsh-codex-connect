import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { deflateSync } from 'node:zlib'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import LocalAttachmentStore from '@deepseek-ai/dsh-attachment-local'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { OpenAICodexImageAssetStore } from '../src/image-assets.ts'
import { detectEncodedImage } from '../src/image-format.ts'
import { imageGenerateTool, IMAGE_GENERATE_TOOL_NAME } from '../src/image-tool.ts'

function crc32(input: Uint8Array): number {
  let crc = 0xffff_ffff
  for (const byte of input) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb8_8320 : 0)
  }
  return (crc ^ 0xffff_ffff) >>> 0
}

function pngChunk(type: string, data: Uint8Array): Buffer {
  const name = Buffer.from(type, 'ascii')
  const chunk = Buffer.alloc(12 + data.byteLength)
  chunk.writeUInt32BE(data.byteLength, 0)
  name.copy(chunk, 4)
  Buffer.from(data).copy(chunk, 8)
  chunk.writeUInt32BE(crc32(chunk.subarray(4, 8 + data.byteLength)), 8 + data.byteLength)
  return chunk
}

function solidPng(width: number, height: number): Uint8Array {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  const scanlines = Buffer.alloc((width * 3 + 1) * height)
  const encoded = deflateSync(scanlines, { level: 9 })
  return Uint8Array.from(Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', encoded),
    pngChunk('IEND', Buffer.alloc(0)),
  ]))
}

const PNG_4K = solidPng(4096, 2160)
let context: Context | undefined
let root: string | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

describe('Codex image generation with DSH attachment normalization', () => {
  it('keeps exact original bytes while returning the canonical normalized preview', async () => {
    root = await mkdtemp(join(tmpdir(), 'codex-image-integration-'))
    const ctx = new Context()
    context = ctx
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime, { mode: 'native' })
    await ctx.plugin(LocalAttachmentStore, { dshHome: root, normalizedImageMaxDimension: 2048 })
    const assets = new OpenAICodexImageAssetStore(root)
    ctx.provide('openaiCodexTransport', {
      apiVersion: 1,
      async generateImages() {
        return {
          apiVersion: 1 as const,
          traceId: 'trace-normalized',
          elapsedMs: 1,
          responseBytes: PNG_4K.byteLength,
          images: [{ b64Json: Buffer.from(PNG_4K).toString('base64') }],
        }
      },
    })
    ctx.tools.register(imageGenerateTool(ctx, assets))
    const result = await ctx.tools.execute({
      signal: new AbortController().signal,
      callId: 'image-normalized' as never,
      name: IMAGE_GENERATE_TOOL_NAME,
      arguments: { prompt: 'keep the exact original' },
      agent: { id: 'session-normalized', options: {}, session: {} } as never,
    })

    expect(result.isError).toBe(false)
    if (result.isError) throw new Error('expected image generation to succeed')
    expect(result.value).toMatchObject({ images: [{
      original: { mediaType: 'image/png', width: 4096, height: 2160, bytes: PNG_4K.byteLength },
      preview: { mediaType: 'image/jpeg' },
    }] })
    const value = result.value as { images: Array<{ original: { assetId: string } }> }
    const stored = await assets.read('session-normalized', value.images[0]!.original.assetId)
    expect(stored?.data).toEqual(PNG_4K)
    const previewBlock = result.content.find(block => block.type === 'image')
    if (previewBlock?.type !== 'image') throw new Error('expected a durable preview attachment')
    const preview = previewBlock.attachment
    expect(preview.width).toBeGreaterThan(0)
    expect(preview.width).toBeLessThanOrEqual(2048)
    expect(preview.height).toBeGreaterThan(0)
    expect(preview.height).toBeLessThan(2160)
    expect(preview.width / preview.height).toBeCloseTo(4096 / 2160, 2)
    const normalized = await ctx.attachments.readImage(preview)
    expect(detectEncodedImage(normalized.data)).toMatchObject({
      mediaType: preview.mediaType, width: preview.width, height: preview.height,
    })
  })
})
