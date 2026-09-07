import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { isAlphaReleaseVersion, validateReadmeInstallation, validateUpdateHighlights } from './release-metadata.mjs'

let cases = 0
function check(name, run) {
  try {
    run()
    cases += 1
  } catch (error) {
    throw new Error(`Release metadata regression: ${name}`, { cause: error })
  }
}

const workflow = readFileSync(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8')
const workflowPattern = workflow.match(/\[\[ ! "\$VERSION" =~ (.+) \]\]/u)?.[1]
assert.ok(workflowPattern, 'release workflow must declare its Alpha version check')
const workflowVersion = new RegExp(workflowPattern, 'u')
for (const [value, accepted] of [
  ['0.1.0-alpha.4.29', true], ['0.1.0-alpha.4.30', true], ['0.2.0-alpha.1', true],
  ['1.0.0-alpha.0', true], ['0.1.0-alpha.10', true],
  ['0.1.0-alpha.01', false], ['01.1.0-alpha.1', false], ['0.1.0-alpha.1.01', false],
  ['0.1.0-alpha.1+build.2', false], ['0.1.2-rc.1+build.0', false],
  ['0.1.0-beta.1', false], ['0.1.0-rc.1', false], ['0.1.0', false],
  ['alpha', false], ['latest', false], ['v0.1.0-alpha.1', false], ['0.1.0-alpha.1\n', false],
]) {
  check(`local and workflow format: ${JSON.stringify(value)}`, () => {
    assert.equal(isAlphaReleaseVersion(value), accepted)
    assert.equal(workflowVersion.exec(value)?.[0] === value, accepted)
  })
}

const entry = (version, highlights = []) => ({ version, highlights })
const highlights = releases => ({ schemaVersion: 1, releases })
check('highlight catalog can omit maintenance releases and retain empty historical entries', () => {
  assert.deepEqual(validateUpdateHighlights(highlights([
    entry('0.1.0-alpha.4.5', ['runtime-compatibility']), entry('0.1.0-alpha.4.29'),
  ]), '0.1.0-alpha.4.30'), [])
})
check('highlight catalog accepts a future independent sequence without deleting its history', () => {
  assert.deepEqual(validateUpdateHighlights(highlights([
    entry('0.1.0-alpha.4.29'), entry('0.2.0-alpha.1', ['multi-account']),
  ]), '0.2.0-alpha.1'), [])
})
check('empty highlights need no invented release entry', () => {
  assert.deepEqual(validateUpdateHighlights(highlights([]), '0.1.0-alpha.4.29'), [])
})
for (const [name, value] of [
  ['unsupported schema', { schemaVersion: 2, releases: [] }],
  ['missing catalog', null],
  ['oversized catalog', highlights(Array.from({ length: 257 }, () => entry('0.1.0-alpha.1')))],
  ['duplicate version', highlights([entry('0.1.0-alpha.4.29'), entry('0.1.0-alpha.4.29')])],
  ['lexical rather than numeric order', highlights([entry('0.1.0-alpha.4.10'), entry('0.1.0-alpha.4.9')])],
  ['release newer than candidate', highlights([entry('0.2.0-alpha.1')])],
  ['build metadata', highlights([entry('0.1.0-alpha.4.29+build.1')])],
  ['unsupported phase', highlights([entry('0.1.0-beta.1')])],
  ['unknown capability', highlights([entry('0.1.0-alpha.4.29', ['unknown'])])],
  ['duplicate capability', highlights([entry('0.1.0-alpha.4.29', ['multi-account', 'multi-account'])])],
  ['oversized capability list', highlights([entry('0.1.0-alpha.4.29', Array(33).fill('multi-account'))])],
]) {
  check(`reject ${name}`, () => assert.notEqual(validateUpdateHighlights(value, '0.1.0-alpha.4.29').length, 0))
}

const readmes = (version = '0.1.0-alpha.4.29', host = '0.1.2-rc.1') => [
  `# Codex Connect\n\n[Install](INSTALL.md)\n\nNew introduction, badges, and reordered sections.\n\n[中文](docs/README.zh.md)\n\nDSH \`${host}\`\n\ndsh plugin --profile web add dsh-codex-connect@${version}\n`,
  `# Codex Connect\n\n[English](../README.md) | 中文\n\n[安装](../INSTALL.md)\n\nDSH \`${host}\`\n\ndsh plugin --profile web add dsh-codex-connect@${version}\n`,
]
const compatibility = {
  schemaVersion: 1,
  checkedAt: '2026-09-07',
  latestDshVersion: '0.1.2-rc.1',
  pluginVersions: [{ version: '0.1.0-alpha.4.29', verifiedDshVersions: ['0.1.2-rc.1'] }],
}
check('README may keep the previous recommendation while a newer candidate is prepared', () => {
  assert.deepEqual(validateReadmeInstallation(readmes(), compatibility, '0.1.0-alpha.4.30'), [])
})
check('README prose and section order are not release invariants', () => {
  assert.deepEqual(validateReadmeInstallation(readmes(), compatibility, '0.1.0-alpha.4.29'), [])
})
for (const [name, docs, catalog, candidate] of [
  ['language mismatch', [readmes()[0], readmes('0.1.0-alpha.4.28')[1]], compatibility, '0.1.0-alpha.4.29'],
  ['moving tag', readmes('alpha'), compatibility, '0.1.0-alpha.4.29'],
  ['build counter', readmes('0.1.2-rc.1+build.0'), compatibility, '0.1.0-alpha.4.29'],
  ['unverified version', readmes('0.1.0-alpha.4.30'), compatibility, '0.1.0-alpha.4.30'],
  ['different host', readmes('0.1.0-alpha.4.29', '0.1.2-rc.2'), compatibility, '0.1.0-alpha.4.29'],
  ['missing language', [readmes()[0]], compatibility, '0.1.0-alpha.4.29'],
  ['missing installation link', readmes().map(text => text.replace(/\(\.\.\/INSTALL.md\)|\(INSTALL.md\)/gu, '')), compatibility, '0.1.0-alpha.4.29'],
  ['multiple install versions', readmes().map(text => text + '\ndsh plugin --profile web add dsh-codex-connect@0.1.0-alpha.4.28\n'), compatibility, '0.1.0-alpha.4.29'],
  ['recommendation newer than candidate', readmes(), compatibility, '0.1.0-alpha.4.28'],
  ['replacement JSON format', readmes(), { '0.1.0-alpha.4.29': { verified_with: ['0.1.2-rc.1'] } }, '0.1.0-alpha.4.29'],
  ['malformed host list', readmes(), { ...compatibility, pluginVersions: [{ version: '0.1.0-alpha.4.29', verifiedDshVersions: '0.1.2-rc.1' }] }, '0.1.0-alpha.4.29'],
]) {
  check(`reject ${name}`, () => assert.notEqual(validateReadmeInstallation(docs, catalog, candidate).length, 0))
}

process.stdout.write(`release metadata: ${cases} regression cases passed\n`)
