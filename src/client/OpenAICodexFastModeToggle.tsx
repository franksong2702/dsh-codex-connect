/** Per-conversation OpenAI Codex speed control for the Composer row. */

import { useCallback, useSyncExternalStore } from 'react'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { ModelDirectoryState } from '@deepseek-ai/dsh-client-ui-model-selection/client'
import type { OpenAICodexSettingsKey } from './locales.ts'
import { OpenAICodexSpeedControl } from './OpenAICodexSpeedControl.tsx'
import type { OpenAICodexAccountStore } from './account-store.ts'

const CODEX_PROVIDER = 'openai-codex'

type Translate = (key: OpenAICodexSettingsKey, params?: Record<string, unknown>) => string

export interface OpenAICodexFastModeToggleInjected {
  /** Session-scoped model directory shared with the model selector and quota. */
  readonly directory: SnapshotStore<ModelDirectoryState>
  readonly account?: Pick<OpenAICodexAccountStore, 'subscribe' | 'getSnapshot'>
}

function isEligible(state: ModelDirectoryState): boolean {
  const current = state.current
  return state.status === 'ready'
    && current?.provider === CODEX_PROVIDER
    && typeof current.model === 'string'
    && current.model.startsWith('gpt-')
}

/**
 * Render the session-addressed speed control only for GPT models on the exact
 * Codex provider. Every Codex GPT model gets the same compact
 * Standard/Fast/Ultrafast menu; Ultrafast itself stays model- and
 * account-gated inside the menu, so no model gets a second, legacy control.
 */
export function OpenAICodexFastModeToggle(props: OpenAICodexFastModeToggleInjected & { sessionId: string; t: Translate }) {
  const snapshot = useSyncExternalStore(listener => props.directory.subscribe(listener), () => props.directory.getSnapshot(), () => props.directory.getSnapshot())
  if (!isEligible(snapshot)) return null
  return <AccountScopedSpeedControl {...props} model={snapshot.current!.model} />
}

function AccountScopedSpeedControl(props: OpenAICodexFastModeToggleInjected & { sessionId: string; model: string; t: Translate }) {
  const subscribe = useCallback((listener: () => void) => props.account?.subscribe(listener) ?? (() => undefined), [props.account])
  const snapshot = useCallback(() => props.account?.getSnapshot(), [props.account])
  const account = useSyncExternalStore(subscribe, snapshot, snapshot)
  const identity = account === undefined ? '' : [account.accounts.find(row => row.active)?.accountKey ?? '',
    account.status.status, account.operation.kind, account.authorizationRevision ?? 0].join(':')
  const available = account === undefined || (!account.busy && account.status.status === 'signed-in')
  return <OpenAICodexSpeedControl key={props.sessionId + ':' + props.model + ':' + identity}
    sessionId={props.sessionId} model={props.model} t={props.t} available={available} />
}
