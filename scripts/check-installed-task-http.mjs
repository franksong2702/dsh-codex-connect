import assert from 'node:assert/strict'
import { request } from 'node:http'

const TASK_PATH = '/plugins/dsh-codex-connect/task?sessionId=installed-task-fixture'

function get(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = request(url, { headers, timeout: 5000 }, res => {
      let text = ''
      res.setEncoding('utf8')
      res.on('data', chunk => {
        text += chunk
        if (text.length > 8192) req.destroy(new Error('Task fixture response exceeded bound'))
      })
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text }))
    })
    req.on('timeout', () => req.destroy(new Error('Task fixture request timed out')))
    req.on('error', reject)
    req.end()
  })
}

/** Verify packed route teardown using this exact host's WebServer and signed synthetic cookies. */
export async function checkInstalledTaskHttp(importHost, CodexConnect) {
  const [{ Context }, { default: Llm }, { WebServer }, Connection] = await Promise.all([
    '@deepseek-ai/cordis', '@deepseek-ai/dsh-llm',
    '@deepseek-ai/dsh-host-webserver', '@deepseek-ai/dsh-client-connection',
  ].map(importHost))
  const ctx = new Context()
  const records = new Map()
  try {
    ctx.provide('credentials', { async modifyRecord(key, mutate) {
      const next = await mutate(records.get(key))
      if (next !== undefined) records.set(key, next)
      return records.get(key)
    } })
    await ctx.plugin(Llm)
    await ctx.plugin(WebServer, { host: '127.0.0.1', port: 0 })
    await ctx.plugin(Connection)
    ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: '/', handler(req, res) {
      if (ctx.connection.authorizeIndex(req, res)) { res.writeHead(200); res.end('Synthetic task fixture') }
    } }))
    const origin = `http://127.0.0.1:${ctx.webServer.port}`
    const issued = await get(ctx.connection.authenticatedUrl(origin))
    assert.equal(issued.status, 303)
    const cookie = issued.headers['set-cookie'][0].split(';')[0]
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
        assert.equal(response.status, status)
        assert.match(response.headers['content-type'], /application\/json/u)
        assert.deepEqual(JSON.parse(response.text), { error })
      }
      await plugin.dispose()
      assert.equal((await get(url, { cookie })).status, 404)
    }
    return { syntheticOnly: true, reloadCycles: 2, authenticationVerified: true, disposalVerified: true }
  } finally {
    await ctx.fiber.dispose()
  }
}
