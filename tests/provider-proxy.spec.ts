import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { connect } from 'node:net'
import { describe, expect, it } from 'vitest'
import { getGlobalDispatcher } from 'undici'
import { OpenAICodexProxyController } from '../src/provider-proxy.ts'

async function listen(server: ReturnType<typeof createServer>): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  return (server.address() as AddressInfo).port
}

async function close(server: ReturnType<typeof createServer>): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close(error => {
      if (error === undefined) resolve()
      else reject(error)
    })
  })
}

async function proxyServer(): Promise<{
  server: ReturnType<typeof createServer>
  url: string
  connects: () => number
}> {
  let count = 0
  const server = createServer()
  server.on('connect', (request, client, head) => {
    count += 1
    const targetUrl = new URL(`http://${request.url ?? ''}`)
    const upstream = connect(Number(targetUrl.port), targetUrl.hostname, () => {
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n')
      if (head.byteLength > 0) upstream.write(head)
      upstream.pipe(client)
      client.pipe(upstream)
    })
  })
  const port = await listen(server)
  return { server, url: `http://127.0.0.1:${String(port)}`, connects: () => count }
}

describe('OpenAI Codex instance-scoped provider proxy', () => {
  it('registers only during Codex operations, isolates instances, and restores after each request', async () => {
    const fallback = getGlobalDispatcher()
    const target = createServer((_req, res) => {
      res.setHeader('connection', 'close')
      res.end('target')
    })
    const targetPort = await listen(target)
    const aProxy = await proxyServer()
    const bProxy = await proxyServer()
    const a = new OpenAICodexProxyController()
    const b = new OpenAICodexProxyController()
    const load = () => fetch(`http://127.0.0.1:${String(targetPort)}`).then(response => response.text())
    try {
      a.configure(aProxy.url)
      b.configure(bProxy.url)
      // An enabled proxy alone does not modify the process dispatcher. This
      // is the state after a session switches to another adapter.
      expect(getGlobalDispatcher()).toBe(fallback)
      expect(a.run(() => 42)).toBe(42)
      expect(getGlobalDispatcher()).toBe(fallback)

      let releaseA = (): void => undefined
      let releaseB = (): void => undefined
      const pendingA = a.run(() => new Promise<void>(resolve => { releaseA = resolve }))
      const pendingB = b.run(() => new Promise<void>(resolve => { releaseB = resolve }))
      expect(getGlobalDispatcher()).not.toBe(fallback)
      releaseA()
      await pendingA
      expect(getGlobalDispatcher()).not.toBe(fallback)
      releaseB()
      await pendingB
      expect(getGlobalDispatcher()).toBe(fallback)

      await expect(a.run(load)).resolves.toBe('target')
      expect(getGlobalDispatcher()).toBe(fallback)
      await expect(b.run(load)).resolves.toBe('target')
      expect(getGlobalDispatcher()).toBe(fallback)
      expect(aProxy.connects()).toBe(1)
      expect(bProxy.connects()).toBe(1)

      a.configure(undefined)
      await expect(a.run(load)).resolves.toBe('target')
      expect(aProxy.connects()).toBe(1)
      await expect(b.run(load)).resolves.toBe('target')
      expect(bProxy.connects()).toBe(2)
      expect(getGlobalDispatcher()).toBe(fallback)

      await a.dispose()
      expect(getGlobalDispatcher()).toBe(fallback)
      await b.dispose()
      expect(getGlobalDispatcher()).toBe(fallback)
    } finally {
      await Promise.allSettled([a.dispose(), b.dispose()])
      await close(aProxy.server)
      await close(bProxy.server)
      await close(target)
    }
  })
})
