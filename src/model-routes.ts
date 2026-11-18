/** Same-origin route exposing the complete Codex model catalog. */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type { OpenAICodexTrustedOriginsStore } from './trusted-origins.ts'
import type { OpenAICodexModelCatalogEntry } from './model-contract.ts'
import { OPENAI_CODEX_LIMIT_REMINDER_HEADER, OPENAI_CODEX_MODEL_CATALOG_PATH } from './model-contract.ts'
import { trustedRequestDecision } from './auth-routes.ts'

function json(res: ServerResponse, status: number, value: unknown, extraHeaders?: Record<string, string>): void {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    ...extraHeaders,
  })
  res.end(JSON.stringify(value))
}

/** Register the read-only catalog route consumed by Plugin configuration. */
export function registerOpenAICodexModelCatalogRoute(
  ctx: Context,
  resolveCatalog: () => readonly OpenAICodexModelCatalogEntry[] | Promise<readonly OpenAICodexModelCatalogEntry[]>,
  trustedOrigins: OpenAICodexTrustedOriginsStore,
  resolveAvailable?: () => boolean | Promise<boolean>,
): void {
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: OPENAI_CODEX_MODEL_CATALOG_PATH,
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      if (req.method !== 'GET') return json(res, 405, { error: 'method not allowed' })
      const decision = await trustedRequestDecision(req, trustedOrigins)
      if (!decision.trusted) return json(res, 403, { error: decision.error })
      const available = resolveAvailable === undefined ? false : await resolveAvailable()
      return json(res, 200, await resolveCatalog(), available ? { [OPENAI_CODEX_LIMIT_REMINDER_HEADER]: 'available' } : undefined)
    },
  }), 'dsh-codex-connect: model catalog route')
}
