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
  function volatileHost(initial: string | undefined = 'fixture-original') {
    let route: string | undefined = initial
    const reference = Object.freeze({ get: () => route })
    const config = { searchProvider: reference, fetchProvider: Object.freeze({ get: () => 'fixture-fetch' }) }
    const listeners = new Set<(paths: readonly (readonly string[])[]) => void>()
    const owner = { fiber: { config }, on(_name: string, listener: (paths: readonly (readonly string[])[]) => void) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    } }
    const target = { config, ctx: owner }
    return { web: target as unknown as WebRuntime, target, config, reference, listeners,
      change: (value: string | undefined) => { route = value; for (const listener of listeners) listener([['searchProvider']]) },
      selected: () => Reflect.get(target, 'config').searchProvider.get() as string | undefined }
  }

  it('temporarily selects a volatile route without mutating its readonly reference or fetch route', () => {
    const f = volatileHost()
    const restore = selectOpenAICodexSearchRoute(f.web, 'openai-codex')
    expect(f.selected()).toBe('openai-codex')
    expect(f.reference.get()).toBe('fixture-original')
    expect(f.target.config.fetchProvider.get()).toBe('fixture-fetch')
    restore(); restore()
    expect(f.target.config).toBe(f.config)
    expect(f.selected()).toBe('fixture-original')
    expect(f.listeners.size).toBe(0)
  })

  it('yields to a later live Host selection and retains it after disposal', () => {
    const f = volatileHost()
    const restore = selectOpenAICodexSearchRoute(f.web, 'openai-codex')
    f.change('fixture-newer')
    expect(f.selected()).toBe('fixture-newer')
    restore()
    expect(f.target.config).toBe(f.config)
    expect(f.selected()).toBe('fixture-newer')
  })


  it.each([
    { initial: 'fixture-original', readBetween: true },
    { initial: 'fixture-original', readBetween: false },
    { initial: undefined, readBetween: true },
    { initial: undefined, readBetween: false },
  ])('keeps Host round-trip priority for $initial, intermediate search=$readBetween', ({ initial, readBetween }) => {
    const f = volatileHost(initial)
    // Explicit undefined must stay unset rather than use the helper's default.
    if (initial === undefined) f.change(undefined)
    const restore = selectOpenAICodexSearchRoute(f.web, 'openai-codex')
    expect(f.selected()).toBe('openai-codex')
    f.change('fixture-newer')
    if (readBetween) expect(f.selected()).toBe('fixture-newer')
    f.change(initial)
    expect(f.selected()).toBe(initial)
    restore()
    expect(f.selected()).toBe(initial)
    expect(f.listeners.size).toBe(0)
  })

  it('preserves another owner replacing the config object', () => {
    const f = volatileHost()
    const restore = selectOpenAICodexSearchRoute(f.web, 'openai-codex')
    const next = { searchProvider: Object.freeze({ get: () => 'other-owner' }) }
    Reflect.set(f.target, 'config', next)
    restore()
    expect(f.target.config).toBe(next)
    expect(f.listeners.size).toBe(0)
  })

  it('binds new Cordis to the effective running config instead of retained raw input', () => {
    const f = volatileHost()
    const owner = Object.getOwnPropertyDescriptor(f.web, 'ctx')?.value
    owner.fiber = { config: { searchProvider: 'raw-input' }, effectiveConfig: f.config }
    const restore = selectOpenAICodexSearchRoute(f.web, 'openai-codex')
    expect(f.selected()).toBe('openai-codex')
    f.change('fixture-newer')
    expect(f.selected()).toBe('fixture-newer')
    restore()
    expect(f.target.config).toBe(f.config)
    expect(f.listeners.size).toBe(0)
  })

  it.each([undefined, {}])('rejects mismatched effective config even when raw config matches (%s)', effectiveConfig => {
    const f = volatileHost()
    const owner = Object.getOwnPropertyDescriptor(f.web, 'ctx')?.value
    owner.fiber = { config: f.config, effectiveConfig }
    expect(() => selectOpenAICodexSearchRoute(f.web, 'openai-codex'))
      .toThrow('does not expose the supported search route owner')
    expect(f.selected()).toBe('fixture-original')
    expect(f.target.config).toBe(f.config)
    expect(f.listeners.size).toBe(0)
  })

  it('rejects frozen or malformed config before changing the runtime', () => {
    const f = volatileHost()
    Object.freeze(f.config)
    expect(() => selectOpenAICodexSearchRoute(f.web, 'openai-codex')).toThrow()
    expect(f.target.config).toBe(f.config)
    const config = { searchProvider: { get: () => 42 } }
    const listeners = new Set<(paths: readonly (readonly string[])[]) => void>()
    const owner = { fiber: { config }, on(_name: string, listener: (paths: readonly (readonly string[])[]) => void) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    } }
    const target = { config, ctx: owner }
    expect(() => selectOpenAICodexSearchRoute(target as unknown as WebRuntime, 'openai-codex')).toThrow()
    expect(target.config).toBe(config)
  })

})
