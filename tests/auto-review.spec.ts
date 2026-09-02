import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { ToolCallId } from '@deepseek-ai/dsh-llm'
import type { ApprovalRequestEvent } from '@deepseek-ai/dsh-user-approval/types'
import CommandRuntime from '@deepseek-ai/dsh-commands'
import type { AutoReviewBackend, AutoReviewBackendResult } from '../src/auto-review-backend.ts'
import { OpenAICodexAutoReviewAnswerer, registerOpenAICodexAutoReview } from '../src/auto-review.ts'
import { AutoReviewState, resolveAutoReviewAction } from '../src/auto-review-contract.ts'
import { OpenAICodexCredentialStore } from '../src/store.ts'
import { OpenAICodexProxyManager } from '../src/provider-proxy.ts'

function fixture(): {
  agent: Agent
  request: (callId: string, turn: number, args?: string) => ApprovalRequestEvent
  injected: unknown[]
  cancel: ReturnType<typeof vi.fn>
  followups: unknown[]
} {
  const events: unknown[] = []
  const injected: unknown[] = []
  const cancel = vi.fn()
  const followups: unknown[] = []
  const agent = {
    id: 'agent-1',
    session: {
      snapshotEvents: () => events,
      header: { version: 0, id: 'agent-1', createdAt: 0, cwd: '/workspace' },
      deriveMessages: () => [],
      requestHeader: () => ({ config: { provider: 'openai-codex', model: 'gpt-5.6-sol' }, tools: [] }),
    },
    inject: (message: unknown) => { injected.push(message) },
    cancel,
    followup: (message: unknown) => { followups.push(message) },
  } as unknown as Agent
  return {
    agent,
    injected,
    cancel,
    followups,
    request(callId, turn, args = '{"command":"pwd"}') {
      events.push({ seq: events.length, time: events.length, type: 'tool/call', data: { turn, step: 0, callId, name: 'shell', arguments: args } })
      return { agent, callId: callId as ToolCallId, toolName: 'shell' }
    },
  }
}

function backend(...results: AutoReviewBackendResult[]): AutoReviewBackend {
  return { review: vi.fn(async (): Promise<AutoReviewBackendResult> => results.shift() ?? { status: 'unavailable' }) }
}

const allow: AutoReviewBackendResult = {
  status: 'completed',
  assessment: { risk_level: 'low', user_authorization: 'unknown', outcome: 'allow', rationale: 'Routine action.' },
}
const deny: AutoReviewBackendResult = {
  status: 'completed',
  assessment: { risk_level: 'high', user_authorization: 'unknown', outcome: 'deny', rationale: 'No trusted authorization.' },
}

describe('Auto-review approval answerer', () => {
  it('allows only a completed allow and delegates unavailable review', async () => {
    const first = fixture()
    const answerer = new OpenAICodexAutoReviewAnswerer(backend(allow))
    await expect(answerer.answer(first.request('call-1', 1), async () => 'unavailable')).resolves.toBe('allowed-once')
    const second = fixture()
    await expect(new OpenAICodexAutoReviewAnswerer(backend({ status: 'unavailable' }))
      .answer(second.request('call-1', 1), async () => 'rejected')).resolves.toBe('rejected')
  })

  it('never reviews approval requests owned by another model provider', async () => {
    const target = fixture()
    ;(target.agent.session.requestHeader as unknown as { (): unknown }) = () => ({
      config: { provider: 'deepseek', model: 'deepseek-chat' },
      tools: [],
    })
    const review = backend(allow)
    await expect(new OpenAICodexAutoReviewAnswerer(review)
      .answer(target.request('call-1', 1), async () => 'rejected')).resolves.toBe('rejected')
    expect(review.review).not.toHaveBeenCalled()
  })

  it('injects denial guidance and opens the breaker after three denials', async () => {
    const target = fixture()
    const answerer = new OpenAICodexAutoReviewAnswerer(backend(deny, deny, deny))
    for (let index = 1; index <= 3; index++) {
      await expect(answerer.answer(target.request(`call-${index}`, 1), async () => 'unavailable')).resolves.toBe('rejected')
    }
    expect(target.injected).toHaveLength(3)
    expect(JSON.stringify(target.injected)).toContain('Do not attempt the same outcome through a workaround')
    expect(target.cancel).toHaveBeenCalledOnce()
    await expect(answerer.answer(target.request('call-4', 1), async () => 'unavailable')).resolves.toBe('unavailable')
  })

  it('honors a matching one-shot override even after the breaker opens', async () => {
    const target = fixture()
    let id = 0
    const answerer = new OpenAICodexAutoReviewAnswerer(
      backend(deny, deny, deny),
      new AutoReviewState(() => `denial-${++id}`),
      () => undefined,
    )
    for (let index = 1; index <= 3; index++) {
      await answerer.answer(target.request(`call-${index}`, 1), async () => 'unavailable')
    }
    const latest = answerer.state.denials(target.agent)[0]!
    expect(answerer.state.arm(target.agent, latest.id)).toBeDefined()
    await expect(answerer.answer(target.request('retry', 2), async () => 'unavailable')).resolves.toBe('allowed-once')
    await expect(answerer.answer(target.request('retry-again', 2), async () => 'rejected')).resolves.toBe('rejected')
  })

  it('returns a first timeout to a denied retry and a second timeout to the human chain', async () => {
    const target = fixture()
    const answerer = new OpenAICodexAutoReviewAnswerer(backend({ status: 'timeout' }, { status: 'timeout' }))
    await expect(answerer.answer(target.request('call-1', 1), async () => 'unavailable')).resolves.toBe('rejected')
    await expect(answerer.answer(target.request('call-2', 1), async () => 'allowed-once')).resolves.toBe('allowed-once')
  })

  it('registers /approve as an exact one-shot follow-up without recording raw input', async () => {
    const ctx = new Context()
    const proxyManager = new OpenAICodexProxyManager()
    try {
      await ctx.plugin(CommandRuntime)
      const answerer = registerOpenAICodexAutoReview(
        ctx,
        new OpenAICodexCredentialStore('/tmp/codex-auto-review-command-missing-auth.json'),
        proxyManager,
        () => undefined,
        () => true,
      )
      const target = fixture()
      const action = resolveAutoReviewAction(target.request('call-1', 1))!
      const denial = answerer.state.recordDecision(target.agent, action, true, 'No trusted authorization.')!
      await vi.waitFor(() => { expect(ctx.commands.find(target.agent, 'approve')).toBeDefined() })
      const command = ctx.commands.find(target.agent, 'approve')
      expect(command?.recordInput).toBe(false)
      expect(await command?.handler({
        commandId: 'command-1' as never,
        agent: target.agent,
        rawInput: denial.id,
        attachments: [],
        signal: new AbortController().signal,
      })).toMatchObject({ kind: 'success' })
      expect(target.followups).toHaveLength(1)
      expect(answerer.state.consume(target.agent, action)).toBe('matched')
      expect(answerer.state.consume(target.agent, action)).toBe('none')
    } finally {
      await ctx.fiber.dispose()
      await proxyManager.dispose()
    }
  })
})
