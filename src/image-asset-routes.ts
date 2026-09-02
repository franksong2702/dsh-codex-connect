/** Same-origin download route for exact GPT Image output bytes. */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { Session } from '@deepseek-ai/dsh-session'
import type { OpenAICodexTrustedOriginsStore } from './trusted-origins.ts'
import { trustedRequestDecision } from './auth-routes.ts'
import { OPENAI_CODEX_IMAGE_ASSET_ID_PATTERN, OPENAI_CODEX_ORIGINAL_IMAGE_PATH } from './image-assets-contract.ts'
import type { OpenAICodexImageAssetStore } from './image-assets.ts'
import type { OpenAICodexOriginalImageRef } from './image-assets-contract.ts'
import { decodeImagePresentationMeta } from './image-presentation.ts'

/** Fork access follows copied result events, not every asset owned by an ancestor. */
function inheritedOriginal(session: Session | undefined, assetId: string): OpenAICodexOriginalImageRef | undefined {
  if (session?.header.parentSession === undefined) return undefined
  for (const event of session.snapshotEvents()) {
    if (event.seq >= session.inheritedEventCount) break
    if (event.type !== 'tool/result') continue
    const meta = decodeImagePresentationMeta(event.data.meta)
    const original = meta?.images.find(image => image.original?.assetId === assetId)?.original
    if (original !== undefined) return original
  }
  return undefined
}

function json(res: ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  })
  res.end(JSON.stringify(value))
}

function query(req: IncomingMessage): { sessionId: string; assetId: string } | undefined {
  if (typeof req.url !== 'string') return undefined
  try {
    const parsed = new URL(req.url, 'http://dsh.invalid')
    const sessionIds = parsed.searchParams.getAll('sessionId')
    const assetIds = parsed.searchParams.getAll('assetId')
    const sessionId = sessionIds[0]
    const assetId = assetIds[0]
    if (sessionIds.length !== 1 || assetIds.length !== 1
      || sessionId === undefined || sessionId.length < 1 || sessionId.length > 512
      || assetId === undefined || !OPENAI_CODEX_IMAGE_ASSET_ID_PATTERN.test(assetId)) return undefined
    return { sessionId, assetId }
  } catch {
    return undefined
  }
}

/** Register a history-safe route even while new image generation is disabled. */
export function registerOpenAICodexOriginalImageRoute(
  ctx: Context,
  trustedOrigins: OpenAICodexTrustedOriginsStore,
  assets: OpenAICodexImageAssetStore,
): void {
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: OPENAI_CODEX_ORIGINAL_IMAGE_PATH,
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      if (req.method !== 'GET') return json(res, 405, { error: 'method not allowed' })
      const decision = await trustedRequestDecision(req, trustedOrigins)
      if (!decision.trusted) return json(res, 403, { error: decision.error })
      const requested = query(req)
      if (requested === undefined) return json(res, 400, { error: 'invalid input' })
      const session = ctx.get('sessions')?.get(SessionId(requested.sessionId))
      const stored = await assets.read(requested.sessionId, requested.assetId, inheritedOriginal(session, requested.assetId))
      if (stored === undefined) return json(res, 404, { error: 'original image not found' })
      res.writeHead(200, {
        'content-type': stored.ref.mediaType,
        'content-length': String(stored.ref.bytes),
        'content-disposition': `attachment; filename="${stored.ref.name}"`,
        'cache-control': 'private, no-store',
        'x-content-type-options': 'nosniff',
      })
      res.end(Buffer.from(stored.data))
    },
  }), 'dsh-codex-connect: original image download route')
}
