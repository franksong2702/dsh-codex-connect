/** Logged agent-request routing for opt-in, backend-authorized Luna Reserve. */

import type { Context } from '@deepseek-ai/cordis'
import type { LlmCallConfig } from '@deepseek-ai/dsh-llm'
import { isAgentLoopRequest, QUOTA_EXCEEDED_CODE } from '@deepseek-ai/dsh-llm'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { OPENAI_CODEX_PROVIDER } from './store.ts'
import type { OpenAICodexQuotaState } from './quota-state.ts'
import { ReserveRequestPermits, ReserveReturnStore } from './reserve-state.ts'
import {
  OPENAI_CODEX_RESERVE_MODEL,
  OPENAI_CODEX_RESERVE_NORMAL_MODEL,
} from './reserve-usage.ts'

/** Dependencies scoped to one plugin instance; no account or usage cache is shared globally. */
export interface ReserveRoutingOptions {
  quota: OpenAICodexQuotaState
  returns: ReserveReturnStore
  permits: ReserveRequestPermits
  enabled: () => boolean
}

/**
 * Rewrite only the proposed model route before Harness logs request/header and resolves budgets.
 * The private return target never enters the model prompt. Ordinary requests remain usable when
 * optional eligibility checks fail; a running Reserve conversation fails closed instead of guessing.
 */
export function registerReserveRouting(ctx: Context, options: ReserveRoutingOptions): () => Promise<void> {
  const lifetime = new AbortController()
  const inFlight = new Set<Promise<LlmCallConfig>>()
  const requestAccounts = new Map<string, string>()
  const recoveryAttempts = new Map<string, number>()
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

    const result = await options.quota.read(undefined, requestSignal, config.model).catch(() => {
      requestSignal.throwIfAborted()
      return undefined
    })
    requestSignal.throwIfAborted()
    if (result?.identity !== undefined) requestAccounts.set(sessionId, result.identity.key)
    else requestAccounts.delete(sessionId)
    if (result === undefined || result.identity === undefined || result.decision.kind === 'unavailable') {
      if (usingReserve) throw new Error('Codex Reserve eligibility could not be verified; retry or select an ordinary model')
      return config
    }

    const { identity, decision } = result
    const authoritySignal = AbortSignal.any([requestSignal, result.authoritySignal])
    authoritySignal.throwIfAborted()
    if (decision.kind === 'exhausted') {
      throw new Error('Ordinary Codex usage and Luna Reserve are exhausted; wait for usage to recover or select another available model')
    }
    const saved = usingReserve ? await options.returns.load(sessionId) : undefined
    // Account/settings changes or a newer quota snapshot can arrive during I/O,
    // including on ordinary recovery where no Reserve dispatch permit is issued.
    authoritySignal.throwIfAborted()
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
    authoritySignal.throwIfAborted()
    options.permits.issue(sessionId, identity.key, authoritySignal)
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
  ctx.on('agent/request-error', async ({ agent, turn, provider, failure, signal }, next) => {
    if (provider !== OPENAI_CODEX_PROVIDER || !options.enabled() || failure.code !== QUOTA_EXCEEDED_CODE) return next()
    const sessionId = String(agent.session.id)
    options.permits.revoke(sessionId)
    const previous = agent.session.requestHeader()?.config
    const account = requestAccounts.get(sessionId)
    options.quota.invalidate()
    if (previous === undefined || account === undefined || recoveryAttempts.get(sessionId) === turn) return next()
    recoveryAttempts.set(sessionId, turn)
    const requestSignal = AbortSignal.any([signal, lifetime.signal])
    const result = await options.quota.read(undefined, requestSignal, previous.model).catch(() => undefined)
    requestSignal.throwIfAborted()
    if (result?.identity?.key !== account) return next()
    result.authoritySignal.throwIfAborted()
    const decision = result.decision
    const entering = previous.model !== OPENAI_CODEX_RESERVE_MODEL && decision.kind === 'reserve'
      && decision.normalModel === OPENAI_CODEX_RESERVE_NORMAL_MODEL
      && (decision.blockedModel === undefined || decision.blockedModel === previous.model)
    const recovering = previous.model === OPENAI_CODEX_RESERVE_MODEL && decision.kind === 'ordinary'
    return entering || recovering ? { kind: 'retry' } : next()
  }, { prepend: true })
  const clearSession = (agent: Agent): void => {
    const sessionId = String(agent.session.id)
    options.permits.revoke(sessionId)
    requestAccounts.delete(sessionId)
    recoveryAttempts.delete(sessionId)
  }
  ctx.on('agent/error', ({ agent }) => { clearSession(agent) })
  ctx.on('agent/turn-stopping', ({ agent }) => { clearSession(agent) })
  const stop = async (): Promise<void> => {
    lifetime.abort()
    options.permits.clear()
    requestAccounts.clear()
    recoveryAttempts.clear()
    await Promise.allSettled(inFlight)
  }
  ctx.effect(() => stop, 'dsh-codex-connect: Reserve request permits')
  return stop
}
