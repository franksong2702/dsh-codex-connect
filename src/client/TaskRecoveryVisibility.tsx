/** Profile presentation preference; task state and safety exits remain unchanged. */
import { useCallback, useSyncExternalStore } from 'react'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { OpenAICodexSettingsConfig } from '../settings-contract.ts'
import { PublishedAdaptiveTaskControl } from './PublishedAdaptiveTaskControl.tsx'

type Props = {
  sessionId: string
  language?: string
  configScope: ConfigForm<OpenAICodexSettingsConfig>
}

export function TaskRecoveryVisibility({ configScope, ...props }: Props) {
  const subscribe = useCallback((listener: () => void) => configScope.subscribe(listener), [configScope])
  const getSnapshot = useCallback(() => configScope.getSnapshot(), [configScope])
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  // Wait for the saved preference before the first task read. If the Host cannot
  // serve settings, keep recovery reachable rather than interpreting unknown as off.
  if (snapshot.value?.showTaskRecoveryControls === false
    || (snapshot.value === undefined && snapshot.status === 'loading')) return null
  return <PublishedAdaptiveTaskControl {...props} />
}
