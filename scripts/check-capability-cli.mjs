/** Built-plane keyless CLI checks, including a real owned proxy socket. */
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runBoundedCommand } from './bounded-command.mjs'

const root = await mkdtemp(join(tmpdir(), 'codex-capability-cli-'))
const bin = fileURLToPath(new URL('../lib/bin.js', import.meta.url))
const authFile = join(root, '.openai-codex-auth.json')
const credential = JSON.stringify({ version: 1, credential: {
  type: 'oauth', access: 'fixture-private-access', refresh: 'fixture-private-refresh',
  accountId: 'fixture-private-account', expires: Date.now() + 60_000,
} })
const server = createServer()
const sockets = new Set()
let connects = 0
server.on('connection', socket => {
  sockets.add(socket)
  socket.on('close', () => sockets.delete(socket))
})
server.on('connect', (_req, socket) => {
  connects += 1
  socket.end('HTTP/1.1 407 Proxy Authentication Required\r\nContent-Length: 0\r\nConnection: close\r\n\r\n')
})
const env = Object.fromEntries(['PATH', 'SystemRoot', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP'].flatMap(key => process.env[key] === undefined ? [] : [[key, process.env[key]]]))
env.DSH_HOME = root

async function command(action, args) {
  const result = await runBoundedCommand(process.execPath, [bin, action, ...args, '--json'], { env, timeoutMs: 10_000 })
  assert.equal(result.error, undefined)
  assert.equal(result.cleanupError, undefined)
  assert.equal(result.signal, null)
  assert.equal(result.stderr, '')
  for (const secret of [root, 'fixture-private-access', 'fixture-private-account', 'fixture-private-refresh']) assert.ok(!result.stdout.includes(secret))
  return { code: result.status, report: JSON.parse(result.stdout) }
}

try {
  const offline = await command('capabilities', ['--model', 'gpt-5.6-sol'])
  assert.equal(offline.code, 1)
  assert.equal(offline.report.checks.runtime.status, 'supported')
  assert.equal(offline.report.probe.state, 'not-requested')
  await writeFile(authFile, credential, { mode: 0o600 })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  assert.ok(address !== null && typeof address !== 'string')
  const probed = await command('capabilities', ['--model', 'gpt-5.6-sol', '--probe', '--proxy', `http://127.0.0.1:${address.port}`, '--timeout-ms', '1000'])
  assert.equal(probed.code, 2)
  assert.equal(probed.report.probe.state, 'fresh')
  assert.equal(probed.report.checks.responses.status, 'unknown')
  const reviewed = await command('auto-review-probe', ['--proxy', `http://127.0.0.1:${address.port}`, '--timeout-ms', '1000'])
  assert.equal(reviewed.code, 2)
  assert.equal(reviewed.report.probe.state, 'fresh')
  assert.equal(reviewed.report.checks.reviewer.status, 'unknown')
  assert.equal(connects, 2)
  assert.equal(sockets.size, 0)
  assert.equal(await readFile(authFile, 'utf8'), credential)
  process.stdout.write('capability-cli: offline report, explicit proxy rejection, unchanged credentials, and natural child exit verified\n')
} finally {
  for (const socket of sockets) socket.destroy()
  await new Promise(resolve => server.close(resolve))
  await rm(root, { recursive: true, force: true })
}
