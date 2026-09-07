import { describe, expect, it, vi } from 'vitest'
import {
  collectBoundedBytes,
  fetchPublicHttpResource,
  isPublicNetworkAddress,
  PUBLIC_HTTP_HOP_TIMEOUT_MS,
} from '../src/public-http.ts'
import type {
  PublicHttpHop,
  PublicHttpRuntime,
  ResolvedNetworkAddress,
} from '../src/public-http.ts'

const PNG_1X1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC', 'base64')
const signal = new AbortController().signal

function runtimeOf(options: {
  resolve(hostname: string): readonly ResolvedNetworkAddress[]
  get(url: URL): PublicHttpHop
}): PublicHttpRuntime & { resolve: ReturnType<typeof vi.fn>; get: ReturnType<typeof vi.fn> } {
  return {
    resolve: vi.fn(async (hostname: string) => options.resolve(hostname)),
    get: vi.fn(async (url: URL) => options.get(url)),
  }
}

describe('public HTTP boundary', () => {
  it('classifies public unicast separately from local, metadata, and special ranges', () => {
    expect(isPublicNetworkAddress('93.184.216.34')).toBe(true)
    expect(isPublicNetworkAddress('2606:4700:4700::1111')).toBe(true)
    for (const address of [
      '0.0.0.0',
      '10.0.0.1',
      '100.64.0.1',
      '127.0.0.1',
      '169.254.169.254',
      '172.16.0.1',
      '192.168.0.1',
      '::',
      '::1',
      '::ffff:127.0.0.1',
      'fc00::1',
      'fe80::1',
      'ff02::1',
      '2001:db8::1',
    ]) expect(isPublicNetworkAddress(address), address).toBe(false)
  })

  it('rejects a private DNS answer before opening a socket', async () => {
    const runtime = runtimeOf({
      resolve: () => [{ address: '10.0.0.7', family: 4 }],
      get: () => ({ status: 200, data: PNG_1X1 }),
    })

    await expect(fetchPublicHttpResource('https://images.example/pixel.png', 1024, signal, runtime))
      .rejects.toThrow(/public network address/u)
    expect(runtime.get).not.toHaveBeenCalled()
  })

  it('rejects a mixed public/private DNS answer instead of choosing the public one', async () => {
    const runtime = runtimeOf({
      resolve: () => [
        { address: '93.184.216.34', family: 4 },
        { address: '192.168.1.9', family: 4 },
      ],
      get: () => ({ status: 200, data: PNG_1X1 }),
    })

    await expect(fetchPublicHttpResource('https://images.example/pixel.png', 1024, signal, runtime))
      .rejects.toThrow(/public network address/u)
    expect(runtime.get).not.toHaveBeenCalled()
  })

  it('rechecks every redirect and refuses a cloud-metadata destination', async () => {
    const runtime = runtimeOf({
      resolve: hostname => hostname === 'images.example'
        ? [{ address: '93.184.216.34', family: 4 }]
        : [{ address: '169.254.169.254', family: 4 }],
      get: () => ({ status: 302, location: 'http://169.254.169.254/latest/meta-data/' }),
    })

    await expect(fetchPublicHttpResource('https://images.example/pixel.png', 1024, signal, runtime))
      .rejects.toThrow(/public network address/u)
    expect(runtime.get).toHaveBeenCalledOnce()
  })

  it('preserves public redirects and pins the checked address into each request', async () => {
    const runtime = runtimeOf({
      resolve: hostname => hostname === 'images.example'
        ? [{ address: '93.184.216.34', family: 4 }]
        : [{ address: '2606:4700:4700::1111', family: 6 }],
      get: url => url.hostname === 'images.example'
        ? { status: 302, location: 'https://cdn.example/pixel.png' }
        : { status: 200, data: PNG_1X1 },
    })

    const result = await fetchPublicHttpResource('https://images.example/start', 1024, signal, runtime)

    expect(result).toMatchObject({ display: 'https://cdn.example/pixel.png', name: 'pixel.png' })
    expect(result.data).toEqual(PNG_1X1)
    expect(runtime.get.mock.calls[0]?.[1]).toEqual({ address: '93.184.216.34', family: 4 })
    expect(runtime.get.mock.calls[1]?.[1]).toEqual({ address: '2606:4700:4700::1111', family: 6 })
  })

  it('enforces both declared and streamed response limits', async () => {
    async function* bytes(...chunks: Uint8Array[]) {
      yield* chunks
    }

    await expect(collectBoundedBytes(bytes(new Uint8Array([1])), '2048', 1024, signal))
      .rejects.toThrow(/exceeds 1024 bytes/u)
    await expect(collectBoundedBytes(
      bytes(new Uint8Array(700), new Uint8Array(400)),
      undefined,
      1024,
      signal,
    )).rejects.toThrow(/exceeds 1024 bytes/u)
    await expect(collectBoundedBytes(bytes(new Uint8Array([1, 2])), '2', 1024, signal))
      .resolves.toEqual(new Uint8Array([1, 2]))
  })

  it('bounds DNS resolution and does not start HTTP after a late resolution', async () => {
    vi.useFakeTimers()
    try {
      let release!: (addresses: readonly ResolvedNetworkAddress[]) => void
      const runtime: PublicHttpRuntime & { resolve: ReturnType<typeof vi.fn>; get: ReturnType<typeof vi.fn> } = {
        resolve: vi.fn(() => new Promise<readonly ResolvedNetworkAddress[]>(resolve => { release = resolve })),
        get: vi.fn(async () => ({ status: 200, data: PNG_1X1 })),
      }

      const pending = fetchPublicHttpResource('https://images.example/pixel.png', 1024, signal, runtime)
      const rejection = expect(pending).rejects.toThrow(/exceeded 30000ms/u)
      await vi.advanceTimersByTimeAsync(PUBLIC_HTTP_HOP_TIMEOUT_MS)
      release([{ address: '93.184.216.34', family: 4 }])

      await rejection
      await Promise.resolve()
      expect(runtime.get).not.toHaveBeenCalled()
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('rejects promptly on cancellation and ignores a late DNS resolution', async () => {
    vi.useFakeTimers()
    let release!: (addresses: readonly ResolvedNetworkAddress[]) => void
    const runtime: PublicHttpRuntime & { resolve: ReturnType<typeof vi.fn>; get: ReturnType<typeof vi.fn> } = {
      resolve: vi.fn(() => new Promise<readonly ResolvedNetworkAddress[]>(resolve => { release = resolve })),
      get: vi.fn(async () => ({ status: 200, data: PNG_1X1 })),
    }
    const controller = new AbortController()
    const pending = fetchPublicHttpResource('https://images.example/pixel.png', 1024, controller.signal, runtime)
    const rejection = expect(pending).rejects.toThrow(/cancelled/u)

    controller.abort('cancelled')
    await rejection
    release([{ address: '93.184.216.34', family: 4 }])
    await Promise.resolve()
    expect(runtime.get).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
    vi.useRealTimers()
  })

  it('shares one deadline between DNS and the following HTTP request', async () => {
    vi.useFakeTimers()
    try {
      let releaseResolve!: (addresses: readonly ResolvedNetworkAddress[]) => void
      let observedSignal!: AbortSignal
      const runtime: PublicHttpRuntime & { resolve: ReturnType<typeof vi.fn>; get: ReturnType<typeof vi.fn> } = {
        resolve: vi.fn(() => new Promise<readonly ResolvedNetworkAddress[]>(resolve => { releaseResolve = resolve })),
        get: vi.fn(async (_url, _address, _maxBytes, hopSignal) => {
          observedSignal = hopSignal
          return new Promise<PublicHttpHop>(() => {})
        }),
      }
      const pending = fetchPublicHttpResource('https://images.example/pixel.png', 1024, signal, runtime)
      const rejection = expect(pending).rejects.toThrow(/exceeded 30000ms/u)

      await vi.advanceTimersByTimeAsync(20_000)
      releaseResolve([{ address: '93.184.216.34', family: 4 }])
      await vi.advanceTimersByTimeAsync(0)
      expect(runtime.get).toHaveBeenCalledOnce()
      expect(observedSignal.aborted).toBe(false)

      await vi.advanceTimersByTimeAsync(10_000)
      await rejection
      expect(observedSignal.aborted).toBe(true)
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })
})
