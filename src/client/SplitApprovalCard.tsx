/** Isolated consent view. Not registered in the shipped client; transport authentication remains host-owned. */
import { useRef, useState } from 'react'
import type { SplitApprovalChoice, SplitApprovalPhase, SplitApprovalView } from '../split-approval-view.ts'

const labels = {
  en: {
    title: 'Read-only worker approval', task: 'Task', files: 'Approved source versions', prompt: 'Worker instructions',
    scope: 'Only these immutable source snapshots may be sent to Luna. No writes, shell, network tools, extra workers, retries, model fallback, or session resume.',
    limits: 'Maximum {requests} child requests. {seconds} seconds for approval and execution together. This is not a token-price or total-cost guarantee.',
    allow: 'Approve once', reject: 'Reject', revoke: 'Revoke and stop',
    unknown: 'The action could not be confirmed. Recheck the authoritative status before another decision.',
    phases: { disabled: 'Disabled', ready: 'Prepared; not yet requesting approval', 'awaiting-approval': 'Awaiting your decision', deciding: 'Recording your decision', running: 'Worker running', completed: 'Completed', rejected: 'Rejected', cancelled: 'Cancelled', unavailable: 'Approval unavailable', failed: 'Failed', revoking: 'Stopping; cleanup not yet confirmed', revoked: 'Revoked; worker cleanup confirmed' } satisfies Record<SplitApprovalPhase, string>,
  },
  zh: {
    title: '只读子 Agent 审批', task: '任务', files: '批准的源码版本', prompt: '子 Agent 指令',
    scope: '仅允许向 Luna 发送这些不可变源码快照。不得写入、执行命令、使用网络工具、创建更多子任务、重试、切换模型或恢复会话。',
    limits: '子 Agent 最多请求 {requests} 次；审批与执行合计 {seconds} 秒。这不是总 token 费用保证。',
    allow: '仅批准这一次', reject: '拒绝', revoke: '撤销并停止',
    unknown: '尚未确认操作结果。再次决定前，请重新核对服务端状态。',
    phases: { disabled: '已禁用', ready: '已准备，尚未发起审批', 'awaiting-approval': '等待你的决定', deciding: '正在记录决定', running: '子 Agent 运行中', completed: '已完成', rejected: '已拒绝', cancelled: '已取消', unavailable: '审批不可用', failed: '失败', revoking: '正在停止，尚未确认清理完成', revoked: '已撤销，子 Agent 清理完成' } satisfies Record<SplitApprovalPhase, string>,
  },
} as const
export interface SplitApprovalCardProps {
  view: SplitApprovalView
  locale?: 'en' | 'zh'
  onDecide(id: string, reviewDigest: string, choice: SplitApprovalChoice): Promise<boolean>
  onRevoke(id: string): Promise<void>
}
export function SplitApprovalCard(props: SplitApprovalCardProps) {
  // A changed offer remounts local interaction state. Old async callbacks cannot unlock a new offer.
  return <Offer key={`${props.view.id}:${props.view.reviewDigest}`} {...props} />
}
function Offer({ view, locale = 'en', onDecide, onRevoke }: SplitApprovalCardProps) {
  const copy = labels[locale]
  const action = useRef<'decision' | 'revoke' | undefined>(undefined)
  const [decisionSent, setDecisionSent] = useState(false)
  const [revokeSent, setRevokeSent] = useState(false)
  const [unknown, setUnknown] = useState(false)
  const decide = async (choice: SplitApprovalChoice): Promise<void> => {
    if (action.current !== undefined || view.phase !== 'awaiting-approval') return
    action.current = 'decision'; setDecisionSent(true)
    try { if (!await onDecide(view.id, view.reviewDigest, choice)) setUnknown(true) }
    catch { setUnknown(true) }
  }
  const revoke = async (): Promise<void> => {
    if (action.current === 'revoke') return
    action.current = 'revoke'; setRevokeSent(true)
    try { await onRevoke(view.id) } catch { setUnknown(true) }
  }
  const revocable = ['ready', 'awaiting-approval', 'deciding', 'running'].includes(view.phase)
  return <section aria-label={copy.title} style={{ boxSizing: 'border-box', maxWidth: '100%', padding: 16, border: '1px solid', borderRadius: 8, overflowWrap: 'anywhere' }}>
    <h3>{copy.title}</h3>
    <p>{view.review.workspaceLabel} · {view.review.model} · {view.review.effort}</p>
    <p role="status" aria-live="polite">{copy.phases[view.phase]}</p>
    <h4>{copy.task}</h4><p style={{ whiteSpace: 'pre-wrap' }}>{view.review.brief}</p>
    <h4>{copy.files}</h4>
    <ul>{view.review.files.map(file => <li key={file.path}><span>{file.path}</span><br /><code>{file.sha256}</code><span> · {file.lines}</span></li>)}</ul>
    <p>{copy.scope}</p>
    <p>{copy.limits.replace('{requests}', String(view.review.maximumRequests)).replace('{seconds}', String(view.review.timeoutMs / 1000))}</p>
    <details><summary>{copy.prompt}</summary><p>{view.review.workerSystemPrompt}</p></details>
    {unknown && <p role="alert">{copy.unknown}</p>}
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {view.phase === 'awaiting-approval' && <>
        <button type="button" disabled={decisionSent || revokeSent} onClick={() => { void decide('allow-once') }}>{copy.allow}</button>
        <button type="button" disabled={decisionSent || revokeSent} onClick={() => { void decide('reject') }}>{copy.reject}</button>
      </>}
      {revocable && <button type="button" disabled={revokeSent} onClick={() => { void revoke() }}>{copy.revoke}</button>}
    </div>
  </section>
}
