/** Recovery-only Task runtime behavior on the retained synthetic SDK setup. */
import { afterEach, describe, expect, it } from 'vitest'
import { SessionId } from '@deepseek-ai/dsh-session'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions } from '@deepseek-ai/dsh-llm'
import { taskIdentity } from '../src/adaptive-task-store.ts'
import { setupRecoverySource as setup, cleanupRecoveryFixtures, model, owner } from './adaptive-task-recovery-setup.ts'

afterEach(cleanupRecoveryFixtures)

describe('recovery-only Task control', () => {
  for (const version of [1, 2] as const) {
    it(`rejects direct activation with matching archived v${version} receipts`, async () => {
      const f = await setup(version)
      const state = await f.state()
      const commands = (['start', 'resume', 'upgrade', 'delegate-enable'] as const).map(action => {
        const extra = action === 'start'
          ? { models: [model], efforts: { [model]: ['medium'] }, maximumRequests: 12 }
          : action === 'delegate-enable'
            ? { files: ['notes.txt'], routes: [{ model, effort: 'medium' }], maxChildRequests: 1, timeoutMs: 30_000, disclose: true as const }
            : {}
        return { sessionId: f.agent.id, action, revision: state.revision, operationId: 'old-receipt-' + action, ...extra }
      })
      const before = await f.store.update(f.agent.id, doc => {
        if (doc === undefined) throw new Error('Missing synthetic task')
        return { ...doc, receipts: [...doc.receipts, ...commands.map(command => ({
          id: command.operationId, digest: taskIdentity(JSON.stringify(command)),
        }))] }
      })
      for (const command of commands) await expect(f.runtime().command(command, owner)).rejects.toThrow('TASK_HOST_RECOVERY_ONLY')
      expect(await f.store.read(f.agent.id)).toEqual(before)
      expect(f.calls()).toBe(0)
    })

    it(`retains v${version} counters and makes safety exits idempotent`, async () => {
      const f = await setup(version)
      const before = await f.state()
      const operationId = `recovery-stop-v${version}`
      const stopped = await f.command('stop', before.revision, { operationId })
      expect(stopped).toMatchObject({ mode: 'stopped', reserved: 3, maximumRequests: 12 })
      expect(await f.command('stop', before.revision, { operationId })).toMatchObject({ mode: 'stopped', reserved: 3 })
      await expect(f.command('manual', before.revision, { operationId })).rejects.toThrow('TASK_OPERATION_CONFLICT')
      const doc = await f.store.read(f.agent.id)
      expect(doc?.reserved).toBe(3)
      expect(doc?.maximumRequests).toBe(12)
      expect(doc?.receipts.some(receipt => receipt.id === operationId)).toBe(true)
      expect(doc?.owner).toBe(owner)
      expect(f.calls()).toBe(0)
    })
  }

  it.each(['stop', 'manual'] as const)('persists v2 %s while refusing to confirm cleanup of a live child', async action => {
    const f = await setup(2)
    const before = await f.state()
    const input: Parameters<typeof f.ctx.agents.create>[0] & { parentAgent: typeof f.agent } = {
      sessionId: SessionId('live-recovery-child'), parentAgent: f.agent,
      meta: { parentSession: f.agent.id, origin: 'subagent', delegationDepth: 1 },
      agentOptions: { provider: 'openai-codex', model },
    }
    const child = await f.agent.ctx.agents.create(input)
    const expectedMode = action === 'stop' ? 'stopped' : 'manual'
    const command = () => f.command(action, before.revision, { operationId: 'live-child-' + action + '-0001' })
    try {
      await expect(command()).rejects.toThrow('TASK_CHILD_CLEANUP_UNVERIFIED')
      expect(await f.state()).toMatchObject({ mode: expectedMode, reserved: 3, delegation: { canDowngrade: false } })
      const stored = await f.store.read(f.agent.id)
      await expect(command()).rejects.toThrow('TASK_CHILD_CLEANUP_UNVERIFIED')
      expect(await f.store.read(f.agent.id)).toEqual(stored)
    } finally { await child.dispose() }
    expect(await command()).toMatchObject({ mode: expectedMode, reserved: 3 })
    expect(f.calls()).toBe(0)
  })

  it('allows an explicit manual ordinary request without restoring Task authority', async () => {
    const f = await setup(2)
    const state = await f.state()
    await f.command('manual', state.revision, { operationId: 'manual-recovery-0001' })
    await f.send()
    expect(f.calls()).toBe(1)
    expect(await f.state()).toMatchObject({ mode: 'manual', reserved: 3, maximumRequests: 12 })
    const doc = await f.store.read(f.agent.id)
    expect(doc?.version === 2 ? doc.delegation.grant : undefined).toBeNull()
  })

  it('keeps ordinary work outside the retained root on the normal adapter path', async () => {
    const f = await setup(2)
    await f.state()
    const other = await f.ctx.agents.create({
      sessionId: SessionId('ordinary-recovery-other-root'),
      agentOptions: { provider: 'openai-codex', model },
    })
    other.agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'ordinary synthetic request' }] }))
    await other.agent.whenIdle()
    expect(f.calls()).toBe(1)
    expect((await f.state()).reserved).toBe(3)
    const doc = await f.store.read(f.agent.id)
    expect(doc?.version === 2 ? doc.delegation.grant : undefined).toBeNull()
  })

  it('fails closed when retained state is missing and does not dispatch', async () => {
    const f = await setup(2)
    await f.state()
    await f.removeState()
    await expect(f.state()).rejects.toThrow('TASK_STATE_MISSING')
    await f.send()
    expect(f.calls()).toBe(0)
  })

  it('fails closed when a live retained agent is detached from the registry', async () => {
    const f = await setup(2)
    await f.state()
    await f.handle.dispose()
    let direct = 0
    const stream = f.runtime().stream({ sessionId: f.agent.id } as GenerateOptions, async function* () { direct++ })
    await expect(stream[Symbol.asyncIterator]().next()).rejects.toThrow('TASK_LIVE_ROOT_REQUIRED')
    await expect(f.state()).rejects.toThrow('TASK_LIVE_ROOT_REQUIRED')
    expect(direct).toBe(0)
    expect(f.calls()).toBe(0)
  })
})
