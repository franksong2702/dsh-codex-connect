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
const streamedAssessment = (text: string) => sse({ type: 'response.output_text.done', text })

class OfflineProbeAgent extends MockAgent {
  override destroy(): Promise<void> { return this.close() }
}

function fixture(status: number, body: string, headers: Record<string, string> = { 'content-type': 'text/event-stream' }) {
  const agent = new OfflineProbeAgent()
  agent.disableNetConnect()
  agent.get('https://chatgpt.com').intercept({
    path: '/backend-api/codex/responses', method: 'POST',
    body: raw => {
      const payload = JSON.parse(raw) as Record<string, unknown>
      expect(payload).toMatchObject({ model: CODEX_AUTO_REVIEW_MODEL, stream: true, store: false })
      expect(payload).toMatchObject({
        text: {
          format: {
            type: 'json_schema',
            name: 'codex_auto_review_assessment',
            strict: true,
            schema: {
              type: 'object',
              additionalProperties: false,
              required: ['risk_level', 'user_authorization', 'outcome', 'rationale'],
            },
          },
        },
      })
      expect(JSON.stringify(payload)).toContain('diagnostic-no-op')
      expect(JSON.stringify(payload)).not.toContain('private-')
      return true
    },
  }).reply(status, body, { headers })
  return agent
}

describe('hidden approval reviewer probe', () => {
  it('accepts one structured assessment and disposes its dispatcher', async () => {
    const agent = fixture(200, sse(response('{"risk_level":"low","user_authorization":"high","outcome":"allow","rationale":"Synthetic no-op."}')))
    const destroy = vi.spyOn(agent, 'destroy')
    expect(await probeCodexAutoReview(request, () => agent)).toEqual({ outcome: 'completed', httpStatus: 200 })
    expect(destroy).toHaveBeenCalledOnce()
    agent.assertNoPendingInterceptors()
  })

  it('accepts the live OAuth stream shape and resolved backing model', async () => {
    const terminal = { type: 'response.completed', response: { status: 'completed', model: 'gpt-5.6-luna', output: [] } }
    const agent = fixture(200, streamedAssessment('{"risk_level":"low","user_authorization":"high","outcome":"allow","rationale":"Synthetic no-op."}') + sse(terminal), {})
    expect(await probeCodexAutoReview(request, () => agent)).toEqual({ outcome: 'completed', httpStatus: 200 })
  })

  it.each([
    response('allow'),
    response('{"outcome":"allow"}'),
    response('{"risk_level":"low","user_authorization":"high","outcome":"allow"}'),
    response('{"outcome":"maybe"}'),
    response('{"outcome":"allow","secret":"private-output"}'),
    { type: 'response.completed', response: { status: 'completed', model: null, output: response('{"outcome":"allow"}').response.output } },
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
