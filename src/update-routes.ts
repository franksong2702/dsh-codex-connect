/** Same-origin update metadata route for the Codex Connect browser client. */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type { OpenAICodexTrustedOriginsStore } from './trusted-origins.ts'
import { trustedRequestDecision } from './auth-routes.ts'
import {
  checkForOpenAICodexUpdate,
  OPENAI_CODEX_UPDATE_TIMEOUT_MS,
} from './update.ts'
import type { OpenAICodexUpdateResult } from './update.ts'
import { OPENAI_CODEX_UPDATE_PATH } from './update-paths.ts'

export { OPENAI_CODEX_UPDATE_PATH } from './update-paths.ts'

interface UpdateRouteOptions {
  currentVersion: string
  fetchImpl?: (input: string, init?: RequestInit) => Promise<Response>
  timeoutMs?: number
}

function json(res: ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  })
  res.end(JSON.stringify(value))
}

/** Register the public-version route without crossing the OAuth credential boundary. */
export function registerOpenAICodexUpdateRoutes(
  ctx: Context,
  options: UpdateRouteOptions,
  trustedOrigins: OpenAICodexTrustedOriginsStore,
): void {
  ctx.effect(() => {
    const dispose = ctx.webServer.register({
      kind: 'exact',
      path: OPENAI_CODEX_UPDATE_PATH,
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        if (req.method !== 'GET') return json(res, 405, { error: 'method not allowed' })
        const decision = await trustedRequestDecision(req, trustedOrigins)
        if (!decision.trusted) return json(res, 403, { error: decision.error })
        let result: OpenAICodexUpdateResult
        try {
          result = await checkForOpenAICodexUpdate({
            currentVersion: options.currentVersion,
            ...options.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl },
            timeoutMs: options.timeoutMs ?? OPENAI_CODEX_UPDATE_TIMEOUT_MS,
          })
        } catch {
          result = {
            status: 'unavailable',
            currentVersion: options.currentVersion,
            reason: 'registry-unavailable',
          }
        }
        return json(res, 200, result)
      },
    })
    return dispose
  }, 'dsh-codex-connect: update route')
}
