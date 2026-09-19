/** Build a local upstream DSH repair; never changes a user's installation. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { cp, lstat, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { runBoundedCommand } from './bounded-command.mjs'
import { scrubCanaryEnvironment } from './canary-environment.mjs'
import { exactDshFixtureManifest, readDshRegistryManifest, resolveExactDshOverrides } from './exact-dsh-fixture.mjs'

export const REPAIR_PACKAGE = '@deepseek-ai/dsh-plugin-manager'
export const REPAIR_VERSION = '0.1.6-alpha.2'
export const REPAIR_UPSTREAM_REF = 'ddefc45fbc7f8e46dd73185e68295696d1297887'
export const REPAIR_SOURCE_PATH = 'packages/boot/plugin-manager/src/operations.ts'
export const REPAIR_MODULE_PATH = 'lib/types/operations.js'
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')

/** Exact source transform: refuse a different implementation or double application. */
export function repairOperations(source) {
  const edits = [
    ['  resolveBundleDir, resolveProfileDir, loadOverlayPatches, type ProfileManifest,\n',
      '  resolveBundleDir, resolveProfileDir, loadOverlayPatches, type ProfileManifest,\n  healIsolatedProfileModuleFallback, loadProfileDirectory,\n'],
    ['    return runProfilePnpm(context, args, options)\n',
      "    if (options.execution === 'cli' && args[0] === 'exec') {\n"
      + '      options.signal?.throwIfAborted()\n'
      + '      // A child process cannot inherit the running profile resolver. Use the\n'
      + '      // host-owned disk projection for this explicit cross-process command,\n'
      + '      // under the existing profile writer lock; ordinary boot stays runtime-only.\n'
      + "      const profile = loadProfileDirectory('dsh', dir, context.installAnchor, { userLayer: false })\n"
      + '      healIsolatedProfileModuleFallback({ installAnchor: context.installAnchor, profile })\n'
      + '      options.signal?.throwIfAborted()\n'
      + '    }\n'
      + '    return runProfilePnpm(context, args, options)\n'],
  ]
  assert.ok(!source.includes('A child process cannot inherit'), 'repair already applied')
  for (const [before, after] of edits) {
    assert.equal(source.split(before).length, 2, 'upstream source no longer matches the reviewed patch')
    source = source.replace(before, after)
  }
  return source
}

/** Only an explicit caller may admit a hashed candidate; no environment flag enables it. */
export async function validateRepairCandidate(candidate, dshVersion, allowUndeclared) {
  if (candidate === undefined) return undefined
  assert.equal(dshVersion, REPAIR_VERSION, 'repair is only for the exact alpha.2 host')
  assert.equal(allowUndeclared, true, 'repair must not enter declared-host regression evidence')
  assert.ok(candidate && typeof candidate === 'object' && !Array.isArray(candidate), 'invalid repair descriptor')
  assert.deepEqual(Object.keys(candidate).sort(), ['moduleSha256', 'tarballPath', 'tarballSha256'])
  assert.ok(typeof candidate.tarballPath === 'string' && isAbsolute(candidate.tarballPath))
  for (const value of [candidate.moduleSha256, candidate.tarballSha256]) assert.match(value, /^[a-f0-9]{64}$/u)
  const info = await lstat(candidate.tarballPath)
  assert.ok(info.isFile() && !info.isSymbolicLink() && info.size > 0 && info.size < 16 * 1024 * 1024)
  assert.equal(sha256(await readFile(candidate.tarballPath)), candidate.tarballSha256, 'repair artifact changed')
  return { ...candidate }
}

async function run(command, args, cwd, env, accepted = [0]) {
  const result = await runBoundedCommand(command, args, { cwd, env, timeoutMs: 15 * 60 * 1000, maxBuffer: 8 * 1024 * 1024 })
  assert.equal(result.error, undefined, `${command} did not complete`)
  assert.equal(result.cleanupError, undefined)
  if (!accepted.includes(result.status)) throw new Error(`${command} failed with exit ${result.status}: ${result.stderr.slice(-2000)}`)
  return result
}

/** Rebuild one upstream module, then install the packed candidate in a NEW host. */
async function main() {
  const output = resolve(process.argv[2] ?? '.issue211-artifacts')
  assert.ok(output.startsWith(`${ROOT}/`), 'output must be in this working checkout')
  await mkdir(output, { recursive: true })
  const root = await mkdtemp(join(tmpdir(), 'issue211-upstream-build-'))
  const env = { ...scrubCanaryEnvironment(process.env), DSH_HOME: join(root, 'empty-home'), DSH_TELEMETRY_MODE: 'DISABLED', OTEL_SDK_DISABLED: 'true' }
  try {
    process.stderr.write('Preparing exact upstream package source and dependency closure\n')
    // gh only reads public source. Its credentials are never given to installed-package processes.
    const sourceResult = await run('gh', ['api', `repos/deepseek-ai/deepseek-harness/contents/${REPAIR_SOURCE_PATH}?ref=${REPAIR_UPSTREAM_REF}`], ROOT, process.env)
    const source = Buffer.from(JSON.parse(sourceResult.stdout).content, 'base64').toString('utf8')
    const patched = repairOperations(source)
    await writeFile(join(root, 'before.ts'), source)
    await writeFile(join(root, 'after.ts'), patched)
    const diff = await run('diff', ['-u', '--label', `a/${REPAIR_SOURCE_PATH}`, '--label', `b/${REPAIR_SOURCE_PATH}`, join(root, 'before.ts'), join(root, 'after.ts')], ROOT, env, [1])
    await mkdir(join(ROOT, 'patches'), { recursive: true })
    await writeFile(join(ROOT, 'patches/dsh-0.1.6-alpha.2-plugin-exec.patch'), diff.stdout)
    const pins = await resolveExactDshOverrides(REPAIR_VERSION, readDshRegistryManifest)
    const buildHost = join(root, 'build-host')
    await mkdir(buildHost)
    await writeFile(join(buildHost, 'package.json'), JSON.stringify(exactDshFixtureManifest(pins)))
    await run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false'], buildHost, env)
    const manager = join(buildHost, 'node_modules', REPAIR_PACKAGE)
    const manifest = JSON.parse(await readFile(join(manager, 'package.json'), 'utf8'))
    assert.equal(manifest.name, REPAIR_PACKAGE)
    assert.equal(manifest.version, REPAIR_VERSION)
    const originalModule = await readFile(join(manager, REPAIR_MODULE_PATH), 'utf8')
    const baselineResult = await run(process.execPath, [join(ROOT, 'scripts/issue-211-repair-tests.mjs'), join(buildHost, 'package.json'), '--baseline'], ROOT, env)
    const baseline = JSON.parse(baselineResult.stdout.trim())
    assert.equal(baseline.status, 'passed')
    const compiled = ts.transpileModule(patched, { fileName: 'operations.ts', reportDiagnostics: true,
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, sourceMap: true, inlineSources: true } })
    assert.ok(!(compiled.diagnostics ?? []).some(d => d.category === ts.DiagnosticCategory.Error), 'repair compilation failed')
    // Only this build directory is edited; acceptance below installs the resulting tarball normally.
    await writeFile(join(manager, REPAIR_MODULE_PATH), compiled.outputText)
    await writeFile(join(manager, `${REPAIR_MODULE_PATH}.map`), compiled.sourceMapText)
    const tests = await run(process.execPath, [join(ROOT, 'scripts/issue-211-repair-tests.mjs'), join(buildHost, 'package.json')], ROOT, env)
    const regression = JSON.parse(tests.stdout.trim())
    assert.equal(regression.status, 'passed')
    const candidateDir = join(root, 'candidate')
    await cp(manager, candidateDir, { recursive: true })
    const packed = JSON.parse((await run('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', output], candidateDir, env)).stdout)
    assert.equal(packed.length, 1)
    assert.equal(packed[0].name, REPAIR_PACKAGE)
    const tarballPath = join(output, packed[0].filename)
    const candidate = { tarballPath, tarballSha256: sha256(await readFile(tarballPath)), moduleSha256: sha256(compiled.outputText) }
    await writeFile(join(output, 'candidate.json'), `${JSON.stringify(candidate, null, 2)}\n`)
    process.stderr.write('Testing a fresh alpha.2 installation with the explicitly identified repaired package\n')
    process.env.DSH_VERSION = REPAIR_VERSION
    process.env.DSH_UNDECLARED_CANARY_VERSION = '1'
    const { checkDshInstall } = await import('./check-dsh-install.mjs')
    const installation = await checkDshInstall({ pluginManagerCandidate: candidate })
    const report = { schemaVersion: 1, status: 'passed', upstreamRef: REPAIR_UPSTREAM_REF,
      upstreamSourceSha256: sha256(source), repairedSourceSha256: sha256(patched), originalModuleSha256: sha256(originalModule),
      repairedModuleSha256: candidate.moduleSha256, candidateArtifactSha256: candidate.tarballSha256,
      baseline, regression, installation, stockAlpha2Fixed: false, realProviderRequests: 0 }
    await writeFile(join(output, 'repair-validation.json'), `${JSON.stringify(report, null, 2)}\n`)
    console.log(JSON.stringify(report))
  } finally { await rm(root, { recursive: true, force: true }) }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(`issue-211-repair: ${error.message}`); process.exitCode = 1 })
}
