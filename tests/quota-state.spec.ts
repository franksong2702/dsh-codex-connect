import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { OpenAICodexCredentialStore } from '../src/store.ts'
import { OpenAICodexQuotaState } from '../src/quota-state.ts'
import { OpenAICodexReauthRequiredError, OpenAICodexUsageHttpError } from '../src/usage.ts'
import { OpenAICodexBackendRequests } from '../src/backend-request.ts'

const { readAuth, readResponse } = vi.hoisted(() => ({ readAuth: vi.fn(), readResponse: vi.fn() }))
vi.mock('../src/auth.ts', async importOriginal => ({
  ...await importOriginal<typeof import('../src/auth.ts')>(), readOpenAICodexRequestAuth: readAuth,
}))
vi.mock('../src/usage.ts', async importOriginal => ({
  ...await importOriginal<typeof import('../src/usage.ts')>(), readOpenAICodexUsageResponse: readResponse,
}))

function token(accountId: string, userId: string): string {
  const payload = Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': {
    chatgpt_account_id: accountId, chatgpt_user_id: userId,
  } })).toString('base64url')
  return `header.${payload}.signature`
}

function response(accountId = 'acct', userId = 'user', used = 20, resetAt: number | null = null): Record<string, unknown> {
  return {
    account_id: accountId, user_id: userId,
    rate_limit: { allowed: true, primary_window: { used_percent: used, limit_window_seconds: 100, reset_at: resetAt } },
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

async function flush(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

function setup(backendRequests?: OpenAICodexBackendRequests) {
  let account = 'acct'
  let user = 'user'
  let proxy: string | undefined
  const captured = { captureActiveAccount: vi.fn(async () => captured) }
  const proxyManager = { run: vi.fn((_proxy: string | undefined, operation: () => unknown) => operation()) }
  readAuth.mockImplementation(async () => ({ access: token(account, user), accountId: account }))
  readResponse.mockImplementation(async () => response(account, user))
  const state = new OpenAICodexQuotaState({
    credentials: captured as unknown as OpenAICodexCredentialStore,
    proxyManager: proxyManager as never,
    resolveProxyUrl: () => proxy,
    backendRequests,
  })
  return {
    state, captured, proxyManager,
    setAccount(value: string, nextUser = 'user') { account = value; user = nextUser },
    setProxy(value: string | undefined) { proxy = value },
  }
}

describe('OpenAICodexQuotaState acceptance', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(0); vi.resetAllMocks(); vi.spyOn(Math, 'random').mockReturnValue(0) })
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

  it('keeps sequential cache reads from postponing the t=60 refresh', async () => {
    const { state } = setup()
    expect((await state.read()).fetchedAt).toBe(0)
    await vi.advanceTimersByTimeAsync(10_000); expect((await state.read()).fetchedAt).toBe(0)
    await vi.advanceTimersByTimeAsync(10_000); await state.read()
    expect(readResponse).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(39_999)
    expect(readResponse).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    await flush(); expect(readResponse).toHaveBeenCalledTimes(1)
    await state.read(); expect(readResponse).toHaveBeenCalledTimes(2)
    expect((await state.read()).fetchedAt).toBe(60_000)
    await state.dispose()
  })

  it('routes usage GETs through the shared governor when one is installed', async () => {
    const requests = new OpenAICodexBackendRequests()
    const run = vi.spyOn(requests, 'run')
    const h = setup(requests)
    try {
      await h.state.read()
      expect(run).toHaveBeenCalledWith(expect.objectContaining({ lane: 'quota' }), expect.any(Function))
      expect(readResponse.mock.calls[0]?.[2]).toEqual(expect.any(Function))
    } finally {
      await h.state.dispose()
      requests.dispose()
    }
  })

  it('backs off failed refreshes and does not query on every timer step', async () => {
    const { state } = setup()
    await state.read()
    readResponse.mockRejectedValueOnce(new Error('private upstream detail'))
    await vi.advanceTimersByTimeAsync(60_000)
    await flush(); expect(readResponse).toHaveBeenCalledTimes(1)
    await expect(state.read()).rejects.toThrow('temporarily unavailable')
    expect(readResponse).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(59_999)
    expect(readResponse).toHaveBeenCalledTimes(2)
    readResponse.mockResolvedValueOnce(response())
    await vi.advanceTimersByTimeAsync(1)
    await state.read(); expect(readResponse).toHaveBeenCalledTimes(3)
    await state.dispose()
  })

  it('isolates account/user entries and does not relabel out-of-order responses', async () => {
    const h = setup()
    const first = deferred<Record<string, unknown>>()
    const second = deferred<Record<string, unknown>>()
    readResponse.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const a = h.state.read()
    h.setAccount('acct-b', 'user-b')
    const b = h.state.read()
    second.resolve(response('acct-b', 'user-b', 90)); first.resolve(response('acct', 'user', 20))
    const [aResult, bResult] = await Promise.all([a, b])
    expect(aResult.usage.rateLimits[0]?.windows[0]?.remainingPercent).toBe(80)
    expect(bResult.usage.rateLimits[0]?.windows[0]?.remainingPercent).toBe(10)
    h.setAccount('acct')
    await expect(h.state.read()).resolves.toMatchObject({ usage: aResult.usage })
    expect(readResponse).toHaveBeenCalledTimes(2)
    await h.state.dispose()
  })

  it('prevents an invalidated pending response from committing authority', async () => {
    const h = setup()
    const old = deferred<Record<string, unknown>>()
    readResponse.mockReturnValueOnce(old.promise).mockResolvedValueOnce(response('acct', 'user', 99))
    const pending = h.state.read(); await flush(); h.state.invalidate(); old.resolve(response('acct', 'user', 20))
    await pending.catch(() => undefined)
    const current = await h.state.read()
    expect(current.usage.rateLimits[0]?.windows[0]?.remainingPercent).toBe(1)
    expect(readResponse).toHaveBeenCalledTimes(2)
    await h.state.dispose()
  })

  it('awaits disposal while auth resolution is pending', async () => {
    const h = setup()
    const auth = deferred<{ access: string; accountId: string }>()
    readAuth.mockReturnValueOnce(auth.promise)
    const read = h.state.read(); let settled = false
    const disposed = h.state.dispose().then(() => { settled = true })
    await vi.advanceTimersByTimeAsync(1); expect(settled).toBe(false)
    auth.resolve({ access: token('acct', 'user'), accountId: 'acct' }); await disposed
    await expect(read).rejects.toThrow()
    expect(readResponse).not.toHaveBeenCalled()
  })

  it('awaits disposal while GET is pending and stops late polling', async () => {
    const h = setup()
    const get = deferred<Record<string, unknown>>()
    readResponse.mockReturnValueOnce(get.promise)
    const read = h.state.read(); await flush(); const disposed = h.state.dispose()
    get.resolve(response()); await disposed
    await expect(read).rejects.toThrow()
    expect(readResponse).toHaveBeenCalledTimes(1)
  })

  it('detaches one aborted caller without cancelling the shared survivor', async () => {
    const h = setup()
    const get = deferred<Record<string, unknown>>()
    readResponse.mockReturnValueOnce(get.promise)
    const controller = new AbortController()
    const cancelled = h.state.read(undefined, controller.signal); const survivor = h.state.read()
    controller.abort(); await expect(cancelled).rejects.toMatchObject({ name: 'AbortError' })
    get.resolve(response()); await expect(survivor).resolves.toMatchObject({ usage: expect.anything() })
    await h.state.dispose()
  })

  it('performs auth and usage inside the selected proxy scope', async () => {
    const h = setup(); let inScope = false
    h.proxyManager.run.mockImplementation((_proxy, operation) => { inScope = true; const result = operation(); inScope = false; return result })
    readAuth.mockImplementation(async () => { expect(inScope).toBe(true); return { access: token('acct', 'user'), accountId: 'acct' } })
    readResponse.mockImplementation(async () => { expect(inScope).toBe(true); return response() })
    h.setProxy('http://127.0.0.1:8080'); await h.state.read()
    expect(h.proxyManager.run).toHaveBeenCalledWith('http://127.0.0.1:8080', expect.any(Function))
    await h.state.dispose()
  })

  it('invalidates observations on proxy configuration changes', async () => {
    const h = setup()
    await h.state.read(); h.setProxy('http://127.0.0.1:8080'); await h.state.read()
    expect(readResponse).toHaveBeenCalledTimes(2)
    await h.state.dispose()
  })

  it('never creates a background poller or Reserve negotiation', async () => {
    const h = setup(); await h.state.read()
    await vi.advanceTimersByTimeAsync(120_000)
    expect(readResponse).toHaveBeenCalledTimes(1)
    expect(readResponse).toHaveBeenCalledWith(expect.anything(), expect.anything())
    await h.state.dispose()
  })

  it('evicts old identities beyond the bounded sixteen-entry cache', async () => {
    const h = setup()
    for (let index = 0; index < 17; index += 1) {
      h.setAccount(`acct-${index}`, `user-${index}`)
      readResponse.mockResolvedValueOnce(response(`acct-${index}`, `user-${index}`))
      await h.state.read()
    }
    const calls = readResponse.mock.calls.length
    h.setAccount('acct-0', 'user-0'); await h.state.read()
    expect(readResponse).toHaveBeenCalledTimes(calls + 1)
    await h.state.dispose()
  })

  it('does not expose raw upstream failure text through retry error', async () => {
    const h = setup()
    readResponse.mockRejectedValueOnce(new Error('Bearer secret and response body'))
    await expect(h.state.read()).rejects.toThrow('temporarily unavailable')
    await expect(h.state.read()).rejects.toThrow('temporarily unavailable')
    await h.state.dispose()
  })

  it('coalesces concurrent reads into one actual usage GET', async () => {
    const h = setup()
    const get = deferred<Record<string, unknown>>()
    readResponse.mockReturnValueOnce(get.promise)
    const first = h.state.read(); const second = h.state.read()
    await flush()
    expect(readResponse).toHaveBeenCalledTimes(1)
    get.resolve(response())
    await expect(Promise.all([first, second])).resolves.toHaveLength(2)
    await h.state.dispose()
  })

  it('revokes the returned authority signal when invalidated', async () => {
    const h = setup()
    const snapshot = await h.state.read()
    expect(snapshot.authoritySignal.aborted).toBe(false)
    h.state.invalidate()
    expect(snapshot.authoritySignal.aborted).toBe(true)
    await h.state.dispose()
  })

  it.each([false, true])('revokes old authority as foreground refresh starts (failure: %s)', async fail => {
    const h = setup()
    const refresh = deferred<Record<string, unknown>>()
    try {
      const previous = await h.state.read()
      await vi.advanceTimersByTimeAsync(60_000)
      expect(readResponse).toHaveBeenCalledTimes(1)
      readResponse.mockReturnValueOnce(refresh.promise)
      const pending = h.state.read()
      // Observe the rejection before resolving the shared request.
      const outcome = pending.then(value => ({ value }), error => ({ error }))
      await flush()
      expect(readResponse).toHaveBeenCalledTimes(2)
      expect(previous.authoritySignal.aborted).toBe(true)
      if (fail) {
        refresh.reject(new Error('fixture refresh failure'))
        expect(await outcome).toMatchObject({ error: expect.any(Error) })
      } else {
        refresh.resolve(response())
        const result = await pending
        expect(result.authoritySignal.aborted).toBe(false)
        expect((await h.state.read()).authoritySignal).toBe(result.authoritySignal)
      }
    } finally {
      refresh.resolve(response())
      await h.state.dispose()
    }
  })

  it('revokes only the foreground-refreshed identity and evicted observations', async () => {
    const h = setup()
    try {
      const first = await h.state.read()
      h.setAccount('second')
      const second = await h.state.read()
      await vi.advanceTimersByTimeAsync(60_000)
      expect(readResponse).toHaveBeenCalledTimes(2)
      h.setAccount('acct')
      const refreshed = await h.state.read()
      expect(first.authoritySignal.aborted).toBe(true)
      expect(second.authoritySignal.aborted).toBe(false)
      for (let index = 0; index < 14; index++) {
        h.setAccount(`eviction-${index}`)
        await h.state.read()
      }
      expect(second.authoritySignal.aborted).toBe(false)
      h.setAccount('eviction-14')
      await h.state.read()
      expect(refreshed.authoritySignal.aborted).toBe(true)
      expect(second.authoritySignal.aborted).toBe(false)
      h.setAccount('eviction-15')
      await h.state.read()
      expect(second.authoritySignal.aborted).toBe(true)
    } finally { await h.state.dispose() }
  })

  it('does not issue a late GET after disposal during pending auth', async () => {
    const h = setup()
    const auth = deferred<{ access: string; accountId: string }>()
    readAuth.mockReturnValueOnce(auth.promise)
    const read = h.state.read()
    await flush()
    const disposed = h.state.dispose()
    auth.resolve({ access: token('acct', 'user'), accountId: 'acct' })
    await disposed
    await expect(read).rejects.toThrow()
    expect(readResponse).not.toHaveBeenCalled()
  })

  it('coalesces and caches ordinary quota reads without negotiation', async () => {
    const h = setup();
    const get = deferred<Record<string, unknown>>()
    readResponse.mockReturnValueOnce(get.promise)
    const reads = Array.from({ length: 6 }, () => h.state.read())
    await flush(); expect(readResponse).toHaveBeenCalledTimes(1)
    get.resolve(response()); await Promise.all(reads)
    await h.state.read(); expect(readResponse).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(readResponse).toHaveBeenCalledTimes(1)
    await h.state.read(); expect(readResponse).toHaveBeenCalledTimes(2)
    expect(readResponse.mock.calls.every(call => call.length === 2)).toBe(true)
    await h.state.dispose()
  })

  it('backs off repeated failures exponentially even when foreground callers keep polling', async () => {
    const h = setup();
    readResponse.mockRejectedValue(new OpenAICodexUsageHttpError(503))
    await expect(h.state.read()).rejects.toThrow('503')
    for (const delay of [60_000, 120_000, 240_000, 480_000, 900_000, 900_000]) {
      const count = readResponse.mock.calls.length
      await vi.advanceTimersByTimeAsync(delay - 1)
      await expect(h.state.read()).rejects.toThrow('503')
      expect(readResponse).toHaveBeenCalledTimes(count)
      await vi.advanceTimersByTimeAsync(1)
      await expect(h.state.read()).rejects.toThrow('503')
      expect(readResponse).toHaveBeenCalledTimes(count + 1)
    }
    readResponse.mockResolvedValue(response())
    await vi.advanceTimersByTimeAsync(900_000); await h.state.read()
    await vi.advanceTimersByTimeAsync(60_000)
    readResponse.mockRejectedValue(new OpenAICodexUsageHttpError(503))
    await expect(h.state.read()).rejects.toThrow('503')
    const count = readResponse.mock.calls.length
    await vi.advanceTimersByTimeAsync(60_000)
    await expect(h.state.read()).rejects.toThrow('503')
    expect(readResponse).toHaveBeenCalledTimes(count + 1)
    await h.state.dispose()
  })

  it('adds nonnegative bounded jitter without shortening the base delay', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    const h = setup();
    readResponse.mockRejectedValue(new Error('offline failure'))
    await expect(h.state.read()).rejects.toThrow()
    await vi.advanceTimersByTimeAsync(62_999)
    await expect(h.state.read()).rejects.toThrow()
    expect(readResponse).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    await expect(h.state.read()).rejects.toThrow()
    expect(readResponse).toHaveBeenCalledTimes(2)
    await h.state.dispose()
  })

  it('honors Retry-After even when it exceeds the local backoff', async () => {
    const h = setup();
    readResponse.mockRejectedValue(new OpenAICodexUsageHttpError(429, 300_000))
    await expect(h.state.read()).rejects.toThrow('429')
    await vi.advanceTimersByTimeAsync(299_999)
    await expect(h.state.read()).rejects.toThrow('429')
    expect(readResponse).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    await expect(h.state.read()).rejects.toThrow('429')
    expect(readResponse).toHaveBeenCalledTimes(2)
    await h.state.dispose()
  })

  it.each([new OpenAICodexReauthRequiredError(), new OpenAICodexUsageHttpError(400)])('latches terminal errors until credentials or configuration change (%s)', async error => {
    const h = setup()
    readResponse.mockRejectedValue(error)
    await expect(h.state.read()).rejects.toThrow()
    await vi.advanceTimersByTimeAsync(86_400_000)
    await expect(h.state.read()).rejects.toThrow()
    expect(readResponse).toHaveBeenCalledTimes(1)
    readResponse.mockResolvedValue(response('acct', 'new-user'))
    h.setAccount('acct', 'new-user')
    await h.state.read(); expect(readResponse).toHaveBeenCalledTimes(2)
    h.state.invalidate(); await h.state.read()
    expect(readResponse).toHaveBeenCalledTimes(3)
    await h.state.dispose()
  })

})
