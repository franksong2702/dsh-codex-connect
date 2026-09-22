/** Test-process-only network tripwire. Never imported by the product or the registry installer. */
import { afterAll } from 'vitest'
import assert from 'node:assert/strict'
import { createRequire, syncBuiltinESMExports } from 'node:module'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
const require = createRequire(import.meta.url)
const key = Symbol.for('codex-connect.task-matrix-network-tripwire')
if (globalThis[key] === undefined) {
  const state = { attempts: 0 }
  globalThis[key] = state
  const blocked = () => { state.attempts++; throw new Error('Network dispatch forbidden in synthetic Task host tests') }
  // vi.stubGlobal replaces only this guarded fetch with a synthetic response during each case.
  globalThis.fetch = blocked
  for (const [id, fields] of [['node:http', ['request', 'get']], ['node:https', ['request', 'get']],
    ['node:net', ['connect', 'createConnection']], ['node:tls', ['connect']]]) {
    const module = require(id)
    for (const field of fields) module[field] = blocked
  }
  require('node:net').Socket.prototype.connect = blocked
  syncBuiltinESMExports()
}
afterAll(() => {
  const attempts = globalThis[key].attempts
  writeFileSync(join(process.env.TASK_MATRIX_ROOT, 'network.json'), JSON.stringify({ pid: process.pid, attempts }))
  assert.equal(attempts, 0, 'an actual network dispatch was attempted')
})
