/** Quota-triggered OpenAI Codex account failover inside one pi-ai turn. */

import {
  createAssistantMessageEventStream,
} from '@earendil-works/pi-ai'
import type {
  AssistantMessage,
  AssistantMessageEvent,
  Api,
  Context,
  Model,
  Provider,
  SimpleStreamOptions,
  Usage,
} from '@earendil-works/pi-ai'
import { isQuotaExceededError } from '@deepseek-ai/dsh-llm'
import type { OpenAICodexCredentialStore } from './store.ts'

const CONTINUATION_INSTRUCTION = [
  'Continue the interrupted assistant answer exactly after the content already shown.',
  'Do not repeat or summarize the existing answer.',
  'Preserve its language, structure, and intent.',
].join(' ')

const DEDUPLICATION_LIMIT = 4_096

/** Narrow terminal quota detection; transient 429/network failures do not rotate accounts. */
export function isOpenAICodexAccountQuotaExhausted(detail: string): boolean {
  return isQuotaExceededError(detail)
    || /\b(?:GoUsageLimitError|FreeUsageLimitError)\b/u.test(detail)
    || /\b(?:usage_limit_reached|usage_not_included)\b/iu.test(detail)
    || /\bhit\s+(?:(?:your|the)\s+)?(?:ChatGPT\s+)?usage\s+limit\b/iu.test(detail)
    || /\bMonthly usage limit reached\b/iu.test(detail)
    || /\bavailable balance\b/iu.test(detail)
}

function emptyUsage(): Usage {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  }
}

function addUsage(left: Usage, right: Usage): Usage {
  const optional = (key: 'cacheWrite1h' | 'reasoning'): number | undefined => {
    const a = left[key]
    const b = right[key]
    return a === undefined && b === undefined ? undefined : (a ?? 0) + (b ?? 0)
  }
  const cacheWrite1h = optional('cacheWrite1h')
  const reasoning = optional('reasoning')
  return {
    input: left.input + right.input,
    output: left.output + right.output,
    cacheRead: left.cacheRead + right.cacheRead,
    cacheWrite: left.cacheWrite + right.cacheWrite,
    ...cacheWrite1h === undefined ? {} : { cacheWrite1h },
    ...reasoning === undefined ? {} : { reasoning },
    totalTokens: left.totalTokens + right.totalTokens,
    cost: {
      input: left.cost.input + right.cost.input,
      output: left.cost.output + right.cost.output,
      cacheRead: left.cost.cacheRead + right.cost.cacheRead,
      cacheWrite: left.cost.cacheWrite + right.cost.cacheWrite,
      total: left.cost.total + right.cost.total,
    },
  }
}

function visibleText(message: AssistantMessage): string {
  return message.content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('\n')
}

function continuationContext(
  context: Context,
  model: Model<Api>,
  accumulated: AssistantMessage,
): Context {
  const text = visibleText(accumulated)
  if (text.length === 0) return context
  const { errorMessage: _errorMessage, ...accumulatedWithoutError } = accumulated
  const assistant: AssistantMessage = {
    ...accumulatedWithoutError,
    api: model.api,
    provider: model.provider,
    model: model.id,
    content: [{ type: 'text', text }],
    usage: emptyUsage(),
    stopReason: 'stop',
  }
  return {
    ...context,
    messages: [
      ...context.messages,
      assistant,
      { role: 'user', content: CONTINUATION_INSTRUCTION, timestamp: Date.now() },
    ],
  }
}

function combinedMessage(
  previous: AssistantMessage | undefined,
  current: AssistantMessage,
  currentContent = current.content,
): AssistantMessage {
  if (previous === undefined) return { ...current, content: currentContent }
  return {
    ...current,
    content: [...previous.content, ...currentContent],
    usage: addUsage(previous.usage, current.usage),
  }
}

function hasToolCall(message: AssistantMessage): boolean {
  return message.content.some(block => block.type === 'toolCall')
}

function terminalMessage(event: Extract<AssistantMessageEvent, { type: 'done' | 'error' }>): AssistantMessage {
  return event.type === 'done' ? event.message : event.error
}

function longestSuffixPrefix(prefix: string, candidate: string): number {
  const limit = Math.min(prefix.length, candidate.length)
  for (let length = limit; length > 0; length -= 1) {
    if (prefix.endsWith(candidate.slice(0, length))) return length
  }
  return 0
}

function canStillBeRepeatedSuffix(prefix: string, candidate: string): boolean {
  if (candidate.length === 0) return true
  for (let start = 0; start < prefix.length; start += 1) {
    const available = prefix.length - start
    if (candidate.length <= available && prefix.slice(start, start + candidate.length) === candidate) return true
  }
  return false
}

/** Hold only the ambiguous retry prefix, then strip a repeated prior suffix. */
class ContinuationDeduplicator {
  private readonly prefix: string
  private buffered = ''
  private decided = false

  constructor(previousText: string) {
    this.prefix = previousText.slice(-DEDUPLICATION_LIMIT)
  }

  write(delta: string): string {
    if (this.decided || this.prefix.length === 0) return delta
    this.buffered += delta
    if (this.buffered.length < DEDUPLICATION_LIMIT
      && canStillBeRepeatedSuffix(this.prefix, this.buffered)) return ''
    return this.release()
  }

  finish(): string {
    return this.decided ? '' : this.release()
  }

  private release(): string {
    this.decided = true
    const overlap = longestSuffixPrefix(this.prefix, this.buffered)
    const output = this.buffered.slice(overlap)
    this.buffered = ''
    return output
  }
}

function withCombinedPartial(
  previous: AssistantMessage | undefined,
  partial: AssistantMessage,
  firstTextIndex: number | undefined,
  firstText: string,
): AssistantMessage {
  const content = partial.content.map((block, index) => index === firstTextIndex && block.type === 'text'
    ? { ...block, text: firstText }
    : block)
  return combinedMessage(previous, partial, content)
}

function remapEvent(
  event: Exclude<AssistantMessageEvent, { type: 'start' | 'done' | 'error' }>,
  offset: number,
  previous: AssistantMessage | undefined,
  firstTextIndex: number | undefined,
  firstText: string,
): Exclude<AssistantMessageEvent, { type: 'start' | 'done' | 'error' }> {
  return {
    ...event,
    contentIndex: event.contentIndex + offset,
    partial: withCombinedPartial(previous, event.partial, firstTextIndex, firstText),
  }
}

function setupFailure(model: Model<Api>, error: unknown): AssistantMessage {
  return {
    role: 'assistant',
    content: [],
    api: model.api,
    provider: model.provider,
    model: model.id,
    usage: emptyUsage(),
    stopReason: 'error',
    errorMessage: error instanceof Error ? error.message : String(error),
    timestamp: Date.now(),
  }
}

/**
 * Wrap one provider with bounded quota-only account failover.
 *
 * The returned stream keeps one Harness turn alive. Failed attempts are never
 * exposed as terminal events; successful retry events are index-shifted after
 * content already shown by the failed account.
 */
export function withOpenAICodexAccountFallback(
  provider: Provider,
  credentials: OpenAICodexCredentialStore,
  resolveAccessToken: () => Promise<string | undefined>,
): Provider {
  const streamSimple = provider.streamSimple
  return {
    ...provider,
    streamSimple(model, originalContext: Context, options?: SimpleStreamOptions) {
      const output = createAssistantMessageEventStream()
      const pump = async (): Promise<void> => {
        let previous: AssistantMessage | undefined
        let access = options?.apiKey
        const attempted: string[] = []
        let context = originalContext

        while (true) {
          const offset = previous?.content.length ?? 0
          const deduplicator = new ContinuationDeduplicator(previous === undefined ? '' : visibleText(previous))
          const openBlocks = new Map<number, 'text' | 'thinking' | 'toolCall'>()
          let firstTextIndex: number | undefined
          let firstText = ''
          let sawTerminal = false
          let retry = false
          const inner = streamSimple.call(provider, model, context, {
            ...options,
            ...access === undefined ? {} : { apiKey: access },
          })

          for await (const event of inner) {
            if (event.type === 'start') {
              if (previous === undefined) output.push(event)
              continue
            }
            if (event.type === 'done' || event.type === 'error') {
              sawTerminal = true
              const released = deduplicator.finish()
              if (released.length > 0 && firstTextIndex !== undefined) {
                firstText += released
                output.push({
                  type: 'text_delta',
                  contentIndex: firstTextIndex + offset,
                  delta: released,
                  partial: withCombinedPartial(previous, terminalMessage(event), firstTextIndex, firstText),
                })
              }
              const raw = terminalMessage(event)
              const currentContent = raw.content.map((block, index) => index === firstTextIndex && block.type === 'text'
                ? { ...block, text: firstText }
                : block)
              const combined = combinedMessage(previous, raw, currentContent)
              const quotaFailure = event.type === 'error'
                && event.reason === 'error'
                && isOpenAICodexAccountQuotaExhausted(event.error.errorMessage ?? '')
              const safeToContinue = quotaFailure
                && options?.signal?.aborted !== true
                && !hasToolCall(raw)
                && ![...openBlocks.values()].includes('toolCall')
              const failedAccountId = safeToContinue && access !== undefined
                ? await credentials.accountIdForAccessToken(access)
                : undefined
              if (failedAccountId !== undefined) {
                attempted.push(failedAccountId)
                const next = await credentials.activateNext(failedAccountId, attempted)
                if (next !== undefined) {
                  const nextAccess = await resolveAccessToken()
                  const nextAccountId = nextAccess === undefined
                    ? undefined
                    : await credentials.accountIdForAccessToken(nextAccess)
                  if (nextAccess !== undefined && nextAccountId === next.accountId && !attempted.includes(nextAccountId)) {
                    for (const [index, type] of openBlocks) {
                      const block = currentContent[index]
                      if (type === 'text' && block?.type === 'text') {
                        output.push({
                          type: 'text_end',
                          contentIndex: index + offset,
                          content: block.text,
                          partial: combined,
                        })
                      } else if (type === 'thinking' && block?.type === 'thinking') {
                        output.push({
                          type: 'thinking_end',
                          contentIndex: index + offset,
                          content: block.thinking,
                          partial: combined,
                        })
                      }
                    }
                    previous = combined
                    access = nextAccess
                    context = continuationContext(originalContext, model, combined)
                    retry = true
                    break
                  }
                }
              }
              if (event.type === 'done') {
                output.push({ ...event, message: combined })
              } else {
                output.push({ ...event, error: combined })
              }
              output.end(combined)
              return
            }

            if (event.type === 'text_start') {
              firstTextIndex ??= event.contentIndex
              if (event.contentIndex === firstTextIndex) firstText = ''
              openBlocks.set(event.contentIndex, 'text')
              output.push(remapEvent(event, offset, previous, firstTextIndex, firstText))
              continue
            }
            if (event.type === 'text_delta') {
              const delta = event.contentIndex === firstTextIndex ? deduplicator.write(event.delta) : event.delta
              if (event.contentIndex === firstTextIndex) firstText += delta
              if (delta.length > 0) {
                output.push(remapEvent({ ...event, delta }, offset, previous, firstTextIndex, firstText))
              }
              continue
            }
            if (event.type === 'text_end') {
              const released = event.contentIndex === firstTextIndex ? deduplicator.finish() : ''
              if (released.length > 0) {
                firstText += released
                output.push(remapEvent({
                  type: 'text_delta',
                  contentIndex: event.contentIndex,
                  delta: released,
                  partial: event.partial,
                }, offset, previous, firstTextIndex, firstText))
              }
              openBlocks.delete(event.contentIndex)
              output.push(remapEvent({
                ...event,
                content: event.contentIndex === firstTextIndex ? firstText : event.content,
              }, offset, previous, firstTextIndex, firstText))
              continue
            }
            if (event.type === 'thinking_start') openBlocks.set(event.contentIndex, 'thinking')
            if (event.type === 'thinking_end') openBlocks.delete(event.contentIndex)
            if (event.type === 'toolcall_start') openBlocks.set(event.contentIndex, 'toolCall')
            if (event.type === 'toolcall_end') openBlocks.delete(event.contentIndex)
            output.push(remapEvent(event, offset, previous, firstTextIndex, firstText))
          }

          if (retry) continue
          if (!sawTerminal) throw new Error('OpenAI Codex account fallback source ended without a terminal event')
        }
      }

      void pump().catch((error: unknown) => {
        const message = setupFailure(model, error)
        output.push({ type: 'error', reason: 'error', error: message })
        output.end(message)
      })
      return output
    },
  }
}
