/** Native browser view for Codex image-generation tool results. */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import type { PromptContentPart } from '@deepseek-ai/dsh-api-remotes/client'
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import type { PropsRuntime, Translate } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-tool/client'
import {
  IconCheckOutline16,
  IconCopyOutline16,
  writeClipboard,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { decodeImagePresentationMeta } from '../image-presentation.ts'
import { openAICodexOriginalImageUrl } from '../image-assets-contract.ts'
import type { OpenAICodexOriginalImageRef } from '../image-assets-contract.ts'
import type { OpenAICodexSettingsKey } from './locales.ts'
import { CodexImageGallery } from './CodexImageGallery.tsx'
import type { CodexImageGalleryLabels } from './CodexImageGallery.tsx'

export interface CodexImageToolViewInjected {
  sessions: ISessions
}

export type CodexImageToolViewProps = PropsRuntime<'tool.call.toolview'> & CodexImageToolViewInjected & { t: Translate<OpenAICodexSettingsKey> }

const shell: CSSProperties = { containerType: 'inline-size', padding: 12, border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 10, background: 'var(--dsw-alias-bg-module-platform)', color: 'var(--dsw-alias-label-primary)' }
const header: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }
const detail: CSSProperties = { color: 'var(--dsw-alias-label-tertiary)', fontSize: 13, lineHeight: '18px' }
const progress: CSSProperties = { width: '100%', height: 4, accentColor: 'var(--dsw-alias-brand-primary)' }
const action: CSSProperties = { justifySelf: 'start', minHeight: 28, border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 7, padding: '3px 10px', background: 'transparent', color: 'var(--dsw-alias-label-primary)', font: 'inherit', cursor: 'pointer' }
const actionRow: CSSProperties = { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }
const promptText: CSSProperties = { boxSizing: 'border-box', width: '100%', maxHeight: 96, margin: 0, overflowY: 'auto', padding: '10px 42px 10px 12px', color: 'var(--dsw-alias-label-secondary)', fontFamily: 'var(--dsw-font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace)', fontSize: 12, lineHeight: '18px', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', userSelect: 'text' }
const layoutStyle: CSSProperties = { display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 14, minWidth: 0 }
const visualStyle: CSSProperties = { display: 'grid', alignContent: 'start', flex: '1 1 240px', maxWidth: 320, gap: 10, minWidth: 0 }
const sideStyle: CSSProperties = { display: 'grid', alignContent: 'start', flex: '2 1 280px', gap: 10, minWidth: 0 }
const promptPanelStyle: CSSProperties = { display: 'grid', alignContent: 'start', gap: 10, minWidth: 0 }
const promptLabelStyle: CSSProperties = { fontSize: 13, fontWeight: 600, lineHeight: '18px', color: 'var(--dsw-alias-label-primary)' }
const promptBlockStyle: CSSProperties = { position: 'relative', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 8, background: 'var(--dsw-alias-bg-base)' }
const copyButtonStyle: CSSProperties = { position: 'absolute', zIndex: 1, top: 7, right: 7, display: 'grid', placeItems: 'center', width: 28, height: 28, padding: 0, border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 7, color: 'var(--dsw-alias-label-secondary)', background: 'var(--dsw-alias-bg-layer-1)', cursor: 'pointer', transition: 'opacity 120ms ease' }
const tooltipStyle: CSSProperties = { position: 'absolute', zIndex: 100, top: -8, right: 0, transform: 'translateY(-100%)', width: 'max-content', maxWidth: 'min(260px, 50vw)', padding: '3px 7px', borderRadius: 8, background: 'var(--dsw-alias-tooltip-bg)', color: 'var(--dsw-static-neutral-bluish-00)', fontSize: 13, lineHeight: '20px', whiteSpace: 'pre-line', overflowWrap: 'break-word', pointerEvents: 'none' }
const visuallyHidden: CSSProperties = { position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0 }

function contentText(content: readonly unknown[]): string | undefined {
  for (const block of content) {
    if (typeof block === 'object' && block !== null && (block as { type?: unknown }).type === 'text'
      && typeof (block as { text?: unknown }).text === 'string') return (block as { text: string }).text
  }
  return undefined
}

function presentation(block: CodexImageToolViewProps['block']) {
  if (!('kind' in block) || block.kind !== 'tool-result' || block.isError) return undefined
  return decodeImagePresentationMeta(block.meta)
}

function promptFromArgs(raw: string): string | undefined {
  try {
    const value: unknown = JSON.parse(raw)
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
    const prompt = (value as Record<string, unknown>).prompt
    if (typeof prompt !== 'string') return undefined
    const trimmed = prompt.trim()
    return trimmed.length > 0 && trimmed.length <= 32_000 ? trimmed : undefined
  } catch {
    return undefined
  }
}

function promptFor(block: CodexImageToolViewProps['block']): string | undefined {
  if (!('kind' in block)) return promptFromArgs(block.argsRaw)
  const decoded = decodeImagePresentationMeta(block.meta)
  if (decoded !== undefined) return decoded.prompt
  return block.call === null ? undefined : promptFromArgs(block.call.argsRaw)
}

type SessionAction = 'cancel' | 'follow-up'

function useSessionActions(sessionId: string, sessions: ISessions) {
  const [pending, setPending] = useState<SessionAction | null>(null)
  const [failed, setFailed] = useState(false)
  const alive = useRef(true)
  useEffect(() => () => { alive.current = false }, [])

  const run = useCallback(async (actionName: SessionAction, content?: PromptContentPart[]): Promise<boolean> => {
    if (pending !== null) return false
    const binding = sessions.binding(sessionId as Parameters<ISessions['binding']>[0])
    if (binding === undefined) {
      setFailed(true)
      return false
    }
    setFailed(false)
    setPending(actionName)
    try {
      const result = actionName === 'cancel'
        ? await binding.session.cancel()
        : await binding.session.prompt(content ?? [], 'queue')
      const accepted = result.ok
      if (alive.current) {
        setPending(null)
        setFailed(!accepted)
      }
      return accepted
    } catch {
      if (alive.current) {
        setPending(null)
        setFailed(true)
      }
      return false
    }
  }, [pending, sessionId, sessions])

  const cancel = useCallback(() => run('cancel'), [run])
  const followUp = useCallback((text: string) => run('follow-up', [{ type: 'text', text }]), [run])
  return { pending, failed, cancel, followUp }
}

function followUpPrompt(kind: 'retry' | 'regenerate' | 'edit', prompt: string, t: Translate<OpenAICodexSettingsKey>): string {
  if (kind === 'edit') return `${prompt}\n\n${t('editRequest')}`
  return prompt
}

function ActionError({ visible, t }: { visible: boolean; t: Translate<OpenAICodexSettingsKey> }) {
  return visible ? <span role="status" style={detail}>{t('actionFailed')}</span> : null
}

type DownloadState = 'idle' | 'pending' | 'failed'

function triggerDownload(url: string, name: string): void {
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.rel = 'noopener'
  document.body.append(anchor)
  try {
    anchor.click()
  } finally {
    anchor.remove()
  }
}

function DownloadButton({ label, onDownload, t }: {
  label: string
  onDownload: () => Promise<void>
  t: Translate<OpenAICodexSettingsKey>
}) {
  const [state, setState] = useState<DownloadState>('idle')
  const alive = useRef(true)
  useEffect(() => () => { alive.current = false }, [])

  async function download(): Promise<void> {
    if (state === 'pending') return
    setState('pending')
    try {
      await onDownload()
      if (alive.current) setState('idle')
    } catch {
      if (alive.current) setState('failed')
    }
  }

  const status = state === 'pending' ? t('downloading') : state === 'failed' ? t('downloadFailed') : undefined
  const buttonLabel = status ?? label
  return <>
    <button
      type="button"
      style={action}
      disabled={state === 'pending'}
      aria-busy={state === 'pending'}
      data-download-state={state}
      onClick={() => { void download() }}
    >
      {buttonLabel}
    </button>
    {status === undefined ? null : <span role="status" aria-live="polite" style={visuallyHidden}>{status}</span>}
  </>
}

async function downloadOriginal(sessionId: string, original: OpenAICodexOriginalImageRef): Promise<void> {
  const response = await fetch(openAICodexOriginalImageUrl(sessionId, original.assetId), {
    method: 'GET',
    headers: { accept: original.mediaType },
    credentials: 'same-origin',
  })
  if (!response.ok) throw new Error('Original image download failed')
  const blob = await response.blob()
  if (blob.size !== original.bytes) throw new Error('Original image download was incomplete')
  const url = URL.createObjectURL(blob)
  try {
    triggerDownload(url, original.name)
  } finally {
    URL.revokeObjectURL(url)
  }
}

function PromptPanel({ prompt, t }: { prompt: string; t: Translate<OpenAICodexSettingsKey> }) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [hoverless, setHoverless] = useState(false)
  const [tooltipVisible, setTooltipVisible] = useState(false)
  const tooltipId = useId()
  useEffect(() => {
    if (copyState === 'idle') return
    const timer = window.setTimeout(() => { setCopyState('idle') }, 2_000)
    return () => { window.clearTimeout(timer) }
  }, [copyState])
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const query = window.matchMedia('(hover: none)')
    const update = () => { setHoverless(query.matches) }
    update()
    query.addEventListener('change', update)
    return () => { query.removeEventListener('change', update) }
  }, [])

  async function copy(): Promise<void> {
    setCopyState(await writeClipboard(prompt) ? 'copied' : 'failed')
  }

  const copyLabel = copyState === 'copied' ? t('promptCopied') : copyState === 'failed' ? t('promptCopyFailed') : t('copyPrompt')
  const showCopy = hovered || focused || hoverless || copyState !== 'idle'
  return <section style={promptPanelStyle} aria-label={t('promptLabel')}>
    <strong style={promptLabelStyle}>{t('promptLabel')}</strong>
    <div
      style={promptBlockStyle}
      onMouseEnter={() => { setHovered(true) }}
      onMouseLeave={() => { setHovered(false) }}
      onFocusCapture={() => { setFocused(true) }}
      onBlurCapture={() => { setFocused(false) }}
    >
      <button
        type="button"
        style={{ ...copyButtonStyle, opacity: showCopy ? 1 : 0 }}
        aria-label={copyLabel}
        aria-describedby={tooltipVisible ? tooltipId : undefined}
        data-copy-state={copyState}
        onMouseEnter={() => { setTooltipVisible(true) }}
        onMouseLeave={() => { setTooltipVisible(false) }}
        onFocus={() => { setTooltipVisible(true) }}
        onBlur={() => { setTooltipVisible(false) }}
        onClick={() => { void copy() }}
      >
        {copyState === 'copied' ? <IconCheckOutline16 /> : <IconCopyOutline16 />}
      </button>
      {tooltipVisible ? <span id={tooltipId} role="tooltip" style={tooltipStyle}>{copyLabel}</span> : null}
      <pre style={promptText} tabIndex={0}>{prompt}</pre>
    </div>
    <span role="status" aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clipPath: 'inset(50%)' }}>{copyState === 'idle' ? '' : copyLabel}</span>
  </section>
}

function ResponsiveCard({ visual, side, label }: { visual: React.ReactNode; side?: React.ReactNode; label: string }) {
  return <section style={shell} aria-label={label}>
    <div style={layoutStyle} data-testid="image-generation-layout" data-responsive-layout="visual-prompt">
      <div style={side === undefined ? { ...visualStyle, maxWidth: 'none' } : visualStyle} data-testid="image-generation-visual">{visual}</div>
      {side === undefined ? null : <div style={sideStyle} data-testid="image-generation-prompt">{side}</div>}
    </div>
  </section>
}

function formatBytes(bytes: number): string {
  if (bytes < 1_000) return `${String(bytes)} B`
  if (bytes < 1_000_000) return `${(bytes / 1_000).toFixed(bytes < 10_000 ? 1 : 0)} KB`
  return `${(bytes / 1_000_000).toFixed(bytes < 10_000_000 ? 1 : 0)} MB`
}

function formatMediaType(mediaType: ImageAttachmentRef['mediaType']): string {
  return mediaType === 'image/jpeg' ? 'JPEG' : mediaType.slice('image/'.length).toUpperCase()
}

function useImageLoader(sessionId: string, sessions: ISessions) {
  const urls = useRef(new Map<string, { sessionId: string; url: string }>())
  const pending = useRef(new Map<string, Promise<string>>())
  const activeSession = useRef(sessionId)
  const disposed = useRef(false)
  activeSession.current = sessionId
  useEffect(() => () => {
    disposed.current = true
    for (const entry of urls.current.values()) URL.revokeObjectURL(entry.url)
    urls.current.clear()
  }, [])
  useEffect(() => () => {
    for (const [key, entry] of urls.current) {
      if (entry.sessionId !== sessionId) continue
      URL.revokeObjectURL(entry.url)
      urls.current.delete(key)
    }
  }, [sessionId])
  return useCallback(async (attachment: ImageAttachmentRef): Promise<string> => {
    const id = attachment.attachmentId as string
    const key = `${sessionId}\u0000${id}`
    const cached = urls.current.get(key)
    if (cached !== undefined) return cached.url
    const inflight = pending.current.get(key)
    if (inflight !== undefined) return inflight
    const request = (async () => {
      const binding = sessions.binding(sessionId as Parameters<ISessions['binding']>[0])
      if (binding === undefined) throw new Error('Image session is unavailable')
      const result = await binding.session.readAttachment(attachment.attachmentId)
      if (!result.ok || result.value.attachment.attachmentId !== attachment.attachmentId) throw new Error('Image attachment could not be read')
      if (disposed.current || activeSession.current !== sessionId) throw new Error('Image view is no longer active')
      const bytes = result.value.data.slice().buffer as ArrayBuffer
      const url = URL.createObjectURL(new Blob([bytes], { type: result.value.attachment.mediaType }))
      urls.current.set(key, { sessionId, url })
      return url
    })().finally(() => { pending.current.delete(key) })
    pending.current.set(key, request)
    return request
  }, [sessionId, sessions])
}

function labels(t: Translate<OpenAICodexSettingsKey>): CodexImageGalleryLabels {
  return {
    image: t('image'),
    open: t('open'),
    openNamed: label => t('openNamed', { name: label }),
    loading: t('loading'),
    loadFailed: t('loadFailed'),
    lightbox: {
      dialog: t('lightboxDialog'),
      close: t('lightboxClose'),
      zoomIn: t('lightboxZoomIn'),
      zoomOut: t('lightboxZoomOut'),
      reset: t('lightboxReset'),
    },
  }
}

function errorState(block: Extract<CodexImageToolViewProps['block'], { kind: 'tool-result' }>, t: Translate<OpenAICodexSettingsKey>) {
  const code = block.error?.code
  const canceled = code === 'ABORTED' || code === 'ABORTED_BEFORE_DISPATCH' || code === 'TOOL_ABORTED'
  if (canceled) return { title: t('canceled'), detail: t('canceledDetail') }
  const reauth = code === 'OPENAI_CODEX_REAUTH_REQUIRED' || contentText(block.content)?.includes('authorization') === true
  return { title: t('failed'), detail: reauth ? t('reauthRequired') : undefined }
}

export function CodexImageToolView({ block, sessionId, t, sessions }: CodexImageToolViewProps) {
  const load = useImageLoader(sessionId, sessions)
  const sessionActions = useSessionActions(sessionId, sessions)
  const galleryLabels = useMemo(() => labels(t), [t])
  const prompt = promptFor(block)
  const decoded = useMemo(() => presentation(block), [block])
  if (!('kind' in block)) return <ResponsiveCard
    label={t('generating')}
    visual={<div style={{ display: 'grid', gap: 10 }}>
      <div style={header}><strong>{t('generating')}</strong></div>
      <progress style={progress} aria-label={t('generating')} />
      <div style={detail}>{t('generatingDetail')}</div>
      <div style={actionRow}>
        <button type="button" style={action} disabled={sessionActions.pending !== null} aria-busy={sessionActions.pending === 'cancel'} onClick={() => { void sessionActions.cancel() }}>
          {sessionActions.pending === 'cancel' ? t('cancelingGeneration') : t('cancelGeneration')}
        </button>
        <ActionError visible={sessionActions.failed} t={t} />
      </div>
    </div>}
    side={prompt === undefined ? undefined : <PromptPanel prompt={prompt} t={t} />}
  />
  if (block.isError) {
    const state = errorState(block, t)
    return <ResponsiveCard
      label={state.title}
      visual={<div role="status" style={{ display: 'grid', gap: 10 }}>
        <strong>{state.title}</strong>
        {state.detail === undefined ? null : <span style={detail}>{state.detail}</span>}
        {prompt === undefined ? null : <div style={actionRow}>
          <button type="button" style={action} disabled={sessionActions.pending !== null} aria-busy={sessionActions.pending === 'follow-up'} onClick={() => { void sessionActions.followUp(followUpPrompt('retry', prompt, t)) }}>
            {sessionActions.pending === 'follow-up' ? t('actionSending') : t('retryGeneration')}
          </button>
          <ActionError visible={sessionActions.failed} t={t} />
        </div>}
      </div>}
      side={prompt === undefined ? undefined : <PromptPanel prompt={prompt} t={t} />}
    />
  }
  if (decoded === undefined) return <section style={shell} role="status"><strong>{t('completed')}</strong><span style={detail}>{t('unknownResult')}</span></section>

  return <ResponsiveCard
    label={t('completed')}
    visual={<><div style={header}><strong>{t('completed')}</strong></div><CodexImageGallery images={decoded.images.map(image => ({ attachment: image.preview }))} load={load} align="start" labels={galleryLabels} /></>}
    side={<>
      <PromptPanel prompt={decoded.prompt} t={t} />
      <div style={actionRow}>
        <button type="button" style={action} disabled={sessionActions.pending !== null} aria-busy={sessionActions.pending === 'follow-up'} onClick={() => { void sessionActions.followUp(followUpPrompt('regenerate', decoded.prompt, t)) }}>
          {sessionActions.pending === 'follow-up' ? t('actionSending') : t('regenerate')}
        </button>
        <button type="button" style={action} disabled={sessionActions.pending !== null} aria-busy={sessionActions.pending === 'follow-up'} onClick={() => { void sessionActions.followUp(followUpPrompt('edit', decoded.prompt, t)) }}>
          {sessionActions.pending === 'follow-up' ? t('actionSending') : t('editImage')}
        </button>
        <ActionError visible={sessionActions.failed} t={t} />
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{decoded.images.flatMap((image, index) => {
        const suffix = image.preview.name ?? String(index + 1)
        const exactOriginal = image.original
        const original = exactOriginal === undefined ? [] : [<DownloadButton
          key={`${image.preview.attachmentId as string}:original`}
          onDownload={() => downloadOriginal(sessionId, exactOriginal)}
          t={t}
          label={decoded.images.length === 1 ? t('downloadOriginal') : t('downloadOriginalNamed', { name: exactOriginal.name })}
        />]
        return [...original, <DownloadButton
          key={`${image.preview.attachmentId as string}:preview`}
          onDownload={async () => { triggerDownload(await load(image.preview), image.preview.name ?? t('image')) }}
          t={t}
          label={image.original === undefined
            ? decoded.images.length === 1 ? t('download') : t('downloadNamed', { name: suffix })
            : decoded.images.length === 1 ? t('downloadPreview') : t('downloadPreviewNamed', { name: suffix })}
        />]
      })}</div>
      <details>
        <summary style={{ cursor: 'pointer', color: 'var(--dsw-alias-label-secondary)', fontSize: 13 }}>{t('imageDetails')}</summary>
        <div style={{ ...detail, display: 'grid', gap: 4, marginTop: 6 }}>{decoded.images.flatMap((image, index) => {
          const preview = image.preview
          const original = image.original
          const name = preview.name ?? String(index + 1)
          if (original === undefined) return [<span key={preview.attachmentId as string}>{t('imageDetail', { name, format: formatMediaType(preview.mediaType), width: preview.width, height: preview.height, size: formatBytes(preview.bytes) })}</span>]
          return [
            <span key={`${preview.attachmentId as string}:original`}>{t('originalImageDetail', { name: original.name, format: formatMediaType(original.mediaType), width: original.width, height: original.height, size: formatBytes(original.bytes) })}</span>,
            <span key={`${preview.attachmentId as string}:preview`}>{t('previewImageDetail', { format: formatMediaType(preview.mediaType), width: preview.width, height: preview.height, size: formatBytes(preview.bytes) })}</span>,
          ]
        })}</div>
      </details>
    </>}
  />
}
