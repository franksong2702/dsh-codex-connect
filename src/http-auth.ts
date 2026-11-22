/** Host-owned authentication for plugin HTTP routes; origin trust is an additional restriction. */
import type { IncomingMessage } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-connection'

export interface HarnessHttpRejection {
  status: 401 | 403 | 503
  error: 'DSH_BROWSER_AUTH_REQUIRED' | 'forbidden' | 'DSH_CONNECTION_UNAVAILABLE'
}

/** The new WebServer defaults to required authentication; older hosts ignore this field. */
export const ANONYMOUS_WEB_ROUTE = { auth: 'anonymous' } as const

function ownerPeerRejection(peer: unknown): 401 | 403 | 503 | undefined {
  if (typeof peer !== 'object' || peer === null || !('signal' in peer) || !(peer.signal instanceof AbortSignal)
    || !('principal' in peer) || typeof peer.principal !== 'object' || peer.principal === null
    || !('kind' in peer.principal) || typeof peer.principal.kind !== 'string') return 503
  if (peer.signal.aborted) return 401
  return peer.principal.kind === 'owner' ? undefined : 403
}

/** Use the WebServer's admitted owner Peer or the legacy Connection verifier. */
export function harnessHttpRejection(ctx: Context, request: IncomingMessage, peer?: unknown): HarnessHttpRejection | undefined {
  try {
    const connection = ctx.get('connection')
    if (connection !== undefined) {
      let rejected: unknown = 503
      if (typeof connection.requestRejection === 'function') {
        rejected = connection.requestRejection(request)
      } else if ('admit' in connection && typeof connection.admit === 'function') {
        rejected = ownerPeerRejection(peer)
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
