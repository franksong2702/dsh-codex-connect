/** Native browser view for Codex image-generation tool results. */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import type { ISessions } from '@deepseek-ai/dsh-client-runtime/client'
import type { PropsRuntime, Translate } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-tool/client'
import { ImageGallery } from '@deepseek-ai/dsh-client-ui-attachment'
import type { MessageImageLabels } from '@deepseek-ai/dsh-client-ui-attachment'
import { decodeImagePresentationMeta } from '../image-presentation.ts'
import type { OpenAICodexSettingsKey } from './locales.ts'

export interface CodexImageToolViewInjected {
  sessions: ISessions
}

export type CodexImageToolViewProps = PropsRuntime<'tool.call.toolview'> & CodexImageToolViewInjected & { t: Translate<OpenAICodexSettingsKey> }

const shell: CSSProperties = { display: 'grid', gap: 10, padding: 12, border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 10, background: 'var(--dsw-alias-bg-module-platform)', color: 'var(--dsw-alias-label-primary)' }
const header: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }
const detail: CSSProperties = { color: 'var(--dsw-alias-label-tertiary)', fontSize: 13, lineHeight: '18px' }
const progress: CSSProperties = { width: '100%', height: 4, accentColor: 'var(--dsw-alias-brand-primary)' }
const action: CSSProperties = { justifySelf: 'start', minHeight: 28, border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 7, padding: '3px 10px', background: 'transparent', color: 'var(--dsw-alias-label-primary)', font: 'inherit', cursor: 'pointer' }
const promptShell: CSSProperties = { display: 'grid', gap: 6, minWidth: 0 }
const promptText: CSSProperties = { boxSizing: 'border-box', width: '100%', maxHeight: 96, margin: 0, overflowY: 'auto', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 7, padding: '8px 10px', background: 'var(--dsw-alias-bg-base)', color: 'var(--dsw-alias-label-secondary)', font: 'inherit', fontSize: 13, lineHeight: '18px', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', userSelect: 'text' }

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

async function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText !== undefined) {
    await navigator.clipboard.writeText(value)
    return
  }
  const textarea = document.createElement('textarea')
  textarea.value = value
  textarea.setAttribute('readonly', '')
  Object.assign(textarea.style, { position: 'fixed', inset: '0', opacity: '0', pointerEvents: 'none' })
  document.body.append(textarea)
  textarea.select()
  try {
    if (!document.execCommand('copy')) throw new Error('Clipboard unavailable')
  } finally {
    textarea.remove()
  }
}

function PromptPanel({ prompt, t }: { prompt: string; t: Translate<OpenAICodexSettingsKey> }) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')
  useEffect(() => {
    if (copyState === 'idle') return
    const timer = window.setTimeout(() => { setCopyState('idle') }, 2_000)
    return () => { window.clearTimeout(timer) }
  }, [copyState])

  async function copy(): Promise<void> {
    try {
      await copyText(prompt)
      setCopyState('copied')
    } catch {
      setCopyState('failed')
    }
  }

  const copyLabel = copyState === 'copied' ? t('promptCopied') : copyState === 'failed' ? t('promptCopyFailed') : t('copyPrompt')
  return <section style={promptShell} aria-label={t('promptLabel')}>
    <div style={header}>
      <strong style={{ fontSize: 13 }}>{t('promptLabel')}</strong>
      <button type="button" style={action} onClick={() => { void copy() }}>{copyLabel}</button>
    </div>
    <pre style={promptText} tabIndex={0}>{prompt}</pre>
    <span role="status" aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clipPath: 'inset(50%)' }}>{copyState === 'idle' ? '' : copyLabel}</span>
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

function labels(t: Translate<OpenAICodexSettingsKey>): MessageImageLabels {
  return {
    image: t('image'),
    open: t('open'),
    openNamed: label => t('openNamed', { name: label }),
    loading: t('loading'),
    loadFailed: t('loadFailed'),
    lightbox: { dialog: t('lightboxDialog'), close: t('lightboxClose') },
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
  const galleryLabels = useMemo(() => labels(t), [t])
  const prompt = promptFor(block)
  if (!('kind' in block)) return <section style={shell} aria-label={t('generating')}><div style={header}><strong>{t('generating')}</strong></div><progress style={progress} aria-label={t('generating')} /><div style={detail}>{t('generatingDetail')}</div>{prompt === undefined ? null : <PromptPanel prompt={prompt} t={t} />}</section>
  if (block.isError) {
    const state = errorState(block, t)
    return <section style={shell} role="status"><strong>{state.title}</strong>{state.detail === undefined ? null : <span style={detail}>{state.detail}</span>}{prompt === undefined ? null : <PromptPanel prompt={prompt} t={t} />}</section>
  }
  const decoded = presentation(block)
  if (decoded === undefined) return <section style={shell} role="status"><strong>{t('completed')}</strong><span style={detail}>{t('unknownResult')}</span></section>

  async function download(image: ImageAttachmentRef): Promise<void> {
    const url = await load(image)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = image.name ?? t('image')
    anchor.rel = 'noopener'
    document.body.append(anchor)
    anchor.click()
    anchor.remove()
  }

  return <section style={shell} aria-label={t('completed')}>
    <div style={header}><strong>{t('completed')}</strong></div>
    <ImageGallery images={decoded.images.map(attachment => ({ attachment }))} load={load} align="start" labels={galleryLabels} />
    <PromptPanel prompt={decoded.prompt} t={t} />
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{decoded.images.map((image, index) => <button key={image.attachmentId as string} type="button" style={action} onClick={() => { void download(image) }}>{decoded.images.length === 1 ? t('download') : t('downloadNamed', { name: image.name ?? String(index + 1) })}</button>)}</div>
    <details>
      <summary style={{ cursor: 'pointer', color: 'var(--dsw-alias-label-secondary)', fontSize: 13 }}>{t('imageDetails')}</summary>
      <div style={{ ...detail, display: 'grid', gap: 4, marginTop: 6 }}>{decoded.images.map((image, index) => <span key={image.attachmentId as string}>{t('imageDetail', { name: image.name ?? String(index + 1), format: formatMediaType(image.mediaType), width: image.width, height: image.height, size: formatBytes(image.bytes) })}</span>)}</div>
    </details>
  </section>
}
