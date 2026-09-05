import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const packageEntry = pathToFileURL(resolve('lib/index.js')).href
const child = spawnSync(process.execPath, [
  '--input-type=module',
  '--eval',
  `const symbol = Symbol.for('undici.globalDispatcher.1')
const before = globalThis[symbol]
if (before === undefined || typeof before.dispatch !== 'function') {
  throw new Error('Node did not initialize a usable global fetch dispatcher')
}
await import(process.argv[1])
const after = globalThis[symbol]
if (after !== before) {
  throw new Error(\`package import replaced Node global dispatcher: \${before.constructor?.name ?? 'unknown'} -> \${after?.constructor?.name ?? 'undefined'}\`)
}
process.stdout.write(JSON.stringify({ node: process.version, dispatcher: before.constructor?.name ?? 'unknown' }))`,
  packageEntry,
], {
  encoding: 'utf8',
  env: {
    ...process.env,
    NODE_USE_ENV_PROXY: '1',
    HTTP_PROXY: 'http://127.0.0.1:9',
    HTTPS_PROXY: 'http://127.0.0.1:9',
    NO_PROXY: '',
  },
})

if (child.status !== 0) {
  process.stderr.write(child.stderr)
  process.exit(child.status ?? 1)
}

process.stdout.write(`environment proxy import: ${child.stdout}\n`)
