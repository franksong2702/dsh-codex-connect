/** Isolated full-profile child-process preloader: fake provider, deny external transport. */
import assert from 'node:assert/strict'
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { zstdDecompressSync } from 'node:zlib'
import { createRequire, syncBuiltinESMExports } from 'node:module'
import { createHash } from 'node:crypto'
const require = createRequire(import.meta.url)
const directory = process.env.CODEX_TASK_SESSION_FIXTURE
assert.ok(directory && /codex-task-session-/.test(directory))
assert.equal(resolve(process.env.DSH_HOME ?? ''), join(resolve(directory), 'home'))
assert.equal(JSON.parse(readFileSync(join(directory, 'fixture-owner.json'), 'utf8')).kind, 'codex-task-session-offline')
const records = join(directory, 'events.jsonl')
const record = value => appendFileSync(records, JSON.stringify({ pid: process.pid, ...value }) + '\n', { mode: 0o600 })
const loopback = host => ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(host)
const deny = kind => { record({ kind: 'blocked-network', transport: kind }); throw new Error('External network disabled in task Session fixture') }
const net = require('node:net')
const originalConnect = net.Socket.prototype.connect
net.Socket.prototype.connect = function (...args) {
  const arg = Array.isArray(args[0]) ? args[0][0] : args[0]
  const host = typeof arg === 'object' && arg !== null ? arg.host ?? arg.hostname ?? 'localhost'
    : typeof args[1] === 'string' ? args[1] : 'localhost'
  if (!loopback(host) || (typeof arg === 'object' && arg?.path)) deny('socket')
  return Reflect.apply(originalConnect, this, args)
}
syncBuiltinESMExports()
const nativeFetch = globalThis.fetch
let providerRequests = 0
const sse = (item, model) => new Response([{ type: 'response.output_item.added', output_index: 0, item },
  { type: 'response.output_item.done', output_index: 0, item },
  { type: 'response.completed', response: { id: 'r_full_session', model, status: 'completed', output: [item] } },
].map(event => `data: ${JSON.stringify(event)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } })
const p2tool = (name, args, id) => ({ type: 'function_call', id: 'fc_' + id, call_id: id, name,
  arguments: JSON.stringify(args), status: 'completed' })
const p2answer = () => ({ type: 'message', id: 'm_full_session', role: 'assistant', phase: 'final_answer', status: 'completed',
  content: [{ type: 'output_text', text: 'SESSION_FIXTURE_COMPLETE: original requirement retained.', annotations: [] }] })
globalThis.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input))
  if (loopback(url.hostname)) return nativeFetch(input, init)
  if (url.origin === 'https://chatgpt.com' && url.pathname === '/backend-api/codex/responses') {
    assert.ok(++providerRequests <= 20, 'Synthetic fixture request ceiling exceeded')
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
    const bodyBytes = init?.body ?? (input instanceof Request ? await input.arrayBuffer() : '')
    const raw = headers.get('content-encoding') === 'zstd' ? zstdDecompressSync(Buffer.from(bodyBytes)).toString() : Buffer.from(bodyBytes).toString()
    const body = JSON.parse(raw)
    if (process.env.CODEX_TASK_SESSION_PHASE2 === '1') {
      const child = body.tools?.some(tool => tool.name === 'read_task_evidence') === true
      const auxiliary = (body.tools ?? []).length === 0
      const texts = (body.input ?? []).filter(item => item.role === 'user').flatMap(item => item.content ?? []).map(item => item.text).filter(text => typeof text === 'string')
      const prompt = texts.findLast(text => text.includes('_P2')) ?? ''
      const hold = child && prompt.includes('HOLD_CHILD_P2')
      record({ kind: 'provider-request', model: body.model, effort: body.reasoning?.effort, child, hold, auxiliary,
        originalRetained: JSON.stringify(body.input).includes('ORIGINAL_REQUIREMENT_P2'), tools: (body.tools ?? []).map(tool => tool.name) })
      if (auxiliary) return sse({ ...p2answer(), content: [{ type: 'output_text', text: JSON.stringify(body.input).includes('UPGRADE_V1_P2') ? 'UPGRADE_V1_P2 task' : JSON.stringify(body.input).includes('UPGRADE_V2_P2') ? 'UPGRADE_V2_P2 task' : 'ORIGINAL_REQUIREMENT_P2 task', annotations: [] }] }, body.model)
      if (hold) return new Promise((_, reject) => {
        const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined)
        assert.ok(signal)
        const abort = () => { record({ kind: 'provider-aborted', model: body.model, child: true }); reject(signal.reason ?? new Error('Fixture cancelled')) }
        if (signal.aborted) abort(); else signal.addEventListener('abort', abort, { once: true })
      })
      if (child) {
        const brief = texts.map(text => { try { return JSON.parse(text) } catch { return undefined } }).find(value => value?.sources)
        assert.ok(brief?.sources?.[0]?.id, 'child must receive host-issued source ID')
        const sourceId = brief.sources[0].id
        const read = body.input.some(item => item.type === 'function_call_output' && item.call_id === 'call_p2_read')
        return sse(read ? p2tool('submit_task_findings', { summary: 'Bounded fixture findings', findings: [{ text: 'Approved first line',
          references: [{ sourceId, start: 1, end: 1, digest: createHash('sha256').update('approved first').digest('hex') }] }] }, 'call_p2_submit')
          : p2tool('read_task_evidence', { sourceId, start: 1, end: 1 }, 'call_p2_read'), body.model)
      }
      const id = 'call_p2_' + createHash('sha256').update(prompt).digest('hex').slice(0, 16)
      const completed = body.input.some(item => item.type === 'function_call_output' && item.call_id === id)
      if (prompt.includes('DELEGATE_P2') && !completed) {
        const tool = body.tools.find(tool => tool.name === 'delegate_task')
        assert.ok(tool, 'delegation tool must be present only after explicit consent')
        const sources = JSON.parse(tool.description.split('Approved IDs: ')[1])
        return sse(p2tool(tool.name, { goal: prompt.includes('HOLD_CHILD_P2') ? 'HOLD_CHILD_P2' : 'Read approved notes_P2',
          expectedOutput: 'Cited findings', model: 'gpt-5.6-luna', effort: 'max', sourceIds: [sources[0].id] }, id), body.model)
      }
      return sse(p2answer(), body.model)
    }
    // Host appends workspace reminders after the actual user item.
    const lastUser = (body.input ?? []).filter(item => item.role === 'user' && /_P1/.test(JSON.stringify(item))).at(-1)
    const prompt = JSON.stringify(lastUser ?? '')
    const data = { kind: 'provider-request', model: body.model, effort: body.reasoning?.effort,
      cacheKey: body.prompt_cache_key, originalRetained: JSON.stringify(body.input).includes('ORIGINAL_REQUIREMENT_P1'),
      hold: prompt.includes('HOLD_FOR_STOP_P1'), tools: (body.tools ?? []).map(item => item.name) }
    record(data)
    if (data.hold) return new Promise((_, reject) => {
      const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined)
      assert.ok(signal, 'held request must be cancellable')
      const abort = () => { record({ kind: 'provider-aborted', model: body.model }); reject(signal.reason ?? new Error('Fixture cancelled')) }
      if (signal.aborted) abort(); else signal.addEventListener('abort', abort, { once: true })
    })
    const alreadyHanded = (body.input ?? []).some(item => item.type === 'function_call_output' && String(item.call_id).startsWith('call_full_session'))
    const handoff = prompt.includes('HANDOFF_TO_LUNA_P1') && !alreadyHanded
    const item = handoff
      ? { type: 'function_call', id: 'fc_full_session', call_id: 'call_full_session', name: 'codex_connect_change_work_model',
        arguments: JSON.stringify({ model: 'gpt-5.6-luna', effort: 'max', reason: 'The bounded fixture remainder can use the permitted model.' }), status: 'completed' }
      : { type: 'message', id: 'm_full_session', role: 'assistant', phase: 'final_answer', status: 'completed',
        content: [{ type: 'output_text', text: 'SESSION_FIXTURE_COMPLETE: original requirement retained.', annotations: [] }] }
    return new Response([{ type: 'response.output_item.added', output_index: 0, item },
      { type: 'response.output_item.done', output_index: 0, item },
      { type: 'response.completed', response: { id: 'r_full_session', model: body.model, status: 'completed', output: [item] } },
    ].map(event => `data: ${JSON.stringify(event)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } })
  }
  // Ancillary update/quota/catalog probes are intercepted, never sent or treated as acceptance.
  if (['https://chatgpt.com', 'https://registry.npmjs.org', 'https://api.github.com'].includes(url.origin)) {
    record({ kind: 'suppressed-ancillary', origin: url.origin, path: url.pathname })
    return new Response(JSON.stringify({ error: 'offline fixture' }), { status: 503, headers: { 'content-type': 'application/json' } })
  }
  return deny('fetch')
}
const NativeWebSocket = globalThis.WebSocket
globalThis.WebSocket = class extends NativeWebSocket {
  constructor(url, protocols) { if (!loopback(new URL(url).hostname)) deny('websocket'); super(url, protocols) }
}
// Only synthetic account data in this newly owned DSH_HOME. Never load an existing account.
const accountId = 'synthetic-full-session'
const claims = Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: accountId } })).toString('base64url')
writeFileSync(join(directory, 'home/.openai-codex-auth.json'), JSON.stringify({ version: 2, activeAccountId: accountId,
  credentials: [{ type: 'oauth', access: `e30.${claims}.fixture`, refresh: 'fixture', accountId, expires: Date.now() + 3600000 }] }), { mode: 0o600 })
record({ kind: 'fixture-preload', node: process.version, externalTransportDenied: true, syntheticCredentials: true })
