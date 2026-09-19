/** Actual HTTP + published DSH browser authentication, with disposable in-memory signing data. */
import assert from 'node:assert/strict'
import { request as httpRequest } from 'node:http'
import { setTimeout as delay } from 'node:timers/promises'
const path = '/api/codex-connect/split-approval'
export const SPLIT_TRANSPORT_SCENARIOS = Object.freeze([
  'transport-allow', 'transport-reject', 'transport-auth', 'transport-cross-session', 'transport-replay',
  'transport-stale-revision', 'transport-revoke', 'transport-epoch', 'transport-owner-disposed',
  'transport-body', 'transport-binding', 'transport-lost-response',
])
export async function exerciseSplitTransport(scenario, f) {
  const { ctx, parent, parentHandle, consent, implementation, importHost, childWires, children, llm, waitFor, interaction } = f
  const [web, connection] = await Promise.all(['@deepseek-ai/dsh-host-webserver', '@deepseek-ai/dsh-client-connection'].map(importHost))
  let record
  ctx.provide('credentials', { async modifyRecord(_key, update) { const next = await update(record); if (next !== undefined) record = next; return record } })
  await ctx.plugin(web.default, { host: '127.0.0.1', port: 0 })
  await ctx.plugin(connection, { cookieMaxAgeDays: 1 })
  const origin = `http://127.0.0.1:${ctx.webServer.port}`
  const host = new URL(origin).host
  const headers = cookie => ({ host, origin, cookie })
  const mintCookie = () => {
    let cookie; let status
    const authorized = ctx.connection.authorizeIndex({ method: 'GET', url: ctx.connection.authenticatedUrl(origin), headers: { host } }, {
      writeHead(code, values) { status = code; cookie = values?.['set-cookie']?.split(';', 1)[0] }, end() {},
    })
    assert.equal(authorized, false); assert.equal(status, 303); assert.equal(typeof cookie, 'string')
    return cookie
  }
  const cookie = mintCookie(); await delay(3); const otherCookie = mintCookie()
  assert.ok(cookie !== otherCookie, 'fixture logins must not share the same credential')
  const transport = implementation.registerSplitApprovalTransport(ctx)
  const target = transport.bind(parent, consent, { headers: headers(cookie) })
  const exchange = (body, extra = {}, options = {}) => new Promise((resolve, reject) => {
    const bytes = options.raw ?? JSON.stringify(body)
    const req = httpRequest(`${origin}${path}`, { method: options.method ?? 'POST',
      headers: { ...headers(cookie), 'content-type': 'application/json', 'x-dsh-split-request': '1', ...extra } }, res => {
      const chunks = []; let size = 0
      res.on('data', chunk => { size += chunk.length; if (size > 128000) req.destroy(new Error('fixture response too large')); else chunks.push(chunk) })
      res.on('end', () => { const raw = Buffer.concat(chunks).toString('utf8'); let value; try { value = JSON.parse(raw) } catch { value = undefined }; resolve({ status: res.statusCode, value, headers: res.headers }) })
    })
    req.setTimeout(5000, () => req.destroy(new Error('fixture HTTP timeout')))
    req.on('error', reject); req.end(bytes)
  })
  const statusRequest = { ...target, action: 'status' }
  const status = async () => { const response = await exchange(statusRequest); assert.equal(response.status, 200); return response.value }
  try {
    assert.equal((await status()).view.phase, 'ready')
    if (scenario === 'transport-binding') {
      assert.throws(() => transport.bind(parent, { ...consent }, { headers: headers(cookie) }), /SPLIT_BINDING_REFUSED/u)
      assert.throws(() => transport.bind(parent, consent, { headers: headers(cookie) }), /SPLIT_BINDING_REFUSED/u)
    }
    parent.followup(llm.createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'PARENT_ONLY_FIXTURE: run the approved inspection.' }] }))
    await waitFor(() => consent.getSnapshot().phase === 'awaiting-approval')
    let view = await status()
    assert.equal(childWires.length, 0)
    const mutation = (action, operationId = 'fixture-operation') => ({ ...target, action, operationId, reviewDigest: view.view.reviewDigest,
      expectedRevision: view.revision, ...(action === 'decide' ? { choice: 'allow-once' } : {}) })
    if (scenario === 'transport-auth') {
      for (const extra of [{ cookie: '' }, { cookie: 'invalid-cookie=value' }]) assert.equal((await exchange(statusRequest, extra)).status, 401)
      for (const extra of [{ origin: 'https://foreign.invalid' }, { host: 'foreign.invalid' }, { 'x-dsh-split-request': '' }]) assert.equal((await exchange(statusRequest, extra)).status, 403)
      assert.equal((await exchange(statusRequest, { cookie: `${cookie}; ${cookie}` })).status, 403)
      assert.equal((await exchange(statusRequest, { cookie: `unrelated=one; ${cookie}` })).status, 200)
    }
    if (scenario === 'transport-cross-session') {
      for (const action of ['status', 'decide', 'revoke']) {
        const body = action === 'status' ? statusRequest : mutation(action)
        assert.equal((await exchange(body, { cookie: otherCookie })).status, 404)
        assert.equal((await exchange({ ...body, sessionId: 'other-parent' })).status, 404)
        assert.equal((await exchange({ ...body, offerId: 'other-offer' })).status, 404)
      }
    }
    if (scenario === 'transport-epoch') assert.equal((await exchange({ ...mutation('decide'), epoch: 'old-process' })).status, 404)
    if (scenario === 'transport-stale-revision') assert.equal((await exchange({ ...mutation('decide'), expectedRevision: view.revision - 1 })).status, 409)
    if (scenario === 'transport-body') {
      assert.equal((await exchange(statusRequest, {}, { method: 'GET' })).status, 405)
      assert.equal((await exchange(statusRequest, { 'content-type': 'text/plain' })).status, 415)
      assert.equal((await exchange({ ...statusRequest, userId: 'claimed-admin' })).status, 400)
      assert.equal((await exchange(statusRequest, {}, { raw: '{' })).status, 400)
      assert.equal((await exchange({ ...statusRequest, padding: 'x'.repeat(5000) })).status, 413)
    }
    if (scenario === 'transport-owner-disposed') {
      await parentHandle.dispose()
      assert.equal((await exchange(mutation('decide'))).status, 404)
      assert.equal((await exchange(statusRequest)).status, 404)
      assert.equal(childWires.length, 0)
      return
    }
    assert.equal(childWires.length, 0, 'negative requests must never create a child')
    if (interaction) {
      await interaction({ ctx, origin, cookie, target, status })
      await parent.whenIdle()
      assert.equal(consent.getSnapshot().phase, 'completed')
      assert.equal(childWires.length, 2)
      return
    }
    const body = { ...mutation('decide'), choice: scenario === 'transport-reject' ? 'reject' : 'allow-once' }
    const response = await exchange(body)
    assert.equal(response.status, 200)
    assert.equal(response.value.decision.state, 'accepted')
    if (scenario === 'transport-replay' || scenario === 'transport-lost-response') {
      // Discarding the first application reply must be recoverable by a read, not another approval.
      assert.equal((await status()).decision.operationId, body.operationId)
      assert.equal((await exchange(body)).status, 200)
      assert.equal((await exchange({ ...body, choice: 'reject' })).status, 409)
      assert.equal((await exchange({ ...body, operationId: 'different-operation' })).status, 409)
    }
    if (scenario === 'transport-revoke') {
      await waitFor(() => childWires.length === 1)
      view = await status()
      const revocation = mutation('revoke', 'fixture-revoke')
      const stopped = await exchange(revocation)
      assert.equal(stopped.status, 200)
      assert.equal(stopped.value.view.phase, 'revoking')
      assert.equal(stopped.value.revocation.state, 'pending')
      assert.ok(ctx.agents.get(children[0].id), 'HTTP acknowledgement is not cleanup')
      assert.equal((await exchange(revocation)).status, 200)
      await parent.whenIdle()
      const final = await status()
      assert.equal(final.view.phase, 'revoked'); assert.equal(final.revocation.state, 'accepted')
      assert.equal(childWires.length, 1)
    } else {
      await parent.whenIdle()
      assert.equal(consent.getSnapshot().phase, scenario === 'transport-reject' ? 'rejected' : 'completed')
      assert.equal(childWires.length, scenario === 'transport-reject' ? 0 : 2)
    }
    const final = await exchange(statusRequest)
    assert.equal(final.headers['cache-control'], 'no-store')
    assert.ok(!JSON.stringify(final.value).includes(cookie), 'no authentication material in response')
  } finally { await transport.dispose() }
}
