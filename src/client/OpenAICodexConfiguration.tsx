/** Staged optional-capability editor inside the OpenAI Codex plugin card. */

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import type { CSSProperties } from 'react'
import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import type { OpenAICodexSettingsConfig } from '../settings-contract.ts'
import type { OpenAICodexSettingsKey } from './locales.ts'

export interface OpenAICodexConfigurationProps {
  scope?: SettingsScope<OpenAICodexSettingsConfig>
  t: (key: OpenAICodexSettingsKey, params?: Record<string, unknown>) => string
}

const sectionStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 18, borderTop: '1px solid var(--dsw-alias-border-l2)' }
const headingStyle: CSSProperties = { margin: 0, fontSize: 14, lineHeight: '20px', fontWeight: 600, color: 'var(--dsw-alias-label-primary)' }
const bodyStyle: CSSProperties = { margin: 0, fontSize: 13, lineHeight: '20px', color: 'var(--dsw-alias-label-secondary)' }
const fieldsetStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 13, margin: 0, padding: 0, border: 0 }
const toggleRowStyle: CSSProperties = { display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }
const toggleCopyStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2 }
const labelStyle: CSSProperties = { fontSize: 13, lineHeight: '20px', fontWeight: 500, color: 'var(--dsw-alias-label-primary)' }
const formGridStyle: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }
const formFieldStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6 }
const controlStyle: CSSProperties = { boxSizing: 'border-box', width: '100%', minHeight: 36, padding: '7px 10px', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 8, background: 'var(--dsw-alias-bg-layer-1)', color: 'var(--dsw-alias-label-primary)', font: 'inherit', fontSize: 13 }
const actionsStyle: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }
const buttonsStyle: CSSProperties = { display: 'flex', gap: 8 }
const buttonStyle: CSSProperties = { boxSizing: 'border-box', minHeight: 34, padding: '6px 14px', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 18, background: 'var(--dsw-alias-bg-layer-1)', color: 'var(--dsw-alias-label-primary)', font: 'inherit', fontSize: 13, cursor: 'pointer' }
const primaryButtonStyle: CSSProperties = { ...buttonStyle, borderColor: 'var(--dsw-alias-brand-primary)', background: 'var(--dsw-alias-brand-primary)', color: 'white' }
const errorStyle: CSSProperties = { ...bodyStyle, color: 'var(--dsw-alias-state-error-primary)' }
const successStyle: CSSProperties = { ...bodyStyle, color: 'var(--dsw-alias-state-success-primary, #16825d)' }

const UNAVAILABLE_SNAPSHOT = {
  status: 'unavailable' as const,
  value: undefined,
  base: undefined,
  user: undefined,
  revision: undefined,
  writable: false,
  mode: 'memory' as const,
}

const CONFIG_FIELDS = [
  'enableSearch',
  'enableImageTool',
  'searchModel',
  'searchMode',
  'searchContextSize',
  'searchMaxOutputTokens',
  'proxyEnabled',
  'proxyHost',
  'proxyPort',
  'defaultContextWindow',
  'modelContextWindows',
] as const satisfies readonly (keyof OpenAICodexSettingsConfig)[]

function sameField(
  field: keyof OpenAICodexSettingsConfig,
  left: unknown,
  right: unknown,
): boolean {
  if (left === right) return true
  if (field !== 'modelContextWindows') return false
  if (typeof left !== 'object' || left === null || Array.isArray(left)) return false
  if (typeof right !== 'object' || right === null || Array.isArray(right)) return false
  const leftRecord = left as Record<string, unknown>
  const rightRecord = right as Record<string, unknown>
  const leftKeys = Object.keys(leftRecord)
  const rightKeys = Object.keys(rightRecord)
  return leftKeys.length === rightKeys.length
    && leftKeys.every(key => leftRecord[key] === rightRecord[key])
}

function sameConfig(
  left: OpenAICodexSettingsConfig | undefined,
  right: OpenAICodexSettingsConfig | undefined,
): boolean {
  return left !== undefined && right !== undefined
    && CONFIG_FIELDS.every(field => sameField(field, left[field], right[field]))
}

/** Edit the Host-owned llm-openai-codex settings section with Save/Discard staging. */
export function OpenAICodexConfiguration({ scope, t }: OpenAICodexConfigurationProps) {
  const subscribe = useCallback((listener: () => void) => scope?.subscribe(listener) ?? (() => undefined), [scope])
  const getSnapshot = useCallback(() => scope?.getSnapshot() ?? UNAVAILABLE_SNAPSHOT, [scope])
  const snapshot = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getSnapshot,
  )
  const [draft, setDraft] = useState<OpenAICodexSettingsConfig | undefined>(snapshot.value)
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<'idle' | 'saved' | 'error'>('idle')

  useEffect(() => {
    if (!dirty && !busy) setDraft(snapshot.value)
  }, [busy, dirty, snapshot.revision, snapshot.value])

  const update = <Key extends keyof OpenAICodexSettingsConfig>(
    field: Key,
    value: OpenAICodexSettingsConfig[Key],
  ): void => {
    setDraft(current => current === undefined ? current : { ...current, [field]: value })
    setDirty(true)
    setFeedback('idle')
  }

  const discard = (): void => {
    setDraft(scope?.getSnapshot().value)
    setDirty(false)
    setFeedback('idle')
  }

  const validModel = draft !== undefined && draft.searchModel.trim().length > 0
  const validTokens = draft !== undefined
    && Number.isInteger(draft.searchMaxOutputTokens)
    && draft.searchMaxOutputTokens > 0
  const validContextWindow = draft === undefined || draft.defaultContextWindow === 0
    || (Number.isInteger(draft.defaultContextWindow) && draft.defaultContextWindow > 0)
  const valid = validModel && validTokens && validContextWindow

  const save = async (): Promise<void> => {
    if (scope === undefined || draft === undefined || !snapshot.writable || !valid) return
    const desired = { ...draft, searchModel: draft.searchModel.trim() }
    setBusy(true)
    setFeedback('idle')
    try {
      for (const field of CONFIG_FIELDS) {
        const accepted = scope.getSnapshot().value
        if (sameField(field, accepted?.[field], desired[field])) continue
        await scope.set(field, desired[field])
        if (!sameField(field, scope.getSnapshot().value?.[field], desired[field])) {
          throw new Error(`Host refused ${field}`)
        }
      }
      const accepted = scope.getSnapshot().value
      if (!sameConfig(accepted, desired)) throw new Error('Host returned a different configuration')
      setDraft(accepted)
      setDirty(false)
      setFeedback('saved')
    } catch {
      setDraft(scope.getSnapshot().value)
      setDirty(false)
      setFeedback('error')
    } finally {
      setBusy(false)
    }
  }

  const loading = snapshot.status === 'loading'
  const editable = snapshot.status === 'ready' && snapshot.writable && !busy
  const searchDisabled = !editable || draft?.enableSearch !== true

  return (
    <section style={sectionStyle} aria-labelledby="openai-codex-capabilities-title">
      <div>
        <h3 id="openai-codex-capabilities-title" style={headingStyle}>{t('capabilitiesHeading')}</h3>
        <p style={{ ...bodyStyle, marginTop: 4 }}>{t('capabilitiesIntro')}</p>
      </div>
      {loading ? <p style={bodyStyle} role="status">{t('settingsLoading')}</p> : null}
      {snapshot.status === 'unavailable' ? <p style={errorStyle} role="alert">{t('settingsUnavailable')}</p> : null}
      {snapshot.status === 'ready' && !snapshot.writable ? <p style={errorStyle} role="alert">{t('settingsReadOnly')}</p> : null}
      {draft === undefined ? null : (
        <fieldset style={fieldsetStyle} disabled={!editable}>
          <label style={toggleRowStyle}>
            <input
              type="checkbox"
              checked={draft.enableSearch}
              onChange={event => { update('enableSearch', event.currentTarget.checked) }}
            />
            <span style={toggleCopyStyle}>
              <span style={labelStyle}>{t('enableSearch')}</span>
              <span style={bodyStyle}>{t('enableSearchHelp')}</span>
            </span>
          </label>
          <div style={formGridStyle} aria-disabled={searchDisabled}>
            <label style={formFieldStyle}>
              <span style={labelStyle}>{t('searchModel')}</span>
              <input
                style={controlStyle}
                value={draft.searchModel}
                disabled={searchDisabled}
                aria-invalid={!validModel}
                onChange={event => { update('searchModel', event.currentTarget.value) }}
              />
            </label>
            <label style={formFieldStyle}>
              <span style={labelStyle}>{t('searchMode')}</span>
              <select
                style={controlStyle}
                value={draft.searchMode}
                disabled={searchDisabled}
                onChange={event => { update('searchMode', event.currentTarget.value as OpenAICodexSettingsConfig['searchMode']) }}
              >
                <option value="cached">{t('modeCached')}</option>
                <option value="indexed">{t('modeIndexed')}</option>
                <option value="live">{t('modeLive')}</option>
              </select>
            </label>
            <label style={formFieldStyle}>
              <span style={labelStyle}>{t('searchContextSize')}</span>
              <select
                style={controlStyle}
                value={draft.searchContextSize}
                disabled={searchDisabled}
                onChange={event => { update('searchContextSize', event.currentTarget.value as OpenAICodexSettingsConfig['searchContextSize']) }}
              >
                <option value="low">{t('contextLow')}</option>
                <option value="medium">{t('contextMedium')}</option>
                <option value="high">{t('contextHigh')}</option>
              </select>
            </label>
            <label style={formFieldStyle}>
              <span style={labelStyle}>{t('searchMaxOutputTokens')}</span>
              <input
                style={controlStyle}
                type="number"
                min={1}
                step={1}
                value={draft.searchMaxOutputTokens}
                disabled={searchDisabled}
                aria-invalid={!validTokens}
                onChange={event => { update('searchMaxOutputTokens', event.currentTarget.valueAsNumber) }}
              />
            </label>
          </div>
          <label style={toggleRowStyle}>
            <input
              type="checkbox"
              checked={draft.enableImageTool}
              onChange={event => { update('enableImageTool', event.currentTarget.checked) }}
            />
            <span style={toggleCopyStyle}>
              <span style={labelStyle}>{t('enableImageTool')}</span>
              <span style={bodyStyle}>{t('enableImageToolHelp')}</span>
            </span>
          </label>
          <label style={toggleRowStyle}>
            <input
              type="checkbox"
              checked={draft.proxyEnabled}
              onChange={event => { update('proxyEnabled', event.currentTarget.checked) }}
            />
            <span style={toggleCopyStyle}>
              <span style={labelStyle}>{t('enableProxy')}</span>
              <span style={bodyStyle}>{t('enableProxyHelp')}</span>
            </span>
          </label>
          {draft.proxyEnabled ? (
            <div style={formGridStyle}>
              <label style={formFieldStyle}>
                <span style={labelStyle}>{t('proxyHost')}</span>
                <input
                  style={controlStyle}
                  value={draft.proxyHost}
                  disabled={!editable}
                  onChange={event => { update('proxyHost', event.currentTarget.value) }}
                />
              </label>
              <label style={formFieldStyle}>
                <span style={labelStyle}>{t('proxyPort')}</span>
                <input
                  style={controlStyle}
                  type="number"
                  min={1}
                  max={65535}
                  value={draft.proxyPort}
                  disabled={!editable}
                  onChange={event => { update('proxyPort', event.currentTarget.valueAsNumber) }}
                />
              </label>
            </div>
          ) : null}
          <div style={formGridStyle}>
            <label style={formFieldStyle}>
              <span style={labelStyle}>{t('defaultContextWindow')}</span>
              <span style={bodyStyle}>{t('defaultContextWindowHelp')}</span>
              <input
                style={controlStyle}
                type="number"
                min={1}
                step={1}
                value={draft.defaultContextWindow || ''}
                disabled={!editable}
                aria-invalid={!validContextWindow}
                placeholder="272000"
                onChange={event => {
                  const raw = event.currentTarget.value
                  update('defaultContextWindow', raw === '' ? 0 : event.currentTarget.valueAsNumber)
                }}
              />
            </label>
          </div>
        </fieldset>
      )}
      {!validModel && draft !== undefined ? <p style={errorStyle} role="alert">{t('invalidSearchModel')}</p> : null}
      {!validTokens && draft !== undefined ? <p style={errorStyle} role="alert">{t('invalidSearchTokens')}</p> : null}
      {!validContextWindow && draft !== undefined ? <p style={errorStyle} role="alert">{t('invalidContextWindow')}</p> : null}
      <p style={bodyStyle}>{t('routingNote')}</p>
      <div style={actionsStyle}>
        <span aria-live="polite">
          {feedback === 'saved' ? <span style={successStyle}>{t('settingsSaved')}</span> : null}
          {feedback === 'error' ? <span style={errorStyle}>{t('settingsSaveFailed')}</span> : null}
        </span>
        <span style={buttonsStyle}>
          <button type="button" style={buttonStyle} disabled={!dirty || busy} onClick={discard}>{t('discard')}</button>
          <button
            type="button"
            style={primaryButtonStyle}
            disabled={!dirty || !valid || !snapshot.writable || busy}
            onClick={() => { void save() }}
          >
            {busy ? t('saving') : t('save')}
          </button>
        </span>
      </div>
    </section>
  )
}
