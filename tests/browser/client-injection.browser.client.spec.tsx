import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import { apply, inject } from '../../src/client/index.tsx'

type SlotEntry = {
  name: string
  inject?: (sessionId: string) => unknown
}

let composerRegistration: Promise<void>
let resolveComposerRegistration: () => void
let rejectComposerRegistration: (reason: unknown) => void

class RemoteFixture extends Service {
  constructor(ctx: Context) {
    super(ctx, 'remote')
  }

  $on(): () => void {
    return () => undefined
  }
}

class RemoteSessionFixture extends Service {
  readonly store = { model: 'gpt-5.6-sol' }

  constructor(ctx: Context) {
    super(ctx, 'remote.session')
  }
}

class ModelDirectoriesFixture extends Service {
  static inject = ['remote', 'remote.session']

  constructor(ctx: Context) {
    super(ctx, 'modelDirectories')
  }

  directoryFor(): { store: unknown } {
    const session = this.ctx.remote.session as unknown as { store: unknown }
    return { store: session.store }
  }
}

class SlotsFixture extends Service {
  constructor(ctx: Context) {
    super(ctx, 'slots')
  }

  inject(_name: string, callback: () => void): void {
    callback()
  }

  register(entry: SlotEntry): () => void {
    if (entry.name === 'conversation.input.right') {
      try {
        entry.inject?.('session-1')
        resolveComposerRegistration()
      } catch (error: unknown) {
        rejectComposerRegistration(error)
      }
    }
    return () => undefined
  }
}

let context: Context | undefined

afterEach(async () => {
  vi.unstubAllGlobals()
  await context?.fiber.dispose()
  context = undefined
})

describe('OpenAI Codex client dependency injection', () => {
  it('keeps the model directory remote session available inside Composer slots', async () => {
    composerRegistration = new Promise<void>((resolve, reject) => {
      resolveComposerRegistration = resolve
      rejectComposerRegistration = reject
    })
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ status: 'signed-out' })))
    const ctx = new Context()
    context = ctx
    await ctx.plugin(RemoteFixture)
    await ctx.plugin(RemoteSessionFixture)
    await ctx.plugin(ModelDirectoriesFixture)
    await ctx.plugin(SlotsFixture)
    ctx.provide('locale', {
      register: () => () => undefined,
      bind: () => (key: string) => key,
    })
    ctx.provide('connection', {})
    ctx.provide('settingsScope', { bind: () => ({}) })
    ctx.provide('sessions', {})

    await expect(ctx.plugin({ name: 'codex-connect-client-fixture', inject, apply })).resolves.toBeDefined()
    await expect(composerRegistration).resolves.toBeUndefined()
  })
})
