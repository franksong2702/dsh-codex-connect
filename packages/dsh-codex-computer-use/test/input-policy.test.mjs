import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { chromeInputDenial, navigationURL } from '../input-policy.mjs'
const cases = JSON.parse(await readFile(new URL('../../../host-patches/codex-cua-local.1/chrome-input-cases.json', import.meta.url)))
for (const [i, row] of cases.entries()) test(`Chrome input contract case ${i}`, () => {
  assert.equal(!chromeInputDenial({ appHandle: 'app', windowId: 7, ...row.params }), row.allowed)
})
test('text is bounded by Unicode scalars and navigation has a finite canonical size', () => {
  assert.equal(chromeInputDenial({ appHandle:'app',windowId:7,kind:'text',text:'界'.repeat(257) }), 'CUA_CHROME_TEXT_DENIED')
  assert.equal(navigationURL('https://example.test/' + 'x'.repeat(513)), undefined)
  assert.equal(navigationURL('HTTPS://EXAMPLE.TEST'), 'https://example.test/')
})
test('the Host admission embeds the identical worker input policy', async () => {
  const source = await readFile(new URL('../input-policy.mjs', import.meta.url), 'utf8')
  const patch = await readFile(new URL('../../../host-patches/codex-cua-local.1/patches/dsh-cua.patch', import.meta.url), 'utf8')
  const added = source.replace(/^export /gmu, '').trimEnd().split('\n').map(line => `+${line}`).join('\n')
  assert.ok(patch.includes(added), 'Native tool dispatch and worker must admit the same bounded input contract')
})
