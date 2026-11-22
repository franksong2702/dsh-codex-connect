import assert from 'node:assert/strict'
import { request } from 'node:http'
import { issueInstalledBrowserCookie } from './installed-browser-auth.mjs'

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
  const [{ Context }, { default: Llm }, { WebServer }] = await Promise.all([
    '@deepseek-ai/cordis', '@deepseek-ai/dsh-llm',
    '@deepseek-ai/dsh-host-webserver',
  ].map(importHost))
  const ctx = new Context()
  try {
    await ctx.plugin(Llm)
    await ctx.plugin(WebServer, { host: '127.0.0.1', port: 0 })
    const origin = `http://127.0.0.1:${ctx.webServer.port}`
    const { cookie, webServerAuthorizes } = await issueInstalledBrowserCookie(ctx, importHost, origin, get)
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
        if (webServerAuthorizes && (status === 401 || status === 403)) {
          // New WebServer rejects unauthenticated requests before the packed route runs.
          assert.equal(response.text, status === 401 ? 'unauthorized' : 'forbidden')
        } else {
          assert.match(response.headers['content-type'], /application\/json/u)
          assert.deepEqual(JSON.parse(response.text), { error })
        }
      }
      await plugin.dispose()
      assert.equal((await get(url, { cookie })).status, 404)
    }
    return { syntheticOnly: true, reloadCycles: 2, authenticationVerified: true, disposalVerified: true }
  } finally {
    await ctx.fiber.dispose()
  }
}
