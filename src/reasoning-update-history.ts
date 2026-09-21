/** Admit only already-recorded Think updates from the exact host-owned Session. */

import { isDeepStrictEqual } from 'node:util'
import type { GenerateOptions } from '@deepseek-ai/dsh-llm'
import type { Session } from '@deepseek-ai/dsh-session'
import { planReasoningUpdates, readReasoningUpdate, reasoningUpdateError } from './reasoning-update.ts'
import type { AstraReasoningPlan } from './reasoning-update.ts'
import { prepareCheckpointReasoningReplay } from './reasoning-update-checkpoint.ts'

/**
 * Validate the durable source before any provider/delegate can be constructed.
 * @param options - complete request messages and selected route.
 * @param session - exact host-owned Session; not a Session reconstructed from model output.
 * @returns a request-local plan, or undefined when no Think state is present.
 * @remarks This is an admitted-history seam, not human approval verification. Pending
 * questions, proposed pre-step batches, root-Agent ownership and policy belong to
 * a later host integration. Never register this helper as a model-callable tool.
 */
export function prepareReasoningReplay(options: GenerateOptions, session?: Session): AstraReasoningPlan | undefined {
  const requested = options.messages.filter(message => readReasoningUpdate(message) !== undefined)
  const recorded = session?.snapshotEvents().flatMap(event => event.type === 'user/message'
    && readReasoningUpdate(event.data) !== undefined ? [event.data] : []) ?? []
  if (requested.length === 0 && recorded.length === 0) return undefined
  if (session === undefined || options.sessionId !== session.id) {
    reasoningUpdateError('Think replay requires the original host-owned session.')
  }
  if (requested.length > 0 && recorded.length === 0) {
    reasoningUpdateError('An unrecorded Think notice cannot enter a compaction or replaced-surface request.')
  }
  if (options.purpose === 'compaction' || session.surface.replaceGeneration !== 0) {
    return prepareCheckpointReasoningReplay(options, session)
  }
  if (options.purpose !== undefined) reasoningUpdateError('Auxiliary requests are not supported by this Think replay mechanism.')
  const surface = session.deriveMessages()
  const visible = surface.filter(message => readReasoningUpdate(message) !== undefined)
  if (requested.length !== recorded.length || visible.length !== recorded.length) {
    reasoningUpdateError('A confirmed Think update is missing or unrecorded; no model request was started.')
  }
  for (const [index, message] of requested.entries()) {
    const event = recorded[index]!
    if (message.id !== event.id || visible[index]?.id !== event.id
      || !isDeepStrictEqual(message.source, event.source) || !isDeepStrictEqual(message.content, event.content)) {
      reasoningUpdateError('Think request state differs from its recorded notice or order.')
    }
  }
  if (!isDeepStrictEqual(options.messages, surface)) {
    reasoningUpdateError('Think replay requires the complete unchanged session surface, not moved notices or edited background.')
  }
  return planReasoningUpdates(options)
}
