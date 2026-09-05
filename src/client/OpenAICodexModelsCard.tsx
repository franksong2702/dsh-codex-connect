/** Compact Models account entry with quota disclosure and shared configuration. */
import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'
import type { CSSProperties } from 'react'
import type { OpenAICodexSettingsInjected } from './OpenAICodexSettings.tsx'
import { AccountFeedback, AccountManager, accountStatusLabel, dotStyle, UsageLimits } from './OpenAICodexSettings.tsx'
import { OpenAICodexConfiguration } from './OpenAICodexConfiguration.tsx'

export type OpenAICodexModelsCardInjected = Required<Pick<OpenAICodexSettingsInjected, 't' | 'account'>>
  & Pick<Partial<OpenAICodexSettingsInjected>, 'configScope'>

const buttonStyle: CSSProperties = { padding: '6px 14px', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 999, background: 'transparent', color: 'inherit', font: 'inherit', fontSize: 14, cursor: 'pointer' }
const secondaryStyle: CSSProperties = { fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-label-secondary)' }

/** Native modality contains keyboard focus and restores it to More settings on close. */
function ConfigurationDialog({ t, configScope, onClose }: Pick<OpenAICodexModelsCardInjected, 't' | 'configScope'> & { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => { element?.close() }
  }, [])
  const close = (): void => {
    dialog.current?.close()
    onClose()
  }
  return <dialog ref={dialog} aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); close() }}
    onKeyDown={event => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        event.preventDefault()
        close()
        return
      }
      if (event.key !== 'Tab') return
      const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href], summary'))
        .filter(element => element.getClientRects().length > 0)
      const first = focusable[0]
      const last = focusable.at(-1)
      if (first === undefined || last === undefined) return
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }}
    style={{ boxSizing: 'border-box', width: 'min(720px, calc(100vw - 32px))', maxHeight: 'calc(100dvh - 32px)', overflowY: 'auto', padding: 20, border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 12, background: 'var(--dsw-alias-bg-layer-1, white)', color: 'var(--dsw-alias-label-primary)', margin: 'auto' }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <h2 id={titleId} style={{ margin: 0, fontSize: 18 }}>{t('moreSettingsTitle')}</h2>
      <button type="button" style={buttonStyle} onClick={close}>{t('closeSettings')}</button>
    </div>
    <p style={secondaryStyle}>{t('settingsSaveHint')}</p>
    <OpenAICodexConfiguration
      t={t}
      {...configScope === undefined ? {} : { scope: configScope }}
    />
  </dialog>
}

export function OpenAICodexModelsCard({ t, account, configScope }: OpenAICodexModelsCardInjected) {
  const [expanded, setExpanded] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const detailsId = useId()
  const snapshot = useSyncExternalStore(account.subscribe, account.getSnapshot)
  const { status } = snapshot
  const label = accountStatusLabel(status.status, t)
  useEffect(() => { if (status.status !== 'signed-in') setExpanded(false) }, [status.status])
  return <div style={{ border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 12, padding: '12px 14px', color: 'var(--dsw-alias-label-primary)' }}>
    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
      <span style={{ fontSize: 14, lineHeight: '22px', fontWeight: 500 }}>{t('modelsProviderName')}</span>
      <span aria-hidden="true" style={{ ...dotStyle(status.status), width: 8, height: 8 }} />
      <span role="status" style={{ ...secondaryStyle, flex: 1 }}>{label}</span>
    </div>
    <div style={{ ...secondaryStyle, marginTop: 4 }}>{t('modelsProviderSupport')}</div>
    <div style={{ marginTop: 12 }}>
      <AccountManager t={t} store={account} snapshot={snapshot} compact quotaExpanded={expanded} quotaControlsId={detailsId} onToggleQuota={() => { setExpanded(!expanded) }} />
    </div>
    <AccountFeedback t={t} snapshot={snapshot} />
    {expanded && status.status === 'signed-in' && <div id={detailsId} style={{ borderTop: '1px solid var(--dsw-alias-border-l2)', marginTop: 12, paddingTop: 12 }}>
      <UsageLimits t={t} usage={status.usage} heading={false} {...status.quotaError === undefined ? {} : { quotaError: status.quotaError }} />
    </div>}
    <div style={{ ...secondaryStyle, marginTop: 12 }}>
      <span>{t('modelsAccountHelp')}</span>{' '}
      <button type="button" onClick={() => { setSettingsOpen(true) }} style={{ ...buttonStyle, padding: 0, border: 0, fontSize: 'inherit', textDecoration: 'underline' }}>{t('moreSettings')}</button>
    </div>
    {settingsOpen && <ConfigurationDialog
      t={t}
      {...configScope === undefined ? {} : { configScope }}
      onClose={() => { setSettingsOpen(false) }}
    />}
  </div>
}
