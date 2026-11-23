/** Same-origin update metadata route for the Codex Connect browser client. */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type { OpenAICodexTrustedOriginsStore } from './trusted-origins.ts'
import { evaluateCompatibility, PI_AI_PACKAGE } from './compatibility.ts'
import { trustedRequestDecision } from './auth-routes.ts'
import { harnessHttpRejection } from './http-auth.ts'
import { isInstallationAnchor, readDshInstallationMetadata, readInstalledPluginVersion, readPluginDependencyVersion } from './installation-metadata.ts'
import { openAICodexPluginVersionState, parseOpenAICodexRuntimeReport } from './runtime-identity.ts'
import type { OpenAICodexRuntimeReport } from './runtime-identity.ts'
import { CODEX_CONNECT_VERSION } from './version.ts'
import {
  checkForOpenAICodexUpdate,
  OPENAI_CODEX_UPDATE_TIMEOUT_MS,
} from './update.ts'
import type { OpenAICodexUpdateResult } from './update.ts'
import { OPENAI_CODEX_RUNTIME_PATH, OPENAI_CODEX_UPDATE_PATH } from './update-paths.ts'

export { OPENAI_CODEX_RUNTIME_PATH, OPENAI_CODEX_UPDATE_PATH } from './update-paths.ts'

interface UpdateRouteOptions {
  currentVersion: string
  /** Isolated metadata seam; never supplied by a request or a browser URL. */
  resolveRuntimeReport?: () => Promise<OpenAICodexRuntimeReport>
  fetchImpl?: (input: string, init?: RequestInit) => Promise<Response>
  timeoutMs?: number
}

function hostInstallAnchor(ctx: Context): string | undefined {
  try {
    // Public app-boot ProfileContext fact, optional on custom Cordis compositions.
    // Keep the dependency structural: no app-boot runtime import or mandatory inject.
    const profile: unknown = (ctx as unknown as { get(name: 'profileContext'): unknown }).get('profileContext')
    if (typeof profile !== 'object' || profile === null) return undefined
    const anchor = (profile as { readonly installAnchor?: unknown }).installAnchor
    return isInstallationAnchor(anchor) ? anchor : undefined
  } catch {
    return undefined
  }
}

function unknownHostRuntimeReport(): OpenAICodexRuntimeReport {
  return {
    schemaVersion: 1,
    identity: {
      scope: 'host',
      loadedPluginVersion: CODEX_CONNECT_VERSION,
      installedPluginVersion: null,
      pluginVersionState: 'unknown',
      dshMetadataSource: 'unknown',
    },
    compatibility: evaluateCompatibility({ nodeVersion: process.version }),
  }
}

async function detectHostRuntimeReport(ctx: Context): Promise<OpenAICodexRuntimeReport> {
  const anchor = hostInstallAnchor(ctx)
  const [installation, installedPluginVersion, piAiVersion] = await Promise.all([
    anchor === undefined ? undefined : readDshInstallationMetadata(anchor),
    readInstalledPluginVersion(),
    readPluginDependencyVersion(PI_AI_PACKAGE),
  ])
  const compatibility = evaluateCompatibility({
    nodeVersion: process.version,
    packageVersions: { ...installation?.packageVersions, [PI_AI_PACKAGE]: piAiVersion },
  })
  if (installation !== undefined && installation.currentDshVersion === undefined
    && (compatibility.status === 'compatible' || compatibility.status === 'unverified-in-range')) {
    compatibility.status = 'unverified'
  }
  return {
    schemaVersion: 1,
    identity: {
      scope: 'host',
      loadedPluginVersion: CODEX_CONNECT_VERSION,
      installedPluginVersion: installedPluginVersion ?? null,
      pluginVersionState: openAICodexPluginVersionState(CODEX_CONNECT_VERSION, installedPluginVersion ?? null),
      dshMetadataSource: installation === undefined ? 'unknown' : 'host-install-anchor',
    },
    ...installation?.currentDshVersion === undefined ? {} : { currentDshVersion: installation.currentDshVersion },
    compatibility,
  }
}

function json(res: ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  })
  res.end(JSON.stringify(value))
}

/** Register authenticated Host metadata and public updates without opening OAuth credentials. */
export function registerOpenAICodexUpdateRoutes(
  ctx: Context,
  options: UpdateRouteOptions,
  trustedOrigins: OpenAICodexTrustedOriginsStore,
): void {
  ctx.effect(function* () {
    yield ctx.webServer.register({
      kind: 'exact',
      path: OPENAI_CODEX_RUNTIME_PATH,
      handler: async (req: IncomingMessage, res: ServerResponse, admitted?: unknown) => {
        if (req.method !== 'GET') return json(res, 405, { error: 'method not allowed' })
        const rejected = harnessHttpRejection(ctx, req, admitted)
        if (rejected !== undefined) return json(res, rejected.status, { error: rejected.error })
        const decision = await trustedRequestDecision(req, trustedOrigins)
        if (!decision.trusted) return json(res, 403, { error: decision.error })
        let report: OpenAICodexRuntimeReport
        try {
          report = parseOpenAICodexRuntimeReport(await (options.resolveRuntimeReport ?? (() => detectHostRuntimeReport(ctx)))())
            ?? unknownHostRuntimeReport()
        } catch {
          report = unknownHostRuntimeReport()
        }
        return json(res, 200, report)
      },
    })
    yield ctx.webServer.register({
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
  }, 'dsh-codex-connect: update route')
}
