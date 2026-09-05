import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const packageEntry = pathToFileURL(resolve('lib/index.js')).href
const child = spawnSync(process.execPath, [
  '--input-type=module',
  '--eval',
  `const symbol = Symbol.for('undici.globalDispatcher.1')
const before = globalThis[symbol]
if (before !== undefined && typeof before.dispatch !== 'function') {
  throw new Error('Node initialized an unusable global fetch dispatcher')
}
const beforeName = before?.constructor?.name
const nodeMajor = Number.parseInt(process.versions.node.split('.')[0] ?? '', 10)
await import(process.argv[1])
const after = globalThis[symbol]
if (nodeMajor >= 24 && before === undefined) {
  throw new Error('Node did not initialize an environment-proxy dispatcher')
}
if (nodeMajor >= 24 && after !== before) {
  throw new Error(\`package import replaced Node global dispatcher: \${beforeName} -> \${after?.constructor?.name ?? 'undefined'}\`)
}
const { fetch } = await import('undici')
try {
  await fetch('http://127.0.0.1:65534', { signal: AbortSignal.timeout(2_000) })
} catch (error) {
  let cause = error
  while (typeof cause === 'object' && cause !== null) {
    if (cause.code === 'UND_ERR_INVALID_ARG') throw cause
    cause = cause.cause
  }
}
process.stdout.write(JSON.stringify({
  node: process.version,
  dispatcher: beforeName ?? 'none',
  preserved: before === undefined ? undefined : after === before,
}))`,
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
