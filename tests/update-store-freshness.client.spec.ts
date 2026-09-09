// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { OpenAICodexUpdateStore, OPENAI_CODEX_UPDATE_CACHE_KEY } from '../src/client/update-store.ts'

const version = '0.1.0-alpha.4.29'
const result = { status: 'up-to-date', currentVersion: version, latestVersion: version }
let updater: OpenAICodexUpdateStore
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-07T04:00:00Z'))
  const entries = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => { entries.set(key, value) },
    removeItem: (key: string) => { entries.delete(key) },
  })
  updater = new OpenAICodexUpdateStore(version)
})
afterEach(() => { updater.dispose(); vi.useRealTimers(); vi.unstubAllGlobals() })

it('leaves checking after a stalled update read and allows a later retry', async () => {
  vi.stubGlobal('fetch', () => new Promise<Response>(() => {}))
  let finished = false
  void updater.refresh().then(() => { finished = true })
  await vi.advanceTimersByTimeAsync(45_000)
  expect(finished).toBe(true)
  expect(updater.getSnapshot().status).toBe('unavailable')
  vi.stubGlobal('fetch', async () => Response.json(result))
  await updater.refresh(true)
  expect(updater.getSnapshot().status).toBe('up-to-date')
})

it('reuses a current cached result without a runtime or catalog request', async () => {
  localStorage.setItem(OPENAI_CODEX_UPDATE_CACHE_KEY, JSON.stringify({ checkedAt: Date.now(), result }))
  const fetchMock = vi.fn(async () => Response.json(result))
  vi.stubGlobal('fetch', fetchMock)
  await updater.refresh()
  expect(fetchMock).not.toHaveBeenCalled()
  expect(updater.getSnapshot().status).toBe('up-to-date')
})

it('does not schedule a recheck for a successful update result', async () => {
  const fetchMock = vi.fn(async () => Response.json(result))
  vi.stubGlobal('fetch', fetchMock)
  await updater.refresh()
  expect(updater.getSnapshot().status).toBe('up-to-date')
  await vi.advanceTimersByTimeAsync(5 * 60_000)
  expect(fetchMock).toHaveBeenCalledTimes(1)
})

it.each(['compatible', 'dsh-update-required', 'not-yet-compatible', 'unverified'])('ignores cached host verdict %s without scheduling host rechecks', async status => {
  localStorage.setItem(OPENAI_CODEX_UPDATE_CACHE_KEY, JSON.stringify({ checkedAt: Date.now(), result: {
    ...result, currentDshVersion: '0.1.3-alpha.1', compatibility: { status, latestDshVersion: '0.1.2-rc.1' },
  } }))
  const fetchMock = vi.fn(async () => Response.json(result))
  vi.stubGlobal('fetch', fetchMock)
  await updater.refresh()
  expect(updater.getSnapshot().status).toBe('up-to-date')
  expect(updater.getSnapshot()).not.toHaveProperty('compatibility')
  expect(updater.getSnapshot()).not.toHaveProperty('currentDshVersion')
  await vi.advanceTimersByTimeAsync(10 * 60_000)
  expect(fetchMock).not.toHaveBeenCalled()
})

it('does not resurrect an old cached verdict after a failed forced check', async () => {
  localStorage.setItem(OPENAI_CODEX_UPDATE_CACHE_KEY, JSON.stringify({ checkedAt: Date.now(), result }))
  vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
  await updater.refresh(true)
  await updater.refresh()
  expect(updater.getSnapshot().status).toBe('unavailable')
})

it('retains the original check time when reusing a successful cache entry', async () => {
  const checkedAt = Date.now() - 60_000
  localStorage.setItem(OPENAI_CODEX_UPDATE_CACHE_KEY, JSON.stringify({ checkedAt, result }))
  const fetchMock = vi.fn(async () => Response.json(result))
  vi.stubGlobal('fetch', fetchMock)
  await updater.refresh()
  expect(updater.getSnapshot().checkedAt).toBe(checkedAt)
  expect(fetchMock).not.toHaveBeenCalled()
})

it('retries an unavailable check after five minutes and stops after success', async () => {
  const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({ status: 'unavailable', currentVersion: version, reason: 'registry-unavailable' }))
    .mockImplementation(async () => Response.json(result))
  vi.stubGlobal('fetch', fetchMock)
  await updater.refresh()
  expect(updater.getSnapshot().status).toBe('unavailable')
  await vi.advanceTimersByTimeAsync(5 * 60_000)
  expect(updater.getSnapshot().status).toBe('up-to-date')
  await vi.advanceTimersByTimeAsync(10 * 60_000)
  expect(fetchMock).toHaveBeenCalledTimes(2)
})

it('cancels the scheduled retry when disposed', async () => {
  const fetchMock = vi.fn(async () => Response.json({ status: 'unavailable', currentVersion: version, reason: 'registry-unavailable' }))
  vi.stubGlobal('fetch', fetchMock)
  await updater.refresh()
  updater.dispose()
  await vi.advanceTimersByTimeAsync(10 * 60_000)
  expect(fetchMock).toHaveBeenCalledTimes(1)
})

it('does not publish or schedule a late response after disposal', async () => {
  let resolveUpdate!: (value: Response) => void
  vi.stubGlobal('fetch', vi.fn(async () => new Promise<Response>(resolve => { resolveUpdate = resolve })))
  const pending = updater.refresh()
  await vi.waitFor(() => expect(resolveUpdate).toBeTypeOf('function'))
  updater.dispose()
  resolveUpdate(Response.json(result))
  await pending
  expect(localStorage.getItem(OPENAI_CODEX_UPDATE_CACHE_KEY)).toBeNull()
  expect(vi.getTimerCount()).toBe(0)
})
