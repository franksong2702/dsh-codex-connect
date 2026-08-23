import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import type { CDPSession as PlaywrightCDPSession } from '@vitest/browser-playwright'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cdp, page, userEvent } from 'vitest/browser'
import { CodexImageGallery } from '../../src/client/CodexImageGallery.tsx'
import type { CodexImageGalleryLabels } from '../../src/client/CodexImageGallery.tsx'

const labels: CodexImageGalleryLabels = {
  image: 'Image',
  open: 'Open image',
  openNamed: name => `Open ${name}`,
  loading: 'Loading image',
  loadFailed: 'Image could not be loaded. Retry',
  lightbox: {
    dialog: 'Image preview',
    close: 'Close image preview',
    zoomIn: 'Zoom in',
    zoomOut: 'Zoom out',
    reset: 'Fit image',
  },
}

const image: ImageAttachmentRef = {
  attachmentId: 'sha256:browser-gallery' as ImageAttachmentRef['attachmentId'],
  mediaType: 'image/png',
  bytes: 800,
  width: 1600,
  height: 900,
  name: 'browser-gallery.png',
}

const imageSource = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

let host: HTMLDivElement
let root: Root

beforeEach(async () => {
  await page.viewport(1280, 800)
  host = document.createElement('div')
  host.style.width = '100%'
  host.style.height = '1px'
  document.body.append(host)
  root = createRoot(host)
})

afterEach(() => {
  root.unmount()
  host.remove()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('Codex image gallery in Chromium', () => {
  it('fits the image, exposes real zoom overflow and drag scrolling, then restores focus on Escape', async () => {
    const load = vi.fn(async () => imageSource)
    root.render(createElement(CodexImageGallery, {
      images: [{ attachment: image }],
      load,
      align: 'start',
      labels,
    }))

    const opener = page.getByRole('button', { name: 'Open browser-gallery.png' })
    await opener.findElement()
    await page.getByAltText('browser-gallery.png').findElement()
    const openerElement = opener.element()
    await opener.click()

    const dialog = page.getByRole('dialog', { name: labels.lightbox.dialog })
    const dialogElement = await dialog.findElement()
    const viewport = page.getByTestId('codex-image-lightbox-viewport')
    const viewportElement = await viewport.findElement()
    const preview = viewport.getByAltText('browser-gallery.png')
    const previewElement = await preview.findElement()

    expect(dialogElement.style.width).toBe('96vw')
    expect(dialogElement.style.maxWidth).toBe('1200px')
    expect(dialogElement.getBoundingClientRect().width).toBeGreaterThan(380)
    expect(previewElement.style.objectFit).toBe('contain')
    expect(viewportElement.dataset.zoom).toBe('1')
    expect(viewportElement.scrollWidth).toBe(viewportElement.clientWidth)
    expect(viewportElement.scrollHeight).toBe(viewportElement.clientHeight)

    const zoomIn = page.getByRole('button', { name: labels.lightbox.zoomIn })
    for (let step = 0; step < 6; step += 1) await zoomIn.click()
    expect(viewportElement.dataset.zoom).toBe('4')
    expect(viewportElement.scrollWidth).toBeGreaterThan(viewportElement.clientWidth)
    expect(viewportElement.scrollHeight).toBeGreaterThan(viewportElement.clientHeight)

    const bounds = viewportElement.getBoundingClientRect()
    const initialScrollLeft = viewportElement.scrollLeft
    const initialScrollTop = viewportElement.scrollTop
    const mouse = cdp() as unknown as PlaywrightCDPSession
    await mouse.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      button: 'left',
      clickCount: 1,
      x: bounds.left + bounds.width / 2,
      y: bounds.top + bounds.height / 2,
    })
    await mouse.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      button: 'left',
      buttons: 1,
      x: bounds.left + bounds.width / 2 - 100,
      y: bounds.top + bounds.height / 2 - 80,
    })
    await mouse.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      button: 'left',
      x: bounds.left + bounds.width / 2 - 100,
      y: bounds.top + bounds.height / 2 - 80,
    })
    expect(viewportElement.scrollLeft).toBeGreaterThan(initialScrollLeft)
    expect(viewportElement.scrollTop).toBeGreaterThan(initialScrollTop)

    await page.getByRole('button', { name: labels.lightbox.reset }).click()
    expect(viewportElement.dataset.zoom).toBe('1')
    expect(viewportElement.scrollLeft).toBe(0)
    expect(viewportElement.scrollTop).toBe(0)

    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => { expect(dialog.query()).toBeNull() })
    expect(dialogElement.style.width).toBe('')
    expect(dialogElement.style.maxWidth).toBe('')
    expect(document.activeElement).toBe(openerElement)
    expect(load).toHaveBeenCalledTimes(1)
  })
})
