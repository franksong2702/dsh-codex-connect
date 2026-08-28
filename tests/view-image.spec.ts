import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import LocalAttachmentStore from '@deepseek-ai/dsh-attachment-local'
import LocalFileSystem from '@deepseek-ai/dsh-fs-local'
import { ToolCallId, LlmRuntime } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import WebRuntime from '@deepseek-ai/dsh-web'
import * as OpenAICodex from '../src/index.ts'

const PNG_1X1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC', 'base64')
const signal = new AbortController().signal

let workspace: string
let dshHome: string
let ctx: Context | undefined
let callCounter = 0

beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'dsh-openai-codex-view-image-'))
  dshHome = await mkdtemp(join(tmpdir(), 'dsh-openai-codex-view-image-home-'))
})

afterEach(async () => {
  await ctx?.fiber.dispose()
  ctx = undefined
  await rm(workspace, { recursive: true, force: true })
  await rm(dshHome, { recursive: true, force: true })
})

async function setup(): Promise<Context> {
  const context = new Context()
  ctx = context
  await context.plugin(SystemPrompt)
  await context.plugin(ToolRuntime, { mode: 'native' })
  await context.plugin(LocalFileSystem, { cwd: workspace })
  await context.plugin(LocalAttachmentStore, { dshHome })
  await context.plugin(LlmRuntime)
  await context.plugin(WebRuntime)
  await context.plugin(OpenAICodex, { enableImageTool: true })
  return context
}

function agentOn(model: string): object {
  return {
    options: {},
    session: {
      header: { cwd: workspace },
      requestHeader: () => ({ config: { provider: OpenAICodex.OPENAI_CODEX_PROVIDER, model } }),
      append: () => undefined,
    },
  }
}

async function view(context: Context, source: string, model = 'gpt-5.6-sol') {
  return context.tools.execute({
    signal,
    callId: ToolCallId(`view-image-${++callCounter}`),
    name: OpenAICodex.VIEW_IMAGE_TOOL_NAME,
    arguments: { source },
    agent: agentOn(model) as never,
  })
}

describe('view_image', () => {
  it('returns a durable image block for a local path', async () => {
    const context = await setup()
    await writeFile(join(workspace, 'pixel.bin'), PNG_1X1)

    const result = await view(context, 'pixel.bin')

    expect(result.isError).toBe(false)
    expect(result.content.some(block => block.type === 'image')).toBe(true)
    expect(result.content.find(block => block.type === 'text' && block.text.includes('image/png'))).toBeDefined()
  })

  it('refuses a loopback URL before any request reaches the local service', async () => {
    const context = await setup()
    let requests = 0
    const server = createServer((_request, response) => {
      requests += 1
      response.writeHead(200, { 'content-type': 'image/png' })
      response.end(PNG_1X1)
    })
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', resolve)
    })
    try {
      const address = server.address()
      if (address === null || typeof address === 'string') throw new Error('loopback fixture did not bind a TCP port')

      const result = await view(context, `http://127.0.0.1:${String(address.port)}/pixel.png`)

      expect(result.isError).toBe(true)
      expect(result.content.find(block => block.type === 'text')?.text).toContain('public network address')
      expect(requests).toBe(0)
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close(error => { if (error === undefined) resolve(); else reject(error) })
      })
    }
  })

  it('refuses a model that does not explicitly declare image input', async () => {
    const context = await setup()
    await writeFile(join(workspace, 'pixel.png'), PNG_1X1)

    const result = await view(context, 'pixel.png', 'gpt-5.3-codex-spark')

    expect(result.isError).toBe(true)
    expect(result.content.find(block => block.type === 'text')?.text).toContain('does not declare image input')
  })

  it('presents remote URLs as network fetches and local paths as file reads', async () => {
    const context = await setup()
    const definition = context.tools.get(OpenAICodex.VIEW_IMAGE_TOOL_NAME)

    expect(definition?.presentCall?.({ source: 'https://images.example/pixel.png' })).toMatchObject({
      kind: 'fetch',
      rawInput: 'https://images.example/pixel.png',
    })
    expect(definition?.presentCall?.({ source: 'pixel.png' })).toMatchObject({
      kind: 'read',
      locations: [{ path: 'pixel.png' }],
    })
  })
})
