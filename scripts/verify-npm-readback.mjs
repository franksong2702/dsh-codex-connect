import { pathToFileURL } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import { runBoundedCommand } from './bounded-command.mjs'
import { isAlphaReleaseVersion } from './release-metadata.mjs'

export const RELEASE_PACKAGE = 'dsh-codex-connect'
export const NPM_READBACK_ATTEMPTS = 12
const SAFE_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u
const SAFE_ERROR_CODES = new Set(['E401', 'E403', 'E404', 'E429', 'E500', 'E502', 'E503', 'EAI_AGAIN', 'ECONNRESET', 'ENOTFOUND', 'ETIMEDOUT', 'ENOBUFS', 'ENOENT'])
const safeVersion = value => typeof value === 'string' && value.length <= 128 && SAFE_VERSION.test(value) ? value : null

/** Return only allowlisted diagnostics, never raw npm bodies, paths, or auth material. */
export function npmReadbackObservation(result, field) {
  let parsed
  try { parsed = JSON.parse(result.stdout ?? '') } catch {}
  const code = result.error?.code ?? parsed?.error?.code
  const errorCode = SAFE_ERROR_CODES.has(code) ? code : null
  const exitCode = Number.isInteger(result.status) ? result.status : null
  if (result.error || result.cleanupError || exitCode !== 0) {
    return { status: 'query-failed', exitCode, errorCode, value: null }
  }
  if (field === 'version') {
    const value = safeVersion(parsed)
    return { status: value === null ? 'invalid-response' : 'observed', exitCode, errorCode, value }
  }
  const value = { alpha: safeVersion(parsed?.alpha), latest: safeVersion(parsed?.latest) }
  return { status: value.alpha === null ? 'invalid-response' : 'observed', exitCode, errorCode, value }
}

/** Bound both npm's internal fetch and the whole child process; prefer fresh registry metadata. */
export async function verifyNpmReadback(version, dependencies = {}) {
  if (!isAlphaReleaseVersion(version)) throw new Error('Expected one exact numeric Alpha version')
  const run = dependencies.run ?? runBoundedCommand
  const sleep = dependencies.sleep ?? delay
  const log = dependencies.log ?? (value => console.log(JSON.stringify(value)))
  const attempts = dependencies.attempts ?? NPM_READBACK_ATTEMPTS
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > NPM_READBACK_ATTEMPTS) throw new Error('Invalid readback attempt budget')
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  const flags = ['--json', '--prefer-online', '--registry=https://registry.npmjs.org/', '--fetch-retries=0', '--fetch-timeout=12000']
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const [versionResult, tagsResult] = await Promise.all([
      run(npm, ['view', `${RELEASE_PACKAGE}@${version}`, 'version', ...flags], { timeoutMs: 20_000, maxBuffer: 64 * 1024 }),
      run(npm, ['view', RELEASE_PACKAGE, 'dist-tags', ...flags], { timeoutMs: 20_000, maxBuffer: 64 * 1024 }),
    ])
    const published = npmReadbackObservation(versionResult, 'version')
    const tags = npmReadbackObservation(tagsResult, 'tags')
    const matches = published.status === 'observed' && tags.status === 'observed'
      && published.value === version && tags.value.alpha === version
    log({ step: 'npm-readback', attempt, expected: version, published, tags, matches })
    if (matches) return { version, alpha: tags.value.alpha, latest: tags.value.latest, attempts: attempt }
    if (attempt < attempts) await sleep(10_000)
  }
  throw new Error('npm readback did not confirm the exact version and alpha tag. Inspect the safe observations; do not rerun publication. Use recovery-only verification after registry availability is confirmed.')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length > 3) throw new Error('Usage: verify-npm-readback [version]')
    const result = await verifyNpmReadback(process.argv[2] ?? process.env.VERSION)
    console.log(JSON.stringify({ status: 'verified', ...result }))
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'npm readback failed')
    process.exitCode = 1
  }
}
