/** Exact alpha.3 recovery contract; executed by installed-Host matrices. */
import { expect, it, afterEach } from 'vitest'
import { SessionId } from '@deepseek-ai/dsh-session'
import { taskIdentity } from '../src/adaptive-task-store.ts'
import { TaskDelegationHost } from '../src/adaptive-task-delegation-host.ts'
import { publicTaskCommandAllowed } from '../src/adaptive-task-publication.ts'
import { setup, seedInterrupted, cleanupRecoveryFixtures, owner, model } from './adaptive-task-recovery-setup.ts'
afterEach(cleanupRecoveryFixtures)

for (const version of [1, 2] as const) {
  it(`alpha3 v${version} reads old state without requests or new authority`, async () => {
    const f = await setup(version), s = await f.state()
    expect(s).toMatchObject({ mode: 'interrupted', reserved: 3, maximumRequests: 12, canStart: false, unavailable: 'TASK_HOST_RECOVERY_ONLY' })
    expect(f.calls()).toBe(0)
    expect(f.ctx.agents.list()).toHaveLength(1)
    const doc = await f.store.read(f.agent.id)
    expect(doc?.receipts).toEqual([{ id: 'old-operation-0001', digest: taskIdentity('old-input') }])
    expect(doc?.owner).toBe(owner)
  })
  it(`alpha3 v${version} rejects stale and direct activation without mutation`, async () => {
    const f = await setup(version), s = await f.state(), before = await f.store.read(f.agent.id)
    for (const action of ['start', 'resume', 'upgrade', 'delegate-enable'] as const) {
      expect(publicTaskCommandAllowed(action)).toBe(false)
      const extra = action === 'start' ? { models: [model], efforts: { [model]: ['medium'] }, maximumRequests: 12 }
        : action === 'delegate-enable' ? { files: ['notes.txt'], routes: [{ model, effort: 'medium' }], maxChildRequests: 1, timeoutMs: 30000, disclose: true } : {}
      await expect(f.command(action, s.revision, extra)).rejects.toThrow('TASK_HOST_RECOVERY_ONLY')
    }
    expect(await f.store.read(f.agent.id)).toEqual(before)
    expect(f.calls()).toBe(0)
  })
  it(`alpha3 v${version} blocks old automatic dispatch before the model`, async () => {
    const f = await setup(version)
    await f.state(); await f.send()
    expect(f.calls()).toBe(0)
    expect((await f.store.read(f.agent.id))?.reserved).toBe(3)
    expect(f.ctx.agents.list()).toHaveLength(1)
  })
  it(`alpha3 v${version} preserves owner and revision checks on safety exits`, async () => {
    const f = await setup(version), s = await f.state()
    await expect(f.command('manual', s.revision, {}, taskIdentity('foreign'))).rejects.toThrow('TASK_OWNER_MISMATCH')
    await expect(f.command('stop', s.revision - 1)).rejects.toThrow('TASK_STALE_REVISION')
    expect((await f.state()).reserved).toBe(3)
    expect(f.calls()).toBe(0)
  })
  it(`alpha3 v${version} stops and preserves spent counters`, async () => {
    const f = await setup(version), s = await f.state()
    await f.command('stop', s.revision)
    expect(await f.state()).toMatchObject({ mode: 'stopped', reserved: 3, maximumRequests: 12 })
    expect(f.calls()).toBe(0)
  })
  it(`alpha3 v${version} manual takeover permits only an ordinary explicit model`, async () => {
    const f = await setup(version), s = await f.state()
    await f.command('manual', s.revision); await f.send()
    expect(f.calls()).toBe(1)
    expect(await f.state()).toMatchObject({ mode: 'manual', reserved: 3, maximumRequests: 12 })
  })
  it(`alpha3 v${version} serializes concurrent exits and survives runtime reload`, async () => {
    const f = await setup(version), s = await f.state()
    const results = await Promise.allSettled([f.command('manual', s.revision), f.command('stop', s.revision)])
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    const before = await f.store.read(f.agent.id)
    await f.reload()
    expect(await f.state()).toMatchObject({ mode: before?.mode, reserved: 3, maximumRequests: 12 })
    const after = await f.store.read(f.agent.id)
    expect(after?.owner).toBe(before?.owner)
    expect(after?.receipts).toEqual(before?.receipts)
    expect(f.calls()).toBe(0)
  })
}
for (const version of [1, 2] as const) {
  it(`alpha3 v${version} refuses missing or corrupt retained state without dispatch`, async () => {
    const f = await setup(version)
    await f.state(); await f.removeState()
    await expect(f.state()).rejects.toThrow('TASK_STATE_MISSING')
    await f.send(); expect(f.calls()).toBe(0)
    // A separate root proves corrupt bytes also fail closed, without a repair/reset.
    const other = await setup(version)
    await other.corruptState()
    await expect(other.state()).rejects.toThrow()
    await other.send(); expect(other.calls()).toBe(0)
  })
  it(`alpha3 v${version} preserves ordinary work in another live root`, async () => {
    const f = await setup(version)
    await f.state()
    const { agent } = await f.ctx.agents.create({ sessionId: SessionId('ordinary-other-root'),
      agentOptions: { provider: 'openai-codex', model } })
    agent.followup((await import('@deepseek-ai/dsh-llm')).createUserMessage({ source: { kind: 'user' },
      content: [{ type: 'text', text: 'Synthetic unrelated ordinary work' }] }))
    await agent.whenIdle()
    expect(f.calls()).toBe(1)
    expect((await f.state()).reserved).toBe(3)
  })
}
it('alpha3 refuses direct evidence-child creation before removed presentation APIs', async () => {
  const f = await setup(2)
  const host = new TaskDelegationHost(f.ctx)
  await expect(host.create(f.agent, { childSessionId: null, childSessionKey: null } as never, new AbortController().signal,
    { check() {}, execute() { throw new Error('No tool may execute') } })).rejects.toThrow('TASK_HOST_RECOVERY_ONLY')
  expect(f.ctx.agents.list()).toHaveLength(1)
  expect(f.calls()).toBe(0)
})

it('alpha3 cancellation of ordinary manual work never restores Task authority or refunds counters', async () => {
  const f = await setup(2), s = await f.state()
  await f.command('manual', s.revision); f.hold()
  const pending = f.send()
  await expect.poll(f.calls).toBe(1)
  f.agent.cancel({ kind: 'user' })
  await pending
  expect(await f.state()).toMatchObject({ mode: 'manual', reserved: 3, maximumRequests: 12 })
  expect(f.calls()).toBe(1)
})

it('alpha3 cold ledger cleanup requires actual absence of live children and keeps delivery unconfirmed', async () => {
  const f = await setup(2)
  await seedInterrupted(f)
  const state = await f.state()
  const doc = await f.store.read(f.agent.id)
  expect(doc?.version).toBe(2)
  if (doc?.version !== 2) throw new Error('v2 required')
  expect(doc.reserved).toBe(3)
  expect(doc.delegation.runs[0]).toMatchObject({ cleanup: 'verified', delivery: 'none', attempts: ['attempt-000000001'] })
  await f.command('manual', state.revision)
  const manual = await f.state()
  expect(manual.delegation?.canDowngrade).toBe(false)
  await expect(f.command('downgrade', manual.revision)).rejects.toThrow()
  expect((await f.store.read(f.agent.id))?.version).toBe(2)
  expect(f.calls()).toBe(0)
})
it('alpha3 never claims cleanup of a still-live owned child', async () => {
  const f = await setup(2)
  await seedInterrupted(f)
  const create: Parameters<typeof f.ctx.agents.create>[0] & { parentAgent: typeof f.agent } = {
    parentAgent: f.agent, sessionId: SessionId('retained-live-child'),
    meta: { parentSession: f.agent.id, origin: 'subagent', delegationDepth: 1 },
    agentOptions: { provider: 'openai-codex', model } }
  const child = await f.agent.ctx.agents.create(create)
  try {
    const before = await f.store.read(f.agent.id)
    await expect(f.state()).rejects.toThrow('TASK_CHILDREN_LIVE')
    expect(await f.store.read(f.agent.id)).toEqual(before)
    expect(f.calls()).toBe(0)
  } finally { await child.dispose() }
  expect((await f.state()).reserved).toBe(3)
})


for (const version of [1, 2] as const) it(`alpha3 v${version} keeps signed Host HTTP ownership and safety exits`, async () => {
  const f = await setup(version)
  const [{ WebServer }, Connection, { request }, { adaptiveBrowserPrincipal, registerAdaptiveTaskHttp }] = await Promise.all([
    import('@deepseek-ai/dsh-host-webserver'), import('@deepseek-ai/dsh-client-connection'), import('node:http'), import('../src/adaptive-task-http.ts'),
  ])
  const records = new Map()
  f.ctx.provide('credentials', { async modifyRecord(key: string, mutate: (value: unknown) => Promise<unknown>) {
    const next = await mutate(records.get(key)); if (next !== undefined) records.set(key, next); return records.get(key)
  } } as never)
  await f.ctx.plugin(WebServer, { host: '127.0.0.1', port: 0 }); await f.ctx.plugin(Connection)
  f.ctx.webServer.register({ kind: 'exact', path: '/', handler(req, res) {
    if (f.ctx.connection.authorizeIndex(req, res)) { res.writeHead(200); res.end('Synthetic recovery fixture') }
  } })
  registerAdaptiveTaskHttp(f.ctx, f.runtime())
  const origin = `http://127.0.0.1:${f.ctx.webServer.port}`
  const http = (url: string, headers: Record<string, string> = {}, body?: unknown) => new Promise<{ status: number; cookie?: string; value: any }>((resolve, reject) => {
    const req = request(url, { method: body === undefined ? 'GET' : 'POST', headers, timeout: 5000 }, res => {
      let text = ''; res.setEncoding('utf8'); res.on('data', data => { text += data; if (text.length > 8192) req.destroy(new Error('Fixture bound')) })
      res.on('end', () => { const cookie = res.headers['set-cookie']?.[0]?.split(';')[0]; resolve({ status: res.statusCode!, ...(cookie === undefined ? {} : { cookie }), value: text ? JSON.parse(text) : undefined }) })
    }); req.on('error', reject); req.on('timeout', () => req.destroy(new Error('Fixture timeout'))); req.end(body === undefined ? undefined : JSON.stringify(body))
  })
  const issued = await http(f.ctx.connection.authenticatedUrl(origin)); expect(issued.status).toBe(303)
  const headers = { cookie: issued.cookie!, origin, 'content-type': 'application/json' }
  const principal = adaptiveBrowserPrincipal({ headers: { ...headers, host: new URL(origin).host } } as never)
  await f.store.update(f.agent.id, doc => { if (!doc) throw new Error('Missing fixture state'); return { ...doc, owner: principal } })
  const path = origin + '/plugins/dsh-codex-connect/task', query = path + '?sessionId=' + f.agent.id
  expect((await http(query)).status).toBe(401)
  expect((await http(query, { ...headers, 'sec-fetch-site': 'cross-site' })).status).toBe(403)
  const foreign = await http(f.ctx.connection.authenticatedUrl(origin))
  expect((await http(query, { ...headers, cookie: foreign.cookie! })).status).toBe(403)
  let result = await http(query, headers)
  expect(result.status).toBe(200); expect(result.value.reserved).toBe(3)
  for (const action of ['resume', 'upgrade'] as const) {
    const blocked = await http(path, headers, { sessionId: f.agent.id, action, revision: result.value.revision, operationId: 'operation-' + action + '-0000001' })
    expect(blocked).toMatchObject({ status: 409, value: { error: 'TASK_PUBLIC_RELEASE_PAUSED' } })
  }
  result = await http(path, headers, { sessionId: f.agent.id, action: 'stop', revision: result.value.revision, operationId: 'http-stop-operation-0001' })
  expect(result).toMatchObject({ status: 200, value: { mode: 'stopped', reserved: 3 } })
  result = await http(path, headers, { sessionId: f.agent.id, action: 'manual', revision: result.value.revision, operationId: 'http-manual-operation-0001' })
  expect(result).toMatchObject({ status: 200, value: { mode: 'manual', reserved: 3 } })
  expect(f.calls()).toBe(0)
})
