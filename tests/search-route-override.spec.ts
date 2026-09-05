import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import WebRuntime from '@deepseek-ai/dsh-web'
import { selectOpenAICodexSearchRoute } from '../src/search-route-override.ts'

let context: Context | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
})

describe('supported DSH search route override', () => {
  it('selects Codex and restores the previous provider idempotently', async () => {
    const ctx = new Context()
    context = ctx
    await ctx.plugin(WebRuntime, { searchProvider: 'deepseek-official' })

    const restore = selectOpenAICodexSearchRoute(ctx.web, 'openai-codex')
    expect(Reflect.get(ctx.web, 'searchProviderId')).toBe('openai-codex')

    restore()
    restore()
    expect(Reflect.get(ctx.web, 'searchProviderId')).toBe('deepseek-official')
  })

  it('does not overwrite a later route selected by another owner', async () => {
    const ctx = new Context()
    context = ctx
    await ctx.plugin(WebRuntime, { searchProvider: 'deepseek-official' })

    const restore = selectOpenAICodexSearchRoute(ctx.web, 'openai-codex')
    Reflect.set(ctx.web, 'searchProviderId', 'new-owner')
    restore()

    expect(Reflect.get(ctx.web, 'searchProviderId')).toBe('new-owner')
  })

  it('rejects an unsupported runtime before changing it', () => {
    expect(() => selectOpenAICodexSearchRoute({} as WebRuntime, 'openai-codex'))
      .toThrow('does not expose the supported search route field')
  })
})
