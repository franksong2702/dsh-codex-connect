/** Explicit Detect → Test → Activate proxy workflow for Codex provider traffic. */

import { useEffect, useState, useSyncExternalStore } from 'react'
import type { CSSProperties } from 'react'
import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import {
  DEFAULT_OPENAI_CODEX_PROXY_URL,
  isValidOpenAICodexProxyUrl,
} from '../settings-contract.ts'
import type { OpenAICodexSettingsConfig } from '../settings-contract.ts'
import {
  OPENAI_CODEX_PROXY_DETECT_PATH,
  OPENAI_CODEX_PROXY_TEST_PATH,
} from '../proxy-paths.ts'
import type { OpenAICodexProxyEnvironmentCandidate } from '../proxy-env.ts'
import type { OpenAICodexProxyTestResult } from '../provider-proxy.ts'
import type { OpenAICodexSettingsKey } from './locales.ts'

type Translate = (key: OpenAICodexSettingsKey, params?: Record<string, unknown>) => string

export interface OpenAICodexProxyConfigurationProps {
  scope?: SettingsScope<OpenAICodexSettingsConfig>
  t: Translate
  compact?: boolean
}

const sectionStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 12, position: 'relative', padding: '18px 16px 18px 0', borderTop: '1px solid var(--dsw-alias-border-l2)' }
const headingStyle: CSSProperties = { margin: 0, fontSize: 14, lineHeight: '20px', fontWeight: 600, color: 'var(--dsw-alias-label-primary)' }
const bodyStyle: CSSProperties = { margin: 0, fontSize: 13, lineHeight: '20px', color: 'var(--dsw-alias-label-secondary)' }
const labelStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 500, color: 'var(--dsw-alias-label-primary)' }
const inputStyle: CSSProperties = { boxSizing: 'border-box', width: '100%', minHeight: 36, padding: '7px 10px', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 8, background: 'var(--dsw-alias-bg-layer-1)', color: 'var(--dsw-alias-label-primary)', font: 'inherit', fontSize: 13 }
const actionsStyle: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 8 }
const buttonStyle: CSSProperties = { minHeight: 34, padding: '6px 14px', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 18, background: 'var(--dsw-alias-bg-layer-1)', color: 'var(--dsw-alias-label-primary)', font: 'inherit', fontSize: 13, cursor: 'pointer' }
const primaryButtonStyle: CSSProperties = { ...buttonStyle, borderColor: 'var(--dsw-alias-brand-primary)', background: 'var(--dsw-alias-brand-primary)', color: 'white' }
const errorStyle: CSSProperties = { ...bodyStyle, color: 'var(--dsw-alias-state-error-primary, #d92d20)' }
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

function environmentCandidate(value: unknown): OpenAICodexProxyEnvironmentCandidate | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  if (record['detected'] === false) return { detected: false }
  if (record['detected'] !== true || typeof record['source'] !== 'string' || typeof record['valid'] !== 'boolean') return undefined
  if (record['valid'] === true && typeof record['proxyUrl'] === 'string') {
    return { detected: true, source: record['source'], valid: true, proxyUrl: record['proxyUrl'] }
  }
  return record['valid'] === false && record['reason'] === 'invalid-or-credentialed'
    ? { detected: true, source: record['source'], valid: false, reason: 'invalid-or-credentialed' }
    : undefined
}

function detectedCandidate(value: unknown): OpenAICodexProxyEnvironmentCandidate | undefined {
  const legacy = environmentCandidate(value)
  if (legacy !== undefined) return legacy
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  const environment = environmentCandidate(record['environment'])
  if (!Array.isArray(record['candidates'])) return undefined
  for (const candidate of record['candidates']) {
    if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) continue
    const item = candidate as Record<string, unknown>
    if (item['ok'] === true && typeof item['source'] === 'string'
      && typeof item['proxyUrl'] === 'string' && isValidOpenAICodexProxyUrl(item['proxyUrl'])) {
      return {
        detected: true,
        source: item['source'],
        valid: true,
        proxyUrl: item['proxyUrl'],
      }
    }
  }
  return environment?.detected === true && !environment.valid ? environment : { detected: false }
}

function proxyTestResult(value: unknown): OpenAICodexProxyTestResult | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  if (record['ok'] === true) {
    return typeof record['statusCode'] === 'number'
      ? { ok: true, statusCode: record['statusCode'] }
      : { ok: true }
  }
  return record['ok'] === false && typeof record['error'] === 'string'
    ? { ok: false, error: record['error'] }
    : undefined
}

/** Render direct/active status and keep Detect/Test side-effect-free until Activate. */
export function OpenAICodexProxyConfiguration({ scope, t, compact = false }: OpenAICodexProxyConfigurationProps) {
  const snapshot = useSyncExternalStore(
    listener => scope?.subscribe(listener) ?? (() => {}),
    () => scope?.getSnapshot() ?? UNAVAILABLE_SNAPSHOT,
    () => scope?.getSnapshot() ?? UNAVAILABLE_SNAPSHOT,
  )
  const active = snapshot.value?.enableProxy === true
  const savedUrl = snapshot.value?.proxyUrl ?? DEFAULT_OPENAI_CODEX_PROXY_URL
  const [draft, setDraft] = useState(savedUrl)
  const [candidate, setCandidate] = useState<OpenAICodexProxyEnvironmentCandidate>()
  const [testedUrl, setTestedUrl] = useState<string>()
  const [feedback, setFeedback] = useState<'idle' | 'detected' | 'none' | 'invalid-env' | 'test-ok' | 'test-failed' | 'activated' | 'disabled' | 'failed'>('idle')
  const [busy, setBusy] = useState<'detect' | 'test' | 'activate' | 'disable'>()

  useEffect(() => {
    if (busy === undefined && feedback !== 'detected' && feedback !== 'test-ok') setDraft(savedUrl)
  }, [savedUrl, snapshot.revision])

  const normalized = draft.trim()
  const valid = isValidOpenAICodexProxyUrl(normalized)
  const writable = snapshot.status === 'ready' && snapshot.writable

  const detect = async (): Promise<void> => {
    setBusy('detect')
    setFeedback('idle')
    setTestedUrl(undefined)
    try {
      const response = await fetch(OPENAI_CODEX_PROXY_DETECT_PATH, { credentials: 'same-origin', headers: { accept: 'application/json' } })
      const next = response.ok ? detectedCandidate(await response.json().catch(() => undefined)) : undefined
      if (next === undefined) throw new Error('invalid detect response')
      setCandidate(next)
      if (!next.detected) setFeedback('none')
      else if (!next.valid) setFeedback('invalid-env')
      else {
        setDraft(next.proxyUrl)
        setFeedback('detected')
      }
    } catch {
      setFeedback('failed')
    } finally {
      setBusy(undefined)
    }
  }

  const test = async (): Promise<void> => {
    if (!valid) return
    setBusy('test')
    setFeedback('idle')
    setTestedUrl(undefined)
    try {
      const response = await fetch(OPENAI_CODEX_PROXY_TEST_PATH, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        body: JSON.stringify({ proxyUrl: normalized }),
      })
      const result = response.ok ? proxyTestResult(await response.json().catch(() => undefined)) : undefined
      if (result?.ok !== true) {
        setFeedback('test-failed')
        return
      }
      setTestedUrl(normalized)
      setFeedback('test-ok')
    } catch {
      setFeedback('test-failed')
    } finally {
      setBusy(undefined)
    }
  }

  const activate = async (): Promise<void> => {
    if (scope === undefined || !writable || testedUrl !== normalized) return
    setBusy('activate')
    setFeedback('idle')
    try {
      if (scope.getSnapshot().value?.proxyUrl !== normalized) await scope.set('proxyUrl', normalized)
      if (scope.getSnapshot().value?.enableProxy !== true) await scope.set('enableProxy', true)
      const accepted = scope.getSnapshot().value
      if (accepted?.enableProxy !== true || accepted.proxyUrl !== normalized) throw new Error('activation refused')
      setFeedback('activated')
    } catch {
      setFeedback('failed')
    } finally {
      setBusy(undefined)
    }
  }

  const disable = async (): Promise<void> => {
    if (scope === undefined || !writable) return
    setBusy('disable')
    setFeedback('idle')
    try {
      await scope.set('enableProxy', false)
      if (scope.getSnapshot().value?.enableProxy !== false) throw new Error('disable refused')
      setTestedUrl(undefined)
      setFeedback('disabled')
    } catch {
      setFeedback('failed')
    } finally {
      setBusy(undefined)
    }
  }

  const statusText = active ? t('proxyStatusActive', { url: savedUrl }) : t('proxyStatusDirect')
  return (
    <section style={compact ? { ...sectionStyle, paddingTop: 12, paddingBottom: 0 } : sectionStyle} aria-label={t('proxyHeading')}>
      <span aria-hidden="true" data-openai-codex-proxy-rail={active ? 'active' : 'direct'} style={{ position: 'absolute', top: 18, right: 0, bottom: 18, width: 4, borderRadius: 999, background: active ? 'var(--dsw-alias-state-success-primary, #22c55e)' : 'var(--dsw-alias-state-error-primary, #ef4444)' }} />
      <div>
        <h3 style={headingStyle}>{t('proxyHeading')}</h3>
        <p style={{ ...bodyStyle, marginTop: 4 }}>{t('proxyIntro')}</p>
      </div>
      <p style={active ? successStyle : errorStyle} role="status">{statusText}</p>
      <label style={labelStyle}>
        <span>{t('proxyUrl')}</span>
        <input
          style={inputStyle}
          type="url"
          value={draft}
          placeholder={DEFAULT_OPENAI_CODEX_PROXY_URL}
          aria-invalid={!valid}
          spellCheck={false}
          disabled={!writable || busy !== undefined}
          onChange={event => {
            setDraft(event.currentTarget.value)
            setTestedUrl(undefined)
            setFeedback('idle')
          }}
        />
      </label>
      <p style={bodyStyle}>{t('proxyWorkflowHelp')}</p>
      <div style={actionsStyle}>
        <button type="button" style={buttonStyle} disabled={!writable || busy !== undefined} onClick={() => { void detect() }}>{busy === 'detect' ? t('proxyDetecting') : t('proxyDetect')}</button>
        <button type="button" style={buttonStyle} disabled={!writable || busy !== undefined || !valid} onClick={() => { void test() }}>{busy === 'test' ? t('proxyTesting') : t('proxyTest')}</button>
        <button type="button" style={primaryButtonStyle} disabled={!writable || busy !== undefined || testedUrl !== normalized} onClick={() => { void activate() }}>{busy === 'activate' ? t('proxyActivating') : t('proxyActivate')}</button>
        <button type="button" style={buttonStyle} disabled={!writable || busy !== undefined || !active} onClick={() => { void disable() }}>{busy === 'disable' ? t('proxyDisabling') : t('proxyDisable')}</button>
      </div>
      <span aria-live="polite">
        {feedback === 'detected' && candidate?.detected === true && candidate.valid ? <span style={successStyle}>{t('proxyEnvironmentDetected', { source: candidate.source, url: candidate.proxyUrl })}</span> : null}
        {feedback === 'none' ? <span style={bodyStyle}>{t('proxyEnvironmentNone')}</span> : null}
        {feedback === 'invalid-env' && candidate?.detected === true ? <span style={errorStyle}>{t('proxyEnvironmentInvalid', { source: candidate.source })}</span> : null}
        {feedback === 'test-ok' ? <span style={successStyle}>{t('proxyTestSucceeded')}</span> : null}
        {feedback === 'test-failed' ? <span style={errorStyle}>{t('proxyTestFailed')}</span> : null}
        {feedback === 'activated' ? <span style={successStyle}>{t('proxyActivated')}</span> : null}
        {feedback === 'disabled' ? <span style={bodyStyle}>{t('proxyDisabled')}</span> : null}
        {feedback === 'failed' ? <span style={errorStyle}>{t('proxyActionFailed')}</span> : null}
      </span>
    </section>
  )
}
