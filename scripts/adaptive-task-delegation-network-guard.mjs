/** Synthetic test process only: native sockets can reach loopback, never external services. */
import { afterAll } from 'vitest'
import { createRequire, syncBuiltinESMExports } from 'node:module'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import assert from 'node:assert/strict'
const require = createRequire(import.meta.url), key = Symbol.for('codex-connect.phase2-network')
if (globalThis[key] === undefined) {
  const state = { attempts: 0 }; globalThis[key] = state
  const deny = () => { state.attempts++; throw new Error('External network forbidden in Phase 2 matrix') }
  // Tests replace fetch with synthetic providers. Non-synthetic fetch always fails.
  globalThis.fetch = deny
  const net = require('node:net'), connect = net.Socket.prototype.connect
  net.Socket.prototype.connect = function (...args) {
    const value = Array.isArray(args[0]) ? args[0][0] : args[0]
    const host = typeof value === 'object' && value !== null ? value.host ?? value.hostname ?? 'localhost'
      : typeof args[1] === 'string' ? args[1] : 'localhost'
    if (!['127.0.0.1', '::1', '[::1]', 'localhost'].includes(host) || (typeof value === 'object' && value?.path)
      || typeof value === 'string') return deny()
    return Reflect.apply(connect, this, args)
  }
  syncBuiltinESMExports()
}
afterAll(() => {
  const attempts = globalThis[key].attempts
  writeFileSync(join(process.env.TASK_MATRIX_ROOT, 'network.json'), JSON.stringify({ pid: process.pid, attempts }))
  assert.equal(attempts, 0)
})
