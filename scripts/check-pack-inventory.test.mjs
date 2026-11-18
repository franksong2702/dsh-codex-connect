import assert from 'node:assert/strict'
import { validateLibArtifactInventory } from './pack-lib-inventory.mjs'

// Synthetic pack-manifest paths only: no npm, build, filesystem, or live provider.
// Do not derive these from the implementation: this is the seven-file contract.
const stable = [
  'lib/bin.js',
  'lib/client.js',
  'lib/index.js',
  'lib/index.d.ts',
]
const chunks = [
  'lib/models-Ab12_-xy.js',
  'lib/openai-codex-responses-CD34-uvw.js',
  'lib/undici-runtime-Ef56_abc.js',
]
const clean = [...stable, ...chunks]
let passed = 0
function test(name, run) {
  run()
  passed += 1
  process.stdout.write(`ok ${passed} - ${name}\n`)
}
function rejectsWith(names, fragments) {
  assert.throws(() => validateLibArtifactInventory(names), error => {
    assert.match(error.message, /packed lib artifact inventory mismatch/u)
    for (const fragment of fragments) assert.ok(error.message.includes(fragment), error.message)
    return true
  })
}

test('clean seven-file inventory permits non-lib package files', () => {
  assert.equal(clean.length, 7)
  assert.doesNotThrow(() => validateLibArtifactInventory(['package.json', ...clean, 'docs/reference.md']))
})
test('changed hashes and hash lengths do not change the contract', () => {
  assert.doesNotThrow(() => validateLibArtifactInventory([
    ...stable,
    'lib/models-Z.js',
    'lib/openai-codex-responses-new_HASH-123456.js',
    'lib/undici-runtime-123_abc-XYZ.js',
  ]))
})
test('all seven Finder-style copies are reported', () => {
  const copies = clean.map(name => name.replace(/(\.[^.]+)$/u, ' 2$1'))
  assert.equal(copies.length, 7)
  rejectsWith([...clean, ...copies], ['unexpected lib artifacts', ...copies])
})
for (const chunk of chunks) {
  // Replace only this fixture's final hash; family names may contain hyphens.
  const stale = chunk.replace(/(?:Ab12_-xy|CD34-uvw|Ef56_abc)\.js$/u, 'oldHASH.js')
  test(`extra stale hash chunk is rejected: ${chunk}`, () => {
    assert.notEqual(stale, chunk)
    rejectsWith([...clean, stale], ['found 2', chunk, stale])
  })
  test(`missing chunk family is rejected: ${chunk}`, () => {
    rejectsWith(clean.filter(name => name !== chunk), ['found 0'])
  })
}
for (const entry of stable) {
  test(`missing stable entry is rejected: ${entry}`, () => {
    rejectsWith(clean.filter(name => name !== entry), [`expected exactly 1 ${entry}, found 0`])
  })
}
for (const extra of [
  'lib/nested/index.js',
  'lib/nested/models-abc.js',
  'lib/index.old.js',
  'lib/legacy.js',
  'lib/invariant.js',
  'lib/invariant.d.ts',
  'lib/new-legitimate-family-abc.js',
  'lib/models-abc.js.map',
  'lib/models-.js',
  'lib',
]) {
  test(`unexpected artifact is rejected: ${extra}`, () => {
    rejectsWith([...clean, extra], ['unexpected lib artifacts', extra])
  })
}
test('duplicate stable manifest entry is rejected', () => {
  rejectsWith([...clean, 'lib/index.js'], ['expected exactly 1 lib/index.js, found 2'])
})
test('duplicate chunk manifest entry is rejected', () => {
  rejectsWith([...clean, chunks[0]], ['found 2', chunks[0]])
})
test('empty lib inventory is rejected', () => {
  rejectsWith(['package.json'], [...stable, 'lib/models-<hash>.js', 'lib/openai-codex-responses-<hash>.js', 'lib/undici-runtime-<hash>.js'])
})
process.stdout.write(`passed ${passed} pack inventory fixture tests\n`)
