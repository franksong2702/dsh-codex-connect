import { describe, expect, it, vi } from 'vitest'
import { Agent, MockAgent } from 'undici'
import { createServer } from 'node:http'
import type { Socket } from 'node:net'
import { probeCodexResponses } from '../src/capability-probe.ts'
import type { ResponsesProbeRequest } from '../src/capability-probe.ts'

const request: ResponsesProbeRequest = { model: 'gpt-5.6-sol', access: 'private-access', accountId: 'private-account', proxyUrl: undefined, timeoutMs: 1000 }
const terminal = {
  type: 'response.completed',
  response: {
    status: 'completed', model: request.model,
    output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'private-output' }] }],
  },
}
const sse = (event: unknown) => `data: ${JSON.stringify(event)}\n\n`

// MockAgent has no destroy implementation or sockets; close owns its interceptor pools.
class OfflineProbeAgent extends MockAgent {
  override destroy(): Promise<void> { return this.close() }
}

function fixture(status: number, body: string, headers = { 'content-type': 'text/event-stream' }) {
  const agent = new OfflineProbeAgent()
  agent.disableNetConnect()
  agent.get('https://chatgpt.com').intercept({
    path: '/backend-api/codex/responses', method: 'POST',
    body: raw => {
      const payload = JSON.parse(raw) as Record<string, unknown>
      expect(Object.keys(payload).sort()).toEqual(['input', 'instructions', 'model', 'store', 'stream'])
      expect(payload).toMatchObject({ model: request.model, stream: true, store: false })
      return true
    },
  }).reply(status, body, { headers })
  return agent
}

describe('standalone finite Responses probe', () => {
  it('requires complete matching output and disposes its dispatcher', async () => {
    const agent = fixture(200, sse(terminal))
    const destroy = vi.spyOn(agent, 'destroy')
    expect(await probeCodexResponses(request, () => agent)).toEqual({ outcome: 'completed', httpStatus: 200 })
    expect(destroy).toHaveBeenCalledOnce()
    agent.assertNoPendingInterceptors()
  })

  it('accepts CRLF frames and the provider response.done alias', async () => {
    const agent = fixture(200, sse({ ...terminal, type: 'response.done' }).replaceAll('\n', '\r\n'))
    expect((await probeCodexResponses(request, () => agent)).outcome).toBe('completed')
  })

  it.each([
    '',
    'data: {"type":"response.created"}\n\n',
    sse({ ...terminal, response: { ...terminal.response, model: 'different-model' } }),
    sse({ ...terminal, response: { ...terminal.response, output: [] } }),
    sse({ ...terminal, response: { ...terminal.response, status: 'incomplete' } }),
    sse({ type: 'schema', recognized: 'context_management' }),
    sse({ type: 'error', message: 'private-access response.completed' }),
    sse(terminal) + sse({ type: 'response.failed' }),
    sse(terminal) + sse(terminal),
    sse(terminal).trimEnd(),
    `data: ${'x'.repeat(65_536)}\n\n`,
  ])('does not promote incomplete/schema-only input %#', async body => {
    const agent = fixture(200, body)
    const result = await probeCodexResponses(request, () => agent)
    expect(result).toEqual({ outcome: 'incomplete', httpStatus: 200 })
    expect(JSON.stringify(result)).not.toContain('private-')
  })

  it.each([400, 401, 403, 404, 405, 422])('reports HTTP %i without reading sensitive errors', async status => {
    const agent = fixture(status, JSON.stringify({ error: 'private-access private-account context_management integer_below_min_value' }))
    expect(await probeCodexResponses(request, () => agent)).toEqual({ outcome: 'http-rejected', httpStatus: status })
  })

  it.each([302, 429, 500, 503])('keeps HTTP %i unknown without redirect or retry', async status => {
    const agent = fixture(status, 'private-error', { 'content-type': 'text/plain' })
    expect(await probeCodexResponses(request, () => agent)).toEqual({ outcome: 'transient', httpStatus: status })
  })

  it('does not accept JSON HTTP 200 as a completed SSE request', async () => {
    const agent = fixture(200, JSON.stringify(terminal), { 'content-type': 'application/json' })
    expect((await probeCodexResponses(request, () => agent)).outcome).toBe('incomplete')
  })

  it('bounds a slow response and destroys its connection owner', async () => {
    const agent = new OfflineProbeAgent()
    agent.disableNetConnect()
    agent.get('https://chatgpt.com').intercept({ path: '/backend-api/codex/responses', method: 'POST' }).reply(200, sse(terminal)).delay(100)
    const destroy = vi.spyOn(agent, 'destroy')
    expect((await probeCodexResponses({ ...request, timeoutMs: 5 }, () => agent)).outcome).toBe('timeout')
    expect(destroy).toHaveBeenCalledOnce()
  })

  it.each([true, false])('closes real keepalive sockets after finite EOF=%s', async finite => {
    const sockets = new Set<Socket>()
    const server = createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/event-stream', connection: 'keep-alive' })
      res.write(sse(terminal))
      if (finite) res.end()
    })
    server.on('connection', socket => {
      sockets.add(socket)
      socket.once('close', () => sockets.delete(socket))
    })
    const agent = new Agent()
    try {
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject)
        server.listen(0, '127.0.0.1', resolve)
      })
      const address = server.address()
      if (address === null || typeof address === 'string') throw new Error('expected loopback listener')
      const dispatch = agent.dispatch.bind(agent)
      vi.spyOn(agent, 'dispatch').mockImplementation((options, handler) => {
        expect(String(options.origin)).toBe('https://chatgpt.com')
        return dispatch({ ...options, origin: `http://127.0.0.1:${address.port}` }, handler)
      })
      const result = await probeCodexResponses({ ...request, timeoutMs: finite ? 1000 : 50 }, () => agent)
      expect(result).toEqual({ outcome: finite ? 'completed' : 'timeout', httpStatus: 200 })
      await vi.waitFor(() => expect(sockets.size).toBe(0))
    } finally {
      await agent.destroy()
      server.closeAllConnections()
      await new Promise<void>(resolve => server.close(() => resolve()))
    }
  })
})
