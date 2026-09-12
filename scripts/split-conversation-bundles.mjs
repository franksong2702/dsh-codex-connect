/** Resolve the exact published DSH browser bundle closure for the Split fixture. */
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(pathToFileURL(`${ROOT}/package.json`))

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
]) {
  const seen = new Set()
  const packages = []
  const missing = []
  const visit = async id => {
    if (seen.has(id)) return
    seen.add(id)
    let packagePath
    try { packagePath = require.resolve(`${id}/package.json`, { paths: [root] }) }
    catch (error) {
      if (error?.code === 'MODULE_NOT_FOUND') { missing.push(id); return }
      throw error
    }
    const pkg = JSON.parse(await readFile(packagePath, 'utf8'))
    const client = pkg.exports?.['./client']
    if (client === undefined) throw new Error(`DSH package has no ./client export: ${id}`)
    const clientPath = resolve(dirname(packagePath), typeof client === 'string' ? client : client.default)
    packages.push({ id, packagePath, clientPath })
    for (const dependency of pkg.dsh?.client?.inject ?? []) await visit(dependency)
  }
  for (const id of roots) await visit(id)
  return { packages, missing, assets: packages.map(item => ({ id: item.id, fileName: `${item.id.replaceAll('/', '__').replaceAll('@', '')}.js`, path: item.clientPath })) }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(await collectSplitClientBundles(), null, 2))
}
