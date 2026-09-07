// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { OpenAICodexAccountStore } from '../src/client/account-store.ts'
import { OPENAI_CODEX_AUTH_LOGIN_PATH } from '../src/auth-paths.ts'

let account: OpenAICodexAccountStore | undefined
afterEach(() => { account?.dispose(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

it('releases a stalled login and reads server state without repeating the mutation', async () => {
  vi.useFakeTimers()
  vi.spyOn(window, 'open').mockReturnValue(null)
  let signal: AbortSignal | undefined | null
  const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
    if (path === OPENAI_CODEX_AUTH_LOGIN_PATH) {
      signal = init?.signal
      return new Promise<Response>(() => {})
    }
    return Response.json({ status: 'signing-in', accounts: [] })
  })
  vi.stubGlobal('fetch', fetchMock)
  account = new OpenAICodexAccountStore()
  account.subscribe(() => {})
  await vi.advanceTimersByTimeAsync(0)
  let finished = false
  const login = account.signIn().then(() => { finished = true })
  await vi.advanceTimersByTimeAsync(45_000)
  expect(finished).toBe(true)
  await login
  expect(signal?.aborted).toBe(true)
  expect(account.getSnapshot()).toMatchObject({ busy: false, status: { status: 'signing-in' } })
  expect(fetchMock.mock.calls.filter(([path]) => path === OPENAI_CODEX_AUTH_LOGIN_PATH)).toHaveLength(1)
})

it('settles an in-flight mutation on disposal even if the transport ignores abort', async () => {
  vi.spyOn(window, 'open').mockReturnValue(null)
  vi.stubGlobal('fetch', () => new Promise<Response>(() => {}))
  account = new OpenAICodexAccountStore()
  let finished = false
  void account.signIn().then(() => { finished = true })
  account.dispose()
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(finished).toBe(true)
})
