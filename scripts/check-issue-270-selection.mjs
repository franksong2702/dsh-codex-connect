/** Manually authorized, bounded #270 selection acceptance. Defaults to OFFLINE.
 * No image request is ever forwarded. Live mode requires a matching passed
 * offline report and refuses to replay an existing live run.
 */
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync, zstdDecompressSync } from 'node:zlib'
import { Context } from '@deepseek-ai/cordis'
import { AgentRegistry } from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import Llm, { createUserMessage } from '@deepseek-ai/dsh-llm'
import Sessions, { SessionId } from '@deepseek-ai/dsh-session'
import Projection from '@deepseek-ai/dsh-session-projection'
import Prompt from '@deepseek-ai/dsh-system-prompt'
import Tools from '@deepseek-ai/dsh-tools'
import LocalAttachments from '@deepseek-ai/dsh-attachment-local'
import * as CodexConnect from '../lib/index.js'

const root = fileURLToPath(new URL('../', import.meta.url))
process.chdir(root)
const mode = process.argv[2] ?? '--offline'
assert.ok(['--offline', '--live'].includes(mode), 'Use --offline or explicitly authorized --live')
const live = mode === '--live'
const authHome = process.argv[3]
if (live) assert.ok(typeof authHome === 'string' && isAbsolute(authHome), 'Live mode requires an explicit approved DSH home')
const model = 'gpt-6-sol'
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const identity = {
  head: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  runtimeSha256: digest(readFileSync(join(root, 'lib/index.js'))),
  scriptSha256: digest(readFileSync(fileURLToPath(import.meta.url))),
}
assert.equal(identity.head, 'ff1192393df5fb45a536539f07faee7bf532883a', 'This acceptance is fenced to the reviewed candidate')
assert.equal(identity.runtimeSha256, '0ace9ac73f9697614a888b176c7fb83bfa7f1ef6b4420f547118c2986c999e50', 'Reviewed runtime bytes changed')
const output = join(root, '.tmp/issue270-sol-confirm')
mkdirSync(output, { recursive: true, mode: 0o700 })
if (live) {
  const dry = JSON.parse(readFileSync(join(output, 'offline.json'), 'utf8'))
  assert.equal(dry.status, 'passed', 'Offline harness must pass before using quota')
  assert.deepEqual(dry.identity, identity, 'Offline and live harness/runtime must match')
  assert.ok(!existsSync(join(output, 'live.json')), 'Live report already exists: do not replay')
  writeFileSync(join(output, 'live.lock'), 'one authorized run; do not reuse\n', { flag: 'wx', mode: 0o600 })
}
const reportFile = join(output, live ? 'live.json' : 'offline.json')
const report = {
  schemaVersion: 1, mode: live ? 'live' : 'offline', model, identity,
  startedAt: new Date().toISOString(), status: 'preparing',
  maximumModelRequests: 2, realModelRequests: 0, simulatedModelRequests: 0,
  realImageRequests: 0, blockedEditRequests: 0, blockedGenerateRequests: 0,
  blockedOtherRequests: 0, blockedOverBudgetRequests: 0,
  wire: [], httpStatuses: [],
}
const save = () => writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 })
save()
const temp = await mkdtemp(join(tmpdir(), 'issue270-sol-confirm-'))
process.env.DSH_HOME = live ? authHome : temp
process.env.OTEL_SDK_DISABLED = 'true'
process.env.DSH_TELEMETRY_MODE = 'DISABLED'
const rawFetch = globalThis.fetch
const rawWebSocket = globalThis.WebSocket
const ctx = new Context()
let handle, first, second, expectedBytes, stopped = false, wireFailed = false
const stop = () => { stopped = true; if (handle) void handle.agent.cancel() }
const timer = setTimeout(() => { report.deadlineExceeded = true; save(); stop() }, 120_000)
function crc32(bytes) {
  let c = 0xffffffff
  for (const byte of bytes) { c ^= byte; for (let i = 0; i < 8; i++) c = (c >>> 1) ^ ((c & 1) ? 0xedb88320 : 0) }
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, bytes) {
  const data = Buffer.alloc(12 + bytes.length)
  data.writeUInt32BE(bytes.length); Buffer.from(type).copy(data, 4); bytes.copy(data, 8)
  data.writeUInt32BE(crc32(data.subarray(4, 8 + bytes.length)), 8 + bytes.length)
  return data
}
function fixture(palette) {
  const width = 256, header = Buffer.alloc(13), rows = Buffer.alloc((width * 3 + 1) * width)
  header.writeUInt32BE(width); header.writeUInt32BE(width, 4); header[8] = 8; header[9] = 2
  for (let y = 0; y < width; y++) for (let x = 0; x < width; x++) {
    const rgb = palette ? (y < 128 ? [38, 112, 214] : [248, 200, 40])
      : (x >= 78 && x < 178 && y >= 78 && y < 178 ? [220, 45, 45]
        : ((x - 45) ** 2 + (y - 45) ** 2 < 24 ** 2 ? [38, 170, 88] : [248, 248, 244]))
    const p = y * (width * 3 + 1) + 1 + x * 3
    rows[p] = rgb[0]; rows[p + 1] = rgb[1]; rows[p + 2] = rgb[2]
  }
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))])
}
async function payload(input, init) {
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
  const source = init?.body ?? (input instanceof Request ? new Uint8Array(await input.clone().arrayBuffer()) : undefined)
  const bytes = typeof source === 'string' ? Buffer.from(source) : Buffer.from(source ?? [])
  return JSON.parse((headers.get('content-encoding') === 'zstd' ? zstdDecompressSync(bytes) : bytes).toString('utf8'))
}
function toolCalls() {
  return (handle?.agent.session.snapshotEvents() ?? [])
    .filter(e => e.type === 'tool/call' && e.data.name === 'codex_connect_image_generate')
    .map(e => typeof e.data.arguments === 'string' ? JSON.parse(e.data.arguments) : e.data.arguments)
}
const selectedId = ref => ref?.attachmentId ?? ref?.attachment?.attachmentId
function selection() {
  const calls = toolCalls(), call = calls[0]
  return {
    toolCalls: calls.length, operation: call?.operation ?? null,
    targetCorrect: selectedId(call?.target) === first?.attachmentId,
    referenceCount: call?.references?.length ?? 0,
    referenceCorrect: selectedId(call?.references?.[0]?.image) === second?.attachmentId,
    referencePurposePresent: typeof call?.references?.[0]?.purpose === 'string' && call.references[0].purpose.trim().length > 0,
    selectors: call ? { target: call.target, references: call.references } : null,
  }
}
globalThis.WebSocket = class { constructor() { report.blockedOtherRequests++; save(); throw new Error('ACCEPTANCE_WEBSOCKET_BLOCKED') } }
globalThis.fetch = async (input, init) => {
  const url = input instanceof Request ? input.url : String(input)
  if (url === 'https://chatgpt.com/backend-api/codex/images/edits') {
    report.blockedEditRequests++
    const body = await payload(input, init)
    const hashes = Array.isArray(body.images) ? body.images.map(img => {
      const data = /^data:image\/(?:png|jpeg|webp);base64,(.+)$/u.exec(img.image_url ?? '')
      return data ? digest(Buffer.from(data[1], 'base64')) : null
    }) : []
    report.editInputBytesCorrect = JSON.stringify(hashes) === JSON.stringify(expectedBytes)
    report.selectionAtDispatch = selection()
    save()
    stop()
    throw new Error('ACCEPTANCE_IMAGE_ENDPOINT_BLOCKED_BEFORE_NETWORK')
  }
  if (url.startsWith('https://chatgpt.com/backend-api/codex/images/')) {
    report.blockedGenerateRequests++; save(); stop(); throw new Error('ACCEPTANCE_IMAGE_ENDPOINT_BLOCKED_BEFORE_NETWORK')
  }
  if (url !== 'https://chatgpt.com/backend-api/codex/responses') {
    report.blockedOtherRequests++; save(); stop(); throw new Error('ACCEPTANCE_UNAPPROVED_ENDPOINT_BLOCKED')
  }
  if (stopped || wireFailed || report.realModelRequests + report.simulatedModelRequests >= 2) {
    report.blockedOverBudgetRequests++; save(); stop(); throw new Error('ACCEPTANCE_NO_RETRY_OR_EXTRA_QUOTA')
  }
  const body = await payload(input, init)
  assert.equal(body.model, model, 'No model substitution is authorized')
  const wireText = JSON.stringify(body)
  const bindings = [first, second].map((ref, i) => wireText.includes(`Codex Connect image ${i + 1} in this message:`)
    && wireText.includes(`attachmentId=${String(ref.attachmentId)}`))
  report.wire.push({ model: body.model, handleBindingsPresent: bindings })
  assert.ok(bindings.every(Boolean), 'Final handle projection is absent from the actual request')
  if (!live) {
    report.simulatedModelRequests++; save()
    const item = { type: 'function_call', id: 'fc_acceptance', call_id: 'c_acceptance',
      name: 'codex_connect_image_generate', status: 'completed', arguments: JSON.stringify({
        operation: 'edit', prompt: 'Use the second image blue as the background, preserve the square and circle.',
        target: { attachmentId: first.attachmentId },
        references: [{ image: { attachmentId: second.attachmentId }, purpose: 'blue color palette only' }],
      }) }
    return new Response([
      { type: 'response.output_item.added', output_index: 0, item },
      { type: 'response.output_item.done', output_index: 0, item },
      { type: 'response.completed', response: { id: 'r_acceptance', status: 'completed', output: [item], usage: { input_tokens: 20, output_tokens: 10, total_tokens: 30 } } },
    ].map(e => `data: ${JSON.stringify(e)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } })
  }
  // Persist quota reservation before dispatch so an interrupted response never invites replay.
  report.realModelRequests++; report.status = 'dispatched'; save()
  try {
    const response = await rawFetch(input, { ...init, redirect: 'error' })
    report.httpStatuses.push(response.status); save()
    if (!response.ok) { wireFailed = true; stop() }
    return response
  } catch {
    wireFailed = true; report.networkOutcome = 'unconfirmed'; save(); stop()
    throw new Error('ACCEPTANCE_MODEL_REQUEST_UNCONFIRMED')
  }
}
try {
  if (!live) {
    const claim = Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: 'synthetic-selection' } })).toString('base64url')
    await new CodexConnect.OpenAICodexCredentialStore().modify('openai-codex', async () => ({
      type: 'oauth', access: `e30.${claim}.fixture`, refresh: 'fixture', accountId: 'synthetic-selection', expires: Date.now() + 3600000,
    }))
  } else {
    const account = await new CodexConnect.OpenAICodexCredentialStore().captureActiveAccount()
    assert.ok((await account.list()).some(p => p.providerId === 'openai-codex'), 'Approved profile is signed out')
  }
  for (const plugin of [Llm, Sessions, Projection, AgentRegistry, Prompt]) await ctx.plugin(plugin)
  await ctx.plugin(Tools, { mode: 'native' })
  await ctx.plugin(AgentLoop, { agents: [] })
  await ctx.plugin(LocalAttachments, { dshHome: temp })
  await ctx.plugin(CodexConnect, { enableImageGeneration: true })
  await new Promise(resolve => setImmediate(resolve))
  const route = await ctx.llm.resolveModelInfo('openai-codex', model)
  assert.equal(route.id, model)
  assert.ok(route.inputModalities?.includes('image'), 'Requested route must accept images')
  first = await ctx.attachments.saveImage({ data: fixture(false), mediaType: 'image/png', name: 'attachment-a.png' })
  second = await ctx.attachments.saveImage({ data: fixture(true), mediaType: 'image/png', name: 'attachment-b.png' })
  assert.notEqual(first.attachmentId, second.attachmentId)
  expectedBytes = await Promise.all([first, second].map(async ref => digest((await ctx.attachments.readImage(ref)).data)))
  handle = await ctx.agents.create({ sessionId: SessionId(`issue270-sol-${randomUUID()}`), meta: { cwd: temp },
    agentOptions: { provider: 'openai-codex', model } })
  assert.deepEqual(handle.agent.ctx.tools.schemas(handle.agent).map(x => x.name), ['codex_connect_image_generate'])
  report.status = 'ready'; save()
  handle.agent.followup(createUserMessage({ source: { kind: 'user' }, content: [
    { type: 'text', text: 'Edit the FIRST attached image. Change only its background color using the SECOND attached image as a color-palette reference. Keep the red square and green circle unchanged. Use the image editing tool. Do not generate a new unrelated image.' },
    { type: 'image', attachment: first }, { type: 'image', attachment: second },
  ] }))
  await handle.agent.whenIdle()
  report.selection = selection()
  const s = report.selection
  report.status = s.toolCalls === 1 && s.operation === 'edit' && s.targetCorrect && s.referenceCount === 1
    && s.referenceCorrect && s.referencePurposePresent && report.editInputBytesCorrect === true
    && report.blockedEditRequests === 1 && report.blockedGenerateRequests === 0 && report.blockedOtherRequests === 0
    && !report.deadlineExceeded && !wireFailed ? 'passed' : 'failed'
} catch (error) {
  report.status = 'failed'
  // Never serialize arbitrary provider/credential errors or request bodies.
  report.errorType = error instanceof assert.AssertionError ? 'AssertionError' : 'HarnessError'
  if (error instanceof assert.AssertionError) report.assertion = String(error.message).slice(0, 200)
} finally {
  clearTimeout(timer)
  report.finishedAt = new Date().toISOString(); save()
  try { await handle?.dispose(); await ctx.fiber.dispose(); await rm(temp, { recursive: true, force: true }); report.cleanup = 'passed' }
  catch { report.cleanup = 'failed'; report.status = 'failed' }
  globalThis.fetch = rawFetch; globalThis.WebSocket = rawWebSocket
  save()
}
console.log(JSON.stringify(report))
if (report.status !== 'passed') process.exitCode = 1
