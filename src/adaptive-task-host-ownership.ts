/** Read-only exact-Host ownership bridge. Session ancestry never grants authority. */
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { SessionId } from '@deepseek-ai/dsh-session'
import { taskHostUsesSubagentOwnership } from './adaptive-task-host-policy.ts'
import { taskFailure } from './adaptive-task-store.ts'

function services(ctx: Context) {
  const agents = ctx.get('agents'), sessions = ctx.get('sessions')
  if (agents === undefined || sessions === undefined) taskFailure('TASK_LIVE_ROOT_REQUIRED')
  return { agents, sessions }
}
function exactLive(ctx: Context, agent: Agent): void {
  const { agents, sessions } = services(ctx)
  if (agents.get(agent.id) !== agent || sessions.get(agent.id) !== agent.session
    || agent.session.id !== agent.id || agent.session.header.id !== agent.id) taskFailure('TASK_LIVE_ROOT_REQUIRED')
}
export function taskVerifiedRuntimeRoot(ctx: Context, agent: Agent): Agent {
  exactLive(ctx, agent)
  if (!taskHostUsesSubagentOwnership()) taskFailure('TASK_HOST_OWNERSHIP_UNVERIFIED')
  const subagents = ctx.get('subagents') as unknown as { rootOf?: (agent: Agent) => Agent } | undefined
  if (typeof subagents?.rootOf !== 'function') taskFailure('TASK_HOST_OWNERSHIP_UNAVAILABLE')
  const root = subagents.rootOf(agent)
  exactLive(ctx, root)
  return root
}
/** Legacy live roots are authoritative; rc.2 uses the Host's activation registry. */
export function taskLiveRoots(ctx: Context): Agent[] {
  const { agents } = services(ctx)
  if (typeof agents.roots === 'function' && typeof agents.isOwnedBy === 'function') return agents.roots()
  // Validate the Host/service even for an empty registry. Never infer authority
  // from the absence of an API or from a future version's shape.
  if (!taskHostUsesSubagentOwnership()) taskFailure('TASK_HOST_OWNERSHIP_UNVERIFIED')
  const subagents = ctx.get('subagents') as unknown as { rootOf?: (agent: Agent) => Agent } | undefined
  if (typeof subagents?.rootOf !== 'function') taskFailure('TASK_HOST_OWNERSHIP_UNAVAILABLE')
  return agents.list().filter(agent => {
    // Persisted child/fork ancestry cannot become a Task control root.
    if (agent.session.header.parentSession !== undefined || agent.session.header.origin === 'subagent') return false
    try { return taskVerifiedRuntimeRoot(ctx, agent) === agent } catch { return false }
  })
}
/** For rc.2 this only establishes tree membership, never permission to create children. */
export function taskIsOwnedBy(ctx: Context, id: Agent['id'], owner: Agent): boolean {
  const { agents } = services(ctx)
  if (typeof agents.roots === 'function' && typeof agents.isOwnedBy === 'function') return agents.isOwnedBy(id, owner)
  exactLive(ctx, owner)
  const agent = agents.get(id)
  return agent !== undefined && agent !== owner && taskVerifiedRuntimeRoot(ctx, agent) === owner
}
/** Read durable ancestors for rejecting descendants, including disposed live agents. */
export function taskDurableAncestors(ctx: Context, agent: Agent): string[] {
  const { agents, sessions } = services(ctx)
  exactLive(ctx, agent)
  const result: string[] = [], visited = new Set<string>([agent.id])
  let current = agent.session
  while (current.header.parentSession !== undefined) {
    const id = current.header.parentSession
    if (visited.has(id) || visited.size >= 64) taskFailure('TASK_CHILD_BINDING_MISMATCH')
    visited.add(id); result.push(id)
    const session = sessions.get(SessionId(id)), live = agents.get(SessionId(id))
    if (live !== undefined && (session !== live.session || live.id !== id)) taskFailure('TASK_CHILD_BINDING_MISMATCH')
    if (session === undefined) break
    if (session.id !== id || session.header.id !== id) taskFailure('TASK_CHILD_BINDING_MISMATCH')
    current = session
  }
  return result
}
