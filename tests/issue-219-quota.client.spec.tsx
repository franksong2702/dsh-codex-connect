// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ModelDirectoryState } from '@deepseek-ai/dsh-client-ui-model-selection/client'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import { OpenAICodexQuotaIndicator } from '../src/client/OpenAICodexQuotaIndicator.tsx'
import { en } from '../src/client/locales.ts'

let hidden = false
const state: ModelDirectoryState = { current: { provider: 'openai-codex', model: 'gpt-5.1-codex' }, routable: true, groups: [], failures: [], status: 'ready', error: null }
const directory: SnapshotStore<ModelDirectoryState> = { getSnapshot: () => state, subscribe: () => () => {}, update: () => {}, set: () => {} }
const success = () => new Response(JSON.stringify({ status: 'signed-in', usage: { rateLimits: [] } }), { headers: { 'content-type': 'application/json' } })
const mount = async () => { await act(async () => { render(<OpenAICodexQuotaIndicator directory={directory} t={key => en[key]} />) }) }
const tick = async (ms: number) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms) }) }
const visibility = (value: boolean) => { hidden = value; fireEvent(document, new Event('visibilitychange')) }

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(0); hidden = false
  vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden)
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('issue 219 quota browser scheduling', () => {
  it('does not poll an initially hidden document and refreshes when visible', async () => {
    hidden = true
    const fetch = vi.fn(async () => success()); vi.stubGlobal('fetch', fetch)
    await mount(); await tick(3_600_000); expect(fetch).not.toHaveBeenCalled()
    visibility(false); await tick(0); expect(fetch).toHaveBeenCalledTimes(1)
    await tick(60_000); expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('pauses hidden tabs and avoids visibility-toggle bursts', async () => {
    const fetch = vi.fn(async () => success()); vi.stubGlobal('fetch', fetch)
    await mount(); await tick(10_000)
    visibility(true); visibility(false); await tick(0); expect(fetch).toHaveBeenCalledTimes(1)
    visibility(true); await tick(3_600_000); expect(fetch).toHaveBeenCalledTimes(1)
    visibility(false); await tick(0); expect(fetch).toHaveBeenCalledTimes(2)
    visibility(true); visibility(false); await tick(0); expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('backs off repeated failures and does not bypass cooldown on refocus', async () => {
    const fetch = vi.fn(async (): Promise<Response> => { throw new Error('offline') }); vi.stubGlobal('fetch', fetch)
    await mount(); expect(fetch).toHaveBeenCalledTimes(1)
    await tick(60_000); expect(fetch).toHaveBeenCalledTimes(2)
    visibility(true); visibility(false)
    await tick(119_999); expect(fetch).toHaveBeenCalledTimes(2)
    fetch.mockImplementation(async () => success())
    await tick(1); expect(fetch).toHaveBeenCalledTimes(3)
    await tick(60_000); expect(fetch).toHaveBeenCalledTimes(4)
  })

  it('backs off server-side quota failures carried by a successful local HTTP response', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ status: 'signed-in', usage: { rateLimits: [] }, quotaError: 'temporarily unavailable' })))
    vi.stubGlobal('fetch', fetch)
    await mount(); await tick(60_000); expect(fetch).toHaveBeenCalledTimes(2)
    await tick(119_999); expect(fetch).toHaveBeenCalledTimes(2)
    await tick(1); expect(fetch).toHaveBeenCalledTimes(3)
  })

  it('does not overlap a slow request and aborts it on unmount', async () => {
    let signal: AbortSignal | undefined
    const fetch = vi.fn((_input: unknown, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      signal = init?.signal ?? undefined
      signal?.addEventListener('abort', () => reject(new DOMException('cancelled', 'AbortError')), { once: true })
    }))
    vi.stubGlobal('fetch', fetch)
    await mount(); await tick(600_000); expect(fetch).toHaveBeenCalledTimes(1)
    cleanup(); expect(signal?.aborted).toBe(true)
    visibility(true); visibility(false); await tick(600_000)
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
