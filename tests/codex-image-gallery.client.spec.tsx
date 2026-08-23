// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import { CodexImageGallery } from '../src/client/CodexImageGallery.tsx'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Modal: ({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children?: ReactNode }) => {
    useEffect(() => {
      if (!open) return
      const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
      document.addEventListener('keydown', onKeyDown)
      return () => { document.removeEventListener('keydown', onKeyDown) }
    }, [onClose, open])
    if (!open) return null
    return createPortal(<div data-testid="mock-modal-root">
      <div aria-hidden="true" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label={title}>{children}</div>
    </div>, document.body)
  },
}))

const labels = {
  image: 'Image',
  open: 'Open image',
  openNamed: (name: string) => `Open ${name}`,
  loading: 'Loading image',
  loadFailed: 'Image could not be loaded. Retry',
  lightbox: { dialog: 'Image preview', close: 'Close image preview', zoomIn: 'Zoom in', zoomOut: 'Zoom out', reset: 'Fit image' },
}
const image: ImageAttachmentRef = {
  attachmentId: 'sha256:gallery' as ImageAttachmentRef['attachmentId'],
  mediaType: 'image/png',
  bytes: 120,
  width: 64,
  height: 32,
  name: 'gallery.png',
}

afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('Codex image gallery', () => {
  it('loads once, opens the lightbox, and restores focus after Escape', async () => {
    const load = vi.fn(async () => 'blob:gallery')
    render(<CodexImageGallery images={[{ attachment: image }]} load={load} align="start" labels={labels} />)

    await waitFor(() => { expect(load).toHaveBeenCalledOnce() })
    const thumbnail = screen.getByRole('button', { name: 'Open gallery.png' })
    fireEvent.click(thumbnail)
    const dialog = screen.getByRole('dialog', { name: labels.lightbox.dialog })
    expect(dialog.parentElement?.parentElement).toBe(document.body)
    expect(dialog.style.width).toBe('96vw')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: labels.lightbox.dialog })).toBeNull()
    expect(dialog.style.width).toBe('')
    expect(dialog.style.maxWidth).toBe('')
    expect(document.activeElement).toBe(thumbnail)
    expect(load).toHaveBeenCalledOnce()
  })

  it('closes the body-portaled lightbox when its mask is clicked', async () => {
    const load = vi.fn(async () => 'blob:gallery')
    render(<CodexImageGallery images={[{ attachment: image }]} load={load} align="start" labels={labels} />)

    await waitFor(() => { expect(load).toHaveBeenCalledOnce() })
    fireEvent.click(screen.getByRole('button', { name: 'Open gallery.png' }))
    const mask = document.body.querySelector('[aria-hidden="true"]')
    expect(mask).not.toBeNull()
    fireEvent.click(mask as HTMLElement)
    expect(screen.queryByRole('dialog', { name: labels.lightbox.dialog })).toBeNull()
  })

  it('fits the whole image, zooms to four times, and restores the fitted view', async () => {
    const load = vi.fn(async () => 'blob:gallery')
    render(<CodexImageGallery images={[{ attachment: image }]} load={load} align="start" labels={labels} />)

    await waitFor(() => { expect(load).toHaveBeenCalledOnce() })
    fireEvent.click(screen.getByRole('button', { name: 'Open gallery.png' }))
    const viewport = screen.getByTestId('codex-image-lightbox-viewport')
    const dialog = screen.getByRole('dialog', { name: labels.lightbox.dialog })
    const preview = viewport.querySelector('img')
    expect(preview).not.toBeNull()
    expect(viewport.style.width).toBe('100%')
    expect(viewport.style.height).toBe('100%')
    expect(viewport.style.overflow).toBe('auto')
    expect(dialog.style.width).toBe('96vw')
    expect(dialog.style.maxWidth).toBe('1200px')
    expect(preview?.style.objectFit).toBe('contain')
    expect(viewport.dataset.zoom).toBe('1')

    const zoomIn = screen.getByRole('button', { name: labels.lightbox.zoomIn })
    for (let step = 0; step < 6; step += 1) fireEvent.click(zoomIn)
    expect(viewport.dataset.zoom).toBe('4')
    expect((zoomIn as HTMLButtonElement).disabled).toBe(true)

    Object.defineProperty(viewport, 'scrollLeft', { configurable: true, writable: true, value: 120 })
    Object.defineProperty(viewport, 'scrollTop', { configurable: true, writable: true, value: 80 })
    fireEvent.pointerDown(viewport, { pointerId: 7, button: 0, clientX: 200, clientY: 180 })
    fireEvent.pointerMove(viewport, { pointerId: 7, clientX: 140, clientY: 130 })
    expect(viewport.scrollLeft).toBe(180)
    expect(viewport.scrollTop).toBe(130)
    fireEvent.pointerUp(viewport, { pointerId: 7 })

    fireEvent.click(screen.getByRole('button', { name: labels.lightbox.reset }))
    expect(viewport.dataset.zoom).toBe('1')
    expect(viewport.scrollLeft).toBe(0)
    expect(viewport.scrollTop).toBe(0)
  })

  it('offers retry after a failed load and does not reload on the loaded rerender', async () => {
    let attempts = 0
    const load = vi.fn(async () => {
      attempts += 1
      if (attempts === 1) throw new Error('temporary')
      return 'blob:gallery'
    })
    render(<CodexImageGallery images={[{ attachment: image }]} load={load} align="start" labels={labels} />)

    const retry = await screen.findByRole('button', { name: labels.loadFailed })
    fireEvent.click(retry)
    await waitFor(() => { expect(screen.getByRole('button', { name: 'Open gallery.png' })).toBeTruthy() })
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('ignores a late loader result after unmount', async () => {
    let resolve: ((value: string) => void) | undefined
    const load = vi.fn(() => new Promise<string>(done => { resolve = done }))
    const { unmount } = render(<CodexImageGallery images={[{ attachment: image }]} load={load} align="start" labels={labels} />)
    await waitFor(() => { expect(load).toHaveBeenCalledOnce() })
    unmount()
    resolve?.('blob:late')
    await Promise.resolve()
    expect(load).toHaveBeenCalledOnce()
  })
})
