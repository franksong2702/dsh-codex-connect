/** Read-only validation of the host's Split prompt representation. Never rewrites model input. */
import type { Message } from '@deepseek-ai/dsh-llm'

export interface SplitRequestContext {
  readonly system?: string
  readonly messages: readonly Message[]
}

function denied(): never { throw new Error('SPLIT_CONTEXT_DENIED') }
function exactText(message: Message, expected: string): boolean {
  const block = message.content?.[0]
  return message.content?.length === 1 && block?.type === 'text' && block.text === expected
    && Object.keys(block).length === 2
}

/**
 * Baseline DSH passes a separate system field. Newer exact hosts put the same prompt at
 * history index zero, attributed to their system-prompt plugin. Accept one representation,
 * never both, and never strip a role or silently remove unapproved history to make it pass.
 * Provenance is a host-composition check, not authentication of arbitrary same-process code.
 */
export function assertSplitRequestContext(options: SplitRequestContext, expectedSystem: string, expectedTask: string): void {
  if (!Array.isArray(options.messages)) denied()
  let taskIndex = 0
  if (options.system === undefined) {
    const head = options.messages[0]
    if (head?.role !== 'system' || head.source?.kind !== 'plugin'
      || head.source.plugin !== '@deepseek-ai/dsh-system-prompt' || head.source.form !== undefined
      || !exactText(head, expectedSystem)) denied()
    taskIndex = 1
  } else if (options.system !== expectedSystem) denied()

  const task = options.messages[taskIndex]
  if (task?.role !== 'user' || task.source?.kind !== 'user' || !exactText(task, expectedTask)) denied()
  for (const message of options.messages.slice(taskIndex + 1)) {
    if (!((message?.role === 'assistant' && message.source?.kind === 'model')
      || (message?.role === 'user' && message.source?.kind === 'tool'))) denied()
  }
}
