import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)
const contract = JSON.parse(await readFile(new URL('../compatibility.json', import.meta.url), 'utf8'))
const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const expected = new Map([
  ...contract.dshPluginApi.packages.map(name => [name, contract.dshPluginApi.version]),
])

function parseAlpha(version) {
  const match = /^0\.1\.0-alpha\.(\d+(?:\.\d+)*)$/u.exec(version)
  if (match === null) throw new Error(`unsupported alpha version: ${version}`)
  return match[1].split('.').map(Number)
}

function compareParts(left, right) {
  const length = Math.max(left.length, right.length)
  for (let index = 0; index < length; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0)
    if (difference !== 0) return Math.sign(difference)
  }
  return 0
}

function rangeIncludes(version, range) {
  const match = /^>=([^ ]+) <([^ ]+)$/u.exec(range)
  if (match === null) throw new Error(`unsupported core peer range: ${range}`)
  const actual = parseAlpha(version)
  return compareParts(actual, parseAlpha(match[1])) >= 0
    && compareParts(actual, parseAlpha(match[2])) < 0
}

async function findPackage(name) {
  let current = dirname(require.resolve(name))
  for (let depth = 0; depth < 12; depth += 1) {
    try {
      const value = JSON.parse(await readFile(join(current, 'package.json'), 'utf8'))
      if (value.name === name) return value
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
    const parent = dirname(current)
    if (parent === current) break
    current = parent
  }
  throw new Error(`could not locate package metadata for ${name}`)
}

const packages = {}
const core = await findPackage(contract.core.package)
if (!rangeIncludes(core.version, contract.core.version)) {
  throw new Error(`${contract.core.package} ${core.version} does not satisfy ${contract.core.version}`)
}
packages[contract.core.package] = {
  installed: core.version,
  supported: contract.core.version,
  status: 'compatible',
}
for (const [name, supported] of expected) {
  const installed = (await findPackage(name)).version
  if (installed !== supported) throw new Error(`${name} version mismatch: expected ${supported}, got ${installed}`)
  packages[name] = { installed, supported, status: 'compatible' }
}

process.stdout.write(`${JSON.stringify({
  schemaVersion: contract.schemaVersion,
  package: manifest.name,
  version: manifest.version,
  status: 'compatible',
  packages,
})}\n`)
