import type { Agent } from '@deepseek-ai/dsh-agent'
import type { Context } from '@deepseek-ai/cordis'
import { scopeTarget } from '@deepseek-ai/dsh-scope'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { registerOpenAICodexFastModeDefaults } from '../src/fast-mode-defaults.ts'
import { ConversationSpeedRegistry } from '../src/conversation-speed.ts'
import { OPENAI_CODEX_FAST_MODE_PATH as FAST_PATH } from '../src/fast-mode-paths.ts'
import { OPENAI_CODEX_SPEED_MODE_PATH as PATH } from '../src/speed-mode-contract.ts'
import type { OpenAICodexSpeedMode } from '../src/speed-mode-contract.ts'
import { Config } from '../src/index.ts'
import { DEFAULT_OPENAI_CODEX_SETTINGS, decodeOpenAICodexSettings, resolveOpenAICodexSettings } from '../src/settings-contract.ts'
import { speedLifecycleFixture } from './support/speed-lifecycle-fixture.ts'

const cleanups: Context[] = []
afterEach(async () => { for (const ctx of cleanups.splice(0)) await ctx.fiber.dispose() })
async function fixture(resolveAccount?: () => Promise<string | undefined>, mode: OpenAICodexSpeedMode = 'ultrafast') {
  const f = await speedLifecycleFixture()
  cleanups.push(f.ctx)
  const account = vi.fn(resolveAccount ?? (async () => f.scope().accountKey))
  registerOpenAICodexFastModeDefaults(f.ctx, f.registry, () => ({ enableNewSessionFastMode: true, enableNewSubagentFastMode: false,
    newSessionSpeedMode: mode, newSubagentSpeedMode: 'standard' }), account)
  const agent = { id: f.session.id, session: f.session } as Agent
  const start = (source: 'startup' | 'resume' = 'startup', signal?: AbortSignal) =>
    f.ctx.serial(scopeTarget(agent, undefined), 'agent/created', { agent, source, ...(signal === undefined ? {} : { signal }) })
  const request = async (provider = 'openai-codex', model = 'gpt-6.1-sol') => {
    const route = { provider, model }
    return f.ctx.waterfall('agent/request', { agent, turn: 1, step: 1, signal: new AbortController().signal }, async () => route)
  }
  return { ...f, account, start, requestRoute: request }
}

describe('explicit startup speed preferences on real Host lifecycle and routes', () => {
  it('works before the first request header, displays the opted-in default and preserves unknown entitlement', async () => {
    const f = await fixture()
    expect(f.session.requestHeader()).toBeUndefined()
    await f.start()
    const res = await f.request(`${PATH}?sessionId=session&model=gpt-6.1-sol`, { method: 'GET' })
    expect(await res.json()).toMatchObject({ mode: 'ultrafast', eligibility: 'unknown', hasAccount: true, modelSupported: true })
    await f.requestRoute()
    expect(f.registry.captureSpeed('session').mode).toBe('ultrafast')
    expect(f.account).toHaveBeenCalledOnce()
  })
  it('refuses legacy boolean readback for a pending paid default but honors an explicit legacy Standard command', async () => {
    const f = await fixture()
    await f.start()
    expect((await f.request(`${FAST_PATH}?sessionId=session`, { method: 'GET' })).status).toBe(409)
    const reset = await f.request(FAST_PATH, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionId: 'session', enabled: false }) })
    expect(reset.status).toBe(200)
    await f.requestRoute()
    expect((await f.request(`${FAST_PATH}?sessionId=session`, { method: 'GET' })).status).toBe(200)
    expect(f.registry.captureSpeed('session').mode).toBe('standard')
  })

  it('binds an unviewed new session to its admitted request, while resuming never seeds it', async () => {
    const f = await fixture()
    await f.start()
    await f.requestRoute()
    expect(f.registry.requestSpeed('session', f.scope())).toBe('ultrafast')
    f.registry.set('session', false)
    await f.start()
    await f.requestRoute()
    expect(f.registry.captureSpeed('session').mode).toBe('standard')
    const resumed = await fixture()
    await resumed.start('resume')
    await resumed.requestRoute()
    expect(resumed.registry.captureSpeed('session').mode).toBe('standard')
    expect(resumed.account).not.toHaveBeenCalled()
  })
  it.each([['deepseek', 'deepseek-flash'], ['openai-codex', 'gpt-5.6-sol']])('does not seed an unsupported initial route %s/%s or activate later', async (provider, model) => {
    const f = await fixture()
    await f.start()
    await f.requestRoute(provider, model)
    await f.requestRoute()
    expect(f.registry.captureSpeed('session').mode).toBe('standard')
  })
  it.each(['manual', 'model', 'account'] as const)('retires a startup intent when a %s command wins during account loading', async change => {
    let release!: (value: string | undefined) => void
    const f = await fixture(() => new Promise(resolve => { release = resolve }))
    const starting = f.start()
    await vi.waitFor(() => { expect(f.account).toHaveBeenCalledOnce() })
    if (change === 'manual') f.registry.set('session', false)
    if (change === 'model') { f.modelChanged('gpt-6-astra'); f.modelChanged('gpt-6.1-sol') }
    if (change === 'account') f.accountChanged()
    release(f.scope().accountKey)
    await starting
    await f.requestRoute()
    expect(f.registry.captureSpeed('session').mode).toBe('standard')
  })
  it('does not let a stale account-read failure undo a newer manual choice', async () => {
    let reject!: (error: Error) => void
    const f = await fixture(() => new Promise((_resolve, failed) => { reject = failed }))
    const starting = f.start()
    await vi.waitFor(() => { expect(f.account).toHaveBeenCalledOnce() })
    f.registry.set('session', false)
    reject(new Error('synthetic stale read failed'))
    await expect(starting).resolves.toBeUndefined()
    await f.requestRoute()
    expect(f.registry.captureSpeed('session').mode).toBe('standard')
  })

  it('never overwrites a revisioned explicit Standard choice made while startup is pending', async () => {
    let release!: (value: string | undefined) => void
    const f = await fixture(() => new Promise(resolve => { release = resolve }))
    const starting = f.start()
    await vi.waitFor(() => { expect(f.account).toHaveBeenCalledOnce() })
    const state = f.registry.readSpeed('session', f.scope())
    f.registry.selectSpeed('session', f.scope(), state.generation, state.revision, 'standard')
    release(f.scope().accountKey)
    await starting
    await f.requestRoute()
    expect(f.registry.captureSpeed('session').mode).toBe('standard')
  })
  it('rejects missing sign-in on eligible requests without silently downgrading a retry', async () => {
    const f = await fixture(async () => undefined)
    await f.start()
    await expect(f.requestRoute()).rejects.toThrow('ULTRAFAST_SIGN_IN_REQUIRED')
    await expect(f.requestRoute()).rejects.toThrow('ULTRAFAST_SIGN_IN_REQUIRED')
    f.registry.set('session', false)
    await expect(f.requestRoute()).resolves.toMatchObject({ model: 'gpt-6.1-sol' })
  })
  it('drops an aborted startup intent without adding a paid selection', async () => {
    const abort = new AbortController()
    const f = await fixture(async () => { abort.abort(); return f.scope().accountKey })
    await expect(f.start('startup', abort.signal)).rejects.toThrow()
    await f.requestRoute()
    expect(f.registry.captureSpeed('session').mode).toBe('standard')
  })
  it.each(['standard', 'fast'] as const)('explicit %s overrides the legacy true flag without looking up accounts', async mode => {
    const f = await fixture(undefined, mode)
    await f.start()
    expect(f.registry.captureSpeed('session').mode).toBe(mode)
    expect(f.account).not.toHaveBeenCalled()
  })
  it('bounds unviewed startup intents with the existing session limit', async () => {
    const f = await fixture()
    const registry = new ConversationSpeedRegistry(2)
    for (const id of ['first', 'second', 'third']) await registry.seedUltrafastDefault(id, async () => f.scope().accountKey)
    registry.applyStartupDefault('first', { provider: 'openai-codex', model: 'gpt-6.1-sol' })
    expect(registry.captureSpeed('first').mode).toBe('standard')
    registry.applyStartupDefault('third', { provider: 'openai-codex', model: 'gpt-6.1-sol' })
    expect(registry.captureSpeed('third').mode).toBe('ultrafast')
  })
  it('keeps absent and null preferences on legacy settings, while validating both configuration parsers', () => {
    expect(Config({}).newSessionSpeedMode.get()).toBeUndefined()
    expect(Config({ newSessionSpeedMode: null }).newSessionSpeedMode.get()).toBeNull()
    expect(resolveOpenAICodexSettings({ newSessionSpeedMode: null, enableNewSessionFastMode: true }))
      .toMatchObject({ newSessionSpeedMode: undefined, enableNewSessionFastMode: true, newSubagentSpeedMode: undefined })
    for (const mode of ['standard', 'fast', 'ultrafast'] as const) {
      expect(Config({ newSessionSpeedMode: mode }).newSessionSpeedMode.get()).toBe(mode)
      expect(decodeOpenAICodexSettings({ ...DEFAULT_OPENAI_CODEX_SETTINGS, newSubagentSpeedMode: mode })?.newSubagentSpeedMode).toBe(mode)
    }
    for (const value of [true, 'ULTRAFAST', 1, {}, []]) {
      expect(() => Config({ newSessionSpeedMode: value } as never)).toThrow()
      expect(decodeOpenAICodexSettings({ ...DEFAULT_OPENAI_CODEX_SETTINGS, newSubagentSpeedMode: value })).toBeUndefined()
    }
  })
})
