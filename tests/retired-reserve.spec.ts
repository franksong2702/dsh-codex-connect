import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { OpenAICodexCredentialStore } from '../src/store.ts'
import { codexTestToken } from './codex-token-fixture.ts'
import { createOpenAICodexAdapter } from '../src/adapter.ts'
import { Config, resolveOpenAICodexSettings } from '../src/index.ts'

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

it.each(['prepare', 'stream', 'metadata'])('rejects legacy gpt-reserve before auth or network at %s', async entry => {
  const captureActiveAccount = vi.fn(() => { throw new Error('credentials must not be read') })
  const fetch = vi.fn(() => { throw new Error('network must not be reached') })
  vi.stubGlobal('fetch', fetch)
  const adapter = createOpenAICodexAdapter({ captureActiveAccount } as unknown as OpenAICodexCredentialStore, () => undefined)
  const request = { provider: 'openai-codex', model: 'gpt-reserve', messages: [] }
  if (entry === 'prepare') {
    await expect(adapter.prepareCall('openai-codex', 'gpt-reserve')).rejects.toMatchObject({ code: 'MODEL_RETIRED', message: expect.stringContaining('Select an ordinary model explicitly') })
  } else if (entry === 'stream') {
    expect(() => adapter.stream(request)).toThrow('Luna Reserve has been removed')
  } else {
    await expect(adapter.resolveModel('openai-codex', 'gpt-reserve')).rejects.toMatchObject({ code: 'MODEL_RETIRED' })
  }

  expect(captureActiveAccount).not.toHaveBeenCalled()
  expect(fetch).not.toHaveBeenCalled()
})

it('accepts old boolean config without ever enabling Reserve in effective settings', () => {
  expect(Config({ enableReserveFallback: true }).enableReserveFallback.get()).toBe(true)
  expect(resolveOpenAICodexSettings({ enableReserveFallback: true }).enableReserveFallback).toBe(false)
})

it('rejects a retired route passed to a captured ordinary prepared stream without another credential read', async () => {
  const root = await mkdtemp(join(tmpdir(), 'retired-reserve-prepared-'))
  try {
    const credentials = new OpenAICodexCredentialStore(join(root, 'synthetic-auth.json'))
    await credentials.modify('openai-codex', async () => ({ type: 'oauth', accountId: 'fixture-account', access: codexTestToken(), refresh: 'fixture', expires: Date.now() + 3600000 }))
    const fetch = vi.fn(() => { throw new Error('network must not be reached') })
    vi.stubGlobal('fetch', fetch)
    const adapter = createOpenAICodexAdapter(credentials, () => undefined)
    const prepared = await adapter.prepareCall('openai-codex', 'gpt-6-astra')
    const capture = vi.spyOn(credentials, 'captureActiveAccount')
    capture.mockImplementation(() => { throw new Error('credentials must not be read again') })
    expect(() => prepared.stream({ provider: 'openai-codex', model: 'gpt-reserve', messages: [] })).toThrow('Luna Reserve has been removed')
    expect(capture).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  } finally { await rm(root, { recursive: true, force: true }) }
})

it('does not retire a foreign provider model with the same model id', async () => {
  const adapter = createOpenAICodexAdapter({} as OpenAICodexCredentialStore, () => undefined)
  await expect(adapter.prepareCall('foreign-provider', 'gpt-reserve')).rejects.not.toMatchObject({ code: 'MODEL_RETIRED' })
})
