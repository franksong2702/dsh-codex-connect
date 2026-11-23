import { Context } from '@deepseek-ai/cordis'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { afterEach, vi } from 'vitest'

export interface CapturedHttpRoute {
  kind: 'exact' | 'prefix'
  path: string
  handler(req: IncomingMessage, res: ServerResponse, admitted?: unknown): Promise<void> | void
}

export const rejectedHttpAdmissions = [
  { admission: 'unauthenticated', status: 401, error: 'DSH_BROWSER_AUTH_REQUIRED' },
  { admission: 'forbidden', status: 403, error: 'forbidden' },
  { admission: 'missing', status: 503, error: 'DSH_CONNECTION_UNAVAILABLE' },
  { admission: 'throws', status: 503, error: 'DSH_CONNECTION_UNAVAILABLE' },
] as const

export type TestHttpAdmission = 'allow' | typeof rejectedHttpAdmissions[number]['admission']

const contexts: Context[] = []
afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
})

/** Real Cordis effects with an explicit Connection admission and no listening socket. */
export function httpRouteTestContext(options: {
  admission?: TestHttpAdmission
  failRegistrationAt?: number
  sessions?: unknown
} = {}) {
  const ctx = new Context()
  contexts.push(ctx)
  const routes = new Map<string, CapturedHttpRoute>()
  const disposedPaths: string[] = []
  let registrationAttempts = 0
  const webServer = {
    register(route: CapturedHttpRoute) {
      registrationAttempts++
      if (registrationAttempts === options.failRegistrationAt) throw new Error('synthetic HTTP route registration failure')
      const key = `${route.kind}:${route.path}`
      if (routes.has(key)) throw new Error(`duplicate HTTP route: ${key}`)
      routes.set(key, route)
      return () => {
        if (routes.get(key) !== route) return
        routes.delete(key)
        disposedPaths.push(route.path)
      }
    },
  }
  ctx.provide('webServer', webServer as unknown as Context['webServer'])
  const admit = vi.fn((_request: IncomingMessage): { peer: {} } | { rejection: 401 | 403 } => {
    switch (options.admission ?? 'allow') {
      case 'unauthenticated': return { rejection: 401 }
      case 'forbidden': return { rejection: 403 }
      case 'throws': throw new Error('synthetic Connection admission failure')
      default: return { peer: {} }
    }
  })
  if (options.admission !== 'missing') {
    ctx.provide('connection', { admit } as unknown as Context['connection'])
  }
  if (options.sessions !== undefined) ctx.provide('sessions', options.sessions as Context['sessions'])
  return { ctx, routes, disposedPaths, webServer, admit }
}
