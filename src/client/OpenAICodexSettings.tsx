/** Plugin-owned OpenAI Codex account controls used inside Plugin configuration. */

import { useCallback, useEffect, useState, useSyncExternalStore, useId } from 'react'
import type { CSSProperties } from 'react'
import type { SettingsScope } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { OpenAICodexUsage } from '../usage.ts'
import type { OpenAICodexSettingsConfig } from '../settings-contract.ts'
import { OpenAICodexAccountStore } from './account-store.ts'
import type { AccountStatus, AccountSnapshot } from './account-store.ts'
import type { OpenAICodexSettingsKey } from './locales.ts'
import { OpenAICodexConfiguration } from './OpenAICodexConfiguration.tsx'
import type { OpenAICodexSettingsModule } from './OpenAICodexConfiguration.tsx'
import { OpenAICodexUpdateSettings } from './OpenAICodexUpdateNotice.tsx'
import type { OpenAICodexUpdateStore } from './update-store.ts'

/** Dependencies injected by the browser plugin entry. */
export interface OpenAICodexSettingsInjected {
  /** Localized page copy. */
  t: (key: OpenAICodexSettingsKey, params?: Record<string, unknown>) => string
  /** Host-owned optional capability settings. */
  configScope: SettingsScope<OpenAICodexSettingsConfig>
  /** Shared browser update state used by the global overlay and this card. */
  updater?: OpenAICodexUpdateStore
  /** Shared across Models and Plugin settings by the browser-plugin owner. */
  account?: OpenAICodexAccountStore
}

/** Props delivered by the settings slot renderer. */
export type OpenAICodexSettingsProps = Partial<OpenAICodexSettingsInjected> & {
  /** Omit the page heading and outer card chrome inside Plugin configuration. */
  embedded?: boolean
  /** Models exposes account controls only; advanced options remain under Plugins. */
  accountOnly?: boolean
}

const pageStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 720 }
const titleStyle: CSSProperties = { margin: 0, fontSize: 20, lineHeight: '28px', fontWeight: 600, color: 'var(--dsw-alias-label-primary)' }
const bodyStyle: CSSProperties = { margin: 0, fontSize: 14, lineHeight: '22px', color: 'var(--dsw-alias-label-secondary)' }
const cardStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 14, padding: '18px 20px', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 12, background: 'var(--dsw-alias-bg-module-platform)' }
const embeddedPageStyle: CSSProperties = { ...pageStyle, gap: 0, maxWidth: 'none' }
const embeddedCardStyle: CSSProperties = { ...cardStyle, padding: 0, border: 0, borderRadius: 0, background: 'transparent' }
const rowStyle: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }
const statusStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 9, fontSize: 15, fontWeight: 500, color: 'var(--dsw-alias-label-primary)' }
const buttonStyle: CSSProperties = { boxSizing: 'border-box', minHeight: 34, padding: '6px 14px', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 18, background: 'var(--dsw-alias-bg-layer-1)', color: 'var(--dsw-alias-label-primary)', font: 'inherit', fontSize: 14, cursor: 'pointer' }
const primaryButtonStyle: CSSProperties = { ...buttonStyle, borderColor: 'var(--dsw-alias-button-primary-fill)', background: 'var(--dsw-alias-button-primary-fill)', color: 'var(--dsw-alias-label-primary-foreground)' }
const errorStyle: CSSProperties = { ...bodyStyle, color: 'var(--dsw-alias-state-error-primary)' }
const quotaListStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 18, paddingTop: 2 }
const quotaGroupStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 10 }
const quotaTitleStyle: CSSProperties = { margin: 0, fontSize: 14, lineHeight: '20px', fontWeight: 600, color: 'var(--dsw-alias-label-primary)' }
const quotaLabelStyle: CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13, lineHeight: '20px', color: 'var(--dsw-alias-label-secondary)' }
const progressTrackStyle: CSSProperties = { height: 8, overflow: 'hidden', borderRadius: 999, background: 'var(--dsw-alias-bg-layer-2, rgba(0, 0, 0, 0.08))' }
const commandStyle: CSSProperties = { margin: 0, padding: '10px 12px', overflowX: 'auto', borderRadius: 8, background: 'var(--dsw-alias-bg-layer-2, rgba(0, 0, 0, 0.06))', color: 'var(--dsw-alias-label-primary)', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 13, lineHeight: '20px', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }
const accountPanelStyle: CSSProperties = { overflow: 'hidden', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 10 }
const accountRowStyle: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, padding: '12px 14px', borderTop: '1px solid var(--dsw-alias-border-l2)' }
const accountIdentityStyle: CSSProperties = { minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }
const accountBadgeStyle: CSSProperties = { display: 'inline-flex', marginLeft: 7, padding: '1px 7px', borderRadius: 999, background: 'var(--dsw-alias-state-success-secondary, rgba(34, 160, 107, 0.12))', color: 'var(--dsw-alias-state-success-primary, #087a41)', fontSize: 11, lineHeight: '18px', fontWeight: 600 }
const dangerButtonStyle: CSSProperties = { ...buttonStyle, color: 'var(--dsw-alias-state-error-primary, #d92d20)' }
const moduleTabsStyle: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8, paddingTop: 2 }
const moduleTabStyle: CSSProperties = { ...buttonStyle, minWidth: 0, minHeight: 54, borderRadius: 10, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', gap: 2, overflowWrap: 'anywhere' }
const activeModuleTabStyle: CSSProperties = { ...moduleTabStyle, border: '1px solid var(--dsw-alias-button-primary-fill)', background: 'var(--dsw-alias-bg-layer-2, var(--dsw-alias-bg-layer-1))' }
const moduleSummaryStyle: CSSProperties = { fontSize: 11, lineHeight: '16px', fontWeight: 400, color: 'var(--dsw-alias-label-secondary)' }
const SETTINGS_MODULES = ['account', 'models', 'network', 'capabilities'] as const satisfies readonly OpenAICodexSettingsModule[]
const UNAVAILABLE_CONFIG_SNAPSHOT = {
  status: 'unavailable' as const, value: undefined, base: undefined, user: undefined,
  revision: undefined, writable: false, mode: 'memory' as const,
}

function progressFillStyle(percent: number): CSSProperties {
  return {
    width: `${Math.max(0, Math.min(100, percent))}%`,
    height: '100%',
    borderRadius: 'inherit',
    background: 'var(--dsw-alias-brand-primary, #1677ff)',
  }
}

function windowLabel(seconds: number, t: OpenAICodexSettingsInjected['t']): string {
  if (seconds === 5 * 60 * 60) return t('fiveHourLimit')
  if (seconds === 7 * 24 * 60 * 60) return t('weeklyLimit')
  const hours = seconds / (60 * 60)
  return Number.isInteger(hours) ? t('hourLimit', { count: hours }) : t('usageWindow')
}

function formatPercent(percent: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(percent)
}

/** Format a server-declared Unix-second reset in the user's local timezone. */
export function formatOpenAICodexResetAt(resetAt: number | undefined): string | undefined {
  if (resetAt === undefined || !Number.isSafeInteger(resetAt) || resetAt <= 0) return undefined
  const date = new Date(resetAt * 1_000)
  if (!Number.isFinite(date.getTime())) return undefined
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function QuotaBar({
  label,
  percent,
  detail,
  t,
}: {
  label: string
  percent: number
  detail?: string
  t: OpenAICodexSettingsInjected['t']
}) {
  const display = formatPercent(percent)
  return (
    <div style={quotaGroupStyle}>
      <div style={quotaLabelStyle}>
        <span>{label}</span>
        <span>{t('percentRemaining', { percent: display })}</span>
      </div>
      <div
        style={progressTrackStyle}
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={t('percentRemaining', { percent: display })}
      >
        <div style={progressFillStyle(percent)} />
      </div>
      {detail === undefined ? null : <p style={bodyStyle}>{detail}</p>}
    </div>
  )
}

/** Quota rows shared by Models and Plugin settings. */
export function UsageLimits({ usage, quotaError, t, heading = true }: {
  heading?: boolean
  usage: OpenAICodexUsage
  quotaError?: string
  t: OpenAICodexSettingsInjected['t']
}) {
  const hasData = usage.rateLimits.length > 0 || usage.credits !== undefined || usage.individualLimit !== undefined
  return (
    <div style={quotaListStyle}>
      {heading ? <h3 style={quotaTitleStyle}>{t('usageLimits')}</h3> : null}
      {usage.rateLimits.map(limit => (
        <div key={limit.id} style={quotaGroupStyle}>
          {limit.windows.map(window => (
            <QuotaBar
              key={window.windowSeconds}
              label={`${limit.name ?? limit.id} · ${windowLabel(window.windowSeconds, t)}`}
              percent={window.remainingPercent}
              detail={t('resetAt', {
                time: formatOpenAICodexResetAt(window.resetAt) ?? t('resetUnavailable'),
              })}
              t={t}
            />
          ))}
        </div>
      ))}
      {usage.individualLimit === undefined ? null : (
        <QuotaBar
          label={t('monthlyLimit')}
          percent={usage.individualLimit.remainingPercent}
          detail={t('exactRemaining', {
            remaining: usage.individualLimit.remaining,
            limit: usage.individualLimit.limit,
          })}
          t={t}
        />
      )}
      {usage.credits === undefined ? null : (
        <div style={quotaLabelStyle}>
          <span>{t('credits')}</span>
          <span>{usage.credits.unlimited
            ? t('unlimited')
            : usage.credits.balance === undefined ? t('available') : usage.credits.balance}</span>
        </div>
      )}
      {!hasData && quotaError === undefined ? <p style={bodyStyle}>{t('quotaUnavailable')}</p> : null}
      {quotaError === undefined ? null : <p style={errorStyle}>{t('quotaUnavailable')}</p>}
    </div>
  )
}

/** Account indicator colors shared by the compact row and expanded controls. */
export function dotStyle(status: AccountStatus['status']): CSSProperties {
  const color = status === 'signed-in'
    ? 'var(--dsw-alias-state-success-primary, #22a06b)'
    : status === 'error' || status === 'reauth-required' || status === 'remote-web-origin-not-trusted'
      ? 'var(--dsw-alias-state-error-primary, #d92d20)'
      : status === 'signing-in' || status === 'loading'
        ? 'var(--dsw-alias-brand-primary, #1677ff)'
        : 'var(--dsw-alias-label-dimmed, #9aa0a6)'
  return { width: 9, height: 9, borderRadius: '50%', flex: '0 0 auto', background: color }
}

/** Non-sensitive account state label for either settings presentation. */
export function accountStatusLabel(status: AccountStatus['status'], t: OpenAICodexSettingsInjected['t']): string {
  const keys = {
    'signed-in': 'signedIn', loading: 'loadingAccount', 'signing-in': 'signingIn',
    'reauth-required': 'reauthRequired', 'remote-web-origin-not-trusted': 'remoteOriginTitle',
    error: 'requestFailed', 'signed-out': 'signedOut',
  } as const
  return t(keys[status])
}

/** Shared OAuth actions; Models uses shorter, task-oriented labels. */
export function AccountActions({ t, store, snapshot, compact = false }: {
  t: OpenAICodexSettingsInjected['t']
  store: OpenAICodexAccountStore
  snapshot: AccountSnapshot
  compact?: boolean
}) {
  const { status, busy, operation } = snapshot
  if (status.status === 'loading' || status.status === 'remote-web-origin-not-trusted') return null
  const authorizing = operation.kind === 'starting-authorization'
    || operation.kind === 'waiting-authorization'
    || operation.kind === 'cancelling-authorization'
    || status.status === 'signing-in'
  if (authorizing) return <div style={rowStyle}>
    <button type="button" style={buttonStyle} disabled={busy} onClick={() => { void store.signIn() }}>
      {busy ? t('working') : t(compact ? 'continueAuthorization' : 'reopenAuthorization')}
    </button>
    <button type="button" style={buttonStyle} disabled={busy} onClick={() => { void store.cancel() }}>{t('cancelSignIn')}</button>
  </div>
  if (status.status === 'signed-in') return null
  const retry = status.status === 'error' || status.status === 'reauth-required'
  const action = retry ? t(compact ? 'reauthorize' : 'loginAgain') : t(compact ? 'authorize' : 'login')
  return <button type="button" style={primaryButtonStyle} disabled={busy}
    onClick={() => { void store.signIn() }}>{busy ? t('working') : action}</button>
}

/** Saved-account summary and explicit account-management actions. */
export function AccountManager({ t, store, snapshot, quotaExpanded, quotaControlsId, onToggleQuota, compact = false }: {
  t: OpenAICodexSettingsInjected['t']
  store: OpenAICodexAccountStore
  snapshot: AccountSnapshot
  quotaExpanded?: boolean
  quotaControlsId?: string
  onToggleQuota?: () => void
  compact?: boolean
}) {
  const accountsPanelId = useId()
  const [expanded, setExpanded] = useState(false)
  const [removeKey, setRemoveKey] = useState<string>()
  const { accounts, busy, operation, status } = snapshot
  const active = accounts.find(account => account.active)
  const removeAccount = accounts.find(account => account.accountKey === removeKey)
  const replacement = removeAccount?.active === true
    ? accounts.find(account => account.accountKey !== removeAccount.accountKey)
    : undefined
  const authorizing = operation.kind === 'starting-authorization'
    || operation.kind === 'waiting-authorization'
    || operation.kind === 'cancelling-authorization'
    || status.status === 'signing-in'

  useEffect(() => {
    if (removeKey !== undefined && !accounts.some(account => account.accountKey === removeKey)) setRemoveKey(undefined)
  }, [accounts, removeKey])

  if (accounts.length === 0) return <AccountActions t={t} store={store} snapshot={snapshot} compact={compact} />
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
    <div style={rowStyle}>
      <div style={{ display: 'flex', alignItems: 'center', minWidth: 0, gap: 10 }}>
        <span aria-hidden="true" style={{ width: 38, height: 38, borderRadius: '50%', display: 'grid', placeItems: 'center', flex: '0 0 auto', background: 'var(--dsw-alias-bg-layer-2, rgba(0, 0, 0, 0.06))', fontWeight: 600 }}>
          {(active?.displayName.trim()[0] ?? 'C').toUpperCase()}
        </span>
        <span style={accountIdentityStyle}>
          <strong style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{active?.displayName ?? t('accountHeading')}</strong>
          <span style={bodyStyle}>{active?.maskedEmail === undefined
            ? t('currentAccountDetail')
            : `${active.maskedEmail} · ${t('currentAccountDetail')}`}</span>
        </span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {status.status === 'reauth-required' && !authorizing
          ? <button type="button" style={primaryButtonStyle} disabled={busy} onClick={() => { void store.signIn() }}>{t('reauthorize')}</button>
          : null}
        {authorizing ? <AccountActions t={t} store={store} snapshot={snapshot} compact /> : null}
        {onToggleQuota === undefined || status.status !== 'signed-in' ? null : (
          <button type="button" style={buttonStyle} aria-expanded={quotaExpanded} aria-controls={quotaControlsId} onClick={onToggleQuota}>
            {t(quotaExpanded === true ? 'hideQuota' : 'viewQuota')}
          </button>
        )}
        <button type="button" style={buttonStyle} aria-expanded={expanded} aria-controls={accountsPanelId} onClick={() => { setExpanded(!expanded) }}>
          {t(expanded ? 'hideAccounts' : 'manageAccounts')}
        </button>
      </div>
    </div>
    {authorizing ? <p style={bodyStyle}>{t('addingAccountKeepsCurrent')}</p> : null}
    {expanded ? <div id={accountsPanelId} style={accountPanelStyle}>
      <div style={{ ...rowStyle, padding: '10px 14px', background: 'var(--dsw-alias-bg-layer-2, rgba(0, 0, 0, 0.04))' }}>
        <strong>{t('savedAccounts')} · {accounts.length}</strong>
        <button type="button" style={primaryButtonStyle} disabled={busy || authorizing} onClick={() => { void store.signIn() }}>
          {operation.kind === 'starting-authorization' ? t('working') : t('addAccount')}
        </button>
      </div>
      {accounts.map(account => <div key={account.accountKey} style={accountRowStyle}>
        <span style={accountIdentityStyle}>
          <strong>{account.displayName}{account.active ? <span style={accountBadgeStyle}>{t('currentAccount')}</span> : null}</strong>
          <span style={bodyStyle}>{account.maskedEmail === undefined
            ? t(account.active ? 'currentAccountDetail' : 'savedAccountDetail')
            : `${account.maskedEmail} · ${t(account.active ? 'currentAccountDetail' : 'savedAccountDetail')}`}</span>
        </span>
        <span style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button type="button" style={buttonStyle} disabled={busy || account.active}
            onClick={() => { void store.activate(account.accountKey) }}>
            {operation.kind === 'activating' && operation.accountKey === account.accountKey
              ? t('working') : t(account.active ? 'usingAccount' : 'useAccount')}
          </button>
          <button type="button" style={dangerButtonStyle} disabled={busy} onClick={() => { setRemoveKey(account.accountKey) }}>
            {t('removeAccount')}
          </button>
        </span>
      </div>)}
      <div style={{ ...rowStyle, padding: '10px 14px', borderTop: '1px solid var(--dsw-alias-border-l2)' }}>
        <span style={bodyStyle}>{t('activeAccountHelp')}</span>
        <button type="button" style={dangerButtonStyle} disabled={busy} onClick={() => { void store.signOut() }}>
          {operation.kind === 'signing-out' ? t('working') : t('signOutAll')}
        </button>
      </div>
    </div> : null}
    {removeAccount === undefined ? null : <section role="region" aria-live="polite" aria-label={t('removeAccountTitle', { name: removeAccount.displayName })}
      style={{ padding: 14, border: '1px solid var(--dsw-alias-state-error-primary, #d92d20)', borderRadius: 10 }}>
      <strong>{t('removeAccountTitle', { name: removeAccount.displayName })}</strong>
      <p style={{ ...bodyStyle, marginTop: 5 }}>{accounts.length === 1
        ? t('removeLastAccountCopy')
        : replacement === undefined ? t('removeAccountCopy') : t('removeActiveAccountCopy', { name: replacement.displayName })}</p>
      <div style={{ ...rowStyle, justifyContent: 'flex-end' }}>
        <button type="button" style={buttonStyle} onClick={() => { setRemoveKey(undefined) }}>{t('cancel')}</button>
        <button type="button" style={dangerButtonStyle} disabled={busy} onClick={() => {
          void store.remove(removeAccount.accountKey, replacement?.accountKey)
        }}>{operation.kind === 'removing' ? t('working') : t('confirmRemove')}</button>
      </div>
    </section>}
  </div>
}

/** Recovery links, errors and trusted-origin guidance in either account entry. */
export function AccountFeedback({ t, snapshot }: {
  t: OpenAICodexSettingsInjected['t']
  snapshot: AccountSnapshot
}) {
  const { status, loginUrl, operationError } = snapshot
  const [copied, setCopied] = useState(false)
  const [copyFailed, setCopyFailed] = useState(false)
  const trustedOriginCommand = `dsh plugin --profile web exec dsh-codex-connect trust-origin ${window.location.origin}`

  const copyTrustedOriginCommand = async (): Promise<void> => {
    setCopyFailed(false)
    try {
      if (navigator.clipboard?.writeText === undefined) throw new Error('clipboard unavailable')
      await navigator.clipboard.writeText(trustedOriginCommand)
      setCopied(true)
    } catch {
      setCopyFailed(true)
    }
  }

  return <>
    {loginUrl === undefined ? null : (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 10 }}>
        <p style={bodyStyle}>{t('authorizationHelp')}</p>
        <a
          href={loginUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{ ...primaryButtonStyle, display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}
        >
          {t('openLoginInBrowser')}
        </a>
      </div>
    )}
    {status.status === 'error' || status.status === 'reauth-required'
      ? <p style={errorStyle}>{status.message}</p>
      : null}
    {operationError === undefined ? null : <p style={errorStyle}>{operationError}</p>}
    {status.status === 'remote-web-origin-not-trusted' ? (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <p style={errorStyle}>{t('remoteOriginDescription')}</p>
        <p style={bodyStyle}>{t('remoteOriginCommandHelp')}</p>
        <code style={commandStyle}>{trustedOriginCommand}</code>
        <div style={rowStyle}>
          <button type="button" style={buttonStyle} onClick={() => { void copyTrustedOriginCommand() }}>
            {copied ? t('remoteOriginCopied') : t('remoteOriginCopy')}
          </button>
          {copyFailed ? <span style={errorStyle}>{t('remoteOriginCopyFailed')}</span> : null}
        </div>
      </div>
    ) : null}
  </>
}

/** OpenAI Codex account status and OAuth actions. */
export function OpenAICodexSettings({ t, configScope, updater, account, embedded = false, accountOnly = false }: OpenAICodexSettingsProps) {
  if (t === undefined) throw new Error('OpenAI Codex settings requires its translation function')
  const [localAccount] = useState(() => new OpenAICodexAccountStore())
  const store = account ?? localAccount
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot)
  const subscribeConfig = useCallback((listener: () => void) => configScope?.subscribe(listener) ?? (() => undefined), [configScope])
  const getConfigSnapshot = useCallback(() => configScope?.getSnapshot() ?? UNAVAILABLE_CONFIG_SNAPSHOT, [configScope])
  const configSnapshot = useSyncExternalStore(subscribeConfig, getConfigSnapshot, getConfigSnapshot)
  const { status } = snapshot
  const titleId = useId()
  const [activeModule, setActiveModule] = useState<OpenAICodexSettingsModule>('account')
  const panelIdPrefix = `${titleId}-module`

  const label = accountStatusLabel(status.status, t)
  const moduleSummary = (module: OpenAICodexSettingsModule): string => {
    if (module === 'account') return t('accountModuleSummary', { status: label })
    const config = configSnapshot.value
    if (module === 'models') return config?.models === undefined
      ? t('modelsModuleDefault')
      : t('modelsModuleSelected', { count: config.models.length })
    if (module === 'network') return t(config?.enableProxy === true ? 'networkModuleProxy' : 'networkModuleDirect')
    const count = config === undefined ? 0 : [config.enableSearch, config.enableImageTool, config.enableImageGeneration, config.enableAutoReview].filter(Boolean).length
    return t('capabilitiesModuleEnabled', { count })
  }

  return (
    <section
      style={embedded ? embeddedPageStyle : pageStyle}
      {...embedded ? { 'aria-label': t('title') } : { 'aria-labelledby': titleId }}
    >
      {embedded ? null : (
        <div>
          <h2 id={titleId} style={titleStyle}>{t('title')}</h2>
          <p style={{ ...bodyStyle, marginTop: 6 }}>{t('intro')}</p>
        </div>
      )}
      <div style={embedded ? embeddedCardStyle : cardStyle}>
        {accountOnly || updater === undefined ? null : <OpenAICodexUpdateSettings t={t} updater={updater} />}
        {accountOnly ? null : (
          <div style={moduleTabsStyle} role="tablist" aria-label={t('settingsModules')}>
            {SETTINGS_MODULES.map((module, index) => (
              <button key={module} id={`${panelIdPrefix}-${module}-tab`} type="button" role="tab"
                aria-label={t(`${module}Module`)}
                aria-selected={activeModule === module} aria-controls={`${panelIdPrefix}-${module}`}
                tabIndex={activeModule === module ? 0 : -1}
                style={activeModule === module ? activeModuleTabStyle : moduleTabStyle}
                onClick={() => { setActiveModule(module) }}
                onKeyDown={event => {
                  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
                  event.preventDefault()
                  const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? SETTINGS_MODULES.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + SETTINGS_MODULES.length) % SETTINGS_MODULES.length
                  const next = SETTINGS_MODULES[nextIndex]!
                  setActiveModule(next)
                  document.getElementById(`${panelIdPrefix}-${next}-tab`)?.focus()
                }}>
                <span>{t(`${module}Module`)}</span>
                <span style={moduleSummaryStyle}>{moduleSummary(module)}</span>
              </button>
            ))}
          </div>
        )}
        <div id={`${panelIdPrefix}-account`} role={accountOnly ? undefined : 'tabpanel'} aria-labelledby={accountOnly ? undefined : `${panelIdPrefix}-account-tab`} hidden={!accountOnly && activeModule !== 'account'} style={{ display: accountOnly || activeModule === 'account' ? 'flex' : 'none', flexDirection: 'column', gap: 14 }}>
        <h3 style={quotaTitleStyle}>{t('accountHeading')}</h3>
        <div style={rowStyle}>
          <div style={statusStyle} role="status">
            <span aria-hidden="true" style={dotStyle(status.status)} />
            <span>{label}</span>
          </div>
        </div>
        <AccountManager t={t} store={store} snapshot={snapshot} />
        <AccountFeedback t={t} snapshot={snapshot} />
        {status.status === 'signed-in'
          ? <UsageLimits
              usage={status.usage}
              {...status.quotaError === undefined ? {} : { quotaError: status.quotaError }}
              t={t}
            />
          : null}
        {accountOnly ? <p style={bodyStyle}>{t('modelsAccountHelp')}</p> : null}
        </div>
        {accountOnly ? null : <OpenAICodexConfiguration
          t={t}
          activeModule={activeModule}
          panelIdPrefix={panelIdPrefix}
          {...configScope === undefined ? {} : { scope: configScope }}
        />}
      </div>
    </section>
  )
}
