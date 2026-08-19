import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import * as OpenAICodex from '../src/index.ts'

let context: Context | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
})

describe('OpenAI Codex transport lifecycle', () => {
  it('registers with the core fiber, preserves typed access, and unloads cleanly', async () => {
    const ctx = new Context()
    context = ctx
    await ctx.plugin(LlmRuntime)
    const core = await ctx.plugin(OpenAICodex, {})

    expect(ctx.get('openaiCodexTransport')?.apiVersion).toBe(1)
    expect(ctx.reflect.get('openaiCodexTransport')).toMatchObject({
      apiVersion: 1,
      generateImages: expect.any(Function),
    })

    await core.dispose()
    expect(ctx.reflect.get('openaiCodexTransport')).toBeUndefined()

    await ctx.plugin(OpenAICodex, {})
    expect(ctx.get('openaiCodexTransport')?.apiVersion).toBe(1)
  })
})
