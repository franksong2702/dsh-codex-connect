import assert from 'node:assert/strict'
import { npmReadbackObservation, verifyNpmReadback } from './verify-npm-readback.mjs'

const version = '0.1.0-alpha.4.34'
const good = value => ({ status: 0, stdout: JSON.stringify(value), stderr: '' })
assert.equal(npmReadbackObservation(good(version), 'version').value, version)
assert.equal(npmReadbackObservation({ status: 0, stdout: 'not-json' }, 'version').status, 'invalid-response')
assert.equal(npmReadbackObservation({ ...good(version), status: 1 }, 'version').status, 'query-failed')
assert.equal(npmReadbackObservation({ ...good(version), error: { code: 'ETIMEDOUT' } }, 'version').errorCode, 'ETIMEDOUT')
assert.equal(npmReadbackObservation(good({ latest: version }), 'tags').status, 'invalid-response')
const secret = 'private-fixture-value'
const redacted = JSON.stringify(npmReadbackObservation({ status: 1, stdout: JSON.stringify({ error: { code: 'E404', summary: secret } }), stderr: secret }, 'version'))
assert.ok(!redacted.includes(secret))
assert.ok(redacted.includes('E404'))
assert.ok(!JSON.stringify(npmReadbackObservation(good({ alpha: secret, latest: secret }), 'tags')).includes(secret))

let calls = 0
let sleeps = 0
const logs = []
const result = await verifyNpmReadback(version, {
  attempts: 3,
  run: async (_command, args, options) => {
    calls += 1
    assert.ok(args.includes('--prefer-online'))
    assert.ok(args.includes('--registry=https://registry.npmjs.org/'))
    assert.equal(options.timeoutMs, 20_000)
    if (calls <= 2) return args[2] === 'version' ? good(version) : good({ alpha: '0.1.0-alpha.4.33', latest: '0.1.0-alpha.4.30' })
    return args[2] === 'version' ? good(version) : good({ alpha: version, latest: '0.1.0-alpha.4.30' })
  },
  sleep: async ms => { assert.equal(ms, 10_000); sleeps += 1 },
  log: value => logs.push(value),
})
assert.equal(result.attempts, 2)
assert.equal(calls, 4)
assert.equal(sleeps, 1)
assert.equal(logs[0].matches, false)
assert.equal(logs[1].matches, true)
for (const response of [good('0.1.0-alpha.4.33'), { status: 1, stdout: secret, stderr: secret }, { status: 0, stdout: '{}' }]) {
  await assert.rejects(() => verifyNpmReadback(version, { attempts: 1, run: async () => response, log: () => {} }), /do not rerun publication/)
}
await assert.rejects(() => verifyNpmReadback('invalid', { run: async () => { throw new Error('must not execute') } }), /exact numeric Alpha/)
console.log('npm readback regressions: mismatch, recovery, bounded retries, failures, and diagnostic privacy passed')
