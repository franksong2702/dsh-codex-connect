import assert from 'node:assert/strict'
import { getInstalledBrowserResponse as get, issueInstalledBrowserCookie } from './installed-browser-auth.mjs'

const TASK_PATH = '/plugins/dsh-codex-connect/task?sessionId=installed-task-fixture'
const UPDATE_PATH = '/openai-codex/update'
const RUNTIME_PATH = '/openai-codex/runtime'
const MODELS_PATH = '/plugins/dsh-codex-connect/models'
const DIST_TAGS_URL = 'https://registry.npmjs.org/-/package/dsh-codex-connect/dist-tags'

async function checkHostPeerAdmission(ctx, origin) {
  const owner = ctx.connection.createPeer({ principal: { kind: 'owner' } })
  const guest = ctx.connection.createPeer({ principal: { kind: 'fixture-guest' } })
  let ownerCalls = 0
  let guestCalls = 0
  const dispose = ctx.get('connection.authentication').register({
    authenticate(request) {
      if (request.headers['x-fixture-peer'] === 'owner') {
        ownerCalls++
        return ownerCalls === 1 ? owner : undefined
      }
      if (request.headers['x-fixture-peer'] === 'guest') {
        guestCalls++
        return guest
      }
      return undefined
    },
  })
  try {
    const accepted = await get(origin + RUNTIME_PATH, { 'x-fixture-peer': 'owner' })
    assert.equal(accepted.status, 200, 'an owner admitted by a single-use verifier may read runtime metadata')
    assert.equal(JSON.parse(accepted.text).schemaVersion, 1)
    assert.equal(ownerCalls, 1, 'the protected route must use the Host admission once')
    const denied = await get(origin + RUNTIME_PATH, { 'x-fixture-peer': 'guest' })
    assert.equal(denied.status, 403, 'an authenticated non-owner must not read protected metadata')
    assert.deepEqual(JSON.parse(denied.text), { error: 'forbidden' })
    assert.equal(guestCalls, 1)
  } finally {
    await dispose()
    await owner.dispose()
    await guest.dispose()
  }
}

/** Verify the installed routes using the exact Host WebServer and synthetic authentication. */
export async function checkInstalledTaskHttp(importHost, CodexConnect) {
  const [{ Context }, { default: Llm }, { WebServer }] = await Promise.all([
    '@deepseek-ai/cordis', '@deepseek-ai/dsh-llm',
    '@deepseek-ai/dsh-host-webserver',
  ].map(importHost))
  const ctx = new Context()
  const previousFetch = globalThis.fetch
  let updateReads = 0
  globalThis.fetch = async url => {
    assert.equal(url, DIST_TAGS_URL, 'fixture must only resolve synthetic npm metadata')
    updateReads++
    return Response.json({ latest: '0.0.0' })
  }
  try {
    await ctx.plugin(Llm)
    await ctx.plugin(WebServer, { host: '127.0.0.1', port: 0 })
    const origin = `http://127.0.0.1:${ctx.webServer.port}`
    const { cookie, webServerAuthorizes } = await issueInstalledBrowserCookie(ctx, importHost, origin)
    const url = origin + TASK_PATH
    for (let cycle = 0; cycle < 2; cycle++) {
      const plugin = await ctx.plugin(CodexConnect, {})
      for (const [headers, status, error] of [
        [{}, 401, 'TASK_BROWSER_AUTH_REQUIRED'],
        [{ cookie: cookie + 'tampered' }, 401, 'TASK_BROWSER_AUTH_REQUIRED'],
        [{ cookie, 'sec-fetch-site': 'cross-site' }, 403, 'TASK_BROWSER_AUTH_REQUIRED'],
        [{ cookie }, 409, 'TASK_LIVE_ROOT_REQUIRED'],
      ]) {
        const response = await get(url, headers)
        assert.equal(response.status, status, 'stock browser cookie must admit only the valid same-site request')
        if (webServerAuthorizes && (status === 401 || status === 403)) {
          assert.equal(response.text, status === 401 ? 'unauthorized' : 'forbidden')
        } else {
          assert.match(response.headers['content-type'], /application\/json/u)
          assert.deepEqual(JSON.parse(response.text), { error })
        }
      }
      assert.equal((await get(origin + RUNTIME_PATH)).status, 401)
      const models = await get(origin + MODELS_PATH)
      assert.equal(models.status, 200)
      assert.ok(JSON.parse(models.text).length > 0)
      const update = await get(origin + UPDATE_PATH)
      assert.equal(update.status, 200)
      assert.equal(JSON.parse(update.text).status, 'up-to-date')
      const untrusted = { origin: 'https://untrusted.invalid', 'sec-fetch-site': 'cross-site' }
      assert.equal((await get(origin + MODELS_PATH, untrusted)).status, 403)
      assert.equal((await get(origin + UPDATE_PATH, untrusted)).status, 403)
      if (webServerAuthorizes && cycle === 0) await checkHostPeerAdmission(ctx, origin)
      await plugin.dispose()
      assert.equal((await get(url, { cookie })).status, 404)
    }
    assert.equal(updateReads, 2, 'origin-denied update requests must not reach the registry')
    return {
      syntheticOnly: true, reloadCycles: 2, authenticationVerified: true, disposalVerified: true, publicRoutesChecked: true,
      ...(webServerAuthorizes ? { oneTimeVerifierVerified: true, nonOwnerRejected: true } : {}),
    }
  } finally {
    globalThis.fetch = previousFetch
    await ctx.fiber.dispose()
  }
}
