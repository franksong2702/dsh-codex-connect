/** Compile the reviewed production policy against real synthetic file metadata; no driver or desktop. */
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { publishedTarball, copyVerifiedPublishedPackage } from '../host-patches/codex-cua-local.1/provenance.mjs'
import { runBoundedCommand } from './bounded-command.mjs'
import { scrubCanaryEnvironment } from './canary-environment.mjs'

if (process.platform !== 'darwin') throw new Error('The native executable identity fixture requires macOS')
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const lineage = join(root, 'host-patches/codex-cua-local.1')
const spec = JSON.parse(await readFile(join(lineage, 'manifest.json'), 'utf8'))
const lock = JSON.parse(await readFile(join(lineage, 'published-lock.json'), 'utf8'))
const name = '@deepseek-ai/dsh-experimental-cua-macos'
const patch = spec.packages[name], entry = lock.packages[name]
const hash = data => createHash('sha256').update(data).digest('hex')
if (entry.version !== spec.baseVersion || entry.integrity !== patch.baseIntegrity) throw new Error('Native source provenance mismatch')
const temporary = await mkdtemp(join(tmpdir(), 'codex-executable-identity-'))
const source = join(temporary, 'source')
const env = scrubCanaryEnvironment(process.env)
async function command(binary, args, cwd = temporary) {
  const result = await runBoundedCommand(binary, args, { cwd, env, timeoutMs: 180_000 })
  if (result.status !== 0 || result.error) throw new Error(`Native identity fixture failed: ${result.stderr}\n${result.stdout}`)
  return result.stdout
}
try {
  const archive = await publishedTarball(process.env.DSH_CUA_TARBALL_CACHE ?? join(temporary, 'cache'), name, entry)
  await copyVerifiedPublishedPackage(archive, entry.integrity, source, temporary)
  const patchPath = join(lineage, patch.patch)
  if (hash(await readFile(patchPath)) !== patch.patchSha256) throw new Error('Native patch identity mismatch')
  for (const file of patch.files) {
    let bytes
    try { bytes = await readFile(join(source, file.path)) } catch (error) { if (error.code !== 'ENOENT') throw error }
    if ((bytes === undefined ? null : hash(bytes)) !== file.baseSha256) throw new Error('Native original file mismatch')
  }
  await command('patch', ['--batch', '--fuzz=0', '-p1', '-i', patchPath], source)
  for (const file of patch.files) if (hash(await readFile(join(source, file.path))) !== file.patchedSha256) throw new Error('Native patched file mismatch')
  const binary = join(temporary, 'executable-identity-fixture')
  await command('xcrun', ['swiftc', '-swift-version', '6', '-module-cache-path', join(temporary, 'module-cache'),
    join(source, 'native/Sources/CuaNative/ExecutableIdentity.swift'),
    join(lineage, 'ExecutableIdentityFixture.swift'), '-o', binary])
  process.stdout.write(await command(binary, []))
  const policy = join(source, 'native/Sources/CuaNative/ChromeInputPolicy.swift')
  if (spec.candidateVersion.endsWith('codex-cua-local.7')) {
    if (hash(await readFile(policy)) !== hash(await readFile(join(lineage, 'ChromeInputPolicy.swift')))) throw new Error('Pure input policy differs from reviewed native source')
    const protocol = await readFile(join(source, 'native/Sources/CuaNative/Protocol.swift'), 'utf8')
    const boundary = protocol.indexOf('struct NativeRequest:')
    if (boundary < 0) throw new Error('Native value-only fixture boundary missing')
    const types = join(temporary, 'value-types.swift')
    await writeFile(types, protocol.slice(0, boundary))
    const inputBinary = join(temporary, 'chrome-input-policy-fixture')
    await command('xcrun', ['swiftc', '-swift-version', '6', '-module-cache-path', join(temporary, 'module-cache'),
      types, policy, join(source, 'native/Sources/CuaNative/ExecutableIdentity.swift'),
      join(source, 'native/Sources/CuaNative/BalancedInputSequence.swift'), join(lineage, 'ChromeInputFixture.swift'), '-o', inputBinary])
    process.stdout.write(await command(inputBinary, [join(lineage, 'chrome-input-cases.json')]))
  }
  process.stdout.write(`${JSON.stringify({ candidate: spec.candidateVersion, nativeDriverExecuted: false, desktopActions: 0, realModels: 0, sourceIntegrityVerified: true })}\n`)
} finally { await rm(temporary, { recursive: true, force: true }) }
