/** Staged optional-capability editor inside the OpenAI Codex plugin card. */

import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'
import type { CSSProperties } from 'react'
import type { SettingsScope } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { OpenAICodexSettingsConfig } from '../settings-contract.ts'
import {
  isValidOpenAICodexContextWindowOverrides,
  isValidOpenAICodexProxyUrl,
  normalizeOpenAICodexProxyUrl,
} from '../settings-contract.ts'
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
  /** Select one settings module from the Plugin page. Omit to show local navigation. */
  activeModule?: OpenAICodexSettingsModule
  /** Stable prefix that associates external module tabs with these panels. */
  panelIdPrefix?: string
}

/** Modules shared by the Plugin settings page and the Models settings dialog. */
export type OpenAICodexSettingsModule = 'account' | 'models' | 'network' | 'capabilities'

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
const proxyButtonStyle: CSSProperties = { ...buttonStyle, minHeight: 44 }
const primaryProxyButtonStyle: CSSProperties = { ...primaryButtonStyle, minHeight: 44 }
const errorStyle: CSSProperties = { ...bodyStyle, color: 'var(--dsw-alias-state-error-primary)' }
const successStyle: CSSProperties = { ...bodyStyle, color: 'var(--dsw-alias-state-success-primary, #16825d)' }
const badgeStyle: CSSProperties = { display: 'inline-flex', alignItems: 'center', minHeight: 18, padding: '0 6px', borderRadius: 999, background: 'var(--dsw-alias-bg-layer-2, var(--dsw-alias-bg-layer-1))', color: 'var(--dsw-alias-label-secondary)', fontSize: 11, lineHeight: '18px', fontWeight: 500 }
const connectionCardStyle: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14, padding: '14px 16px', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 10, background: 'var(--dsw-alias-bg-layer-2, var(--dsw-alias-bg-layer-1))' }
const candidateStyle: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, minHeight: 64, padding: '10px 12px', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 10 }
const statePillStyle: CSSProperties = { ...bodyStyle, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: 32, padding: '4px 10px', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 999, background: 'var(--dsw-alias-bg-layer-2, var(--dsw-alias-bg-layer-1))', whiteSpace: 'nowrap' }
const proxyTabsStyle: CSSProperties = { display: 'inline-flex', alignSelf: 'flex-start', padding: 3, border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 10, background: 'var(--dsw-alias-bg-layer-2, var(--dsw-alias-bg-layer-1))' }
const proxyTabStyle: CSSProperties = { boxSizing: 'border-box', minHeight: 44, padding: '8px 14px', border: 0, borderRadius: 7, background: 'transparent', color: 'var(--dsw-alias-label-secondary)', font: 'inherit', fontSize: 13, cursor: 'pointer' }
const activeProxyTabStyle: CSSProperties = { ...proxyTabStyle, background: 'var(--dsw-alias-bg-layer-1)', color: 'var(--dsw-alias-label-primary)', boxShadow: '0 1px 3px rgb(0 0 0 / 8%)' }
const pendingStyle: CSSProperties = { ...bodyStyle, padding: '9px 12px', borderRadius: 8, background: 'var(--dsw-alias-state-warning-bg, #fff7df)', color: 'var(--dsw-alias-state-warning-primary, #8a5a00)' }
const moduleTabsStyle: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }
const moduleTabStyle: CSSProperties = { ...buttonStyle, minWidth: 0, minHeight: 44, borderRadius: 10, overflowWrap: 'anywhere' }
const activeModuleTabStyle: CSSProperties = { ...moduleTabStyle, border: '1px solid var(--dsw-alias-button-primary-fill)', background: 'var(--dsw-alias-bg-layer-2, var(--dsw-alias-bg-layer-1))', color: 'var(--dsw-alias-label-primary)' }

const CONFIGURATION_MODULES = ['models', 'network', 'capabilities'] as const

type ProxyDetectionState =
  | { status: 'idle' }
  | { status: 'detecting' }
  | { status: 'candidate'; candidates: readonly OpenAICodexProxyProbeResult[] }
  | { status: 'failed'; results: readonly OpenAICodexProxyProbeResult[] }

type ProxyDetectionResponse = {
  candidates: readonly OpenAICodexProxyProbeResult[]
  results: readonly OpenAICodexProxyProbeResult[]
}

type CurrentProxyCheckState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'success'; result: OpenAICodexProxyProbeResult }
  | { status: 'failed'; result?: OpenAICodexProxyProbeResult }

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
  'enableImageTool',
  'enableImageGeneration',
  'autoReviewDisclosureAcknowledged',
  'enableAutoReview',
  'searchModel',
  'searchMode',
  'searchContextSize',
  'searchMaxOutputTokens',
  'enableSearch',
] as const satisfies readonly (keyof OpenAICodexSettingsConfig)[]

interface AutoReviewConsentDialogProps {
  t: OpenAICodexConfigurationProps['t']
  onCancel: () => void
  onConfirm: () => void
}

/** Require one profile-scoped acknowledgement before staging Auto-review. */
function AutoReviewConsentDialog({ t, onCancel, onConfirm }: AutoReviewConsentDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => { element?.close() }
  }, [])
  const close = (): void => {
    dialog.current?.close()
    onCancel()
  }
  return <dialog ref={dialog} aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); close() }}
    style={{ boxSizing: 'border-box', width: 'min(560px, calc(100vw - 32px))', padding: 20, border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 12, background: 'var(--dsw-alias-bg-layer-1, white)', color: 'var(--dsw-alias-label-primary)', margin: 'auto' }}>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h2 id={titleId} style={{ margin: 0, fontSize: 18 }}>{t('autoReviewConfirmTitle')}</h2>
      <p style={bodyStyle}>{t('autoReviewDisclosure')}</p>
      <p style={bodyStyle}>{t('autoReviewFailureDisclosure')}</p>
      <a href="https://learn.chatgpt.com/docs/sandboxing/auto-review" target="_blank" rel="noopener noreferrer" style={{ ...bodyStyle, textDecoration: 'underline', textUnderlineOffset: 3 }}>{t('autoReviewOfficialDocs')}</a>
      <div style={{ ...buttonsStyle, justifyContent: 'flex-end' }}>
        <button type="button" style={buttonStyle} onClick={close}>{t('autoReviewCancel')}</button>
        <button type="button" style={primaryButtonStyle} onClick={() => { dialog.current?.close(); onConfirm() }}>{t('autoReviewConfirm')}</button>
      </div>
    </div>
  </dialog>
}

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
export function OpenAICodexConfiguration({ scope, t, activeModule, panelIdPrefix }: OpenAICodexConfigurationProps) {
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
  const [proxyMode, setProxyMode] = useState<'auto' | 'manual'>('auto')
  const [manualProxyUrl, setManualProxyUrl] = useState(snapshot.value?.proxyUrl ?? '')
  const [manualProbe, setManualProbe] = useState<OpenAICodexProxyProbeResult | undefined>()
  const [manualProbeBusy, setManualProbeBusy] = useState(false)
  const [currentProxyCheck, setCurrentProxyCheck] = useState<CurrentProxyCheckState>({ status: 'idle' })
  const [autoReviewConfirmOpen, setAutoReviewConfirmOpen] = useState(false)
  const [localModule, setLocalModule] = useState<(typeof CONFIGURATION_MODULES)[number]>('models')
  const localPanelIdPrefix = useId()
  const proxyDetectionRequest = useRef(0)
  const manualProbeRequest = useRef(0)
  const currentProxyCheckRequest = useRef(0)

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
    if (!dirty && !busy) {
      setDraft(snapshot.value)
      setManualProxyUrl(snapshot.value?.proxyUrl ?? '')
    }
  }, [busy, dirty, snapshot.revision, snapshot.value])

  useEffect(() => {
    if (feedback !== 'saved') return
    const timer = window.setTimeout(() => { setFeedback('idle') }, 2500)
    return () => { window.clearTimeout(timer) }
  }, [feedback])

  useEffect(() => () => {
    proxyDetectionRequest.current += 1
    manualProbeRequest.current += 1
    currentProxyCheckRequest.current += 1
  }, [])

  const clearCurrentProxyCheck = (): void => {
    currentProxyCheckRequest.current += 1
    setCurrentProxyCheck({ status: 'idle' })
  }

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
    setProxyMode('auto')
    setManualProxyUrl(scope?.getSnapshot().value?.proxyUrl ?? '')
    manualProbeRequest.current += 1
    setManualProbe(undefined)
    setManualProbeBusy(false)
    clearCurrentProxyCheck()
    setAutoReviewConfirmOpen(false)
  }

  const confirmAutoReview = (): void => {
    setDraft(current => current === undefined ? current : {
      ...current,
      autoReviewDisclosureAcknowledged: true,
      enableAutoReview: true,
    })
    setDirty(true)
    setFeedback('idle')
    setAutoReviewConfirmOpen(false)
  }

  const detectProxy = async (): Promise<void> => {
    const request = ++proxyDetectionRequest.current
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
      if (request !== proxyDetectionRequest.current) return
      setProxyDetection(value.candidates.length > 0
        ? { status: 'candidate', candidates: value.candidates }
        : { status: 'failed', results: value.results })
    } catch {
      if (request === proxyDetectionRequest.current) setProxyDetection({ status: 'failed', results: [] })
    }
  }

  const useProxy = (proxyUrl: string): void => {
    if (draft === undefined) return
    const normalized = normalizeOpenAICodexProxyUrl(proxyUrl)
    if (normalized === undefined) return
    const detected = proxyDetection.status === 'candidate'
      ? proxyDetection.candidates.find(candidate => candidate.reachable && candidate.proxyUrl === normalized)
      : undefined
    const tested = manualProbe?.reachable === true && manualProbe.proxyUrl === normalized ? manualProbe : detected
    if (tested === undefined) return
    setDraft({ ...draft, proxyUrl: normalized, enableProxy: true })
    setManualProxyUrl(normalized)
    setDirty(true)
    setFeedback('idle')
    setManualProbe(tested)
    clearCurrentProxyCheck()
  }

  const testManualProxy = async (): Promise<void> => {
    const normalized = normalizeOpenAICodexProxyUrl(manualProxyUrl)
    if (normalized === undefined) return
    const request = ++manualProbeRequest.current
    setManualProbeBusy(true)
    try {
      const path = `${OPENAI_CODEX_PROXY_TEST_PATH}?proxyUrl=${encodeURIComponent(normalized)}`
      const response = await fetch(path, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { accept: 'application/json' },
      })
      if (!response.ok) throw new Error(`proxy test failed: ${String(response.status)}`)
      const result = await response.json() as OpenAICodexProxyProbeResult
      if (request === manualProbeRequest.current && normalizeOpenAICodexProxyUrl(manualProxyUrl) === normalized) setManualProbe(result)
    } catch {
      if (request === manualProbeRequest.current && normalizeOpenAICodexProxyUrl(manualProxyUrl) === normalized) {
        setManualProbe({
          proxyUrl: normalized,
          reachable: false,
          classification: 'connect-failure',
        })
      }
    } finally {
      if (request === manualProbeRequest.current) setManualProbeBusy(false)
    }
  }

  const checkCurrentProxy = async (): Promise<void> => {
    const saved = scope?.getSnapshot().value
    const normalized = saved?.enableProxy === true ? normalizeOpenAICodexProxyUrl(saved.proxyUrl) : undefined
    if (normalized === undefined) return
    const request = ++currentProxyCheckRequest.current
    setCurrentProxyCheck({ status: 'checking' })
    try {
      const path = `${OPENAI_CODEX_PROXY_TEST_PATH}?proxyUrl=${encodeURIComponent(normalized)}`
      const response = await fetch(path, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { accept: 'application/json' },
      })
      if (!response.ok) throw new Error(`proxy test failed: ${String(response.status)}`)
      const result = await response.json() as OpenAICodexProxyProbeResult
      const current = scope?.getSnapshot().value
      if (request !== currentProxyCheckRequest.current || current?.enableProxy !== true || normalizeOpenAICodexProxyUrl(current.proxyUrl) !== normalized) return
      setCurrentProxyCheck(result.reachable ? { status: 'success', result } : { status: 'failed', result })
    } catch {
      const current = scope?.getSnapshot().value
      if (request === currentProxyCheckRequest.current && current?.enableProxy === true && normalizeOpenAICodexProxyUrl(current.proxyUrl) === normalized) {
        setCurrentProxyCheck({ status: 'failed' })
      }
    }
  }

  const validModel = draft !== undefined && draft.searchModel.trim().length > 0
  const validTokens = draft !== undefined
    && Number.isInteger(draft.searchMaxOutputTokens)
    && draft.searchMaxOutputTokens > 0
  const validProxy = draft !== undefined && isValidOpenAICodexProxyUrl(draft.proxyUrl)
  const normalizedManualProxy = normalizeOpenAICodexProxyUrl(manualProxyUrl)
  const manualProxyEntered = manualProxyUrl.trim().length > 0
  const testedManualProxy = normalizedManualProxy !== undefined
    && manualProbe?.reachable === true
    && manualProbe.proxyUrl === normalizedManualProxy
  const testedProxy = draft !== undefined
    && manualProbe?.reachable === true
    && manualProbe.proxyUrl === normalizeOpenAICodexProxyUrl(draft.proxyUrl)
  const acceptedProxyUnchanged = draft?.enableProxy === true
    && snapshot.value?.enableProxy === true
    && normalizeOpenAICodexProxyUrl(draft.proxyUrl) === normalizeOpenAICodexProxyUrl(snapshot.value.proxyUrl)
  const validProxySelection = draft?.enableProxy !== true || acceptedProxyUnchanged || testedProxy
  const validContexts = draft !== undefined && isValidOpenAICodexContextWindowOverrides(draft.contextWindowOverrides ?? {})
    && Object.entries(draft.contextWindowOverrides ?? {}).every(([id, budget]) => {
      const model = modelCatalog?.find(entry => entry.id === id)
      return model !== undefined && isValidOpenAICodexContextBudget(budget, model.maxContextWindow)
    })
  const valid = validModel && validTokens && validProxy && validContexts && validProxySelection

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
      clearCurrentProxyCheck()
    } catch {
      setFeedback('error')
    } finally {
      setBusy(false)
    }
  }

  const loading = snapshot.status === 'loading'
  const editable = snapshot.status === 'ready' && snapshot.writable && !busy
  const searchDisabled = !editable || draft?.enableSearch !== true
  const savedProxyUrl = snapshot.value?.enableProxy === true
    ? normalizeOpenAICodexProxyUrl(snapshot.value.proxyUrl)
    : undefined
  const draftProxyUrl = draft?.enableProxy === true
    ? normalizeOpenAICodexProxyUrl(draft.proxyUrl)
    : undefined
  const proxyDraftChanged = snapshot.value !== undefined && draft !== undefined
    && (snapshot.value.enableProxy !== draft.enableProxy || normalizeOpenAICodexProxyUrl(snapshot.value.proxyUrl) !== normalizeOpenAICodexProxyUrl(draft.proxyUrl))
  const manualProxyIsCurrent = normalizedManualProxy !== undefined && savedProxyUrl === normalizedManualProxy
  const manualProxyIsSelected = !manualProxyIsCurrent && normalizedManualProxy !== undefined && draftProxyUrl === normalizedManualProxy
  const visibleModule = activeModule ?? localModule
  const panelPrefix = panelIdPrefix ?? localPanelIdPrefix

  const selectLocalModule = (module: (typeof CONFIGURATION_MODULES)[number]): void => {
    setLocalModule(module)
    document.getElementById(`${panelPrefix}-${module}-tab`)?.focus()
  }

  return (
    <section style={{ ...sectionStyle, display: visibleModule === 'account' && !dirty ? 'none' : sectionStyle.display }} aria-label={t('configurationHeading')}>
      {loading ? <p style={bodyStyle} role="status">{t('settingsLoading')}</p> : null}
      {snapshot.status === 'unavailable' ? <p style={errorStyle} role="alert">{t('settingsUnavailable')}</p> : null}
      {snapshot.status === 'ready' && !snapshot.writable ? <p style={errorStyle} role="alert">{t('settingsReadOnly')}</p> : null}
      {draft === undefined ? null : (
        <>
          {activeModule === undefined ? (
            <div style={moduleTabsStyle} role="tablist" aria-label={t('settingsModules')}>
              {CONFIGURATION_MODULES.map((module, index) => (
                <button
                  key={module}
                  id={`${panelPrefix}-${module}-tab`}
                  type="button"
                  role="tab"
                  aria-label={t(`${module}Module`)}
                  aria-selected={localModule === module}
                  aria-controls={`${panelPrefix}-${module}`}
                  tabIndex={localModule === module ? 0 : -1}
                  style={localModule === module ? activeModuleTabStyle : moduleTabStyle}
                  onClick={() => { setLocalModule(module) }}
                  onKeyDown={event => {
                    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
                    event.preventDefault()
                    const nextIndex = event.key === 'Home'
                      ? 0
                      : event.key === 'End'
                        ? CONFIGURATION_MODULES.length - 1
                        : (index + (event.key === 'ArrowRight' ? 1 : -1) + CONFIGURATION_MODULES.length) % CONFIGURATION_MODULES.length
                    selectLocalModule(CONFIGURATION_MODULES[nextIndex]!)
                  }}
                >{t(`${module}Module`)}</button>
              ))}
            </div>
          ) : null}
          <fieldset style={fieldsetStyle} disabled={!editable}>
          <div id={`${panelPrefix}-models`} role="tabpanel" aria-labelledby={`${panelPrefix}-models-tab`} hidden={visibleModule !== 'models'} style={{ ...fieldsetStyle, display: visibleModule === 'models' ? fieldsetStyle.display : 'none' }}>
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
          </div>
          <div id={`${panelPrefix}-network`} role="tabpanel" aria-labelledby={`${panelPrefix}-network-tab`} hidden={visibleModule !== 'network'} style={{ ...fieldsetStyle, display: visibleModule === 'network' ? fieldsetStyle.display : 'none' }}>
          <div style={{ paddingTop: 4 }}>
            <h3 style={headingStyle}>{t('networkHeading')}</h3>
            <p style={{ ...bodyStyle, marginTop: 4 }}>{t('networkIntro')}</p>
          </div>
          <div style={fieldsetStyle} role="group" aria-label={t('currentConnection')}>
            <h4 style={headingStyle}>{t('currentConnection')}</h4>
            <div style={connectionCardStyle}>
              <div style={{ minWidth: 0 }}>
                <p style={labelStyle}>{savedProxyUrl === undefined ? t('directConnection') : t('proxyEnabled')}</p>
                <p style={{ ...modelIdStyle, marginTop: 3, overflowWrap: 'anywhere' }}>
                  {savedProxyUrl ?? t('directConnectionDescription')}
                </p>
                {currentProxyCheck.status === 'checking' ? <p style={{ ...bodyStyle, marginTop: 5 }} role="status">{t('checkingCurrentConnection')}</p> : null}
                {currentProxyCheck.status === 'success' ? <p style={{ ...successStyle, marginTop: 5 }} role="status">{t('currentConnectionHealthy')}</p> : null}
                {currentProxyCheck.status === 'failed' ? <p style={{ ...errorStyle, marginTop: 5 }} role="status">{t('currentConnectionFailed')}</p> : null}
              </div>
              {savedProxyUrl === undefined ? null : (
                <div style={{ ...buttonsStyle, flexWrap: 'wrap' }}>
                  <button type="button" style={proxyButtonStyle} disabled={currentProxyCheck.status === 'checking'} onClick={() => { void checkCurrentProxy() }}>
                    {currentProxyCheck.status === 'checking' ? t('checkingCurrentConnectionButton') : t('checkCurrentConnection')}
                  </button>
                  <button type="button" style={{ ...proxyButtonStyle, borderColor: 'transparent', background: 'transparent', color: 'var(--dsw-alias-state-error-primary)' }} onClick={() => {
                    clearCurrentProxyCheck()
                    update('enableProxy', false)
                  }}>{t('disableProxy')}</button>
                </div>
              )}
            </div>
          </div>
          <div style={fieldsetStyle}>
            <h4 style={headingStyle}>{t('changeConnection')}</h4>
            <div style={proxyTabsStyle} role="tablist" aria-label={t('proxyConfigurationMethod')}>
              {(['auto', 'manual'] as const).map(mode => (
                <button key={mode} type="button" role="tab"
                  aria-selected={proxyMode === mode}
                  aria-controls={`openai-codex-proxy-${mode}`}
                  tabIndex={proxyMode === mode ? 0 : -1}
                  style={proxyMode === mode ? activeProxyTabStyle : proxyTabStyle}
                  onClick={() => { setProxyMode(mode) }}
                  onKeyDown={event => {
                    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
                    event.preventDefault()
                    const next = event.key === 'ArrowRight' || event.key === 'End' ? 'manual' : 'auto'
                    setProxyMode(next)
                    document.getElementById(`openai-codex-proxy-${next}-tab`)?.focus()
                  }}
                  id={`openai-codex-proxy-${mode}-tab`}
                >{mode === 'auto' ? t('automaticDetection') : t('manualEntry')}</button>
              ))}
            </div>
            <div id="openai-codex-proxy-auto" role="tabpanel" aria-labelledby="openai-codex-proxy-auto-tab" hidden={proxyMode !== 'auto'} style={{ ...fieldsetStyle, display: proxyMode === 'auto' ? fieldsetStyle.display : 'none' }}>
              <div style={actionsStyle}>
                <p style={bodyStyle}>{t('automaticDetectionHelp')}</p>
                <button type="button" style={proxyButtonStyle} onClick={() => { void detectProxy() }} disabled={proxyDetection.status === 'detecting'}>
                  {proxyDetection.status === 'detecting' ? t('detectingProxy') : t('scanLocalProxy')}
                </button>
              </div>
              {proxyDetection.status === 'candidate' ? (
                <div style={fieldsetStyle} role="status">
                  <p style={bodyStyle}>{t('proxyCandidatesFound')}</p>
                  {proxyDetection.candidates.map(candidate => {
                    const normalized = normalizeOpenAICodexProxyUrl(candidate.proxyUrl)
                    const current = normalized !== undefined && savedProxyUrl === normalized
                    const selected = !current && normalized !== undefined && draftProxyUrl === normalized
                    return <div key={candidate.proxyUrl} style={candidateStyle}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                        <code style={{ ...modelIdStyle, overflowWrap: 'anywhere' }}>{candidate.proxyUrl}</code>
                        <span style={successStyle}>{t('proxyCandidateHealthy')}</span>
                      </div>
                      {current || selected
                        ? <span style={statePillStyle}>{current ? t('currentProxy') : t('selectedProxy')}</span>
                        : <button type="button" style={primaryProxyButtonStyle} onClick={() => { useProxy(candidate.proxyUrl) }}>{t('useThisProxy')}</button>}
                    </div>
                  })}
                </div>
              ) : null}
              {proxyDetection.status === 'failed' ? (
                <div style={candidateStyle} role="alert">
                  <div><p style={errorStyle}>{t('proxyDetectionFailedTitle')}</p><p style={{ ...bodyStyle, marginTop: 3 }}>{t('proxyDetectionFailed')}</p></div>
                </div>
              ) : null}
            </div>
            <div id="openai-codex-proxy-manual" role="tabpanel" aria-labelledby="openai-codex-proxy-manual-tab" hidden={proxyMode !== 'manual'} style={{ ...fieldsetStyle, display: proxyMode === 'manual' ? fieldsetStyle.display : 'none' }}>
              <p style={bodyStyle}>{t('manualProxyHelp')}</p>
              <label style={formFieldStyle}>
                <span style={labelStyle}>{t('proxyAddress')}</span>
                <input
                  style={{ ...controlStyle, minHeight: 44 }}
                  value={manualProxyUrl}
                  aria-invalid={manualProxyEntered && normalizedManualProxy === undefined}
                  onChange={event => {
                    manualProbeRequest.current += 1
                    setManualProbeBusy(false)
                    setManualProbe(undefined)
                    setManualProxyUrl(event.currentTarget.value)
                    setFeedback('idle')
                  }}
                />
              </label>
              <div style={{ ...buttonsStyle, flexWrap: 'wrap' }}>
                <button type="button" style={proxyButtonStyle} disabled={normalizedManualProxy === undefined || manualProbeBusy} onClick={() => { void testManualProxy() }}>
                  {manualProbeBusy ? t('testingProxy') : t('testProxy')}
                </button>
                {manualProxyIsCurrent || manualProxyIsSelected
                  ? <span style={statePillStyle}>{manualProxyIsCurrent ? t('currentProxy') : t('selectedProxy')}</span>
                  : <button type="button" style={primaryProxyButtonStyle} disabled={!testedManualProxy} onClick={() => { useProxy(manualProxyUrl) }}>{t('useThisProxy')}</button>}
              </div>
              {manualProbe === undefined ? null : (
                <p style={manualProbe.reachable ? successStyle : errorStyle} role="status">
                  {manualProbe.reachable ? t('proxyTestSucceeded', { status: manualProbe.status ?? manualProbe.classification }) : t('proxyTestFailed', { reason: manualProbe.classification })}
                </p>
              )}
              {manualProxyEntered && normalizedManualProxy === undefined ? <p style={errorStyle} role="alert">{t('invalidProxyUrl')}</p> : null}
              {normalizedManualProxy !== undefined && !manualProxyIsCurrent && !manualProxyIsSelected && !testedManualProxy ? <p style={bodyStyle}>{t('proxyTestRequired')}</p> : null}
            </div>
          </div>
          {proxyDraftChanged ? <p style={pendingStyle} role="status">{draft.enableProxy ? t('pendingProxy', { proxyUrl: draft.proxyUrl }) : t('pendingDirect')}</p> : null}
          </div>
          <div id={`${panelPrefix}-capabilities`} role="tabpanel" aria-labelledby={`${panelPrefix}-capabilities-tab`} hidden={visibleModule !== 'capabilities'} style={{ ...fieldsetStyle, display: visibleModule === 'capabilities' ? fieldsetStyle.display : 'none' }}>
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
              onChange={event => {
                if (!event.currentTarget.checked) {
                  update('enableAutoReview', false)
                  return
                }
                if (draft.autoReviewDisclosureAcknowledged) update('enableAutoReview', true)
                else setAutoReviewConfirmOpen(true)
              }}
            />
            <span style={toggleCopyStyle}>
              <span style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                <span style={labelStyle}>{t('enableAutoReview')}</span>
                <span style={badgeStyle}>{t('autoReviewOfficialBadge')}</span>
              </span>
              <span style={bodyStyle}>{t('enableAutoReviewHelp')}</span>
            </span>
          </label>
          <details style={{ marginLeft: 26 }}>
            <summary style={{ ...bodyStyle, cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3 }}>{t('autoReviewDetails')}</summary>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
              <p style={bodyStyle}>{t('autoReviewDisclosure')}</p>
              <p style={bodyStyle}>{t('autoReviewFailureDisclosure')}</p>
              <a href="https://learn.chatgpt.com/docs/sandboxing/auto-review" target="_blank" rel="noopener noreferrer" style={{ ...bodyStyle, textDecoration: 'underline', textUnderlineOffset: 3 }}>{t('autoReviewOfficialDocs')}</a>
            </div>
          </details>
          </div>
        </fieldset>
        </>
      )}
      {autoReviewConfirmOpen ? <AutoReviewConsentDialog t={t} onCancel={() => { setAutoReviewConfirmOpen(false) }} onConfirm={confirmAutoReview} /> : null}
      {visibleModule === 'capabilities' && !validModel && draft !== undefined ? <p style={errorStyle} role="alert">{t('invalidSearchModel')}</p> : null}
      {visibleModule === 'capabilities' && !validTokens && draft !== undefined ? <p style={errorStyle} role="alert">{t('invalidSearchTokens')}</p> : null}
      {visibleModule === 'network' && !validProxy && draft !== undefined ? <p style={errorStyle} role="alert">{t('invalidProxyUrl')}</p> : null}
      {visibleModule === 'capabilities' ? <p style={bodyStyle}>{t('routingNote')}</p> : null}
      <div style={{ ...actionsStyle, position: 'sticky', bottom: 0, zIndex: 1, padding: '10px 0', background: 'var(--dsw-alias-bg-layer-1, white)' }}>
        <span aria-live="polite">
          {feedback === 'saved' ? <span style={successStyle}>{t('settingsSaved')}</span> : null}
          {feedback === 'error' ? <span style={errorStyle}>{t('settingsSaveFailed')}</span> : null}
        </span>
        <span style={buttonsStyle}>
          <button type="button" style={{ ...buttonStyle, minHeight: 44 }} disabled={!dirty || busy} onClick={discard}>{t('discard')}</button>
          <button
            type="button"
            style={{ ...primaryButtonStyle, minHeight: 44 }}
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
