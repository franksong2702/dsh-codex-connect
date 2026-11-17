/** Small read-only identity receipt; no account request, updater, polling or profile mutation. */
import { useEffect, useId, useState } from 'react'
import type { CSSProperties } from 'react'
import { CODEX_CONNECT_VERSION } from '../version.ts'
import type { OpenAICodexSettingsKey } from './locales.ts'
import { readRuntimeIdentity, runtimeIdentityReceipt } from './runtime-identity-client.ts'
import type { RuntimeIdentitySnapshot } from './runtime-identity-client.ts'

type Translation = (key: OpenAICodexSettingsKey, params?: Record<string, unknown>) => string

const sectionStyle: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 9, padding: '13px 15px', minWidth: 0,
  border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 12,
  color: 'var(--dsw-alias-label-primary)', background: 'var(--dsw-alias-bg-module-platform)',
}
const textStyle: CSSProperties = { margin: 0, fontSize: 13, lineHeight: '20px', color: 'var(--dsw-alias-label-secondary)', overflowWrap: 'anywhere' }
const rowStyle: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 9 }
const buttonStyle: CSSProperties = { padding: '5px 11px', minHeight: 32, borderRadius: 7, border: '1px solid var(--dsw-alias-border-l2)', background: 'var(--dsw-alias-bg-layer-1)', color: 'var(--dsw-alias-label-primary)', font: 'inherit', fontSize: 12, cursor: 'pointer' }
const receiptStyle: CSSProperties = { ...textStyle, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: 260, overflow: 'auto', padding: 9, background: 'var(--dsw-alias-bg-layer-2)', borderRadius: 7 }

function checkingSnapshot(): RuntimeIdentitySnapshot {
  return { status: 'checking', clientVersion: CODEX_CONNECT_VERSION, pluginVersionState: 'unknown' }
}

/** Mount/recheck performs one bounded same-origin read. Effect cleanup invalidates late responses. */
export function OpenAICodexRuntimeIdentity({ t }: { t: Translation }) {
  const [snapshot, setSnapshot] = useState<RuntimeIdentitySnapshot>(checkingSnapshot)
  const [attempt, setAttempt] = useState(0)
  const id = useId()
  useEffect(() => {
    const controller = new AbortController()
    setSnapshot(checkingSnapshot())
    void readRuntimeIdentity(CODEX_CONNECT_VERSION, controller.signal).then(next => {
      if (!controller.signal.aborted) setSnapshot(next)
    })
    return () => { controller.abort() }
  }, [attempt])
  const report = snapshot.report
  const unknown = t('runtimeUnknownValue')
  const compatibility = report?.compatibility.status
  const pairingKey = compatibility === 'compatible' ? 'runtimeDshVerified'
    : compatibility === 'unverified-in-range' ? 'runtimeDshInRange'
      : compatibility === 'known-bad' ? 'runtimeDshKnownBad' : undefined
  const stateKey = snapshot.status === 'checking' ? 'runtimeChecking'
    : snapshot.status === 'unavailable' ? 'runtimeUnavailable'
      : snapshot.pluginVersionState === 'match' ? 'runtimeVersionsMatch'
        : snapshot.pluginVersionState === 'mismatch' ? 'runtimeVersionsMismatch' : 'runtimeVersionsUnknown'
  return <section style={sectionStyle} aria-labelledby={id}>
    <div style={rowStyle}>
      <h3 id={id} style={{ margin: 0, fontSize: 14, lineHeight: '20px' }}>{t('runtimeHeading')}</h3>
      <button type="button" style={buttonStyle} disabled={snapshot.status === 'checking'} onClick={() => {
        setSnapshot(checkingSnapshot())
        setAttempt(value => value + 1)
      }}>{t('runtimeRecheck')}</button>
    </div>
    <p style={textStyle} role="status" data-runtime-version-state={snapshot.pluginVersionState}>{t(stateKey)}</p>
    <dl style={{ display: 'grid', gridTemplateColumns: 'minmax(100px, 1fr) minmax(0, 1fr)', gap: '5px 12px', margin: 0, ...textStyle }}>
      <dt>{t('runtimeClientVersion')}</dt><dd style={{ margin: 0 }}>{snapshot.clientVersion}</dd>
      <dt>{t('runtimeHostVersion')}</dt><dd style={{ margin: 0 }}>{report?.identity.loadedPluginVersion ?? unknown}</dd>
      <dt>{t('runtimeInstalledVersion')}</dt><dd style={{ margin: 0 }}>{report?.identity.installedPluginVersion ?? unknown}</dd>
      <dt>{t('runtimeDshVersion')}</dt><dd style={{ margin: 0 }}>{report?.currentDshVersion ?? unknown}</dd>
      {pairingKey === undefined ? null : <><dt>{t('runtimeDshCompatibility')}</dt><dd style={{ margin: 0 }}>{t(pairingKey)}</dd></>}
    </dl>
    {snapshot.pluginVersionState !== 'mismatch' ? null : <p style={textStyle}>{t('runtimeMismatchHelp')}</p>}
    <p style={textStyle}>{t('runtimeEvidenceBoundary')}</p>
    <details>
      <summary style={{ ...textStyle, cursor: 'pointer' }}>{t('runtimeReceipt')}</summary>
      <p style={textStyle}>{t('runtimePrivacy')}</p>
      <pre style={receiptStyle}>{JSON.stringify(runtimeIdentityReceipt(snapshot), null, 2)}</pre>
    </details>
  </section>
}
