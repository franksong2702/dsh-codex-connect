/** Internal connected card; its store is owned by the authenticated host-session surface. */
import { useSyncExternalStore } from 'react'
import { SplitApprovalCard } from './SplitApprovalCard.tsx'
import type { SplitApprovalRemoteStore } from './split-approval-remote.ts'
export function SplitApprovalRemoteCard({ store, locale = 'en' }: { store: SplitApprovalRemoteStore; locale?: 'en' | 'zh' }) {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot)
  const zh = locale === 'zh'
  return <section aria-label={zh ? '审批连接状态' : 'Approval connection status'}>
    {state.status !== 'ready' && <p role="alert">{zh ? '连接或操作结果尚未确认；不会自动重复批准。' : 'Connection or action outcome is unconfirmed; approval is not retried automatically.'}</p>}
    <button type="button" onClick={() => { void store.refresh() }} disabled={state.status === 'disconnected'}>{zh ? '重新读取状态' : 'Refresh status'}</button>
    {state.snapshot && <SplitApprovalCard view={state.snapshot.view} locale={locale}
      decisionDisabled={state.status !== 'ready' || state.decisionLocked}
      revokeDisabled={state.revokeLocked || state.status === 'unavailable' || state.status === 'disconnected'}
      onDecide={store.decide} onRevoke={store.revoke} />}
  </section>
}
