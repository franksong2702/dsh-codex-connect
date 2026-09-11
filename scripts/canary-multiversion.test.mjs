import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { classifyCandidateVersion, declaredDshVersions, runCanary } from './check-dsh-next.mjs'
import { buildCanaryTrackingIssue } from './canary-tracking.mjs'

const compatibility = JSON.parse(await readFile(new URL('../compatibility.json', import.meta.url), 'utf8'))
const versions = declaredDshVersions(compatibility)
const baseline = compatibility.dshPluginApi.version
const metadata = { runUrl: 'https://github.com/franksong2702/dsh-codex-connect/actions/runs/123', pluginCommit: 'a'.repeat(40) }
assert.deepEqual(declaredDshVersions({ dshPluginApi: { version: baseline } }), [baseline])
for (const bad of [null, [], [baseline, baseline], ['invalid'], ['0.1.9'], [baseline, null]]) {
  assert.throws(() => declaredDshVersions({ dshPluginApi: { version: baseline, versions: bad } }))
}
assert.throws(() => declaredDshVersions({ dshPluginApi: { version: null, versions } }))
for (const version of versions) assert.equal(classifyCandidateVersion(version, baseline, versions), 'declared')
// Holes and future versions never inherit support from a later declared version.
for (const version of ['0.1.5-alpha.2', '0.1.5-rc.3', '0.1.6', '9.9.9']) {
  assert.equal(classifyCandidateVersion(version, baseline, versions), 'newer')
}
assert.equal(classifyCandidateVersion('0.1.1-rc.2', baseline, versions), 'not-newer')

const root = await mkdtemp(join(tmpdir(), 'canary-multiversion-'))
let fixtureRuns = 0
try {
  async function fixture(version, exitCode = 0, dedupeAgainst = []) {
    const index = ++fixtureRuns
    const observedPath = join(root, `observed-${index}.json`)
    const childPath = join(root, `child-${index}.mjs`)
    const outputPath = join(root, `report-${index}.json`)
    await writeFile(childPath, `import { writeFileSync } from 'node:fs';\nwriteFileSync(${JSON.stringify(observedPath)}, JSON.stringify({version: process.env.DSH_VERSION, undeclared: process.env.DSH_UNDECLARED_CANARY_VERSION ?? null}));\nprocess.exitCode = ${exitCode};\n`)
    const status = await runCanary({
      channel: 'next', dedupeAgainst, outputPath,
      resolvedDistTags: { latest: version, next: version, alpha: baseline },
    }, { candidateCheckPath: childPath })
    const report = JSON.parse(await readFile(outputPath, 'utf8'))
    let child
    try { child = JSON.parse(await readFile(observedPath, 'utf8')) } catch (error) { if (error.code !== 'ENOENT') throw error }
    assert.deepEqual(report.supportedVersions, versions)
    assert.equal(report.acceptanceScope, 'not-assessed')
    return { status, report, child }
  }

  // Exercise the real child path, not only the pure classification helper.
  const previous = process.env.DSH_UNDECLARED_CANARY_VERSION
  process.env.DSH_UNDECLARED_CANARY_VERSION = '1'
  try {
    for (const version of versions) {
      const result = await fixture(version)
      assert.equal(result.status, 0)
      assert.equal(result.report.classification, 'declared-compatible')
      assert.equal(result.report.declaredSupport, true)
      assert.equal(result.report.stage, 'isolated-install')
      assert.deepEqual(result.child, { version, undeclared: null })
      assert.equal(buildCanaryTrackingIssue(result.report, undefined, metadata), undefined)
    }
  } finally {
    if (previous === undefined) delete process.env.DSH_UNDECLARED_CANARY_VERSION
    else process.env.DSH_UNDECLARED_CANARY_VERSION = previous
  }
  const hole = await fixture('0.1.5-alpha.2')
  assert.equal(hole.report.classification, 'candidate-compatible')
  assert.equal(hole.report.declaredSupport, false)
  assert.deepEqual(hole.child, { version: '0.1.5-alpha.2', undeclared: '1' })
  const tracker = buildCanaryTrackingIssue(hole.report, undefined, metadata)
  assert.equal(tracker.state, 'passed-needs-full-validation')
  assert.ok(tracker.body.includes('`0.1.5-rc.2`'))
  assert.ok(tracker.body.includes('Full user acceptance: not assessed'))

  for (const result of [await fixture('0.1.1-rc.2'), await fixture(versions.at(-1), 0, ['latest'])]) {
    assert.equal(result.status, 0)
    assert.equal(result.child, undefined)
    assert.equal(buildCanaryTrackingIssue(result.report, undefined, metadata), undefined)
  }
  const failed = await fixture(versions.at(-1), 1)
  const repeated = await fixture(versions.at(-1), 1)
  assert.equal(failed.status, 1)
  const regression = buildCanaryTrackingIssue(failed.report, repeated.report, metadata)
  assert.equal(regression.state, 'declared-regression')
  assert.equal(regression.label, 'bug')
  assert.equal(regression.marker, `<!-- dsh-canary-regression:${versions.at(-1)} -->`)
  assert.notEqual(regression.marker, `<!-- dsh-canary:${versions.at(-1)} -->`)
  assert.ok(regression.title.includes('regression on declared'))
  const infrastructure = await fixture(versions.at(-1), 2)
  assert.equal(infrastructure.status, 2)
  assert.equal(buildCanaryTrackingIssue(failed.report, infrastructure.report, metadata).state, 'infrastructure-blocked')
  const recovered = await fixture(versions.at(-1))
  assert.equal(buildCanaryTrackingIssue(failed.report, recovered.report, metadata), undefined)
  console.log(`canary multi-version regression: ${fixtureRuns} child-routing scenarios passed`)
} finally {
  await rm(root, { recursive: true, force: true })
}
