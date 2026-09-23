/** Exact public manifests cached for disposable acceptance only, never production resolution. */
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { readDshRegistryManifest } from './exact-dsh-fixture.mjs'
export function cachedTaskRegistry(directory) {
  return async (name, version) => {
    const filename = join(directory, createHash('sha256').update(name + '@' + version).digest('hex') + '.json')
    const valid = value => value?.name === name && value.version === version
    try { const value = JSON.parse(await readFile(filename, 'utf8')); if (valid(value)) return value }
    catch (error) { if (error.code !== 'ENOENT') throw error }
    let last
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const value = await readDshRegistryManifest(name, version)
        if (!valid(value)) throw new Error('Exact registry identity mismatch')
        await mkdir(directory, { recursive: true }); await writeFile(filename, JSON.stringify(value)); return value
      } catch (error) { last = error }
    }
    throw new Error(`Public manifest unavailable: ${name}@${version}`, { cause: last })
  }
}
