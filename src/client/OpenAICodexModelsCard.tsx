/** Account-only Models footer; advanced configuration remains in Plugins. */
import { useId, useState, useSyncExternalStore } from 'react'
import type { OpenAICodexSettingsInjected } from './OpenAICodexSettings.tsx'
import { accountStatusLabel, dotStyle, OpenAICodexSettings } from './OpenAICodexSettings.tsx'

export type OpenAICodexModelsCardInjected = Required<Pick<OpenAICodexSettingsInjected, 't' | 'account'>>

export function OpenAICodexModelsCard({ t, account }: OpenAICodexModelsCardInjected) {
  const [expanded, setExpanded] = useState(false)
  const detailsId = useId()
  const { status } = useSyncExternalStore(account.subscribe, account.getSnapshot)
  const label = accountStatusLabel(status.status, t)
  return <div style={{ border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 12, padding: '12px 14px', color: 'var(--dsw-alias-label-primary)' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ fontSize: 14, lineHeight: '22px', fontWeight: 500 }}>{t('modelsProviderName')}</span>
      <span role="img" aria-label={label} style={{ ...dotStyle(status.status), width: 8, height: 8 }} />
      {!expanded && <span role="status" style={{ fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-label-secondary)', flex: 1 }}>{label}</span>}
      <button type="button" aria-expanded={expanded} aria-controls={detailsId} onClick={() => { setExpanded(!expanded) }}
        style={{ marginLeft: 'auto', flexShrink: 0, padding: '4px 12px', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 999, background: 'transparent', color: 'inherit', font: 'inherit', fontSize: 14, cursor: 'pointer' }}>
        {expanded ? t('collapse') : t('manageAccount')}
      </button>
    </div>
    <div style={{ marginTop: 4, fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-label-secondary)' }}>{t('modelsProviderSupport')}</div>
    {expanded && <div id={detailsId} style={{ borderTop: '1px solid var(--dsw-alias-border-l2)', marginTop: 12, paddingTop: 12 }}>
      <OpenAICodexSettings t={t} account={account} accountOnly embedded />
    </div>}
  </div>
}
