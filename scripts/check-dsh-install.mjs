#!/usr/bin/env node

import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { scrubCanaryEnvironment } from './canary-environment.mjs'
import { runBoundedCommand } from './bounded-command.mjs'

const JSON_SCHEMA_VERSION = 1
const DEFAULT_DSH_VERSION = '0.1.2-rc.1'
const UNDECLARED_CANARY_MODE = '1'
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const RUNTIME_CHECK = resolve(REPO_ROOT, 'scripts/check-installed-runtime.mjs')
const COMMAND_TIMEOUT_MS = 20 * 60 * 1000

export class InfrastructureCheckError extends Error {}
export class CompatibilityCheckError extends Error {}

function commandName(name) {
  return process.platform === 'win32' && (name === 'npm' || name === 'pnpm') ? `${name}.cmd` : name
}

async function runCommand(command, args, options) {
  const result = await runBoundedCommand(commandName(command), args, {
    cwd: options.cwd,
    env: options.env,
    timeoutMs: COMMAND_TIMEOUT_MS,
  })
  if (result.error !== undefined) {
    const cleanupDetail = result.cleanupError === undefined ? '' : `; process-tree cleanup failed: ${result.cleanupError.message}`
    throw new InfrastructureCheckError(`${command} ${args.join(' ')} failed: ${result.error.message}${cleanupDetail}`)
  }
  return {
    status: result.status ?? 2,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  }
}

function isInfrastructureFailure(value) {
  const text = value.toLowerCase()
  return /\b(?:e401|e403|e404|eai_again|econnreset|enotfound|etimedout|err_socket_timeout)\b/u.test(text)
    || text.includes('err_pnpm_fetch')
    || text.includes('err_pnpm_meta_fetch_fail')
    || text.includes('network request failed')
    || text.includes('fetch failed')
}

export function commandFailureClassification(result, requestedClassification = 'infrastructure') {
  const detail = [result.stderr, result.stdout].filter(value => value.trim() !== '').join('\n')
  return requestedClassification === 'compatibility' && !isInfrastructureFailure(detail)
    ? 'compatibility'
    : 'infrastructure'
}

function requireSuccess(label, result, classification = 'infrastructure') {
  if (result.status === 0) return
  const rawDetail = [result.stderr, result.stdout].filter(value => value.trim() !== '').join('\n')
  const detail = rawDetail.trim().split(/\r?\n/u).slice(-12).join('\n')
  const message = `${label} failed with exit ${String(result.status)}${detail === '' ? '' : `:\n${detail}`}`
  if (commandFailureClassification(result, classification) === 'compatibility') {
    throw new CompatibilityCheckError(message)
  }
  throw new InfrastructureCheckError(message)
}

export function installCheckExitCode(error) {
  return error instanceof CompatibilityCheckError ? 1 : 2
}

function configBlock(dump, id, classification = 'infrastructure') {
  const lines = dump.split(/\r?\n/u)
  const start = lines.findIndex(line => line === `- id: ${id}`)
  if (start < 0) {
    const ErrorType = classification === 'compatibility' ? CompatibilityCheckError : InfrastructureCheckError
    throw new ErrorType(`dump-config is missing the ${id} block`)
  }
  let end = lines.length
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^(?:- id: |# ==)/u.test(lines[index] ?? '')) {
      end = index
      break
    }
  }
  while (end > start && lines[end - 1] === '') end -= 1
  return lines.slice(start, end).join('\n')
}

function parseOneLineJson(output, label) {
  const text = output.trim()
  if (text === '' || /\r?\n/u.test(text)) throw new CompatibilityCheckError(`${label} did not emit exactly one JSON line`)
  try {
    return JSON.parse(text)
  } catch (error) {
    throw new CompatibilityCheckError(`${label} emitted invalid JSON: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function assertDoctorJson(value, dshHome, repoRoot) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new CompatibilityCheckError('doctor JSON must be an object')
  }
  const report = value
  if (report['schemaVersion'] !== JSON_SCHEMA_VERSION || report['credentialFile']?.['state'] !== 'missing') {
    throw new CompatibilityCheckError('doctor JSON did not report schemaVersion 1 and a missing credential file')
  }
  if (report['credentialFile']?.['path'] !== undefined || report['credentialFile']?.['expiresAt'] !== undefined) {
    throw new CompatibilityCheckError('doctor JSON exposed credential path or expiry data')
  }
  const compatibility = report['compatibility']
  const expectedPackages = ['@deepseek-ai/dsh-llm', '@deepseek-ai/dsh-llm-pi-ai', '@earendil-works/pi-ai']
  if (compatibility?.['schemaVersion'] !== JSON_SCHEMA_VERSION || compatibility?.['status'] !== 'compatible') {
    throw new CompatibilityCheckError('doctor JSON did not report schemaVersion 1 and compatible runtime dependencies')
  }
  if (compatibility?.['node']?.['status'] !== 'compatible') {
    throw new CompatibilityCheckError('doctor JSON did not report a compatible Node engine')
  }
  for (const name of expectedPackages) {
    const entry = compatibility?.['packages']?.[name]
    const supported = name === '@earendil-works/pi-ai' ? '^0.84.2' : DEFAULT_DSH_VERSION
    if (entry?.['supported'] !== supported || typeof entry?.['installed'] !== 'string' || entry?.['status'] !== 'compatible') {
      throw new CompatibilityCheckError(`doctor JSON did not report compatible ${name}`)
    }
  }
  const serialized = JSON.stringify(report)
  for (const forbidden of [dshHome, repoRoot, 'authorization', 'access-token', 'refresh-token', 'account-id']) {
    if (serialized.includes(forbidden)) throw new CompatibilityCheckError(`doctor JSON exposed forbidden text: ${forbidden}`)
  }
}

async function main() {
  const requestedDshVersion = process.env.DSH_VERSION
  const allowUndeclaredCanaryVersion = process.env.DSH_UNDECLARED_CANARY_VERSION === UNDECLARED_CANARY_MODE
  if (requestedDshVersion !== undefined
    && requestedDshVersion !== ''
    && requestedDshVersion !== DEFAULT_DSH_VERSION
    && !allowUndeclaredCanaryVersion) {
    throw new Error(`check-dsh-install only verifies the declared DSH CLI version ${DEFAULT_DSH_VERSION}`)
  }
  const dshVersion = requestedDshVersion === undefined || requestedDshVersion === ''
    ? DEFAULT_DSH_VERSION
    : requestedDshVersion
  const inheritedEnvironment = allowUndeclaredCanaryVersion
    ? scrubCanaryEnvironment(process.env)
    : process.env
  const build = await runCommand('pnpm', ['run', 'build'], { cwd: REPO_ROOT, env: inheritedEnvironment })
  requireSuccess('local build', build)

  const tempRoot = await mkdtemp(join(tmpdir(), 'dsh-codex-connect-install-'))
  const dshHome = join(tempRoot, 'dsh-home')
  const installRoot = join(tempRoot, 'dsh-install')
  const workspace = join(tempRoot, 'workspace')
  await mkdir(workspace, { recursive: true })
  const env = {
    ...inheritedEnvironment,
    DSH_HOME: dshHome,
    DSH_TELEMETRY_MODE: 'DISABLED',
  }

  try {
    let pluginSpec = `link:${REPO_ROOT}`
    if (allowUndeclaredCanaryVersion) {
      const pack = await runCommand('npm', [
        'pack',
        '--json',
        '--ignore-scripts',
        '--pack-destination', tempRoot,
      ], { cwd: REPO_ROOT, env })
      requireSuccess('npm pack', pack)
      const [manifest] = JSON.parse(pack.stdout)
      if (typeof manifest?.filename !== 'string'
        || manifest.filename.length === 0
        || basename(manifest.filename) !== manifest.filename) {
        throw new Error('npm pack did not report one package filename')
      }
      pluginSpec = `file:${join(tempRoot, manifest.filename)}`
    }

    const install = await runCommand('npm', [
      'install',
      '--prefix', installRoot,
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      '--package-lock=false',
      `@deepseek-ai/dsh@${dshVersion}`,
    ], { cwd: workspace, env })
    requireSuccess('npm install', install)

    const dshBinary = join(installRoot, 'node_modules', '.bin', process.platform === 'win32' ? 'dsh.cmd' : 'dsh')
    const versionResult = await runCommand(dshBinary, ['--version'], { cwd: workspace, env })
    requireSuccess('dsh --version', versionResult)
    const actualDshVersion = versionResult.stdout.trim()
    if (actualDshVersion !== dshVersion) {
      throw new Error(`dsh version mismatch: expected ${dshVersion}, got ${actualDshVersion}`)
    }

    const beforeDump = await runCommand(dshBinary, ['--profile', 'web', '--dump-config'], { cwd: workspace, env })
    requireSuccess('pre-install dump-config', beforeDump)
    const beforeDefaults = {
      agentDefaultModel: configBlock(beforeDump.stdout, 'agent-default-model'),
      web: configBlock(beforeDump.stdout, 'web'),
    }

    const add = await runCommand(dshBinary, [
      'plugin', '--profile', 'web', 'add', pluginSpec,
    ], { cwd: workspace, env })
    requireSuccess('local plugin install', add, 'compatibility')

    const afterDump = await runCommand(dshBinary, ['--profile', 'web', '--dump-config'], { cwd: workspace, env })
    requireSuccess('post-install dump-config', afterDump, 'compatibility')
    const afterDefaults = {
      agentDefaultModel: configBlock(afterDump.stdout, 'agent-default-model', 'compatibility'),
      web: configBlock(afterDump.stdout, 'web', 'compatibility'),
    }
    if (beforeDefaults.agentDefaultModel !== afterDefaults.agentDefaultModel
      || beforeDefaults.web !== afterDefaults.web) {
      throw new CompatibilityCheckError('agent-default-model or web changed after local plugin installation')
    }

    const pluginBlock = configBlock(afterDump.stdout, 'llm-openai-codex', 'compatibility')
    if (!/^    enableProxy: false$/mu.test(pluginBlock)
      || !/^    enableSearch: false$/mu.test(pluginBlock)
      || !/^    enableImageTool: false$/mu.test(pluginBlock)
      || !/^    enableImageGeneration: false$/mu.test(pluginBlock)
      || !/^    enableAutoReview: false$/mu.test(pluginBlock)) {
      throw new CompatibilityCheckError('local plugin configuration did not retain all optional capabilities as false')
    }

    // DSH rc.1 prepares profile-to-installation module fallback during profile composition.
    const profileHelp = await runCommand(dshBinary, ['web', '--help'], { cwd: workspace, env })
    requireSuccess('installed profile boot', profileHelp, 'compatibility')

    const doctor = await runCommand(dshBinary, [
      'plugin', '--profile', 'web', 'exec', 'dsh-codex-connect', 'doctor', '--json',
    ], { cwd: workspace, env })
    requireSuccess('plugin doctor', doctor, 'compatibility')
    const doctorReport = parseOneLineJson(doctor.stdout, 'plugin doctor')
    assertDoctorJson(doctorReport, dshHome, REPO_ROOT)

    const runtime = await runCommand(process.execPath, [
      RUNTIME_CHECK,
      join(dshHome, 'profiles', 'web', 'package.json'),
      join(installRoot, 'node_modules', '@deepseek-ai', 'dsh', 'package.json'),
    ], { cwd: workspace, env })
    requireSuccess('installed runtime contract', runtime, 'compatibility')
    const runtimeReport = parseOneLineJson(runtime.stdout, 'installed runtime contract')
    if (runtimeReport?.['schemaVersion'] !== JSON_SCHEMA_VERSION
      || runtimeReport?.['provider'] !== 'openai-codex'
      || typeof runtimeReport?.['modelCount'] !== 'number'
      || runtimeReport['modelCount'] < 1
      || runtimeReport?.['reasoningModelCount'] !== runtimeReport['modelCount']
      || runtimeReport?.['disposalVerified'] !== true) {
      throw new CompatibilityCheckError('installed runtime contract returned an invalid report')
    }

    process.stdout.write(`${JSON.stringify({
      schemaVersion: JSON_SCHEMA_VERSION,
      dshVersion: actualDshVersion,
      nodeVersion: process.version,
      plugin: 'dsh-codex-connect',
      defaultsUnchanged: true,
      capabilities: {
        enableProxy: false,
        enableSearch: false,
        enableImageTool: false,
        enableImageGeneration: false,
        enableAutoReview: false,
      },
      runtime: runtimeReport,
    })}\n`)
  } finally {
    await rm(tempRoot, { recursive: true, force: true })
  }
}

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  try {
    await main()
  } catch (error) {
    process.stderr.write(`check-dsh-install: ${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = installCheckExitCode(error)
  }
}
