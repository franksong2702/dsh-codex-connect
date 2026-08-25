import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { connect } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import {
  closeOpenAICodexProxyAgents,
  withOpenAICodexProxy,
} from '../src/provider-proxy.ts'

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

afterEach(async () => {
  await closeOpenAICodexProxyAgents()
})

describe('OpenAI Codex request-scoped provider proxy', () => {
  it('uses CONNECT only inside the selected async scope', async () => {
    const target = createServer((_req, res) => {
      res.setHeader('connection', 'close')
      res.end('target')
    })
    const targetPort = await listen(target)
    let connects = 0
    const proxy = createServer()
    proxy.on('connect', (request, client, head) => {
      connects += 1
      const targetUrl = new URL(`http://${request.url ?? ''}`)
      const upstream = connect(Number(targetUrl.port), targetUrl.hostname, () => {
        client.write('HTTP/1.1 200 Connection Established\r\n\r\n')
        if (head.byteLength > 0) upstream.write(head)
        upstream.pipe(client)
        client.pipe(upstream)
      })
    })
    const proxyPort = await listen(proxy)
    try {
      await expect(fetch(`http://127.0.0.1:${String(targetPort)}`).then(response => response.text())).resolves.toBe('target')
      expect(connects).toBe(0)
      await expect(withOpenAICodexProxy(
        `http://127.0.0.1:${String(proxyPort)}`,
        () => fetch(`http://127.0.0.1:${String(targetPort)}`).then(response => response.text()),
      )).resolves.toBe('target')
      expect(connects).toBe(1)
    } finally {
      await closeOpenAICodexProxyAgents()
      await close(proxy)
      await close(target)
    }
  })
})
