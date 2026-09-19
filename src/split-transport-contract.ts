/** Internal browser/host protocol. Identifiers are correlations, never bearer permission. */
import type { SplitApprovalChoice, SplitApprovalView } from './split-approval-view.ts'
export const SPLIT_APPROVAL_PATH = '/api/codex-connect/split-approval'
export interface SplitApprovalTarget { readonly epoch: string; readonly sessionId: string; readonly offerId: string }
export interface SplitOperationReceipt {
  readonly operationId: string
  readonly state: 'accepted' | 'rejected' | 'pending' | 'failed'
}
export interface SplitTransportSnapshot extends SplitApprovalTarget {
  readonly version: 1
  readonly revision: number
  readonly view: SplitApprovalView
  readonly decision?: SplitOperationReceipt
  readonly revocation?: SplitOperationReceipt
}
export type SplitTransportRequest = SplitApprovalTarget & ({ readonly action: 'status' } | {
  readonly action: 'decide' | 'revoke'
  readonly operationId: string
  readonly reviewDigest: string
  readonly expectedRevision: number
  readonly choice?: SplitApprovalChoice
})
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const bounded = (value: unknown, max: number): value is string => typeof value === 'string' && value.length > 0 && value.length <= max
const integer = (value: unknown, max: number): value is number => Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= max
/** Validate before rendering server data, including correlations and bounded review data. */
export function decodeSplitSnapshot(value: unknown, target: SplitApprovalTarget): SplitTransportSnapshot {
  function reject(): never { throw new Error('SPLIT_RESPONSE_INVALID') }
  if (!record(value) || value.version !== 1 || value.epoch !== target.epoch || value.sessionId !== target.sessionId
    || value.offerId !== target.offerId || !integer(value.revision, Number.MAX_SAFE_INTEGER) || !record(value.view)) reject()
  const view = value.view as Record<string, unknown>
  if (view.id !== target.offerId || typeof view.reviewDigest !== 'string' || !/^[a-f0-9]{64}$/u.test(view.reviewDigest)
    || !['disabled', 'ready', 'awaiting-approval', 'deciding', 'running', 'completed', 'rejected', 'cancelled', 'unavailable', 'failed', 'revoking', 'revoked'].includes(String(view.phase))
    || !record(view.review)) reject()
  const review = view.review as Record<string, unknown>
  if (!bounded(review.workspaceLabel, 256) || !bounded(review.brief, 16_000) || !bounded(review.workerSystemPrompt, 4000)
    || review.model !== 'gpt-5.6-luna' || review.effort !== 'low' || review.contextPolicy !== 'isolated-system-and-approved-snapshots'
    || !integer(review.maximumRequests, 6) || review.maximumRequests === 0 || !integer(review.timeoutMs, 90_000) || review.timeoutMs === 0
    || !Array.isArray(review.files) || review.files.length < 1 || review.files.length > 16
    || review.files.some(file => !record(file) || !bounded(file.path, 256) || typeof file.sha256 !== 'string'
      || !/^[a-f0-9]{64}$/u.test(file.sha256) || !integer(file.lines, 32_001) || file.lines === 0)) reject()
  for (const key of ['decision', 'revocation'] as const) {
    const receipt = value[key]
    if (receipt !== undefined && (!record(receipt) || !bounded(receipt.operationId, 80)
      || !['accepted', 'rejected', 'pending', 'failed'].includes(String(receipt.state)))) reject()
  }
  return value as unknown as SplitTransportSnapshot
}
