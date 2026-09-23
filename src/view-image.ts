/** Codex-compatible `view_image` tool for local paths and HTTP(S) URLs. */

import { basename } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { AttachmentId } from '@deepseek-ai/dsh-attachment'
import type { ImageAttachmentRef, ImageMediaType } from '@deepseek-ai/dsh-attachment'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolDefinition, ToolExecution } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-fs'
import { fetchPublicHttpResource } from './public-http.ts'

/** Stable Codex tool name. */
export const VIEW_IMAGE_TOOL_NAME = 'view_image'

interface ViewImageValue {
  source: string
  image: {
    attachmentId: string
    mediaType: ImageMediaType
    bytes: number
    width: number
    height: number
    name?: string
  }
}

function refOf(image: ViewImageValue['image']): ImageAttachmentRef {
  return {
    attachmentId: AttachmentId(image.attachmentId),
    mediaType: image.mediaType,
    bytes: image.bytes,
    width: image.width,
    height: image.height,
    ...image.name === undefined ? {} : { name: image.name },
  }
}

function contentOf(value: ViewImageValue): ContentBlock[] {
  return [
    {
      type: 'text',
      text: `<source>${value.source}</source>\n<image>${value.image.mediaType}, ${value.image.width}x${value.image.height} px, ${value.image.bytes} bytes</image>`,
    },
    { type: 'image', attachment: refOf(value.image) },
  ]
}

function mediaTypeOf(data: Uint8Array): ImageMediaType | undefined {
  if (data.length >= 8 && data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47
    && data[4] === 0x0d && data[5] === 0x0a && data[6] === 0x1a && data[7] === 0x0a) return 'image/png'
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'image/jpeg'
  if (data.length >= 6) {
    const signature = String.fromCharCode(...data.subarray(0, 6))
    if (signature === 'GIF87a' || signature === 'GIF89a') return 'image/gif'
  }
  if (data.length >= 12
    && String.fromCharCode(...data.subarray(0, 4)) === 'RIFF'
    && String.fromCharCode(...data.subarray(8, 12)) === 'WEBP') return 'image/webp'
  return undefined
}

async function assertImageCapable(ctx: Context, exec: ToolExecution, source: string): Promise<void> {
  const configured = exec.agent?.session.requestHeader()?.config
  const provider = configured?.provider ?? exec.agent?.options.provider
  const model = configured?.model ?? exec.agent?.options.model
  if (provider === undefined || model === undefined) {
    throw new Error(`cannot view ${JSON.stringify(source)}: the current model route is unavailable`)
  }
  const info = await ctx.llm.resolveModelInfo(provider, model, exec.signal)
  if (info.inputModalities === undefined || !info.inputModalities.includes('image')) {
    throw new Error(`cannot view ${JSON.stringify(source)}: model "${model}" does not declare image input`)
  }
}

/** Build the plugin-owned image viewing tool. */
export function viewImageTool(ctx: Context): ToolDefinition {
  return defineTool({
    name: VIEW_IMAGE_TOOL_NAME,
    description: 'View an image from a local file path or an http(s) URL. Returns the actual PNG, JPEG, WebP, or GIF image to vision-capable models.',
    parameters: {
      source: {
        type: 'string',
        required: true,
        description: 'Local absolute/relative image path, or an http(s) image URL.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          source: { type: 'string', required: true },
          image: {
            type: 'object',
            required: true,
            additionalProperties: false,
            properties: {
              attachmentId: { type: 'string', required: true },
              mediaType: { type: 'string', required: true, enum: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] },
              bytes: { type: 'integer', required: true },
              width: { type: 'integer', required: true },
              height: { type: 'integer', required: true },
              name: { type: 'string' },
            },
          },
        },
      },
      render: (_args, value) => contentOf(value),
    },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const source = args.source.trim()
      if (source.length === 0) throw new Error('view_image source must not be empty')
      await assertImageCapable(ctx, exec, source)
      const attachments = ctx.attachments
      const maxBytes = Math.min(attachments.imageLimits.maxImageBytes, attachments.imageLimits.maxMessageImageBytes)
      let loaded: { data: Uint8Array; display: string; name?: string }
      if (/^https?:\/\//iu.test(source)) {
        loaded = await fetchPublicHttpResource(source, maxBytes, exec.signal)
      } else {
        const cwd = exec.agent?.session.header.cwd
        const target = await ctx.fs.resolve(source, { ...cwd === undefined ? {} : { cwd }, signal: exec.signal })
        const info = await ctx.fs.stat(target, exec.signal)
        if (info === undefined) throw new Error(`image path does not exist: ${source}`)
        if (info.type !== 'file') throw new Error(`image path is not a regular file: ${source}`)
        loaded = {
          data: await ctx.fs.readBytes(target, exec.signal, maxBytes),
          display: target.displayPath,
          name: basename(target.displayPath),
        }
        ctx.emit('fs/observed', target, { kind: 'present', version: info.version }, exec)
      }
      const mediaType = mediaTypeOf(loaded.data)
      if (mediaType === undefined) throw new Error('view_image supports PNG, JPEG, WebP, and GIF image bytes')
      if (!attachments.imageLimits.mediaTypes.includes(mediaType)) {
        throw new Error(`${mediaType} images are disabled by this deployment`)
      }
      const ref = await attachments.saveImage({
        data: loaded.data,
        mediaType,
        ...loaded.name === undefined ? {} : { name: loaded.name },
      })
      const value: ViewImageValue = {
        source: loaded.display,
        image: {
          attachmentId: ref.attachmentId,
          mediaType: ref.mediaType,
          bytes: ref.bytes,
          width: ref.width,
          height: ref.height,
          ...ref.name === undefined ? {} : { name: ref.name },
        },
      }
      if (exec.parent !== undefined) {
        exec.deferContext(createUserMessage({
          content: contentOf(value),
          source: { kind: 'dsh-codex-connect', plugin: 'view-image' },
        }))
      }
      return value
    },
    presentCall: args => ({
      card: 'generic',
      title: `View image ${args.source}`,
      kind: /^https?:\/\//iu.test(args.source) ? 'fetch' : 'read',
      .../^https?:\/\//iu.test(args.source)
        ? { rawInput: args.source }
        : { locations: [{ path: args.source }] },
    }),
  })
}
