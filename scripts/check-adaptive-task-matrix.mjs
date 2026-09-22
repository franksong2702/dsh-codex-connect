#!/usr/bin/env node
/** Run the same task lifecycle contract and bundled implementation on exact disposable DSH runtimes. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { copyFile, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve, relative, isAbsolute, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { runBoundedCommand } from './bounded-command.mjs'
import { scrubCanaryEnvironment } from './canary-environment.mjs'
import { exactDshFixtureManifest, readDshRegistryManifest, resolveExactDshOverrides } from './exact-dsh-fixture.mjs'
import { assertTaskMatrix, inspectTaskTestReport, TASK_IDENTITY_CASE, TASK_RUNTIME_PACKAGES } from './adaptive-task-matrix-contract.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const inside = (root, path) => { const child = relative(root, path); return child !== '..' && !child.startsWith(`..${sep}`) && !isAbsolute(child) }

export async function readTaskHostIdentity(host, version, names) {
  const root = await realpath(host)
  // Use Node's ESM resolver, not require conditions: pi-ai exports an import-only root.
  const env = scrubCanaryEnvironment(process.env)
  delete env.NODE_OPTIONS; delete env.NODE_PATH
  const resolved = await runBoundedCommand(process.execPath, ['--experimental-import-meta-resolve', '--input-type=module', '--eval',
    'console.log(JSON.stringify(Object.fromEntries(JSON.parse(process.argv[1]).map(name => [name, import.meta.resolve(name, process.argv[2])]))))',
    JSON.stringify(names), pathToFileURL(join(root, 'package.json')).href], { cwd: root, env, timeoutMs: 10000, maxBuffer: 65536 })
  if (resolved.error || resolved.cleanupError || resolved.status !== 0) throw new Error(`Task ESM resolution failed: ${resolved.error?.message ?? resolved.cleanupError?.message ?? resolved.stderr}`)
  const locations = JSON.parse(resolved.stdout)
  const packages = {}; const entries = {}
  for (const name of names) {
    const entry = await realpath(fileURLToPath(locations[name]))
    assert.ok(inside(root, entry), `Task dependency escaped the selected host: ${name}`)
    // Some providers do not export package.json. Resolve their actual entry first,
    // then inspect only ancestor manifests inside the selected installation.
    let directory = dirname(entry); let manifest
    for (let depth = 0; depth < 16 && inside(root, directory); depth++) {
      try {
        const file = await realpath(join(directory, 'package.json'))
        assert.ok(inside(root, file), `Task manifest escaped the selected host: ${name}`)
        const candidate = JSON.parse(await readFile(file, 'utf8'))
        if (candidate.name === name) { manifest = candidate; break }
      } catch (error) { if (error.code !== 'ENOENT') throw error }
      const parent = dirname(directory)
      if (parent === directory) break
      directory = parent
    }
    assert.ok(manifest, `Missing exact Task manifest: ${name}`)
    if (name.startsWith('@deepseek-ai/dsh')) assert.equal(manifest.version, version, `Mixed Task host: ${name}`)
    packages[name] = manifest.version
    entries[name] = entry
  }
  return { packages, entries }
}

async function main() {
  const argv = process.argv.slice(2)
  assert.ok(argv.length === 0 || (argv.length === 2 && argv[0] === '--report'), 'usage: check-task-matrix [--report docs/experiments/name.json]')
  const reportPath = argv[1] === undefined ? undefined : resolve(ROOT, argv[1])
  if (reportPath) assert.ok(inside(join(ROOT, 'docs/experiments'), reportPath) && reportPath.endsWith('.json'))
  const pkg = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'))
  const versions = JSON.parse(await readFile(join(ROOT, 'compatibility.json'), 'utf8')).dshPluginApi.versions
  const require = createRequire(join(ROOT, 'package.json'))
  const vitest = dirname(require.resolve('vitest/package.json'))
  const root = await mkdtemp(join(tmpdir(), 'dsh-task-matrix-'))
  const reports = []
  try {
    const bundle = join(root, 'bundle')
    const { build } = await import('tsdown')
    await build({ config: false, entry: { 'adaptive-task-host.spec': join(ROOT, 'tests/adaptive-task-host.spec.ts') },
      outDir: bundle, platform: 'node', target: 'es2024', format: 'esm', dts: false, clean: true,
      report: false, logLevel: 'silent', deps: { neverBundle: true },
      define: { __CODEX_CONNECT_VERSION__: JSON.stringify(pkg.version) } })
    const files = (await readdir(bundle)).sort()
    assert.ok(files.length > 0 && files.every(name => name.endsWith('.mjs')))
    const manifest = await Promise.all(files.map(async name => [name, hash(await readFile(join(bundle, name)))]))
    const bundleDigest = hash(JSON.stringify(manifest))
    for (const version of versions) {
      console.error(`Task ${version}: resolving exact runtime`)
      const host = join(root, version)
      await mkdir(join(host, 'tests'), { recursive: true })
      const overrides = await resolveExactDshOverrides(version, readDshRegistryManifest)
      for (const name of TASK_RUNTIME_PACKAGES) assert.equal(overrides[name], version, `Missing Task root: ${name}`)
      const metadata = exactDshFixtureManifest(overrides)
      // This gate exercises the task's actual runtime imports. The separate installed-
      // artifact matrix owns full DSH CLI/profile installation. Keep the complete exact
      // override closure, but do not install every unrelated host UI/remote backend here.
      metadata.dependencies = Object.fromEntries(TASK_RUNTIME_PACKAGES.map(name => [name, version]))
      const adapter = await readDshRegistryManifest('@deepseek-ai/dsh-llm-pi-ai', version)
      metadata.dependencies['@earendil-works/pi-ai'] = adapter.dependencies['@earendil-works/pi-ai']
      metadata.dependencies.undici = pkg.dependencies.undici
      metadata.type = 'module'
      await writeFile(join(host, 'package.json'), JSON.stringify(metadata))
      const env = { ...scrubCanaryEnvironment(process.env), HOME: join(host, 'home'), DSH_HOME: join(host, 'synthetic-home'),
        DSH_TELEMETRY_MODE: 'DISABLED', OTEL_SDK_DISABLED: 'true', npm_config_userconfig: join(host, 'empty.npmrc'),
        npm_config_cache: join(ROOT, 'node_modules/.cache/task-matrix/npm'), TASK_MATRIX_ROOT: host, TASK_MATRIX_VERSION: version }
      delete env.NODE_OPTIONS; delete env.NODE_PATH; delete env.CODEX_HOME
      await mkdir(env.HOME)
      await writeFile(env.npm_config_userconfig, '')
      console.error(`Task ${version}: installing ${TASK_RUNTIME_PACKAGES.length} runtime roots with ${Object.keys(overrides).length} exact DSH overrides`)
      const install = await runBoundedCommand(process.platform === 'win32' ? 'npm.cmd' : 'npm',
        ['install', '--ignore-scripts', '--prefer-offline', '--no-audit', '--no-fund', '--package-lock=false', '--registry=https://registry.npmjs.org'],
        { cwd: host, env, timeoutMs: 600000 })
      if (install.error || install.cleanupError || install.status !== 0) throw new Error(`Task ${version} install failed: ${install.error?.message ?? install.cleanupError?.message ?? install.stderr.slice(-2000)}`)
      const identity = await readTaskHostIdentity(host, version, [...TASK_RUNTIME_PACKAGES, '@earendil-works/pi-ai'])
      // Only the test framework comes from the developer installation. All runtime imports stay in this host.
      for (const name of files) await copyFile(join(bundle, name), join(host, 'tests', name))
      for (const [name, digest] of manifest) assert.equal(hash(await readFile(join(host, 'tests', name))), digest)
      const identitySource = `import {it,expect} from 'vitest';\nimport {writeFileSync} from 'node:fs';\nimport {pathToFileURL} from 'node:url';\nit(${JSON.stringify(TASK_IDENTITY_CASE)}, async()=>{\nconst entries=${JSON.stringify(identity.entries)};\nfor(const [name,path] of Object.entries(entries)){expect(await import(name)).toEqual(await import(pathToFileURL(path).href));}\nwriteFileSync(${JSON.stringify(join(host, 'identity.json'))},JSON.stringify({pid:process.pid,node:process.version,packages:${JSON.stringify(identity.packages)}}));\n});\n`
      await writeFile(join(host, 'tests/task-host-identity.spec.mjs'), identitySource)
      await copyFile(join(ROOT, 'scripts/adaptive-task-matrix-network-guard.mjs'), join(host, 'network-guard.mjs'))
      const config = { root: host, resolve: { alias: [{ find: 'vitest', replacement: join(vitest, 'dist/index.js') }] },
        test: { include: ['tests/*.spec.mjs'], setupFiles: [join(host, 'network-guard.mjs')], pool: 'forks', maxWorkers: 1, fileParallelism: false,
          isolate: false, testTimeout: 30000, hookTimeout: 30000 } }
      await writeFile(join(host, 'vitest.config.mjs'), `export default ${JSON.stringify(config)}\n`)
      console.error(`Task ${version}: running identical task lifecycle cases`)
      const test = await runBoundedCommand(process.execPath, [join(vitest, 'vitest.mjs'), 'run', '--config', join(host, 'vitest.config.mjs'),
        '--reporter=json', '--outputFile', join(host, 'tests.json')], { cwd: host, env, timeoutMs: 180000, maxBuffer: 2*1024*1024 })
      if (test.error || test.cleanupError || test.status !== 0) {
        let diagnostics = ''
        try {
          const raw = await readFile(join(host, 'tests.json'), 'utf8')
          const failed = JSON.parse(raw)
          const cache = join(ROOT, 'node_modules/.cache/task-matrix')
          await mkdir(cache, { recursive: true })
          await writeFile(join(cache, `failure-${version}-${Date.now()}.json`), raw)
          diagnostics = JSON.stringify({ total: failed.numTotalTests, failed: failed.numFailedTests,
            suites: failed.testResults.map(suite => ({ message: suite.message,
              failures: suite.assertionResults.filter(item => item.status === 'failed').map(item => ({ name: item.title, errors: item.failureMessages })) })) })
        } catch (error) { if (error.code !== 'ENOENT') throw error }
        throw new Error(`Task ${version} tests failed:\n${diagnostics.slice(-24000)}\n${test.error?.message ?? test.cleanupError?.message ?? ''}\n${test.stdout.slice(-1000)}\n${test.stderr.slice(-2000)}`)
      }
      const result = inspectTaskTestReport(JSON.parse(await readFile(join(host, 'tests.json'), 'utf8')))
      const actual = JSON.parse(await readFile(join(host, 'identity.json'), 'utf8'))
      assert.deepEqual(actual.packages, identity.packages)
      const network = JSON.parse(await readFile(join(host, 'network.json'), 'utf8'))
      assert.equal(network.pid, actual.pid)
      assert.equal(network.attempts, 0)
      reports.push({ version, bundleDigest, ...result, pid: actual.pid, node: actual.node,
        runtimePackages: Object.fromEntries(Object.entries(actual.packages).filter(([name]) => name.startsWith('@deepseek-ai/dsh'))),
        piAiVersion: actual.packages['@earendil-works/pi-ai'], syntheticOnly: true,
        realProviderDispatches: 0, externalNetworkAttempts: network.attempts })
      console.error(`Task ${version}: passed ${result.cases.length} functional cases and runtime identity`)
      await rm(host, { recursive: true, force: true })
    }
    const report = assertTaskMatrix({ schemaVersion: 1, kind: 'adaptive-task-host-matrix', bundleDigest,
      syntheticOnly: true, adaptiveTaskExercised: true,
      productionDefaultsChanged: false, realProviderDispatches: 0, reports }, versions, bundleDigest)
    if (reportPath) await writeFile(reportPath, JSON.stringify(report, null, 2)+'\n')
    console.log(JSON.stringify(report))
  } finally { await rm(root, { recursive: true, force: true }) }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await main() } catch (error) { console.error(error.stack); process.exitCode = 1 }
}
