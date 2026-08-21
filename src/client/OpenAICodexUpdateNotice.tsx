/** Global and settings-page presentation for a Codex Connect update. */

import { useState, useSyncExternalStore } from 'react'
import type { CSSProperties } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { OpenAICodexSettingsKey } from './locales.ts'
import { OPENAI_CODEX_UPGRADE_COMMAND, OpenAICodexUpdateStore } from './update-store.ts'

export interface OpenAICodexUpdateNoticeInjected {
  updater: OpenAICodexUpdateStore
}

export type OpenAICodexUpdateOverlayProps =
  PropsRuntime<'shell.overlay'>
  & { t: OpenAICodexUpdateTranslation }
  & OpenAICodexUpdateNoticeInjected

export type OpenAICodexUpdateSettingsProps =
  { t: OpenAICodexUpdateTranslation }
  & OpenAICodexUpdateNoticeInjected

const panelStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  padding: '13px 15px',
  border: '1px solid var(--dsw-alias-border-l2)',
  borderRadius: 12,
  background: 'var(--dsw-alias-bg-module-platform)',
  color: 'var(--dsw-alias-label-primary)',
}
const overlayStyle: CSSProperties = {
  position: 'absolute',
  top: 16,
  right: 20,
  zIndex: 30,
  width: 'min(420px, calc(100vw - 40px))',
  boxSizing: 'border-box',
  boxShadow: '0 8px 28px rgba(0, 0, 0, 0.16)',
}
const rowStyle: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }
const titleStyle: CSSProperties = { margin: 0, fontSize: 14, lineHeight: '20px', fontWeight: 600 }
const bodyStyle: CSSProperties = { margin: 0, color: 'var(--dsw-alias-label-secondary)', fontSize: 13, lineHeight: '20px' }
const actionStyle: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }
const buttonStyle: CSSProperties = { minHeight: 30, padding: '4px 11px', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 7, background: 'var(--dsw-alias-bg-layer-1)', color: 'var(--dsw-alias-label-primary)', font: 'inherit', fontSize: 12, cursor: 'pointer' }
const primaryButtonStyle: CSSProperties = { ...buttonStyle, borderColor: 'var(--dsw-alias-brand-primary)', background: 'var(--dsw-alias-brand-primary)', color: 'white' }
const notesStyle: CSSProperties = { maxHeight: 220, overflowY: 'auto', margin: 0, padding: '9px 10px', borderRadius: 7, background: 'var(--dsw-alias-bg-layer-2, rgba(0, 0, 0, 0.06))', color: 'var(--dsw-alias-label-secondary)', fontSize: 12, lineHeight: '19px', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }

async function copyUpgradeCommand(): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText === undefined) return false
    await navigator.clipboard.writeText(OPENAI_CODEX_UPGRADE_COMMAND)
    return true
  } catch {
    return false
  }
}

function UpdateContents({ updater, t, overlay }: OpenAICodexUpdateNoticeInjected & { t: OpenAICodexUpdateTranslation; overlay: boolean }) {
  const snapshot = useSyncExternalStore(updater.subscribe, updater.getSnapshot, updater.getSnapshot)
  const latestVersion = snapshot.latestVersion
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [copyFailed, setCopyFailed] = useState(false)

  if (overlay && (snapshot.status !== 'update-available' || latestVersion === undefined || snapshot.dismissedVersion === latestVersion)) return null
  const available = snapshot.status === 'update-available'
  const details = available && detailsOpen
  const copy = async (): Promise<void> => {
    setCopyFailed(false)
    const ok = await copyUpgradeCommand()
    setCopied(ok)
    setCopyFailed(!ok)
  }

  return (
    <div style={overlay ? { ...panelStyle, ...overlayStyle } : panelStyle} role={overlay ? 'status' : 'region'} aria-label={t('updateHeading')}>
      <div style={rowStyle}>
        <strong style={titleStyle}>{available ? t('newVersionAvailable', { version: snapshot.latestVersion }) : t('updateHeading')}</strong>
        {overlay && available ? (
          <button type="button" style={buttonStyle} aria-label={t('dismissUpdate')} onClick={() => { if (latestVersion !== undefined) updater.dismiss(latestVersion) }}>
            {t('dismissUpdate')}
          </button>
        ) : null}
      </div>
      {snapshot.status === 'idle' || snapshot.status === 'checking'
        ? <p style={bodyStyle}>{t('checkingForUpdates')}</p>
        : snapshot.status === 'up-to-date'
          ? <p style={bodyStyle}>{t('upToDate', { version: snapshot.currentVersion })}</p>
          : snapshot.status === 'unavailable'
            ? <p style={bodyStyle}>{t('updateCheckUnavailable')}</p>
            : <>
                {snapshot.releaseName === undefined ? null : <p style={bodyStyle}>{snapshot.releaseName}</p>}
                {details ? (
                  snapshot.releaseNotes === undefined
                    ? <p style={bodyStyle}>{t('releaseNotesUnavailable')}</p>
                    : <p style={notesStyle}>{snapshot.releaseNotes}</p>
                ) : null}
                <div style={actionStyle}>
                  <button type="button" style={primaryButtonStyle} onClick={() => { setDetailsOpen(!detailsOpen) }}>
                    {details ? t('hideReleaseNotes') : t('viewReleaseNotes')}
                  </button>
                  <button type="button" style={buttonStyle} onClick={() => { void copy() }}>
                    {copied ? t('upgradeCommandCopied') : t('copyUpgradeCommand')}
                  </button>
                  {snapshot.releaseUrl === undefined ? null : (
                    <a href={snapshot.releaseUrl} target="_blank" rel="noopener noreferrer" style={{ ...buttonStyle, textDecoration: 'none' }}>
                      {t('openReleasePage')}
                    </a>
                  )}
                </div>
                <p style={bodyStyle}>{t('upgradeCommandHelp')}</p>
                <code style={notesStyle}>{OPENAI_CODEX_UPGRADE_COMMAND}</code>
                {copyFailed ? <p style={bodyStyle}>{t('upgradeCommandCopyFailed')}</p> : null}
              </>}
      {!overlay ? (
        <div style={rowStyle}>
          <span style={bodyStyle}>{t('currentVersion', { version: snapshot.currentVersion })}</span>
          <button type="button" style={buttonStyle} disabled={snapshot.status === 'checking'} onClick={() => { void updater.refresh(true) }}>
            {snapshot.status === 'checking' ? t('checkingForUpdates') : t('checkForUpdates')}
          </button>
        </div>
      ) : null}
    </div>
  )
}

/** Persistent frame-wide update reminder registered in DSH's shell.overlay slot. */
export function OpenAICodexUpdateOverlay(props: OpenAICodexUpdateOverlayProps) {
  return <UpdateContents {...props} overlay />
}

/** Settings-page update information and manual check controls. */
export function OpenAICodexUpdateSettings(props: OpenAICodexUpdateSettingsProps) {
  return <UpdateContents {...props} overlay={false} />
}

export type OpenAICodexUpdateTranslation = (key: OpenAICodexSettingsKey, params?: Record<string, unknown>) => string
