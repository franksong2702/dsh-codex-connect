/** Isolated process: a durable old Task checkpoint, abrupt exit, then recovery without dispatch. */
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createRequire, syncBuiltinESMExports } from 'node:module'
import { setup, seedInterrupted, cleanupRecoveryFixtures } from '../tests/adaptive-task-recovery-setup.ts'
import { AdaptiveTaskDelegationLedger } from '../src/adaptive-task-delegation-ledger.ts'
const [root, rawVersion, compression, cut, phase] = process.argv.slice(2)
assert.ok(root && ['1', '2'].includes(rawVersion!) && ['none', 'zstd'].includes(compression!)
  && ['seed', 'stop', 'manual'].includes(cut!) && ['write', 'read'].includes(phase!))
let externalNetworkAttempts = 0
const deny = () => { externalNetworkAttempts++; throw new Error('Recovery process forbids network') }
globalThis.fetch = deny
const require = createRequire(import.meta.url)
require('node:net').Socket.prototype.connect = deny
syncBuiltinESMExports()
const version = Number(rawVersion) as 1 | 2
const f = await setup(version, { root, compression: compression as 'none' | 'zstd', readExisting: phase !== 'write' })
if (phase === 'write') {
  if (version === 2) await seedInterrupted(f)
  if (cut !== 'seed') { const s = await f.state(); await f.command(cut as 'stop' | 'manual', s.revision) }
  assert.equal(await f.ctx.sessions.flush(f.agent.session), true)
  await writeFile(join(root, 'before.json'), JSON.stringify(await f.store.read(f.agent.id)))
} else {
  const before = JSON.parse(await readFile(join(root, 'before.json'), 'utf8'))
  const state = await f.state(), after = await f.store.read(f.agent.id)
  assert.equal(state.mode, before.mode === 'auto' ? 'interrupted' : before.mode)
  assert.equal(after?.reserved, before.reserved); assert.equal(after?.maximumRequests, before.maximumRequests)
  assert.equal(after?.owner, before.owner); assert.equal(after?.sessionKey, before.sessionKey)
  assert.deepEqual(after?.receipts, before.receipts)
  if (after?.version === 2) {
    assert.notEqual(after.runtime, before.runtime)
    assert.equal(after.delegation.runs[0]?.cleanup, 'verified')
    assert.equal(after.delegation.runs[0]?.delivery, 'none')
    assert.deepEqual(after.delegation.runs[0]?.attempts, ['attempt-000000001'])
    const ledger = new AdaptiveTaskDelegationLedger(join(root, 'tasks'))
    await assert.rejects(ledger.reserveRoot({ sessionId: after.sessionId, sessionKey: after.sessionKey, owner: after.owner },
      before.runtime, after.route, 'main', after.selectionSeq), /TASK_STALE_EPOCH/u)
  }
  assert.equal(await f.ctx.sessions.flush(f.agent.session), true)
}
assert.equal(f.calls(), 0); assert.equal(f.ctx.agents.list().length, 1); assert.equal(externalNetworkAttempts, 0)
const receipt = { version, compression, cut, phase, pid: process.pid, calls: f.calls(), children: 0,
  externalNetworkAttempts, passed: true, ...(phase === 'write' ? { abruptExit: 85 } : {}) }
await writeFile(join(root, phase + '-receipt.json'), JSON.stringify(receipt))
if (phase === 'write') process.exit(85) // Deliberate crash before graceful plugin/session disposal.
await cleanupRecoveryFixtures()
console.log(JSON.stringify(receipt))
