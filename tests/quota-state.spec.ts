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
  let enabled = true
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
    enabled: () => enabled,
  })
  return {
    state, captured, proxyManager,
    setAccount(value: string, nextUser = 'user') { account = value; user = nextUser },
    setEnabled(value: boolean) { enabled = value },
    setProxy(value: string | undefined) { proxy = value },
  }
}

describe('OpenAICodexQuotaState acceptance', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(0); vi.resetAllMocks(); vi.spyOn(Math, 'random').mockReturnValue(0) })
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

  it('keeps sequential cache reads from postponing the t=60 refresh', async () => {
    const { state } = setup()
    await state.read()
    await vi.advanceTimersByTimeAsync(10_000); await state.read()
    await vi.advanceTimersByTimeAsync(10_000); await state.read()
    expect(readResponse).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(39_999)
    expect(readResponse).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    await flush(); expect(readResponse).toHaveBeenCalledTimes(2)
    await state.dispose()
  })

  it('routes usage GETs through the shared governor when one is installed', async () => {
    const requests = new OpenAICodexBackendRequests()
    const run = vi.spyOn(requests, 'run')
    const h = setup(requests)
    try {
      await h.state.read()
      expect(run).toHaveBeenCalledWith(expect.objectContaining({ lane: 'quota' }), expect.any(Function))
      expect(readResponse.mock.calls[0]?.[3]).toEqual(expect.any(Function))
    } finally {
      await h.state.dispose()
      requests.dispose()
    }
  })

  it.each([[75, 30_000], [90, 15_000], [99, 5_000]])('refreshes at the %s%% cadence boundary', async (used, delay) => {
    const { state } = setup()
    readResponse.mockResolvedValueOnce(response('acct', 'user', used))
    await state.read()
    await vi.advanceTimersByTimeAsync(delay - 1)
    expect(readResponse).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    await flush(); expect(readResponse).toHaveBeenCalledTimes(2)
    await state.dispose()
  })

  it('uses a future reset only to shorten refresh and never grants Reserve authority', async () => {
    const { state } = setup()
    const reset = Math.floor(Date.now() / 1000) + 10
    readResponse.mockResolvedValueOnce(response('acct', 'user', 20, reset))
    const first = await state.read()
    expect(first.decision.kind).not.toBe('reserve')
    await vi.advanceTimersByTimeAsync(10_999)
    expect(readResponse).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    await flush(); expect(readResponse).toHaveBeenCalledTimes(2)
    await state.dispose()
  })

  it('backs off failed refreshes and does not query on every timer step', async () => {
    const { state } = setup()
    await state.read()
    readResponse.mockRejectedValueOnce(new Error('private upstream detail'))
    await vi.advanceTimersByTimeAsync(60_000)
    await flush(); expect(readResponse).toHaveBeenCalledTimes(2)
    await expect(state.read()).rejects.toThrow('temporarily unavailable')
    expect(readResponse).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(59_999)
    expect(readResponse).toHaveBeenCalledTimes(2)
    readResponse.mockResolvedValueOnce(response())
    await vi.advanceTimersByTimeAsync(1)
    await flush(); expect(readResponse).toHaveBeenCalledTimes(3)
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
    expect(aResult.identity?.accountId).toBe('acct')
    expect(bResult.identity?.accountId).toBe('acct-b')
    h.setAccount('acct')
    await expect(h.state.read()).resolves.toMatchObject({ identity: { accountId: 'acct' } })
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
    get.resolve(response()); await expect(survivor).resolves.toMatchObject({ decision: { kind: 'ordinary' } })
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

  it('invalidates on enabled/proxy configuration changes', async () => {
    const h = setup()
    await h.state.read(); h.setProxy('http://127.0.0.1:8080'); await h.state.read()
    h.setEnabled(false); await h.state.read()
    expect(readResponse).toHaveBeenCalledTimes(3)
    expect(readResponse.mock.calls.at(-1)?.[2]).toBe(false)
    await h.state.dispose()
  })

  it('does not create a background poller or Reserve header while disabled', async () => {
    const h = setup(); h.setEnabled(false); await h.state.read()
    await vi.advanceTimersByTimeAsync(120_000)
    expect(readResponse).toHaveBeenCalledTimes(1)
    expect(readResponse).toHaveBeenCalledWith(expect.anything(), expect.anything(), false)
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

  it('recomputes cadence when a high-model route joins a UI GET already in flight', async () => {
    const h = setup()
    const get = deferred<Record<string, unknown>>()
    readResponse.mockReturnValueOnce(get.promise)
    const ui = h.state.read()
    await flush()
    const route = h.state.read(undefined, undefined, 'gpt-5.6-luna')
    await flush()
    expect(readResponse).toHaveBeenCalledTimes(1)
    get.resolve({
      ...response('acct', 'user', 20),
      additional_rate_limits: [{
        metered_feature: 'model-meter', limit_name: 'gpt-5.6-luna',
        rate_limit: {
          primary_window: { used_percent: 99, limit_window_seconds: 100, reset_at: null },
          secondary_window: { used_percent: 90, limit_window_seconds: 200, reset_at: null },
        },
      }],
    })
    await Promise.all([ui, route])
    await vi.advanceTimersByTimeAsync(4_999)
    expect(readResponse).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1); await flush()
    expect(readResponse).toHaveBeenCalledTimes(2)
    await h.state.dispose()
  })

  it('uses the requested model named bucket and both windows for cadence', async () => {
    const h = setup()
    readResponse.mockResolvedValueOnce({
      ...response('acct', 'user', 20),
      additional_rate_limits: [{
        metered_feature: 'model-meter', limit_name: 'gpt-5.6-luna',
        rate_limit: {
          primary_window: { used_percent: 75, limit_window_seconds: 100, reset_at: null },
          secondary_window: { used_percent: 90, limit_window_seconds: 200, reset_at: null },
        },
      }],
    })
    await h.state.read(undefined, undefined, 'gpt-5.6-luna')
    await vi.advanceTimersByTimeAsync(14_999)
    expect(readResponse).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1); await flush()
    expect(readResponse).toHaveBeenCalledTimes(2)
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

  it.each([false, true])('revokes previous authority when background refresh starts (failure: %s)', async fail => {
    const h = setup()
    try {
      const previous = await h.state.read()
      if (fail) readResponse.mockRejectedValueOnce(new Error('fixture refresh failure'))
      await vi.advanceTimersByTimeAsync(60_000)
      await flush()
      expect(readResponse).toHaveBeenCalledTimes(2)
      expect(previous.authoritySignal.aborted).toBe(true)
      if (!fail) expect((await h.state.read()).authoritySignal.aborted).toBe(false)
    } finally { await h.state.dispose() }
  })

  it('revokes only the refreshed identity and revokes evicted cache entries', async () => {
    const h = setup()
    try {
      const first = await h.state.read()
      h.setAccount('second')
      const second = await h.state.read()
      vi.setSystemTime(60_000)
      h.setAccount('acct')
      await h.state.read()
      expect(first.authoritySignal.aborted).toBe(true)
      expect(second.authoritySignal.aborted).toBe(false)
      for (let index = 0; index < 16; index++) {
        h.setAccount(`eviction-${index}`)
        await h.state.read()
      }
      expect(second.authoritySignal.aborted).toBe(true)
    } finally { await h.state.dispose() }
  })

  it('disables Reserve negotiation when token identity claims are incomplete', async () => {
    const h = setup()
    readAuth.mockResolvedValueOnce({ access: 'opaque-token-without-jwt-claims', accountId: 'acct' })
    await h.state.read()
    expect(readResponse).toHaveBeenCalledWith(expect.anything(), expect.anything(), false)
    await h.state.dispose()
  })

  it('coalesces and caches ordinary quota reads with Reserve disabled', async () => {
    const h = setup(); h.setEnabled(false)
    const get = deferred<Record<string, unknown>>()
    readResponse.mockReturnValueOnce(get.promise)
    const reads = Array.from({ length: 6 }, () => h.state.read())
    await flush(); expect(readResponse).toHaveBeenCalledTimes(1)
    get.resolve(response()); await Promise.all(reads)
    await h.state.read(); expect(readResponse).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(readResponse).toHaveBeenCalledTimes(1)
    await h.state.read(); expect(readResponse).toHaveBeenCalledTimes(2)
    expect(readResponse.mock.calls.every(call => call[2] === false)).toBe(true)
    await h.state.dispose()
  })

  it.each([false, true])('stops autonomous refresh after demand expires (Reserve %s)', async enabled => {
    const h = setup(); h.setEnabled(enabled)
    readResponse.mockImplementation(async () => response('acct', 'user', 99))
    await h.state.read()
    await vi.advanceTimersByTimeAsync(120_000)
    const calls = readResponse.mock.calls.length
    await vi.advanceTimersByTimeAsync(3_600_000)
    expect(readResponse).toHaveBeenCalledTimes(calls)
    await h.state.read(); expect(readResponse).toHaveBeenCalledTimes(calls + 1)
    await h.state.dispose()
  })

  it('revokes late snapshots at expiry without restarting an idle poller', async () => {
    const h = setup()
    const get = deferred<Record<string, unknown>>()
    readResponse.mockReturnValueOnce(get.promise)
    const pending = h.state.read(); await flush()
    await vi.advanceTimersByTimeAsync(120_000)
    get.resolve(response())
    const snapshot = await pending
    expect(snapshot.authoritySignal.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(snapshot.authoritySignal.aborted).toBe(true)
    expect(readResponse).toHaveBeenCalledTimes(1)
    await h.state.dispose()
  })

  it('expires all idle account snapshots at their own deadlines without another GET', async () => {
    const h = setup()
    const first = deferred<Record<string, unknown>>()
    const second = deferred<Record<string, unknown>>()
    readResponse.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const a = h.state.read(); await flush()
    h.setAccount('other-account')
    const b = h.state.read(); await flush()
    await vi.advanceTimersByTimeAsync(120_000)
    first.resolve(response('acct', 'user', 99))
    second.resolve(response('other-account', 'user', 20))
    const [aResult, bResult] = await Promise.all([a, b])
    await vi.advanceTimersByTimeAsync(5_000)
    expect(aResult.authoritySignal.aborted).toBe(true)
    expect(bResult.authoritySignal.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(55_000)
    expect(bResult.authoritySignal.aborted).toBe(true)
    expect(readResponse).toHaveBeenCalledTimes(2)
    await h.state.dispose()
  })

  it('does not let an old expiry timer abort a foreground refresh already in flight', async () => {
    const h = setup()
    const get = deferred<Record<string, unknown>>()
    let fresh: ReturnType<typeof h.state.read> | undefined
    let refreshSignal: AbortSignal | undefined
    // Queue the foreground consumer before the cache installs its same-deadline timer.
    setTimeout(() => {
      fresh = h.state.read()
      void fresh.catch(() => undefined)
    }, 60_000)
    try {
      const previous = await h.state.read()
      readResponse.mockImplementationOnce((_auth: unknown, signal: AbortSignal) => {
        refreshSignal = signal
        signal.addEventListener('abort', () => get.reject(new DOMException('Refresh cancelled', 'AbortError')), { once: true })
        return get.promise
      })
      await vi.advanceTimersByTimeAsync(60_000)
      expect(readResponse).toHaveBeenCalledTimes(2)
      expect(previous.authoritySignal.aborted).toBe(true)
      expect(refreshSignal).toBeDefined()
      expect(refreshSignal?.aborted).toBe(false)
      get.resolve(response('acct', 'user', 25))
      await expect(fresh).resolves.toMatchObject({ usage: { rateLimits: [{ windows: [{ remainingPercent: 75 }] }] } })
      expect((await h.state.read()).authoritySignal.aborted).toBe(false)
      expect(readResponse).toHaveBeenCalledTimes(2)
    } finally {
      get.resolve(response())
      await fresh?.catch(() => undefined)
      await h.state.dispose()
    }
  })

  it('backs off repeated failures exponentially even when foreground callers keep polling', async () => {
    const h = setup(); h.setEnabled(false)
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
    const h = setup(); h.setEnabled(false)
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
    const h = setup(); h.setEnabled(false)
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
