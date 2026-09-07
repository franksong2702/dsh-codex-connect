// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { OpenAICodexUpdateStore, OPENAI_CODEX_UPDATE_CACHE_KEY } from '../src/client/update-store.ts'
import { OPENAI_CODEX_RUNTIME_PATH } from '../src/update-paths.ts'

const version = '0.1.0-alpha.4.29'
const dsh = '0.1.2-rc.1'
const result = (status: 'compatible' | 'not-yet-compatible') => ({
  status: 'up-to-date', currentVersion: version, currentDshVersion: dsh, latestVersion: version,
  compatibility: { status, latestPluginVersion: version, latestDshVersion: dsh },
})
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

it('leaves checking after a stalled runtime read and allows a later retry', async () => {
  vi.stubGlobal('fetch', () => new Promise<Response>(() => {}))
  let finished = false
  void updater.refresh().then(() => { finished = true })
  await vi.advanceTimersByTimeAsync(45_000)
  expect(finished).toBe(true)
  expect(updater.getSnapshot().status).toBe('unavailable')
  vi.stubGlobal('fetch', async (path: string) => Response.json(path === OPENAI_CODEX_RUNTIME_PATH
    ? { currentDshVersion: dsh } : result('compatible')))
  await updater.refresh(true)
  expect(updater.getSnapshot().compatibility?.status).toBe('compatible')
})

it('rechecks a cached negative verdict for an unchanged installed pair before exposing it', async () => {
  localStorage.setItem(OPENAI_CODEX_UPDATE_CACHE_KEY, JSON.stringify({ checkedAt: Date.now(), result: result('not-yet-compatible') }))
  let resolveUpdate!: (value: Response) => void
  vi.stubGlobal('fetch', vi.fn(async (path: string) => path === OPENAI_CODEX_RUNTIME_PATH
    ? Response.json({ currentDshVersion: dsh })
    : new Promise<Response>(resolve => { resolveUpdate = resolve })))
  const pending = updater.refresh()
  await vi.waitFor(() => expect(resolveUpdate).toBeTypeOf('function'))
  expect(updater.getSnapshot().compatibility).toBeUndefined()
  resolveUpdate(Response.json(result('compatible')))
  await pending
  expect(updater.getSnapshot().compatibility?.status).toBe('compatible')
})

it('rechecks a mounted negative verdict after five minutes and stops after compatibility is confirmed', async () => {
  const replies = [result('not-yet-compatible'), result('compatible')]
  const fetchMock = vi.fn(async (path: string) => Response.json(path === OPENAI_CODEX_RUNTIME_PATH
    ? { currentDshVersion: dsh } : replies.shift()))
  vi.stubGlobal('fetch', fetchMock)
  await updater.refresh()
  expect(updater.getSnapshot().compatibility?.status).toBe('not-yet-compatible')
  await vi.advanceTimersByTimeAsync(5 * 60_000)
  expect(updater.getSnapshot().compatibility?.status).toBe('compatible')
  await vi.advanceTimersByTimeAsync(10 * 60_000)
  expect(fetchMock).toHaveBeenCalledTimes(4)
})

it('does not resurrect an old cached verdict after a failed forced check', async () => {
  localStorage.setItem(OPENAI_CODEX_UPDATE_CACHE_KEY, JSON.stringify({ checkedAt: Date.now(), result: result('compatible') }))
  vi.stubGlobal('fetch', vi.fn(async (path: string) => {
    if (path === OPENAI_CODEX_RUNTIME_PATH) return Response.json({ currentDshVersion: dsh })
    throw new Error('offline')
  }))
  await updater.refresh(true)
  await updater.refresh()
  expect(updater.getSnapshot().status).toBe('unavailable')
  expect(updater.getSnapshot().compatibility).toBeUndefined()
})

it('retains the original check time when reusing a verified cache entry', async () => {
  const checkedAt = Date.now() - 60_000
  localStorage.setItem(OPENAI_CODEX_UPDATE_CACHE_KEY, JSON.stringify({ checkedAt, result: result('compatible') }))
  const fetchMock = vi.fn(async () => Response.json({ currentDshVersion: dsh }))
  vi.stubGlobal('fetch', fetchMock)
  await updater.refresh()
  expect(updater.getSnapshot().checkedAt).toBe(checkedAt)
  expect(fetchMock).toHaveBeenCalledTimes(1)
})

it('cancels the scheduled compatibility recheck when disposed', async () => {
  const fetchMock = vi.fn(async (path: string) => Response.json(path === OPENAI_CODEX_RUNTIME_PATH
    ? { currentDshVersion: dsh } : result('not-yet-compatible')))
  vi.stubGlobal('fetch', fetchMock)
  await updater.refresh()
  updater.dispose()
  await vi.advanceTimersByTimeAsync(10 * 60_000)
  expect(fetchMock).toHaveBeenCalledTimes(2)
})

it('does not publish or schedule a late response after disposal', async () => {
  let resolveUpdate!: (value: Response) => void
  vi.stubGlobal('fetch', vi.fn(async (path: string) => path === OPENAI_CODEX_RUNTIME_PATH
    ? Response.json({ currentDshVersion: dsh })
    : new Promise<Response>(resolve => { resolveUpdate = resolve })))
  const pending = updater.refresh()
  await vi.waitFor(() => expect(resolveUpdate).toBeTypeOf('function'))
  updater.dispose()
  resolveUpdate(Response.json(result('not-yet-compatible')))
  await pending
  expect(localStorage.getItem(OPENAI_CODEX_UPDATE_CACHE_KEY)).toBeNull()
  expect(vi.getTimerCount()).toBe(0)
})
