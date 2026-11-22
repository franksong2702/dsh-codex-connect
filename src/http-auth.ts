/** Host-owned authentication for plugin HTTP routes; origin trust is an additional restriction. */
import type { IncomingMessage } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-connection'

export interface HarnessHttpRejection {
  status: 401 | 403 | 503
  error: 'DSH_BROWSER_AUTH_REQUIRED' | 'forbidden' | 'DSH_CONNECTION_UNAVAILABLE'
}

type WebAdmissionRequest = Pick<IncomingMessage, 'headers' | 'method' | 'socket'> & {
  url: URL
  transport: 'http'
}

declare module '@deepseek-ai/cordis' {
  interface Events {
    'webserver/authorize'(request: WebAdmissionRequest, policy: 'required'): unknown
  }
}

/** Resolve the current Connection on each request; never retain a stale authentication service. */
export function harnessHttpRejection(ctx: Context, request: IncomingMessage): HarnessHttpRejection | undefined {
  try {
    const connection = ctx.get('connection')
    if (connection !== undefined) {
      let rejected: unknown = 503
      if (typeof connection.requestRejection === 'function') {
        rejected = connection.requestRejection(request)
      } else if ('admit' in connection && typeof connection.admit === 'function') {
        // Let the Host verifier resolve its authentication service in its own scope.
        const admission = ctx.bail(ctx.webServer, 'webserver/authorize', {
          headers: request.headers,
          method: request.method,
          socket: request.socket,
          url: new URL(request.url ?? '/', 'http://dsh.invalid'),
          transport: 'http',
        }, 'required')
        if (typeof admission === 'object' && admission !== null && 'kind' in admission) {
          if (admission.kind === 'deny' && 'status' in admission) rejected = admission.status ?? 503
          if (admission.kind === 'allow' && 'peer' in admission && typeof admission.peer === 'object'
            && admission.peer !== null && 'signal' in admission.peer && admission.peer.signal instanceof AbortSignal) {
            rejected = admission.peer.signal.aborted ? 401 : undefined
          }
        }
      }
      if (rejected === undefined) return undefined
      if (rejected === 401 || rejected === 403) {
        return { status: rejected, error: rejected === 401 ? 'DSH_BROWSER_AUTH_REQUIRED' : 'forbidden' }
      }
    }
  } catch {
    // Inactive dependencies and authentication failures must not become an unauthenticated fallback.
  }
  return { status: 503, error: 'DSH_CONNECTION_UNAVAILABLE' }
}
