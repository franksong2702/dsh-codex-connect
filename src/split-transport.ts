/** Internal HTTP bridge over DSH's real browser authentication. Not mounted by the public plugin. */
import { createHmac, randomBytes, randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import { symbols } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { ConnectionTrustRequest } from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { ownsSplitApproval } from './split-approval.ts'
import type { SplitApprovalHandle } from './split-approval.ts'
import { SPLIT_APPROVAL_PATH } from './split-transport-contract.ts'
import type { SplitApprovalTarget, SplitOperationReceipt, SplitTransportSnapshot } from './split-transport-contract.ts'

class RequestFailure extends Error { constructor(readonly status: number) { super('SPLIT_REQUEST_REFUSED') } }
function reject(status: number): never { throw new RequestFailure(status) }
const text = (value: unknown, max: number): value is string => typeof value === 'string' && value.length > 0 && value.length <= max && !/[\x00-\x1f\x7f]/u.test(value)
interface Receipt { operationId: string; state: SplitOperationReceipt['state']; fingerprint: string }
interface Binding {
  target: SplitApprovalTarget; parent: Agent; approval: SplitApprovalHandle; owner: string; revision: number
  decision?: Receipt; revocation?: Receipt; unsubscribe(): void
}
export interface SplitApprovalTransport {
  /** Only a trusted host interaction may bind an already-created offer to its authenticated browser. Not a wire endpoint. */
  bind(parent: Agent, approval: SplitApprovalHandle, ownerRequest: ConnectionTrustRequest): SplitApprovalTarget
  release(target: SplitApprovalTarget): Promise<void>
  dispose(): Promise<void>
}
function headersOf(request: ConnectionTrustRequest): Headers {
  if (request.headers instanceof Headers) return new Headers(request.headers)
  const headers = new Headers()
  for (const [name, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) { if (value.length !== 1) reject(403); headers.set(name, value[0]!) }
    else if (typeof value === 'string') headers.set(name, value)
  }
  return headers
}
function reply(res: ServerResponse, status: number, value: unknown): void {
  if (res.destroyed || res.writableEnded) return
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff',
    ...status >= 400 ? { connection: 'close' } : {} })
  res.end(JSON.stringify(value))
}
async function bodyOf(req: IncomingMessage): Promise<Record<string, unknown>> {
  if (req.headers['content-type']?.split(';', 1)[0]?.trim() !== 'application/json'
    || req.headers['content-encoding'] !== undefined) reject(415)
  const chunks: Buffer[] = []; let size = 0
  const timer = setTimeout(() => req.destroy(), 5000)
  try {
    // Keep the socket alive long enough to send a bounded rejection; ordinary for-await
    // destroys IncomingMessage on early return and would erase the 413 response.
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

/**
 * Reuse public requestRejection, including Host/Origin and signed-cookie checks. No cookie
 * decoding, signing, login, OAuth access or client-supplied user identity. The matching
 * authenticated cookie is fingerprinted with a process-local salt and never retained/logged.
 * Credential-equivalent browser tabs are one principal; this is not a multi-user ACL.
 */
export function registerSplitApprovalTransport(ctx: Context): SplitApprovalTransport {
  const connection = ctx.get('connection')
  if (!connection || !ctx.get('webServer')) throw new Error('SPLIT_CONNECTION_UNAVAILABLE')
  // Cordis returns a caller-scoped proxy per read; compare the underlying service identity only.
  const identity = (value: object): object => Reflect.get(value, symbols.original) ?? value
  const connectionIdentity = identity(connection)
  const epoch = randomUUID(); const salt = randomBytes(32)
  const bindings = new Map<string, Binding>()
  let closed = false; let disposal: Promise<void> | undefined
  const ownerOf = (request: ConnectionTrustRequest): string => {
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
    // Ask the existing verifier which individual credential authenticates this request.
    // Unrelated cookies do not change ownership; ambiguous accepted credentials fail closed.
    const accepted = candidates.filter(value => {
      const candidate = new Headers(headers); candidate.set('cookie', value)
      return connection.requestRejection({ headers: candidate }) === undefined
    })
    if (accepted.length !== 1) reject(403)
    return createHmac('sha256', salt).update(host.toLowerCase()).update('\0').update(accepted[0]!).digest('hex')
  }
  const snapshot = (binding: Binding): SplitTransportSnapshot => ({
    version: 1, ...binding.target, revision: binding.revision, view: binding.approval.getSnapshot(),
    ...binding.decision ? { decision: { operationId: binding.decision.operationId, state: binding.decision.state } } : {},
    ...binding.revocation ? { revocation: { operationId: binding.revocation.operationId, state: binding.revocation.state } } : {},
  })
  const unregister = ctx.webServer.register({ kind: 'exact', path: SPLIT_APPROVAL_PATH, async handler(req, res) {
    try {
      const owner = ownerOf(req)
      if (req.method !== 'POST' || req.url !== SPLIT_APPROVAL_PATH) reject(405)
      if (req.headers['x-dsh-split-request'] !== '1') reject(403)
      const body = await bodyOf(req)
      // Revalidate after the only pre-admission await: expiry and host replacement must win.
      if (req.aborted || res.destroyed || ownerOf(req) !== owner) reject(403)
      if (!text(body.sessionId, 256) || !text(body.offerId, 80) || body.epoch !== epoch) reject(404)
      const binding = bindings.get(body.sessionId)
      if (!binding || binding.owner !== owner || binding.target.offerId !== body.offerId
        || ctx.agents.get(binding.parent.id) !== binding.parent) reject(404)
      const allowedKeys = body.action === 'status' ? ['action', 'epoch', 'sessionId', 'offerId']
        : ['action', 'epoch', 'sessionId', 'offerId', 'reviewDigest', 'expectedRevision', 'operationId', ...(body.action === 'decide' ? ['choice'] : [])]
      if (Object.keys(body).some(key => !allowedKeys.includes(key))) reject(400)
      if (body.action === 'status') { reply(res, 200, snapshot(binding)); return }
      if ((body.action !== 'decide' && body.action !== 'revoke') || !text(body.operationId, 80)
        || body.reviewDigest !== binding.approval.getSnapshot().reviewDigest || !Number.isSafeInteger(body.expectedRevision)
        || Number(body.expectedRevision) < 0 || (body.action === 'decide' && body.choice !== 'allow-once' && body.choice !== 'reject')) reject(409)
      const key = body.action === 'decide' ? 'decision' : 'revocation'
      const fingerprint = JSON.stringify([body.operationId, body.reviewDigest, body.expectedRevision, body.choice ?? null])
      const existing = binding[key]
      if (existing) {
        if (existing.fingerprint !== fingerprint) reject(409)
        reply(res, 200, snapshot(binding)); return
      }
      if (body.action === 'decide' && (binding.revision !== body.expectedRevision || binding.revocation)) reject(409)
      const receipt: Receipt = { operationId: body.operationId, fingerprint, state: 'pending' }
      // Reserve before any synchronous observer can re-enter. Never infer mutation rollback from socket loss.
      binding[key] = receipt; binding.revision += 1
      if (body.action === 'decide') {
        let accepted = false
        try { accepted = binding.approval.decide(binding.target.offerId, String(body.reviewDigest), body.choice as 'allow-once' | 'reject') }
        catch { receipt.state = 'failed' }
        if (receipt.state !== 'failed') receipt.state = accepted ? 'accepted' : 'rejected'
        binding.revision += 1
      } else {
        // Revocation may progress after this HTTP response; status acknowledges actual cleanup.
        void binding.approval.revoke().then(() => { receipt.state = 'accepted'; binding.revision += 1 }, () => { receipt.state = 'failed'; binding.revision += 1 })
      }
      reply(res, 200, snapshot(binding))
    } catch (error) { reply(res, error instanceof RequestFailure ? error.status : 400, { error: 'SPLIT_REQUEST_REFUSED' }) }
  } })
  const transport: SplitApprovalTransport = {
    bind(parent, approval, ownerRequest) {
      const owner = ownerOf(ownerRequest)
      if (!ownsSplitApproval(approval, parent) || ctx.agents.get(parent.id) !== parent
        || bindings.has(parent.id) || bindings.size >= 32) throw new Error('SPLIT_BINDING_REFUSED')
      const target = Object.freeze({ epoch, sessionId: String(parent.id), offerId: approval.getSnapshot().id })
      const binding: Binding = { target, parent, approval, owner, revision: 0, unsubscribe: () => undefined }
      binding.unsubscribe = approval.subscribe(() => { binding.revision += 1 })
      bindings.set(target.sessionId, binding)
      return target
    },
    async release(target) {
      const binding = bindings.get(target.sessionId)
      if (!binding || binding.target !== target) return
      bindings.delete(target.sessionId); binding.unsubscribe()
      await binding.approval.revoke()
    },
    dispose() {
      if (disposal) return disposal
      closed = true; unregister()
      const owned = [...bindings.values()]; bindings.clear()
      for (const binding of owned) binding.unsubscribe()
      disposal = Promise.allSettled(owned.map(binding => binding.approval.revoke())).then(results => {
        salt.fill(0)
        if (results.some(result => result.status === 'rejected')) throw new Error('SPLIT_TRANSPORT_DISPOSAL_FAILED')
      })
      return disposal
    },
  }
  ctx.effect(() => () => transport.dispose(), 'split: authenticated browser approval transport')
  return transport
}
