import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import type { ImageAttachmentLimits, SaveImageAttachment } from '@deepseek-ai/dsh-attachment'
import { imageGenerateTool, IMAGE_GENERATE_TOOL_NAME } from '../src/image-tool.ts'
import type { OpenAICodexImageAssetStore, SaveOpenAICodexOriginalImage } from '../src/image-assets.ts'

const PNG_1X1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC', 'base64')
const signal = new AbortController().signal
let context: Context | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
})

function b64(data: Uint8Array): string {
  return Buffer.from(data).toString('base64')
}

function agent(id: string): never {
  return { id, options: {}, session: {} } as never
}

async function setup(options: {
  generateImages?: (input: { prompt: string }, request: { signal?: AbortSignal }) => Promise<unknown>
  limits?: Partial<ImageAttachmentLimits>
  saveImages?: (inputs: readonly SaveImageAttachment[]) => Promise<readonly unknown[]>
  saveOriginals?: (sessionId: string, inputs: readonly SaveOpenAICodexOriginalImage[]) => Promise<readonly unknown[]>
} = {}) {
  const ctx = new Context()
  context = ctx
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime, { mode: 'native' })
  const saved: SaveImageAttachment[][] = []
  ctx.provide('attachments', {
    imageLimits: {
      maxImageBytes: 5 * 1024 * 1024,
      maxImagesPerMessage: 4,
      maxMessageImageBytes: 20 * 1024 * 1024,
      maxImagePixels: 25_000_000,
      mediaTypes: ['image/png', 'image/jpeg', 'image/webp'],
      ...options.limits,
    },
    async saveImages(inputs: readonly SaveImageAttachment[]) {
      saved.push([...inputs])
      if (options.saveImages !== undefined) return options.saveImages(inputs)
      return inputs.map((input, index) => ({
        attachmentId: `sha256:${index + 1}`,
        mediaType: input.mediaType,
        bytes: input.data.byteLength,
        width: 1,
        height: 1,
        name: input.name,
      }))
    },
  })
  const generateImages = vi.fn(options.generateImages ?? (async () => ({
    apiVersion: 1,
    traceId: 'trace-test',
    elapsedMs: 1,
    responseBytes: PNG_1X1.byteLength,
    images: [{ b64Json: b64(PNG_1X1) }],
  })))
  const removeImages = vi.fn(async () => undefined)
  const assets = {
    async saveImages(sessionId: string, inputs: readonly SaveOpenAICodexOriginalImage[]) {
      if (options.saveOriginals !== undefined) return options.saveOriginals(sessionId, inputs)
      return inputs.map((input, index) => ({
        assetId: `img_${String(index + 1).padStart(32, '0')}`,
        mediaType: input.mediaType,
        width: input.width,
        height: input.height,
        bytes: input.data.byteLength,
        name: input.name,
        sha256: 'a'.repeat(64),
      }))
    },
    removeImages,
  } as unknown as OpenAICodexImageAssetStore
  ctx.provide('openaiCodexTransport', { apiVersion: 1, generateImages })
  ctx.tools.register(imageGenerateTool(ctx, assets))
  return { ctx, generateImages, saved, removeImages }
}

async function execute(ctx: Context, args: unknown, signalOverride: AbortSignal = signal) {
  return ctx.tools.execute({
    signal: signalOverride,
    callId: 'image-1' as never,
    name: IMAGE_GENERATE_TOOL_NAME,
    arguments: args,
    agent: agent('session-1'),
  })
}

describe('Codex image generation tool', () => {
  it('is exclusive and accepts only a bounded prompt', async () => {
    const { ctx, generateImages } = await setup()
    expect(ctx.tools.executionMode({
      signal,
      callId: 'mode-check' as never,
      name: IMAGE_GENERATE_TOOL_NAME,
      arguments: { prompt: 'draw' },
      agent: agent('session-1'),
    })).toEqual({ kind: 'exclusive' })
    for (const args of [{ prompt: '' }, { prompt: '   ' }, { prompt: 'x'.repeat(32_001) }, { prompt: 'draw', size: '1024x1024' }]) {
      expect((await execute(ctx, args)).isError).toBe(true)
    }
    expect(generateImages).not.toHaveBeenCalled()
  })

  it('validates all images before saving one complete batch', async () => {
    const { ctx, generateImages, saved } = await setup({
      generateImages: async () => ({
        apiVersion: 1,
        traceId: 'trace-invalid',
        elapsedMs: 1,
        responseBytes: PNG_1X1.byteLength,
        images: [{ b64Json: b64(PNG_1X1) }, { b64Json: 'not base64' }],
      }),
    })
    expect((await execute(ctx, { prompt: 'draw two' })).isError).toBe(true)
    expect(generateImages).toHaveBeenCalledOnce()
    expect(saved).toHaveLength(0)
  })

  it('saves valid PNG output once and redacts transport/storage failures', async () => {
    const { ctx, generateImages, saved } = await setup()
    const result = await execute(ctx, { prompt: '  draw a pixel  ' })
    expect(result.isError).toBe(false)
    if (result.isError) throw new Error('expected image generation to succeed')
    expect(generateImages).toHaveBeenCalledWith({ prompt: 'draw a pixel' }, { signal })
    expect(saved).toHaveLength(1)
    expect(result.value).toMatchObject({ images: [{
      original: { mediaType: 'image/png', name: 'codex-image-1.png', width: 1, height: 1 },
      preview: { mediaType: 'image/png', name: 'codex-image-1.png', width: 1, height: 1 },
    }] })
    expect(result.content).toEqual([
      expect.objectContaining({ type: 'text' }),
      {
        type: 'image',
        attachment: expect.objectContaining({
          attachmentId: 'sha256:1',
          mediaType: 'image/png',
          name: 'codex-image-1.png',
        }),
      },
    ])
    expect(result.meta).toEqual({
      kind: 'codex-connect-images',
      schemaVersion: 1,
      prompt: 'draw a pixel',
      images: [expect.objectContaining({
        original: expect.objectContaining({ mediaType: 'image/png', name: 'codex-image-1.png' }),
        preview: expect.objectContaining({ mediaType: 'image/png', name: 'codex-image-1.png' }),
      })],
    })

    await ctx.fiber.dispose()
    context = undefined
    const failed = await setup({ generateImages: async () => { throw new Error('private response body') } })
    const failure = await execute(failed.ctx, { prompt: 'private prompt' })
    const text = failure.content.find(block => block.type === 'text')?.text ?? ''
    expect(failure.isError).toBe(true)
    expect(text).not.toContain('private response body')
    expect(text).not.toContain('private prompt')
  })

  it('enforces runtime attachment limits and never saves partial output', async () => {
    const { ctx, saved } = await setup({ limits: { maxImageBytes: PNG_1X1.byteLength - 1 } })
    expect((await execute(ctx, { prompt: 'draw' })).isError).toBe(true)
    expect(saved).toHaveLength(0)
  })

  it('accepts the attachment store canonical preview metadata after normalization', async () => {
    const { ctx } = await setup({
      saveImages: async inputs => inputs.map((input, index) => ({
        attachmentId: `sha256:normalized-${String(index)}`,
        mediaType: 'image/webp',
        bytes: 42,
        width: 1,
        height: 1,
        name: input.name?.replace('.png', '.webp'),
      })),
    })
    const result = await execute(ctx, { prompt: 'normalize this' })
    expect(result.isError).toBe(false)
    if (result.isError) throw new Error('expected normalized preview to succeed')
    expect(result.value).toMatchObject({ images: [{
      original: { mediaType: 'image/png', bytes: PNG_1X1.byteLength },
      preview: { mediaType: 'image/webp', bytes: 42 },
    }] })
  })

  it('removes exact originals when preview persistence fails', async () => {
    const { ctx, removeImages } = await setup({ saveImages: async () => { throw new Error('preview failed') } })
    expect((await execute(ctx, { prompt: 'rollback this' })).isError).toBe(true)
    expect(removeImages).toHaveBeenCalledOnce()
  })
})
