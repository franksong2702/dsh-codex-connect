#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const JSON_SCHEMA_VERSION = 1
const PACKAGE_SPEC = '@deepseek-ai/dsh@next'
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const COMPATIBILITY_FILE = resolve(REPO_ROOT, 'compatibility.json')
const INSTALL_CHECK = resolve(REPO_ROOT, 'scripts/check-dsh-install.mjs')
const MAX_SUMMARY_LENGTH = 1600

function commandName(name) {
  return process.platform === 'win32' && name === 'npm' ? `${name}.cmd` : name
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(commandName(command), args, {
    cwd: REPO_ROOT,
    env: options.env ?? process.env,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    windowsHide: true,
  })
  if (result.error !== undefined) {
    return {
      status: 1,
      stdout: '',
      stderr: `${command} could not start: ${result.error.message}`,
    }
  }
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  }
}

export function parseRegistryVersion(output) {
  let value
  try {
    value = JSON.parse(output.trim())
  } catch {
    value = output.trim()
  }
  if (typeof value !== 'string' || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u.test(value)) {
    throw new Error('npm returned an invalid DSH next version')
  }
  return value
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
    && typeof first.candidateVersion === 'string'
    && first.candidateVersion === second.candidateVersion
}

export function classifyCandidateCheckFailure(value) {
  const text = value.toLowerCase()
  if (/\b(?:eai_again|econnreset|enotfound|etimedout|err_socket_timeout)\b/u.test(text)
    || text.includes('network request failed')
    || text.includes('fetch failed')) {
    return 'infrastructure'
  }
  if (/check-dsh-install: (?:local build|npm pack|npm install|pre-install dump-config) failed/u.test(text)) {
    return 'infrastructure'
  }
  return 'compatibility'
}

function reportPath(args) {
  if (args.length === 0) return undefined
  const value = args[1]
  if (args.length !== 2 || args[0] !== '--report' || value === undefined || value === '') {
    throw new Error('usage: check-dsh-next [--report <json-file>]')
  }
  return resolve(process.cwd(), value)
}

async function emitReport(path, report) {
  const serialized = `${JSON.stringify(report)}\n`
  if (path !== undefined) {
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, serialized, 'utf8')
  }
  process.stdout.write(serialized)
}

function baseReport(supportedVersion) {
  return {
    schemaVersion: JSON_SCHEMA_VERSION,
    channel: 'next',
    supportedVersion,
    candidateVersion: null,
    nodeVersion: process.version,
    pluginCommit: process.env.GITHUB_SHA ?? null,
  }
}

async function main() {
  const outputPath = reportPath(process.argv.slice(2))
  const compatibility = JSON.parse(await readFile(COMPATIBILITY_FILE, 'utf8'))
  const supportedVersion = compatibility?.dshPluginApi?.version
  if (typeof supportedVersion !== 'string' || supportedVersion.length === 0) {
    throw new Error('compatibility.json has no declared DSH plugin API version')
  }
  const base = baseReport(supportedVersion)
  const lookup = runCommand('npm', ['view', PACKAGE_SPEC, 'version', '--json'])
  if (lookup.status !== 0) {
    await emitReport(outputPath, {
      ...base,
      status: 'fail',
      classification: 'infrastructure',
      stage: 'resolve-candidate',
      summary: sanitizeSummary(lookup.stderr || lookup.stdout || 'npm candidate lookup failed'),
    })
    return 2
  }

  let candidateVersion
  try {
    candidateVersion = parseRegistryVersion(lookup.stdout)
  } catch (error) {
    await emitReport(outputPath, {
      ...base,
      status: 'fail',
      classification: 'infrastructure',
      stage: 'resolve-candidate',
      summary: error instanceof Error ? error.message : String(error),
    })
    return 2
  }

  if (candidateVersion === supportedVersion) {
    await emitReport(outputPath, {
      ...base,
      candidateVersion,
      status: 'pass',
      classification: 'unchanged',
      stage: 'compare-candidate',
      summary: `DSH next remains at the declared supported version ${supportedVersion}.`,
    })
    return 0
  }

  const candidateCheck = runCommand('node', [INSTALL_CHECK], {
    env: {
      ...process.env,
      DSH_VERSION: candidateVersion,
      DSH_UNDECLARED_CANARY_VERSION: '1',
    },
  })
  if (candidateCheck.status !== 0) {
    const detail = candidateCheck.stderr || candidateCheck.stdout || 'isolated candidate check failed'
    await emitReport(outputPath, {
      ...base,
      candidateVersion,
      status: 'fail',
      classification: classifyCandidateCheckFailure(detail),
      stage: 'isolated-install',
      summary: sanitizeSummary(detail),
    })
    return 1
  }

  await emitReport(outputPath, {
    ...base,
    candidateVersion,
    status: 'pass',
    classification: 'candidate-compatible',
    stage: 'isolated-install',
    summary: `The isolated install check passed with DSH ${candidateVersion}; declared support remains ${supportedVersion}.`,
  })
  return 0
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
