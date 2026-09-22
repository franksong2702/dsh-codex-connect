/** Per-conversation opt-in, not a profile default. Reads reflect host state; mutations never retry. */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { ADAPTIVE_TASK_PATH, ADAPTIVE_TASK_START, ADAPTIVE_TASK_REQUEST_LIMIT, ADAPTIVE_TASK_MAX_REQUESTS,
  decodeTaskState } from '../adaptive-task-contract.ts'
import type { AdaptiveTaskCommand, AdaptiveTaskState } from '../adaptive-task-contract.ts'

const words = {
  en: {
    button: 'Model choice', title: 'Models for this task', loading: 'Reading current state…', unavailable: 'Task controls are unavailable. No setting has been changed.',
    intro: 'Start this new conversation with Sol / Medium. It may adjust effort or hand the remaining work to an allowed model without asking each time. Continuing with the same model is also valid.',
    boundary: 'This applies to this conversation only, including follow-up messages until you take over. It grants no new file, command, publishing or subagent permissions. Other settings and conversations stay unchanged.',
    budget: 'Request limit (whole task)', resources: 'This counts reserved Codex requests, including failures. It is not a spending or subscription quota cap. A lost request may still be counted.',
    models: 'Allowed models and effort levels', eligibility: 'Model capability is from the installed adapter. Your account eligibility has not been probed; an unavailable model will not be silently replaced.',
    start: 'Start with these limits', manual: 'Take over manually', stop: 'Stop this task', resume: 'Resume with the same limits', close: 'Close', refresh: 'Read state again',
    active: 'Automatic selection is allowed', off: 'Manual selection; automation is off', stopped: 'Task stopped', interrupted: 'Interrupted; your confirmation is required before continuing', limit: 'Request limit reached',
    current: 'Last recorded request', requested: 'Next requested choice', counter: 'Requests reserved', notStarted: 'No model request yet',
    newOnly: 'Start in an empty new conversation. This does not convert earlier experimental Think history.',
    error: 'The operation did not return a confirmed result. Read state again before trying another action.',
    stopping: 'Stopping; cleanup has not yet been confirmed', busy: 'Applying…',
  },
  zh: {
    button: '模型选择', title: '这项任务怎么选模型', loading: '正在读取当前状态…', unavailable: '当前环境暂不可用，未更改任何设置。',
    intro: '这段新会话从 Sol / Medium 开始。它可以在你允许的模型与档位中自行调整，或交给另一模型继续，不必每次询问；也可以一直自己做完。',
    boundary: '仅作用于这段会话，后续消息继续计入，直到你切回手动。不会新增文件、命令、发布或子任务权限，也不会改动其他功能或会话。',
    budget: '整项任务的请求上限', resources: '统计已预留的 Codex 请求，包含失败请求；不是金额或订阅额度上限。结果未知的请求也可能占用次数。',
    models: '允许使用的模型与档位', eligibility: '能力来自已安装的适配器，尚未探测你的账户资格。模型不可用时会报明原因，不会偷偷换成其他模型。',
    start: '按这些范围开始', manual: '切回手动', stop: '停止这项任务', resume: '按原范围继续', close: '关闭', refresh: '重新读取状态',
    active: '已允许系统自行选模型', off: '手动选择，尚未开启自动安排', stopped: '任务已停止', interrupted: '任务已中断，确认后才能继续', limit: '已达到请求上限',
    current: '上次记录的请求', requested: '下次请求的选择', counter: '已预留请求', notStarted: '尚未发起模型请求',
    newOnly: '请在空白的新会话中开始。本入口不会转换已有的实验性 Think 历史。',
    error: '没有收到可确认的操作结果。请先重新读取状态，再决定下一步。',
    stopping: '正在停止，尚未确认清理完成', busy: '正在应用…',
  },
}
const buttonStyle: CSSProperties = { minHeight: 36, padding: '5px 10px', borderRadius: 8,
  border: '1px solid var(--dsw-alias-border-l2)', background: 'var(--dsw-alias-bg-layer-1)', color: 'inherit', cursor: 'pointer' }
const format = (value: { model: string; effort: string }) => `${value.model.replace('gpt-5.6-', '').replace('gpt-6-', '')} / ${value.effort}`
export function AdaptiveTaskControl({ sessionId, language = 'en' }: { sessionId: string; language?: string }) {
  const text = words[language === 'zh' ? 'zh' : 'en']
  const [opened, setOpened] = useState(false)
  const [state, setState] = useState<AdaptiveTaskState>()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const [models, setModels] = useState<readonly string[]>([])
  const [maximum, setMaximum] = useState(ADAPTIVE_TASK_REQUEST_LIMIT)
  const controller = useRef<AbortController>()
  const generation = useRef(0)
  const mutation = useRef<number>()
  const dialog = useRef<HTMLDialogElement>(null)
  const opener = useRef<HTMLButtonElement>(null)
  const read = useCallback(async () => {
    if (mutation.current !== undefined) return
    const token = ++generation.current
    controller.current?.abort()
    const operation = new AbortController(); controller.current = operation
    setBusy(true)
    const timer = setTimeout(() => operation.abort(), 15_000)
    try {
      const response = await fetch(`${ADAPTIVE_TASK_PATH}?sessionId=${encodeURIComponent(sessionId)}`, {
        credentials: 'same-origin', signal: operation.signal, headers: { accept: 'application/json' },
      })
      const decoded = response.ok ? decodeTaskState(await response.json()) : undefined
      if (decoded === undefined) throw new Error('Invalid task state')
      if (token !== generation.current || operation.signal.aborted) return
      setState(decoded); setFailed(false)
      setModels(previous => previous.length ? previous : decoded.capabilities.map(model => model.model))
    } catch {
      if (token === generation.current) { setFailed(true); setState(undefined) }
    } finally {
      clearTimeout(timer)
      if (token === generation.current) setBusy(false)
    }
  }, [sessionId])
  useEffect(() => {
    generation.current++; controller.current?.abort()
    mutation.current = undefined
    setState(undefined); setModels([]); setMaximum(ADAPTIVE_TASK_REQUEST_LIMIT); setFailed(false)
    setOpened(false); setBusy(false)
    return () => { generation.current++; controller.current?.abort() }
  }, [sessionId])
  useEffect(() => {
    if (!opened) return
    dialog.current?.showModal()
    void read()
    // Read-only refresh on focus; no hidden-page or indefinite quota polling.
    const refresh = () => { if (document.visibilityState === 'visible') void read() }
    window.addEventListener('focus', refresh)
    return () => { window.removeEventListener('focus', refresh); dialog.current?.close() }
  }, [opened, read])
  const close = () => { setOpened(false); opener.current?.focus() }
  const mutate = async (action: AdaptiveTaskCommand['action']) => {
    if (state === undefined || busy || failed || mutation.current !== undefined) return
    const token = ++generation.current
    mutation.current = token
    controller.current?.abort()
    const operation = new AbortController(); controller.current = operation
    const command: AdaptiveTaskCommand = { sessionId, action, operationId: crypto.randomUUID(), revision: state.revision,
      ...(action === 'start' ? { models, maximumRequests: maximum } : {}) }
    setBusy(true); setFailed(false)
    const timer = setTimeout(() => operation.abort(), 20_000)
    try {
      const response = await fetch(ADAPTIVE_TASK_PATH, { method: 'POST', credentials: 'same-origin',
        signal: operation.signal, headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(command) })
      const decoded = response.ok ? decodeTaskState(await response.json()) : undefined
      if (decoded === undefined) throw new Error('Task result unconfirmed')
      if (token === generation.current && !operation.signal.aborted) setState(decoded)
    } catch {
      if (token === generation.current) setFailed(true)
    } finally {
      clearTimeout(timer)
      if (mutation.current === token) mutation.current = undefined
      if (token === generation.current) setBusy(false)
    }
  }
  const label = state?.unavailable === 'TASK_STOPPING' ? text.stopping : state?.mode === 'auto' ? text.active
    : state?.mode === 'interrupted' ? text.interrupted : state?.mode === 'stopped' ? text.stopped
      : state?.mode === 'limit' ? text.limit : text.off
  return <>
    <button ref={opener} type="button" style={buttonStyle} onClick={() => {
      // A reopened panel must not briefly offer stale actions before its fresh host read.
      setState(undefined); setFailed(false); setBusy(true); setOpened(true)
    }}>{text.button}</button>
    {opened ? <dialog ref={dialog} aria-label={text.title} onCancel={event => { event.preventDefault(); close() }}
      style={{ maxWidth: 560, width: 'calc(100vw - 40px)', boxSizing: 'border-box', maxHeight: '90vh', overflow: 'auto',
        padding: 20, borderRadius: 12, border: '1px solid var(--dsw-alias-border-l2)',
        color: 'var(--dsw-alias-label-primary)', background: 'var(--dsw-alias-bg-layer-1)' }}>
      <h2 style={{ fontSize: 18, marginTop: 0 }}>{text.title}</h2>
      <p role="status">{busy ? text.busy : label}</p>
      {failed ? <p role="alert">{state === undefined ? text.unavailable : text.error}</p> : null}
      {state !== undefined ? <>
        <p>{text.current}: {state.current ? format(state.current) : text.notStarted}<br />
          {state.requested ? <>{text.requested}: {format(state.requested)}<br /></> : null}
          {text.counter}: {state.reserved} / {state.maximumRequests}</p>
        {state.mode === 'off' ? <>
          <p>{text.intro}</p><p>{text.boundary}</p>
          {!state.canStart ? <p>{text.newOnly}</p> : null}
          <details><summary>{text.models}</summary>
            {state.capabilities.map(model => <label key={model.model} style={{ display: 'block', paddingBlock: 6 }}>
              <input type="checkbox" checked={models.includes(model.model)} disabled={busy || model.model === ADAPTIVE_TASK_START.model}
                onChange={event => setModels(value => event.target.checked ? [...value, model.model] : value.filter(id => id !== model.model))} />
              {model.model}: {model.efforts.join(', ')}
            </label>)}
            <label style={{ display: 'block', paddingBlock: 10 }}>{text.budget}
              <input aria-label={text.budget} type="number" min={1} max={ADAPTIVE_TASK_MAX_REQUESTS} value={maximum}
                disabled={busy} onChange={event => setMaximum(Number(event.target.value))} style={{ width: 80, marginInlineStart: 12 }} />
            </label>
            <p>{text.eligibility}</p>
          </details>
        </> : null}
        <p style={{ fontSize: 12 }}>{text.resources}</p>
      </> : busy ? <p>{text.loading}</p> : null}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {state?.mode === 'off' ? <button style={buttonStyle} type="button"
          disabled={busy || failed || !state.canStart || !Number.isSafeInteger(maximum) || maximum < 1 || maximum > ADAPTIVE_TASK_MAX_REQUESTS}
          onClick={() => { void mutate('start') }}>{text.start}</button> : null}
        {state?.mode === 'interrupted' ? <button style={buttonStyle} type="button" disabled={busy || failed}
          onClick={() => { void mutate('resume') }}>{text.resume}</button> : null}
        {state !== undefined && state.mode !== 'off' && state.mode !== 'manual' ? <button style={buttonStyle} type="button" disabled={busy || failed}
          onClick={() => { void mutate('manual') }}>{text.manual}</button> : null}
        {state?.mode === 'auto' ? <button style={buttonStyle} type="button" disabled={busy || failed}
          onClick={() => { void mutate('stop') }}>{text.stop}</button> : null}
        <button style={buttonStyle} type="button" disabled={busy} onClick={() => { void read() }}>{text.refresh}</button>
        <button style={buttonStyle} type="button" onClick={close}>{text.close}</button>
      </div>
    </dialog> : null}
  </>
}
