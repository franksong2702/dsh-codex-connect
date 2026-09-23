/** Optional section of the existing task dialog; hidden unless the host advertises v2 control. */
import { useState } from 'react'
import type { AdaptiveTaskCommand, AdaptiveTaskState } from '../adaptive-task-contract.ts'

export type DelegationFields = Pick<AdaptiveTaskCommand, 'files' | 'routes' | 'maxChildRequests' | 'timeoutMs' | 'disclose'>
export function TaskDelegationConsent({ state, zh, disabled, mutate }: {
  state: AdaptiveTaskState; zh: boolean; disabled: boolean
  mutate(action: AdaptiveTaskCommand['action'], extra?: DelegationFields): void
}) {
  const [files, setFiles] = useState(''), [choices, setChoices] = useState<string[]>([])
  const [requests, setRequests] = useState(6), [seconds, setSeconds] = useState(90), [disclose, setDisclose] = useState(false)
  const d = state.delegation
  if (d === undefined) return null
  const text = (en: string, cn: string) => zh ? cn : en
  const status = (value: string) => zh ? ({ prepared: '已准备', running: '运行中', settling: '正在收尾',
    succeeded: '已完成', failed: '失败', cancelled: '已取消', interrupted: '已中断', pending: '待确认',
    verified: '已确认', none: '尚无结果', recorded: '已写入会话', unknown: '未知' } as Record<string, string>)[value] ?? value : value
  const routes = state.capabilities.flatMap(model => model.efforts.map(effort => ({ model: model.model, effort })))
  const selected = routes.filter(route => choices.includes(`${route.model}/${route.effort}`))
  const paths = files.split('\n').map(path => path.trim()).filter(Boolean)
  const canSave = !disabled && d.idle && ['auto', 'interrupted'].includes(state.mode) && disclose && selected.length > 0
    && paths.length > 0 && paths.length <= 32 && new Set(paths).size === paths.length
    && Number.isInteger(requests) && requests >= 1 && requests <= 6 && Number.isInteger(seconds) && seconds >= 1 && seconds <= 90
  return <section aria-label={text('Optional read-only helper', '可选只读子任务')}>
    <h3>{text('Optional read-only helper', '可选只读子任务')}</h3>
    <p>{text('Off unless separately authorized. One helper at a time; the parent waits. No edits, shell, web tools or nested delegation. Its requests share the task limit; no cost or quality benefit is promised.',
      '未单独授权就不会开启。一次只运行一个子任务，主任务等待；不能修改文件、执行命令、使用网络工具或继续委派。请求共用整项任务上限，不保证更省或更好。')}</p>
    {d.version === 1 ? <>
      <p>{text('Prepare this idle task for optional delegation. Spent requests stay counted; the task pauses and requires explicit resume. This does not grant a helper access to files.',
        '准备迁移这项空闲任务：已用次数保留，迁移后暂停并等待明确恢复。这一步不会授权子任务读取文件。')}</p>
      <button type="button" disabled={disabled || !d.idle} onClick={() => mutate('upgrade')}>
        {text('Prepare task upgrade', '准备任务升级')}</button>
    </> : <>
      <p>{d.enabled ? text('Read-only delegation is authorized for:', '已授权只读委派范围：') : text('No delegation permission', '尚未授予委派权限')}</p>
      {d.enabled ? <div style={{ overflowWrap: 'anywhere' }}>
        <p>{d.routes.map(route => `${route.model} / ${route.effort}`).join(', ')}</p>
        <ul>{d.files.map(file => <li key={file}>{file}</li>)}</ul>
        <p>{text('Per helper:', '每个子任务：')} {d.maxRequests} {text('requests,', '次请求，')} {d.timeoutMs / 1000} {text('seconds', '秒')}</p>
      </div> : null}
      <details>
        <summary>{text('Set explicit helper scope', '设置明确的子任务范围')}</summary>
        <fieldset disabled={disabled || !d.idle}>
          <legend>{text('Allowed child models and effort levels', '允许的子模型与档位')}</legend>
          {routes.map(route => { const key = `${route.model}/${route.effort}`; return <label key={key} style={{ display: 'block', overflowWrap: 'anywhere' }}>
            <input type="checkbox" aria-label={`Child ${route.model} / ${route.effort}`} checked={choices.includes(key)}
              onChange={event => setChoices(value => event.target.checked ? [...value, key] : value.filter(item => item !== key))} />
            {route.model} / {route.effort}
          </label> })}
          <label style={{ display: 'block' }}>{text('Approved text files (workspace-relative, one per line)', '批准的文本文件（相对工作目录，每行一个）')}
            <textarea rows={3} value={files} onChange={event => setFiles(event.target.value)} style={{ display: 'block', width: '100%', boxSizing: 'border-box' }} />
          </label>
          <label style={{ display: 'block' }}>{text('Requests per helper', '每个子任务的请求上限')}
            <input type="number" min={1} max={6} value={requests} onChange={event => setRequests(Number(event.target.value))} style={{ width: 60 }} />
          </label>
          <label style={{ display: 'block' }}>{text('Timeout in seconds', '超时秒数')}
            <input type="number" min={1} max={90} value={seconds} onChange={event => setSeconds(Number(event.target.value))} style={{ width: 60 }} />
          </label>
          <label style={{ display: 'block' }}><input type="checkbox" checked={disclose} onChange={event => setDisclose(event.target.checked)} />
            {text('I reviewed these files and allow their contents to be sent to the selected models. Filename filters cannot guarantee that text is free of secrets.',
              '我已检查这些文件，同意将内容发送给所选模型。文件名过滤不能保证文本中没有秘密。')}</label>
        </fieldset>
        <button type="button" disabled={!canSave} onClick={() => mutate('delegate-enable', {
          files: paths, routes: selected, maxChildRequests: requests, timeoutMs: seconds * 1000, disclose: true,
        })}>{text('Authorize exactly this scope', '仅授权这些范围')}</button>
      </details>
      <p>{text('Stop and manual takeover also cancel the helper. Scope changes require an idle task. Unknown delivery or unverified cleanup blocks further delegation and downgrade.',
        '停止与手动接管也会取消子任务。修改范围需要任务空闲；送达未知或清理未确认时，不能继续委派或降级。')}</p>
      {d.runs.length ? <ul aria-label={text('Child outcomes', '子任务状态')}>
        {d.runs.map((run, index) => <li key={run.id} style={{ overflowWrap: 'anywhere' }}>
          #{index + 1}: {status(run.state)} · {text('cleanup', '清理')} {status(run.cleanup)} · {text('delivery', '送达')} {status(run.delivery)} · {run.reserved} {text('requests', '次请求')}
        </li>)}
      </ul> : null}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button type="button" disabled={disabled || !d.idle || !d.enabled} onClick={() => mutate('delegate-disable')}>
          {text('Remove helper permission', '撤销子任务权限')}</button>
        <button type="button" disabled={disabled || !d.canDowngrade} onClick={() => mutate('downgrade')}>
          {text('Archive and return to Phase 1 manual', '留档并退回 Phase 1 手动模式')}</button>
      </div>
      <p>{text('Downgrade requires manual mode, removed helper permission and confirmed child delivery/cleanup. History and spent requests are retained; nothing is deleted or refunded.',
        '降级要求先切回手动、撤销子任务权限，并确认结果送达和清理。历史与已用次数保留，不删除，也不退回次数。')}</p>
    </>}
  </section>
}
