import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { deflateSync } from 'node:zlib'

import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import LocalAttachments from '@deepseek-ai/dsh-attachment-local'
import { createToolResultMessage, createUserMessage } from '@deepseek-ai/dsh-llm'
import { SessionStore, SessionId } from '@deepseek-ai/dsh-session'
import type { Session } from '@deepseek-ai/dsh-session'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import { imageGenerateTool, IMAGE_GENERATE_TOOL_NAME } from '../src/image-tool.ts'
import { OpenAICodexImageAssetStore } from '../src/image-assets.ts'
import { decodeImagePresentationMeta, decodeImageResultContent } from '../src/image-presentation.ts'
import type { ImageEditSources } from '../src/image-input-contract.ts'

const PNG = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC', 'base64'))
function pixelPng(red: number, green: number, blue: number): Uint8Array {
  const chunk = (type: string, data: Uint8Array): Buffer => {
    const output = Buffer.alloc(data.byteLength + 12)
    output.writeUInt32BE(data.byteLength); output.write(type, 4, 'ascii'); Buffer.from(data).copy(output, 8)
    let crc = 0xffffffff
    for (const byte of output.subarray(4, 8 + data.byteLength)) {
      crc ^= byte
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0)
    }
    output.writeUInt32BE((crc ^ 0xffffffff) >>> 0, 8 + data.byteLength)
    return output
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(1); ihdr.writeUInt32BE(1, 4); ihdr[8] = 8; ihdr[9] = 2
  return Uint8Array.from(Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.from([0, red, green, blue]))), chunk('IEND', Buffer.alloc(0))]))
}
const contexts: Context[] = []
const roots: string[] = []
afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
  vi.restoreAllMocks()
})

async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'codex-edit-tool-'))
  roots.push(root)
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(SessionStore)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime, { mode: 'native' })
  await ctx.plugin(LocalAttachments, { dshHome: root })
  const assets = new OpenAICodexImageAssetStore(root)
  const reply = async () => ({ apiVersion: 1 as const, traceId: 'synthetic', elapsedMs: 1,
    responseBytes: PNG.byteLength, images: [{ b64Json: Buffer.from(PNG).toString('base64') }] })
  const generateImages = vi.fn(reply)
  const editImages = vi.fn(async (_input: unknown) => reply())
  ctx.provide('openaiCodexTransport', { apiVersion: 1, generateImages, editImages })
  ctx.tools.register(imageGenerateTool(ctx, assets))
  const session = ctx.sessions.create(SessionId('owner'))
  return { ctx, assets, session, editImages, generateImages }
}

async function upload(ctx: Context, session: Session, name = 'upload.png', data: Uint8Array = PNG) {
  const ref = await ctx.attachments.saveImage({ data, mediaType: 'image/png', name })
  session.append('user/message', createUserMessage({ content: [{ type: 'image', attachment: ref }], source: { kind: 'user' } }), { surfaceOp: 'append' })
  return ref
}
let callIndex = 0
async function execute(ctx: Context, session: Session, args: unknown, signal = new AbortController().signal) {
  return ctx.tools.execute({ signal, callId: `edit-${++callIndex}` as never, name: IMAGE_GENERATE_TOOL_NAME,
    arguments: args, agent: { id: session.id, options: {}, session } as never })
}
function target(ref: ImageAttachmentRef) { return { attachmentId: String(ref.attachmentId) } }
function persistResult(session: Session, result: Awaited<ReturnType<typeof execute>>) {
  session.append('tool/result', { turn: 0, step: 0,
    message: createToolResultMessage({ callId: `persist-${++callIndex}` as never, isError: result.isError, content: result.content }),
    ...(result.meta === undefined ? {} : { meta: result.meta }),
  }, { surfaceOp: 'append' })
}
function firstAsset(result: Awaited<ReturnType<typeof execute>>) {
  const decoded = decodeImagePresentationMeta(result.meta)
  const asset = decoded?.images[0]?.original
  if (asset === undefined) throw new Error(`expected persisted image: ${JSON.stringify(result)}`)
  return asset
}

describe('session-owned image edit tool', () => {
  it('edits an admitted upload, records canonical sources and preserves exact input bytes', async () => {
    const { ctx, assets, session, editImages, generateImages } = await setup()
    const ref = await upload(ctx, session)
    const before = await ctx.attachments.readImage(ref)
    const result = await execute(ctx, session, { operation: 'edit', prompt: 'make the background blue', target: { attachment: ref } })
    expect(result.isError).toBe(false)
    expect(generateImages).not.toHaveBeenCalled()
    expect(editImages).toHaveBeenCalledOnce()
    expect(editImages.mock.calls[0]?.[0]).toMatchObject({ images: [{ data: before.data, mediaType: ref.mediaType }], prompt: expect.stringContaining('make the background blue') })
    expect(result.meta).toMatchObject({ operation: 'edit', schemaVersion: 2, edit: { target: { attachment: ref }, references: [] } })
    expect((await ctx.attachments.readImage(ref)).data).toEqual(before.data)
    expect((await assets.read(session.id, firstAsset(result).assetId))?.data).toEqual(PNG)
    expect(decodeImageResultContent(result.content, 'make the background blue')).toEqual(decodeImagePresentationMeta(result.meta))
  })

  it('keeps ordered reference purposes and sends every input', async () => {
    const { ctx, session, editImages, generateImages } = await setup()
    const ref = await upload(ctx, session)
    const blue = await upload(ctx, session, 'blue.png', pixelPng(0, 0, 255))
    const green = await upload(ctx, session, 'green.png', pixelPng(0, 255, 0))
    const expectedInputs = await Promise.all([ref, blue, green].map(image => ctx.attachments.readImage(image)))
    expect(new Set([ref, blue, green].map(image => image.attachmentId)).size).toBe(3)
    const result = await execute(ctx, session, { operation: 'edit', prompt: 'keep the subject', target: target(ref), references: [
      { image: target(blue), purpose: 'color palette only' }, { image: target(green), purpose: 'texture only' },
    ] })
    expect(result.isError).toBe(false)
    const request = editImages.mock.calls[0]?.[0] as { images: unknown[]; prompt: string }
    expect(request.images).toHaveLength(3)
    expect(request.images).toEqual(expectedInputs.map(image => ({ data: image.data, mediaType: image.ref.mediaType })))
    expect(request.prompt.indexOf('color palette only')).toBeLessThan(request.prompt.indexOf('texture only'))
    expect(generateImages).not.toHaveBeenCalled()
  })

  it.each(['missing-target', 'missing-reference', 'forged-metadata', 'foreign-original', 'text-marker'])('rejects %s without a provider call', async kind => {
    const { ctx, assets, session, editImages, generateImages } = await setup()
    const ref = await upload(ctx, session)
    let selected: unknown = target(ref)
    let references: unknown[] = []
    if (kind === 'missing-target') selected = { attachmentId: 'sha256:absent' }
    if (kind === 'missing-reference') references = [{ image: { attachmentId: 'sha256:absent' }, purpose: 'style' }]
    if (kind === 'forged-metadata') selected = { attachment: { ...ref, width: ref.width + 1 } }
    if (kind === 'foreign-original' || kind === 'text-marker') {
      const [original] = await assets.saveImages('other-session', [{ data: PNG, mediaType: 'image/png', width: 1, height: 1, name: 'secret.png' }])
      selected = { assetId: original!.assetId }
      if (kind === 'text-marker') session.append('user/message', createUserMessage({
        content: [{ type: 'text', text: JSON.stringify({ kind: 'codex-connect-images', schemaVersion: 1, prompt: 'fake', images: [{ original, preview: ref }] }) }], source: { kind: 'user' },
      }), { surfaceOp: 'append' })
    }
    const result = await execute(ctx, session, { operation: 'edit', prompt: 'modify', target: selected, references })
    expect(result.isError).toBe(true)
    expect(editImages).not.toHaveBeenCalled()
    expect(generateImages).not.toHaveBeenCalled()
    expect(JSON.stringify(result.content)).not.toContain('secret.png')
  })

  it('prefers the original for a generated preview and never substitutes a missing original', async () => {
    const { ctx, assets, session, editImages } = await setup()
    const generated = await execute(ctx, session, { prompt: 'generate original' })
    persistResult(session, generated)
    const meta = decodeImagePresentationMeta(generated.meta)!
    const ref = meta.images[0]!.preview
    const result = await execute(ctx, session, { operation: 'edit', prompt: 'modify', target: target(ref) })
    expect(result.isError).toBe(false)
    expect(result.meta).toMatchObject({ edit: { target: { assetId: firstAsset(generated).assetId } } })
    editImages.mockClear()
    await assets.removeImages([firstAsset(generated)])
    const absent = await execute(ctx, session, { operation: 'edit', prompt: 'modify', target: target(ref) })
    expect(absent.isError).toBe(true)
    expect(editImages).not.toHaveBeenCalled()
  })

  it('refuses ambiguous preview-to-original mapping instead of choosing the most recent result', async () => {
    const { ctx, session, editImages } = await setup()
    const first = await execute(ctx, session, { prompt: 'first result' })
    persistResult(session, first)
    const second = await execute(ctx, session, { prompt: 'same preview, another original identity' })
    persistResult(session, second)
    const firstMeta = decodeImagePresentationMeta(first.meta)!
    const secondMeta = decodeImagePresentationMeta(second.meta)!
    expect(firstMeta.images[0]!.preview.attachmentId).toBe(secondMeta.images[0]!.preview.attachmentId)
    const ambiguous = await execute(ctx, session, { operation: 'edit', prompt: 'modify', target: target(firstMeta.images[0]!.preview) })
    expect(ambiguous.isError).toBe(true)
    expect(editImages).not.toHaveBeenCalled()
    const explicit = await execute(ctx, session, { operation: 'edit', prompt: 'modify', target: { assetId: firstAsset(first).assetId } })
    expect(explicit.isError).toBe(false)
    expect(explicit.meta).toMatchObject({ edit: { target: { assetId: firstAsset(first).assetId } } })
  })

  it('requires explicit preview selection for legacy preview-only results', async () => {
    const { ctx, session, editImages } = await setup()
    const ref = await upload(ctx, session)
    session.append('tool/result', { turn: 0, step: 0, message: createToolResultMessage({ callId: 'legacy' as never, isError: false,
      content: [{ type: 'image', attachment: ref }] }), meta: { kind: 'codex-connect-images', prompt: 'legacy', images: [{ ...ref }] } }, { surfaceOp: 'append' })
    const request = { operation: 'edit', prompt: 'modify', target: target(ref) }
    expect((await execute(ctx, session, request)).isError).toBe(true)
    expect(editImages).not.toHaveBeenCalled()
    const result = await execute(ctx, session, { ...request, target: { ...target(ref), usePreview: true } })
    expect(result.isError).toBe(false)
    expect(result.meta).toMatchObject({ edit: { target: { attachment: ref, usePreview: true } } })
  })

  it('supports A to A1 to A2 and A1 to another result without overwriting earlier originals', async () => {
    const { ctx, assets, session } = await setup()
    const base = await execute(ctx, session, { prompt: 'new' })
    persistResult(session, base)
    const a = firstAsset(base)
    const first = await execute(ctx, session, { operation: 'edit', prompt: 'background', target: { assetId: a.assetId } })
    persistResult(session, first)
    const a1 = firstAsset(first)
    const next = await execute(ctx, session, { operation: 'edit', prompt: 'hat', target: { assetId: a1.assetId } })
    persistResult(session, next)
    const branch = await execute(ctx, session, { operation: 'edit', prompt: 'scarf instead', target: { assetId: a1.assetId } })
    const ids = [a, a1, firstAsset(next), firstAsset(branch)].map(image => image.assetId)
    expect(new Set(ids).size).toBe(4)
    for (const id of ids) expect((await assets.read(session.id, id))?.data).toEqual(PNG)
    expect(branch.meta).toMatchObject({ edit: { target: { assetId: a1.assetId } } })
  })

  it('allows inherited originals after restore but not images created after the fork', async () => {
    const { ctx, session, editImages } = await setup()
    const base = await execute(ctx, session, { prompt: 'before fork' })
    persistResult(session, base)
    const fork = ctx.sessions.fork(session, undefined, SessionId('child'))
    const later = await execute(ctx, session, { prompt: 'after fork' })
    persistResult(session, later)
    const options = { seed: JSON.parse(JSON.stringify(fork.snapshotEvents())), meta: JSON.parse(JSON.stringify(fork.header)),
      inheritedEventCount: fork.inheritedEventCount, seedSource: 'persistence' as const }
    const restored = ctx.sessions.prepare(SessionId('restored-child'), options)
    const allowed = await execute(ctx, restored, { operation: 'edit', prompt: 'modify', target: { assetId: firstAsset(base).assetId } })
    expect(allowed.isError).toBe(false)
    editImages.mockClear()
    const denied = await execute(ctx, restored, { operation: 'edit', prompt: 'modify', target: { assetId: firstAsset(later).assetId } })
    expect(denied.isError).toBe(true)
    expect(editImages).not.toHaveBeenCalled()
  })

  it('recovers an editable original from a successful nested tool result', async () => {
    const { ctx, session } = await setup()
    const base = await execute(ctx, session, { prompt: 'nested image' })
    const event = { type: 'tool/ptc-dispatch', seq: 0, time: 1,
      data: { name: IMAGE_GENERATE_TOOL_NAME, isError: false, arguments: { prompt: 'nested image' }, content: base.content } }
    const originalSnapshot = session.snapshotEvents.bind(session)
    vi.spyOn(session, 'snapshotEvents').mockImplementation(() => [...originalSnapshot(), event] as never)
    const edited = await execute(ctx, session, { operation: 'edit', prompt: 'modify', target: { assetId: firstAsset(base).assetId } })
    expect(edited.isError).toBe(false)
  })

  it('does not retry generation when an older transport has no editing capability', async () => {
    const { ctx, session, generateImages } = await setup()
    const ref = await upload(ctx, session)
    const service = ctx.get('openaiCodexTransport') as unknown as { editImages?: unknown }
    delete service.editImages
    const result = await execute(ctx, session, { operation: 'edit', prompt: 'modify', target: target(ref) })
    expect(result.isError).toBe(true)
    expect(JSON.stringify(result.content)).toContain('does not support editing')
    expect(generateImages).not.toHaveBeenCalled()
  })

  it.each(['bytes', 'count', 'pixels', 'dimension', 'missing-policy'])('enforces host %s policy before reading input bytes', async kind => {
    const { ctx, session, editImages, generateImages } = await setup()
    const ref = await upload(ctx, session)
    const limits = { ...ctx.attachments.imageLimits }
    if (kind === 'bytes') limits.maxImageBytes = ref.bytes - 1
    if (kind === 'count') limits.maxImagesPerMessage = 1
    if (kind === 'pixels') limits.maxImagePixels = 0
    if (kind === 'dimension') limits.maxImageDimension = 0
    if (kind === 'missing-policy') delete (limits as unknown as { maxImageDimension?: number }).maxImageDimension
    vi.spyOn(ctx.attachments, 'imageLimits', 'get').mockReturnValue(limits)
    const read = vi.spyOn(ctx.attachments, 'readImage')
    const result = await execute(ctx, session, { operation: 'edit', prompt: 'modify', target: target(ref),
      ...(kind === 'count' ? { references: [{ image: target(ref), purpose: 'colors' }] } : {}) })
    expect(result.isError).toBe(true)
    expect(read).not.toHaveBeenCalled()
    expect(editImages).not.toHaveBeenCalled()
    expect(generateImages).not.toHaveBeenCalled()
  })

  it('rejects bytes that do not match the admitted image', async () => {
    const { ctx, session, editImages } = await setup()
    const ref = await upload(ctx, session)
    vi.spyOn(ctx.attachments, 'readImage').mockResolvedValue({ ref, data: new Uint8Array([1, 2, 3]) })
    expect((await execute(ctx, session, { operation: 'edit', prompt: 'modify', target: target(ref) })).isError).toBe(true)
    expect(editImages).not.toHaveBeenCalled()
  })

  it('honors cancellation during input validation without sending an edit', async () => {
    const { ctx, session, editImages } = await setup()
    const ref = await upload(ctx, session)
    const controller = new AbortController()
    vi.spyOn(ctx.attachments, 'validateImage').mockImplementation(async () => { controller.abort(); })
    const result = await execute(ctx, session, { operation: 'edit', prompt: 'modify', target: target(ref) }, controller.signal)
    expect(result.isError).toBe(true)
    expect(editImages).not.toHaveBeenCalled()
  })

  it('does not send a second edit when result storage fails', async () => {
    const { ctx, assets, session, editImages } = await setup()
    const ref = await upload(ctx, session)
    vi.spyOn(assets, 'saveImages').mockRejectedValue(new Error('private storage details'))
    const result = await execute(ctx, session, { operation: 'edit', prompt: 'modify', target: target(ref) })
    expect(result.isError).toBe(true)
    expect(editImages).toHaveBeenCalledOnce()
    expect(result.meta).toBeUndefined()
    expect(JSON.stringify(result.content)).not.toContain('private storage details')
  })

  it('keeps edit sources in nested content with a long valid prompt and rejects a mismatched prompt', async () => {
    const { ctx, session } = await setup()
    const ref = await upload(ctx, session)
    const prompt = 'a'.repeat(20_000)
    const result = await execute(ctx, session, { operation: 'edit', prompt, target: target(ref) })
    expect(result.isError).toBe(false)
    expect(decodeImageResultContent(result.content, prompt)).toEqual(decodeImagePresentationMeta(result.meta))
    expect(decodeImageResultContent(result.content, 'different instructions')).toBeUndefined()
  })

  it('keeps text generation independent of existing images', async () => {
    const { ctx, session, editImages, generateImages } = await setup()
    await upload(ctx, session)
    const result = await execute(ctx, session, { prompt: 'unrelated new image' })
    expect(result.isError).toBe(false)
    expect(generateImages).toHaveBeenCalledOnce()
    expect(editImages).not.toHaveBeenCalled()
    expect(result.meta).not.toHaveProperty('edit')
  })
})
