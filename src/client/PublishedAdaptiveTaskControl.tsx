/** Published entry: no activation UI while paused; existing tasks retain safety exits. */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { ADAPTIVE_TASK_PATH, decodeTaskState } from '../adaptive-task-contract.ts'
import type { AdaptiveTaskState } from '../adaptive-task-contract.ts'
import { ADAPTIVE_TASK_PUBLIC_RELEASE } from '../adaptive-task-publication.ts'
import { AdaptiveTaskControl } from './AdaptiveTaskControl.tsx'

type Props = { sessionId: string; language?: string }
const words = {
  en: {
    button: 'Existing task controls', title: 'Existing task recovery',
    paused: 'Automatic model choice and delegation are temporarily unavailable pending maintainer acceptance. You can stop an existing task or continue manually. Its saved history and request counts are retained.',
    error: 'Task state is unconfirmed. Read it again before taking another action. No operation is automatically retried.',
    busy: 'Reading or applying…', counter: 'Requests reserved', mode: 'Recorded state',
    manual: 'Take over manually', stop: 'Stop this task', refresh: 'Read state again', close: 'Close',
  },
  zh: {
    button: '已有任务控制', title: '已有任务恢复',
    paused: '自动选模型和只读委派暂未开放，等待维护者验收。已有任务可以停止或切回手动，历史记录和请求计数会保留。',
    error: '尚未确认任务状态。请重新读取后再操作；不会自动重试任何操作。',
    busy: '正在读取或应用…', counter: '已预留请求', mode: '已记录状态',
    manual: '切回手动', stop: '停止这项任务', refresh: '重新读取状态', close: '关闭',
  },
}
const buttonStyle: CSSProperties = { minHeight: 36, padding: '5px 10px', borderRadius: 8,
  border: '1px solid var(--dsw-alias-border-l2)', background: 'var(--dsw-alias-bg-layer-1)', color: 'inherit', cursor: 'pointer' }

export function PublishedAdaptiveTaskControl(props: Props) {
  return ADAPTIVE_TASK_PUBLIC_RELEASE
    ? <AdaptiveTaskControl {...props} />
    : <TaskRecoveryControl key={props.sessionId} {...props} />
}

function TaskRecoveryControl({ sessionId, language = 'en' }: Props) {
  const text = words[language === 'zh' ? 'zh' : 'en']
  const [state, setState] = useState<AdaptiveTaskState>()
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [opened, setOpened] = useState(false)
  const generation = useRef(0)
  const working = useRef(false)
  const controller = useRef<AbortController>()
  const dialog = useRef<HTMLDialogElement>(null)
  const opener = useRef<HTMLButtonElement>(null)
  const request = useCallback(async (action?: 'manual' | 'stop', revision?: number) => {
    if (working.current || (action !== undefined && revision === undefined)) return
    working.current = true
    const token = ++generation.current
    const operation = new AbortController()
    controller.current?.abort(); controller.current = operation
    setBusy(true); setFailed(false)
    const timer = setTimeout(() => operation.abort(), 15_000)
    try {
      let decoded: AdaptiveTaskState | undefined
      // Only the read-only live-root readiness error may be retried, at most twice.
      for (let attempt = 0; attempt < (action === undefined ? 3 : 1); attempt++) {
        const response = await fetch(action === undefined
          ? `${ADAPTIVE_TASK_PATH}?sessionId=${encodeURIComponent(sessionId)}` : ADAPTIVE_TASK_PATH, {
          method: action === undefined ? 'GET' : 'POST', credentials: 'same-origin', signal: operation.signal,
          headers: { accept: 'application/json', ...(action === undefined ? {} : { 'content-type': 'application/json' }) },
          ...(action === undefined ? {} : { body: JSON.stringify({ sessionId, action, revision, operationId: crypto.randomUUID() }) }),
        })
        const body: unknown = await response.json()
        if (action === undefined && response.status === 409 && typeof body === 'object' && body !== null
          && 'error' in body && body.error === 'TASK_LIVE_ROOT_REQUIRED' && attempt < 2) {
          await new Promise<void>((resolve, reject) => {
            const abort = () => { clearTimeout(wait); operation.signal.removeEventListener('abort', abort); reject(operation.signal.reason) }
            const wait = setTimeout(() => { operation.signal.removeEventListener('abort', abort); resolve() }, 250 * (attempt + 1))
            operation.signal.addEventListener('abort', abort, { once: true })
            if (operation.signal.aborted) abort()
          })
          continue
        }
        decoded = response.ok ? decodeTaskState(body) : undefined
        break
      }
      if (decoded === undefined) throw new Error('Unconfirmed task state')
      if (token !== generation.current || operation.signal.aborted) return
      setState(decoded)
      if (decoded.mode === 'off') setOpened(false)
    } catch {
      if (token === generation.current) { setState(undefined); setFailed(true) }
    } finally {
      clearTimeout(timer)
      if (token === generation.current) { working.current = false; setBusy(false) }
    }
  }, [sessionId])
  useEffect(() => {
    void request()
    return () => { generation.current++; controller.current?.abort(); working.current = false }
  }, [request])
  useEffect(() => {
    if (opened) dialog.current?.showModal()
    return () => { dialog.current?.close() }
  }, [opened])
  const close = () => { setOpened(false); opener.current?.focus() }
  // A confirmed ordinary conversation has no collaboration entry or selectable options.
  // Unknown state is never represented as confirmed off; retain only a recovery/read path.
  if (state?.mode === 'off' || (state === undefined && !failed && !opened)) return null
  return <>
    <button ref={opener} type="button" style={buttonStyle} onClick={() => { setOpened(true); void request() }}>{text.button}</button>
    {opened ? <dialog ref={dialog} aria-label={text.title} onCancel={event => { event.preventDefault(); close() }}
      style={{ maxWidth: 520, width: 'calc(100vw - 40px)', boxSizing: 'border-box', maxHeight: '90vh', overflow: 'auto',
        padding: 20, borderRadius: 12, border: '1px solid var(--dsw-alias-border-l2)',
        color: 'var(--dsw-alias-label-primary)', background: 'var(--dsw-alias-bg-layer-1)' }}>
      <h2 style={{ fontSize: 18, marginTop: 0 }}>{text.title}</h2>
      <p>{text.paused}</p>
      {busy ? <p role="status">{text.busy}</p> : null}
      {failed ? <p role="alert">{text.error}</p> : null}
      {state !== undefined ? <p>{text.mode}: {state.mode}<br />{text.counter}: {state.reserved} / {state.maximumRequests}</p> : null}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {state !== undefined ? <>
          <button type="button" style={buttonStyle} disabled={busy || failed}
            onClick={() => { void request('manual', state.revision) }}>{text.manual}</button>
          <button type="button" style={buttonStyle} disabled={busy || failed}
            onClick={() => { void request('stop', state.revision) }}>{text.stop}</button>
        </> : null}
        <button type="button" style={buttonStyle} disabled={busy} onClick={() => { void request() }}>{text.refresh}</button>
        <button type="button" style={buttonStyle} onClick={close}>{text.close}</button>
      </div>
    </dialog> : null}
  </>
}
