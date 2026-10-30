/** Reproduce a distinct local candidate from a verified, isolated published Host. Never deploys. */
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { dirname, join, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { assertClosure, publishedTarball, verifyPublishedPackage, copyVerifiedPublishedPackage, localDependencyLayout, assertRequiredInstalled, mayCopyPlatformSource } from './provenance.mjs'
import { resolveExactDshOverrides } from '../../scripts/exact-dsh-fixture.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const spec = JSON.parse(await readFile(join(here, 'manifest.json'), 'utf8'))
const lock = JSON.parse(await readFile(join(here, 'published-lock.json'), 'utf8'))
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
const thirdParty = { '@deepseek-ai/cordis': '4.0.6-alpha.1', '@deepseek-ai/schemastery': '3.18.6-alpha.1', '@deepseek-ai/cordis-plugin-loader': '1.0.7-alpha.1', '@deepseek-ai/cordis-plugin-include': '1.0.11-alpha.1' }
function command(binary, args, cwd) {
  const result = spawnSync(binary, args, { cwd, stdio: 'inherit' })
  if (result.status !== 0) throw new Error(`${binary} failed (${result.status ?? 'unknown'})`)
}

export async function prepareLocalHost(publishedFixture, output, { native = false } = {}) {
  const source = resolve(publishedFixture), target = resolve(output)
  // No overwrite path: each attempted candidate has a separate evidence directory.
  await mkdir(target)
  const require = createRequire(join(source, 'package.json'))
  const input = JSON.parse(await readFile(join(source, 'package.json'), 'utf8'))
  const names = assertClosure({ ...input.overrides, ...input.optionalDependencies, ...input.dependencies }, lock, spec)
  const packages = join(target, 'packages')
  await mkdir(packages)
  const originalMetadata = new Map(), installed = new Set()
  let verified = 0
  for (const name of names) {
    const archive = await publishedTarball(join(source, 'verified-tarballs'), name, lock.packages[name])
    const destination = join(packages, name.slice('@deepseek-ai/'.length))
    let original
    // This optional backend can be installed only under its owning bundle.
    const packageRequire = name === '@deepseek-ai/dsh-experimental-cua-macos'
      ? createRequire(require.resolve('@deepseek-ai/dsh-cua-bundle/package.json')) : require
    try { original = packageRequire.resolve(`${name}/package.json`) } catch (error) {
      if (error.code !== 'MODULE_NOT_FOUND' || !mayCopyPlatformSource(name, input)) throw error
    }
    if (original) {
      await cp(dirname(original), destination, { recursive: true, dereference: false,
        filter: path => !relative(dirname(original), path).split(/[\\/]/u).some(part => part === 'node_modules' || part === '.build') })
      // Verify the copied bytes we will actually patch, not an earlier mutable input.
      await verifyPublishedPackage(destination, archive, lock.packages[name].integrity, target)
      installed.add(name)
    } else {
      await copyVerifiedPublishedPackage(archive, lock.packages[name].integrity, destination, target)
    }
    const metadata = JSON.parse(await readFile(join(destination, 'package.json'), 'utf8'))
    if (metadata.name !== name || metadata.version !== spec.baseVersion) throw new Error(`Not the original exact package: ${name}`)
    if (!original && (!Array.isArray(metadata.os) || metadata.os.length !== 1 || metadata.os[0] !== 'darwin')) throw new Error('Source-only backend is not exclusively Darwin')
    originalMetadata.set(name, structuredClone(metadata))
    const patch = spec.packages[name]
    if (patch) {
      const patchBytes = await readFile(join(here, patch.patch))
      if (sha256(patchBytes) !== patch.patchSha256) throw new Error(`Patch identity mismatch: ${name}`)
      for (const file of patch.files) {
        const bytes = await readFile(join(destination, file.path)).catch(error => { if (error.code === 'ENOENT') return undefined; throw error })
        if ((bytes === undefined ? null : sha256(bytes)) !== file.baseSha256) throw new Error(`Original source mismatch: ${name}/${file.path}`)
      }
      command('patch', ['--batch', '--fuzz=0', '-p1', '-i', join(here, patch.patch)], destination)
      for (const file of patch.files) if (sha256(await readFile(join(destination, file.path))) !== file.patchedSha256) throw new Error(`Patched source mismatch: ${name}/${file.path}`)
    }
    metadata.version = spec.candidateVersion
    metadata.private = true
    for (const field of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
      for (const dependency of Object.keys(metadata[field] ?? {})) if (names.includes(dependency)) metadata[field][dependency] = spec.candidateVersion
    }
    metadata.dshLocalCandidate = { id: spec.id, baseVersion: spec.baseVersion, published: false,
      sourcePatchSha256: patch?.patchSha256 ?? null }
    await writeFile(join(destination, 'package.json'), `${JSON.stringify(metadata, null, 2)}\n`)
    if (++verified % 50 === 0 || verified === names.length) process.stderr.write(`Verified and prepared ${verified}/${names.length} complete published packages\n`)
  }
  // Recompute required paths from integrity-verified package metadata. An input
  // cannot disguise a missing required package as an overrides-only optional.
  const publishedGraph = await resolveExactDshOverrides(spec.baseVersion, async name => originalMetadata.get(name))
  assertClosure(publishedGraph.overrides, lock, spec)
  assertRequiredInstalled(Object.keys(publishedGraph.dependencies), installed)
  if (process.platform === 'darwin') assertRequiredInstalled(['@deepseek-ai/dsh-experimental-cua-macos'], installed)
  const nativeRoot = join(packages, 'dsh-experimental-cua-macos', 'native')
  let nativeSha256 = null
  if (native) {
    if (process.platform !== 'darwin' || process.arch !== 'arm64') throw new Error('This local native candidate targets macOS arm64 only')
    const { readdir } = await import('node:fs/promises')
    const sourceDir = join(nativeRoot, 'Sources/CuaNative')
    const sources = (await readdir(sourceDir)).filter(name => name.endsWith('.swift')).sort().map(name => join(sourceDir, name))
    const binary = join(nativeRoot, 'bin/darwin-arm64/dsh-cua-native')
    await mkdir(dirname(binary), { recursive: true })
    process.stderr.write('Compiling local macOS arm64 native helper; it will not be executed\n')
    command('xcrun', ['swiftc', '-O', '-whole-module-optimization', '-swift-version', '6', '-parse-as-library',
      '-module-name', 'CuaNative', '-target', 'arm64-apple-macos14.0', '-module-cache-path', join(target, 'compiler-cache'), ...sources, '-o', binary], target)
    nativeSha256 = sha256(await readFile(binary))
  }
  const runtime = join(target, 'runtime')
  await mkdir(runtime)
  await writeFile(join(runtime, 'package.json'), `${JSON.stringify({ private: true, ...localDependencyLayout(input, names, thirdParty) }, null, 2)}\n`)
  const report = { schemaVersion: 1, id: spec.id, baseVersion: spec.baseVersion, version: spec.candidateVersion,
    published: false, dshPackages: names.length, patchManifestSha256: sha256(await readFile(join(here, 'manifest.json'))),
    sourceLockSha256: sha256(await readFile(join(here, 'published-lock.json'))), wholePublishedPackagesVerified: names.length,
    nativeBuilt: native, nativeSha256, nativeExecuted: false, deployed: false }
  await writeFile(join(target, 'candidate.json'), `${JSON.stringify(report, null, 2)}\n`)
  return report
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [, , source, output, flag] = process.argv
  if (!source || !output || flag && flag !== '--native') throw new Error('usage: prepare-local-host <isolated-published-fixture> <new-output-directory> [--native]')
  process.stdout.write(`${JSON.stringify(await prepareLocalHost(source, output, { native: flag === '--native' }))}\n`)
}
