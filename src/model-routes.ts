/** Same-origin route exposing the complete Codex model catalog. */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type { OpenAICodexTrustedOriginsStore } from './trusted-origins.ts'
import type { OpenAICodexModelCatalogEntry } from './model-contract.ts'
import { OPENAI_CODEX_MODEL_CATALOG_PATH } from './model-contract.ts'
import { trustedRequestDecision } from './auth-routes.ts'

function json(res: ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  })
  res.end(JSON.stringify(value))
}

/** Register the read-only catalog route consumed by Plugin configuration. */
export function registerOpenAICodexModelCatalogRoute(
  ctx: Context,
  resolveCatalog: () => readonly OpenAICodexModelCatalogEntry[],
  trustedOrigins: OpenAICodexTrustedOriginsStore,
): void {
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: OPENAI_CODEX_MODEL_CATALOG_PATH,
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      if (req.method !== 'GET') return json(res, 405, { error: 'method not allowed' })
      const decision = await trustedRequestDecision(req, trustedOrigins)
      if (!decision.trusted) return json(res, 403, { error: decision.error })
      return json(res, 200, resolveCatalog())
    },
  }), 'dsh-codex-connect: model catalog route')
}
