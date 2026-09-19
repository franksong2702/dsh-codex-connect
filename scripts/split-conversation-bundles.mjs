/** Resolve the exact published DSH browser bundle closure for the Split fixture. */
import { createRequire } from 'node:module'
import { readFile, realpath } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import assert from 'node:assert/strict'
import { SPLIT_BROWSER_SEEDS } from './split-browser-contract.mjs'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
/** Imports must stay in the selected installation, not fall back to the developer checkout. */
export async function assertSplitHostPath(root, path) {
  const actualRoot = await realpath(root)
  const actualPath = await realpath(path)
  const suffix = relative(actualRoot, actualPath)
  assert.ok(suffix && suffix !== '..' && !suffix.startsWith('../') && !suffix.startsWith('..\\') && !isAbsolute(suffix), 'browser dependency escaped its isolated installation')
  return actualPath
}

export async function splitBrowserSeedAliases(root, expectedVersion) {
  const require = createRequire(pathToFileURL(`${resolve(root)}/package.json`))
  const alias = {}; const packages = []
  for (const id of SPLIT_BROWSER_SEEDS) {
    const packagePath = await assertSplitHostPath(root, require.resolve(`${id}/package.json`))
    const manifest = JSON.parse(await readFile(packagePath, 'utf8'))
    assert.equal(manifest.name, id)
    if (id.startsWith('@deepseek-ai/dsh-') && expectedVersion !== undefined) assert.equal(manifest.version, expectedVersion)
    const entry = await assertSplitHostPath(root, require.resolve(id))
    // Directory aliases preserve React subpath resolution and one shared hooks dispatcher.
    alias[id] = dirname(packagePath)
    packages.push({ id, version: manifest.version, sha256: createHash('sha256').update(await readFile(entry)).digest('hex') })
  }
  return { alias, packages }
}

/**
 * Resolve browser module-loader assets and their package-declared client injections.
 * @param root - package root containing the installed dependency closure.
 * @param roots - immediate browser plugins to load.
 * @returns package ids, asset paths, and the order-independent loader manifest.
 */
export async function collectSplitClientBundles(root = ROOT, roots = [
  '@deepseek-ai/dsh-typert-registry',
  '@deepseek-ai/dsh-client-connection',
  '@deepseek-ai/dsh-api-gateway',
  '@deepseek-ai/dsh-api-remotes',
  '@deepseek-ai/dsh-api-session-controller',
  '@deepseek-ai/dsh-client-ui-renderer',
  '@deepseek-ai/dsh-client-ui-session',
  '@deepseek-ai/dsh-client-ui-layout',
  '@deepseek-ai/dsh-client-ui-workspace',
  '@deepseek-ai/dsh-client-ui-conversation',
  '@deepseek-ai/dsh-client-ui-chat',
  '@deepseek-ai/dsh-client-locale',
  '@deepseek-ai/dsh-client-ui-settings',
  '@deepseek-ai/dsh-client-ui-settings-models',
  '@deepseek-ai/dsh-client-ui-settings-plugins',
  '@deepseek-ai/dsh-client-ui-model-selection',
], expectedVersion) {
  const require = createRequire(pathToFileURL(`${resolve(root)}/package.json`))
  const seen = new Set()
  const packages = []
  const missing = []
  const visit = async id => {
    if (seen.has(id)) return
    seen.add(id)
    let packagePath
    try { packagePath = require.resolve(`${id}/package.json`) }
    catch (error) {
      if (error?.code === 'MODULE_NOT_FOUND') { missing.push(id); return }
      throw error
    }
    packagePath = await assertSplitHostPath(root, packagePath)
    const pkg = JSON.parse(await readFile(packagePath, 'utf8'))
    assert.equal(pkg.name, id)
    if (expectedVersion !== undefined) assert.equal(pkg.version, expectedVersion, `mixed browser package: ${id}`)
    const client = pkg.exports?.['./client']
    if (client === undefined) throw new Error(`DSH package has no ./client export: ${id}`)
    const clientPath = await assertSplitHostPath(root, resolve(dirname(packagePath), typeof client === 'string' ? client : client.default))
    packages.push({ id, packagePath, clientPath, version: pkg.version, sha256: createHash('sha256').update(await readFile(clientPath)).digest('hex') })
    for (const dependency of pkg.dsh?.client?.inject ?? []) await visit(dependency)
  }
  for (const id of roots) await visit(id)
  return { packages, missing, assets: packages.map(item => ({ id: item.id, fileName: `${item.id.replaceAll('/', '__').replaceAll('@', '')}.js`, path: item.clientPath })) }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(await collectSplitClientBundles(), null, 2))
}
