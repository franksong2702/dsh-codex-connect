import { createServer } from 'node:http'
import { afterEach, expect, it, vi } from 'vitest'
import { captureNativePreflightAuthority, isCurrentNativePreflightAuthority, isNativePreflightResponse } from '../src/native-preflight.ts'

const INTERCEPT = Symbol.for('billion-context.native-fetch-intercept')
const CHAIN = Symbol.for('billion-context.native-fetch-chain')
const ACTIVE_STATE = Symbol.for('billion-context.native-intercept-state')
const origin = 'http://127.0.0.1:43123'
const input = 'https://chatgpt.com/backend-api/codex/responses'
afterEach(() => { vi.unstubAllGlobals() })

function install(value: unknown = origin) {
  const fetch = vi.fn()
  Object.defineProperty(fetch, CHAIN, { value: true, configurable: true })
  const state = { origin: value }
  vi.stubGlobal('fetch', fetch)
  vi.stubGlobal(INTERCEPT, true)
  vi.stubGlobal(ACTIVE_STATE, state)
  return { fetch, state }
}

function response(url = origin + '/bili/' + input, redirected = false) {
  const value = new Response('')
  Object.defineProperties(value, { url: { value: url }, redirected: { value: redirected } })
  return value
}

it.each([
  'http://example.com:43123', 'https://127.0.0.1:43123', 'http://localhost:43123', 'http://127.0.0.2:43123',
  'http://127.1:43123', 'http://2130706433:43123', 'http://127.0.0.1', 'http://127.0.0.1:0/path',
  'http://user:secret@127.0.0.1:43123', origin + '?x=1', origin + '#fragment', origin + '/bili/',
  'http://127.0.0.1:99999', undefined, null, {},
])('refuses native authority with an untrusted origin: %j', value => {
  // undefined is deliberately not install()'s default.
  const installed = install()
  installed.state.origin = value
  expect(captureNativePreflightAuthority()).toBeUndefined()
})

it.each(['http://127.0.0.1:43123', 'http://[::1]:43123', 'http://127.0.0.1:80/'])
  ('accepts only explicit-port numeric loopback HTTP origins: %s', value => {
    install(value)
    expect(captureNativePreflightAuthority()?.origin).toBe(new URL(value).origin)
  })

it.each(['flag', 'state', 'missing marker', 'false marker', 'inherited marker'])
  ('requires an installed native chain, not just response headers: %s', missing => {
    const { fetch } = install()
    if (missing === 'flag') vi.stubGlobal(INTERCEPT, false)
    if (missing === 'state') vi.stubGlobal(ACTIVE_STATE, undefined)
    if (missing.includes('marker')) {
      Reflect.deleteProperty(fetch, CHAIN)
      if (missing === 'false marker') Object.defineProperty(fetch, CHAIN, { value: false })
      if (missing === 'inherited marker') {
        const inherited = Object.create(Function.prototype)
        Object.defineProperty(inherited, CHAIN, { value: true })
        Object.setPrototypeOf(fetch, inherited)
      }
    }
    expect(captureNativePreflightAuthority()).toBeUndefined()
  })

it.each([
  input, '', 'http://127.0.0.1:43124/bili/' + input, origin + '/other/' + input,
  origin + '/bili/' + input + '?different=1', origin + '/bili/' + encodeURIComponent(input),
])('rejects upstream, synthetic or mismatched response URL metadata: %j', url => {
  install()
  expect(isNativePreflightResponse(captureNativePreflightAuthority(), response(url), input)).toBe(false)
})

it('compares the exact rewrite for string, URL and Request and refuses redirects', () => {
  install()
  const authority = captureNativePreflightAuthority()
  for (const value of [input, new URL(input), new Request(input)]) {
    expect(isNativePreflightResponse(authority, response(), value)).toBe(true)
    expect(isNativePreflightResponse(authority, response(undefined, true), value)).toBe(false)
  }
})

it.each(['state', 'origin', 'fetch', 'marker', 'flag'])('revokes captured authority on native lifetime change: %s', change => {
  const { state, fetch } = install()
  const authority = captureNativePreflightAuthority()!
  expect(isCurrentNativePreflightAuthority(authority)).toBe(true)
  if (change === 'state') vi.stubGlobal(ACTIVE_STATE, { origin })
  if (change === 'origin') state.origin = 'http://127.0.0.1:43124'
  if (change === 'fetch') vi.stubGlobal('fetch', vi.fn())
  if (change === 'marker') Reflect.deleteProperty(fetch, CHAIN)
  if (change === 'flag') vi.stubGlobal(INTERCEPT, false)
  expect(isCurrentNativePreflightAuthority(authority)).toBe(false)
  expect(isNativePreflightResponse(authority, response(), input)).toBe(false)
})

it('accepts real fetch Response.url metadata from an exact local native rewrite, not a redirect', async () => {
  const rawFetch = globalThis.fetch
  const server = createServer((request, result) => {
    if (request.url === '/redirect') { result.writeHead(302, { location: '/bili/' + input }); result.end(); return }
    result.writeHead(200, { 'content-type': 'text/event-stream', 'x-bili-preflight': 'compressing' })
    result.end(': bili-preflight\n\n')
  })
  await new Promise<void>(resolve => { server.listen(0, '127.0.0.1', resolve) })
  try {
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('Missing fixture address')
    const localOrigin = `http://127.0.0.1:${address.port}`
    install(localOrigin)
    const authority = captureNativePreflightAuthority()
    const direct = await rawFetch(localOrigin + '/bili/' + input)
    expect(direct.url).toBe(localOrigin + '/bili/' + input)
    expect(isNativePreflightResponse(authority, direct, input)).toBe(true)
    await direct.text()
    const redirected = await rawFetch(localOrigin + '/redirect')
    expect(redirected.url).toBe(direct.url)
    expect(redirected.redirected).toBe(true)
    expect(isNativePreflightResponse(authority, redirected, input)).toBe(false)
    await redirected.text()
  } finally {
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) => { server.close(error => { if (error) reject(error); else resolve() }) })
  }
})
