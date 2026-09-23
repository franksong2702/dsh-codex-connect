/** Explicit composition, real host/persistence/adapter/governor/authentication; no real provider. */
import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { request, type IncomingMessage } from 'node:http'
import { zstdDecompressSync } from 'node:zlib'
import { Context } from '@deepseek-ai/cordis'
import { AgentRegistry } from '@deepseek-ai/dsh-agent'
import Loop from '@deepseek-ai/dsh-agent-loop'
import Llm, { createUserMessage, ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import Sessions, { SessionId } from '@deepseek-ai/dsh-session'
import Projection from '@deepseek-ai/dsh-session-projection'
import Prompt from '@deepseek-ai/dsh-system-prompt'
import Tools from '@deepseek-ai/dsh-tools'
import Persistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import { WebServer } from '@deepseek-ai/dsh-host-webserver'
import * as Connection from '@deepseek-ai/dsh-client-connection'
import { afterEach, expect, it, vi } from 'vitest'
import { AdaptiveTaskControlRuntime } from '../src/adaptive-task-control-runtime.ts'
import { adaptiveBrowserPrincipal, registerAdaptiveTaskHttp } from '../src/adaptive-task-http.ts'
import { TaskDelegationArtifacts } from '../src/adaptive-task-artifacts.ts'
import { AtomicTaskDocumentStore, taskIdentity } from '../src/adaptive-task-store.ts'
import { parseTaskLedger } from '../src/adaptive-task-delegation-contract.ts'
import { OpenAICodexCredentialStore } from '../src/store.ts'
import { OpenAICodexBackendRequests } from '../src/backend-request.ts'
import { createOpenAICodexAdapter } from '../src/adapter.ts'
import { ADAPTIVE_TASK_PATH, ADAPTIVE_TASK_TOOL } from '../src/adaptive-task-contract.ts'
import type { AdaptiveTaskCommand } from '../src/adaptive-task-contract.ts'
import { TASK_DELEGATE_TOOL } from '../src/adaptive-task-delegation.ts'

it('keeps standalone streams and auxiliary work ordinary without optional task services', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'task-standalone-'))); roots.push(root)
  const ctx = new Context(); contexts.push(ctx)
  let runtime!: AdaptiveTaskControlRuntime
  await ctx.plugin((scope: Context) => {
    runtime = new AdaptiveTaskControlRuntime(scope, { directory: join(root, 'tasks'), models: async () => [],
      artifacts: () => { throw new Error('No artifact access without a task') } })
  })
  const options = { sessionId: SessionId('ordinary') } as Parameters<AdaptiveTaskControlRuntime['stream']>[0]
  const delegate = vi.fn(async function* () { yield { type: 'finish' as const, reason: { kind: 'stop' as const } } })
  const chunks = []
  for await (const chunk of runtime.stream(options, delegate)) chunks.push(chunk)
  expect(chunks).toEqual([{ type: 'finish', reason: { kind: 'stop' } }]); expect(delegate).toHaveBeenCalledWith(options)
  await runtime.reserveAuxiliary()
  await expect(runtime.state('ordinary', owner)).rejects.toThrow('TASK_LIVE_ROOT_REQUIRED')
  expect(await readdir(root)).toEqual([])
})

it('rejects live task control and dispatch when the session service is missing', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'task-incomplete-host-'))); roots.push(root)
  const ctx = new Context(); contexts.push(ctx)
  const agent = { id: SessionId('incomplete') }
  ctx.provide('agents', { get: () => agent, roots: () => [agent], currentInitiator: () => agent } as never)
  const runtime = new AdaptiveTaskControlRuntime(ctx, { directory: join(root, 'tasks'), models: async () => [],
    artifacts: () => { throw new Error('No artifact access with an incomplete host') } })
  await expect(runtime.state(agent.id, owner)).rejects.toThrow('TASK_LIVE_ROOT_REQUIRED')
  await expect(runtime.command({ sessionId: agent.id, action: 'manual', revision: 0, operationId: randomUUID() }, owner)).rejects.toThrow('TASK_LIVE_ROOT_REQUIRED')
  await expect(runtime.reserveAuxiliary()).rejects.toThrow('TASK_LIVE_ROOT_REQUIRED')
  const delegate = vi.fn(async function* () { yield { type: 'finish' as const, reason: { kind: 'stop' as const } } })
  const stream = runtime.stream({ sessionId: agent.id } as Parameters<AdaptiveTaskControlRuntime['stream']>[0], delegate) as ReturnType<AdaptiveTaskControlRuntime['stream']> & AsyncIterator<unknown>
  await expect(stream.next()).rejects.toThrow('TASK_LIVE_ROOT_REQUIRED'); expect(delegate).not.toHaveBeenCalled()
  expect(await readdir(root)).toEqual([])
})

const roots: string[] = [], contexts: Context[] = []
const owner = taskIdentity('consent-owner'), main = 'gpt-5.6-sol', child = 'gpt-5.6-luna'
afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
  vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs()
  for (const dir of roots.splice(0)) await rm(dir, { recursive: true, force: true })
})
function response(name?: string, args?: unknown): Response {
  const item = name ? { type: 'function_call', id: `fc_${randomUUID()}`, call_id: `c_${randomUUID()}`, name, arguments: JSON.stringify(args), status: 'completed' }
    : { type: 'message', id: 'answer', role: 'assistant', phase: 'final_answer', status: 'completed', content: [{ type: 'output_text', text: 'Synthetic complete', annotations: [] }] }
  return new Response([{ type: 'response.output_item.added', output_index: 0, item }, { type: 'response.output_item.done', output_index: 0, item },
    { type: 'response.completed', response: { id: 'synthetic', status: 'completed', output: [item] } }]
    .map(event => `data: ${JSON.stringify(event)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } })
}
async function setup(selectedChild = child, catalogModels = [main, selectedChild], initialOwner = owner) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'task-consent-'))); roots.push(root)
  vi.stubEnv('DSH_HOME', root); vi.stubEnv('OTEL_SDK_DISABLED', 'true')
  vi.stubGlobal('WebSocket', class { constructor() { throw new Error('Synthetic only') } })
  const wires: any[] = []; let reply: (wire: any) => Response | Promise<Response> = () => response()
  vi.stubGlobal('fetch', vi.fn(async (url: unknown, init: RequestInit) => {
    expect(String(url)).toBe('https://chatgpt.com/backend-api/codex/responses')
    const wire = JSON.parse(new Headers(init.headers).get('content-encoding') === 'zstd'
      ? zstdDecompressSync(init.body as Uint8Array).toString() : String(init.body))
    wires.push(wire); expect(wires.length).toBeLessThan(20); return reply({ ...wire, signal: init.signal })
  }))
  const ctx = new Context(); contexts.push(ctx)
  for (const plugin of [Llm, Sessions, Projection, AgentRegistry, Prompt, Tools]) await ctx.plugin(plugin)
  await ctx.plugin(Loop, { agents: [] })
  await ctx.plugin(Persistence, { root: join(root, 'sessions'), compression: 'none' })
  const credentials = new OpenAICodexCredentialStore(join(root, 'synthetic-auth.json'))
  const claim = Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: 'synthetic-consent' } })).toString('base64url')
  await credentials.modify('openai-codex', async () => ({ type: 'oauth', access: `e30.${claim}.fixture`, refresh: 'fixture', accountId: 'synthetic-consent', expires: Date.now() + 3600000 }))
  const store = new AtomicTaskDocumentStore(join(root, 'tasks'), parseTaskLedger)
  const artifacts = new TaskDelegationArtifacts(join(root, 'artifacts'))
  let runtime!: AdaptiveTaskControlRuntime
  // Match the product's llm-only dependency contract, not a privileged root context.
  await ctx.plugin({ inject: ['llm'], apply(pluginCtx: Context) {
    runtime = new AdaptiveTaskControlRuntime(pluginCtx, { directory: join(root, 'tasks'), artifacts: () => artifacts,
      models: async () => Promise.all(catalogModels.map(model => pluginCtx.llm.resolveModelInfo('openai-codex', model))) })
  } })
  const governor = new OpenAICodexBackendRequests(undefined, undefined, 8, () => runtime.reserveAuxiliary())
  ctx.effect(() => () => governor.dispose())
  ctx.llm.registerAdapter(['openai-codex'], createOpenAICodexAdapter(credentials, () => undefined, undefined, undefined,
    undefined, undefined, undefined, undefined, () => false, governor, runtime))
  const { agent } = await ctx.agents.create({ sessionId: SessionId('consent-root'), meta: { cwd: root },
    agentOptions: { provider: 'openai-codex', model: main, reasoningEffort: ReasoningEffortId('medium') } })
  await writeFile(join(root, 'notes.txt'), 'approved first\nsecond')
  let taskOwner = initialOwner
  const state = () => runtime.state(agent.id, taskOwner)
  const build = (action: AdaptiveTaskCommand['action'], revision: number, extra = {}): AdaptiveTaskCommand => ({ sessionId: agent.id,
    action, revision, operationId: randomUUID(), ...(action === 'start' ? { models: [main, selectedChild], efforts: { [main]: ['medium'], [selectedChild]: ['max'] }, maximumRequests: 20 } : {}), ...extra })
  const mutate = async (action: AdaptiveTaskCommand['action'], extra = {}) => runtime.command(build(action, (await state()).revision, extra), taskOwner)
  const grant = { files: ['notes.txt'], routes: [{ model: selectedChild, effort: 'max' }], maxChildRequests: 6, timeoutMs: 30000, disclose: true }
  const ready = async () => { await mutate('start'); await mutate('upgrade'); await mutate('delegate-enable', grant); await mutate('resume') }
  const send = async (text = 'ORIGINAL CONSENT REQUIREMENT') => { agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text }] })); await agent.whenIdle() }
  const success = async () => {
    const doc = await store.read(agent.id); if (doc?.version !== 2) throw new Error('v2 expected')
    const sourceId = doc.delegation.grant!.sourceIds[0]!
    let step = 0
    reply = () => ++step === 1 ? response(TASK_DELEGATE_TOOL, { goal: 'Inspect', expectedOutput: 'Cited findings', model: selectedChild, effort: 'max', sourceIds: [sourceId] })
      : step === 2 ? response('read_task_evidence', { sourceId, start: 1, end: 1 })
      : step === 3 ? response('submit_task_findings', { summary: 'Synthetic findings', findings: [{ text: 'First line', references: [{ sourceId, start: 1, end: 1, digest: taskIdentity('approved first') }] }] }) : response()
  }
  return { root, ctx, agent, runtime, store, artifacts, wires, state, build, mutate, grant, ready, send, success, setOwner(value: string) { taskOwner = value }, child: selectedChild, setReply(fn: typeof reply) { reply = fn } }
}

it('keeps legacy/off behavior, explicitly migrates without child authority, and preserves the root budget', async () => {
  const f = await setup(); expect((await f.state()).delegation).toBeUndefined()
  await f.mutate('start'); await f.send()
  expect(f.ctx.tools.get(TASK_DELEGATE_TOOL, f.agent)).toBeUndefined()
  const state = await f.mutate('upgrade')
  expect(state).toMatchObject({ mode: 'interrupted', reserved: 1, delegation: { version: 2, enabled: false, files: [] } })
  expect(f.ctx.tools.get(TASK_DELEGATE_TOOL, f.agent)).toBeUndefined()
  expect(f.ctx.tools.get(ADAPTIVE_TASK_TOOL, f.agent)).toBeUndefined()
  await f.mutate('resume'); await f.send()
  expect((await f.state()).reserved).toBe(2); expect(f.wires).toHaveLength(2)
})
it('executes only explicit evidence consent, then archives/downgrades/remigrates without replay or budget reset', async () => {
  const f = await setup(); await f.ready(); await f.success(); await f.send()
  expect(f.wires.map(w => w.model)).toEqual([main, child, child, main])
  const state = await f.state(); expect(state.reserved).toBe(4)
  expect(state.delegation!.runs[0]).toMatchObject({ state: 'succeeded', cleanup: 'verified', delivery: 'recorded', reserved: 2 })
  const id = state.delegation!.runs[0]!.id
  expect(JSON.stringify(state)).not.toContain('approved first'); expect(JSON.stringify(state)).not.toContain('consent-owner')
  await f.mutate('manual'); await f.mutate('delegate-disable')
  expect((await f.state()).delegation!.canDowngrade).toBe(true)
  await f.mutate('downgrade'); expect((await f.store.read(f.agent.id))!.version).toBe(1)
  expect((await f.state()).reserved).toBe(4); expect(f.ctx.tools.get(TASK_DELEGATE_TOOL, f.agent)).toBeUndefined()
  await f.send(); expect((await f.state()).reserved).toBe(4)
  await f.mutate('upgrade')
  expect((await f.state()).delegation!.runs[0]!.id).toBe(id)
  expect((await f.state()).reserved).toBe(4); expect((await f.state()).mode).toBe('interrupted')
  expect((await f.state()).delegation!.enabled).toBe(false); expect(f.wires).toHaveLength(5)
})
it.each(['gpt-6-sol', 'gpt-6-luna'])('authorizes an explicitly selected %s child route without widening the default start', async selectedChild => {
  const f = await setup(selectedChild); await f.ready(); await f.success(); await f.send()
  expect(f.wires.map(wire => wire.model)).toEqual([main, selectedChild, selectedChild, main])
  expect((await f.state()).capabilities).toEqual(expect.arrayContaining([{ model: selectedChild, efforts: ['max'] }]))
  expect((await f.store.read(f.agent.id))!.route).toEqual({ model: main, effort: 'medium' })
})
it.each(['gpt-6-sol', 'gpt-6-luna'])('hands the main task to explicitly authorized %s without changing the default start', async selectedModel => {
  const f = await setup(selectedModel); await f.mutate('start')
  let step = 0
  f.setReply(() => ++step === 1
    ? response(ADAPTIVE_TASK_TOOL, { model: selectedModel, effort: 'max', reason: 'The remaining synthetic work benefits from the authorized route.' })
    : response())
  await f.send()
  expect(f.wires.map(wire => [wire.model, wire.reasoning?.effort])).toEqual([[main, 'medium'], [selectedModel, 'max']])
  expect((await f.store.read(f.agent.id))!.route).toEqual({ model: selectedModel, effort: 'max' })
})
it('fences duplicate operations, changed digests, stale UI and another owner before changing consent', async () => {
  const f = await setup(); await f.mutate('start'); await f.mutate('upgrade')
  const before = await f.state(), command = f.build('delegate-enable', before.revision, f.grant)
  const first = await f.runtime.command(command, owner)
  expect(await f.runtime.command(command, owner)).toEqual(first)
  await expect(f.runtime.command({ ...command, maxChildRequests: 5 }, owner)).rejects.toThrow('TASK_OPERATION_CONFLICT')
  await expect(f.runtime.command(f.build('delegate-disable', before.revision), owner)).rejects.toThrow('TASK_STALE_REVISION')
  await expect(f.runtime.state(f.agent.id, taskIdentity('other'))).rejects.toThrow('TASK_OWNER_MISMATCH')
  await expect(f.runtime.command(command, taskIdentity('other'))).rejects.toThrow('TASK_OWNER_MISMATCH')
  expect(f.wires).toHaveLength(0)
})
it.each([{ disclose: false }, { files: ['../outside.txt'] }, { files: ['.env'] },
  { routes: [{ model: 'gpt-6-astra', effort: 'max' }] }, { routes: [{ model: 'gpt-6-sol', effort: 'max' }] },
  { routes: [{ model: 'gpt-6-luna', effort: 'max' }] }, { maxChildRequests: 7 }])('rejects expanded or undisclosed scope %j', async patch => {
  const f = await setup(); await f.mutate('start'); await f.mutate('upgrade')
  await expect(f.mutate('delegate-enable', { ...f.grant, ...patch })).rejects.toThrow()
  expect((await f.state()).delegation!.enabled).toBe(false); expect(f.wires).toHaveLength(0)
})
it.each(['gpt-6-sol', 'gpt-6-luna'])('rejects an old grant route for %s even when the live catalog advertises it', async selectedModel => {
  const f = await setup(child, [main, child, 'gpt-6-sol', 'gpt-6-luna']); await f.mutate('start'); await f.mutate('upgrade')
  await expect(f.mutate('delegate-enable', { ...f.grant, routes: [{ model: selectedModel, effort: 'max' }] })).rejects.toThrow()
  expect((await f.state()).delegation!.enabled).toBe(false)
  expect((await f.store.read(f.agent.id))!.capabilities.map(item => item.model)).toEqual([main, child])
  expect(f.wires).toHaveLength(0)
})
it('requires idle consent but stop/manual can cancel an active child and preserve debits', async () => {
  const f = await setup(); await f.ready(); await f.success()
  await f.store.update(f.agent.id, doc => ({ ...doc!, receipts: Array.from({ length: 64 }, (_, index) => ({
    id: `retained-control-${String(index).padStart(4, '0')}`, digest: taskIdentity(String(index)),
  })) }))
  let reached!: () => void; const pending = new Promise<void>(resolve => { reached = resolve })
  const original = globalThis.fetch
  vi.stubGlobal('fetch', async (...args: Parameters<typeof fetch>) => {
    if (f.wires.length === 1) {
      reached(); return new Promise<Response>((_resolve, reject) => args[1]!.signal!.addEventListener('abort', () => reject(new Error('cancelled')), { once: true }))
    }
    return original(...args)
  })
  const running = f.send(); await pending
  await expect(f.mutate('delegate-disable')).rejects.toThrow()
  await f.mutate('manual'); await running
  expect((await f.state()).mode).toBe('manual'); expect((await f.state()).reserved).toBe(2)
  expect(f.ctx.agents.list()).toEqual([f.agent])
})
it('retains full receipts while allowing stop/manual/revocation/downgrade even without the model catalog', async () => {
  const f = await setup(); await f.ready()
  const receipts = Array.from({ length: 64 }, (_, index) => ({ id: `retained-control-${String(index).padStart(4, '0')}`, digest: taskIdentity(String(index)) }))
  await f.store.update(f.agent.id, doc => ({ ...doc!, receipts }))
  await expect(f.mutate('delegate-enable', f.grant)).rejects.toThrow('TASK_LEDGER_CAPACITY')
  vi.spyOn(f.ctx.llm, 'resolveModelInfo').mockRejectedValue(new Error('Catalog unavailable'))
  const stop = f.build('stop', (await f.state()).revision)
  expect((await f.runtime.command(stop, owner)).mode).toBe('stopped')
  const stopped = await f.store.read(f.agent.id)
  await expect(f.runtime.command(stop, owner)).rejects.toThrow('TASK_STALE_REVISION')
  expect(await f.store.read(f.agent.id)).toEqual(stopped)
  expect((await f.mutate('manual')).mode).toBe('manual')
  expect((await f.mutate('delegate-disable')).delegation!.enabled).toBe(false)
  const down = f.build('downgrade', (await f.state()).revision)
  expect((await f.runtime.command(down, owner)).delegation!.version).toBe(1)
  expect(await f.store.read(f.agent.id)).toMatchObject({ version: 1, mode: 'manual', reserved: 0, receipts })
  expect(f.ctx.tools.get(TASK_DELEGATE_TOOL, f.agent)).toBeUndefined(); expect(f.wires).toHaveLength(0)
})
it('blocks downgrade if ordinary parent delivery evidence disappears despite a recorded ledger flag', async () => {
  const f = await setup(); await f.ready(); await f.success(); await f.send()
  await f.mutate('manual'); await f.mutate('delegate-disable')
  const snapshot = f.agent.session.snapshotEvents.bind(f.agent.session)
  vi.spyOn(f.agent.session, 'snapshotEvents').mockImplementation(() => snapshot().filter(event => event.type !== 'tool/result'))
  await expect(f.mutate('downgrade')).rejects.toThrow('TASK_DELIVERY_UNCONFIRMED')
  expect((await f.store.read(f.agent.id))!.version).toBe(2)
})
function http(url: string, headers: Record<string, string> = {}, body?: unknown) {
  return new Promise<{ status: number; cookie?: string; value: any }>((resolve, reject) => {
    const req = request(url, { method: body === undefined ? 'GET' : 'POST', headers, timeout: 5000 }, res => {
      let text = ''; res.on('data', bytes => { text += bytes }); res.on('end', () => resolve({ status: res.statusCode!,
        ...(res.headers['set-cookie']?.[0] ? { cookie: res.headers['set-cookie'][0].split(';')[0]! } : {}), value: text ? JSON.parse(text) : undefined }))
    }); req.on('error', reject); req.on('timeout', () => req.destroy(new Error('fixture timeout')))
    req.end(body === undefined ? undefined : JSON.stringify(body))
  })
}
async function serve(f: Awaited<ReturnType<typeof setup>>) {
  const records = new Map<string, unknown>(), assets = new Map<string, Buffer>()
  let html = '{}'
  f.ctx.provide('credentials', { async modifyRecord(key: string, mutate: (value: unknown) => Promise<unknown>) {
    const value = await mutate(records.get(key)); if (value !== undefined) records.set(key, value); return records.get(key)
  } } as never)
  await f.ctx.plugin(WebServer, { host: '127.0.0.1', port: 0 }); await f.ctx.plugin(Connection)
  f.ctx.webServer.register({ kind: 'exact', path: '/', handler(req, res) { if (f.ctx.connection.authorizeIndex(req, res)) { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(html) } } })
  f.ctx.webServer.register({ kind: 'prefix', path: '/fixture/assets', handler(req, res) {
    const rejected = f.ctx.connection.requestRejection(req)
    if (rejected !== undefined) { res.writeHead(rejected); res.end(); return }
    const content = assets.get(req.url!.slice('/fixture/assets/'.length))
    res.writeHead(content === undefined ? 404 : 200, { 'content-type': 'text/javascript' }); res.end(content)
  } })
  f.ctx.webServer.register({ kind: 'exact', path: '/fixture/task', async handler(req, res) {
    const rejected = f.ctx.connection.requestRejection(req)
    if (rejected !== undefined) { res.writeHead(rejected); res.end(); return }
    let body = ''
    for await (const bytes of req) { body += String(bytes); if (body.length > 4096) { res.writeHead(400); res.end(); return } }
    await f.send(String(JSON.parse(body).text)); res.writeHead(200); res.end('done')
  } })
  registerAdaptiveTaskHttp(f.ctx, f.runtime)
  const origin = `http://127.0.0.1:${f.ctx.webServer.port}`, issued = await http(f.ctx.connection.authenticatedUrl(origin))
  expect(issued.status).toBe(303)
  const headers = { cookie: issued.cookie!, origin, 'content-type': 'application/json' }, url = origin + ADAPTIVE_TASK_PATH
  return { origin, headers, url, setPage(value: string, entries: Array<[string, Buffer]>) { html = value; for (const [name, bytes] of entries) assets.set(name, bytes) } }
}
it('keeps signed-cookie activation closed and preserves existing delegation safety exits and ownership', async () => {
  const f = await setup(), { origin, headers, url } = await serve(f)
  expect((await http(url, { ...headers, cookie: '' }, f.build('start', 0))).status).toBe(401)
  for (const action of ['start', 'resume', 'upgrade', 'delegate-enable'] as const) {
    const result = await http(url, headers, f.build(action, 0, action === 'delegate-enable' ? f.grant : {}))
    expect(result.status).toBe(409); expect(result.value).toEqual({ error: 'TASK_PUBLIC_RELEASE_PAUSED' })
  }
  // Explicit test-only host preparation represents a pre-existing v2 grant.
  // It does not enable a production route or mutate the compiled release gate.
  const principal = adaptiveBrowserPrincipal({ headers: { ...headers, host: new URL(origin).host } } as IncomingMessage)
  let state = await f.runtime.command(f.build('start', 0), principal)
  state = await f.runtime.command(f.build('upgrade', state.revision), principal)
  state = await f.runtime.command(f.build('delegate-enable', state.revision, f.grant), principal)
  let result = await http(url + '?sessionId=' + f.agent.id, headers)
  expect(result.value).toMatchObject({ mode: 'interrupted', canStart: false, delegation: { version: 2, enabled: true } })
  expect((await http(url, { ...headers, 'sec-fetch-site': 'cross-site' }, f.build('manual', state.revision))).status).toBe(403)
  const other = await http(f.ctx.connection.authenticatedUrl(origin))
  expect((await http(url + '?sessionId=' + f.agent.id, { ...headers, cookie: other.cookie! })).status).toBe(403)
  expect((await http(url, headers, f.build('resume', state.revision))).status).toBe(409)
  for (const action of ['stop', 'manual', 'delegate-disable', 'downgrade'] as const) {
    result = await http(url, headers, f.build(action, result.value.revision))
    expect(result.status, JSON.stringify(result.value)).toBe(200)
    expect(result.value.reserved).toBe(0)
  }
  expect(await f.store.read(f.agent.id)).toMatchObject({ version: 1, mode: 'manual', reserved: 0 })
  expect(f.wires).toHaveLength(0)
})

if (process.env.ADAPTIVE_DELEGATION_UI === '1') it('drives paused Chromium recovery for a pre-existing delegated task over signed host HTTP', async () => {
  const f = await setup(), web = await serve(f)
  const { build } = await import('tsdown'), output = join(f.root, 'browser')
  await build({ config: false, entry: { browser: join(process.cwd(), 'scripts/adaptive-task-browser-entry.tsx') },
    outDir: output, platform: 'browser', format: 'esm', target: 'es2022', dts: false, report: false, logLevel: 'silent',
    deps: { alwaysBundle: [/.*/] }, define: { 'process.env.NODE_ENV': '"production"' } })
  const names = await readdir(output), entry = names.find(name => /^browser\.m?js$/u.test(name))!
  expect(entry).toBeDefined()
  web.setPage('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<style>:root{--dsw-alias-border-l2:#d5d7db;--dsw-alias-bg-layer-1:white;--dsw-alias-label-primary:#222}body{font:14px/1.5 system-ui;background:#f5f6f8}button,input,textarea{font:inherit}dialog::backdrop{background:#0006}</style>'
    + '<div id="task-controls" data-session-id="consent-root"></div><form id="task-form"><textarea id="task-text" aria-label="Task"></textarea><button>Send task</button></form>'
    + '<p id="task-result"></p><script type="module" src="/fixture/assets/' + entry + '"></script>',
  await Promise.all(names.map(async name => [name, await readFile(join(output, name))] as [string, Buffer])))
  const { chromium } = await import('playwright'), browser = await chromium.launch({ headless: true })
  const errors: string[] = []; let external = 0
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/*', route => {
      if (new URL(route.request().url()).origin !== web.origin) { external++; return route.abort() }
      return route.continue()
    })
    await page.goto(f.ctx.connection.authenticatedUrl(web.origin))
    const cookies = await page.context().cookies()
    const credential = cookies.filter(cookie => cookie.name.startsWith('dsh-auth-')).map(cookie => cookie.name + '=' + cookie.value).join('; ')
    const principal = adaptiveBrowserPrincipal({ headers: { host: new URL(web.origin).host, cookie: credential } } as IncomingMessage)
    f.setOwner(principal)
    await f.ready(); await f.success(); await f.send('ORIGINAL BROWSER DELEGATION REQUIREMENT')
    expect(f.wires.map(w => w.model)).toEqual([main, child, child, main])
    // Reload the unchanged closed public surface after fixture-only legacy preparation.
    await page.reload()
    await page.getByRole('button', { name: '已有任务控制', exact: true }).click()
    await page.getByText('已预留请求: 4 / 20', { exact: false }).waitFor()
    expect(await page.getByRole('checkbox').count()).toBe(0)
    expect(await page.getByRole('button', { name: '按原范围继续' }).count()).toBe(0)
    expect(await page.locator('dialog').evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
    if (process.env.ADAPTIVE_DELEGATION_SCREENSHOT) await page.screenshot({ path: process.env.ADAPTIVE_DELEGATION_SCREENSHOT, fullPage: true })
    await page.getByRole('button', { name: '切回手动', exact: true }).click()
    await page.getByText('已记录状态: manual', { exact: false }).waitFor()
    for (const action of ['delegate-disable', 'downgrade'] as const) {
      const state = await f.state()
      const result = await page.context().request.post(web.url, { data: f.build(action, state.revision), headers: { origin: web.origin } })
      expect(result.status()).toBe(200)
    }
    const stored = await f.store.read(f.agent.id)
    expect(stored).toMatchObject({ version: 1, mode: 'manual', reserved: 4 })
    expect(external).toBe(0); expect(errors).toEqual([])
    expect(f.ctx.tools.get(TASK_DELEGATE_TOOL, f.agent)).toBeUndefined()
  } finally { await browser.close() }
}, 60000)
