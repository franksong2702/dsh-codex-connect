import { describe, expect, it, vi } from 'vitest'
import { MockAgent } from 'undici'
import { CODEX_AUTO_REVIEW_MODEL, probeCodexAutoReview } from '../src/auto-review-probe.ts'
import type { AutoReviewProbeRequest } from '../src/auto-review-probe.ts'

const request: AutoReviewProbeRequest = { access: 'private-access', accountId: 'private-account', proxyUrl: undefined, timeoutMs: 1000 }
const response = (text: string, model = CODEX_AUTO_REVIEW_MODEL) => ({
  type: 'response.completed',
  response: {
    status: 'completed', model,
    output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] }],
  },
})
const sse = (event: unknown) => `data: ${JSON.stringify(event)}\n\n`

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
      expect(payload).toMatchObject({ model: CODEX_AUTO_REVIEW_MODEL, stream: true, store: false })
      expect(JSON.stringify(payload)).toContain('diagnostic-no-op')
      expect(JSON.stringify(payload)).not.toContain('private-')
      return true
    },
  }).reply(status, body, { headers })
  return agent
}

describe('hidden approval reviewer probe', () => {
  it('accepts one structured assessment and disposes its dispatcher', async () => {
    const agent = fixture(200, sse(response('{"outcome":"allow"}')))
    const destroy = vi.spyOn(agent, 'destroy')
    expect(await probeCodexAutoReview(request, () => agent)).toEqual({ outcome: 'completed', httpStatus: 200 })
    expect(destroy).toHaveBeenCalledOnce()
    agent.assertNoPendingInterceptors()
  })

  it.each([
    response('allow'),
    response('{"outcome":"maybe"}'),
    response('{"outcome":"allow","secret":"private-output"}'),
    response('{"outcome":"allow"}', 'gpt-5.6-sol'),
    { type: 'response.completed', response: { status: 'completed', model: CODEX_AUTO_REVIEW_MODEL, output: [] } },
  ])('keeps malformed or mismatched completion unknown %#', async terminal => {
    const agent = fixture(200, sse(terminal))
    expect(await probeCodexAutoReview(request, () => agent)).toEqual({ outcome: 'incomplete', httpStatus: 200 })
  })

  it.each([400, 401, 403, 404, 405, 422])('reports HTTP %i without retaining the error body', async status => {
    const agent = fixture(status, JSON.stringify({ error: 'private-access private-account' }))
    expect(await probeCodexAutoReview(request, () => agent)).toEqual({ outcome: 'http-rejected', httpStatus: status })
  })

  it('distinguishes caller cancellation from timeout', async () => {
    const cancelAgent = fixture(200, sse(response('{"outcome":"allow"}')))
    const cancel = new AbortController()
    cancel.abort()
    expect((await probeCodexAutoReview({ ...request, signal: cancel.signal }, () => cancelAgent)).outcome).toBe('cancelled')

    const timeoutAgent = new OfflineProbeAgent()
    timeoutAgent.disableNetConnect()
    timeoutAgent.get('https://chatgpt.com').intercept({ path: '/backend-api/codex/responses', method: 'POST' }).reply(200, sse(response('{"outcome":"allow"}'))).delay(100)
    expect((await probeCodexAutoReview({ ...request, timeoutMs: 5 }, () => timeoutAgent)).outcome).toBe('timeout')
  })
})
