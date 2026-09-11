import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import { assertRecoveryRun, packedManifest, recoverRelease, RECOVERY_REPOSITORY } from './recover-release.mjs'

const version = '0.1.0-alpha.4.34'
const sha = 'a'.repeat(40)
const packageName = 'dsh-codex-connect'
const manifest = Buffer.from(JSON.stringify({ name: packageName, version }))
const header = Buffer.alloc(512)
header.write('package/package.json')
header.write(manifest.length.toString(8).padStart(11, '0') + '\0', 124)
header[156] = 48
const tar = Buffer.concat([header, manifest, Buffer.alloc((512 - manifest.length % 512) % 512), Buffer.alloc(1024)])
const archive = gzipSync(tar)
assert.deepEqual(packedManifest(archive), { name: packageName, version })
assert.throws(() => packedManifest(gzipSync(Buffer.alloc(1024))), /missing/)
const npm = {
  name: packageName, version,
  dist: {
    tarball: `https://registry.npmjs.org/${packageName}/-/${packageName}-${version}.tgz`,
    integrity: `sha512-${createHash('sha512').update(archive).digest('base64')}`,
    shasum: createHash('sha1').update(archive).digest('hex'),
  },
}
const original = {
  id: 123, run_attempt: 1, head_sha: sha, head_branch: 'main',
  repository: { full_name: RECOVERY_REPOSITORY }, head_repository: { full_name: RECOVERY_REPOSITORY },
  path: '.github/workflows/release.yml', event: 'workflow_dispatch', status: 'completed', conclusion: 'failure',
}
const jobs = [
  { name: 'verify', status: 'completed', conclusion: 'success' },
  { name: 'publish', status: 'completed', conclusion: 'failure', steps: ['Recheck exact SHA CI after environment approval', 'Verify package digest', 'Publish alpha through npm Trusted Publishing'].map(name => ({ name, status: 'completed', conclusion: 'success' })) },
]
assert.doesNotThrow(() => assertRecoveryRun(original, jobs))
for (const change of [{ event: 'pull_request' }, { head_branch: 'other' }, { status: 'in_progress' }, { head_sha: 'invalid' }, { head_repository: { full_name: 'other/repo' } }]) {
  assert.throws(() => assertRecoveryRun({ ...original, ...change }, jobs))
}
const failedPublish = structuredClone(jobs)
failedPublish[1].steps[2].conclusion = 'failure'
assert.throws(() => assertRecoveryRun(original, failedPublish), /not proven/)

function fixture(options = {}) {
  const state = { tagSha: options.tagSha, release: options.release, writes: [] }
  const ci = { ...original, id: 321, path: '.github/workflows/ci.yml', event: 'push', conclusion: 'success' }
  const ciJobs = ['validate (22.19.0)', 'validate (24.x)', 'browser-ui-regression', 'windows-canary-contract'].map(name => ({ name, status: 'completed', conclusion: 'success' }))
  const artifact = { id: 42, name: `verified-package-${sha}`, size_in_bytes: archive.length, expired: false, workflow_run: { id: 123, head_sha: sha }, ...options.artifact }
  return { state, io: {
    async github(path, method = 'GET', payload) {
      if (method === 'POST') {
        state.writes.push({ path, payload })
        if (path === 'git/refs') state.tagSha = payload.sha
        else if (path === 'releases') state.release = { id: 456, tag_name: payload.tag_name, draft: false, prerelease: true }
        else throw new Error('Unexpected write')
        return {}
      }
      if (path === 'actions/runs/123') return { ...original, ...options.run }
      if (path === 'actions/runs/123/attempts/1/jobs?per_page=100') return { total_count: jobs.length, jobs: options.jobs ?? jobs }
      if (path === `compare/${sha}...main`) return { status: options.ancestry ?? 'ahead' }
      if (path.startsWith('actions/workflows/ci.yml/runs?')) return { workflow_runs: [ci] }
      if (path === 'actions/runs/321/attempts/1/jobs?per_page=100') return { total_count: ciJobs.length, jobs: options.ciJobs ?? ciJobs }
      if (path === 'actions/runs/123/artifacts?per_page=100') return { total_count: 1, artifacts: [artifact] }
      if (path === `git/ref/tags/v${version}`) return state.tagSha ? { object: { type: 'commit', sha: state.tagSha } } : undefined
      if (path === `releases/tags/v${version}`) return state.release
      throw new Error('Unexpected fixture API path')
    },
    async artifact() { return options.originalBytes ?? archive },
    async npmMetadata() { return options.npm ?? npm },
    async tarball() { return archive },
  } }
}
const dry = fixture()
assert.equal((await recoverRelease({ version, runId: 123 }, dry.io)).status, 'verified-recovery-needed')
assert.equal(dry.state.writes.length, 0)
const apply = fixture()
assert.equal((await recoverRelease({ version, runId: 123, apply: true, confirmation: 'RECOVER' }, apply.io)).status, 'recovered')
assert.deepEqual(apply.state.writes.map(write => write.path), ['git/refs', 'releases'])
assert.equal((await recoverRelease({ version, runId: 123, apply: true, confirmation: 'RECOVER' }, apply.io)).status, 'already-complete')
assert.equal(apply.state.writes.length, 2)
for (const options of [
  { tagSha: 'b'.repeat(40) }, { artifact: { expired: true } }, { artifact: { workflow_run: { id: 999, head_sha: sha } } },
  { originalBytes: Buffer.from('different bytes') }, { npm: { ...npm, dist: { ...npm.dist, integrity: 'invalid' } } },
  { npm: { ...npm, dist: { ...npm.dist, tarball: 'https://untrusted.invalid/package.tgz' } } },
  { ancestry: 'diverged' }, { jobs: failedPublish }, { ciJobs: [] },
  { tagSha: sha, release: { tag_name: `v${version}`, draft: true, prerelease: true } },
]) {
  const invalid = fixture(options)
  await assert.rejects(() => recoverRelease({ version, runId: 123, apply: true, confirmation: 'RECOVER' }, invalid.io))
  assert.equal(invalid.state.writes.length, 0)
}
await assert.rejects(() => recoverRelease({ version, runId: 123, apply: true }, fixture().io), /RECOVER/)
await assert.rejects(() => recoverRelease({ version: 'latest', runId: 123 }, fixture().io), /exact Alpha/)
await assert.rejects(() => recoverRelease({ version, runId: '../123' }, fixture().io), /numeric original/)
console.log('release recovery regressions: provenance, exact CI, integrity, expiry, conflicts, read-only default, confirmation, and idempotence passed')
