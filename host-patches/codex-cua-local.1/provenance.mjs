/** Verify the whole input package against an integrity-pinned published tarball. */
import { createHash } from 'node:crypto'
import { cp, lstat, readdir, readFile, mkdir, writeFile, mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

export function assertClosure(dependencies, lock, spec) {
  const names = Object.keys(dependencies).filter(name => /^@deepseek-ai\/dsh(?:-[a-z0-9-]+)?$/u.test(name)).sort()
  const locked = Object.keys(lock.packages).sort()
  if (lock.baseVersion !== spec.baseVersion || names.length !== locked.length || names.some((name, index) => name !== locked[index])) throw new Error('Published closure is incomplete or contains unexpected packages')
  for (const [name, patch] of Object.entries(spec.packages)) {
    if (!names.includes(name) || patch.baseIntegrity !== lock.packages[name].integrity) throw new Error(`Patched package provenance missing or mismatched: ${name}`)
  }
  for (const name of names) {
    const entry = lock.packages[name]
    const short = name.slice('@deepseek-ai/'.length)
    if (entry.version !== spec.baseVersion || entry.tarball !== `https://registry.npmjs.org/@deepseek-ai/${short}/-/${short}-${spec.baseVersion}.tgz` || !/^sha512-[A-Za-z0-9+/]+={0,2}$/u.test(entry.integrity)) throw new Error(`Invalid published lock: ${name}`)
    if (dependencies[name] !== spec.baseVersion) throw new Error(`Published dependency is not exactly pinned: ${name}`)
  }
  return names
}

/** Preserve required-over-optional priority in the isolated candidate, including platform packages. */
export function localDependencyLayout(input, names, thirdParty = {}) {
  const dependencies = { ...thirdParty }, optionalDependencies = {}, overrides = {}
  for (const name of names) {
    const value = overrides[name] = `file:../packages/${name.slice('@deepseek-ai/'.length)}`
    if (Object.hasOwn(input.dependencies ?? {}, name)) dependencies[name] = value
    else if (Object.hasOwn(input.optionalDependencies ?? {}, name)) optionalDependencies[name] = value
  }
  return { dependencies, optionalDependencies, overrides, pnpm: { overrides } }
}

/** Required paths come from verified published metadata, never caller omission. */
export function assertRequiredInstalled(required, installed) {
  for (const name of required) if (!installed.has(name)) throw new Error(`Required published package is not installed: ${name}`)
}

/** The only source-only omission supported by this exact macOS candidate. */
export function mayCopyPlatformSource(name, input, platform = process.platform) {
  return platform !== 'darwin' && name === '@deepseek-ai/dsh-experimental-cua-macos'
    && !Object.hasOwn(input.dependencies ?? {}, name)
    && (Object.hasOwn(input.optionalDependencies ?? {}, name) || Object.hasOwn(input.overrides ?? {}, name))
}

export function assertIntegrity(bytes, integrity) {
  if (`sha512-${createHash('sha512').update(bytes).digest('base64')}` !== integrity) throw new Error('Published tarball integrity mismatch')
}

export async function publishedTarball(cache, name, entry) {
  await mkdir(cache, { recursive: true })
  const file = join(cache, `${name.slice('@deepseek-ai/'.length)}-${entry.version}.tgz`)
  let bytes
  try { bytes = await readFile(file) } catch (error) { if (error.code !== 'ENOENT') throw error }
  if (bytes === undefined) {
    const response = await fetch(entry.tarball, { redirect: 'error', signal: AbortSignal.timeout(30_000) })
    if (!response.ok) throw new Error(`Published tarball download failed (${response.status}): ${name}`)
    bytes = Buffer.from(await response.arrayBuffer())
    assertIntegrity(bytes, entry.integrity)
    await writeFile(file, bytes, { flag: 'wx' })
  }
  assertIntegrity(bytes, entry.integrity)
  return file
}

function tar(args) {
  const result = spawnSync('tar', args, { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 })
  if (result.error || result.status !== 0) throw new Error(`Published archive validation failed: ${result.error?.message ?? result.stderr}`)
  return result.stdout
}

async function inventory(directory) {
  const entries = []
  async function visit(root, prefix = '') {
    for (const item of (await readdir(root, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      if (item.name === 'node_modules' || item.name === '.build') continue
      const file = join(root, item.name), path = `${prefix}${item.name}`
      const stat = await lstat(file)
      if (stat.isDirectory()) await visit(file, `${path}/`)
      else if (stat.isFile()) entries.push([path, createHash('sha256').update(await readFile(file)).digest('hex'), stat.mode & 0o111])
      else throw new Error(`Published package contains unsupported filesystem entry: ${path}`)
    }
  }
  await visit(directory)
  return JSON.stringify(entries)
}

async function withPublishedPackage(archive, integrity, temporaryRoot, use) {
  const bytes = await readFile(archive)
  assertIntegrity(bytes, integrity)
  const directory = await mkdtemp(join(temporaryRoot, 'published-'))
  const snapshot = join(directory, 'source.tgz'), extracted = join(directory, 'package')
  try {
    // Validate and extract the same integrity-checked private snapshot.
    await writeFile(snapshot, bytes, { flag: 'wx', mode: 0o400 })
    const names = tar(['-tzf', snapshot]).trim().split('\n')
    if (!names.length || names.some(name => !/^package(?:\/|$)/u.test(name) || name.split('/').some(part => part === '..' || part === '.') || name.includes('\\'))) throw new Error('Unsafe published archive path')
    if (tar(['-tvzf', snapshot]).trim().split('\n').some(line => !/^[-d]/u.test(line))) throw new Error('Published archive links or special files are unsupported')
    await mkdir(extracted)
    tar(['-xzf', snapshot, '-C', extracted, '--strip-components=1'])
    return await use(extracted)
  } finally { await rm(directory, { recursive: true, force: true }) }
}

export async function verifyPublishedPackage(input, archive, integrity, temporaryRoot) {
  return withPublishedPackage(archive, integrity, temporaryRoot, async extracted => {
    if (await inventory(input) !== await inventory(extracted)) throw new Error('Complete published package contents mismatch')
  })
}

/** Source only: materialize a skipped optional package without installing or executing it. */
export async function copyVerifiedPublishedPackage(archive, integrity, destination, temporaryRoot) {
  return withPublishedPackage(archive, integrity, temporaryRoot, async extracted => {
    await cp(extracted, destination, { recursive: true, dereference: false, force: false, errorOnExist: true })
    if (await inventory(destination) !== await inventory(extracted)) throw new Error('Complete published source copy mismatch')
  })
}
