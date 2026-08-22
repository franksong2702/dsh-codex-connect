/** Self-contained result-image gallery for the tool-call view.
 *
 * DSH 0.1.1-rc.2 keeps the attachment package's React atoms behind its
 * conversation slots. A tool-call view cannot render those slots, so this
 * gallery owns only the durable-image presentation it needs and receives all
 * stateful work through props.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import { Modal } from '@deepseek-ai/dsh-client-ui-primitives'

export interface CodexImageGalleryLabels {
  /** Fallback display name for an unnamed image. */
  image: string
  /** Thumbnail tooltip inviting the original-image preview. */
  open: string
  /** Accessible thumbnail label; receives the image's display name. */
  openNamed: (label: string) => string
  /** Loading placeholder shown until bytes resolve. */
  loading: string
  /** Retry-control label shown when loading fails. */
  loadFailed: string
  /** Lightbox labels. */
  lightbox: { dialog: string; close: string }
}

export type CodexImageLoader = (attachment: ImageAttachmentRef) => Promise<string>

const galleryStyle: CSSProperties = { display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 8 }
const imageFrameStyle: CSSProperties = { display: 'grid', placeItems: 'center', padding: 0, overflow: 'hidden', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 8, background: 'var(--dsw-alias-bg-base)', color: 'var(--dsw-alias-label-secondary)', cursor: 'pointer' }
const loadingStyle: CSSProperties = { padding: 10, fontSize: 12 }
const errorStyle: CSSProperties = { minHeight: 32, padding: '6px 10px', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 7, background: 'transparent', color: 'var(--dsw-alias-label-secondary)', cursor: 'pointer' }
const lightboxStyle: CSSProperties = { position: 'relative', display: 'grid', maxWidth: 'min(96vw, 1200px)', maxHeight: '96vh', minWidth: 0, minHeight: 0 }
const lightboxImageStyle: CSSProperties = { display: 'block', maxWidth: '96vw', maxHeight: '92vh', objectFit: 'contain' }
const closeStyle: CSSProperties = { position: 'absolute', top: 8, right: 8, zIndex: 1, width: 32, height: 32, border: '1px solid rgba(255,255,255,0.35)', borderRadius: 7, background: 'rgba(0,0,0,0.5)', color: '#fff', font: 'inherit', cursor: 'pointer' }

function singleFit(attachment: ImageAttachmentRef): { width: number; height: number; objectPosition: string } {
  const natural = attachment.width / attachment.height
  const ratio = Math.min(4, Math.max(0.25, natural))
  const box = ratio >= 1 ? { width: 240, height: 240 / ratio } : { width: 240 * ratio, height: 240 }
  const scale = Math.min(1, attachment.width / box.width, attachment.height / box.height)
  return {
    width: Math.max(1, Math.round(box.width * scale)),
    height: Math.max(1, Math.round(box.height * scale)),
    objectPosition: natural < 0.25 ? 'center top' : natural > 4 ? 'left center' : 'center',
  }
}

function CodexImageLightbox({ src, alt, labels, opener, onClose }: {
  src: string
  alt: string
  labels: CodexImageGalleryLabels['lightbox']
  opener: HTMLElement | null
  onClose: () => void
}) {
  const closeButton = useRef<HTMLButtonElement | null>(null)
  useEffect(() => {
    closeButton.current?.focus()
    return () => { opener?.focus() }
  }, [opener])
  return <Modal open onClose={onClose} title={labels.dialog} closeLabel={labels.close} headless>
    <div style={lightboxStyle}>
      <button ref={closeButton} type="button" aria-label={labels.close} title={labels.close} style={closeStyle} onClick={onClose}>×</button>
      <img src={src} alt={alt} style={lightboxImageStyle} />
    </div>
  </Modal>
}

function CodexMessageImage({ attachment, load, variant, labels }: {
  attachment: ImageAttachmentRef
  load: CodexImageLoader
  variant: 'single' | 'tile'
  labels: CodexImageGalleryLabels
}) {
  const [src, setSrc] = useState<string | null>(null)
  const [error, setError] = useState(false)
  const [open, setOpen] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const opener = useRef<HTMLButtonElement | null>(null)
  const retry = useCallback(() => { setAttempt(value => value + 1) }, [])
  const closeLightbox = useCallback(() => { setOpen(false) }, [])
  const fit = useMemo(() => (variant === 'single' ? singleFit(attachment) : undefined), [attachment.attachmentId, attachment.height, attachment.width, variant])

  useEffect(() => {
    let live = true
    setError(false)
    setSrc(null)
    void load(attachment).then(url => { if (live) setSrc(url) }).catch(() => { if (live) setError(true) })
    return () => { live = false }
  }, [attachment.attachmentId, attachment.bytes, attachment.height, attachment.mediaType, attachment.name, attachment.width, attempt, load])

  const label = attachment.name ?? labels.image
  if (error) return <button type="button" style={errorStyle} data-variant={variant} onClick={retry}>{labels.loadFailed}</button>
  return <>
    <button
      type="button"
      ref={opener}
      style={fit === undefined ? { ...imageFrameStyle, width: 64, height: 64 } : { ...imageFrameStyle, width: fit.width, height: fit.height }}
      data-variant={variant}
      title={labels.open}
      aria-label={labels.openNamed(label)}
      onClick={() => { if (src !== null) setOpen(true) }}
    >
      {src === null
        ? <span style={loadingStyle}>{labels.loading}</span>
        : <img src={src} alt={label} style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover', objectPosition: fit?.objectPosition }} />}
    </button>
    {open && src !== null ? <CodexImageLightbox src={src} alt={label} labels={labels.lightbox} opener={opener.current} onClose={closeLightbox} /> : null}
  </>
}

/** Render durable generated images without relying on rc.2 private React atoms. */
export function CodexImageGallery({ images, load, align, labels }: {
  images: readonly { attachment: ImageAttachmentRef }[]
  load: CodexImageLoader
  align: 'start' | 'end'
  labels: CodexImageGalleryLabels
}) {
  if (images.length === 0) return null
  const variant = images.length === 1 ? 'single' : 'tile'
  return <div data-testid="codex-image-gallery" data-align={align} style={{ ...galleryStyle, justifyContent: align === 'end' ? 'flex-end' : 'flex-start' }}>
    {images.map((image, index) => <CodexMessageImage key={`${image.attachment.attachmentId}:${index}`} {...image} load={load} variant={variant} labels={labels} />)}
  </div>
}
