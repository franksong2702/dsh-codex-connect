/** Internal HTTP bridge over DSH's real browser authentication. Not mounted by the public plugin. */
import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { ConnectionTrustRequest } from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { ownsSplitApproval } from './split-approval.ts'
import type { SplitApprovalHandle } from './split-approval.ts'
import { SPLIT_APPROVAL_PATH } from './split-transport-contract.ts'
import type { SplitApprovalTarget, SplitOperationReceipt, SplitTransportSnapshot } from './split-transport-contract.ts'
import { bodyOf, reject, reply, RequestFailure, splitRequestGuard, text } from './split-http.ts'

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

/**
 * Reuse public requestRejection, including Host/Origin and signed-cookie checks. No cookie
 * decoding, signing, login, OAuth access or client-supplied user identity. The matching
 * authenticated cookie is fingerprinted with a process-local salt and never retained/logged.
 * Credential-equivalent browser tabs are one principal; this is not a multi-user ACL.
 */
export function registerSplitApprovalTransport(ctx: Context): SplitApprovalTransport {
  const guard = splitRequestGuard(ctx)
  const { ownerOf } = guard
  const epoch = randomUUID()
  const bindings = new Map<string, Binding>()
  let disposal: Promise<void> | undefined
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
      guard.dispose(); unregister()
      const owned = [...bindings.values()]; bindings.clear()
      for (const binding of owned) binding.unsubscribe()
      disposal = Promise.allSettled(owned.map(binding => binding.approval.revoke())).then(results => {
        if (results.some(result => result.status === 'rejected')) throw new Error('SPLIT_TRANSPORT_DISPOSAL_FAILED')
      })
      return disposal
    },
  }
  ctx.effect(() => () => transport.dispose(), 'split: authenticated browser approval transport')
  return transport
}
