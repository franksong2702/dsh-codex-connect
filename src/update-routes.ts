/** Same-origin update metadata route for the Codex Connect browser client. */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type { OpenAICodexTrustedOriginsStore } from './trusted-origins.ts'
import { detectCompatibility } from './compatibility.ts'
import { trustedRequestDecision } from './auth-routes.ts'
import {
  checkForOpenAICodexUpdate,
  OPENAI_CODEX_UPDATE_TIMEOUT_MS,
} from './update.ts'
import type { OpenAICodexUpdateResult } from './update.ts'
import { OPENAI_CODEX_RUNTIME_PATH, OPENAI_CODEX_UPDATE_PATH } from './update-paths.ts'

export { OPENAI_CODEX_RUNTIME_PATH, OPENAI_CODEX_UPDATE_PATH } from './update-paths.ts'

interface UpdateRouteOptions {
  currentVersion: string
  resolveCurrentDshVersion?: () => Promise<string | undefined>
  fetchImpl?: (input: string, init?: RequestInit) => Promise<Response>
  timeoutMs?: number
}

async function detectCurrentDshVersion(): Promise<string | undefined> {
  const report = await detectCompatibility()
  const llm = report.packages['@deepseek-ai/dsh-llm'].installed
  const adapter = report.packages['@deepseek-ai/dsh-llm-pi-ai'].installed
  return llm !== null && llm === adapter ? llm : undefined
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
    const disposeRuntime = ctx.webServer.register({
      kind: 'exact',
      path: OPENAI_CODEX_RUNTIME_PATH,
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        if (req.method !== 'GET') return json(res, 405, { error: 'method not allowed' })
        const decision = await trustedRequestDecision(req, trustedOrigins)
        if (!decision.trusted) return json(res, 403, { error: decision.error })
        try {
          const currentDshVersion = await (options.resolveCurrentDshVersion ?? detectCurrentDshVersion)()
          return json(res, 200, currentDshVersion === undefined ? {} : { currentDshVersion })
        } catch {
          return json(res, 200, {})
        }
      },
    })
    const disposeUpdate = ctx.webServer.register({
      kind: 'exact',
      path: OPENAI_CODEX_UPDATE_PATH,
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        if (req.method !== 'GET') return json(res, 405, { error: 'method not allowed' })
        const decision = await trustedRequestDecision(req, trustedOrigins)
        if (!decision.trusted) return json(res, 403, { error: decision.error })
        let result: OpenAICodexUpdateResult
        let currentDshVersion: string | undefined
        try {
          currentDshVersion = await (options.resolveCurrentDshVersion ?? detectCurrentDshVersion)()
        } catch {
          currentDshVersion = undefined
        }
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
        return json(res, 200, {
          ...result,
          ...currentDshVersion === undefined ? {} : { currentDshVersion },
        })
      },
    })
    return () => {
      disposeUpdate()
      disposeRuntime()
    }
  }, 'dsh-codex-connect: update route')
}
