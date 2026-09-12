/** Real Session Controller/Gateway over an explicitly ephemeral, offline experiment composition. */
import assert from 'node:assert/strict'
import { request as httpRequest } from 'node:http'
import { setTimeout as delay } from 'node:timers/promises'
export const SPLIT_CONVERSATION_SCENARIOS = ['conversation-allow', 'conversation-reject', 'conversation-revoke', 'conversation-admission', 'conversation-source-failure', 'conversation-prompt-failure']
const route = '/api/codex-connect/split-conversation'

export async function exerciseSplitConversation(scenario, f) {
  const { ctx, workspace, sha256, implementation, importHost, childWires, wires, waitFor, interaction, model } = f
  for (const name of ['typert-registry', 'session-query']) {
    const module = await importHost(`@deepseek-ai/dsh-${name}`)
    await ctx.plugin(module.default)
  }
  const attachments = await importHost('@deepseek-ai/dsh-attachment-local')
  await ctx.plugin(attachments.default, { root: `${workspace}/attachments` })
  // This experiment has no workspace records or durable grouping. Never mount the durable
  // registry (its required sessionPersistence peer would invalidate the Split grant).
  const unsupported = () => { throw new Error('SPLIT_EPHEMERAL_WORKSPACE_MUTATION_UNSUPPORTED') }
  ctx.provide('workspaceRegistry', { get: () => undefined, list: () => [], archivedSessionIds: [],
    create: unsupported, delete: unsupported, insertBefore: unsupported, archiveSession: unsupported,
    resolveByPath: async () => undefined })
  const defaults = await importHost('@deepseek-ai/dsh-agent-default-model')
  await ctx.plugin(defaults.default, { provider: 'openai-codex', model })
  for (const name of ['api-gateway', 'api-session-controller', 'api-remotes']) {
    const module = await importHost(`@deepseek-ai/dsh-${name}`)
    await ctx.plugin(module.default ?? module, {})
  }
  assert.ok(ctx.get('sessionController'), 'actual Session Controller must be active')
  assert.ok(ctx.get('typertGateway'), 'actual Gateway must be active')
  assert.equal(ctx.get('sessionPersistence'), undefined)
  const controllerTypes = await importHost('@deepseek-ai/dsh-api-session-controller/typert')
  ctx.typert.register(controllerTypes.TYPERT)
  let record
  ctx.provide('credentials', { async modifyRecord(_key, update) { const next = await update(record); if (next !== undefined) record = next; return record } })
  const web = await importHost('@deepseek-ai/dsh-host-webserver')
  await ctx.plugin(web.default, { host: '127.0.0.1', port: 0 })
  const connection = await importHost('@deepseek-ai/dsh-client-connection')
  await ctx.plugin(connection, { cookieMaxAgeDays: 1 })
  const origin = `http://127.0.0.1:${ctx.webServer.port}`
  const host = new URL(origin).host
  const mintCookie = () => {
    let cookie
    ctx.connection.authorizeIndex({ method: 'GET', url: ctx.connection.authenticatedUrl(origin), headers: { host } }, {
      writeHead(_code, headers) { cookie = headers?.['set-cookie']?.split(';', 1)[0] }, end() {},
    })
    assert.equal(typeof cookie, 'string'); return cookie
  }
  const cookie = mintCookie(); await delay(3); const otherCookie = mintCookie()
  const exchange = (body, extra = {}, path = route) => new Promise((resolve, reject) => {
    const req = httpRequest(`${origin}${path}`, { method: 'POST', headers: { host, origin, cookie,
      'content-type': 'application/json', 'x-dsh-split-request': '1', ...extra } }, res => {
      const chunks = []
      res.on('data', chunk => chunks.push(chunk))
      res.on('end', () => resolve({ status: res.statusCode, value: JSON.parse(Buffer.concat(chunks).toString('utf8')) }))
    })
    req.setTimeout(5000, () => req.destroy(new Error('Split conversation HTTP timeout')))
    req.on('error', reject); req.end(JSON.stringify(body))
  })
  const children = []; const parents = []; const lifecycle = []
  ctx.on('agent/created', ({ agent }) => (agent.session.header.origin === 'subagent' ? children : parents).push(agent))
  ctx.on('subagent/start', () => lifecycle.push('start'))
  ctx.on('subagent/end', () => lifecycle.push('end'))
  const config = { enabled: true, root: workspace, workspaceLabel: 'Ephemeral Split workspace',
    sources: [{ path: 'src/example.ts', sha256 }], providerName: 'split-exact-spawn', timeoutMs: 60000 }
  if (scenario === 'conversation-source-failure') config.sources[0].sha256 = '0'.repeat(64)
  if (scenario === 'conversation-prompt-failure') ctx.sessionController.prompt = async () => { throw new Error('Synthetic prompt admission failure') }
  assert.throws(() => implementation.registerSplitConversation(ctx, { ...config, enabled: false }), /SPLIT_EXPERIMENT_DISABLED/u)
  const flow = implementation.registerSplitConversation(ctx, config)
  try {
    if (interaction) {
      await interaction({ ctx, origin, cookie, exchange, children, parents })
    } else {
      const initial = await exchange({ action: 'status' })
      assert.equal(initial.status, 200); assert.deepEqual(initial.value.tasks, [])
      const create = { action: 'create', epoch: initial.value.epoch, operationId: 'conversation-test', brief: 'Inspect the approved example and cite its source.' }
      if (scenario === 'conversation-admission') {
        assert.equal((await exchange(create, { cookie: '' })).status, 401)
        assert.equal((await exchange(create, { origin: 'https://foreign.invalid' })).status, 403)
        assert.equal((await exchange({ ...create, sessionId: 'claimed-parent' })).status, 400)
        assert.equal((await exchange({ ...create, sources: config.sources })).status, 400)
        assert.equal((await exchange({ ...create, epoch: 'old-process' })).status, 409)
        assert.equal(parents.length, 0); assert.equal(wires.length, 0)
      }
      assert.equal((await exchange(create)).status, 202)
      assert.equal((await exchange(create)).status, 200, 'receipt replay must not create another parent')
      assert.equal((await exchange({ ...create, brief: 'changed' })).status, 409)
      assert.equal((await exchange({ ...create, operationId: 'different' })).status, 409)
      assert.deepEqual((await exchange({ action: 'status' }, { cookie: otherCookie })).value.tasks, [])
      if (scenario.endsWith('-failure')) {
        let receipt
        for (let i = 0; i < 100; i++) {
          receipt = (await exchange({ action: 'status' })).value.tasks[0]
          if (receipt.state === 'failed') break
          await delay(10)
        }
        assert.equal(receipt.state, 'failed'); assert.equal(receipt.target, undefined)
        assert.equal(wires.length, 0); assert.equal(children.length, 0)
        assert.equal((await exchange(create)).status, 200)
        return { scenario, syntheticOnly: true, actualGateway: true, actualSessionController: true, realProviderDispatches: 0, failedBeforeDispatch: true }
      }
      await waitFor(() => parents.length === 1 && wires.length === 1)
      const target = (await exchange({ action: 'status' })).value.tasks[0].target
      assert.ok(target)
      const approvalPath = '/api/codex-connect/split-approval'
      const status = async () => (await exchange({ ...target, action: 'status' }, {}, approvalPath)).value
      let view
      for (let i = 0; i < 200; i++) { view = await status(); if (view.view.phase === 'awaiting-approval') break; await delay(10) }
      assert.equal(view.view.phase, 'awaiting-approval'); assert.equal(children.length, 0)
      assert.equal((await exchange({ ...target, action: 'status' }, { cookie: otherCookie }, approvalPath)).status, 404)
      const mutation = (action, choice) => ({ ...target, action, operationId: action, expectedRevision: view.revision,
        reviewDigest: view.view.reviewDigest, ...(choice ? { choice } : {}) })
      const decision = mutation('decide', scenario === 'conversation-reject' ? 'reject' : 'allow-once')
      assert.equal((await exchange(decision, {}, approvalPath)).status, 200)
      if (scenario === 'conversation-revoke') {
        await waitFor(() => childWires.length === 1)
        view = await status()
        const revoking = await exchange(mutation('revoke'), {}, approvalPath)
        assert.equal(revoking.value.view.phase, 'revoking')
        assert.ok(ctx.agents.get(children[0].id), 'revoking still awaits the actual child')
      }
      await parents[0].whenIdle()
      const final = await status()
      assert.equal(final.view.phase, scenario === 'conversation-reject' ? 'rejected' : scenario === 'conversation-revoke' ? 'revoked' : 'completed')
      assert.equal((await exchange(decision, {}, approvalPath)).status, 200)
    }
    assert.equal(parents.length, 1)
    await parents[0].whenIdle()
    assert.equal(children.length, scenario === 'conversation-reject' ? 0 : 1)
    assert.equal(childWires.length, scenario === 'conversation-reject' ? 0 : scenario === 'conversation-revoke' ? 1 : 2)
    assert.deepEqual(lifecycle, scenario === 'conversation-reject' ? [] : ['start', 'end'])
    for (const child of children) assert.equal(ctx.agents.get(child.id), undefined)
    const transcript = JSON.stringify(parents[0].session.snapshotEvents())
    if (scenario !== 'conversation-revoke') assert.ok(transcript.includes('Parent consumed the worker result.'))
    if (!['conversation-reject', 'conversation-revoke'].includes(scenario)) assert.ok(transcript.includes('Verified the fixture.'))
    return { scenario, syntheticOnly: true, actualGateway: true, actualSessionController: true, ephemeralWorkspaceCatalog: true,
      parents: parents.length, children: children.length, childMockDispatches: childWires.length, mockDispatches: wires.length,
      realProviderDispatches: 0, childQuiescent: true }
  } finally { await flow.dispose() }
}
