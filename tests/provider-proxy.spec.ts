import { createServer } from 'node:http'
import { connect } from 'node:net'
import { gzipSync } from 'node:zlib'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  Dispatcher,
  ProxyAgent,
  getGlobalDispatcher,
  setGlobalDispatcher,
} from 'undici'
import {
  DEFAULT_OPENAI_CODEX_PROXY_URL,
  OpenAICodexProxyManager,
} from '../src/index.ts'

class RecordingDispatcher extends Dispatcher {
  calls = 0

  dispatch(
    _options: Dispatcher.DispatchOptions,
    _handler: Dispatcher.DispatchHandler,
  ): boolean {
    this.calls += 1
    return true
  }
}

const originalDispatcher = getGlobalDispatcher()

afterEach(async () => {
  setGlobalDispatcher(originalDispatcher)
  vi.restoreAllMocks()
})

describe('OpenAI Codex proxy manager', () => {
  it('does not form a dispatch cycle when a third-party wrapper retains the prior dispatcher', async () => {
    const original = new RecordingDispatcher()
    setGlobalDispatcher(original)
    const manager = new OpenAICodexProxyManager()
    manager.run('http://127.0.0.1:9', () => undefined)
    const retained = getGlobalDispatcher()
    class ThirdParty extends Dispatcher {
      dispatch(options: Dispatcher.DispatchOptions, handler: Dispatcher.DispatchHandler): boolean {
        return retained.dispatch(options, handler)
      }
    }
    const replacement = new ThirdParty()
    setGlobalDispatcher(replacement)
    try {
      manager.run('http://127.0.0.1:9', () => undefined)
      getGlobalDispatcher().dispatch({ origin: 'http://fixture.invalid', path: '/', method: 'GET' }, {} as Dispatcher.DispatchHandler)
      expect(original.calls).toBe(1)
    } finally {
      await manager.dispose()
    }
    expect(getGlobalDispatcher()).toBe(replacement)
  })
  it('restores the latest third-party dispatcher after a second owner takes over', async () => {
    const first = new OpenAICodexProxyManager()
    const second = new OpenAICodexProxyManager()
    first.run('http://127.0.0.1:9', () => undefined)
    const replacement = new RecordingDispatcher()
    setGlobalDispatcher(replacement)
    second.run('http://127.0.0.1:9', () => undefined)
    await first.dispose()
    await second.dispose()
    expect(getGlobalDispatcher()).toBe(replacement)
  })
  it('restores a third-party Fetch replacement after the last owner disposes', async () => {
    const originalFetch = globalThis.fetch
    const first = new OpenAICodexProxyManager()
    const second = new OpenAICodexProxyManager()
    try {
      first.run('http://127.0.0.1:9', () => undefined)
      const retained = globalThis.fetch
      const replacement: typeof fetch = (input, init) => retained(input, init)
      globalThis.fetch = replacement
      second.run('http://127.0.0.1:9', () => undefined)
      expect(globalThis.fetch).not.toBe(replacement)
      await first.dispose()
      await second.dispose()
      expect(globalThis.fetch).toBe(replacement)
    } finally {
      await first.dispose()
      await second.dispose()
      globalThis.fetch = originalFetch
    }
  })
  it('scopes fetch through the proxy and leaves unrelated dispatch on the original dispatcher', async () => {
    const target = createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' })
      res.end('through-proxy')
    })
    const proxy = createServer()
    proxy.on('connect', (request, client, head) => {
      const [host, portText] = (request.url ?? '').split(':')
      const upstream = connect(Number(portText), host, () => {
        client.write('HTTP/1.1 200 Connection Established\r\n\r\n')
        if (head.length > 0) upstream.write(head)
        upstream.pipe(client)
        client.pipe(upstream)
      })
      upstream.on('error', () => { client.destroy() })
    })
    await new Promise<void>(resolve => { target.listen(0, '127.0.0.1', resolve) })
    await new Promise<void>(resolve => { proxy.listen(0, '127.0.0.1', resolve) })
    try {
      const targetAddress = target.address() as AddressInfo
      const proxyAddress = proxy.address() as AddressInfo
      const fallback = getGlobalDispatcher()
      const manager = new OpenAICodexProxyManager()
      const body = await manager.run(
        `http://127.0.0.1:${String(proxyAddress.port)}`,
        async () => (await fetch(`http://127.0.0.1:${String(targetAddress.port)}`)).text(),
      )
      expect(body).toBe('through-proxy')
      await manager.dispose()
      expect(getGlobalDispatcher()).toBe(fallback)
    } finally {
      await new Promise<void>(resolve => { proxy.close(() => resolve()) })
      await new Promise<void>(resolve => { target.close(() => resolve()) })
    }
  })

  it('decodes a compressed JSON response through the scoped proxy with Node fetch', async () => {
    const originalFetch = globalThis.fetch
    let connects = 0
    const target = createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json', 'content-encoding': 'gzip' })
      res.end(gzipSync(JSON.stringify({ authenticated: true })))
    })
    const proxy = createServer()
    proxy.on('connect', (request, client, head) => {
      connects += 1
      const [host, portText] = (request.url ?? '').split(':')
      const upstream = connect(Number(portText), host, () => {
        client.write('HTTP/1.1 200 Connection Established\r\n\r\n')
        if (head.length > 0) upstream.write(head)
        upstream.pipe(client)
        client.pipe(upstream)
      })
      upstream.on('error', () => { client.destroy() })
    })
    await new Promise<void>(resolve => { target.listen(0, '127.0.0.1', resolve) })
    await new Promise<void>(resolve => { proxy.listen(0, '127.0.0.1', resolve) })
    const manager = new OpenAICodexProxyManager()
    const proxyDispatch = vi.spyOn(ProxyAgent.prototype, 'dispatch')
    try {
      const targetAddress = target.address() as AddressInfo
      const proxyAddress = proxy.address() as AddressInfo
      const response = await manager.run(
        `http://127.0.0.1:${String(proxyAddress.port)}`,
        () => fetch(`http://127.0.0.1:${String(targetAddress.port)}`),
      )
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ authenticated: true })
      const requestResponse = await manager.run(
        `http://127.0.0.1:${String(proxyAddress.port)}`,
        () => fetch(new Request(`http://127.0.0.1:${String(targetAddress.port)}`)),
      )
      expect(await requestResponse.json()).toEqual({ authenticated: true })
      expect(connects).toBeGreaterThan(0)
      expect(proxyDispatch).toHaveBeenCalledTimes(2)
    } finally {
      await manager.dispose()
      const restored = globalThis.fetch === originalFetch
      await new Promise<void>(resolve => { proxy.close(() => resolve()) })
      await new Promise<void>(resolve => { target.close(() => resolve()) })
      expect(restored).toBe(true)
    }
  })

  it('restores the exact dispatcher only after the last independent owner disposes', async () => {
    const fallback = new RecordingDispatcher()
    setGlobalDispatcher(fallback)
    const dispatch = vi.spyOn(ProxyAgent.prototype, 'dispatch').mockReturnValue(true)
    const first = new OpenAICodexProxyManager()
    const second = new OpenAICodexProxyManager()

    first.run(DEFAULT_OPENAI_CODEX_PROXY_URL, () => {
      getGlobalDispatcher().dispatch({ origin: 'https://chatgpt.com', path: '/', method: 'GET' }, {} as Dispatcher.DispatchHandler)
    })
    expect(dispatch).toHaveBeenCalledOnce()
    expect(getGlobalDispatcher()).not.toBe(fallback)

    getGlobalDispatcher().dispatch({ origin: 'https://unrelated.example', path: '/', method: 'GET' }, {} as Dispatcher.DispatchHandler)
    expect(fallback.calls).toBe(1)

    second.run('http://127.0.0.1:7897', () => {
      getGlobalDispatcher().dispatch({ origin: 'https://chatgpt.com', path: '/', method: 'GET' }, {} as Dispatcher.DispatchHandler)
    })
    await first.dispose()
    expect(getGlobalDispatcher()).not.toBe(fallback)
    expect(dispatch).toHaveBeenCalledTimes(2)
    await second.dispose()
    expect(getGlobalDispatcher()).toBe(fallback)
  })

  it('waits for an in-flight operation before closing agents and restoring process state', async () => {
    const fallback = new RecordingDispatcher()
    setGlobalDispatcher(fallback)
    const manager = new OpenAICodexProxyManager()
    let release!: () => void
    const pending = new Promise<void>(resolve => { release = resolve })
    const operation = manager.run(DEFAULT_OPENAI_CODEX_PROXY_URL, async () => pending)
    const disposing = manager.dispose()
    let completed = false
    void disposing.then(() => { completed = true })
    await Promise.resolve()
    expect(completed).toBe(false)
    release()
    await operation
    await disposing
    expect(completed).toBe(true)
    expect(getGlobalDispatcher()).toBe(fallback)
  })

  it('deactivates and reconfigures one controller without intercepting unrelated traffic', async () => {
    const fallback = new RecordingDispatcher()
    setGlobalDispatcher(fallback)
    const dispatch = vi.spyOn(ProxyAgent.prototype, 'dispatch').mockReturnValue(true)
    const close = vi.spyOn(ProxyAgent.prototype, 'destroy').mockResolvedValue()
    const manager = new OpenAICodexProxyManager()

    manager.run(DEFAULT_OPENAI_CODEX_PROXY_URL, () => {
      getGlobalDispatcher().dispatch({ origin: 'https://chatgpt.com', path: '/', method: 'GET' }, {} as Dispatcher.DispatchHandler)
    })
    getGlobalDispatcher().dispatch({ origin: 'https://unrelated.example', path: '/', method: 'GET' }, {} as Dispatcher.DispatchHandler)
    expect(dispatch).toHaveBeenCalledOnce()
    expect(fallback.calls).toBe(1)

    await manager.deactivate()
    expect(close).toHaveBeenCalledOnce()
    expect(getGlobalDispatcher()).toBe(fallback)

    manager.run('http://127.0.0.1:7897', () => {
      getGlobalDispatcher().dispatch({ origin: 'https://chatgpt.com', path: '/', method: 'GET' }, {} as Dispatcher.DispatchHandler)
    })
    getGlobalDispatcher().dispatch({ origin: 'https://unrelated.example', path: '/', method: 'GET' }, {} as Dispatcher.DispatchHandler)
    expect(dispatch).toHaveBeenCalledTimes(2)
    expect(fallback.calls).toBe(2)

    await manager.dispose()
    expect(close).toHaveBeenCalledTimes(2)
    expect(getGlobalDispatcher()).toBe(fallback)
  })
})
