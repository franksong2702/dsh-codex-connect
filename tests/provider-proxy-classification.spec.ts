import { afterEach, describe, expect, it, vi } from 'vitest'
import { OpenAICodexProxyManager } from '../src/provider-proxy.ts'

afterEach(() => vi.unstubAllGlobals())

describe('OpenAI Codex proxy probe error classification', () => {
  it('recognizes the native AbortSignal.timeout DOMException', async () => {
    const signal = AbortSignal.timeout(1)
    await new Promise<void>(resolve => setTimeout(resolve, 10))
    vi.stubGlobal('fetch', vi.fn(async () => { throw signal.reason }))
    const manager = new OpenAICodexProxyManager()
    try {
      await expect(manager.probe('http://127.0.0.1:7890')).resolves.toMatchObject({
        reachable: false, classification: 'timeout',
      })
    } finally {
      await manager.dispose()
    }
  })

  it('recognizes timeout and network codes through nested causes', async () => {
    const cases = [
      ['ETIMEDOUT', 'timeout'],
      ['UND_ERR_CONNECT_TIMEOUT', 'timeout'],
      ['ENOTFOUND', 'dns-failure'],
      ['EAI_AGAIN', 'dns-failure'],
      ['ECONNREFUSED', 'connection-refused'],
    ] as const
    for (const [code, classification] of cases) {
      vi.stubGlobal('fetch', vi.fn(async () => {
        throw new Error('outer', { cause: new Error('inner', { cause: Object.assign(new Error(code), { code }) }) })
      }))
      const manager = new OpenAICodexProxyManager()
      try {
        await expect(manager.probe('http://127.0.0.1:7890')).resolves.toMatchObject({
          reachable: false, classification,
        })
      } finally {
        await manager.dispose()
      }
    }
  })

  it('recognizes a nested native timeout name even without the numeric DOM code', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('outer', { cause: new Error('inner', { cause: { name: 'TimeoutError' } }) })
    }))
    const manager = new OpenAICodexProxyManager()
    try {
      await expect(manager.probe('http://127.0.0.1:7890')).resolves.toMatchObject({
        reachable: false, classification: 'timeout',
      })
    } finally {
      await manager.dispose()
    }
  })

  it('does not call caller cancellation an operation timeout', async () => {
    const cancellation = new DOMException('aborted', 'AbortError')
    vi.stubGlobal('fetch', vi.fn(async () => { throw cancellation }))
    const manager = new OpenAICodexProxyManager()
    try {
      await expect(manager.probe('http://127.0.0.1:7890')).resolves.toMatchObject({
        reachable: false, classification: 'connect-failure',
      })
    } finally {
      await manager.dispose()
    }
  })

  it('does not treat an unrelated numeric code 23 as a timeout', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw Object.assign(new Error('numeric code'), { code: 23 })
    }))
    const manager = new OpenAICodexProxyManager()
    try {
      await expect(manager.probe('http://127.0.0.1:7890')).resolves.toMatchObject({
        reachable: false, classification: 'connect-failure',
      })
    } finally {
      await manager.dispose()
    }
  })
})
