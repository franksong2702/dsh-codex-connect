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

  it('accepts the live owner admitted by WebServer without calling the verifier again', () => {
    const admit = vi.fn(() => ({ rejection: 401 }))
    const bail = vi.fn()
    const ctx = { get: () => ({ admit }), bail } as unknown as Context
    const peer = { signal: new AbortController().signal, principal: { kind: 'owner' } }
    expect(harnessHttpRejection(ctx, request, peer)).toBeUndefined()
    expect(admit).not.toHaveBeenCalled()
    expect(bail).not.toHaveBeenCalled()
  })

  it.each([
    [undefined, 503, 'DSH_CONNECTION_UNAVAILABLE'],
    [{ signal: new AbortController().signal }, 503, 'DSH_CONNECTION_UNAVAILABLE'],
    [{ signal: new AbortController().signal, principal: {} }, 503, 'DSH_CONNECTION_UNAVAILABLE'],
    [{ signal: { aborted: false }, principal: { kind: 'owner' } }, 503, 'DSH_CONNECTION_UNAVAILABLE'],
    [{ signal: AbortSignal.abort(), principal: { kind: 'owner' } }, 401, 'DSH_BROWSER_AUTH_REQUIRED'],
    [{ signal: new AbortController().signal, principal: { kind: 'guest' } }, 403, 'forbidden'],
  ] as const)('requires a live WebServer owner peer %j', (peer, status, error) => {
    const ctx = context(() => ({ admit() {} }))
    expect(harnessHttpRejection(ctx, request, peer)).toEqual({ status, error })
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
