/** Explicit, nonpersistent conversation speed; a selected hint is not served-tier proof. */
import { useEffect, useId, useRef, useState } from 'react'
import { Menu } from '@deepseek-ai/dsh-client-ui-primitives'
import { OPENAI_CODEX_SPEED_MODE_PATH, readConversationSpeed } from '../speed-mode-contract.ts'
import type { ConversationSpeedState, OpenAICodexSpeedMode } from '../speed-mode-contract.ts'
import type { OpenAICodexSettingsKey } from './locales.ts'
import { requestJson } from './request-json.ts'

type Translate = (key: OpenAICodexSettingsKey) => string
const SPEED_MODES = ['standard', 'fast', 'ultrafast'] as const
const SPEED_ACTIVE_COLOR = '#f97316'

/**
 * Compact legacy-style bolt button that anchors a Standard/Fast/Ultrafast menu,
 * mirroring the DSH permission-level toggle. The host's shared Menu primitive
 * portals the list into document.body, opens it upward above the bottom
 * anchored Composer row (portal + align end + side top) and keeps it inside
 * the viewport, repositioning on scroll and resize while open. The request
 * lifecycle and routes are unchanged. Account availability gates Ultrafast
 * exactly as before; Fast and Standard remain selectable.
 */
export function OpenAICodexSpeedControl({ sessionId, model, t, available = true }: { sessionId: string; model: string; t: Translate; available?: boolean }) {
  const anchorRef = useRef<HTMLSpanElement>(null)
  const [selection, setSelection] = useState<ConversationSpeedState>()
  const [status, setStatus] = useState<'loading' | 'ready' | 'unconfirmed'>('loading')
  const [readAttempt, setReadAttempt] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)
  const [disclosureOpen, setDisclosureOpen] = useState(false)
  const controller = useRef<AbortController | undefined>(undefined)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const disclosureId = useId()

  useEffect(() => {
    const abort = new AbortController()
    controller.current = abort
    setStatus('loading')
    void requestJson(`${OPENAI_CODEX_SPEED_MODE_PATH}?sessionId=${encodeURIComponent(sessionId)}&model=${encodeURIComponent(model)}`, {
      method: 'GET', credentials: 'same-origin', headers: { accept: 'application/json' }, signal: abort.signal,
    }).then(({ response, value }) => {
      if (abort.signal.aborted) return
      const next = response.ok ? readConversationSpeed(value, model) : undefined
      setSelection(next); setStatus(next === undefined ? 'unconfirmed' : 'ready')
    }).catch(() => { if (!abort.signal.aborted) setStatus('unconfirmed') })
      .finally(() => { if (controller.current === abort) controller.current = undefined })
    return () => { abort.abort(); if (controller.current === abort) controller.current = undefined }
  }, [sessionId, model, readAttempt])

  // A view does not own the session choice. Navigation/unmount cancels only
  // this view's request; Host model/account lifecycle governs invalidation.
  useEffect(() => () => { controller.current?.abort() }, [])

  const select = (mode: OpenAICodexSpeedMode): void => {
    if (status !== 'ready' || selection === undefined || controller.current !== undefined) return
    const abort = new AbortController(); controller.current = abort; setStatus('loading')
    void requestJson(OPENAI_CODEX_SPEED_MODE_PATH, {
      method: 'POST', credentials: 'same-origin', headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId, model, generation: selection.generation, revision: selection.revision, mode }), signal: abort.signal,
    }).then(({ response, value }) => {
      if (abort.signal.aborted) return
      const next = response.ok ? readConversationSpeed(value, model) : undefined
      if (next !== undefined && next.mode === mode) { setSelection(next); setStatus('ready') }
      else setStatus('unconfirmed')
    }).catch(() => { if (!abort.signal.aborted) setStatus('unconfirmed') })
      .finally(() => { if (controller.current === abort) controller.current = undefined })
  }
  const canUltra = available && selection?.modelSupported === true && selection.hasAccount && selection.selectionAvailable

  // A disabled button cannot be focused and never sees hover on touch, so the
  // blocked reason cannot live only in its title. Fold the applicable reason
  // into the in-flow disclosure that the touch info action reveals and that
  // aria-describedby links to, keeping the standing quota text after it.
  const ultrafastReason = selection === undefined || canUltra
    ? undefined
    : t(selection.modelSupported ? 'ultrafastUnavailable' : 'ultrafastUnsupported')
  const ultrafastCopy = ultrafastReason === undefined
    ? t('ultrafastDisclosure')
    : `${ultrafastReason} ${t('ultrafastDisclosure')}`

  const closeMenu = (): void => { setMenuOpen(false); setDisclosureOpen(false) }
  const openMenu = (): void => {
    if (status !== 'ready') return
    setMenuOpen(true)
  }

  const choose = (mode: OpenAICodexSpeedMode): void => {
    closeMenu()
    buttonRef.current?.focus()
    select(mode)
  }

  // Rows settle with the composer-menu keys on top of the primitive's walk:
  // Tab closes without selecting (swallowing the default focus move) and
  // Enter/Space activate the focused row exactly once.
  const onRowKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, mode: OpenAICodexSpeedMode): void => {
    if (event.key === 'Tab') {
      event.preventDefault(); event.stopPropagation()
      closeMenu(); buttonRef.current?.focus()
      return
    }
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(mode) }
  }

  const onInfoKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>): void => {
    if (event.key === 'Tab' || event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation()
      closeMenu(); buttonRef.current?.focus()
    } else if (event.key === 'Enter' || event.key === ' ') {
      // Suppress the native click so either key toggles exactly once.
      event.preventDefault(); event.stopPropagation()
      setDisclosureOpen(open => !open)
    }
  }

  const onButtonKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>): void => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    if (status !== 'ready') return
    event.preventDefault()
    if (!menuOpen) openMenu()
  }

  const busy = status === 'loading'
  const currentMode = status === 'ready' ? selection?.mode : undefined
  const active = currentMode === 'fast' || currentMode === 'ultrafast'
  const label = busy
    ? t('speedLoading')
    : status === 'unconfirmed'
      ? t('speedRecover')
      : currentMode === 'fast'
        ? t('speedMenuFastTitle')
        : currentMode === 'ultrafast'
          ? t('speedMenuUltrafastTitle')
          : t('speedMenuStandardTitle')
  // The button only blocks while a read/write is in flight (main's contract).
  // Account availability gates Ultrafast exactly as before; Fast and Standard
  // stay selectable while the shared account mutates or no account is signed
  // in.
  const disabled = busy
  return <span ref={anchorRef} style={{ display: 'inline-flex', position: 'relative' }}>
    <Menu open={menuOpen && status === 'ready' && selection !== undefined} onClose={closeMenu}
      portal align="end" side="top" autoFocus
      // A fresh reader makes Menu's layout effect place the intrinsic-height
      // disclosure before paint, including its first expanded/collapsed frame.
      getAnchorRect={() => anchorRef.current?.getBoundingClientRect() ?? null}
      anchor={<>
        <button type="button" ref={buttonRef}
          data-openai-codex-speed-menu={currentMode ?? status}
          aria-label={label} title={label}
          aria-pressed={active} aria-busy={busy}
          aria-haspopup="menu" aria-expanded={menuOpen}
          disabled={disabled}
          onClick={() => {
            if (status === 'unconfirmed') { setReadAttempt(attempt => attempt + 1); return }
            if (menuOpen) closeMenu()
            else openMenu()
          }}
          onKeyDown={onButtonKeyDown}
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 30, height: 30, padding: 0, border: 0, borderRadius: 8,
            background: 'transparent',
            color: active ? SPEED_ACTIVE_COLOR : 'var(--dsw-alias-label-secondary)',
            cursor: disabled ? 'default' : 'pointer',
            opacity: busy ? 0.6 : 1,
          }}>
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path
              data-openai-codex-speed-bolt={active ? 'filled' : 'outline'}
              d="M13.1 2.75 5.35 13.1h5.8l-.95 8.15 8.45-11.2h-5.9l.35-7.3Z"
              fill={active ? 'currentColor' : 'none'}
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        {/* Standing quota hint while Ultrafast is the active mode: one orange
            dot next to the bolt; the button title carries the current mode. */}
        {status === 'ready' && currentMode === 'ultrafast' && <span
          data-openai-codex-speed-ultrafast-hint
          title={t('ultrafastDisclosure')}
          aria-hidden="true"
          style={{ width: 6, height: 6, borderRadius: 3, background: SPEED_ACTIVE_COLOR, display: 'inline-block', margin: '0 0 0 3px', flex: '0 0 auto' }}
        />}
      </>}>
    {/* Reveal above the rows at intrinsic height so enlarged text cannot be
        clipped by a fixed open-state cap. Keep the full description in flow
        at zero height when collapsed for its aria-describedby association.
        The explicit 138px width bounds intrinsic sizing in both states. */}
    <p id={disclosureId} style={{
      width: 138, maxWidth: '100%', boxSizing: 'border-box', margin: disclosureOpen ? '0 0 3px' : 0,
      maxHeight: disclosureOpen ? 'none' : 0, opacity: disclosureOpen ? 1 : 0, overflow: 'hidden',
      padding: disclosureOpen ? '8px 8px 10px' : 0,
      fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-label-secondary)',
      whiteSpace: 'normal', overflowWrap: 'anywhere',
      borderBottom: `0.5px ${disclosureOpen ? 'solid var(--dsw-alias-border-l2)' : 'solid transparent'}`,
      transition: 'opacity 140ms ease-out',
    }}>{ultrafastCopy}</p>
    {selection !== undefined && SPEED_MODES.map(mode => {
      const checked = selection.mode === mode
      // Fast is deliberately not account-gated (main's contract); only Ultrafast is.
      const itemDisabled = mode === 'ultrafast' && !canUltra
      // Distinguish a model that cannot take Ultrafast from an account/selection
      // that cannot authorize it; the disabled row gives the real reason.
      const reason = mode === 'ultrafast'
        ? (itemDisabled ? ultrafastReason : t('ultrafastDisclosure'))
        : undefined
      const row = <button key={mode} type="button" role="menuitemradio"
        data-speed-mode={mode}
        aria-checked={checked} disabled={itemDisabled}
        aria-describedby={mode === 'ultrafast' ? disclosureId : undefined}
        title={reason}
        onClick={() => { choose(mode) }}
        onKeyDown={event => { onRowKeyDown(event, mode) }}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          width: mode === 'ultrafast' ? 'auto' : '100%', flex: mode === 'ultrafast' ? 1 : undefined,
          minHeight: mode === 'ultrafast' ? 32 : undefined, padding: '6px 8px', border: 0, borderRadius: 6,
          background: 'transparent',
          color: checked ? SPEED_ACTIVE_COLOR : 'inherit',
          fontSize: 12, lineHeight: '18px', textAlign: 'left',
          cursor: itemDisabled ? 'default' : 'pointer',
          opacity: itemDisabled ? 0.6 : 1,
        }}>
        <span aria-hidden="true" style={{ width: 14, display: 'inline-block', textAlign: 'center' }}>{checked ? '✓' : ''}</span>
        {mode === 'standard' ? t('speedStandard') : mode === 'fast' ? t('speedFast') : 'Ultrafast'}
      </button>
      if (mode !== 'ultrafast') return row
      return <div key={mode} role="presentation" style={{ display: 'flex', alignItems: 'center', minHeight: 32 }}>
        {row}
        <button type="button" role="menuitem" aria-label={t('speedUltrafastDetails')}
          aria-expanded={disclosureOpen} aria-controls={disclosureId} aria-describedby={disclosureId}
          onClick={event => { event.currentTarget.focus(); setDisclosureOpen(open => !open) }} onKeyDown={onInfoKeyDown}
          onMouseEnter={event => { event.currentTarget.style.background = 'var(--dsw-alias-interactive-bg-hover)' }}
          onMouseLeave={event => { if (document.activeElement !== event.currentTarget) event.currentTarget.style.background = 'transparent' }}
          onFocus={event => {
            event.currentTarget.style.background = 'var(--dsw-alias-interactive-bg-hover)'
            event.currentTarget.style.outline = '2px solid currentColor'
          }}
          onBlur={event => { event.currentTarget.style.background = 'transparent'; event.currentTarget.style.outline = '' }}
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 32px',
            width: 32, height: 32, marginRight: 4, padding: 0, border: 0, borderRadius: 6,
            background: 'transparent', color: 'var(--dsw-alias-label-secondary)', cursor: 'pointer', outlineOffset: 2,
          }}>
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.2">
            <circle cx="6" cy="6" r="4.8" />
            <path d="M6 5.3v3" />
            <circle cx="6" cy="3.6" r="0.6" fill="currentColor" stroke="none" />
          </svg>
        </button>
      </div>
    })}
    </Menu>
    {/* Visually hidden live region: announces the speed read and each POST outcome. */}
    <span role="status" data-openai-codex-speed-status={status} style={{
      position: 'absolute', width: 1, height: 1, margin: -1, padding: 0, overflow: 'hidden',
      clip: 'rect(0 0 0 0)', clipPath: 'inset(50%)', whiteSpace: 'nowrap', border: 0,
    }}>{label}</span>
  </span>
}
