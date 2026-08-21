/** Global and settings-page presentation for a Codex Connect update. */

import { useState, useSyncExternalStore } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { OpenAICodexUpdateHighlightKind } from '../update.ts'
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
const versionSummaryStyle: CSSProperties = { margin: 0, color: 'var(--dsw-alias-label-secondary)', fontSize: 13, lineHeight: '20px' }
const sectionStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 8 }
const actionStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }
const linkRowStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }
const buttonStyle: CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box', minHeight: 32, padding: '4px 11px', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 7, background: 'var(--dsw-alias-bg-layer-1)', color: 'var(--dsw-alias-label-primary)', font: 'inherit', fontSize: 12, lineHeight: '20px', whiteSpace: 'nowrap', cursor: 'pointer' }
const primaryButtonStyle: CSSProperties = { ...buttonStyle, borderColor: 'var(--dsw-alias-brand-primary)', background: 'var(--dsw-alias-brand-primary)', color: 'white' }
const textButtonStyle: CSSProperties = { border: 0, padding: 0, background: 'transparent', color: 'var(--dsw-alias-brand-primary)', font: 'inherit', fontSize: 12, lineHeight: '20px', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 2 }
const notesStyle: CSSProperties = { maxHeight: 220, overflowY: 'auto', margin: 0, padding: '9px 10px', borderRadius: 7, background: 'var(--dsw-alias-bg-layer-2, rgba(0, 0, 0, 0.06))', color: 'var(--dsw-alias-label-secondary)', fontSize: 12, lineHeight: '19px', overflowWrap: 'anywhere' }
const commandRowStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px 7px 10px', borderRadius: 7, background: 'var(--dsw-alias-bg-layer-2, rgba(0, 0, 0, 0.06))' }
const commandTextStyle: CSSProperties = { flex: '1 1 auto', minWidth: 0, margin: 0, padding: 0, background: 'transparent', color: 'var(--dsw-alias-label-primary)', fontSize: 12, lineHeight: '19px', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }
const notesListStyle: CSSProperties = { margin: '4px 0', paddingLeft: 18 }
const notesHeadingStyle: CSSProperties = { margin: '0 0 4px', fontSize: 12, lineHeight: '19px', fontWeight: 600, color: 'var(--dsw-alias-label-primary)' }
const highlightsStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 7, margin: 0, padding: '9px 10px', borderRadius: 7, background: 'var(--dsw-alias-bg-layer-2, rgba(0, 0, 0, 0.04))' }
const stepsStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 3, margin: 0, paddingLeft: 18, color: 'var(--dsw-alias-label-secondary)', fontSize: 12, lineHeight: '18px' }
const statusStyle: CSSProperties = { margin: 0, padding: '7px 9px', borderRadius: 7, background: 'var(--dsw-alias-bg-layer-2, rgba(0, 0, 0, 0.04))', color: 'var(--dsw-alias-label-secondary)', fontSize: 12, lineHeight: '19px' }

const highlightKeys: Record<OpenAICodexUpdateHighlightKind, OpenAICodexSettingsKey> = {
  'trusted-origins': 'updateHighlightTrustedOrigins',
  'runtime-compatibility': 'updateHighlightRuntimeCompatibility',
  'quota-fast-mode': 'updateHighlightQuotaFastMode',
  'dsh-rc7': 'updateHighlightDshRc7',
  'search-stability': 'updateHighlightSearchStability',
  'image-generation': 'updateHighlightImageGeneration',
  'oauth-history': 'updateHighlightOauthHistory',
}

async function copyUpgradeCommand(): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText === undefined) return false
    await navigator.clipboard.writeText(OPENAI_CODEX_UPGRADE_COMMAND)
    return true
  } catch {
    return false
  }
}

function safeReleaseUrl(value: string): string | undefined {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname === 'github.com' ? url.href : undefined
  } catch {
    return undefined
  }
}

function renderInlineMarkdown(text: string, keyPrefix: string, t: OpenAICodexUpdateTranslation): ReactNode[] {
  const tokens = /(?:\*\*[^*]+\*\*|\[[^\]]+\]\(https:\/\/[^)\s]+\)|https:\/\/[^\s<]+)/gu
  const children: ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null
  let tokenIndex = 0
  while ((match = tokens.exec(text)) !== null) {
    if (match.index > lastIndex) children.push(text.slice(lastIndex, match.index))
    const token = match[0]
    const bold = /^\*\*([^*]+)\*\*$/u.exec(token)
    const markdownLink = /^\[([^\]]+)\]\((https:\/\/[^)\s]+)\)$/u.exec(token)
    const bareUrl = /^https:\/\/[^\s<]+$/u.test(token) ? token.replace(/[.,]$/u, '') : undefined
    if (bold !== null) {
      children.push(<strong key={`${keyPrefix}-bold-${tokenIndex}`}>{bold[1] ?? ''}</strong>)
    } else if (markdownLink !== null) {
      const label = markdownLink[1] ?? token
      const href = markdownLink[2] === undefined ? undefined : safeReleaseUrl(markdownLink[2])
      children.push(href === undefined
        ? label
        : <a key={`${keyPrefix}-link-${tokenIndex}`} href={href} target="_blank" rel="noopener noreferrer">{label}</a>)
    } else if (bareUrl !== undefined) {
      const href = safeReleaseUrl(bareUrl)
      children.push(href === undefined
        ? token
        : <a key={`${keyPrefix}-url-${tokenIndex}`} href={href} target="_blank" rel="noopener noreferrer">{t('viewGithubLink')}</a>)
    } else {
      children.push(token)
    }
    lastIndex = match.index + token.length
    tokenIndex += 1
  }
  if (lastIndex < text.length) children.push(text.slice(lastIndex))
  return children
}

function renderReleaseNotes(markdown: string, t: OpenAICodexUpdateTranslation): ReactNode {
  const content: ReactNode[] = []
  let bullets: ReactNode[] = []
  const flushBullets = () => {
    if (bullets.length === 0) return
    content.push(<ul key={`list-${content.length}`} style={notesListStyle}>{bullets}</ul>)
    bullets = []
  }
  markdown.split('\n').forEach((line, index) => {
    const trimmed = line.trim()
    const bullet = /^[-*]\s+(.+)$/u.exec(trimmed)
    const heading = /^#{1,6}\s+(.+)$/u.exec(trimmed)
    const fullChangelog = /^\*\*(Full Changelog|完整变更日志)\*\*:\s*(https:\/\/\S+)$/iu.exec(trimmed)
    if (bullet !== null) {
      bullets.push(<li key={`item-${index}`}>{renderInlineMarkdown(bullet[1] ?? '', `item-${index}`, t)}</li>)
    } else if (heading !== null) {
      flushBullets()
      const headingText = heading[1] ?? ''
      const displayHeading = /^what(?:'s| is)?\s+changed$/iu.test(headingText.trim())
        ? t('technicalDetailsHeading')
        : headingText
      content.push(<h4 key={`heading-${index}`} style={notesHeadingStyle}>{renderInlineMarkdown(displayHeading, `heading-${index}`, t)}</h4>)
    } else if (fullChangelog !== null) {
      flushBullets()
      const href = fullChangelog[2] === undefined ? undefined : safeReleaseUrl(fullChangelog[2])
      content.push(<p key={`changelog-${index}`} style={{ ...bodyStyle, fontSize: 12, lineHeight: '19px' }}>
        {href === undefined ? t('viewFullChangelog') : <a href={href} target="_blank" rel="noopener noreferrer">{t('viewFullChangelog')}</a>}
      </p>)
    } else if (trimmed !== '') {
      flushBullets()
      content.push(<p key={`paragraph-${index}`} style={{ ...bodyStyle, fontSize: 12, lineHeight: '19px' }}>{renderInlineMarkdown(trimmed, `paragraph-${index}`, t)}</p>)
    } else {
      flushBullets()
    }
  })
  flushBullets()
  return <div style={notesStyle}>{content}</div>
}

function UpdateContents({ updater, t, overlay }: OpenAICodexUpdateNoticeInjected & { t: OpenAICodexUpdateTranslation; overlay: boolean }) {
  const snapshot = useSyncExternalStore(updater.subscribe, updater.getSnapshot, updater.getSnapshot)
  const latestVersion = snapshot.latestVersion
  const [technicalDetailsOpen, setTechnicalDetailsOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [copyFailed, setCopyFailed] = useState(false)
  const [recheckRequested, setRecheckRequested] = useState(false)

  if (overlay && (snapshot.status !== 'update-available' || latestVersion === undefined || snapshot.dismissedVersion === latestVersion)) return null
  const available = snapshot.status === 'update-available'
  const technicalDetails = available && technicalDetailsOpen
  const highlights = snapshot.highlights ?? []
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
          ? <>
              <p style={bodyStyle}>{t('upToDate', { version: snapshot.currentVersion })}</p>
              {recheckRequested ? <p style={bodyStyle}>{t('upgradeCheckSuccess', { version: snapshot.currentVersion })}</p> : null}
            </>
          : snapshot.status === 'unavailable'
            ? <p style={bodyStyle}>{t('updateCheckUnavailable')}</p>
            : <>
                <p style={versionSummaryStyle}>{snapshot.versionsBehind === undefined
                  ? t('versionSummaryUnknown', { current: snapshot.currentVersion })
                  : t('versionSummary', { current: snapshot.currentVersion, count: snapshot.versionsBehind })}</p>
                <div style={highlightsStyle}>
                  <strong style={titleStyle}>{t('whatMatters')}</strong>
                  {highlights.length === 0
                    ? <p style={bodyStyle}>{t('noCuratedHighlights')}</p>
                    : highlights.map(highlight => (
                        <div key={`${highlight.version}:${highlight.kind}`}>
                          {highlights.length > 1 ? <strong style={bodyStyle}>{highlight.version}</strong> : null}
                          <p style={bodyStyle}>{t(highlightKeys[highlight.kind])}</p>
                        </div>
                      ))}
                </div>
                <div style={sectionStyle}>
                  <strong style={titleStyle}>{t('upgradeStepsHeading')}</strong>
                  <div style={commandRowStyle}>
                    <code style={commandTextStyle}>{OPENAI_CODEX_UPGRADE_COMMAND}</code>
                    <button type="button" style={buttonStyle} onClick={() => { void copy() }}>
                      {copied ? t('upgradeCommandCopied') : t('copyUpgradeCommand')}
                    </button>
                  </div>
                  <ol style={stepsStyle}>
                    <li>{t('upgradeStepCopy')}</li>
                    <li>{t('upgradeStepRun')}</li>
                    <li>{t('upgradeStepRestart')}</li>
                  </ol>
                  {copyFailed ? <p style={statusStyle}>{t('upgradeCommandCopyFailed')}</p> : null}
                  <div style={actionStyle}>
                    <button type="button" style={primaryButtonStyle} onClick={() => { setRecheckRequested(true); void updater.refresh(true) }}>
                      {t('recheckAfterUpgrade')}
                    </button>
                  </div>
                  {recheckRequested && snapshot.status === 'update-available' ? <p style={statusStyle}>{t('upgradeStillAvailable', { version: snapshot.currentVersion })}</p> : null}
                </div>
                <div style={linkRowStyle}>
                  {snapshot.releaseUrl === undefined ? null : (
                    <a href={snapshot.releaseUrl} target="_blank" rel="noopener noreferrer" style={textButtonStyle}>
                      {t('openReleasePage')}
                    </a>
                  )}
                  <button type="button" style={textButtonStyle} aria-expanded={technicalDetails} onClick={() => { setTechnicalDetailsOpen(!technicalDetailsOpen) }}>
                    {technicalDetails ? t('hideTechnicalDetails') : t('viewTechnicalDetails')}
                  </button>
                </div>
                {technicalDetails ? (
                  snapshot.releaseNotes === undefined
                    ? <p style={bodyStyle}>{t('releaseNotesUnavailable')}</p>
                    : renderReleaseNotes(snapshot.releaseNotes, t)
                ) : null}
              </>}
      {!overlay ? (
        <div style={rowStyle}>
          {snapshot.status !== 'update-available' ? <span style={bodyStyle}>{t('currentVersion', { version: snapshot.currentVersion })}</span> : null}
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
