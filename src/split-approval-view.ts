/** Wire-safe presentation only. These values do not themselves confer execution authority. */
export type SplitApprovalPhase = 'disabled' | 'ready' | 'awaiting-approval' | 'deciding' | 'running' | 'completed' | 'rejected' | 'cancelled' | 'unavailable' | 'failed' | 'revoking' | 'revoked'
export type SplitApprovalChoice = 'allow-once' | 'reject'
export interface SplitApprovalReview {
  readonly workspaceLabel: string
  readonly brief: string
  readonly files: readonly { readonly path: string; readonly sha256: string; readonly lines: number }[]
  readonly model: 'gpt-5.6-luna'
  readonly effort: 'low'
  readonly maximumRequests: number
  readonly timeoutMs: number
  readonly contextPolicy: 'isolated-system-and-approved-snapshots'
  readonly workerSystemPrompt: string
}
export interface SplitApprovalView {
  readonly id: string
  readonly reviewDigest: string
  readonly phase: SplitApprovalPhase
  readonly review: SplitApprovalReview
}
