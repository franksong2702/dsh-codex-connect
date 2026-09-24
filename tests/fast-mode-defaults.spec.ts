import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { scopeTarget } from '@deepseek-ai/dsh-scope'
import type { Session } from '@deepseek-ai/dsh-session'
import { describe, expect, it, vi } from 'vitest'
import { registerOpenAICodexFastModeDefaults } from '../src/fast-mode-defaults.ts'
import { FastModeRegistry } from '../src/fast-mode.ts'

function session(id: string, origin?: 'subagent'): Session {
  return { id, header: { origin } } as Session
}

describe('new-session Fast Mode defaults', () => {
  it('observes the real scoped Host agent-created event before requests', async () => {
    const ctx = new Context()
    const registry = new FastModeRegistry()
    registerOpenAICodexFastModeDefaults(ctx, registry, () => ({
      enableNewSessionFastMode: true,
      enableNewSubagentFastMode: false,
    }))
    const agent = { session: session('host-new') } as Agent
    await ctx.serial(scopeTarget(agent, undefined), 'agent/created', { agent, source: 'startup' })
    expect(registry.isEnabled('host-new')).toBe(true)
  })

  it('seeds only new sessions, keeps manual choices, and separates top-level from subagent defaults', () => {
    let start: ((payload: unknown) => void) | undefined
    const on = vi.fn((_name: string, listener: (payload: unknown) => void) => {
      start = listener
      return () => undefined
    })
    const registry = new FastModeRegistry()
    let defaults = { enableNewSessionFastMode: false, enableNewSubagentFastMode: false }
    registerOpenAICodexFastModeDefaults({ on } as unknown as Context, registry, () => defaults)
    expect(on).toHaveBeenCalledWith('agent/created', expect.any(Function), { global: true })
    const announce = (value: Session, source: string): void => {
      start?.({ agent: { session: value }, source })
    }

    const existing = session('existing')
    announce(existing, 'startup')
    expect(registry.isEnabled(existing.id)).toBe(false)

    defaults = { enableNewSessionFastMode: true, enableNewSubagentFastMode: false }
    announce(existing, 'startup')
    expect(registry.isEnabled(existing.id)).toBe(false)
    const resumed = session('resumed')
    announce(resumed, 'resume')
    expect(registry.isEnabled(resumed.id)).toBe(false)
    const topLevel = session('new-top-level')
    announce(topLevel, 'startup')
    expect(registry.isEnabled(topLevel.id)).toBe(true)
    registry.set(topLevel.id, false)
    announce(topLevel, 'startup')
    expect(registry.isEnabled(topLevel.id)).toBe(false)

    const child = session('new-child', 'subagent')
    announce(child, 'startup')
    expect(registry.isEnabled(child.id)).toBe(false)
    defaults = { enableNewSessionFastMode: false, enableNewSubagentFastMode: true }
    const laterChild = session('later-child', 'subagent')
    announce(laterChild, 'startup')
    expect(registry.isEnabled(laterChild.id)).toBe(true)
    expect(registry.isEnabled(topLevel.id)).toBe(false)
  })
})
