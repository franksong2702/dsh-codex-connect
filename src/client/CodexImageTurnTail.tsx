/** Visible generated-image results after a completed conversation turn. */

import { useMemo, useSyncExternalStore } from 'react'
import type { CSSProperties } from 'react'
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import type { ToolCallBlock, ToolResultNode } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { ToolChatData } from '@deepseek-ai/dsh-client-ui-chat/client'
import type { PropsRuntime, Translate } from '@deepseek-ai/dsh-client-ui-slots'
import { imagePresentationForResult } from './image-result-presentation.ts'
import { CodexImageTurnResult } from './CodexImageToolView.tsx'
import type { OpenAICodexSettingsKey } from './locales.ts'

export type CodexImageTurnTailProps = PropsRuntime<'conversation.chat.turnTail'> & {
  sessions: ISessions
  t: Translate<OpenAICodexSettingsKey>
}

const resultStack: CSSProperties = { display: 'grid', gap: 12, minWidth: 0 }

/** Keep successful image results from this turn, including nested PTC calls. */
export function selectTurnImageResults(rows: readonly ToolChatData[], closingSeq: number): readonly ToolResultNode[] {
  const images: ToolResultNode[] = []
  for (const row of rows) {
    const pending: ToolCallBlock[] = [row.root]
    const visited = new Set<string>()
    while (pending.length > 0) {
      const block = pending.pop()
      if (block === undefined || visited.has(block.callId)) continue
      visited.add(block.callId)
      if ('kind' in block && block.seq <= closingSeq && imagePresentationForResult(block) !== undefined) images.push(block)
      for (let index = block.subCalls.length - 1; index >= 0; index--) {
        const child = block.subCalls[index]
        if (child !== undefined) pending.push(child)
      }
    }
  }
  return images.sort((left, right) => left.seq - right.seq)
}

/** Put generated images in the independent answer tail, outside Turn-process disclosure. */
export function CodexImageTurnTail({ turn, seq, sessionId, useChat, sessions, t }: CodexImageTurnTailProps) {
  const source = useChat(chat => chat.nodes.turnDataSource(turn.turn, 'tool-call'))
  const rows = useSyncExternalStore(source.subscribe, source.getSnapshot, source.getSnapshot)
  const results = useMemo(() => selectTurnImageResults(rows, seq), [rows, seq])
  if (results.length === 0) return null
  return <section data-turn-image-results="" aria-label={t('completed')} style={resultStack}>
    {results.map(block => <CodexImageTurnResult key={block.callId} block={block} sessionId={sessionId} sessions={sessions} t={t} />)}
  </section>
}
