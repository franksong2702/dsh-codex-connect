/** Built-plane keyless CLI checks, including a real owned proxy socket. */
import assert from 'node:assert/strict'
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runBoundedCommand } from './bounded-command.mjs'
import { dshPluginApi } from '../src/dsh-admission.mjs'

const root = await mkdtemp(join(tmpdir(), 'codex-capability-cli-'))
const repository = fileURLToPath(new URL('../', import.meta.url))
const bin = join(repository, 'lib/bin.js')
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

async function command(action, args, entry = bin) {
  const result = await runBoundedCommand(process.execPath, [entry, action, ...args, '--json'], { env, timeoutMs: 10_000 })
  assert.equal(result.error, undefined)
  assert.equal(result.cleanupError, undefined)
  assert.equal(result.signal, null)
  assert.equal(result.stderr, '')
  for (const secret of [root, 'fixture-private-access', 'fixture-private-account', 'fixture-private-refresh']) assert.ok(!result.stdout.includes(secret))
  return { code: result.status, report: JSON.parse(result.stdout) }
}

async function prepareSelectedFixture() {
  const plugin = join(root, 'selected', 'node_modules', 'dsh-codex-connect')
  const manifest = await readFile(join(repository, 'package.json'), 'utf8')
  await mkdir(plugin, { recursive: true })
  await writeFile(join(plugin, 'package.json'), manifest)
  await cp(join(repository, 'lib'), join(plugin, 'lib'), { recursive: true })
  for (const name of Object.keys(JSON.parse(manifest).dependencies)) {
    const target = join(plugin, 'node_modules', name)
    await mkdir(dirname(target), { recursive: true })
    await symlink(join(repository, 'node_modules', name), target, process.platform === 'win32' ? 'junction' : 'dir')
  }
  for (const name of dshPluginApi.packages) {
    const directory = join(plugin, 'node_modules', name)
    await mkdir(directory, { recursive: true })
    await writeFile(join(directory, 'package.json'), JSON.stringify({ name, version: dshPluginApi.version }))
  }
  return join(plugin, 'lib/bin.js')
}

try {
  const offline = await command('capabilities', ['--model', 'gpt-5.6-sol'])
  assert.equal(offline.code, 1)
  assert.equal(offline.report.checks.runtime.status, 'rejected')
  assert.equal(offline.report.checks.runtime.reason, 'declared-version-mismatch')
  assert.equal(offline.report.probe.state, 'not-requested')
  await writeFile(authFile, credential, { mode: 0o600 })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  assert.ok(address !== null && typeof address !== 'string')
  const proxy = ['--proxy', `http://127.0.0.1:${address.port}`, '--timeout-ms', '1000']
  const capabilityArgs = ['--model', 'gpt-5.6-sol', '--probe', ...proxy]
  const retired = await command('capabilities', capabilityArgs)
  assert.equal(retired.code, 1)
  assert.equal(retired.report.probe.state, 'skipped')
  assert.equal(connects, 0)
  const selectedBin = await prepareSelectedFixture()
  const probed = await command('capabilities', capabilityArgs, selectedBin)
  assert.equal(probed.report.checks.runtime.status, 'supported')
  assert.equal(probed.code, 2)
  assert.equal(probed.report.probe.state, 'fresh')
  assert.equal(probed.report.checks.responses.status, 'unknown')
  const reviewed = await command('auto-review-probe', proxy, selectedBin)
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
