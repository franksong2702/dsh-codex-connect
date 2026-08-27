/** Same-origin Detect/Test routes for the explicit Codex proxy workflow. */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { trustedRequestDecision } from './auth-routes.ts'
import type { OpenAICodexTrustedOriginsStore } from './trusted-origins.ts'
import { detectOpenAICodexProxyEnvironment } from './proxy-env.ts'
import {
  OPENAI_CODEX_CONNECTIVITY_PATH,
  OPENAI_CODEX_PROXY_DETECT_PATH,
  OPENAI_CODEX_PROXY_TEST_PATH,
} from './proxy-paths.ts'
import { isValidOpenAICodexProxyUrl } from './settings-contract.ts'
import { checkOpenAICodexConnectivity, testOpenAICodexProxy } from './provider-proxy.ts'
import type { OpenAICodexConnectivityReport, OpenAICodexProxyRunner, OpenAICodexProxyTestResult } from './provider-proxy.ts'

export { OPENAI_CODEX_CONNECTIVITY_PATH, OPENAI_CODEX_PROXY_DETECT_PATH, OPENAI_CODEX_PROXY_TEST_PATH } from './proxy-paths.ts'

const BODY_LIMIT = 4_096
const CONNECTIVITY_CACHE_MS = 2_500

export interface OpenAICodexProxyRouteOptions {
  environment?: Readonly<Record<string, string | undefined>>
  testProxy?: (proxyUrl: string) => Promise<OpenAICodexProxyTestResult>
  proxy?: OpenAICodexProxyRunner
  checkConnectivity?: () => Promise<OpenAICodexConnectivityReport>
}

function json(res: ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  })
  res.end(JSON.stringify(value))
}

function header(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name]
  return Array.isArray(value) ? value[0] : value
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const declared = header(req, 'content-length')
  if (declared !== undefined && (!/^\d+$/u.test(declared.trim()) || Number(declared) > BODY_LIMIT)) {
    throw new RangeError('request body too large')
  }
  const chunks: Buffer[] = []
  let total = 0
  const iterable = req as unknown as AsyncIterable<Uint8Array | string>
  if (typeof (req as unknown as { [Symbol.asyncIterator]?: unknown })[Symbol.asyncIterator] === 'function') {
    for await (const chunk of iterable) {
      const bytes = Buffer.from(chunk)
      total += bytes.byteLength
      if (total > BODY_LIMIT) throw new RangeError('request body too large')
      chunks.push(bytes)
    }
  } else {
    const body = (req as IncomingMessage & { body?: unknown }).body
    if (typeof body !== 'string' && !(body instanceof Uint8Array)) throw new TypeError('invalid body')
    const bytes = Buffer.from(body)
    if (bytes.byteLength > BODY_LIMIT) throw new RangeError('request body too large')
    chunks.push(bytes)
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))) as unknown
  } catch {
    throw new TypeError('invalid body')
  }
}

function proxyUrlBody(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  if (Object.keys(record).length !== 1 || typeof record['proxyUrl'] !== 'string') return undefined
  const proxyUrl = record['proxyUrl'].trim()
  return isValidOpenAICodexProxyUrl(proxyUrl) ? proxyUrl : undefined
}

/** Register read-only Detect and draft-only Test routes. Activation uses SettingsScope. */
export function registerOpenAICodexProxyRoutes(
  ctx: Context,
  trustedOrigins: OpenAICodexTrustedOriginsStore,
  options: OpenAICodexProxyRouteOptions = {},
): void {
  const environment = options.environment ?? process.env
  const testProxy = options.testProxy ?? testOpenAICodexProxy
  const checkConnectivity = options.checkConnectivity ?? (() => checkOpenAICodexConnectivity(options.proxy))
  ctx.effect(() => {
    let cachedConnectivity: { proxyUrl: string | undefined; report: OpenAICodexConnectivityReport } | undefined
    let connectivityInFlight: { proxyUrl: string | undefined; promise: Promise<OpenAICodexConnectivityReport> } | undefined
    const connectivity = (): Promise<OpenAICodexConnectivityReport> => {
      const proxyUrl = options.proxy?.activeUrl
      if (cachedConnectivity !== undefined && cachedConnectivity.proxyUrl === proxyUrl
        && Date.now() - cachedConnectivity.report.checkedAt < CONNECTIVITY_CACHE_MS) {
        return Promise.resolve(cachedConnectivity.report)
      }
      if (connectivityInFlight !== undefined && connectivityInFlight.proxyUrl === proxyUrl) {
        return connectivityInFlight.promise
      }
      const promise = checkConnectivity()
        .then(report => {
          cachedConnectivity = { proxyUrl, report }
          return report
        })
        .finally(() => {
          if (connectivityInFlight?.promise === promise) connectivityInFlight = undefined
        })
      connectivityInFlight = { proxyUrl, promise }
      return promise
    }
    const authorize = async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
      const decision = await trustedRequestDecision(req, trustedOrigins)
      if (decision.trusted) return true
      json(res, 403, { error: decision.error })
      return false
    }
    const routes = [
      ctx.webServer.register({
        kind: 'exact',
        path: OPENAI_CODEX_CONNECTIVITY_PATH,
        handler: async (req, res) => {
          if (req.method !== 'GET') return json(res, 405, { error: 'method not allowed' })
          if (!await authorize(req, res)) return
          try {
            json(res, 200, await connectivity())
          } catch {
            json(res, 503, { error: 'connectivity check failed' })
          }
        },
      }),
      ctx.webServer.register({
        kind: 'exact',
        path: OPENAI_CODEX_PROXY_DETECT_PATH,
        handler: async (req, res) => {
          if (req.method !== 'GET') return json(res, 405, { error: 'method not allowed' })
          if (!await authorize(req, res)) return
          json(res, 200, detectOpenAICodexProxyEnvironment(environment))
        },
      }),
      ctx.webServer.register({
        kind: 'exact',
        path: OPENAI_CODEX_PROXY_TEST_PATH,
        handler: async (req, res) => {
          if (req.method !== 'POST') return json(res, 405, { error: 'method not allowed' })
          if (!await authorize(req, res)) return
          const type = header(req, 'content-type')
          if (type === undefined || !/^application\/json(?:\s*;|$)/iu.test(type.trim())) {
            return json(res, 415, { error: 'unsupported content type' })
          }
          try {
            const proxyUrl = proxyUrlBody(await readJson(req))
            if (proxyUrl === undefined) return json(res, 400, { error: 'invalid proxy URL' })
            json(res, 200, await testProxy(proxyUrl))
          } catch (error: unknown) {
            json(res, error instanceof RangeError ? 413 : 400, {
              error: error instanceof RangeError ? 'request body too large' : 'invalid input',
            })
          }
        },
      }),
    ]
    return () => { for (const dispose of routes) dispose() }
  }, 'dsh-codex-connect: proxy Detect/Test routes')
}
