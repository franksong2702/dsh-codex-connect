/** Actual DSH WebServer/Connection cookie verification and product routes; synthetic account only. */
import { Context } from '@deepseek-ai/cordis'
import { WebServer } from '@deepseek-ai/dsh-host-webserver'
import * as Connection from '@deepseek-ai/dsh-client-connection'
import Llm, { createUserMessage, ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import Sessions, { SessionId } from '@deepseek-ai/dsh-session'
import Projection from '@deepseek-ai/dsh-session-projection'
import Agents from '@deepseek-ai/dsh-agent'
import Loop from '@deepseek-ai/dsh-agent-loop'
import Prompt from '@deepseek-ai/dsh-system-prompt'
import Tools from '@deepseek-ai/dsh-tools'
import { mkdtemp, rm, readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { request } from 'node:http'
import type { IncomingHttpHeaders } from 'node:http'
import { randomUUID } from 'node:crypto'
import { zstdDecompressSync } from 'node:zlib'
import { afterEach, expect, it, vi } from 'vitest'
import * as Product from '../src/index.ts'
import { OpenAICodexCredentialStore } from '../src/store.ts'
import { ADAPTIVE_TASK_PATH, ADAPTIVE_TASK_MODELS, ADAPTIVE_TASK_TOOL } from '../src/adaptive-task-contract.ts'
import { adaptiveBrowserPrincipal } from '../src/adaptive-task-http.ts'
import { AdaptiveTaskStore, taskIdentity } from '../src/adaptive-task-store.ts'
import { ADAPTIVE_TASK_RELEASE_PAUSED } from '../src/adaptive-task-publication.ts'
import type { IncomingMessage } from 'node:http'
import { createHash } from 'node:crypto'
import { OPENAI_CODEX_AUTH_ACCOUNTS_PATH } from '../src/auth-paths.ts'
import { OPENAI_CODEX_MODEL_CATALOG_PATH } from '../src/model-contract.ts'
import { OPENAI_CODEX_RUNTIME_PATH, OPENAI_CODEX_UPDATE_PATH } from '../src/update-paths.ts'
import { dshAdmission } from '../src/dsh-admission.mjs'

let ctx: Context | undefined
let directory: string | undefined
it('matches the host canonical cookie authority across case, default ports and IPv6', () => {
  for (const [raw, canonical] of [['LOCALHOST:80', 'localhost'], ['[0:0:0:0:0:0:0:1]:80', '[::1]']]) {
    const cookie = 'dsh-auth-' + createHash('sha256').update(canonical!).digest('base64url') + '=synthetic'
    const request = (host: string) => ({ headers: { host, cookie } }) as IncomingMessage
    expect(adaptiveBrowserPrincipal(request(raw!))).toBe(adaptiveBrowserPrincipal(request(canonical!)))
  }
})
function http(url: URL | string, options: { method?: string; headers?: Record<string, string>; body?: string } = {}) {
  return new Promise<{ status: number; headers: IncomingHttpHeaders; text: string }>((resolve, reject) => {
    const req = request(url, { method: options.method ?? 'GET', headers: options.headers,
      timeout: 5000 }, res => {
      let text = ''; res.setEncoding('utf8')
      res.on('data', part => { text += part; if (text.length > 100000) req.destroy(new Error('Fixture response exceeded bound')) })
      res.on('end', () => resolve({ status: res.statusCode!, headers: res.headers, text }))
    })
    req.on('timeout', () => req.destroy(new Error('Fixture timed out'))); req.on('error', reject)
    req.end(options.body)
  })
}
async function fixture() {
  directory = await mkdtemp(join(tmpdir(), 'adaptive-task-http-'))
  vi.stubEnv('DSH_HOME', directory); vi.stubEnv('OTEL_SDK_DISABLED', 'true')
  const store = new OpenAICodexCredentialStore()
  const claim = Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: 'synthetic-http-fixture' } })).toString('base64url')
  await store.modify('openai-codex', async () => ({ type: 'oauth', access: `e30.${claim}.fixture`, refresh: 'fixture', accountId: 'synthetic-http-fixture', expires: Date.now() + 3600000 }))
  const wires: any[] = []
  vi.stubGlobal('WebSocket', class { constructor() { throw new Error('Synthetic fixture forbids external transport') } })
  vi.stubGlobal('fetch', vi.fn(async (url: unknown, init: RequestInit) => {
    expect(String(url)).toBe('https://chatgpt.com/backend-api/codex/responses')
    const raw = new Headers(init.headers).get('content-encoding') === 'zstd' ? zstdDecompressSync(init.body as Uint8Array).toString('utf8') : String(init.body)
    const wire = JSON.parse(raw); wires.push(wire)
    const item = { type: 'message', id: 'm_fixture', role: 'assistant', phase: 'final_answer', status: 'completed', content: [{ type: 'output_text', text: 'Fixture done.', annotations: [] }] }
    return new Response([{ type: 'response.output_item.added', output_index: 0, item },
      { type: 'response.output_item.done', output_index: 0, item },
      { type: 'response.completed', response: { id: 'r_fixture', model: wire.model, status: 'completed', output: [item] } },
    ].map(event => `data: ${JSON.stringify(event)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } })
  }))
  const host = new Context(); ctx = host
  for (const feature of [Llm, Sessions, Projection, Agents, Prompt, Tools]) await host.plugin(feature)
  await host.plugin(Loop, { agents: [] })
  // The actual Connection generates/signs its own synthetic cookie via its public credential API.
  const records = new Map<string, unknown>()
  host.provide('credentials', { async modifyRecord(key: string, mutate: (value: unknown) => Promise<unknown>) {
    const next = await mutate(records.get(key)); if (next !== undefined) records.set(key, next); return records.get(key)
  } } as never)
  await host.plugin(WebServer, { host: '127.0.0.1', port: 0 })
  let connection = await host.plugin(Connection)
  const webServer = host.webServer
  const register = webServer.register
  const taskRoutes: Array<{ route: Parameters<typeof register>[0]; disposed: number }> = []
  let taskRegistrationAttempts = 0
  vi.spyOn(webServer, 'register').mockImplementation(route => {
    const isTask = route.kind === 'exact' && route.path === ADAPTIVE_TASK_PATH
    if (isTask) taskRegistrationAttempts++
    const unregister = register.call(webServer, route)
    if (!isTask) return unregister
    const tracked = { route, disposed: 0 }; taskRoutes.push(tracked)
    return () => { tracked.disposed++; unregister() }
  })
  let product = await host.plugin(Product, {})
  const settle = async () => {
    for (const runtime of host.registry.values()) for (const fiber of runtime.fibers) await fiber.await()
  }
  await settle()
  let html = 'Synthetic authenticated index'
  const assets = new Map<string, Buffer>()
  host.webServer.register({ kind: 'exact', path: '/', handler(req, res) {
    if (host.connection.authorizeIndex(req, res)) { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(html) }
  } })
  host.webServer.register({ kind: 'prefix', path: '/fixture/assets', handler(req, res) {
    const admission = host.connection.admit(req)
    if (!('peer' in admission)) { res.writeHead(admission.rejection); res.end(); return }
    const data = assets.get(req.url!.slice('/fixture/assets/'.length))
    res.writeHead(data === undefined ? 404 : 200, { 'content-type': 'text/javascript' }); res.end(data)
  } })
  const { agent } = await host.agents.create({ sessionId: SessionId('authenticated-task-fixture'), meta: { cwd: directory },
    agentOptions: { provider: 'openai-codex', model: 'gpt-5.6-terra', reasoningEffort: ReasoningEffortId('low') } })
  const origin = `http://127.0.0.1:${host.webServer.port}`
  const authorized = await http(host.connection.authenticatedUrl(origin))
  expect(authorized.status).toBe(303)
  const cookie = authorized.headers['set-cookie']![0]!.split(';')[0]!
  const headers = { cookie, origin, 'content-type': 'application/json' }
  const read = () => http(origin + ADAPTIVE_TASK_PATH + '?sessionId=' + agent.id, { headers })
  const taskModels = await Promise.all(ADAPTIVE_TASK_MODELS.map(model => host.llm.resolveModelInfo('openai-codex', model)))
  const efforts = Object.fromEntries(taskModels.map(model => [model.id, model.reasoning!.efforts.map(effort => String(effort.id))]))
  const body = (action = 'start', revision = 0, extra = {}) => JSON.stringify({ sessionId: agent.id, action, revision, operationId: randomUUID(),
    ...(action === 'start' ? { models: [...ADAPTIVE_TASK_MODELS], efforts, maximumRequests: 10 } : {}), ...extra })
  // Fixture-only prior-version document: the shipping endpoint remains closed throughout.
  // Restore through the actual product rather than introducing a second live runtime.
  const seedLegacy = async (credential = cookie) => {
    const h = agent.session.header
    const taskStore = new AdaptiveTaskStore(join(dirname(store.filename), 'codex-connect-tasks'))
    const principal = adaptiveBrowserPrincipal({ headers: { host: new URL(origin).host, cookie: credential } } as IncomingMessage)
    await taskStore.update(agent.id, previous => {
      expect(previous).toBeUndefined()
      return { version: 1, sessionId: agent.id, owner: principal,
        sessionKey: taskIdentity(JSON.stringify([h.id, h.createdAt, h.cwd ?? '', h.isSeeded, h.parentSession ?? ''])),
        runtime: taskIdentity('previous-process'), revision: 5, mode: 'auto',
        route: { model: 'gpt-5.6-sol', effort: 'medium' }, capabilities: [{ model: 'gpt-5.6-sol', efforts: ['medium'] }],
        maximumRequests: 10, reserved: 3, selectionSeq: -1, portable: false, handoffSeq: -1,
        receipts: [{ id: randomUUID(), digest: taskIdentity('prior-consent') }] }
    })
  }
  return { host, agent, origin, cookie, headers, read, body, wires, seedLegacy, taskRoutes,
    taskRegistrationAttempts: () => taskRegistrationAttempts,
    async unloadConnection() { await connection.dispose(); await settle() },
    async reloadConnection() { connection = await host.plugin(Connection); await settle() },
    async unloadProduct() { await product.dispose(); await settle() },
    async reloadProduct() { product = await host.plugin(Product, {}); await settle() },
    async reloadTaskRoute() {
      const fiber = [...host.registry.values()].flatMap(runtime => [...runtime.fibers])
        .find(candidate => candidate.getEffects().some(effect => effect.label === 'dsh-codex-connect: task route'))
      if (fiber === undefined) throw new Error('Synthetic fixture missing Task route fiber')
      await fiber.restart(); await settle()
    },
    setPage(value: string, entries: Array<[string, Buffer]>) { html = value; for (const [name, bytes] of entries) assets.set(name, bytes) },
    post: (content = body(), override: Record<string, string> = {}) => http(origin + ADAPTIVE_TASK_PATH, { method: 'POST', headers: { ...headers, ...override }, body: content }) }
}
afterEach(async () => {
  try { await ctx?.fiber.dispose() } finally {
    ctx = undefined; vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs()
    if (directory !== undefined) await rm(directory, { recursive: true, force: true }); directory = undefined
  }
})
it('keeps signed public task activation closed while ordinary manual model requests still work', async () => {
  const f = await fixture()
  expect(JSON.parse((await f.read()).text)).toMatchObject({ mode: 'off', canStart: false, unavailable: ADAPTIVE_TASK_RELEASE_PAUSED })
  for (const action of ['start', 'resume', 'upgrade', 'delegate-enable']) {
    const extra = action === 'delegate-enable' ? { files: ['notes.txt'], routes: [{ model: 'gpt-5.6-sol', effort: 'medium' }],
      maxChildRequests: 2, timeoutMs: 1000, disclose: true } : {}
    const result = await f.post(f.body(action, 0, extra))
    expect(result.status).toBe(409); expect(JSON.parse(result.text)).toEqual({ error: ADAPTIVE_TASK_RELEASE_PAUSED })
  }
  expect(f.wires).toHaveLength(0)
  expect(JSON.parse((await f.read()).text)).toMatchObject({ revision: 0, mode: 'off', reserved: 0 })
  f.agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Ordinary manual request.' }] }))
  await f.agent.whenIdle()
  expect(f.wires).toHaveLength(1); expect(f.wires[0].model).toBe('gpt-5.6-terra')
  expect(f.wires[0].tools?.some((tool: any) => tool.name === ADAPTIVE_TASK_TOOL)).not.toBe(true)
  expect(JSON.parse((await f.read()).text).mode).toBe('off')
})
it('lets ordinary requests proceed on an unverified Host while refusing saved Task authority', async () => {
  const f = await fixture()
  vi.spyOn(dshAdmission, 'classify').mockReturnValue('unverified-in-range')
  const send = async (text: string) => {
    f.agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text }] }))
    await f.agent.whenIdle()
  }
  await send('Ordinary request before loading retained state.')
  expect(f.wires).toHaveLength(1)
  expect(f.wires[0].model).toBe('gpt-5.6-terra')
  await f.seedLegacy()
  const read = await f.read()
  expect(read.status).toBe(409)
  expect(JSON.parse(read.text)).toEqual({ error: 'TASK_HOST_OWNERSHIP_UNVERIFIED' })
  expect((await f.post(f.body('manual', 5))).status).toBe(409)
  await send('Cannot run the retained task without verified ownership.')
  expect(f.wires).toHaveLength(1)
})

it('rejects missing cookie, forged cookie and cross-origin mutation before creating a task', async () => {
  const f = await fixture()
  for (const override of [{ cookie: '' }, { cookie: f.cookie + 'tampered' }, { origin: 'https://not-this-host.example' }, { 'sec-fetch-site': 'cross-site' }]) {
    expect([401, 403]).toContain((await f.post(f.body(), override)).status)
  }
  expect(JSON.parse((await f.read()).text).mode).toBe('off'); expect(f.wires).toHaveLength(0)
})
it('prevents another valid browser credential from inspecting or controlling a bound task', async () => {
  const f = await fixture(); await f.seedLegacy()
  const state = JSON.parse((await f.read()).text); expect(state).toMatchObject({ mode: 'interrupted', reserved: 3 })
  const issued = await http(f.host.connection.authenticatedUrl(f.origin))
  const other = issued.headers['set-cookie']![0]!.split(';')[0]!
  expect(other).not.toBe(f.cookie)
  const denied = await http(f.origin + ADAPTIVE_TASK_PATH + '?sessionId=' + f.agent.id, { headers: { ...f.headers, cookie: other } })
  expect(denied.status).toBe(403)
  expect((await f.post(f.body('manual', 1), { cookie: other })).status).toBe(403)
  expect(JSON.parse((await f.read()).text).mode).toBe('interrupted')
})
it('rejects oversize, wrong-content-type, extra authority and stale mutation requests', async () => {
  const f = await fixture()
  expect((await f.post('x'.repeat(9000))).status).toBe(409)
  expect((await f.post(f.body(), { 'content-type': 'text/plain' })).status).toBe(409)
  expect((await f.post(f.body('start', 0, { approved: true }))).status).toBe(409)
  await f.seedLegacy()
  let state = JSON.parse((await f.read()).text)
  expect(state).toMatchObject({ mode: 'interrupted', reserved: 3, canStart: false })
  expect((await f.post(f.body('resume', state.revision))).status).toBe(409)
  expect((await f.post(f.body('manual', 0))).status).toBe(409)
  const stopped = await f.post(f.body('stop', state.revision)); expect(stopped.status).toBe(200)
  state = JSON.parse(stopped.text); expect(state).toMatchObject({ mode: 'stopped', reserved: 3 })
  const manual = await f.post(f.body('manual', state.revision)); expect(manual.status).toBe(200)
  expect(JSON.parse(manual.text)).toMatchObject({ mode: 'manual', reserved: 3, maximumRequests: 10 })
  expect(f.wires).toHaveLength(0)
})

it('removes and remounts exactly one product Task route when Connection is replaced on the same WebServer', async () => {
  const f = await fixture(); await f.seedLegacy()
  const port = f.host.webServer.port
  const oldVerifier = vi.spyOn(f.host.connection, 'admit')
  const initial = await f.read()
  expect(initial.status).toBe(200)
  expect(JSON.parse(initial.text)).toMatchObject({ mode: 'interrupted', reserved: 3, maximumRequests: 10 })
  expect(f.taskRoutes).toHaveLength(1)
  const originalHandler = f.taskRoutes[0]!.route.handler
  // Exercise the actual Product inject grouping, not only a hand-composed route fixture.
  const accounts = () => http(f.origin + OPENAI_CODEX_AUTH_ACCOUNTS_PATH, { headers: f.headers })
  const publicMetadata = () => Promise.all([OPENAI_CODEX_MODEL_CATALOG_PATH, OPENAI_CODEX_RUNTIME_PATH, OPENAI_CODEX_UPDATE_PATH]
    .map(path => http(f.origin + path)))
  expect((await accounts()).status).toBe(200)
  for (let cycle = 1; cycle <= 2; cycle++) {
    await f.unloadConnection()
    expect(f.host.get('connection')).toBeUndefined()
    expect(f.host.webServer.port).toBe(port)
    expect((await f.read()).status).toBe(404)
    expect((await f.post(f.body('manual'))).status).toBe(404)
    expect((await accounts()).status).toBe(404)
    // Catalog/update stay public; identity remains registered but fails closed
    // while its current Connection authority is unavailable.
    const metadata = await publicMetadata()
    expect(metadata.map(response => response.status)).toEqual([200, 503, 200])
    expect(JSON.parse(metadata[1]!.text)).toEqual({ error: 'DSH_CONNECTION_UNAVAILABLE' })
    expect(f.taskRoutes.every(entry => entry.disposed === 1)).toBe(true)
    await f.reloadConnection()
    expect(f.host.webServer.port).toBe(port)
    expect(f.taskRoutes).toHaveLength(cycle + 1)
    expect(f.taskRegistrationAttempts()).toBe(cycle + 1)
    expect(f.taskRoutes.filter(entry => entry.disposed === 0)).toHaveLength(1)
    expect(f.taskRoutes.at(-1)!.route.handler).not.toBe(originalHandler)
    expect((await accounts()).status).toBe(200)
    expect((await http(f.origin + OPENAI_CODEX_RUNTIME_PATH)).status).toBe(401)
    const runtime = await http(f.origin + OPENAI_CODEX_RUNTIME_PATH, { headers: f.headers })
    expect(runtime.status).toBe(200)
    expect(JSON.parse(runtime.text)).toMatchObject({ schemaVersion: 1, identity: { scope: 'host' } })
    const verifier = vi.spyOn(f.host.connection, 'admit')
    const read = await f.read()
    expect(read.status).toBe(200)
    expect(JSON.parse(read.text)).toMatchObject({ mode: 'interrupted', reserved: 3, maximumRequests: 10, canStart: false })
    const paused = await f.post(f.body('start'))
    expect(paused.status).toBe(409)
    expect(JSON.parse(paused.text)).toEqual({ error: ADAPTIVE_TASK_RELEASE_PAUSED })
    expect(verifier).toHaveBeenCalledTimes(2)
  }
  expect(oldVerifier).toHaveBeenCalledTimes(2)
  expect(f.wires).toHaveLength(0)
})

it('owns Task route cleanup across Task and Product reloads without reopening activation or resetting recovery', async () => {
  const f = await fixture(); await f.seedLegacy()
  const initial = JSON.parse((await f.read()).text)
  expect(initial).toMatchObject({ mode: 'interrupted', reserved: 3, maximumRequests: 10 })
  const port = f.host.webServer.port
  const firstRoute = f.taskRoutes[0]!
  await f.reloadTaskRoute()
  expect(firstRoute.disposed).toBe(1)
  expect(f.taskRoutes).toHaveLength(2)
  expect(f.taskRoutes.filter(entry => entry.disposed === 0)).toHaveLength(1)
  expect(f.taskRoutes.at(-1)!.route.handler).not.toBe(firstRoute.route.handler)
  expect((await f.read()).status).toBe(200)
  for (let cycle = 1; cycle <= 2; cycle++) {
    await f.unloadProduct()
    expect(f.host.webServer.port).toBe(port)
    expect((await f.read()).status).toBe(404)
    expect((await f.post(f.body('stop', initial.revision))).status).toBe(404)
    expect(f.taskRoutes.every(entry => entry.disposed === 1)).toBe(true)
    await f.reloadProduct()
    expect(f.host.webServer.port).toBe(port)
    expect(f.taskRoutes).toHaveLength(cycle + 2)
    expect(f.taskRegistrationAttempts()).toBe(cycle + 2)
    expect(f.taskRoutes.filter(entry => entry.disposed === 0)).toHaveLength(1)
    const read = await f.read()
    expect(read.status).toBe(200)
    const state = JSON.parse(read.text)
    expect(state).toMatchObject({ mode: 'interrupted', reserved: 3, maximumRequests: 10, canStart: false })
    expect((await f.post(f.body('manual', state.revision), { cookie: f.cookie + 'tampered' })).status).toBe(401)
    const paused = await f.post(f.body('start', state.revision))
    expect(paused.status).toBe(409)
    expect(JSON.parse(paused.text)).toEqual({ error: ADAPTIVE_TASK_RELEASE_PAUSED })
  }
  const restored = JSON.parse((await f.read()).text)
  const stopped = await f.post(f.body('stop', restored.revision))
  expect(stopped.status).toBe(200)
  const stoppedState = JSON.parse(stopped.text)
  expect(stoppedState).toMatchObject({ mode: 'stopped', reserved: 3, maximumRequests: 10 })
  const manual = await f.post(f.body('manual', stoppedState.revision))
  expect(manual.status).toBe(200)
  expect(JSON.parse(manual.text)).toMatchObject({ mode: 'manual', reserved: 3, maximumRequests: 10 })
  expect(f.wires).toHaveLength(0)
})

it('returns a structured unavailable response when the live Connection verifier throws', async () => {
  const f = await fixture()
  const verifier = vi.spyOn(f.host.connection, 'admit').mockImplementation(() => { throw new Error('Synthetic verifier failure') })
  for (const result of [await f.read(), await f.post(f.body('manual'))]) {
    expect(result.status).toBe(503)
    expect(result.headers['content-type']).toBe('application/json; charset=utf-8')
    expect(result.headers['cache-control']).toBe('no-store')
    expect(JSON.parse(result.text)).toEqual({ error: 'TASK_OPERATION_FAILED' })
  }
  verifier.mockRestore()
  expect(JSON.parse((await f.read()).text)).toMatchObject({ mode: 'off', reserved: 0, canStart: false })
  expect(f.wires).toHaveLength(0)
})

// The dedicated browser CI job installs Chromium; ordinary unit jobs exercise the HTTP cases above.
if (process.env.ADAPTIVE_TASK_UI === '1') it('runs the paused public control over authenticated HTTP and reconciles a lost manual-exit reply', async () => {
  const f = await fixture()
  const { build } = await import('tsdown')
  const output = join(directory!, 'browser')
  await build({ config: false, entry: { browser: join(process.cwd(), 'scripts/adaptive-task-browser-entry.tsx') },
    outDir: output, platform: 'browser', format: 'esm', target: 'es2022', dts: false, report: false, logLevel: 'silent',
    deps: { alwaysBundle: [/.*/] }, define: { 'process.env.NODE_ENV': '"production"' } })
  const names = await readdir(output)
  const entry = names.find(name => /^browser\.m?js$/u.test(name))!
  expect(entry).toBeDefined()
  f.setPage('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<div id="task-controls"></div><form id="task-form"><textarea id="task-text" aria-label="Task"></textarea><button>Send task</button></form>'
    + '<p id="task-result"></p><script type="module" src="/fixture/assets/' + entry + '"></script>',
  await Promise.all(names.map(async name => [name, await readFile(join(output, name))] as [string, Buffer])))
  f.host.webServer.register({ kind: 'exact', path: '/fixture/task', async handler(req, res) {
    const admission = f.host.connection.admit(req)
    if (!('peer' in admission)) { res.writeHead(admission.rejection); res.end(); return }
    let body = ''
    for await (const bytes of req) { body += String(bytes); if (body.length > 4096) { res.writeHead(400); res.end(); return } }
    const value = JSON.parse(body)
    f.agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: String(value.text) }] }))
    await f.agent.whenIdle(); res.writeHead(200); res.end('done')
  } })
  const { chromium } = await import('playwright')
  const browser = await chromium.launch({ headless: true })
  const errors: string[] = []; let external = 0
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/*', route => {
      if (new URL(route.request().url()).origin !== f.origin) { external++; return route.abort() }
      return route.continue()
    })
    await page.goto(f.host.connection.authenticatedUrl(f.origin))
    const browserCookies = await page.context().cookies()
    const credential = browserCookies.filter(cookie => cookie.name.startsWith('dsh-auth-')).map(cookie => cookie.name + '=' + cookie.value).join('; ')
    const current = () => page.context().request.get(f.origin + ADAPTIVE_TASK_PATH + '?sessionId=' + f.agent.id)
    expect((await (await current()).json()).canStart).toBe(false)
    expect(await page.getByRole('button', { name: '模型选择', exact: true }).count()).toBe(0)
    await f.seedLegacy(credential)
    await page.reload()
    await page.getByRole('button', { name: '已有任务控制', exact: true }).click()
    await page.getByText('已预留请求: 3 / 10', { exact: false }).waitFor()
    expect(await page.getByRole('checkbox').count()).toBe(0)
    expect(await page.getByRole('button', { name: '按原范围继续' }).count()).toBe(0)
    expect(await page.locator('dialog').evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
    let dropped = 0
    const lose = async (route: any) => {
      if (route.request().method() !== 'POST') return route.continue()
      const response = await route.fetch(); expect(response.status()).toBe(200)
      expect((await response.json()).mode).toBe('manual'); dropped++
      await route.abort('connectionreset')
    }
    await page.route('**' + ADAPTIVE_TASK_PATH, lose)
    await page.getByRole('button', { name: '切回手动', exact: true }).click()
    await page.getByRole('alert').waitFor()
    expect(dropped).toBe(1)
    await page.unroute('**' + ADAPTIVE_TASK_PATH, lose)
    await page.getByRole('button', { name: '重新读取状态', exact: true }).click()
    await page.getByText('已记录状态: manual', { exact: false }).waitFor()
    expect(dropped).toBe(1)
    await page.getByRole('button', { name: '关闭', exact: true }).click()
    await page.getByRole('textbox', { name: 'Task', exact: true }).fill('Manual task after retained grant.')
    await page.getByRole('button', { name: 'Send task' }).click()
    await page.getByText('Fixture task finished', { exact: true }).waitFor()
    expect(f.wires).toHaveLength(1)
    expect(f.wires[0].tools?.some((tool: any) => tool.name === ADAPTIVE_TASK_TOOL)).not.toBe(true)
    expect(await (await current()).json()).toMatchObject({ mode: 'manual', reserved: 3, maximumRequests: 10 })
    expect(errors).toEqual([]); expect(external).toBe(0)
  } finally { await browser.close() }
}, 60000)
