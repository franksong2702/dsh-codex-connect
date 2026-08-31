#!/usr/bin/env node

import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { scrubCanaryEnvironment } from './canary-environment.mjs'
import { runBoundedCommand } from './bounded-command.mjs'

const JSON_SCHEMA_VERSION = 1
const PACKAGE_NAME = '@deepseek-ai/dsh'
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const COMPATIBILITY_FILE = resolve(REPO_ROOT, 'compatibility.json')
const INSTALL_CHECK = resolve(REPO_ROOT, 'scripts/check-dsh-install.mjs')
const MAX_SUMMARY_LENGTH = 1600
const REGISTRY_TIMEOUT_MS = 60 * 1000
const CANDIDATE_CHECK_TIMEOUT_MS = 25 * 60 * 1000
const DIST_TAG_NAMES = ['latest', 'next', 'alpha']
const CHANNELS = new Set(DIST_TAG_NAMES)

function commandName(name) {
  return process.platform === 'win32' && name === 'npm' ? `${name}.cmd` : name
}

async function runCommand(command, args, options = {}) {
  const result = await runBoundedCommand(commandName(command), args, {
    cwd: REPO_ROOT,
    env: options.env ?? process.env,
    timeoutMs: options.timeoutMs,
  })
  if (result.error !== undefined) {
    const cleanupDetail = result.cleanupError === undefined ? '' : `; process-tree cleanup failed: ${result.cleanupError.message}`
    return {
      status: 2,
      stdout: '',
      stderr: `${command} failed: ${result.error.message}${cleanupDetail}`,
    }
  }
  return {
    status: result.status ?? 2,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  }
}

function parseSemanticVersion(value) {
  const match = value.match(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?$/u)
  if (match === null) return undefined
  const prerelease = match[4]?.split('.')
  const build = match[5]?.split('.')
  if (prerelease?.some(identifier => identifier === '' || (/^\d+$/u.test(identifier) && identifier.length > 1 && identifier.startsWith('0'))) === true) return undefined
  if (build?.some(identifier => identifier === '') === true) return undefined
  return {
    core: [BigInt(match[1]), BigInt(match[2]), BigInt(match[3])],
    prerelease,
  }
}

function compareSemanticVersions(left, right) {
  const leftVersion = parseSemanticVersion(left)
  const rightVersion = parseSemanticVersion(right)
  if (leftVersion === undefined || rightVersion === undefined) {
    throw new Error('cannot compare invalid DSH semantic versions')
  }
  for (let index = 0; index < leftVersion.core.length; index += 1) {
    if (leftVersion.core[index] > rightVersion.core[index]) return 1
    if (leftVersion.core[index] < rightVersion.core[index]) return -1
  }
  if (leftVersion.prerelease === undefined) return rightVersion.prerelease === undefined ? 0 : 1
  if (rightVersion.prerelease === undefined) return -1
  const identifierCount = Math.max(leftVersion.prerelease.length, rightVersion.prerelease.length)
  for (let index = 0; index < identifierCount; index += 1) {
    const leftIdentifier = leftVersion.prerelease[index]
    const rightIdentifier = rightVersion.prerelease[index]
    if (leftIdentifier === undefined) return -1
    if (rightIdentifier === undefined) return 1
    if (leftIdentifier === rightIdentifier) continue
    const leftNumeric = /^\d+$/u.test(leftIdentifier)
    const rightNumeric = /^\d+$/u.test(rightIdentifier)
    if (leftNumeric && rightNumeric) return BigInt(leftIdentifier) > BigInt(rightIdentifier) ? 1 : -1
    if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1
    return leftIdentifier > rightIdentifier ? 1 : -1
  }
  return 0
}

export function parseRegistryVersion(output) {
  let value
  try {
    value = JSON.parse(output.trim())
  } catch {
    value = output.trim()
  }
  if (typeof value !== 'string' || parseSemanticVersion(value) === undefined) {
    throw new Error('npm returned an invalid DSH next version')
  }
  return value
}

export function parseRegistryDistTags(output) {
  let value
  try {
    value = JSON.parse(output.trim())
  } catch {
    throw new Error('npm returned invalid DSH dist-tags JSON')
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('npm returned invalid DSH dist-tags JSON')
  }
  const distTags = {}
  for (const name of DIST_TAG_NAMES) {
    if (typeof value[name] !== 'string') {
      throw new Error('npm returned incomplete DSH dist-tags JSON')
    }
    distTags[name] = parseRegistryVersion(value[name])
  }
  return distTags
}

export function sanitizeSummary(value) {
  const lines = value.trim().split(/\r?\n/u).slice(-12).join('\n')
  return lines
    .replaceAll(REPO_ROOT, '<repository>')
    .replaceAll(tmpdir(), '<temporary-directory>')
    .replace(/\/(?:Users|home)\/[^\s:'"]+/gu, '<local-path>')
    .replace(/[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/gu, '<redacted-token>')
    .slice(0, MAX_SUMMARY_LENGTH)
}

export function confirmedCompatibilityFailure(first, second) {
  return first?.status === 'fail'
    && second?.status === 'fail'
    && first.classification === 'compatibility'
    && second.classification === 'compatibility'
    && typeof first.channel === 'string'
    && first.channel === second.channel
    && typeof first.candidateVersion === 'string'
    && first.candidateVersion === second.candidateVersion
}

export function duplicateCandidateOwner(channel, dedupeAgainst, distTags) {
  return dedupeAgainst.find(owner => distTags[channel] === distTags[owner])
}

export function classifyCandidateVersion(candidateVersion, supportedVersion) {
  if (candidateVersion === supportedVersion) return 'unchanged'
  return compareSemanticVersions(candidateVersion, supportedVersion) > 0 ? 'newer' : 'not-newer'
}

export function classifyCandidateCheckStatus(status) {
  return status === 1 ? 'compatibility' : 'infrastructure'
}

export function parseCanaryArgs(args) {
  const values = args[0] === '--' ? args.slice(1) : args
  if (values[0] === '--dist-tags-output') {
    const value = values[1]
    if (values.length !== 2 || value === undefined || value === '') {
      throw new Error('usage: check-dsh-next --dist-tags-output <github-output-file>')
    }
    return { distTagsOutputPath: resolve(process.cwd(), value) }
  }
  let channel = 'next'
  const dedupeAgainst = []
  let outputPath
  let resolvedLatest
  let resolvedNext
  let resolvedAlpha
  for (let index = 0; index < values.length; index += 2) {
    const name = values[index]
    const value = values[index + 1]
    if (value === undefined || value === '') {
      throw new Error('usage: check-dsh-next [--channel <latest|next|alpha>] [--dedupe-against <latest|next|alpha>] [--report <json-file>]')
    }
    if (name === '--channel' && CHANNELS.has(value)) {
      channel = value
      continue
    }
    if (name === '--dedupe-against' && CHANNELS.has(value)) {
      if (dedupeAgainst.includes(value)) throw new Error(`duplicate canary deduplication owner: ${value}`)
      dedupeAgainst.push(value)
      continue
    }
    if (name === '--report') {
      outputPath = resolve(process.cwd(), value)
      continue
    }
    if (name === '--resolved-latest') {
      resolvedLatest = parseRegistryVersion(value)
      continue
    }
    if (name === '--resolved-next') {
      resolvedNext = parseRegistryVersion(value)
      continue
    }
    if (name === '--resolved-alpha') {
      resolvedAlpha = parseRegistryVersion(value)
      continue
    }
    throw new Error('usage: check-dsh-next [--channel <latest|next|alpha>] [--dedupe-against <latest|next|alpha>] [--resolved-latest <version> --resolved-next <version> --resolved-alpha <version>] [--report <json-file>]')
  }
  if (dedupeAgainst.includes(channel)) {
    throw new Error('the canary channel cannot deduplicate against itself')
  }
  const resolvedValues = [resolvedLatest, resolvedNext, resolvedAlpha]
  if (resolvedValues.some(value => value === undefined) && resolvedValues.some(value => value !== undefined)) {
    throw new Error('resolved latest, next, and alpha versions must be supplied together')
  }
  const resolvedDistTags = resolvedLatest === undefined
    ? undefined
    : { latest: resolvedLatest, next: resolvedNext, alpha: resolvedAlpha }
  return { channel, dedupeAgainst, outputPath, resolvedDistTags }
}

async function emitReport(path, report) {
  const serialized = `${JSON.stringify(report)}\n`
  if (path !== undefined) {
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, serialized, 'utf8')
  }
  process.stdout.write(serialized)
}

function baseReport(supportedVersion, channel) {
  return {
    schemaVersion: JSON_SCHEMA_VERSION,
    channel,
    supportedVersion,
    candidateVersion: null,
    nodeVersion: process.version,
    pluginCommit: process.env.GITHUB_SHA ?? null,
  }
}

async function resolveRegistryDistTags() {
  const lookup = await runCommand('npm', ['view', PACKAGE_NAME, 'dist-tags', '--json'], {
    timeoutMs: REGISTRY_TIMEOUT_MS,
  })
  if (lookup.status !== 0) {
    return { error: sanitizeSummary(lookup.stderr || lookup.stdout || 'npm candidate lookup failed') }
  }
  try {
    return { distTags: parseRegistryDistTags(lookup.stdout) }
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
}

export async function runCanary(options, dependencies = {}) {
  const candidateCheckPath = dependencies.candidateCheckPath ?? INSTALL_CHECK
  if (options.distTagsOutputPath !== undefined) {
    const resolved = await resolveRegistryDistTags()
    if (resolved.distTags === undefined) throw new Error(resolved.error)
    await appendFile(
      options.distTagsOutputPath,
      `latest=${resolved.distTags.latest}\nnext=${resolved.distTags.next}\nalpha=${resolved.distTags.alpha}\n`,
      'utf8',
    )
    process.stdout.write(`${JSON.stringify(resolved.distTags)}\n`)
    return 0
  }
  const { channel, dedupeAgainst, outputPath, resolvedDistTags } = options
  const compatibility = JSON.parse(await readFile(COMPATIBILITY_FILE, 'utf8'))
  const supportedVersion = compatibility?.dshPluginApi?.version
  if (typeof supportedVersion !== 'string' || supportedVersion.length === 0) {
    throw new Error('compatibility.json has no declared DSH plugin API version')
  }
  if (parseSemanticVersion(supportedVersion) === undefined) {
    throw new Error('compatibility.json has an invalid DSH plugin API version')
  }
  const base = baseReport(supportedVersion, channel)
  const resolved = resolvedDistTags === undefined ? await resolveRegistryDistTags() : { distTags: resolvedDistTags }
  if (resolved.distTags === undefined) {
    await emitReport(outputPath, {
      ...base,
      status: 'fail',
      classification: 'infrastructure',
      stage: 'resolve-candidate',
      summary: resolved.error,
    })
    return 2
  }
  const distTags = resolved.distTags
  const candidateVersion = distTags[channel]

  const duplicateOwner = duplicateCandidateOwner(channel, dedupeAgainst, distTags)
  if (duplicateOwner !== undefined) {
    await emitReport(outputPath, {
      ...base,
      candidateVersion,
      status: 'pass',
      classification: 'duplicate',
      stage: 'compare-candidate',
      summary: `DSH ${channel} matches ${duplicateOwner} at ${candidateVersion}; the ${duplicateOwner} canary owns this candidate.`,
    })
    return 0
  }

  const versionClassification = classifyCandidateVersion(candidateVersion, supportedVersion)
  if (versionClassification === 'unchanged') {
    await emitReport(outputPath, {
      ...base,
      candidateVersion,
      status: 'pass',
      classification: 'unchanged',
      stage: 'compare-candidate',
      summary: `DSH ${channel} remains at the declared supported version ${supportedVersion}.`,
    })
    return 0
  }

  if (versionClassification === 'not-newer') {
    await emitReport(outputPath, {
      ...base,
      candidateVersion,
      status: 'pass',
      classification: 'not-newer',
      stage: 'compare-candidate',
      summary: `DSH ${channel} is ${candidateVersion}, which does not supersede the declared supported version ${supportedVersion}; the isolated candidate check was skipped.`,
    })
    return 0
  }

  const candidateCheck = await runCommand(process.execPath, [candidateCheckPath], {
    env: {
      ...scrubCanaryEnvironment(process.env),
      DSH_VERSION: candidateVersion,
      DSH_UNDECLARED_CANARY_VERSION: '1',
    },
    timeoutMs: CANDIDATE_CHECK_TIMEOUT_MS,
  })
  if (candidateCheck.status !== 0) {
    const detail = candidateCheck.stderr || candidateCheck.stdout || 'isolated candidate check failed'
    const classification = classifyCandidateCheckStatus(candidateCheck.status)
    await emitReport(outputPath, {
      ...base,
      candidateVersion,
      status: 'fail',
      classification,
      stage: 'isolated-install',
      summary: sanitizeSummary(detail),
    })
    return classification === 'compatibility' ? 1 : 2
  }

  await emitReport(outputPath, {
    ...base,
    candidateVersion,
    status: 'pass',
    classification: 'candidate-compatible',
    stage: 'isolated-install',
    summary: `The isolated ${channel} install check passed with DSH ${candidateVersion}; declared support remains ${supportedVersion}.`,
  })
  return 0
}

async function main() {
  return runCanary(parseCanaryArgs(process.argv.slice(2)))
}

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  try {
    process.exitCode = await main()
  } catch (error) {
    process.stderr.write(`check-dsh-next: ${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 2
  }
}
