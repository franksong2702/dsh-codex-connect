#!/usr/bin/env node
/** One fresh process, one exact installed host; the experiment bundle is private test infrastructure. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { mkdir, readFile, readdir, realpath, rm } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { SPLIT_HOST_SCENARIOS, runSplitHostScenario } from './split-host-fixture.mjs'
import { resolveSplitPiAi } from './split-esm-resolution.mjs'

const [packagePath, version, expectedDigest] = process.argv.slice(2)
assert.ok(packagePath && version && /^[a-f0-9]{64}$/u.test(expectedDigest ?? '') && process.argv.length === 5)
const root = await realpath(dirname(resolve(packagePath)))
const require = createRequire(join(root, 'package.json'))
const source = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
const versions = {}
const inRoot = async path => {
  const resolved = await realpath(path)
  const suffix = relative(root, resolved)
  assert.ok(suffix && !suffix.startsWith('..'), 'host dependency escaped its isolated installation')
  return resolved
}
for (const name of Object.keys(source.overrides)) {
  const manifest = JSON.parse(await readFile(await inRoot(require.resolve(`${name}/package.json`)), 'utf8'))
  assert.equal(manifest.version, version, `wrong installed host: ${name}`)
  versions[name] = manifest.version
}
const important = ['@deepseek-ai/dsh-agent', '@deepseek-ai/dsh-agent-loop', '@deepseek-ai/dsh-tools', '@deepseek-ai/dsh-subagent', '@deepseek-ai/dsh-subagent-spawn-in-process', '@deepseek-ai/dsh-subagent-in-process-driver', '@deepseek-ai/dsh-llm-pi-ai']
for (const name of important) assert.equal(versions[name], version)
const { version: piVersion } = await resolveSplitPiAi(root, require.resolve('@deepseek-ai/dsh-llm-pi-ai'))
const bundleRoot = join(root, 'experiment')
const names = (await readdir(bundleRoot)).sort()
const manifest = []
for (const name of names) manifest.push([name, createHash('sha256').update(await readFile(join(bundleRoot, name))).digest('hex')])
const bundleDigest = createHash('sha256').update(JSON.stringify(manifest)).digest('hex')
assert.equal(bundleDigest, expectedDigest)
const entry = names.filter(name => /^experiment\.m?js$/u.test(name))
assert.equal(entry.length, 1)
const fixtureRoot = join(root, 'scenario-data')
await mkdir(fixtureRoot)
process.env.DSH_HOME = join(fixtureRoot, 'synthetic-home')
process.env.DSH_TELEMETRY_MODE = 'DISABLED'
process.env.OTEL_SDK_DISABLED = 'true'
try {
  const implementation = await import(pathToFileURL(join(bundleRoot, entry[0])).href)
  const importHost = async specifier => import(pathToFileURL(await inRoot(require.resolve(specifier))).href)
  const scenarios = []
  for (const scenario of SPLIT_HOST_SCENARIOS) {
    try { scenarios.push({ ...await runSplitHostScenario(scenario, { root: fixtureRoot, implementation, importHost }), passed: true }) }
    catch (error) { throw new Error(`Split ${version}/${scenario}: ${error.message}`, { cause: error }) }
  }
  console.log(JSON.stringify({ schemaVersion: 1, kind: 'split-internal-experiment', dshVersion: version, nodeVersion: process.version, piAiVersion: piVersion,
    bundleDigest, exactDshPackages: Object.keys(versions).length, runtimePackages: Object.fromEntries(important.map(name => [name, versions[name]])),
    syntheticOnly: true, realProviderDispatches: 0, productionEntryEnabled: false, freshProcesses: 1, pid: process.pid, scenarios }))
} finally { await rm(fixtureRoot, { recursive: true, force: true }) }
