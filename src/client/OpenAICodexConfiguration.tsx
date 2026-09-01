/** Staged optional-capability editor inside the OpenAI Codex plugin card. */

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import type { CSSProperties } from 'react'
import type { SettingsScope } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { OpenAICodexSettingsConfig } from '../settings-contract.ts'
import { isValidOpenAICodexContextWindowOverrides, isValidOpenAICodexProxyUrl } from '../settings-contract.ts'
import {
  decodeOpenAICodexModelCatalog,
  isValidOpenAICodexContextBudget,
  OPENAI_CODEX_CONTEXT_LIMIT_SOURCE,
  OPENAI_CODEX_MODEL_CATALOG_PATH,
} from '../model-contract.ts'
import type { OpenAICodexModelCatalogEntry } from '../model-contract.ts'
import type { OpenAICodexSettingsKey } from './locales.ts'
import {
  OPENAI_CODEX_PROXY_DETECT_PATH,
  OPENAI_CODEX_PROXY_TEST_PATH,
} from '../proxy-paths.ts'
import type { OpenAICodexProxyProbeResult } from '../provider-proxy.ts'

export interface OpenAICodexConfigurationProps {
  scope?: SettingsScope<OpenAICodexSettingsConfig>
  t: (key: OpenAICodexSettingsKey, params?: Record<string, unknown>) => string
}

const sectionStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 18, borderTop: '1px solid var(--dsw-alias-border-l2)' }
const headingStyle: CSSProperties = { margin: 0, fontSize: 14, lineHeight: '20px', fontWeight: 600, color: 'var(--dsw-alias-label-primary)' }
const bodyStyle: CSSProperties = { margin: 0, fontSize: 13, lineHeight: '20px', color: 'var(--dsw-alias-label-secondary)' }
const fieldsetStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 13, margin: 0, padding: 0, border: 0 }
const modelListStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 10 }
const modelRowStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 9, minHeight: 30, fontSize: 13, color: 'var(--dsw-alias-label-primary)', cursor: 'pointer' }
const modelIdStyle: CSSProperties = { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12, color: 'var(--dsw-alias-label-secondary)' }
const toggleRowStyle: CSSProperties = { display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }
const toggleCopyStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2 }
const labelStyle: CSSProperties = { fontSize: 13, lineHeight: '20px', fontWeight: 500, color: 'var(--dsw-alias-label-primary)' }
const formGridStyle: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }
const formFieldStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6 }
const controlStyle: CSSProperties = { boxSizing: 'border-box', width: '100%', minHeight: 36, padding: '7px 10px', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 8, background: 'var(--dsw-alias-bg-layer-1)', color: 'var(--dsw-alias-label-primary)', font: 'inherit', fontSize: 13 }
const actionsStyle: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }
const buttonsStyle: CSSProperties = { display: 'flex', gap: 8 }
const buttonStyle: CSSProperties = { boxSizing: 'border-box', minHeight: 34, padding: '6px 14px', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 18, background: 'var(--dsw-alias-bg-layer-1)', color: 'var(--dsw-alias-label-primary)', font: 'inherit', fontSize: 13, cursor: 'pointer' }
const primaryButtonStyle: CSSProperties = { ...buttonStyle, borderColor: 'var(--dsw-alias-button-primary-fill)', background: 'var(--dsw-alias-button-primary-fill)', color: 'var(--dsw-alias-label-primary-foreground)' }
const errorStyle: CSSProperties = { ...bodyStyle, color: 'var(--dsw-alias-state-error-primary)' }
const successStyle: CSSProperties = { ...bodyStyle, color: 'var(--dsw-alias-state-success-primary, #16825d)' }

type ProxyDetectionState =
  | { status: 'idle' }
  | { status: 'detecting' }
  | { status: 'candidate'; candidates: readonly OpenAICodexProxyProbeResult[] }
  | { status: 'failed'; results: readonly OpenAICodexProxyProbeResult[] }

type ProxyDetectionResponse = {
  candidates: readonly OpenAICodexProxyProbeResult[]
  results: readonly OpenAICodexProxyProbeResult[]
}

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
  'models',
  'contextWindowOverrides',
  'enableProxy',
  'proxyUrl',
  'enableSearch',
  'enableImageTool',
  'enableImageGeneration',
  'enableAutoReview',
  'searchModel',
  'searchMode',
  'searchContextSize',
  'searchMaxOutputTokens',
] as const satisfies readonly (keyof OpenAICodexSettingsConfig)[]

function sameField(
  field: keyof OpenAICodexSettingsConfig,
  left: OpenAICodexSettingsConfig[keyof OpenAICodexSettingsConfig],
  right: OpenAICodexSettingsConfig[keyof OpenAICodexSettingsConfig],
): boolean {
  if (field === 'contextWindowOverrides') {
    const leftMap = left as OpenAICodexSettingsConfig['contextWindowOverrides']
    const rightMap = right as OpenAICodexSettingsConfig['contextWindowOverrides']
    return Object.keys(leftMap ?? {}).length === Object.keys(rightMap ?? {}).length
      && Object.entries(leftMap ?? {}).every(([id, value]) => rightMap?.[id] === value)
  }
  if (field !== 'models') return left === right
  if (left === undefined || right === undefined) return left === right
  return Array.isArray(left) && Array.isArray(right)
    && left.length === right.length
    && left.every((model, index) => model === right[index])
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
  const [modelCatalog, setModelCatalog] = useState<OpenAICodexModelCatalogEntry[] | undefined>()
  const [modelCatalogError, setModelCatalogError] = useState(false)
  const [expandedModels, setExpandedModels] = useState<Readonly<Record<string, boolean>>>({})
  const [proxyDetection, setProxyDetection] = useState<ProxyDetectionState>({ status: 'idle' })
  const [manualProxy, setManualProxy] = useState(false)
  const [manualProbe, setManualProbe] = useState<OpenAICodexProxyProbeResult | undefined>()
  const [manualProbeBusy, setManualProbeBusy] = useState(false)

  useEffect(() => {
    if (scope === undefined) return
    const controller = new AbortController()
    void fetch(OPENAI_CODEX_MODEL_CATALOG_PATH, {
      method: 'GET',
      credentials: 'same-origin',
      headers: { accept: 'application/json' },
      signal: controller.signal,
    }).then(async response => {
      if (!response.ok) throw new Error(`model catalog request failed: ${String(response.status)}`)
      const catalog = decodeOpenAICodexModelCatalog(await response.json())
      if (catalog === undefined) throw new Error('model catalog response was invalid')
      setModelCatalog(catalog)
      setModelCatalogError(false)
    }).catch(() => {
      if (!controller.signal.aborted) setModelCatalogError(true)
    })
    return () => { controller.abort() }
  }, [scope])

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
    setProxyDetection({ status: 'idle' })
    setManualProbe(undefined)
  }

  const detectProxy = async (): Promise<void> => {
    setProxyDetection({ status: 'detecting' })
    try {
      const response = await fetch(OPENAI_CODEX_PROXY_DETECT_PATH, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { accept: 'application/json' },
      })
      if (!response.ok) throw new Error(`proxy detection failed: ${String(response.status)}`)
      const value = await response.json() as ProxyDetectionResponse
      if (!Array.isArray(value.candidates) || !Array.isArray(value.results)) throw new Error('proxy detection response was invalid')
      setProxyDetection(value.candidates.length > 0
        ? { status: 'candidate', candidates: value.candidates }
        : { status: 'failed', results: value.results })
    } catch {
      setProxyDetection({ status: 'failed', results: [] })
    }
  }

  const useProxy = (proxyUrl: string): void => {
    if (draft === undefined || !isValidOpenAICodexProxyUrl(proxyUrl)) return
    setDraft({ ...draft, proxyUrl, enableProxy: true })
    setDirty(true)
    setFeedback('idle')
    setManualProxy(true)
    setManualProbe(undefined)
    setProxyDetection({ status: 'idle' })
  }

  const testManualProxy = async (): Promise<void> => {
    if (draft === undefined || !isValidOpenAICodexProxyUrl(draft.proxyUrl)) return
    setManualProbeBusy(true)
    try {
      const path = `${OPENAI_CODEX_PROXY_TEST_PATH}?proxyUrl=${encodeURIComponent(draft.proxyUrl)}`
      const response = await fetch(path, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { accept: 'application/json' },
      })
      if (!response.ok) throw new Error(`proxy test failed: ${String(response.status)}`)
      setManualProbe(await response.json() as OpenAICodexProxyProbeResult)
    } catch {
      setManualProbe({
        proxyUrl: draft.proxyUrl,
        reachable: false,
        classification: 'connect-failure',
      })
    } finally {
      setManualProbeBusy(false)
    }
  }

  const validModel = draft !== undefined && draft.searchModel.trim().length > 0
  const validTokens = draft !== undefined
    && Number.isInteger(draft.searchMaxOutputTokens)
    && draft.searchMaxOutputTokens > 0
  const validProxy = draft !== undefined && isValidOpenAICodexProxyUrl(draft.proxyUrl)
  const validContexts = draft !== undefined && isValidOpenAICodexContextWindowOverrides(draft.contextWindowOverrides ?? {})
    && Object.entries(draft.contextWindowOverrides ?? {}).every(([id, budget]) => {
      const model = modelCatalog?.find(entry => entry.id === id)
      return model !== undefined && isValidOpenAICodexContextBudget(budget, model.maxContextWindow)
    })
  const valid = validModel && validTokens && validProxy && validContexts

  const save = async (): Promise<void> => {
    if (scope === undefined || draft === undefined || !snapshot.writable || !valid) return
    const desired = { ...draft, searchModel: draft.searchModel.trim() }
    setBusy(true)
    setFeedback('idle')
    try {
      for (const field of CONFIG_FIELDS) {
        const accepted = scope.getSnapshot().value
        if (accepted !== undefined && sameField(field, accepted[field], desired[field])) continue
        // Null masks prevent a reset row from silently re-inheriting a composition override.
        const value = field === 'contextWindowOverrides'
          ? { ...Object.fromEntries((modelCatalog ?? []).map(model => [model.id, null])), ...desired.contextWindowOverrides }
          : desired[field]
        await scope.set(field, value)
        const committed = scope.getSnapshot().value
        if (committed === undefined || !sameField(field, committed[field], desired[field])) {
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
    <section style={sectionStyle} aria-label={t('configurationHeading')}>
      {loading ? <p style={bodyStyle} role="status">{t('settingsLoading')}</p> : null}
      {snapshot.status === 'unavailable' ? <p style={errorStyle} role="alert">{t('settingsUnavailable')}</p> : null}
      {snapshot.status === 'ready' && !snapshot.writable ? <p style={errorStyle} role="alert">{t('settingsReadOnly')}</p> : null}
      {draft === undefined ? null : (
        <fieldset style={fieldsetStyle} disabled={!editable}>
          <div>
            <h3 style={headingStyle}>{t('modelCatalog')}</h3>
            <p style={{ ...bodyStyle, marginTop: 4 }}>{t('modelCatalogIntro')}</p>
          </div>
          {modelCatalog === undefined && !modelCatalogError ? <p style={bodyStyle} role="status">{t('modelCatalogLoading')}</p> : null}
          {modelCatalogError ? <p style={errorStyle} role="alert">{t('modelCatalogFailed')}</p> : null}
          {modelCatalog === undefined ? null : (
            <div style={modelListStyle} role="group" aria-label={t('modelCatalog')}>
              {modelCatalog.map(model => {
                const selected = draft.models === undefined || draft.models.includes(model.id)
                const budget = draft.contextWindowOverrides?.[model.id]
                const invalidBudget = budget !== undefined && !isValidOpenAICodexContextBudget(budget, model.maxContextWindow)
                const effectiveBudget = budget ?? model.contextWindow
                const changeBudget = (value: number): void => {
                  update('contextWindowOverrides', { ...draft.contextWindowOverrides, [model.id]: value })
                }
                return (
                  <div key={model.id} role="group" aria-label={model.name} style={{ minWidth: 0, padding: '10px 0', borderBottom: '1px solid var(--dsw-alias-border-l2)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                      <label style={{ ...modelRowStyle, minWidth: 0, overflowWrap: 'anywhere' }}>
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={event => {
                            const visible = new Set(draft.models ?? modelCatalog.map(entry => entry.id))
                            if (event.currentTarget.checked) visible.add(model.id)
                            else visible.delete(model.id)
                            update('models', modelCatalog.filter(entry => visible.has(entry.id)).map(entry => entry.id))
                          }}
                        />
                        <span>
                          <span>{model.name}</span>
                          {model.name === model.id ? null : <span style={modelIdStyle}> ({model.id})</span>}
                        </span>
                      </label>
                      <div style={{ ...buttonsStyle, alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={bodyStyle}>{t('modelContext')}: {invalidBudget ? t('contextCustom') : `${effectiveBudget.toLocaleString()} tokens${budget === undefined ? ` · ${t('contextDefault')}` : ''}`}</span>
                        <button type="button" style={buttonStyle} aria-expanded={expandedModels[model.id] === true} onClick={() => { setExpandedModels(current => ({ ...current, [model.id]: !current[model.id] })) }}>
                          {expandedModels[model.id] === true ? t('contextHide') : t('contextAdjust')}
                        </button>
                      </div>
                    </div>
                    {expandedModels[model.id] === true ? (
                      <div role="group" aria-label={t('contextTokens')} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
                        <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                          <span style={labelStyle}>{t('contextTokens')}</span>
                          <input type="number" min={1} step={1} max={model.maxContextWindow} style={{ ...controlStyle, width: 112, flexShrink: 0, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
                            value={Number.isNaN(effectiveBudget) ? '' : effectiveBudget}
                            aria-invalid={invalidBudget}
                            onChange={event => { changeBudget(event.currentTarget.valueAsNumber) }}
                          />
                        </label>
                        <div style={{ ...bodyStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            {model.contextLimitSource === 'codex-catalog'
                              ? <a href={OPENAI_CODEX_CONTEXT_LIMIT_SOURCE} target="_blank" rel="noopener noreferrer" title={t('contextLimitSource')} style={{ color: 'inherit', textDecorationStyle: 'dotted', textUnderlineOffset: 3 }}>{t('contextMaximum')}</a>
                              : <span title={t('contextLimitFallback')}>{t('contextMaximum')}</span>}
                            <span style={{ padding: '1px 6px', borderRadius: 4, background: 'var(--dsw-alias-bg-layer-2, var(--dsw-alias-bg-layer-1))', fontVariantNumeric: 'tabular-nums' }}>{model.maxContextWindow}</span>
                            <span>tokens</span>
                          </span>
                          <button type="button" title={`${t('contextDefault')}: ${model.contextWindow.toLocaleString()} tokens`} style={{ ...bodyStyle, padding: '2px 0', border: 0, background: 'transparent', font: 'inherit', fontSize: 12, cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3 }} onClick={() => {
                            const overrides = { ...draft.contextWindowOverrides }
                            delete overrides[model.id]
                            update('contextWindowOverrides', overrides)
                          }}>{t('contextReset')}</button>
                        </div>
                        <input type="range" min={1} max={model.maxContextWindow} step={1}
                          aria-label={t('contextSlider')}
                          aria-valuetext={invalidBudget ? t('contextInvalid') : `${effectiveBudget.toLocaleString()} tokens`}
                          style={{ width: '100%', height: 20, margin: 0, accentColor: 'var(--dsw-alias-label-secondary)' }}
                          value={invalidBudget ? model.contextWindow : effectiveBudget}
                          onChange={event => { changeBudget(event.currentTarget.valueAsNumber) }}
                        />
                        {budget !== undefined && budget > model.contextWindow && !invalidBudget
                          ? <p style={bodyStyle} role="status">{t('contextAboveDefault')}</p> : null}
                        {invalidBudget ? <p style={errorStyle} role="alert">{t('contextInvalid')} (1–{model.maxContextWindow.toLocaleString()})</p> : null}
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          )}
          <p style={bodyStyle}>{t('contextWarning')}</p>
          {!validContexts ? <p style={errorStyle} role="alert">{t('contextInvalid')}</p> : null}
          <div style={{ paddingTop: 4 }}>
            <h3 style={headingStyle}>{t('networkHeading')}</h3>
            <p style={{ ...bodyStyle, marginTop: 4 }}>{t('networkIntro')}</p>
          </div>
          <p style={bodyStyle} role="status">
            {draft.enableProxy ? t('customProxyActive', { proxyUrl: draft.proxyUrl }) : t('directConnection')}
          </p>
          <div style={buttonsStyle}>
            {!draft.enableProxy ? (
              <button type="button" style={buttonStyle} onClick={() => { void detectProxy() }} disabled={proxyDetection.status === 'detecting'}>
                {proxyDetection.status === 'detecting' ? t('detectingProxy') : t('detectProxy')}
              </button>
            ) : null}
            <button type="button" style={buttonStyle} onClick={() => { setManualProxy(true) }}>{t('configureProxyManually')}</button>
            {draft.enableProxy ? (
              <button type="button" style={buttonStyle} onClick={() => { update('enableProxy', false) }}>{t('disableProxy')}</button>
            ) : null}
          </div>
          {proxyDetection.status === 'candidate' ? (
            <div style={fieldsetStyle} role="status">
              <p style={bodyStyle}>{t('proxyCandidatesFound')}</p>
              {proxyDetection.candidates.map(candidate => (
                <div key={candidate.proxyUrl} style={actionsStyle}>
                  <code style={modelIdStyle}>{candidate.proxyUrl}</code>
                  <button type="button" style={primaryButtonStyle} onClick={() => { useProxy(candidate.proxyUrl) }}>{t('useThisProxy')}</button>
                </div>
              ))}
              <button type="button" style={buttonStyle} onClick={() => { setProxyDetection({ status: 'idle' }) }}>{t('keepDirectConnection')}</button>
            </div>
          ) : null}
          {proxyDetection.status === 'failed' ? <p style={errorStyle} role="alert">{t('proxyDetectionFailed')}</p> : null}
          {manualProxy ? (
            <div style={fieldsetStyle}>
              <label style={formFieldStyle}>
                <span style={labelStyle}>{t('proxyAddress')}</span>
                <input
                  style={controlStyle}
                  value={draft.proxyUrl}
                  aria-invalid={!isValidOpenAICodexProxyUrl(draft.proxyUrl)}
                  onChange={event => { update('proxyUrl', event.currentTarget.value) }}
                />
              </label>
              <div style={buttonsStyle}>
                <button
                  type="button"
                  style={buttonStyle}
                  disabled={!isValidOpenAICodexProxyUrl(draft.proxyUrl) || manualProbeBusy}
                  onClick={() => { void testManualProxy() }}
                >
                  {manualProbeBusy ? t('testingProxy') : t('testProxy')}
                </button>
                {!draft.enableProxy ? (
                  <button
                    type="button"
                    style={primaryButtonStyle}
                    disabled={!isValidOpenAICodexProxyUrl(draft.proxyUrl)}
                    onClick={() => { useProxy(draft.proxyUrl) }}
                  >
                    {t('useThisProxy')}
                  </button>
                ) : null}
              </div>
              {manualProbe === undefined ? null : (
                <p style={manualProbe.reachable ? successStyle : errorStyle} role="status">
                  {manualProbe.reachable ? t('proxyTestSucceeded', { status: manualProbe.status ?? manualProbe.classification }) : t('proxyTestFailed', { reason: manualProbe.classification })}
                </p>
              )}
            </div>
          ) : null}
          <div style={{ paddingTop: 4 }}>
            <h3 style={headingStyle}>{t('capabilitiesHeading')}</h3>
            <p style={{ ...bodyStyle, marginTop: 4 }}>{t('capabilitiesIntro')}</p>
          </div>
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
              checked={draft.enableImageGeneration}
              onChange={event => { update('enableImageGeneration', event.currentTarget.checked) }}
            />
            <span style={toggleCopyStyle}>
              <span style={labelStyle}>{t('enableImageGeneration')}</span>
              <span style={bodyStyle}>{t('enableImageGenerationHelp')}</span>
            </span>
          </label>
          <label style={toggleRowStyle}>
            <input
              type="checkbox"
              checked={draft.enableAutoReview}
              onChange={event => { update('enableAutoReview', event.currentTarget.checked) }}
            />
            <span style={toggleCopyStyle}>
              <span style={labelStyle}>{t('enableAutoReview')}</span>
              <span style={bodyStyle}>{t('enableAutoReviewHelp')}</span>
            </span>
          </label>
        </fieldset>
      )}
      {!validModel && draft !== undefined ? <p style={errorStyle} role="alert">{t('invalidSearchModel')}</p> : null}
      {!validTokens && draft !== undefined ? <p style={errorStyle} role="alert">{t('invalidSearchTokens')}</p> : null}
      {!validProxy && draft !== undefined ? <p style={errorStyle} role="alert">{t('invalidProxyUrl')}</p> : null}
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
