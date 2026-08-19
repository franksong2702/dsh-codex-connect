import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { Message } from '@deepseek-ai/cordis'
import * as Images from '../src/index.ts'

let context: Context | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
})

function captureLogs(ctx: Context): Message[] {
  const messages: Message[] = []
  ctx.logger.exporter({
    levels: { default: 3 },
    export(message) { messages.push(message) },
  })
  return messages
}

function fakeCore(apiVersion: number) {
  return (ctx: Context): void => {
    ctx.provide('openaiCodexTransport', {
      apiVersion,
      generateImages: () => Promise.reject(new Error('PR-2 must not call the transport')),
    })
  }
}

describe('Codex Connect Images transport dependency', () => {
  it('warns once while missing and reacts to late availability without registering a tool', async () => {
    const ctx = new Context()
    context = ctx
    const logs = captureLogs(ctx)
    await ctx.plugin(Images, Images.Config({}))

    expect(logs.filter(message => message.type === 'warn')).toHaveLength(1)
    expect(logs.find(message => message.type === 'warn')?.args.join(' ')).toContain('dsh-codex-connect@alpha')
    expect(ctx.reflect.get('openaiCodexTransport')).toBeUndefined()

    const core = await ctx.plugin(fakeCore(1))
    await ctx.fiber.await()
    expect(ctx.reflect.get('openaiCodexTransport')).toMatchObject({ apiVersion: 1 })
    expect(logs.filter(message => message.type === 'warn')).toHaveLength(1)
    expect(logs.filter(message => message.type === 'error')).toHaveLength(0)

    await core.dispose()
    expect(ctx.reflect.get('openaiCodexTransport')).toBeUndefined()
    await ctx.plugin(fakeCore(1))
    await ctx.fiber.await()
    expect(logs.filter(message => message.type === 'warn')).toHaveLength(1)
  })

  it('rejects an unsupported transport api version without registering later-phase behavior', async () => {
    const ctx = new Context()
    context = ctx
    const logs = captureLogs(ctx)
    await ctx.plugin(fakeCore(2))
    await ctx.plugin(Images, Images.Config({}))
    await ctx.fiber.await()

    expect(logs.filter(message => message.type === 'warn')).toHaveLength(0)
    expect(logs.filter(message => message.type === 'error')).toHaveLength(1)
    expect(logs.find(message => message.type === 'error')?.args.join(' ')).toContain('unsupported transport API version')
  })
})
