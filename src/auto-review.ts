/** DSH approval-answerer and `/approve` integration for Codex Auto-review. */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-commands'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { ApprovalOutcome } from '@deepseek-ai/dsh-user-approval'
import type { ApprovalRequestEvent } from '@deepseek-ai/dsh-user-approval/types'
import type { AutoReviewBackend } from './auto-review-backend.ts'
import { OpenAICodexAutoReviewBackend } from './auto-review-backend.ts'
import { AutoReviewState, buildAutoReviewContext, resolveAutoReviewAction } from './auto-review-contract.ts'
import { OPENAI_CODEX_PROVIDER } from './store.ts'
import type { OpenAICodexCredentialStore } from './store.ts'
import type { OpenAICodexProxyManager } from './provider-proxy.ts'

const REJECTION_GUIDANCE = 'Do not attempt the same outcome through a workaround, indirect execution, or policy circumvention. Proceed only with a materially safer alternative or explicit user approval; otherwise stop and request input.'

function notice(summary: string, text: string) {
  return createUserMessage({
    source: { kind: 'plugin' as const, plugin: 'dsh-codex-connect', form: 'notice' as const, summary },
    content: [{ type: 'text' as const, text }],
  })
}

/** Stateful DSH answerer implementing Codex rejection and retry semantics. */
export class OpenAICodexAutoReviewAnswerer {
  constructor(
    private readonly backend: AutoReviewBackend,
    readonly state: AutoReviewState = new AutoReviewState(),
    private readonly log: (message: string) => void = () => undefined,
  ) {}

  /** Decide one exact approval request or preserve the human answerer chain. */
  async answer(request: ApprovalRequestEvent, next: () => Promise<ApprovalOutcome>): Promise<ApprovalOutcome> {
    if (request.agent.session.requestHeader()?.config.provider !== OPENAI_CODEX_PROVIDER) return next()
    const action = resolveAutoReviewAction(request)
    if (action === undefined) return next()

    const override = this.state.consume(request.agent, action)
    if (override === 'matched') {
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

    const result = await this.backend.review({
      action,
      context: buildAutoReviewContext(request.agent),
      ...request.signal === undefined ? {} : { signal: request.signal },
    })
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

    const denied = result.assessment.outcome === 'deny'
    const denial = this.state.recordDecision(request.agent, action, denied, result.assessment.rationale)
    this.log(`Codex Auto-review ${denied ? 'denied' : 'allowed'} ${action.fingerprint} risk=${result.assessment.risk_level} authorization=${result.assessment.user_authorization}`)
    if (!denied) return 'allowed-once'

    request.agent.inject(notice(
      'Codex Auto-review denied an action.',
      `Untrusted reviewer rationale: ${result.assessment.rationale}\n${REJECTION_GUIDANCE}\nA user can approve one exact retry with /approve ${denial!.id}.`,
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
): OpenAICodexAutoReviewAnswerer {
  const answerer = new OpenAICodexAutoReviewAnswerer(
    new OpenAICodexAutoReviewBackend(credentials, proxyManager, resolveProxyUrl),
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
