/** Verify the live Host owner and the absence of children before changing saved state. */
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { taskDurableAncestors, taskIsOwnedBy, taskLiveRoots } from './adaptive-task-host-ownership.ts'
import type { LedgerIdentity } from './adaptive-task-delegation-ledger.ts'
import { taskFailure, taskIdentity } from './adaptive-task-store.ts'

export function taskHostServices(ctx: Context) {
  const agents = ctx.get('agents'), sessions = ctx.get('sessions')
  if (agents === undefined || sessions === undefined) taskFailure('TASK_LIVE_ROOT_REQUIRED')
  return { agents, sessions }
}

export class TaskRecoveryHost {
  constructor(private readonly ctx: Context) {}
  private get agents() { return taskHostServices(this.ctx).agents }
  private get sessions() { return taskHostServices(this.ctx).sessions }

  assertRoot(parent: Agent, identity: LedgerIdentity): void {
    const header = parent.session.header
    const expectedKey = taskIdentity(JSON.stringify([header.id, header.createdAt, header.cwd ?? '', header.isSeeded, header.parentSession ?? '']))
    if (parent.id !== identity.sessionId || identity.sessionKey !== expectedKey
      || this.agents.get(parent.id) !== parent || this.sessions.get(parent.session.id) !== parent.session
      || !taskLiveRoots(this.ctx).includes(parent)
      || header.parentSession !== undefined) throw new Error('TASK_PARENT_NOT_LIVE')
  }

  hasLiveChildren(parent: Agent): boolean {
    for (const candidate of this.agents.list()) {
      if (candidate === parent) continue
      if (taskDurableAncestors(this.ctx, candidate).includes(parent.id) || taskIsOwnedBy(this.ctx, candidate.id, parent)) return true
    }
    return false
  }

  assertNoChildren(parent: Agent): void {
    if (this.hasLiveChildren(parent)) throw new Error('TASK_CHILDREN_LIVE')
  }
}
