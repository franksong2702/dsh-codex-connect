import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import type { ImageAttachmentLimits, SaveImageAttachment } from '@deepseek-ai/dsh-attachment'
import * as Images from '../src/index.ts'

const signal = new AbortController().signal
const PNG_1X1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC', 'base64')

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
  enabled?: boolean
  generateImages?: (input: { prompt: string }, request: { signal?: AbortSignal }) => Promise<unknown>
  limits?: Partial<ImageAttachmentLimits>
  saveImages?: (inputs: readonly SaveImageAttachment[]) => Promise<readonly unknown[]>
} = {}) {
  const ctx = new Context()
  context = ctx
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime, { mode: 'native' })
  const saved: SaveImageAttachment[][] = []
  const disposeAttachments = ctx.provide('attachments', {
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
  const disposeTransport = ctx.provide('openaiCodexTransport', { apiVersion: 1, generateImages })
  await ctx.plugin(Images, Images.Config({ enabled: options.enabled ?? true }))
  await ctx.fiber.await()
  return { ctx, generateImages, saved, disposeTransport, disposeAttachments }
}

async function execute(
  ctx: Context,
  args: unknown,
  callId = 'image-1',
  agentId = 'session-1',
  executionSignal: AbortSignal = signal,
) {
  return ctx.tools.execute({
    signal: executionSignal,
    callId: callId as never,
    name: Images.IMAGE_GENERATE_TOOL_NAME,
    arguments: args,
    agent: agent(agentId),
  })
}

describe('Codex image generation tool', () => {
  it('registers only while enabled and compatible services are present', async () => {
    const { ctx, disposeTransport } = await setup()
    expect(ctx.tools.get(Images.IMAGE_GENERATE_TOOL_NAME)).toBeDefined()
    expect(ctx.tools.schemas().filter(schema => schema.name === Images.IMAGE_GENERATE_TOOL_NAME)).toHaveLength(1)

    await disposeTransport()
    expect(ctx.tools.get(Images.IMAGE_GENERATE_TOOL_NAME)).toBeUndefined()

    ctx.provide('openaiCodexTransport', {
      apiVersion: 1,
      generateImages: async () => ({ apiVersion: 1, traceId: 'late', elapsedMs: 1, responseBytes: 1, images: [{ b64Json: b64(PNG_1X1) }] }),
    })
    await ctx.fiber.await()
    await vi.waitFor(() => expect(ctx.tools.get(Images.IMAGE_GENERATE_TOOL_NAME)).toBeDefined())
  })

  it('unregisters when the attachment service leaves', async () => {
    const { ctx, disposeAttachments } = await setup()
    expect(ctx.tools.get(Images.IMAGE_GENERATE_TOOL_NAME)).toBeDefined()
    await disposeAttachments()
    expect(ctx.tools.get(Images.IMAGE_GENERATE_TOOL_NAME)).toBeUndefined()
  })

  it('does not register when disabled', async () => {
    const { ctx } = await setup({ enabled: false })
    expect(ctx.tools.get(Images.IMAGE_GENERATE_TOOL_NAME)).toBeUndefined()
  })

  it('schedules the quota-consuming image tool exclusively', async () => {
    const { ctx } = await setup()
    expect(ctx.tools.executionMode({
      signal,
      callId: 'mode-check' as never,
      name: Images.IMAGE_GENERATE_TOOL_NAME,
      arguments: { prompt: 'draw' },
      agent: agent('session-1'),
    })).toEqual({ kind: 'exclusive' })
  })

  it('rejects invalid or extra arguments before transport work', async () => {
    const { ctx, generateImages } = await setup()
    for (const args of [
      { prompt: '' },
      { prompt: '   ' },
      { prompt: 'x'.repeat(32_001) },
      { prompt: 'draw', size: '1024x1024' },
    ]) {
      expect((await execute(ctx, args)).isError).toBe(true)
    }
    expect(generateImages).not.toHaveBeenCalled()
  })

  it('saves a validated batch once and returns text-only durable references', async () => {
    const { ctx, generateImages, saved } = await setup()
    const result = await execute(ctx, { prompt: 'draw a pixel' })

    expect(result.isError).toBe(false)
    expect(generateImages).toHaveBeenCalledTimes(1)
    expect(generateImages).toHaveBeenCalledWith({ prompt: 'draw a pixel' }, { signal })
    expect(saved).toHaveLength(1)
    expect(saved[0]?.[0]?.name).toBe('codex-image-1.png')
    expect(result.content.every(block => block.type === 'text')).toBe(true)
    expect(result.value).toMatchObject({
      images: [{ attachmentId: 'sha256:1', mediaType: 'image/png', width: 1, height: 1, name: 'codex-image-1.png' }],
    })
  })

  it('validates every image before making one storage call', async () => {
    const { ctx, saved } = await setup({
      generateImages: async () => ({
        apiVersion: 1,
        traceId: 'trace-invalid',
        elapsedMs: 1,
        responseBytes: 10,
        images: [{ b64Json: b64(PNG_1X1) }, { b64Json: 'not base64' }],
      }),
    })
    const result = await execute(ctx, { prompt: 'draw two' })
    expect(result.isError).toBe(true)
    expect(saved).toHaveLength(0)
  })

  it('enforces deployment byte, count, media, and pixel limits before storage', async () => {
    const cases: Array<Partial<ImageAttachmentLimits>> = [
      { maxImageBytes: PNG_1X1.byteLength - 1 },
      { maxMessageImageBytes: PNG_1X1.byteLength - 1 },
      { maxImagesPerMessage: 0 },
      { maxImagePixels: 0 },
      { mediaTypes: ['image/jpeg'] },
    ]
    for (const limits of cases) {
      const { ctx, saved } = await setup({ limits })
      expect((await execute(ctx, { prompt: 'draw' })).isError).toBe(true)
      expect(saved).toHaveLength(0)
      await ctx.fiber.dispose()
      context = undefined
    }
  })

  it('enforces the tool hard limit of four images even when deployment limits are higher', async () => {
    const { ctx, saved } = await setup({
      limits: { maxImagesPerMessage: 10 },
      generateImages: async () => ({
        apiVersion: 1,
        traceId: 'trace-five',
        elapsedMs: 1,
        responseBytes: PNG_1X1.byteLength * 5,
        images: Array.from({ length: 5 }, () => ({ b64Json: b64(PNG_1X1) })),
      }),
    })
    expect((await execute(ctx, { prompt: 'draw five' })).isError).toBe(true)
    expect(saved).toHaveLength(0)
  })

  it('deduplicates concurrent re-entry but never caches settled calls', async () => {
    let resolve!: (value: unknown) => void
    const pending = new Promise<unknown>(done => { resolve = done })
    const { ctx, generateImages } = await setup({ generateImages: async () => pending })
    const first = execute(ctx, { prompt: 'draw' }, 'same-call')
    const second = execute(ctx, { prompt: 'draw' }, 'same-call')
    await vi.waitFor(() => expect(generateImages).toHaveBeenCalledTimes(1))
    resolve({ apiVersion: 1, traceId: 'trace', elapsedMs: 1, responseBytes: 1, images: [{ b64Json: b64(PNG_1X1) }] })
    expect((await first).isError).toBe(false)
    expect((await second).isError).toBe(false)
    await execute(ctx, { prompt: 'draw' }, 'same-call')
    expect(generateImages).toHaveBeenCalledTimes(2)
  })

  it('does not deduplicate the same call id across different sessions', async () => {
    const { ctx, generateImages } = await setup()
    await Promise.all([
      execute(ctx, { prompt: 'one' }, 'same-call', 'session-a'),
      execute(ctx, { prompt: 'two' }, 'same-call', 'session-b'),
    ])
    expect(generateImages).toHaveBeenCalledTimes(2)
  })

  it('adds a visible quota warning when a started call is canceled', async () => {
    const controller = new AbortController()
    let resolve!: (value: unknown) => void
    const { ctx, generateImages } = await setup({
      generateImages: async () => new Promise(done => { resolve = done }),
    })
    const pending = execute(ctx, { prompt: 'draw' }, 'cancel-call', 'session-a', controller.signal)
    await vi.waitFor(() => expect(generateImages).toHaveBeenCalledTimes(1))
    controller.abort()
    resolve({ apiVersion: 1, traceId: 'trace', elapsedMs: 1, responseBytes: 1, images: [{ b64Json: b64(PNG_1X1) }] })
    const result = await pending
    expect(result.isError).toBe(true)
    if (!result.isError) throw new Error('expected canceled tool result')
    expect(result.error.info?.code).toBe('ABORTED')
    expect(result.content.some(block => block.type === 'text' && block.text.includes('may still consume quota'))).toBe(true)
  })

  it('does not claim quota use when cancellation happens before dispatch', async () => {
    const controller = new AbortController()
    controller.abort()
    const { ctx, generateImages } = await setup()
    const result = await execute(ctx, { prompt: 'draw' }, 'pre-cancel', 'session-a', controller.signal)
    expect(result.isError).toBe(true)
    if (!result.isError) throw new Error('expected pre-dispatch cancellation')
    expect(result.error.info?.code).toBe('ABORTED_BEFORE_DISPATCH')
    expect(result.content.some(block => block.type === 'text' && block.text.includes('may still consume quota'))).toBe(false)
    expect(generateImages).not.toHaveBeenCalled()
  })

  it('does not expose transport or storage error details', async () => {
    const { ctx } = await setup({ generateImages: async () => { throw new Error('secret response body') } })
    const result = await execute(ctx, { prompt: 'private prompt' })
    const text = result.content.find(block => block.type === 'text')?.text ?? ''
    expect(result.isError).toBe(true)
    expect(text).not.toContain('secret response body')
    expect(text).not.toContain('private prompt')
  })

  it('warns that a network failure may still consume quota', async () => {
    const error = Object.assign(new Error('private network detail'), { code: 'OPENAI_CODEX_NETWORK_ERROR' })
    const { ctx } = await setup({ generateImages: async () => { throw error } })
    const result = await execute(ctx, { prompt: 'private prompt' })
    const text = result.content.find(block => block.type === 'text')?.text ?? ''
    expect(result.isError).toBe(true)
    expect(text).toContain('may still consume quota')
    expect(text).not.toContain('private network detail')
    expect(text).not.toContain('private prompt')
  })

  it('rejects malformed attachment identifiers instead of string-coercing them', async () => {
    const { ctx } = await setup({
      saveImages: async inputs => inputs.map(input => ({
        attachmentId: undefined,
        mediaType: input.mediaType,
        bytes: input.data.byteLength,
        width: 1,
        height: 1,
        name: input.name,
      })),
    })
    const result = await execute(ctx, { prompt: 'draw' })
    expect(result.isError).toBe(true)
    expect(result.value).toBeUndefined()
  })

  it('returns no partial references when batch storage fails', async () => {
    const { ctx } = await setup({ saveImages: async () => { throw new Error('private storage path') } })
    const result = await execute(ctx, { prompt: 'draw' })
    expect(result.isError).toBe(true)
    expect(result.value).toBeUndefined()
    const text = result.content.find(block => block.type === 'text')?.text ?? ''
    expect(text).toContain('no attachment references were returned')
    expect(text).not.toContain('private storage path')
  })
})
