import { describe, expect, it } from 'vitest'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { Message, ToolCallId } from '@deepseek-ai/dsh-llm'
import type { ApprovalRequestEvent } from '@deepseek-ai/dsh-user-approval/types'
import {
  AUTO_REVIEW_MAX_CONSECUTIVE_DENIALS,
  AUTO_REVIEW_RECENT_DENIAL_LIMIT,
  AutoReviewState,
  buildAutoReviewContext,
  resolveAutoReviewAction,
} from '../src/auto-review-contract.ts'

function agent(options: {
  calls?: readonly { callId: string; turn: number; name?: string; arguments?: string }[]
  messages?: readonly Message[]
  cwd?: string
} = {}): Agent {
  const events = (options.calls ?? []).map((call, index) => ({
    seq: index,
    time: index,
    type: 'tool/call',
    data: {
      turn: call.turn,
      step: 0,
      callId: call.callId as ToolCallId,
      name: call.name ?? 'shell',
      arguments: call.arguments ?? '{"command":"pwd"}',
    },
  }))
  return {
    id: 'agent-1',
    session: {
      snapshotEvents: () => events,
      header: { version: 0, id: 'agent-1', createdAt: 0, ...options.cwd === undefined ? {} : { cwd: options.cwd } },
      deriveMessages: () => options.messages ?? [],
      requestHeader: () => ({ tools: [{ name: 'shell', description: 'Run a command', parameters: {} }] }),
    },
  } as unknown as Agent
}

function request(target: Agent, callId = 'call-1', toolName = 'shell'): ApprovalRequestEvent {
  return { agent: target, callId: callId as ToolCallId, toolName, reason: 'needs approval' }
}

function message(source: Message['source'], content: Message['content'], id: string): Message {
  return { id, role: source.kind === 'model' ? 'assistant' : 'user', source, content } as unknown as Message
}

describe('Auto-review action and context contract', () => {
  it('resolves one exact tool call and produces a canonical fingerprint', () => {
    const left = agent({ cwd: '/workspace', calls: [{ callId: 'call-1', turn: 2, arguments: '{"b":2,"a":1}' }] })
    const right = agent({ cwd: '/workspace', calls: [{ callId: 'other', turn: 3, arguments: '{"a":1,"b":2}' }] })
    const first = resolveAutoReviewAction(request(left))
    const second = resolveAutoReviewAction(request(right, 'other'))
    expect(first).toMatchObject({ toolName: 'shell', turn: 2, arguments: { a: 1, b: 2 }, cwd: '/workspace' })
    expect(first?.fingerprint).toBe(second?.fingerprint)
  })

  it('delegates ambiguous, mismatched, and malformed requests', () => {
    expect(resolveAutoReviewAction({ agent: agent(), toolName: 'shell' })).toBeUndefined()
    expect(resolveAutoReviewAction(request(agent({ calls: [{ callId: 'call-1', turn: 1, name: 'fs' }] })))).toBeUndefined()
    expect(resolveAutoReviewAction(request(agent({ calls: [{ callId: 'call-1', turn: 1, arguments: '{' }] })))).toBeUndefined()
    expect(resolveAutoReviewAction(request(agent({ calls: [
      { callId: 'call-1', turn: 1 },
      { callId: 'call-1', turn: 1 },
    ] })))).toBeUndefined()
  })

  it('labels trust, excludes reasoning, and reports bounded omissions', () => {
    const messages: Message[] = [
      message({ kind: 'user' }, [{ type: 'text', text: 'trusted request' }], 'user'),
      message({ kind: 'plugin', plugin: 'fixture', form: 'notice', summary: 'fixture' }, [{ type: 'text', text: 'untrusted plugin text' }], 'plugin'),
      message({ kind: 'model', provider: 'openai-codex', model: 'fixture' }, [
        { type: 'reasoning', text: 'hidden chain of thought' },
        { type: 'text', text: 'visible assistant text' },
      ], 'model'),
    ]
    const context = buildAutoReviewContext(agent({ messages }))
    expect(context.transcript).toContain('[trusted-user]\ntrusted request')
    expect(context.transcript).toContain('[untrusted-context]\nuntrusted plugin text')
    expect(context.transcript).toContain('[assistant]\nvisible assistant text')
    expect(context.transcript).not.toContain('hidden chain of thought')
    expect(Buffer.byteLength(context.transcript, 'utf8')).toBeLessThanOrEqual(20_000)
    expect(Buffer.byteLength(context.tools, 'utf8')).toBeLessThanOrEqual(10_000)
  })
})

describe('Auto-review state', () => {
  it('opens the consecutive-denial breaker and resets it on a new turn', () => {
    const target = agent({ calls: [{ callId: 'call-1', turn: 1 }] })
    const action = resolveAutoReviewAction(request(target))!
    const state = new AutoReviewState(() => 'denial')
    for (let index = 0; index < AUTO_REVIEW_MAX_CONSECUTIVE_DENIALS; index++) {
      state.recordDecision(target, action, true, 'denied')
    }
    expect(state.breakerOpen(target, 1)).toBe(true)
    expect(state.breakerOpen(target, 2)).toBe(false)
  })

  it('keeps recent denials and one exact override across the follow-up turn', () => {
    const target = agent({ calls: [
      { callId: 'call-1', turn: 1, arguments: '{"command":"pwd"}' },
      { callId: 'call-2', turn: 2, arguments: '{"command":"pwd"}' },
      { callId: 'call-3', turn: 2, arguments: '{"command":"ls"}' },
    ] })
    const denied = resolveAutoReviewAction(request(target, 'call-1'))!
    const retry = resolveAutoReviewAction(request(target, 'call-2'))!
    const changed = resolveAutoReviewAction(request(target, 'call-3'))!
    const state = new AutoReviewState(() => 'denial-1')
    state.recordDecision(target, denied, true, 'denied')
    expect(state.arm(target, 'denial-1')).toBeDefined()
    expect(state.consume(target, retry)).toBe('matched')
    expect(state.consume(target, retry)).toBe('none')
    expect(state.arm(target, 'denial-1')).toBeDefined()
    expect(state.consume(target, changed)).toBe('mismatched')
    expect(state.denials(target)).toHaveLength(1)
  })

  it('opens the rolling breaker after ten non-consecutive denials', () => {
    const target = agent({ calls: [{ callId: 'call-1', turn: 1 }] })
    const action = resolveAutoReviewAction(request(target))!
    const state = new AutoReviewState(() => 'denial')
    for (let index = 0; index < 10; index++) {
      state.recordDecision(target, action, true, 'denied')
      if (index < 9) state.recordDecision(target, action, false, 'allowed')
    }
    expect(state.breakerOpen(target, 1)).toBe(true)
  })

  it('bounds denial history and permits one timeout retry per exact action', () => {
    let id = 0
    const target = agent({ calls: [{ callId: 'call-1', turn: 1 }] })
    const action = resolveAutoReviewAction(request(target))!
    const state = new AutoReviewState(() => `denial-${++id}`)
    for (let index = 0; index < AUTO_REVIEW_RECENT_DENIAL_LIMIT + 3; index++) {
      state.recordDecision(target, action, true, `denied ${index}`)
    }
    expect(state.denials(target)).toHaveLength(AUTO_REVIEW_RECENT_DENIAL_LIMIT)
    expect(state.allowTimeoutRetry(target, action)).toBe(true)
    expect(state.allowTimeoutRetry(target, action)).toBe(false)
  })
})
