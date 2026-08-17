#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(ROOT, '..')
const COMPATIBILITY_FILE = join(REPO_ROOT, 'compatibility.json')
const PACKAGE_FILE = join(REPO_ROOT, 'package.json')
const JSON_SCHEMA_VERSION = 1
const REQUIRED_NODE_RANGE = '^22.19.0 || >=24.0.0'
const REQUIRED_DSH_VERSION = '0.1.0-rc.6'
const REQUIRED_PI_AI_VERSION = '0.82.1'
const PI_AI_PACKAGE = '@earendil-works/pi-ai'
const MAX_PACKAGE_JSON_SEARCH_DEPTH = 8

function fail(message) {
  throw new Error(message)
}

function parseNodeVersion(value) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+][0-9A-Za-z.-]+)?$/u.exec(value.trim())
  if (match === null) return undefined
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

function nodeStatus(value) {
  const parsed = parseNodeVersion(value)
  if (parsed === undefined) return 'unknown'
  const [major, minor, patch] = parsed
  if (major === 22) return minor > 19 || (minor === 19 && patch >= 0) ? 'compatible' : 'incompatible'
  return major >= 24 ? 'compatible' : 'incompatible'
}

async function readJson(filename) {
  return JSON.parse(await readFile(filename, 'utf8'))
}

async function installedPackageVersion(name) {
  let entry
  try {
    const resolved = import.meta.resolve(name)
    if (!resolved.startsWith('file:')) return undefined
    entry = fileURLToPath(resolved)
  } catch {
    return undefined
  }
  let directory = dirname(entry)
  for (let depth = 0; depth < MAX_PACKAGE_JSON_SEARCH_DEPTH; depth += 1) {
    try {
      const metadata = await readJson(join(directory, 'package.json'))
      if (metadata.name === name && typeof metadata.version === 'string') return metadata.version
    } catch {
      // Missing or unrelated metadata is an unknown install, not a path to print.
    }
    const parent = dirname(directory)
    if (parent === directory) break
    directory = parent
  }
  return undefined
}

function packageEntry(supported, installed) {
  return {
    supported,
    installed: installed ?? null,
    status: installed === undefined || installed === null || installed === ''
      ? 'unknown'
      : installed === supported ? 'compatible' : 'incompatible',
  }
}

function aggregateStatus(entries) {
  if (entries.some(entry => entry.status === 'incompatible')) return 'incompatible'
  if (entries.some(entry => entry.status === 'unknown')) return 'unknown'
  return 'compatible'
}

async function main() {
  const [compatibility, packageJson] = await Promise.all([
    readJson(COMPATIBILITY_FILE),
    readJson(PACKAGE_FILE),
  ])
  if (compatibility.schemaVersion !== JSON_SCHEMA_VERSION) fail('compatibility.json schemaVersion must be 1')
  if (compatibility.engines?.node !== REQUIRED_NODE_RANGE) fail('compatibility.json Node engine mismatch')
  if (compatibility.dshPluginApi?.version !== REQUIRED_DSH_VERSION) fail('compatibility.json DSH plugin API version mismatch')
  if (!Array.isArray(compatibility.dshPluginApi?.packages) || compatibility.dshPluginApi.packages.length === 0) {
    fail('compatibility.json must list DSH plugin API packages')
  }
  if (new Set(compatibility.dshPluginApi.packages).size !== compatibility.dshPluginApi.packages.length) {
    fail('compatibility.json DSH plugin API package list contains duplicates')
  }
  if (compatibility.piAi?.package !== PI_AI_PACKAGE || compatibility.piAi?.version !== REQUIRED_PI_AI_VERSION) {
    fail('compatibility.json pi-ai contract mismatch')
  }
  if (packageJson.engines?.node !== REQUIRED_NODE_RANGE) fail('package.json Node engine mismatch')

  const peers = packageJson.peerDependencies ?? {}
  for (const [name, version] of Object.entries(peers)) {
    if (name.startsWith('@deepseek-ai/dsh-') && version !== REQUIRED_DSH_VERSION) {
      fail(`peer dependency ${name} must be pinned to ${REQUIRED_DSH_VERSION}`)
    }
  }
  if (peers[PI_AI_PACKAGE] !== REQUIRED_PI_AI_VERSION) fail(`peer dependency ${PI_AI_PACKAGE} must be pinned to ${REQUIRED_PI_AI_VERSION}`)

  const declaredPackages = compatibility.dshPluginApi.packages
  const installedDeclared = Object.fromEntries(await Promise.all(declaredPackages.map(async name => [name, await installedPackageVersion(name)])))
  for (const name of declaredPackages) {
    if (installedDeclared[name] !== REQUIRED_DSH_VERSION) fail(`installed ${name} does not match ${REQUIRED_DSH_VERSION}`)
  }
  const installedPiAi = await installedPackageVersion(PI_AI_PACKAGE)
  if (installedPiAi !== REQUIRED_PI_AI_VERSION) fail(`installed ${PI_AI_PACKAGE} does not match ${REQUIRED_PI_AI_VERSION}`)

  const node = {
    supported: REQUIRED_NODE_RANGE,
    installed: process.version,
    status: nodeStatus(process.version),
  }
  const packages = Object.fromEntries([
    ['@deepseek-ai/dsh-llm', packageEntry(REQUIRED_DSH_VERSION, installedDeclared['@deepseek-ai/dsh-llm'])],
    ['@deepseek-ai/dsh-llm-pi-ai', packageEntry(REQUIRED_DSH_VERSION, installedDeclared['@deepseek-ai/dsh-llm-pi-ai'])],
    [PI_AI_PACKAGE, packageEntry(REQUIRED_PI_AI_VERSION, installedPiAi)],
  ])
  const report = {
    schemaVersion: JSON_SCHEMA_VERSION,
    status: aggregateStatus([node, ...Object.values(packages)]),
    node,
    packages,
  }
  if (report.status !== 'compatible') fail(`compatibility status is ${report.status}`)
  process.stdout.write(`${JSON.stringify(report)}\n`)
}

try {
  await main()
} catch (error) {
  process.stderr.write(`check-compatibility: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
}
