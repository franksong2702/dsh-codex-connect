/** OpenAI Codex account card contributed to Harness Plugin configuration. */

import { useState } from 'react'
import type { CSSProperties } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import { OpenAICodexSettings } from './OpenAICodexSettings.tsx'
import type { OpenAICodexSettingsInjected } from './OpenAICodexSettings.tsx'

/** Dependencies injected by the browser-plugin registration. */
export type OpenAICodexPluginCardInjected = OpenAICodexSettingsInjected

/** Props delivered by the Plugin configuration item slot. */
export type OpenAICodexPluginCardProps =
  PropsRuntime<'settings.plugin.item'>
  & OpenAICodexPluginCardInjected

const cardStyle: CSSProperties = {
  overflow: 'hidden',
  border: '1px solid var(--dsw-alias-border-l2)',
  borderRadius: 10,
}
const headerStyle: CSSProperties = {
  boxSizing: 'border-box',
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 16,
  border: 0,
  padding: '13px 14px',
  background: 'transparent',
  color: 'var(--dsw-alias-label-primary)',
  font: 'inherit',
  textAlign: 'left',
  cursor: 'pointer',
}
const headTextStyle: CSSProperties = { display: 'flex', minWidth: 0, flexDirection: 'column', gap: 3 }
const nameStyle: CSSProperties = { fontSize: 14, lineHeight: '20px', fontWeight: 600 }
const descriptionStyle: CSSProperties = { fontSize: 13, lineHeight: '18px', color: 'var(--dsw-alias-label-tertiary)' }
const chevronStyle: CSSProperties = { flex: '0 0 auto', color: 'var(--dsw-alias-label-tertiary)', transition: 'transform 160ms ease' }
const cardBodyStyle: CSSProperties = { borderTop: '1px solid var(--dsw-alias-border-l2)', padding: '16px 14px 18px' }

/** The same 14px outline glyph used by DSH's native PluginCard. */
function NativeChevronDown({ open }: { open: boolean }) {
  return (
    <span aria-hidden="true" style={{ ...chevronStyle, transform: open ? 'rotate(180deg)' : 'none' }}>
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M11.8486 5.5L11.4238 5.92383L8.69727 8.65137C8.44157 8.90706 8.21562 9.13382 8.01172 9.29785C7.79912 9.46883 7.55595 9.61756 7.25 9.66602C7.08435 9.69222 6.91565 9.69222 6.75 9.66602C6.44405 9.61756 6.20088 9.46883 5.98828 9.29785C5.78438 9.13382 5.55843 8.90706 5.30273 8.65137L2.57617 5.92383L2.15137 5.5L3 4.65137L3.42383 5.07617L6.15137 7.80273C6.42595 8.07732 6.59876 8.24849 6.74023 8.3623C6.87291 8.46904 6.92272 8.47813 6.9375 8.48047C6.97895 8.48703 7.02105 8.48703 7.0625 8.48047C7.07728 8.47813 7.12709 8.46904 7.25977 8.3623C7.40124 8.24849 7.57405 8.07732 7.84863 7.80273L10.5762 5.07617L11 4.65137L11.8486 5.5Z"
          fill="currentColor"
        />
      </svg>
    </span>
  )
}

/** Render account management as one expandable Plugin configuration card. */
export function OpenAICodexPluginCard({ t, configScope, updater, account }: OpenAICodexPluginCardProps) {
  if (t === undefined) throw new Error('OpenAI Codex plugin card requires its translation function')
  const [open, setOpen] = useState(false)
  const title = t('title')
  return (
    <li style={{ ...cardStyle, background: `var(--dsw-alias-bg-layer-${open ? '2' : '3'})` }}>
      <button
        type="button"
        style={headerStyle}
        aria-expanded={open}
        aria-label={`${t(open ? 'collapse' : 'expand')}: ${title}`}
        onClick={() => { setOpen(!open) }}
      >
        <span style={headTextStyle}>
          <span style={nameStyle}>{title}</span>
          <span style={descriptionStyle}>{t('intro')}</span>
        </span>
        <NativeChevronDown open={open} />
      </button>
      {open
        ? <div style={cardBodyStyle}>
            <OpenAICodexSettings
              t={t}
              {...account === undefined ? {} : { account }}
              {...updater === undefined ? {} : { updater }}
              embedded
              {...configScope === undefined ? {} : { configScope }}
            />
          </div>
        : null}
    </li>
  )
}
