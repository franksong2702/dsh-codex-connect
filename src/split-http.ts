/** Shared internal HTTP admission. Delegates authentication to the active DSH Connection. */
import { createHmac, randomBytes } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { symbols, type Context } from '@deepseek-ai/cordis'
import type { ConnectionTrustRequest } from '@deepseek-ai/dsh-client-connection'

export class RequestFailure extends Error { constructor(readonly status: number) { super('SPLIT_REQUEST_REFUSED') } }
export function reject(status: number): never { throw new RequestFailure(status) }
export const text = (value: unknown, max: number): value is string => typeof value === 'string' && value.length > 0 && value.length <= max && !/[\x00-\x1f\x7f]/u.test(value)
function headersOf(request: ConnectionTrustRequest): Headers {
  if (request.headers instanceof Headers) return new Headers(request.headers)
  const headers = new Headers()
  for (const [name, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) { if (value.length !== 1) reject(403); headers.set(name, value[0]!) }
    else if (typeof value === 'string') headers.set(name, value)
  }
  return headers
}
export function reply(res: ServerResponse, status: number, value: unknown): void {
  if (res.destroyed || res.writableEnded) return
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff',
    ...status >= 400 ? { connection: 'close' } : {} })
  res.end(JSON.stringify(value))
}
export async function bodyOf(req: IncomingMessage): Promise<Record<string, unknown>> {
  if (req.headers['content-type']?.split(';', 1)[0]?.trim() !== 'application/json'
    || req.headers['content-encoding'] !== undefined) reject(415)
  const chunks: Buffer[] = []; let size = 0
  const timer = setTimeout(() => req.destroy(), 5000)
  try {
    // Do not destroy the socket on early return: the caller still owes a bounded rejection.
    for await (const chunk of req.iterator({ destroyOnReturn: false })) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      size += bytes.length
      if (size > 4096) reject(413)
      chunks.push(bytes)
    }
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (typeof value !== 'object' || value === null || Array.isArray(value)) reject(400)
    return value as Record<string, unknown>
  } finally { clearTimeout(timer) }
}
/** Credential-equivalent tabs share a principal. No independent user ACL is inferred. */
export function splitRequestGuard(ctx: Context): { ownerOf(request: ConnectionTrustRequest): string; dispose(): void } {
  const connection = ctx.get('connection')
  if (!connection || !ctx.get('webServer')) throw new Error('SPLIT_CONNECTION_UNAVAILABLE')
  const identity = (value: object): object => Reflect.get(value, symbols.original) ?? value
  const connectionIdentity = identity(connection)
  const salt = randomBytes(32)
  let closed = false
  return {
    ownerOf(request) {
      const activeConnection = ctx.get('connection')
      if (closed || !activeConnection || identity(activeConnection) !== connectionIdentity) reject(503)
      const status = connection.requestRejection(request)
      if (status !== undefined) reject(status)
      const headers = headersOf(request)
      const cookie = headers.get('cookie'); const host = headers.get('host')
      if (!cookie || !host || cookie.length > 8192) reject(403)
      const candidates = cookie.split(';').map(value => value.trim()).filter(Boolean)
      if (candidates.length > 32) reject(403)
      const names = candidates.map(value => value.slice(0, value.indexOf('=')))
      if (names.some(name => !name) || new Set(names).size !== names.length) reject(403)
      // Ask DSH which individual cookie authenticates, without decoding or retaining it.
      const accepted = candidates.filter(value => {
        const candidate = new Headers(headers); candidate.set('cookie', value)
        return connection.requestRejection({ headers: candidate }) === undefined
      })
      if (accepted.length !== 1) reject(403)
      return createHmac('sha256', salt).update(host.toLowerCase()).update('\0').update(accepted[0]!).digest('hex')
    },
    dispose() { closed = true; salt.fill(0) },
  }
}
