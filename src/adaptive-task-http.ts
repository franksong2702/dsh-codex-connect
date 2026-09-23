/** Authenticated task controls. Browser identity authorizes controls; model tool output never does. */
import { createHash } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { ADAPTIVE_TASK_PATH, decodeTaskCommand, validTaskSessionId } from './adaptive-task-contract.ts'
import { AdaptiveTaskError, taskFailure, taskIdentity } from './adaptive-task-store.ts'
import type { AdaptiveTaskCommand, AdaptiveTaskState } from './adaptive-task-contract.ts'
import { ADAPTIVE_TASK_RELEASE_PAUSED, publicTaskCommandAllowed, publicTaskState } from './adaptive-task-publication.ts'

const BODY_LIMIT = 8192
function reply(res: ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store',
    'x-content-type-options': 'nosniff' })
  res.end(JSON.stringify(value))
}
/** Connection already verifies this authority-bound cookie. Hash only its exact credential, never unrelated cookies. */
export function adaptiveBrowserPrincipal(req: IncomingMessage): string {
  // Match Connection's canonical signed audience (case/default-port normalization).
  const rawHost = req.headers.host
  let authority: string | undefined
  try { authority = typeof rawHost === 'string' ? new URL(`http://${rawHost}`).host : undefined } catch { /* rejected below */ }
  const cookie = req.headers.cookie
  if (typeof authority !== 'string' || typeof cookie !== 'string') taskFailure('TASK_BROWSER_AUTH_REQUIRED')
  const name = 'dsh-auth-' + createHash('sha256').update(authority).digest('base64url')
  const values = cookie.split(';').map(item => item.trim()).filter(item => item.startsWith(name + '='))
  if (values.length !== 1 || values[0]!.length > 2048) taskFailure('TASK_BROWSER_AUTH_REQUIRED')
  return taskIdentity(authority + '\n' + values[0])
}
async function readCommand(req: IncomingMessage): Promise<unknown> {
  if (req.headers['content-type']?.split(';')[0]?.trim().toLowerCase() !== 'application/json') taskFailure('TASK_JSON_REQUIRED')
  const declared = req.headers['content-length']
  if (declared !== undefined && (!/^\d+$/u.test(declared) || Number(declared) > BODY_LIMIT)) taskFailure('TASK_BODY_TOO_LARGE')
  const chunks: Buffer[] = []
  let count = 0
  const timer = setTimeout(() => req.destroy(new Error('Task request body timeout')), 15_000)
  try {
    for await (const part of req) {
      const bytes = Buffer.isBuffer(part) ? part : Buffer.from(part as string)
      count += bytes.length
      if (count > BODY_LIMIT) taskFailure('TASK_BODY_TOO_LARGE')
      chunks.push(bytes)
    }
    if (declared !== undefined && Number(declared) !== count) taskFailure('TASK_BODY_INVALID')
    try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))) }
    catch { taskFailure('TASK_BODY_INVALID') }
  } finally { clearTimeout(timer) }
}
/** Missing host Connection leaves the feature unavailable; it never falls back to an unauthenticated route. */
export function registerAdaptiveTaskHttp(ctx: Context, runtime: {
  state(sessionId: string, principal: string): Promise<AdaptiveTaskState>
  command(command: AdaptiveTaskCommand, principal: string): Promise<AdaptiveTaskState>
}): void {
  ctx.webServer.register({ kind: 'exact', path: ADAPTIVE_TASK_PATH, async handler(req, res) {
    const rejected = ctx.connection.requestRejection(req)
    if (rejected !== undefined) { reply(res, rejected, { error: 'TASK_BROWSER_AUTH_REQUIRED' }); return }
    if (req.headers['sec-fetch-site'] === 'cross-site') { reply(res, 403, { error: 'TASK_BROWSER_AUTH_REQUIRED' }); return }
    try {
      const principal = adaptiveBrowserPrincipal(req)
      const url = new URL(req.url ?? '', 'http://localhost')
      if (req.method === 'GET') {
        const sessionId = url.searchParams.get('sessionId')
        if (!validTaskSessionId(sessionId) || [...url.searchParams.keys()].join(',') !== 'sessionId') taskFailure('TASK_SESSION_INVALID')
        reply(res, 200, publicTaskState(await runtime.state(sessionId, principal)))
      } else if (req.method === 'POST') {
        if (url.search !== '') taskFailure('TASK_COMMAND_INVALID')
        const command = decodeTaskCommand(await readCommand(req))
        if (command === undefined) taskFailure('TASK_COMMAND_INVALID')
        if (!publicTaskCommandAllowed(command.action)) taskFailure(ADAPTIVE_TASK_RELEASE_PAUSED)
        reply(res, 200, publicTaskState(await runtime.command(command, principal)))
      } else reply(res, 405, { error: 'TASK_METHOD_NOT_ALLOWED' })
    } catch (error: unknown) {
      const code = error instanceof AdaptiveTaskError ? error.code : 'TASK_OPERATION_FAILED'
      reply(res, code === 'TASK_OWNER_MISMATCH' || code === 'TASK_BROWSER_AUTH_REQUIRED' ? 403 : 409, { error: code })
    }
  } })
}
