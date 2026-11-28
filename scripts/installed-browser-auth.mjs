import assert from 'node:assert/strict'
import { request } from 'node:http'

/** Read a bounded response from the fixture's loopback WebServer. */
export function getInstalledBrowserResponse(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = request(url, { headers, timeout: 5000 }, res => {
      const chunks = []
      let bytes = 0
      res.on('data', chunk => {
        bytes += chunk.length
        if (bytes > 1_000_000) req.destroy(new Error('installed browser fixture response exceeded bound'))
        else chunks.push(chunk)
      })
      res.on('error', reject)
      res.on('end', () => {
        const body = Buffer.concat(chunks)
        resolve({ status: res.statusCode, headers: res.headers, body, text: body.toString('utf8') })
      })
    })
    req.on('timeout', () => req.destroy(new Error('installed browser fixture request timed out')))
    req.on('error', reject)
    req.end()
  })
}

/** Exchange a stock Host entry URL for a signed cookie using only in-memory test credentials. */
export async function issueInstalledBrowserCookie(ctx, importHost, origin) {
  const records = new Map()
  ctx.provide('credentials', { async modifyRecord(key, mutate) {
    const next = await mutate(records.get(key))
    if (next !== undefined) records.set(key, next)
    return records.get(key)
  } })
  await ctx.plugin(await importHost('@deepseek-ai/dsh-client-connection'))

  const connection = ctx.connection
  const legacy = typeof connection.authenticatedUrl === 'function' && typeof connection.authorizeIndex === 'function'
  let entry
  if (legacy) {
    entry = connection.authenticatedUrl(origin)
    ctx.effect(() => ctx.webServer.register({
      kind: 'exact', path: '/', handler(request, response) {
        assert.equal(connection.authorizeIndex(request, response), false)
      },
    }))
  } else {
    assert.equal(typeof connection.admit, 'function', 'installed Connection must expose browser admission')
    await ctx.plugin(await importHost('@deepseek-ai/dsh-host-authentication-token'), { cookieMaxAgeDays: 1 })
    const entries = []
    ctx.emit(ctx.webServer, 'webserver/entry-url', origin, entries)
    assert.equal(entries.length, 1, 'installed token provider must contribute one browser entry')
    entry = entries[0].url
  }

  const url = new URL(entry)
  assert.ok(url.origin === origin && url.pathname === '/', 'browser entry must stay at the test origin')
  const issued = await getInstalledBrowserResponse(url)
  assert.equal(issued.status, 303, 'installed Host must exchange the entry for a redirect')
  const setCookie = issued.headers?.['set-cookie']
  const firstCookie = Array.isArray(setCookie) ? setCookie[0] : setCookie
  assert.ok(typeof firstCookie === 'string' && firstCookie.includes('='), 'installed Host must issue a browser cookie')
  return { cookie: firstCookie.split(';', 1)[0], webServerAuthorizes: !legacy }
}
