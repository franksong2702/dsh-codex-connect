import type { Context } from '@deepseek-ai/cordis'
import type { IncomingMessage } from 'node:http'
import { describe, expect, it, vi } from 'vitest'
import { harnessHttpRejection } from '../src/http-auth.ts'

const request = { headers: { host: '127.0.0.1:3081' } } as IncomingMessage
function context(get: (name: string) => unknown): Context {
  return { get } as unknown as Context
}

describe('Harness admission for protected plugin HTTP routes', () => {
  it('requires the current Connection to admit the original request', () => {
    const requestRejection = vi.fn(() => undefined)
    const get = vi.fn(() => ({ requestRejection }))
    expect(harnessHttpRejection(context(get), request)).toBeUndefined()
    expect(get).toHaveBeenCalledWith('connection')
    expect(requestRejection).toHaveBeenCalledExactlyOnceWith(request)
  })

  it.each([401, 403] as const)('preserves a Host rejection %s', status => {
    const requestRejection = vi.fn(() => status)
    expect(harnessHttpRejection(context(() => ({ requestRejection })), request)).toEqual({
      status, error: status === 401 ? 'DSH_BROWSER_AUTH_REQUIRED' : 'forbidden',
    })
  })

  it('asks the new WebServer verifier to authenticate within the Host scope', () => {
    const webServer = {}
    const admit = vi.fn()
    const bail = vi.fn(() => ({ kind: 'allow', peer: { signal: new AbortController().signal } }))
    const ctx = { get: () => ({ admit }), webServer, bail } as unknown as Context
    const incoming = { ...request, method: 'GET', url: '/plugins/test?check=1', socket: {} } as IncomingMessage
    expect(harnessHttpRejection(ctx, incoming)).toBeUndefined()
    expect(admit).not.toHaveBeenCalled()
    expect(bail).toHaveBeenCalledExactlyOnceWith(webServer, 'webserver/authorize', {
      headers: incoming.headers, method: 'GET', socket: incoming.socket,
      url: new URL('http://dsh.invalid/plugins/test?check=1'), transport: 'http',
    }, 'required')
  })

  it.each([
    [{ kind: 'deny', status: 401 }, 401, 'DSH_BROWSER_AUTH_REQUIRED'],
    [{ kind: 'deny', status: 403 }, 403, 'forbidden'],
    [{ kind: 'deny', status: 503 }, 503, 'DSH_CONNECTION_UNAVAILABLE'],
    [{ kind: 'deny', peer: {} }, 503, 'DSH_CONNECTION_UNAVAILABLE'],
    [{ kind: 'allow' }, 503, 'DSH_CONNECTION_UNAVAILABLE'],
    [{ kind: 'allow', peer: {} }, 503, 'DSH_CONNECTION_UNAVAILABLE'],
    [{ kind: 'allow', peer: { signal: AbortSignal.abort() } }, 401, 'DSH_BROWSER_AUTH_REQUIRED'],
    [undefined, 503, 'DSH_CONNECTION_UNAVAILABLE'],
  ] as const)('requires authenticated WebServer admission %j', (result, status, error) => {
    const ctx = { get: () => ({ admit() {} }), webServer: {}, bail: () => result } as unknown as Context
    expect(harnessHttpRejection(ctx, request)).toEqual({ status, error })
  })

  it.each(['missing', 'lookup-error', 'validation-error', 'invalid-result'] as const)(
    'fails closed without exposing private errors when Connection is %s', failure => {
      const privateError = new Error('fixture-private-cookie-must-not-leak')
      const ctx = context(() => {
        if (failure === 'lookup-error') throw privateError
        if (failure === 'missing') return undefined
        return { requestRejection() {
          if (failure === 'validation-error') throw privateError
          return 500
        } }
      })
      expect(harnessHttpRejection(ctx, request)).toEqual({ status: 503, error: 'DSH_CONNECTION_UNAVAILABLE' })
    },
  )

  it('does not retain a removed or replaced authentication service', () => {
    let connection: { requestRejection: () => 401 | undefined } | undefined = {
      requestRejection: () => undefined,
    }
    const ctx = context(() => connection)
    expect(harnessHttpRejection(ctx, request)).toBeUndefined()
    connection = undefined
    expect(harnessHttpRejection(ctx, request)?.status).toBe(503)
    connection = { requestRejection: () => 401 }
    expect(harnessHttpRejection(ctx, request)?.status).toBe(401)
  })
})
