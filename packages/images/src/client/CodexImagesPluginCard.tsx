import { useEffect, useState, useSyncExternalStore } from 'react'
import type { CSSProperties } from 'react'
import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import type { PropsRuntime, Translate } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import type { ImagesLocaleKey } from './locales.ts'
import type { ImagesSettingsConfig } from './settings-contract.ts'

const AUTH_STATUS_PATH = '/plugins/dsh-openai-codex/auth/status'

export interface CodexImagesPluginCardInjected {
  t: Translate<ImagesLocaleKey>
  settings: SettingsScope<ImagesSettingsConfig>
}

export type CodexImagesPluginCardProps = PropsRuntime<'settings.plugin.item'> & CodexImagesPluginCardInjected

type AuthState = 'loading' | 'signed-in' | 'signed-out' | 'reauth-required' | 'unknown'

const card: CSSProperties = { overflow: 'hidden', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 10, background: 'var(--dsw-alias-bg-module-platform)' }
const header: CSSProperties = { boxSizing: 'border-box', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, border: 0, padding: '13px 14px', background: 'transparent', color: 'var(--dsw-alias-label-primary)', font: 'inherit', textAlign: 'left', cursor: 'pointer' }
const body: CSSProperties = { display: 'grid', gap: 14, borderTop: '1px solid var(--dsw-alias-border-l2)', padding: '16px 14px 18px', color: 'var(--dsw-alias-label-primary)', fontSize: 13, lineHeight: '18px' }
const row: CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }
const muted: CSSProperties = { color: 'var(--dsw-alias-label-tertiary)' }
const warning: CSSProperties = { padding: 10, borderRadius: 8, background: 'var(--dsw-alias-bg-base)', color: 'var(--dsw-alias-label-secondary)' }

function Chevron({ open }: { open: boolean }) {
  return <span aria-hidden="true" style={{ color: 'var(--dsw-alias-label-tertiary)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 160ms ease' }}>
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M11.8486 5.5L11.4238 5.92383L8.69727 8.65137C8.44157 8.90706 8.21562 9.13382 8.01172 9.29785C7.79912 9.46883 7.55595 9.61756 7.25 9.66602C7.08435 9.69222 6.91565 9.69222 6.75 9.66602C6.44405 9.61756 6.20088 9.46883 5.98828 9.29785C5.78438 9.13382 5.55843 8.90706 5.30273 8.65137L2.57617 5.92383L2.15137 5.5L3 4.65137L3.42383 5.07617L6.15137 7.80273C6.42595 8.07732 6.59876 8.24849 6.74023 8.3623C6.87291 8.46904 6.92272 8.47813 6.9375 8.48047C6.97895 8.48703 7.02105 8.48703 7.0625 8.48047C7.07728 8.47813 7.12709 8.46904 7.25977 8.3623C7.40124 8.24849 7.57405 8.07732 7.84863 7.80273L10.5762 5.07617L11 4.65137L11.8486 5.5Z" fill="currentColor" /></svg>
  </span>
}

function authLabel(t: Translate<ImagesLocaleKey>, auth: AuthState): string {
  if (auth === 'signed-in') return t('signedIn')
  if (auth === 'signed-out') return t('signedOut')
  if (auth === 'reauth-required') return t('reauth')
  return t('authUnknown')
}

export function CodexImagesPluginCard({ t, settings }: CodexImagesPluginCardProps) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [saveError, setSaveError] = useState(false)
  const [auth, setAuth] = useState<AuthState>('loading')
  const snapshot = useSyncExternalStore(settings.subscribe, settings.getSnapshot, settings.getSnapshot)
  const enabled = snapshot.value?.enabled === true

  useEffect(() => {
    const controller = new AbortController()
    void fetch(AUTH_STATUS_PATH, { credentials: 'same-origin', headers: { accept: 'application/json' }, signal: controller.signal })
      .then(async response => response.ok ? response.json() as Promise<{ status?: unknown }> : undefined)
      .then(value => {
        const status = value?.status
        setAuth(status === 'signed-in' || status === 'signed-out' || status === 'reauth-required' ? status : 'unknown')
      })
      .catch(error => { if (!(error instanceof DOMException && error.name === 'AbortError')) setAuth('unknown') })
    return () => { controller.abort() }
  }, [])

  async function toggle(): Promise<void> {
    if (!snapshot.writable || snapshot.status !== 'ready' || busy) return
    setBusy(true)
    setSaveError(false)
    try { await settings.set('enabled', !enabled) } catch { setSaveError(true) } finally { setBusy(false) }
  }

  const title = t('title')
  return <li style={card}>
    <button type="button" style={header} aria-expanded={open} aria-label={`${t(open ? 'collapse' : 'expand')}: ${title}`} onClick={() => { setOpen(!open) }}>
      <span style={{ display: 'flex', minWidth: 0, flexDirection: 'column', gap: 3 }}><strong style={{ fontSize: 14, lineHeight: '20px' }}>{title}</strong><span style={muted}>{t('intro')}</span></span>
      <Chevron open={open} />
    </button>
    {open ? <div style={body}>
      <label style={row}><span><strong>{t('enabled')}</strong><br /><span style={muted}>{t('enabledHelp')}</span></span><input type="checkbox" aria-label={t('enabled')} checked={enabled} disabled={!snapshot.writable || snapshot.status !== 'ready' || busy} onChange={() => { void toggle() }} /></label>
      {saveError ? <span role="alert">{t('saveFailed')}</span> : null}
      <div style={row}><strong>{t('status')}</strong><span>{snapshot.status !== 'ready' ? t('unavailable') : enabled ? t('ready') : t('disabled')}</span></div>
      <div style={row}><strong>{t('authorization')}</strong><span>{authLabel(t, auth)}</span></div>
      <div style={muted}>{t('authManaged')}</div>
      <div><strong>{t('compatibility')}</strong><br /><span style={muted}>{t('compatibilityValue')}</span></div>
      <div><strong>{t('behavior')}</strong><br /><span style={muted}>{t('behaviorValue')}</span></div>
      <div>{t('disclosure')}</div>
      <div style={warning}>{t('quotaWarning')}</div>
      <div style={warning}>{t('alphaWarning')}</div>
    </div> : null}
  </li>
}
