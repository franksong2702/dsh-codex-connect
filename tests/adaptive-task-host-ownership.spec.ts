import { beforeEach, expect, it, vi } from 'vitest'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { Context } from '@deepseek-ai/cordis'
const { supported } = vi.hoisted(() => ({ supported: vi.fn(() => true) }))
vi.mock('../src/adaptive-task-host-policy.ts', () => ({ taskHostUsesSubagentOwnership: supported }))
import { taskDurableAncestors, taskIsOwnedBy, taskLiveRoots } from '../src/adaptive-task-host-ownership.ts'
beforeEach(() => { supported.mockReset().mockReturnValue(true) })
function fixture() {
  const agents = new Map<string, Agent>(), sessions = new Map<string, Agent['session']>()
  const roots = new Map<Agent, Agent>(), rejected = new Set<Agent>()
  const subagents = { rootOf: vi.fn((agent: Agent) => {
    if (rejected.has(agent)) throw new Error('unmanaged delegated agent')
    return roots.get(agent) ?? agent
  }) }
  const registry = { get: (id: string) => agents.get(id), list: () => [...agents.values()] }
  const values: Record<string, unknown> = { agents: registry, sessions: { get: (id: string) => sessions.get(id) }, subagents }
  const ctx = { get: (name: string) => values[name] } as unknown as Context
  function add(id: string, parent?: string, origin?: string) {
    const session = { id, header: { id, ...(parent === undefined ? {} : { parentSession: parent }), ...(origin === undefined ? {} : { origin }) } } as Agent['session']
    const agent = { id, session } as Agent
    agents.set(id, agent); sessions.set(id, session); return agent
  }
  return { agents, sessions, roots, rejected, subagents, registry, values, ctx, add }
}
it('uses exact live rc2 roots, not durable ancestry as permission', () => {
  const f = fixture(), root = f.add('root'), child = f.add('child', 'root', 'subagent'), fork = f.add('fork', 'root')
  f.roots.set(child, root)
  expect(taskLiveRoots(f.ctx)).toEqual([root])
  expect(taskIsOwnedBy(f.ctx, child.id, root)).toBe(true)
  expect(taskIsOwnedBy(f.ctx, fork.id, root)).toBe(false)
  expect(taskDurableAncestors(f.ctx, fork)).toEqual(['root'])
})
it('uses runtime root even when intermediate creator is not resident', () => {
  const f = fixture(), root = f.add('root'), middle = f.add('middle', 'root', 'subagent'), child = f.add('child', 'middle', 'subagent')
  f.roots.set(child, root); f.agents.delete(middle.id)
  expect(taskIsOwnedBy(f.ctx, child.id, root)).toBe(true)
  expect(taskDurableAncestors(f.ctx, child)).toEqual(['middle', 'root'])
})
it('does not manufacture membership from a matching parentSession', () => {
  const f = fixture(), root = f.add('root'), child = f.add('child', 'root', 'subagent')
  f.rejected.add(child)
  expect(() => taskIsOwnedBy(f.ctx, child.id, root)).toThrow('unmanaged')
  expect(taskLiveRoots(f.ctx)).toEqual([root])
})
it('does not include identity-marked delegated agents with a parent-less header', () => {
  const f = fixture(), root = f.add('root'), child = f.add('child'); f.rejected.add(child)
  expect(taskLiveRoots(f.ctx)).toEqual([root])
  expect(() => taskIsOwnedBy(f.ctx, child.id, root)).toThrow('unmanaged')
})
it('refuses missing optional service and unknown versions without invented roots', () => {
  const f = fixture(); f.add('root'); delete f.values.subagents
  expect(() => taskLiveRoots(f.ctx)).toThrow('TASK_HOST_OWNERSHIP_UNAVAILABLE')
  supported.mockReturnValue(false)
  expect(() => taskLiveRoots(f.ctx)).toThrow('TASK_HOST_OWNERSHIP_UNVERIFIED')
})
it('refuses a same-id replacement caller or returned runtime root', () => {
  const f = fixture(), root = f.add('root'), child = f.add('child', 'root', 'subagent')
  f.roots.set(child, root); f.add('root')
  expect(() => taskIsOwnedBy(f.ctx, child.id, root)).toThrow('TASK_LIVE_ROOT_REQUIRED')
  expect(() => taskIsOwnedBy(f.ctx, child.id, f.agents.get('root')!)).toThrow('TASK_LIVE_ROOT_REQUIRED')
  expect(() => taskDurableAncestors(f.ctx, { ...child } as Agent)).toThrow('TASK_LIVE_ROOT_REQUIRED')
})
it('refuses a mismatched session instance for caller or ancestor', () => {
  const f = fixture(), root = f.add('root'), child = f.add('child', 'root')
  f.sessions.set(root.id, { ...root.session } as Agent['session'])
  expect(() => taskDurableAncestors(f.ctx, child)).toThrow('TASK_CHILD_BINDING_MISMATCH')
  f.sessions.set(child.id, { ...child.session } as Agent['session'])
  expect(() => taskDurableAncestors(f.ctx, child)).toThrow('TASK_LIVE_ROOT_REQUIRED')
})
it('rejects ancestry cycles', () => {
  const f = fixture(), a = f.add('a', 'b'); f.add('b', 'a')
  expect(() => taskDurableAncestors(f.ctx, a)).toThrow('TASK_CHILD_BINDING_MISMATCH')
})
it('rejects ancestry deeper than the bounded lookup', () => {
  const f = fixture(); for (let i = 0; i < 66; i++) f.add(String(i), String(i + 1))
  expect(() => taskDurableAncestors(f.ctx, f.agents.get('0')!)).toThrow('TASK_CHILD_BINDING_MISMATCH')
})
it('keeps a missing durable ancestor as denial evidence, not a fabricated live root', () => {
  const f = fixture(), child = f.add('child', 'old-disposed')
  expect(taskDurableAncestors(f.ctx, child)).toEqual(['old-disposed'])
  expect(taskLiveRoots(f.ctx)).toEqual([])
})
it('preserves both legacy APIs and their independent live/durable semantics', () => {
  const f = fixture(), root = f.add('root'), child = f.add('child')
  Object.assign(f.registry, { roots: () => [root], isOwnedBy: (id: string, owner: Agent) => id === child.id && owner === root })
  supported.mockReturnValue(false)
  expect(taskLiveRoots(f.ctx)).toEqual([root]); expect(taskIsOwnedBy(f.ctx, child.id, root)).toBe(true)
  expect(taskDurableAncestors(f.ctx, child)).toEqual([])
  expect(f.subagents.rootOf).not.toHaveBeenCalled()
})
