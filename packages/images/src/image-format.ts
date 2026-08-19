/** Pure encoded-image header validation for PNG, JPEG, and WebP. */

export type CodexImageMediaType = 'image/png' | 'image/jpeg' | 'image/webp'

export interface DetectedImage {
  mediaType: CodexImageMediaType
  width: number
  height: number
}
/** WebP's maximum representable canvas side; also bounds safe pixel multiplication. */
export const MAX_IMAGE_DIMENSION = 1 << 24

function ascii(data: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...data.subarray(start, end))
}

function validDimensions(mediaType: CodexImageMediaType, width: number, height: number): DetectedImage | undefined {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height)
    || width < 1 || height < 1 || width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) return undefined
  return { mediaType, width, height }
}

function png(data: Uint8Array, view: DataView): DetectedImage | undefined {
  if (data.byteLength < 45 || ascii(data, 12, 16) !== 'IHDR' || view.getUint32(8) !== 13) return undefined
  const end = data.byteLength - 12
  if (view.getUint32(end) !== 0 || ascii(data, end + 4, end + 8) !== 'IEND') return undefined
  return validDimensions('image/png', view.getUint32(16), view.getUint32(20))
}

const JPEG_SOF_MARKERS = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf])

function jpeg(data: Uint8Array, view: DataView): DetectedImage | undefined {
  let offset = 2
  let iterations = 0
  while (offset < data.byteLength && iterations++ < 4096) {
    if (data[offset] !== 0xff) return undefined
    while (offset < data.byteLength && data[offset] === 0xff) offset += 1
    if (offset >= data.byteLength) return undefined
    const marker = data[offset] ?? 0
    offset += 1
    if (marker === 0x00) return undefined
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      if (marker === 0xd9) return undefined
      continue
    }
    if (marker === 0xda || offset + 2 > data.byteLength) return undefined
    const segmentLength = view.getUint16(offset)
    if (segmentLength < 2 || offset + segmentLength > data.byteLength) return undefined
    if (JPEG_SOF_MARKERS.has(marker)) {
      if (segmentLength < 7) return undefined
      return validDimensions('image/jpeg', view.getUint16(offset + 5), view.getUint16(offset + 3))
    }
    offset += segmentLength
  }
  return undefined
}

function readUint24LE(data: Uint8Array, offset: number): number {
  return (data[offset] ?? 0) | ((data[offset + 1] ?? 0) << 8) | ((data[offset + 2] ?? 0) << 16)
}

function webp(data: Uint8Array, view: DataView): DetectedImage | undefined {
  if (data.byteLength < 20 || ascii(data, 8, 12) !== 'WEBP' || view.getUint32(4, true) + 8 !== data.byteLength) return undefined
  const kind = ascii(data, 12, 16)
  const size = view.getUint32(16, true)
  const payload = 20
  if (payload + size > data.byteLength) return undefined
  if (kind === 'VP8X') {
    if (size < 10) return undefined
    return validDimensions('image/webp', readUint24LE(data, payload + 4) + 1, readUint24LE(data, payload + 7) + 1)
  }
  if (kind === 'VP8L') {
    if (size < 5 || data[payload] !== 0x2f) return undefined
    const packed = view.getUint32(payload + 1, true) >>> 0
    return validDimensions('image/webp', (packed & 0x3fff) + 1, ((packed >>> 14) & 0x3fff) + 1)
  }
  if (kind === 'VP8 ') {
    if (size < 10 || ((data[payload] ?? 1) & 1) !== 0
      || data[payload + 3] !== 0x9d || data[payload + 4] !== 0x01 || data[payload + 5] !== 0x2a) return undefined
    return validDimensions('image/webp', view.getUint16(payload + 6, true) & 0x3fff, view.getUint16(payload + 8, true) & 0x3fff)
  }
  return undefined
}

/** Detect an encoded PNG, JPEG, or WebP and derive its intrinsic dimensions. */
export function detectEncodedImage(data: Uint8Array): DetectedImage | undefined {
  try {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
    if (data.byteLength >= 8
      && data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47
      && data[4] === 0x0d && data[5] === 0x0a && data[6] === 0x1a && data[7] === 0x0a) return png(data, view)
    if (data.byteLength >= 2 && data[0] === 0xff && data[1] === 0xd8) return jpeg(data, view)
    if (data.byteLength >= 12 && ascii(data, 0, 4) === 'RIFF') return webp(data, view)
    return undefined
  } catch {
    return undefined
  }
}
