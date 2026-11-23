/** Host-owned authentication for plugin HTTP routes; origin trust is an additional restriction. */
import type { IncomingMessage } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-connection'

export interface HarnessHttpRejection {
  status: 401 | 403 | 503
  error: 'DSH_BROWSER_AUTH_REQUIRED' | 'forbidden' | 'DSH_CONNECTION_UNAVAILABLE'
}

/**
 * Decide whether one plugin HTTP route call may proceed.
 *
 * DSH 0.2.3-alpha.2 owns route admission: a handler route defaults to `auth: 'required'`, the Web
 * carrier admits the request before dispatch, and the admitted Peer arrives as the handler's third
 * argument. The route is therefore already authenticated, and calling `connection.admit` again
 * fails: Connection resolves its `connection.authentication` sub-service through the calling
 * context, which cordis 4.2 refuses without an `inject` declaration that hosts before 0.2.3 do not
 * provide ("cannot get property \"connection.authentication\" without inject").
 *
 * A host that passes no Peer keeps the legacy in-route admission over the raw `IncomingMessage`;
 * every other outcome fails closed.
 */
export function harnessHttpRejection(
  ctx: Context,
  request: IncomingMessage,
  admitted?: unknown,
): HarnessHttpRejection | undefined {
  if (admitted !== undefined) return undefined
  try {
    const connection = ctx.get('connection')
    if (connection !== undefined) {
      // Hosts before 0.2.3 authenticate inside the route; `admit` stays their compatible surface.
      const admission = connection.admit(request)
      if ('peer' in admission) return undefined
      if (admission.rejection === 401) return { status: 401, error: 'DSH_BROWSER_AUTH_REQUIRED' }
      if (admission.rejection === 403) return { status: 403, error: 'forbidden' }
    }
  } catch {
    // Inactive dependencies and authentication failures must not become an unauthenticated fallback.
  }
  return { status: 503, error: 'DSH_CONNECTION_UNAVAILABLE' }
}
