/** Explicit, process-local experiment admission through the real DSH Session Controller. */
import { randomUUID } from 'node:crypto'
import { isAbsolute } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import type { SessionRequestId } from '@deepseek-ai/dsh-api-session-controller/types'
import { SessionId } from '@deepseek-ai/dsh-session'
import { attachSplitApprovalRequest, type SplitApprovalHandle } from './split-approval.ts'
import { snapshotSplitEvidence } from './split-evidence.ts'
import { bodyOf, reject, reply, RequestFailure, splitRequestGuard, text } from './split-http.ts'
import { registerSplitApprovalTransport } from './split-transport.ts'
import type { SplitApprovalTarget } from './split-transport-contract.ts'

export const SPLIT_CONVERSATION_PATH = '/api/codex-connect/split-conversation'
export interface SplitConversationConfig {
  readonly enabled: boolean
  /** Trusted host configuration, never accepted from the browser or a model. */
  readonly root: string
  readonly workspaceLabel: string
  readonly sources: readonly { readonly path: string; readonly sha256: string }[]
  readonly providerName: string
  readonly maximumRequests?: number
  readonly timeoutMs?: number
}
interface Task {
  operationId: string; brief: string; state: 'pending' | 'ready' | 'failed'
  target?: SplitApprovalTarget; parent?: Agent; approval?: SplitApprovalHandle; pending?: Promise<void>
}

/**
 * One bounded offer per authenticated credential and process. Creation receipts survive socket
 * loss, not process restart. Status discovers only this credential's receipt; no session adoption.
 * The host owns the source manifest, provider and limits. Installing this explicitly is the opt-in.
 */
export function registerSplitConversation(ctx: Context, config: SplitConversationConfig): { dispose(): Promise<void> } {
  if (config.enabled !== true) throw new Error('SPLIT_EXPERIMENT_DISABLED')
  if (ctx.get('sessionPersistence') !== undefined) throw new Error('SPLIT_PERSISTENCE_UNSUPPORTED')
  if (!isAbsolute(config.root) || !text(config.workspaceLabel, 256)) throw new Error('SPLIT_CONFIGURATION_INVALID')
  const sessions = ctx.get('sessionController')
  if (!sessions) throw new Error('SPLIT_SESSION_CONTROLLER_UNAVAILABLE')
  const provider = ctx.subagents.getProvider(config.providerName)
  if (!provider) throw new Error('SPLIT_PROVIDER_UNSUPPORTED')
  const options = Object.freeze({ ...config, sources: Object.freeze(config.sources.map(source => Object.freeze({ ...source }))) })
  const guard = splitRequestGuard(ctx)
  const transport = registerSplitApprovalTransport(ctx)
  const epoch = randomUUID()
  const tasks = new Map<string, Task>()
  const reserved = new Map<string, Task>()
  const lifetime = new AbortController()
  let disposal: Promise<void> | undefined
  // Generic RPC can observe a newly published Session. It cannot race a request ahead of binding.
  const unguard = ctx.on('agent/request', async (event, next) => {
    const task = reserved.get(String(event.agent.id))
    if (task && (task.state !== 'ready' || lifetime.signal.aborted || ctx.get('sessionPersistence') !== undefined)) {
      throw new Error('SPLIT_CONVERSATION_NOT_ADMITTED')
    }
    return next()
  })
  const snapshot = (owner: string) => {
    const task = tasks.get(owner)
    return { version: 1, epoch, tasks: task ? [{ operationId: task.operationId, state: task.state,
      ...task.target ? { target: task.target } : {} }] : [] }
  }
  const unregister = ctx.webServer.register({ kind: 'exact', path: SPLIT_CONVERSATION_PATH, async handler(req, res) {
    try {
      const owner = guard.ownerOf(req)
      if (req.method !== 'POST' || req.url !== SPLIT_CONVERSATION_PATH) reject(405)
      if (req.headers['x-dsh-split-request'] !== '1') reject(403)
      const body = await bodyOf(req)
      if (req.aborted || res.destroyed || guard.ownerOf(req) !== owner) reject(403)
      if (body.action === 'status') {
        if (Object.keys(body).some(key => key !== 'action')) reject(400)
        reply(res, 200, snapshot(owner)); return
      }
      if (body.action !== 'create' || Object.keys(body).some(key => !['action', 'epoch', 'operationId', 'brief'].includes(key))) reject(400)
      if (body.epoch !== epoch || !text(body.operationId, 80) || typeof body.brief !== 'string'
        || body.brief.length > 2000 || !body.brief.trim() || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/u.test(body.brief)) reject(409)
      const existing = tasks.get(owner)
      if (existing) {
        if (existing.operationId !== body.operationId || existing.brief !== body.brief) reject(409)
        reply(res, 200, snapshot(owner)); return
      }
      if (tasks.size >= 32 || ctx.get('sessionPersistence') !== undefined || lifetime.signal.aborted) reject(503)
      const task: Task = { operationId: body.operationId, brief: body.brief, state: 'pending' }
      tasks.set(owner, task)
      // Reserve identity before the first asynchronous step. Browser identity never chooses it.
      const sessionId = SessionId(`split-${randomUUID()}`)
      reserved.set(sessionId, task)
      const ownerRequest = { headers: { ...req.headers } }
      task.pending = (async () => {
        try {
          const evidence = await snapshotSplitEvidence(options.root, options.sources, lifetime.signal)
          if (guard.ownerOf(ownerRequest) !== owner) reject(403)
          lifetime.signal.throwIfAborted()
          if (ctx.get('sessionPersistence') !== undefined) throw new Error('SPLIT_PERSISTENCE_UNSUPPORTED')
          const created = await sessions.create({ sessionId, cwd: options.root })
          if (created.sessionId !== sessionId) throw new Error('SPLIT_SESSION_MISMATCH')
          const resolved = await sessions.resolveAgent(sessionId)
          if ('error' in resolved) throw resolved.error
          task.parent = resolved.agent
          lifetime.signal.throwIfAborted()
          if (guard.ownerOf(ownerRequest) !== owner) reject(403)
          task.approval = attachSplitApprovalRequest(ctx, resolved.agent, {
            enabled: true, brief: task.brief, evidence, provider, workspaceLabel: options.workspaceLabel,
            ...options.maximumRequests === undefined ? {} : { maximumRequests: options.maximumRequests },
            ...options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs },
          })
          task.target = transport.bind(resolved.agent, task.approval, ownerRequest)
          task.state = 'ready'
          // Task intent is ordinary logged user content; the model may use or decline the available tool.
          await sessions.prompt({ sessionId, mode: 'queue', requestId: task.operationId as SessionRequestId, content: [{ type: 'text', text: task.brief }] }, lifetime.signal)
        } catch {
          task.state = 'failed'
          // Failed setup never grants a reusable offer. Cleanup failures remain visible as failed.
          const target = task.target
          delete task.target
          try { if (target) await transport.release(target); else await task.approval?.revoke() }
          catch { /* The failed receipt remains terminal and the request guard stays closed. */ }
        }
      })()
      // The receipt acknowledges reservation, not completion. Socket loss never rolls it back.
      reply(res, 202, snapshot(owner))
    } catch (error) { reply(res, error instanceof RequestFailure ? error.status : 400, { error: 'SPLIT_REQUEST_REFUSED' }) }
  } })
  const handle = { dispose(): Promise<void> {
    if (disposal) return disposal
    lifetime.abort(); guard.dispose(); unregister()
    disposal = (async () => {
      await Promise.all([...tasks.values()].flatMap(task => task.pending ? [task.pending] : []))
      await transport.dispose()
      unguard(); tasks.clear(); reserved.clear()
    })()
    return disposal
  } }
  ctx.effect(() => () => handle.dispose(), 'split: experimental conversation admission')
  return handle
}
