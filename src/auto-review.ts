/** DSH approval-answerer and `/approve` integration for Codex Auto-review. */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-commands'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { ApprovalOutcome } from '@deepseek-ai/dsh-user-approval'
import type { ApprovalRequestEvent } from '@deepseek-ai/dsh-user-approval/types'
import type { AutoReviewAssessment, AutoReviewBackend, AutoReviewBackendResult } from './auto-review-backend.ts'
import { OpenAICodexAutoReviewBackend, parseAutoReviewAssessment } from './auto-review-backend.ts'
import type { AutoReviewAction, AutoReviewActionPolicy } from './auto-review-contract.ts'
import { AutoReviewState, buildAutoReviewContext, redactAutoReviewText, resolveAutoReviewAction, resolveAutoReviewLocalPolicy } from './auto-review-contract.ts'
import { OPENAI_CODEX_PROVIDER } from './store.ts'
import type { OpenAICodexCredentialStore } from './store.ts'
import type { OpenAICodexProxyManager } from './provider-proxy.ts'
import type { OpenAICodexBackendRequests } from './backend-request.ts'

const REJECTION_GUIDANCE = 'Do not attempt the same outcome through a workaround, indirect execution, or policy circumvention. Stop this action and work that depends on it; continue independent, already-authorized work. Report the blocked dependency. Retrying the denied action requires exact-action user approval and must still respect higher-priority restrictions.'

function notice(summary: string, text: string) {
  return createUserMessage({
    source: { kind: 'dsh-codex-connect' as const, plugin: 'auto-review', form: 'notice' as const, summary },
    content: [{ type: 'text' as const, text }],
  })
}

function requestCancelled(request: ApprovalRequestEvent): boolean {
  return request.signal?.aborted === true
}

/** Stateful DSH answerer implementing Codex rejection and retry semantics. */
export class OpenAICodexAutoReviewAnswerer {
  constructor(
    private readonly backend: AutoReviewBackend,
    readonly state: AutoReviewState = new AutoReviewState(),
    private readonly log: (message: string) => void = () => undefined,
    private readonly resolvePolicy: (action: AutoReviewAction) => Promise<AutoReviewActionPolicy> = resolveAutoReviewLocalPolicy,
  ) {}

  /** Decide one exact approval request or preserve the human answerer chain. */
  async answer(request: ApprovalRequestEvent, next: () => Promise<ApprovalOutcome>): Promise<ApprovalOutcome> {
    if (request.agent.session.requestHeader()?.config.provider !== OPENAI_CODEX_PROVIDER) return next()
    if (requestCancelled(request)) return 'cancelled'
    const action = resolveAutoReviewAction(request)
    if (action === undefined) return next()

    const override = this.state.consume(request.agent, action)
    if (override === 'matched') {
      let currentPolicy: AutoReviewActionPolicy
      try { currentPolicy = await this.resolvePolicy(action) } catch {
        currentPolicy = { humanReason: 'The current target cannot be revalidated.' }
      }
      if (requestCancelled(request)) return 'cancelled'
      if ('humanReason' in currentPolicy) {
        request.agent.inject(notice(
          'The approved retry needs fresh human approval.',
          `The one-shot approval was consumed. ${currentPolicy.humanReason} The host must review the current action again.`,
        ))
        this.log(`Codex Auto-review delegated stale exact override to human approval ${action.fingerprint}`)
        return next()
      }
      this.state.recordDecision(request.agent, action, false, 'Explicit exact-action override')
      this.log(`Codex Auto-review allowed exact override ${action.fingerprint}`)
      return 'allowed-once'
    }
    if (override === 'mismatched') {
      request.agent.inject(notice(
        'The approved retry did not match the next action.',
        'The one-shot approval did not match this action and was consumed. The action was not automatically authorized; ask the user again if it is still needed.',
      ))
      return next()
    }
    if (this.state.breakerOpen(request.agent, action.turn)) return next()

    const context = buildAutoReviewContext(request.agent)
    let policy: AutoReviewActionPolicy
    try { policy = await this.resolvePolicy(action) } catch { return requestCancelled(request) ? 'cancelled' : next() }
    if (requestCancelled(request)) return 'cancelled'
    if ('humanReason' in policy || context.hasTrustedUserEvidence !== true) {
      request.agent.inject(notice(
        'This action requires human approval.',
        'humanReason' in policy ? policy.humanReason : 'Retained, unredacted trusted user evidence is unavailable. The reviewer cannot grant authorization.',
      ))
      this.log(`Codex Auto-review delegated to human approval ${action.fingerprint}`)
      return next()
    }

    let result: AutoReviewBackendResult
    try {
      result = await this.backend.review({
        action,
        context,
        ...request.signal === undefined ? {} : { signal: request.signal },
      })
    } catch { return requestCancelled(request) ? 'cancelled' : next() }
    if (requestCancelled(request)) return 'cancelled'
    if (result.status === 'unavailable') return next()
    if (result.status === 'cancelled') return 'cancelled'
    if (result.status === 'timeout') {
      const retry = this.state.allowTimeoutRetry(request.agent, action)
      request.agent.inject(notice(
        'Codex Auto-review timed out.',
        retry
          ? 'Codex Auto-review timed out before deciding this action. The action was not authorized. You may retry this exact action once or ask the user for approval.'
          : 'Codex Auto-review timed out again for this exact action. The action was not authorized; ask the user for approval instead of retrying the reviewer.',
      ))
      return retry ? 'rejected' : next()
    }

    // Runtime validation also covers injected backends, beyond the network parser.
    let assessment: AutoReviewAssessment | undefined
    try { assessment = parseAutoReviewAssessment(JSON.stringify(result.assessment)) } catch { return next() }
    if (assessment === undefined) return next()
    const denied = assessment.outcome === 'deny'
    if (!denied && (assessment.risk_level === 'high' || assessment.risk_level === 'critical'
      || assessment.user_authorization === 'unknown'
      || (assessment.risk_level === 'medium' || policy.riskFloor === 'medium') && assessment.user_authorization === 'low')) {
      request.agent.inject(notice(
        'This action requires human approval.',
        'The reviewer assessment does not satisfy the local risk and authorization requirements. A model decision cannot replace human approval for high risk or security-sensitive actions.',
      ))
      this.log(`Codex Auto-review delegated to human approval ${action.fingerprint} risk=${assessment.risk_level} authorization=${assessment.user_authorization}`)
      return next()
    }
    const rationale = redactAutoReviewText(assessment.rationale).text
    const denial = this.state.recordDecision(request.agent, action, denied, rationale)
    this.log(`Codex Auto-review ${denied ? 'denied' : 'allowed'} ${action.fingerprint} risk=${assessment.risk_level} authorization=${assessment.user_authorization}`)
    if (!denied) return 'allowed-once'

    request.agent.inject(notice(
      'Codex Auto-review denied an action.',
      `Untrusted reviewer rationale: ${rationale}\n${REJECTION_GUIDANCE}\nA user can approve one exact retry with /approve ${denial!.id}.`,
    ))
    if (this.state.breakerOpen(request.agent, action.turn)) {
      request.agent.cancel({ kind: 'hook', reason: 'Codex Auto-review denial circuit breaker opened' }, { keepInbox: true })
    }
    return 'rejected'
  }
}

/** Install the default-off answerer and optional exact-retry human command. */
export function registerOpenAICodexAutoReview(
  ctx: Context,
  credentials: OpenAICodexCredentialStore,
  proxyManager: OpenAICodexProxyManager,
  resolveProxyUrl: () => string | undefined,
  enabled: () => boolean,
  backendRequests?: OpenAICodexBackendRequests,
): OpenAICodexAutoReviewAnswerer {
  const answerer = new OpenAICodexAutoReviewAnswerer(
    new OpenAICodexAutoReviewBackend(credentials, proxyManager, resolveProxyUrl, credentials, backendRequests),
    new AutoReviewState(),
    message => { ctx.logger.info(message) },
  )
  ctx.on('approval/request', (request, next) => enabled() ? answerer.answer(request, next) : next(), { prepend: true })
  ctx.inject(['commands'], commandCtx => commandCtx.commands.register({
    name: 'approve',
    description: 'Approve one exact action previously denied by Codex Auto-review',
    input: { hint: 'denial id' },
    recordInput: false,
    handler(invocation) {
      if (!enabled()) return { kind: 'error', text: 'Codex Auto-review is disabled.' }
      const denials = answerer.state.denials(invocation.agent)
      const input = invocation.rawInput.trim()
      if (denials.length === 0) return { kind: 'error', text: 'There are no recent Codex Auto-review denials in this turn.' }
      const matches = input.length === 0
        ? denials.length === 1 ? [denials[0]!] : []
        : denials.filter(denial => denial.id === input || denial.id.startsWith(input))
      if (matches.length !== 1) {
        const choices = denials.map(denial => `${denial.id}: ${denial.toolName} — ${denial.rationale}`).join('\n')
        return { kind: 'error', text: `Choose one exact denial with /approve <id>:\n${choices}` }
      }
      const denial = answerer.state.arm(invocation.agent, matches[0]!.id)
      if (denial === undefined) return { kind: 'error', text: 'That denial is no longer available.' }
      invocation.agent.followup(createUserMessage({
        source: { kind: 'user' },
        content: [{ type: 'text', text: `I explicitly approve one retry of the exact action denied as ${denial.id}. Retry that same action without changing its tool, arguments, or working directory. This does not authorize any other action.` }],
      }))
      return { kind: 'success', text: `Approved one exact retry for ${denial.toolName} (${denial.id}).` }
    },
  }))
  return answerer
}
