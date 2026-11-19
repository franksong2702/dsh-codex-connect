import assert from 'node:assert/strict'
import { test } from 'node:test'
import { selectPromotion, applyVerifiedPromotion } from './promote-latest.mjs'
import { readFile } from 'node:fs/promises'

const old = '0.2.0-alpha.9'
const next = '0.2.0-alpha.10'
const higher = '0.2.0-alpha.11'
const host = '0.2.2-rc.4'
const evidenceRow = { version: next, commit: 'c'.repeat(40), sha256: 'a'.repeat(64) }
const catalog = { schemaVersion: 1, pluginVersions: [old, next, higher].map(version => ({ version, verifiedDshVersions: [host] })) }
const evidence = { schemaVersion: 1, releases: [evidenceRow] }
const data = (latest = old, alpha = next, versions = { [old]: {}, [next]: {} }) => ({ 'dist-tags': { latest, alpha }, versions })
const plan = selectPromotion(catalog, evidence, host, data())

test('numeric highest published compatible winner, not future/unpublished version', () => {
  assert.equal(plan.target, next)
  assert.equal(plan.sha256, evidenceRow.sha256)
  assert.throws(() => selectPromotion(catalog, evidence, '0.2.2-rc.9', data()), /No published compatibility pair/)
})
test('matching latest is a no-op; never downgrade or accept unverifiable higher versions', () => {
  assert.equal(selectPromotion(catalog, evidence, host, data(next)).noop, true)
  assert.throws(() => selectPromotion(catalog, evidence, host, data(higher, higher, { [higher]: { deprecated: 'not eligible' }, [next]: {} })), /downgrade/)
  assert.throws(() => selectPromotion(catalog, evidence, host, data(old, higher, { [old]: {}, [next]: {}, [higher]: {} })), /release evidence/)
  assert.throws(() => selectPromotion(catalog, evidence, host, data('1.0.0')), /incomplete/)
})
test('missing, duplicate and malformed evidence are fail-closed', () => {
  for (const rows of [[], [evidenceRow, evidenceRow], [{ ...evidenceRow, commit: 'main' }]]) {
    assert.throws(() => selectPromotion(catalog, { schemaVersion: 1, releases: rows }, host, data()), /release evidence/)
  }
})

test('plan changes between jobs never write', async () => {
  for (const field of ['host', 'alpha', 'latest', 'target', 'commit', 'sha256']) {
    await assert.rejects(applyVerifiedPromotion(plan, { readPlan: async () => ({ ...plan, [field]: 'changed' }),
      write: () => assert.fail('stale plans cannot write') }), /Promotion inputs moved/)
  }
})
test('ambiguous mutation that did commit is confirmed once and never retried', async () => {
  let written = 0, read = 0
  const result = await applyVerifiedPromotion(plan, {
    readPlan: async () => plan,
    write: async () => { written++; throw new Error('lost response') },
    read: async () => ({ host, alpha: next, latest: read++ === 0 ? old : next }),
    sleep: async () => {},
  })
  assert.equal(written, 1)
  assert.equal(result.target, next)
})
test('conflicts and indefinite readback never issue a second write', async () => {
  for (const [readback, error] of [
    [{ host, alpha: next, latest: higher }, /Another publisher/],
    [{ host, alpha: higher, latest: next }, /external/],
    [{ host, alpha: next, latest: old }, /Could not confirm/],
  ]) {
    let writes = 0
    await assert.rejects(applyVerifiedPromotion(plan, {
      readPlan: async () => plan, write: async () => { writes++; return { status: 1 } },
      read: async () => readback, sleep: async () => {}, attempts: 2,
    }), error)
    assert.equal(writes, 1)
  }
})
test('default-off workflow isolates OIDC from compatibility execution and preserves alpha gate', async () => {
  const text = await readFile(new URL('../.github/workflows/promote-latest.yml', import.meta.url), 'utf8')
  const [verify, write] = text.split('\n  promote:')
  assert.match(verify, /default: false/)
  assert.doesNotMatch(verify, /id-token|environment:/)
  assert.match(write, /environment: npm-latest/)
  assert.match(write, /id-token: write/)
  assert.match(write, /vars.LATEST_PROMOTION_ENABLED == 'true'/)
  assert.doesNotMatch(write, /pnpm|check-dsh-install|npm publish/)
  const alpha = await readFile(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8')
  assert.match(alpha, /environment: npm-release/)
})

test('published Alpha16 evidence is limited to stock rc.5 and does not move existing latest by itself', async () => {
  const read = async name => JSON.parse(await readFile(new URL('../' + name, import.meta.url), 'utf8'))
  const [compat, proof] = await Promise.all([read('verified-compatibility.json'), read('latest-release-evidence.json')])
  const version = '0.2.0-alpha.16'
  const previous = '0.2.0-alpha.15'
  assert.deepEqual(compat.pluginVersions.find(row => row.version === version)?.verifiedDshVersions, ['0.2.2-rc.5'])
  const published = data(previous, version, { [previous]: {}, [version]: {} })
  assert.equal(selectPromotion(compat, proof, '0.2.2-rc.1', published).target, previous)
  const rc5 = selectPromotion(compat, proof, '0.2.2-rc.5', published)
  assert.equal(rc5.target, version)
  assert.equal(rc5.commit, 'ada191aa960b80a1c26472d37a64438c66173e07')
  assert.equal(rc5.sha256, 'fef8fd07a1e83d6ea01591788c99d618ebf6a9024159f96cd02c666b1f18f43c')
})
