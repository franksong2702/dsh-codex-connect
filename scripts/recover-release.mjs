import { createHash } from 'node:crypto'
import { mkdtemp, readFile, readdir, lstat, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { runBoundedCommand } from './bounded-command.mjs'
import { assertReleaseCI } from './verify-release-ci.mjs'
import { isAlphaReleaseVersion } from './release-metadata.mjs'

export const RECOVERY_REPOSITORY = 'franksong2702/dsh-codex-connect'
const PACKAGE = 'dsh-codex-connect'
const SHA = /^[a-f0-9]{40}$/u
const MAX_ARCHIVE = 8 * 1024 * 1024
const digest = (bytes, algorithm) => createHash(algorithm).update(bytes).digest('hex')

/** A failed readback is recoverable only after the original publish step really succeeded. */
export function assertRecoveryRun(run, jobs) {
  if (run?.repository?.full_name !== RECOVERY_REPOSITORY || run.head_repository?.full_name !== RECOVERY_REPOSITORY
    || run.path !== '.github/workflows/release.yml' || run.head_branch !== 'main'
    || run.event !== 'workflow_dispatch' || run.status !== 'completed' || !SHA.test(run.head_sha ?? '')
    || !Array.isArray(jobs) || jobs.filter(job => job.name === 'verify').length !== 1
    || jobs.filter(job => job.name === 'publish').length !== 1) throw new Error('Original release identity or jobs are not verifiable')
  const verify = jobs.find(job => job.name === 'verify')
  const publish = jobs.find(job => job.name === 'publish')
  if (verify.status !== 'completed' || verify.conclusion !== 'success' || publish.status !== 'completed') throw new Error('Original release verification did not complete successfully')
  for (const name of ['Recheck exact SHA CI after environment approval', 'Verify package digest', 'Publish alpha through npm Trusted Publishing']) {
    const matches = publish.steps?.filter(step => step.name === name) ?? []
    if (matches.length !== 1 || matches[0].status !== 'completed' || matches[0].conclusion !== 'success') throw new Error('Original authorized publication is not proven; do not republish')
  }
}

export function selectRecoveryArtifact(list, run) {
  if (list?.total_count !== list?.artifacts?.length) throw new Error('Incomplete original artifact listing')
  const matches = list.artifacts.filter(artifact => artifact.name === `verified-package-${run.head_sha}`)
  if (matches.length !== 1) throw new Error('Expected exactly one original verified artifact')
  const artifact = matches[0]
  if (artifact.expired !== false || !Number.isSafeInteger(artifact.id) || artifact.id < 1
    || !Number.isSafeInteger(artifact.size_in_bytes) || artifact.size_in_bytes < 1 || artifact.size_in_bytes > MAX_ARCHIVE
    || artifact.workflow_run?.id !== run.id || artifact.workflow_run?.head_sha !== run.head_sha) {
    throw new Error('Original verified artifact is expired, oversized, or belongs to another run')
  }
  return artifact
}

/** Read only the bounded manifest from tar bytes; never extract or execute package files. */
export function packedManifest(archive) {
  if (!Buffer.isBuffer(archive) || archive.length > MAX_ARCHIVE) throw new Error('Package archive exceeds the recovery bound')
  const tar = gunzipSync(archive, { maxOutputLength: 32 * 1024 * 1024 })
  let manifest
  for (let offset = 0; offset + 512 <= tar.length;) {
    const header = tar.subarray(offset, offset + 512)
    if (header.every(byte => byte === 0)) break
    const text = (start, end) => header.subarray(start, end).toString('utf8').replace(/\0.*$/su, '')
    const name = text(0, 100)
    const prefix = text(345, 500)
    const sizeText = text(124, 136).trim()
    if (!/^[0-7]+$/u.test(sizeText)) throw new Error('Invalid tar entry size')
    const size = Number.parseInt(sizeText, 8)
    if (!Number.isSafeInteger(size) || offset + 512 + size > tar.length) throw new Error('Truncated package archive')
    if ((prefix ? `${prefix}/${name}` : name) === 'package/package.json') {
      if (manifest !== undefined || size > 64 * 1024 || ![0, 48].includes(header[156])) throw new Error('Ambiguous package manifest')
      manifest = JSON.parse(tar.subarray(offset + 512, offset + 512 + size).toString('utf8'))
    }
    offset += 512 + Math.ceil(size / 512) * 512
  }
  if (manifest === undefined) throw new Error('Package manifest is missing')
  return manifest
}

export function assertPublishedArtifact(version, metadata, originalBytes, npmBytes) {
  const expectedUrl = `https://registry.npmjs.org/${PACKAGE}/-/${PACKAGE}-${version}.tgz`
  if (metadata?.name !== PACKAGE || metadata.version !== version || metadata.dist?.tarball !== expectedUrl) throw new Error('npm metadata does not identify the exact published package')
  if (digest(originalBytes, 'sha256') !== digest(npmBytes, 'sha256')) throw new Error('npm bytes differ from the original verified artifact')
  const integrity = `sha512-${createHash('sha512').update(npmBytes).digest('base64')}`
  if (metadata.dist.integrity !== integrity || metadata.dist.shasum !== digest(npmBytes, 'sha1')) throw new Error('npm integrity verification failed')
  const manifest = packedManifest(npmBytes)
  if (manifest.name !== PACKAGE || manifest.version !== version) throw new Error('Packed manifest does not match the recovery target')
  return digest(npmBytes, 'sha256')
}

async function resolveTag(io, tag) {
  let object = (await io.github(`git/ref/tags/${tag}`, 'GET', undefined, true))?.object
  for (let depth = 0; object !== undefined && depth < 5; depth += 1) {
    if (!SHA.test(object.sha ?? '')) throw new Error('Invalid tag object')
    if (object.type === 'commit') return object.sha
    if (object.type !== 'tag') throw new Error('Tag does not identify a commit')
    object = (await io.github(`git/tags/${object.sha}`)).object
  }
  if (object !== undefined) throw new Error('Tag indirection exceeds the recovery bound')
  return undefined
}

/** Default is read-only. Apply can only create missing refs/releases, never overwrite them. */
export async function recoverRelease({ version, runId, apply = false, confirmation }, io = recoveryIO()) {
  if (!isAlphaReleaseVersion(version) || !/^[1-9]\d{0,15}$/u.test(String(runId))) throw new Error('Expected an exact Alpha version and numeric original run ID')
  if (apply && confirmation !== 'RECOVER') throw new Error('Apply requires exact RECOVER confirmation')
  const run = await io.github(`actions/runs/${runId}`)
  if (String(run.id) !== String(runId) || !Number.isSafeInteger(run.run_attempt) || run.run_attempt < 1) throw new Error('Original run ID or attempt mismatch')
  const jobs = await io.github(`actions/runs/${runId}/attempts/${run.run_attempt}/jobs?per_page=100`)
  if (jobs.total_count !== jobs.jobs?.length) throw new Error('Incomplete original job listing')
  assertRecoveryRun(run, jobs.jobs)
  const sha = run.head_sha
  const ancestry = await io.github(`compare/${sha}...main`)
  if (!['ahead', 'identical'].includes(ancestry.status)) throw new Error('Original release SHA is not on main')
  const ci = (await io.github(`actions/workflows/ci.yml/runs?head_sha=${sha}&branch=main&per_page=100`)).workflow_runs?.[0]
  if (!ci) throw new Error('Original main CI is missing')
  const ciJobs = await io.github(`actions/runs/${ci.id}/attempts/${ci.run_attempt}/jobs?per_page=100`)
  if (ciJobs.total_count !== ciJobs.jobs?.length) throw new Error('Incomplete original CI job listing')
  assertReleaseCI(ci, ciJobs.jobs, sha, RECOVERY_REPOSITORY)
  const artifact = selectRecoveryArtifact(await io.github(`actions/runs/${runId}/artifacts?per_page=100`), run)
  const originalBytes = await io.artifact(runId, artifact.name)
  const metadata = await io.npmMetadata(version)
  const expectedUrl = `https://registry.npmjs.org/${PACKAGE}/-/${PACKAGE}-${version}.tgz`
  if (metadata.dist?.tarball !== expectedUrl) throw new Error('Unexpected npm tarball origin or path')
  const sha256 = assertPublishedArtifact(version, metadata, originalBytes, await io.tarball(expectedUrl))
  const tag = `v${version}`
  const tagSha = await resolveTag(io, tag)
  if (tagSha !== undefined && tagSha !== sha) throw new Error('Existing tag points elsewhere; refusing to move it')
  const release = await io.github(`releases/tags/${tag}`, 'GET', undefined, true)
  const result = { version, runId: String(runId), sha, sha256, npmRepublished: false, tagsPromoted: false }
  if (release) {
    if (tagSha !== sha || release.tag_name !== tag || release.draft !== false || release.prerelease !== true) throw new Error('Existing release conflicts with the recovery target')
    return { status: 'already-complete', ...result, releaseId: release.id }
  }
  if (!apply) return { status: 'verified-recovery-needed', ...result }
  if (tagSha === undefined) await io.github('git/refs', 'POST', { ref: `refs/tags/${tag}`, sha })
  if (await resolveTag(io, tag) !== sha) throw new Error('Tag changed before release creation')
  await io.github('releases', 'POST', { tag_name: tag, target_commitish: sha, name: tag, prerelease: true, draft: false, generate_release_notes: true, make_latest: 'false' })
  const created = await io.github(`releases/tags/${tag}`)
  if (await resolveTag(io, tag) !== sha || created.tag_name !== tag || created.draft !== false || created.prerelease !== true) throw new Error('Release creation readback mismatch; inspect before retrying')
  return { status: 'recovered', ...result, releaseId: created.id }
}

async function fetchBytes(url, maxBytes) {
  const response = await fetch(url, { redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(30_000) })
  if (!response.ok) throw new Error(`npm registry request failed with HTTP ${response.status}`)
  let size = 0
  const chunks = []
  for await (const chunk of response.body) {
    size += chunk.length
    if (size > maxBytes) throw new Error('npm response exceeds the recovery bound')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

function recoveryIO() {
  const command = async args => {
    const result = await runBoundedCommand('gh', args, { timeoutMs: 60_000, maxBuffer: 2 * 1024 * 1024 })
    if (result.error || result.cleanupError) throw new Error('Bounded GitHub command failed')
    return result
  }
  return {
    async github(path, method = 'GET', payload, allowMissing = false) {
      const args = ['api', '--include', '--method', method, `repos/${RECOVERY_REPOSITORY}/${path}`]
      for (const [key, value] of Object.entries(payload ?? {})) args.push(typeof value === 'boolean' ? '--field' : '--raw-field', `${key}=${value}`)
      const result = await command(args)
      const status = Number(result.stdout.match(/^HTTP\/\S+ (\d{3})/mu)?.[1])
      if (allowMissing && status === 404) return undefined
      if (result.status !== 0 || status < 200 || status >= 300 || !Number.isFinite(status)) throw new Error(`GitHub API request failed with status ${Number.isFinite(status) ? status : 'unknown'}`)
      const split = result.stdout.search(/\r?\n\r?\n/u)
      if (split < 0) throw new Error('GitHub API response has no JSON body')
      return JSON.parse(result.stdout.slice(split).trim())
    },
    async artifact(runId, name) {
      const root = await mkdtemp(join(tmpdir(), 'codex-connect-release-recovery-'))
      try {
        const result = await command(['run', 'download', String(runId), '--repo', RECOVERY_REPOSITORY, '--name', name, '--dir', root])
        if (result.status !== 0) throw new Error('Original verified artifact download failed; no recovery was attempted')
        const entries = await readdir(root)
        const path = join(root, 'release.tgz')
        const stat = await lstat(path)
        if (entries.length !== 1 || entries[0] !== 'release.tgz' || !stat.isFile() || stat.size > MAX_ARCHIVE) throw new Error('Unexpected verified artifact contents')
        return await readFile(path)
      } finally { await rm(root, { recursive: true, force: true }) }
    },
    async npmMetadata(version) { return JSON.parse((await fetchBytes(`https://registry.npmjs.org/${PACKAGE}/${version}`, 512 * 1024)).toString('utf8')) },
    async tarball(url) { return fetchBytes(url, MAX_ARCHIVE) },
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = process.argv.slice(2)
    const apply = args.at(-1) === '--apply'
    if (apply) args.pop()
    if (args.length !== 4 || args[0] !== '--version' || args[2] !== '--run-id') throw new Error('Usage: recover-release --version <alpha> --run-id <original-id> [--apply]')
    if (process.env.GITHUB_ACTIONS === 'true' && (process.env.GITHUB_REF !== 'refs/heads/main' || process.env.GITHUB_REPOSITORY !== RECOVERY_REPOSITORY)) throw new Error('Recovery workflow must run on the repository main branch')
    const result = await recoverRelease({ version: args[1], runId: args[3], apply, confirmation: process.env.CONFIRM })
    console.log(JSON.stringify(result))
  } catch (error) {
    // Do not emit captured remote bodies, credential-bearing URLs, or filesystem paths.
    const message = error instanceof SyntaxError ? 'Invalid structured recovery response' : error instanceof Error ? error.message : 'Recovery failed'
    console.error(/https?:|[/\\\\]|Bearer\s/iu.test(message) ? 'Recovery failed while reading external evidence; raw diagnostics withheld' : message.slice(0, 240))
    process.exitCode = 1
  }
}
