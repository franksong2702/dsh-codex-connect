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
    const admit = vi.fn(() => ({ peer: {} }))
    const get = vi.fn(() => ({ admit }))
    expect(harnessHttpRejection(context(get), request)).toBeUndefined()
    expect(get).toHaveBeenCalledWith('connection')
    expect(admit).toHaveBeenCalledExactlyOnceWith(request)
  })

  it.each([401, 403] as const)('preserves a Host rejection %s', status => {
    const admit = vi.fn(() => ({ rejection: status }))
    expect(harnessHttpRejection(context(() => ({ admit })), request)).toEqual({
      status, error: status === 401 ? 'DSH_BROWSER_AUTH_REQUIRED' : 'forbidden',
    })
  })

  it.each(['missing', 'lookup-error', 'validation-error', 'invalid-result', 'rejection-503'] as const)(
    'fails closed without exposing private errors when Connection is %s', failure => {
      const privateError = new Error('fixture-private-cookie-must-not-leak')
      const ctx = context(() => {
        if (failure === 'lookup-error') throw privateError
        if (failure === 'missing') return undefined
        return { admit() {
          if (failure === 'validation-error') throw privateError
          if (failure === 'rejection-503') return { rejection: 503 }
          return 500
        } }
      })
      expect(harnessHttpRejection(ctx, request)).toEqual({ status: 503, error: 'DSH_CONNECTION_UNAVAILABLE' })
    },
  )

  it('trusts the Host route admission that already produced a Peer', () => {
    const get = vi.fn(() => {
      throw new Error('an admitted request must not read Connection again')
    })
    expect(harnessHttpRejection(context(get), request, { id: 'admitted-peer' })).toBeUndefined()
    expect(get).not.toHaveBeenCalled()
  })

  it('does not retain a removed or replaced authentication service', () => {
    let connection: { admit: () => { peer: {} } | { rejection: 401 } } | undefined = {
      admit: () => ({ peer: {} }),
    }
    const ctx = context(() => connection)
    expect(harnessHttpRejection(ctx, request)).toBeUndefined()
    connection = undefined
    expect(harnessHttpRejection(ctx, request)?.status).toBe(503)
    connection = { admit: () => ({ rejection: 401 }) }
    expect(harnessHttpRejection(ctx, request)?.status).toBe(401)
  })
})
