import assert from 'node:assert/strict'

/** Exchange a stock Host entry URL for a signed cookie using only in-memory test credentials. */
export async function issueInstalledBrowserCookie(ctx, importHost, origin, send) {
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
  let exchange
  if (legacy) {
    entry = connection.authenticatedUrl(origin)
    exchange = (request, response) => {
      assert.equal(connection.authorizeIndex(request, response), false)
    }
    if (send !== undefined) {
      ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: '/', handler: exchange }))
    }
  } else {
    assert.equal(typeof connection.admit, 'function', 'installed Connection must expose browser admission')
    await ctx.plugin(await importHost('@deepseek-ai/dsh-host-authentication-token'), { cookieMaxAgeDays: 1 })
    const entries = []
    ctx.emit(ctx.webServer, 'webserver/entry-url', origin, entries)
    assert.equal(entries.length, 1, 'installed token provider must contribute one browser entry')
    entry = entries[0].url
    exchange = (request, response) => ctx.waterfall(ctx.webServer, 'webserver/request', request, response, () => {
      assert.fail('installed token provider did not handle the browser entry')
    })
  }

  const url = new URL(entry)
  assert.ok(url.origin === origin && url.pathname === '/', 'browser entry must stay at the test origin')
  let issued
  if (send !== undefined) {
    issued = await send(url)
  } else {
    issued = { writeHead(status, headers) { this.status = status; this.headers = headers }, end() {} }
    await exchange({ method: 'GET', url: url.pathname + url.search, headers: { host: url.host } }, issued)
  }
  assert.equal(issued.status, 303, 'installed Host must exchange the entry for a redirect')
  const setCookie = issued.headers?.['set-cookie']
  const firstCookie = Array.isArray(setCookie) ? setCookie[0] : setCookie
  assert.ok(typeof firstCookie === 'string' && firstCookie.includes('='), 'installed Host must issue a browser cookie')
  return { cookie: firstCookie.split(';', 1)[0], webServerAuthorizes: !legacy }
}
