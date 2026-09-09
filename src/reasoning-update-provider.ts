/** Request-local Astra configuration conversion over the public pi-ai payload hook. */

import { AsyncLocalStorage } from 'node:async_hooks'
import type { Context, Provider } from '@earendil-works/pi-ai'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import { applyReasoningUpdates, planReasoningUpdates, reasoningUpdateError } from './reasoning-update.ts'
import type { AstraReasoningPlan } from './reasoning-update.ts'

/**
 * Account for a leading system message moved out of history by the host adapter.
 * @param plan - Validated approvals in the original Harness message sequence.
 * @param context - The actual converted pi-ai context before wire serialization.
 * @returns A request-local plan whose positions refer to the converted user messages.
 */
export function projectReasoningPlan(plan: AstraReasoningPlan, context: Context): AstraReasoningPlan {
  const userCount = context.messages.filter(message => message.role === 'user').length
  if (userCount === plan.userCount) return plan
  if (plan.leadingSystemText === undefined || userCount !== plan.userCount - 1
    || context.systemPrompt !== (plan.leadingSystemText || undefined)) {
    reasoningUpdateError('The Astra context conversion did not preserve its user-message positions or leading system prompt.')
  }
  return { ...plan, userCount, updates: plan.updates.map(update => ({ ...update, userIndex: update.userIndex - 1 })) }
}

/** Captures each stream independently, including prepared calls and concurrent sessions. */
export class AstraReasoningRequestScope {
  private readonly current = new AsyncLocalStorage<AstraReasoningPlan | undefined>()

  /** Preserve other provider hooks and freeze this request's update plan before dispatch. */
  wrapProvider(provider: Provider): Provider {
    const streamSimple = provider.streamSimple
    const current = this.current
    return {
      ...provider,
      streamSimple(model, context, options) {
        const captured = current.getStore()
        if (captured === undefined) return streamSimple.call(provider, model, context, options)
        const plan = projectReasoningPlan(captured, context)
        const previous = options?.onPayload
        return streamSimple.call(provider, model, context, {
          ...options,
          async onPayload(payload, payloadModel) {
            const replaced = await previous?.(payload, payloadModel)
            return applyReasoningUpdates(replaced === undefined ? payload : replaced, plan)
          },
        })
      },
    }
  }

  /** Validate before authentication; close the delegated iterator when a consumer stops. */
  async *stream(options: GenerateOptions, delegate: () => AsyncIterable<StreamChunk>): AsyncIterable<StreamChunk> {
    const plan = planReasoningUpdates(options)
    const iterator = delegate()[Symbol.asyncIterator]()
    let completed = false
    try {
      while (true) {
        const item = await this.current.run(plan, () => iterator.next())
        if (item.done) {
          completed = true
          return
        }
        yield item.value
      }
    } finally {
      if (!completed) await this.current.run(plan, () => iterator.return?.())
    }
  }
}
