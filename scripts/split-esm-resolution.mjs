/** Resolve the exact ESM provider seen by the isolated experiment and its host adapter. */
import assert from 'node:assert/strict'
import { readFile, realpath } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

// The checker is launched with --experimental-import-meta-resolve so Node honors
// the explicit parent URL. require.resolve would select the wrong export condition.
export async function resolveSplitPiAi(root, adapterEntry) {
  const canonicalRoot = await realpath(root)
  const within = async path => {
    const resolved = await realpath(path)
    const suffix = relative(canonicalRoot, resolved)
    assert.ok(suffix && !isAbsolute(suffix) && suffix !== '..' && !suffix.startsWith('../') && !suffix.startsWith('..\\'), 'Split ESM dependency escaped its isolated installation')
    return resolved
  }
  const resolveFrom = async parent => within(fileURLToPath(import.meta.resolve('@earendil-works/pi-ai', pathToFileURL(parent).href)))
  const entry = await resolveFrom(join(canonicalRoot, 'experiment', 'resolver.mjs'))
  const adapterProvider = await resolveFrom(await within(adapterEntry))
  assert.equal(adapterProvider, entry, 'adapter and experiment must use the same pi-ai installation')
  // The verified pi-ai manifests place their import entry in dist/. Inspect the
  // local manifest as data; package.json is intentionally not a public export.
  const manifest = JSON.parse(await readFile(await within(join(dirname(entry), '..', 'package.json')), 'utf8'))
  assert.equal(manifest.name, '@earendil-works/pi-ai')
  assert.equal(typeof manifest.version, 'string')
  assert.ok(manifest.version.length > 0)
  return { entry, version: manifest.version }
}
