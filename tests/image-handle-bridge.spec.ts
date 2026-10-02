import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import type { ContentBlock, GenerateOptions } from '@deepseek-ai/dsh-llm'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { SessionId, SessionStore } from '@deepseek-ai/dsh-session'
import type { Session } from '@deepseek-ai/dsh-session'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import { withOpenAICodexImageSelectionHandles } from '../src/adapter.ts'
import { appendImageSelectionHandles, IMAGE_HANDLE_LINE_PREFIX, registerImageHandleBridge } from '../src/image-handle-bridge.ts'
import { imageSelectionHandleText } from '../src/image-input-contract.ts'

function image(id: string, name?: string): ImageAttachmentRef {
  return { attachmentId: id as ImageAttachmentRef['attachmentId'], mediaType: 'image/png', width: 2, height: 2, bytes: 20,
    ...(name === undefined ? {} : { name }) }
}

const contexts: Context[] = []
afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
})

describe('image selection handle projection consistency', () => {
  it('appends the exact adapter handle text after each decodable image', () => {
    const first = image('sha256:first', 'first.png')
    const second = { ...image('sha256:second'), originalDimensions: { width: 12, height: 8 } }
    const content: ContentBlock[] = [
      { type: 'text', text: 'loaded two images' },
      { type: 'image', attachment: first },
      { type: 'image', attachment: second },
    ]
    const replaced = appendImageSelectionHandles(content)
    expect(replaced).toBeDefined()
    expect(replaced![0]).toBe(content[0])
    expect(replaced![1]).toBe(content[1])
    expect(replaced![2]).toEqual({ type: 'text', text: imageSelectionHandleText(1, first) })
    expect(replaced![3]).toBe(content[2])
    expect(replaced![4]).toEqual({ type: 'text', text: imageSelectionHandleText(2, second) })
    expect(replaced![4]).toHaveProperty('text', expect.stringContaining('use attachment='))
    expect(content).toHaveLength(3)
  })

  it('matches the request-time projection byte for byte', () => {
    const attachment = image('sha256:same', 'same.png')
    const options = { provider: 'openai-codex', model: 'gpt-5.6-sol', messages: [
      { role: 'user' as const, content: [{ type: 'text' as const, text: 'hi' }, { type: 'image' as const, attachment }] },
    ] } as GenerateOptions
    const projected = withOpenAICodexImageSelectionHandles(options).messages[0]!.content
    const bridged = appendImageSelectionHandles(options.messages[0]!.content as ContentBlock[])
    const projectedText = projected.filter(block => block.type === 'text' && block.text.startsWith(IMAGE_HANDLE_LINE_PREFIX))
    const bridgedText = bridged!.filter(block => block.type === 'text' && block.text.startsWith(IMAGE_HANDLE_LINE_PREFIX))
    expect(bridgedText).toEqual(projectedText)
  })

  it('is idempotent when a handle line already follows the image', () => {
    const content: ContentBlock[] = [
      { type: 'image', attachment: image('sha256:once', 'once.png') },
      { type: 'text', text: imageSelectionHandleText(1, image('sha256:once', 'once.png')) },
    ]
    expect(appendImageSelectionHandles(content)).toBeUndefined()
  })

  it('adds the canonical handle when adjacent text names a different image', () => {
    const attachment = image('sha256:current', 'current.png')
    const staleText = imageSelectionHandleText(1, image('sha256:previous', 'previous.png'))
    const replaced = appendImageSelectionHandles([
      { type: 'image', attachment }, { type: 'text', text: staleText },
    ])
    expect(replaced?.[1]).toEqual({ type: 'text', text: imageSelectionHandleText(1, attachment) })
    expect(replaced?.[2]).toEqual({ type: 'text', text: staleText })
  })

  it('skips images whose attachment does not decode to a canonical reference', () => {
    const content: ContentBlock[] = [
      { type: 'image', attachment: { ...image('sha256:bad'), unexpected: true } as ImageAttachmentRef },
      { type: 'image', attachment: image('sha256:good', 'good.png') },
    ]
    const replaced = appendImageSelectionHandles(content)
    expect(replaced).toHaveLength(3)
    // The skipped image still consumes ordinal 1 so numbering matches the adapter projection.
    expect(replaced![2]).toEqual({ type: 'text', text: imageSelectionHandleText(2, image('sha256:good', 'good.png')) })
  })

  it('returns undefined for content without projectable images', () => {
    expect(appendImageSelectionHandles([{ type: 'text', text: 'plain' }])).toBeUndefined()
  })
})

async function setup(options: { enabled: boolean; provider?: string; tools?: string[]; unknownRoute?: boolean }) {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(SessionStore)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime, { mode: 'native' })
  const session = ctx.sessions.create(SessionId('owner'))
  const attachment = image('sha256:bridge', 'bridge.png')
  const echoTool: ToolDefinition = defineTool({
    name: 'image_echo',
    description: 'test tool that returns one image block',
    parameters: {},
    output: { schema: { type: 'object', additionalProperties: false, properties: {} },
      render: () => [{ type: 'text', text: 'one image' }, { type: 'image', attachment }] },
    async execute() { return {} },
  })
  ctx.tools.register(echoTool)
  registerImageHandleBridge(ctx, {
    enabled: () => options.enabled,
    ...(options.tools === undefined ? {} : { tools: () => options.tools }),
  })
  const execute = () => ctx.tools.execute({ signal: new AbortController().signal, callId: 'bridge-1' as never,
    name: 'image_echo', arguments: {},
    agent: { id: session.id, options: { provider: options.unknownRoute === true ? undefined : options.provider ?? 'kimi-coding' }, session } as never })
  return { ctx, session, execute, attachment }
}

describe('persistent image handle bridge', () => {
  it('appends a durable handle line to image tool results on non-Codex routes', async () => {
    const { execute, attachment } = await setup({ enabled: true })
    const result = await execute()
    expect(result.isError).not.toBe(true)
    const texts = (result.content as ContentBlock[]).filter(block => block.type === 'text')
    expect(texts.some(block => block.text === imageSelectionHandleText(1, attachment))).toBe(true)
  })

  it('stays dormant while disabled', async () => {
    const { execute } = await setup({ enabled: false })
    const result = await execute()
    const texts = (result.content as ContentBlock[]).filter(block => block.type === 'text')
    expect(texts.some(block => block.text.startsWith(IMAGE_HANDLE_LINE_PREFIX))).toBe(false)
  })

  it('skips the openai-codex route where the adapter already projects handles', async () => {
    const { execute } = await setup({ enabled: true, provider: 'openai-codex' })
    const result = await execute()
    const texts = (result.content as ContentBlock[]).filter(block => block.type === 'text')
    expect(texts.some(block => block.text.startsWith(IMAGE_HANDLE_LINE_PREFIX))).toBe(false)
  })

  it.each([undefined, ''])('keeps results unchanged when the provider cannot be verified (%s)', async provider => {
    const { execute } = await setup({ enabled: true, ...(provider === undefined ? { unknownRoute: true } : { provider }) })
    const result = await execute()
    expect(result.isError).not.toBe(true)
    expect((result.content as ContentBlock[]).some(block => block.type === 'text' && block.text.startsWith(IMAGE_HANDLE_LINE_PREFIX))).toBe(false)
  })

  it('honors the tool name filter', async () => {
    const { execute } = await setup({ enabled: true, tools: ['other_tool'] })
    const result = await execute()
    const texts = (result.content as ContentBlock[]).filter(block => block.type === 'text')
    expect(texts.some(block => block.text.startsWith(IMAGE_HANDLE_LINE_PREFIX))).toBe(false)
  })
})
