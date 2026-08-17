#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const JSON_SCHEMA_VERSION = 1
const DEFAULT_DSH_VERSION = '0.1.0-rc.6'
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function commandName(name) {
  return process.platform === 'win32' && (name === 'npm' || name === 'pnpm') ? `${name}.cmd` : name
}

function runCommand(command, args, options) {
  const result = spawnSync(commandName(command), args, {
    cwd: options.cwd,
    env: options.env,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    windowsHide: true,
  })
  if (result.error !== undefined) {
    throw new Error(`${command} ${args.join(' ')} could not start: ${result.error.message}`)
  }
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  }
}

function requireSuccess(label, result) {
  if (result.status === 0) return
  const detail = (result.stderr || result.stdout).trim().split(/\r?\n/u).slice(-12).join('\n')
  throw new Error(`${label} failed with exit ${String(result.status)}${detail === '' ? '' : `:\n${detail}`}`)
}

function configBlock(dump, id) {
  const lines = dump.split(/\r?\n/u)
  const start = lines.findIndex(line => line === `- id: ${id}`)
  if (start < 0) throw new Error(`dump-config is missing the ${id} block`)
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
  if (text === '' || /\r?\n/u.test(text)) throw new Error(`${label} did not emit exactly one JSON line`)
  try {
    return JSON.parse(text)
  } catch (error) {
    throw new Error(`${label} emitted invalid JSON: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function assertDoctorJson(value, dshHome, repoRoot) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('doctor JSON must be an object')
  }
  const report = value
  if (report['schemaVersion'] !== JSON_SCHEMA_VERSION || report['credentialFile']?.['state'] !== 'missing') {
    throw new Error('doctor JSON did not report schemaVersion 1 and a missing credential file')
  }
  if (report['credentialFile']?.['path'] !== undefined || report['credentialFile']?.['expiresAt'] !== undefined) {
    throw new Error('doctor JSON exposed credential path or expiry data')
  }
  const compatibility = report['compatibility']
  const expectedPackages = ['@deepseek-ai/dsh-llm', '@deepseek-ai/dsh-llm-pi-ai', '@earendil-works/pi-ai']
  if (compatibility?.['schemaVersion'] !== JSON_SCHEMA_VERSION || compatibility?.['status'] !== 'compatible') {
    throw new Error('doctor JSON did not report schemaVersion 1 and compatible runtime dependencies')
  }
  if (compatibility?.['node']?.['status'] !== 'compatible') {
    throw new Error('doctor JSON did not report a compatible Node engine')
  }
  for (const name of expectedPackages) {
    const entry = compatibility?.['packages']?.[name]
    const supported = name === '@earendil-works/pi-ai' ? '0.82.1' : '0.1.0-rc.6'
    if (entry?.['supported'] !== supported || entry?.['installed'] !== supported || entry?.['status'] !== 'compatible') {
      throw new Error(`doctor JSON did not report compatible ${name}`)
    }
  }
  const serialized = JSON.stringify(report)
  for (const forbidden of [dshHome, repoRoot, 'authorization', 'access-token', 'refresh-token', 'account-id']) {
    if (serialized.includes(forbidden)) throw new Error(`doctor JSON exposed forbidden text: ${forbidden}`)
  }
}

async function main() {
  const build = runCommand('pnpm', ['run', 'build'], { cwd: REPO_ROOT, env: process.env })
  requireSuccess('local build', build)

  const requestedDshVersion = process.env.DSH_VERSION
  if (requestedDshVersion !== undefined && requestedDshVersion !== '' && requestedDshVersion !== DEFAULT_DSH_VERSION) {
    throw new Error(`check-dsh-install only verifies the declared DSH CLI version ${DEFAULT_DSH_VERSION}`)
  }
  const dshVersion = DEFAULT_DSH_VERSION
  const tempRoot = await mkdtemp(join(tmpdir(), 'dsh-codex-connect-install-'))
  const dshHome = join(tempRoot, 'dsh-home')
  const installRoot = join(tempRoot, 'dsh-install')
  const workspace = join(tempRoot, 'workspace')
  await mkdir(workspace, { recursive: true })
  const env = {
    ...process.env,
    DSH_HOME: dshHome,
    DSH_TELEMETRY_MODE: 'DISABLED',
  }

  try {
    const install = runCommand('npm', [
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
    const versionResult = runCommand(dshBinary, ['--version'], { cwd: workspace, env })
    requireSuccess('dsh --version', versionResult)
    const actualDshVersion = versionResult.stdout.trim()
    if (actualDshVersion !== dshVersion) {
      throw new Error(`dsh version mismatch: expected ${dshVersion}, got ${actualDshVersion}`)
    }

    const beforeDump = runCommand(dshBinary, ['--profile', 'web', '--dump-config'], { cwd: workspace, env })
    requireSuccess('pre-install dump-config', beforeDump)
    const beforeDefaults = {
      agentDefaultModel: configBlock(beforeDump.stdout, 'agent-default-model'),
      web: configBlock(beforeDump.stdout, 'web'),
    }

    const add = runCommand(dshBinary, [
      'plugin', '--profile', 'web', 'add', `link:${REPO_ROOT}`,
    ], { cwd: workspace, env })
    requireSuccess('local plugin install', add)

    const afterDump = runCommand(dshBinary, ['--profile', 'web', '--dump-config'], { cwd: workspace, env })
    requireSuccess('post-install dump-config', afterDump)
    const afterDefaults = {
      agentDefaultModel: configBlock(afterDump.stdout, 'agent-default-model'),
      web: configBlock(afterDump.stdout, 'web'),
    }
    if (beforeDefaults.agentDefaultModel !== afterDefaults.agentDefaultModel
      || beforeDefaults.web !== afterDefaults.web) {
      throw new Error('agent-default-model or web changed after local plugin installation')
    }

    const pluginBlock = configBlock(afterDump.stdout, 'llm-openai-codex')
    if (!/^    enableSearch: false$/mu.test(pluginBlock)
      || !/^    enableImageTool: false$/mu.test(pluginBlock)) {
      throw new Error('local plugin configuration did not retain enableSearch:false and enableImageTool:false')
    }

    const doctor = runCommand(dshBinary, [
      'plugin', '--profile', 'web', 'exec', 'dsh-codex-connect', 'doctor', '--json',
    ], { cwd: workspace, env })
    requireSuccess('plugin doctor', doctor)
    const doctorReport = parseOneLineJson(doctor.stdout, 'plugin doctor')
    assertDoctorJson(doctorReport, dshHome, REPO_ROOT)

    process.stdout.write(`${JSON.stringify({
      schemaVersion: JSON_SCHEMA_VERSION,
      dshVersion: actualDshVersion,
      nodeVersion: process.version,
      plugin: 'dsh-codex-connect',
      defaultsUnchanged: true,
      capabilities: {
        enableSearch: false,
        enableImageTool: false,
      },
    })}\n`)
  } finally {
    await rm(tempRoot, { recursive: true, force: true })
  }
}

try {
  await main()
} catch (error) {
  process.stderr.write(`check-dsh-install: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
}
