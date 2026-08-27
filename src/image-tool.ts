/** Model-callable Codex image generation tool. */

import type { Context } from '@deepseek-ai/cordis'
import { AttachmentId } from '@deepseek-ai/dsh-attachment'
import type { ImageAttachmentRef, ImageMediaType, SaveImageAttachment } from '@deepseek-ai/dsh-attachment'
import { defineTool, TOOL_ABORTED } from '@deepseek-ai/dsh-tools'
import type { ToolDefinition, ToolExecutionResult, ToolRunContext } from '@deepseek-ai/dsh-tools'
import type { OpenAICodexTransportV1 } from './transport.ts'
import { decodeStrictBase64, estimateBase64Bytes } from './base64.ts'
import { detectEncodedImage } from './image-format.ts'
import type { CodexImageMediaType, DetectedImage } from './image-format.ts'
import type { OpenAICodexOriginalImageRef } from './image-assets-contract.ts'
import type { OpenAICodexImageAssetStore } from './image-assets.ts'
import { IMAGE_PRESENTATION_KIND, IMAGE_PRESENTATION_SCHEMA_VERSION } from './image-presentation.ts'

/** Stable model-callable tool name. */
export const IMAGE_GENERATE_TOOL_NAME = 'codex_connect_image_generate'
const TRANSPORT_SERVICE = 'openaiCodexTransport'
const PROMPT_MAX_LENGTH = 32_000
const MAX_IMAGES_PER_RESPONSE = 4
const CANCELED_REQUEST_NOTE = 'The request may still be processing.'

interface ImageValue {
  images: Array<{
    original: OpenAICodexOriginalImageRef
    preview: {
      attachmentId: string
      mediaType: CodexImageMediaType
      width: number
      height: number
      bytes: number
      name: string
    }
  }>
}

type ToolContentBlock = ToolExecutionResult['content'][number]

class SafeToolError extends Error {}

function failure(message: string): never {
  throw new SafeToolError(message)
}

/** Convert transport failures to fixed, secret-free user text. */
function fixedTransportMessage(error: unknown): string {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? (error as { code?: unknown }).code
    : undefined
  switch (code) {
    case 'OPENAI_CODEX_SIGNED_OUT': return 'Sign in to OpenAI Codex before generating images.'
    case 'OPENAI_CODEX_REAUTH_REQUIRED': return 'Renew OpenAI Codex authorization before generating images.'
    case 'OPENAI_CODEX_RATE_LIMITED': return 'Image generation is temporarily unavailable. Try again later.'
    case 'OPENAI_CODEX_TIMEOUT': return `Image generation timed out. ${CANCELED_REQUEST_NOTE}`
    case 'OPENAI_CODEX_CANCELED': return `Image generation was canceled. ${CANCELED_REQUEST_NOTE}`
    case 'OPENAI_CODEX_NETWORK_ERROR': return `The image generation request lost its network connection. ${CANCELED_REQUEST_NOTE}`
    case 'OPENAI_CODEX_UPSTREAM_REJECTED': return 'The image generation request was rejected.'
    case 'OPENAI_CODEX_UPSTREAM_UNAVAILABLE': return 'Image generation is temporarily unavailable.'
    case 'OPENAI_CODEX_RESPONSE_TOO_LARGE': return 'The image generation response exceeded the safe size limit.'
    case 'OPENAI_CODEX_MALFORMED_RESPONSE': return 'The image generation response was unreadable.'
    default: return 'Image generation failed without exposing private response details.'
  }
}

function extension(mediaType: CodexImageMediaType): string {
  return mediaType === 'image/jpeg' ? 'jpg' : mediaType.slice('image/'.length)
}

function outputContent(value: ImageValue): ToolContentBlock[] {
  const lines = value.images.map(({ original, preview }, index) =>
    `${String(index + 1)}. original ${original.mediaType}, ${String(original.width)}x${String(original.height)} px, ${String(original.bytes)} bytes; preview ${String(preview.width)}x${String(preview.height)} px, attachment ${preview.attachmentId}`)
  return [
    { type: 'text', text: `Generated ${String(value.images.length)} image${value.images.length === 1 ? '' : 's'}:\n${lines.join('\n')}` },
    ...value.images.map(({ preview }) => ({
      type: 'image' as const,
      attachment: {
        attachmentId: AttachmentId(preview.attachmentId),
        mediaType: preview.mediaType,
        width: preview.width,
        height: preview.height,
        bytes: preview.bytes,
        name: preview.name,
      },
    })),
  ]
}

function positiveSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

function previewValue(ref: ImageAttachmentRef, fallbackName: string): ImageValue['images'][number]['preview'] {
  if (typeof ref.attachmentId !== 'string' || ref.attachmentId.length === 0
    || (ref.mediaType !== 'image/png' && ref.mediaType !== 'image/jpeg' && ref.mediaType !== 'image/webp')
    || !positiveSafeInteger(ref.bytes) || !positiveSafeInteger(ref.width) || !positiveSafeInteger(ref.height)) {
    failure('The attachment store returned invalid preview metadata.')
  }
  const name = typeof ref.name === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(ref.name)
    ? ref.name
    : fallbackName
  return {
    attachmentId: ref.attachmentId,
    mediaType: ref.mediaType,
    width: ref.width,
    height: ref.height,
    bytes: ref.bytes,
    name,
  }
}

function executionKey(exec: ToolRunContext): string {
  return `${String(exec.agent?.id ?? '<no-agent>')}\u0000${String(exec.rootCallId)}\u0000${String(exec.callId)}`
}

async function generate(
  ctx: Context,
  transport: OpenAICodexTransportV1,
  assets: OpenAICodexImageAssetStore,
  prompt: string,
  exec: ToolRunContext,
): Promise<ImageValue> {
  let response: Awaited<ReturnType<OpenAICodexTransportV1['generateImages']>>
  try {
    response = await transport.generateImages({ prompt }, { signal: exec.signal })
  } catch (error) {
    failure(fixedTransportMessage(error))
  }

  const limits = ctx.attachments.imageLimits
  if (response.images.length < 1
    || response.images.length > MAX_IMAGES_PER_RESPONSE
    || response.images.length > limits.maxImagesPerMessage) {
    failure('The generated image count exceeds this deployment\'s attachment limit.')
  }

  let estimatedTotal = 0
  const estimates: number[] = []
  for (const image of response.images) {
    const estimate = estimateBase64Bytes(image.b64Json)
    if (estimate === undefined) failure('The image generation response contained invalid image data.')
    if (estimate > limits.maxImageBytes) failure('A generated image exceeds this deployment\'s byte limit.')
    estimatedTotal += estimate
    if (!Number.isSafeInteger(estimatedTotal) || estimatedTotal > limits.maxMessageImageBytes) {
      failure('The generated image batch exceeds this deployment\'s byte limit.')
    }
    estimates.push(estimate)
  }

  const inputs: SaveImageAttachment[] = []
  const parsedImages: DetectedImage[] = []
  for (const [index, image] of response.images.entries()) {
    const data = decodeStrictBase64(image.b64Json)
    if (data === undefined || data.byteLength !== estimates[index]) failure('The image generation response contained invalid image data.')
    const parsed = detectEncodedImage(data)
    if (parsed === undefined) failure('Generated images must be valid PNG, JPEG, or WebP files.')
    if (!limits.mediaTypes.includes(parsed.mediaType as ImageMediaType)) {
      failure(`${parsed.mediaType} images are disabled by this deployment.`)
    }
    if (parsed.width * parsed.height > limits.maxImagePixels) {
      failure('A generated image exceeds this deployment\'s pixel limit.')
    }
    const name = `codex-image-${String(index + 1)}.${extension(parsed.mediaType)}`
    parsedImages.push(parsed)
    inputs.push({ data, mediaType: parsed.mediaType, name })
  }

  const sessionId = exec.agent?.id
  if (sessionId === undefined) failure('Image generation requires a session-owned tool call.')
  let originals: readonly OpenAICodexOriginalImageRef[]
  try {
    originals = await assets.saveImages(String(sessionId), inputs.map((input, index) => {
      const parsed = parsedImages[index]
      if (parsed === undefined || input.name === undefined) failure('The generated image batch is incomplete.')
      return {
        data: input.data,
        mediaType: parsed.mediaType,
        width: parsed.width,
        height: parsed.height,
        name: input.name,
      }
    }))
  } catch {
    failure('The generated original images could not be saved.')
  }

  let refs: readonly ImageAttachmentRef[]
  try {
    refs = await ctx.attachments.saveImages(inputs)
  } catch {
    await assets.removeImages(originals)
    failure('The generated images could not be saved; no attachment references were returned.')
  }
  if (refs.length !== inputs.length || originals.length !== inputs.length) {
    await assets.removeImages(originals)
    failure('The image stores returned an incomplete image batch.')
  }

  try {
    return {
      images: refs.map((ref, index) => {
        const original = originals[index]
        const name = inputs[index]?.name
        if (original === undefined || name === undefined) failure('The image stores returned an incomplete image batch.')
        return { original, preview: previewValue(ref, name) }
      }),
    }
  } catch (error) {
    await assets.removeImages(originals)
    throw error
  }
}

function appendAbortNote(result: Readonly<ToolExecutionResult>): ToolContentBlock[] | undefined {
  if (!result.isError || result.error.info?.code !== TOOL_ABORTED) return undefined
  const existing = result.content.filter((block): block is Extract<ToolContentBlock, { type: 'text' }> => block.type === 'text')
    .map(block => block.text).join('\n')
  if (existing.includes(CANCELED_REQUEST_NOTE)) return undefined
  return [...result.content, { type: 'text', text: CANCELED_REQUEST_NOTE }]
}

/** Build one fiber-owned image tool, including in-flight call deduplication. */
export function imageGenerateTool(ctx: Context, assets: OpenAICodexImageAssetStore): ToolDefinition {
  const inFlight = new Map<string, Promise<ImageValue>>()
  return defineTool({
    name: IMAGE_GENERATE_TOOL_NAME,
    description: 'Generate an image from a text prompt, preserve the exact original, and save a DSH conversation preview. Supports one prompt only; output size and style are service defaults.',
    parameters: {
      prompt: { type: 'string', required: true, description: 'A complete description of the image to generate.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          images: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                original: {
                  type: 'object',
                  required: true,
                  additionalProperties: false,
                  properties: {
                    assetId: { type: 'string', required: true },
                    mediaType: { type: 'string', required: true, enum: ['image/png', 'image/jpeg', 'image/webp'] },
                    width: { type: 'integer', required: true },
                    height: { type: 'integer', required: true },
                    bytes: { type: 'integer', required: true },
                    name: { type: 'string', required: true },
                    sha256: { type: 'string', required: true },
                  },
                },
                preview: {
                  type: 'object',
                  required: true,
                  additionalProperties: false,
                  properties: {
                    attachmentId: { type: 'string', required: true },
                    mediaType: { type: 'string', required: true, enum: ['image/png', 'image/jpeg', 'image/webp'] },
                    width: { type: 'integer', required: true },
                    height: { type: 'integer', required: true },
                    bytes: { type: 'integer', required: true },
                    name: { type: 'string', required: true },
                  },
                },
              },
            },
          },
        },
      },
      render: (_args, value) => outputContent(value),
      presentationMeta: (args, value) => ({
        kind: IMAGE_PRESENTATION_KIND,
        schemaVersion: IMAGE_PRESENTATION_SCHEMA_VERSION,
        prompt: args.prompt.trim(),
        images: value.images,
      }),
    },
    // Generation is deliberately exclusive: one prompt maps to one request batch.
    isConcurrencySafe: () => false,
    finalizeContent: (_exec, result) => appendAbortNote(result),
    async execute(args, exec) {
      if (Object.keys(args).length !== 1 || !Object.hasOwn(args, 'prompt')) failure('Image generation accepts only the prompt field.')
      const prompt = args.prompt.trim()
      if (prompt.length === 0 || prompt.length > PROMPT_MAX_LENGTH) failure('Image prompt must contain 1 to 32000 characters.')
      const transport = ctx.reflect.get(TRANSPORT_SERVICE) as OpenAICodexTransportV1 | undefined
      if (transport?.apiVersion !== 1) failure('The Codex Connect image transport is unavailable.')

      const key = executionKey(exec)
      const current = inFlight.get(key)
      if (current !== undefined) return current
      const pending = generate(ctx, transport, assets, prompt, exec)
        .catch(error => { if (error instanceof SafeToolError) throw error; failure(fixedTransportMessage(error)) })
        .finally(() => { inFlight.delete(key) })
      inFlight.set(key, pending)
      return pending
    },
  })
}
