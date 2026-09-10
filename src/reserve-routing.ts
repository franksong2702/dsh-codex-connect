/** Logged agent-request routing for opt-in, backend-authorized Luna Reserve. */

import type { Context } from '@deepseek-ai/cordis'
import type { LlmCallConfig } from '@deepseek-ai/dsh-llm'
import { isAgentLoopRequest } from '@deepseek-ai/dsh-llm'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { readOpenAICodexRequestAuth } from './auth.ts'
import type { OpenAICodexCredentialStore } from './store.ts'
import { OPENAI_CODEX_PROVIDER } from './store.ts'
import type { OpenAICodexProxyManager } from './provider-proxy.ts'
import { ReserveRequestPermits, ReserveReturnStore } from './reserve-state.ts'
import {
  OPENAI_CODEX_RESERVE_MODEL,
  OPENAI_CODEX_RESERVE_NORMAL_MODEL,
  readReserveUsage,
  reserveIdentity,
} from './reserve-usage.ts'

/** Dependencies scoped to one plugin instance; no account or usage cache is shared globally. */
export interface ReserveRoutingOptions {
  credentials: OpenAICodexCredentialStore
  returns: ReserveReturnStore
  permits: ReserveRequestPermits
  enabled: () => boolean
  proxyManager: OpenAICodexProxyManager
  resolveProxyUrl: () => string | undefined
}

/**
 * Rewrite only the proposed model route before Harness logs request/header and resolves budgets.
 * The private return target never enters the model prompt. Ordinary requests remain usable when
 * optional eligibility checks fail; a running Reserve conversation fails closed instead of guessing.
 */
export function registerReserveRouting(ctx: Context, options: ReserveRoutingOptions): void {
  const lifetime = new AbortController()
  const inFlight = new Set<Promise<LlmCallConfig>>()
  ctx.on('llm/stream', (request, next) => {
    if (request.provider === OPENAI_CODEX_PROVIDER && request.model === OPENAI_CODEX_RESERVE_MODEL
      && !isAgentLoopRequest(request)) {
      throw new Error('Codex Reserve is available only to server-authorized agent-loop requests; select an ordinary model for auxiliary calls')
    }
    return next()
  }, { prepend: true })
  const route = async (agent: Agent, signal: AbortSignal, next: () => Promise<LlmCallConfig>): Promise<LlmCallConfig> => {
    const config = await next()
    const requestSignal = AbortSignal.any([signal, lifetime.signal])
    const sessionId = String(agent.session.id)
    options.permits.revoke(sessionId)
    requestSignal.throwIfAborted()
    if (config.provider !== OPENAI_CODEX_PROVIDER) return config
    const usingReserve = config.model === OPENAI_CODEX_RESERVE_MODEL
    if (!options.enabled()) {
      if (usingReserve) throw new Error('Automatic Luna Reserve is disabled; select an ordinary model to continue')
      return config
    }

    const proxyUrl = options.resolveProxyUrl()
    const result = await options.proxyManager.run(proxyUrl, async () => {
      const auth = await readOpenAICodexRequestAuth(options.credentials, requestSignal)
      const identity = reserveIdentity(auth.access)
      if (identity === undefined || identity.accountId !== auth.accountId) return undefined
      const decision = await readReserveUsage(auth.access, identity, requestSignal)
      return { identity, decision }
    }).catch(() => {
      requestSignal.throwIfAborted()
      return undefined
    })
    requestSignal.throwIfAborted()
    if (result === undefined || result.decision.kind === 'unavailable') {
      if (usingReserve) throw new Error('Codex Reserve eligibility could not be verified; retry or select an ordinary model')
      return config
    }

    const { identity, decision } = result
    const saved = usingReserve ? await options.returns.load(sessionId) : undefined
    requestSignal.throwIfAborted()
    if (usingReserve && (saved === undefined || saved.identityKey !== identity.key)) {
      throw new Error('Codex Reserve has no return target for this account and conversation; select an ordinary model')
    }
    if (decision.kind === 'ordinary') {
      if (!usingReserve || saved === undefined) return config
      // Keep the saved file for resumed history; a later entry replaces it atomically.
      return { ...saved.ordinary }
    }
    const ordinary = saved?.ordinary ?? config
    if (decision.blockedModel !== undefined && decision.blockedModel !== ordinary.model
      && decision.blockedModel !== config.model) {
      if (usingReserve) throw new Error('Codex Reserve authorization does not apply to this conversation model')
      return config
    }
    if (decision.normalModel !== OPENAI_CODEX_RESERVE_NORMAL_MODEL) {
      throw new Error('The server requested unsupported Luna Reserve model metadata; no model request was sent')
    }
    if (!usingReserve) {
      await options.returns.save(sessionId, { version: 1, identityKey: identity.key, ordinary: { ...ordinary } })
    }
    requestSignal.throwIfAborted()
    options.permits.issue(sessionId, identity.key, requestSignal)
    if (usingReserve) return config
    // Reserve uses Luna's own reasoning/output defaults, not the exhausted model's controls.
    const reserve: LlmCallConfig = { provider: OPENAI_CODEX_PROVIDER, model: OPENAI_CODEX_RESERVE_MODEL }
    return reserve
  }
  ctx.on('agent/request', ({ agent, signal }, next) => {
    const pending = route(agent, signal, next)
    inFlight.add(pending)
    return pending.finally(() => { inFlight.delete(pending) })
  }, { prepend: true })
  ctx.on('agent/error', ({ agent }) => { options.permits.revoke(String(agent.session.id)) })
  ctx.on('agent/turn-stopping', ({ agent }) => { options.permits.revoke(String(agent.session.id)) })
  ctx.effect(() => async () => {
    lifetime.abort()
    options.permits.clear()
    await Promise.allSettled(inFlight)
  }, 'dsh-codex-connect: Reserve request permits')
}
