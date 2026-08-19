import { describe, expect, it } from 'vitest'
import { decodeStrictBase64, estimateBase64Bytes } from '../src/base64.ts'
import { detectEncodedImage } from '../src/image-format.ts'

function png(width: number, height: number): Uint8Array {
  const data = new Uint8Array(45)
  data.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  new DataView(data.buffer).setUint32(8, 13)
  data.set([0x49, 0x48, 0x44, 0x52], 12)
  new DataView(data.buffer).setUint32(16, width)
  new DataView(data.buffer).setUint32(20, height)
  data.set([0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0, 0, 0, 0], 33)
  return data
}

function jpeg(width: number, height: number): Uint8Array {
  return Uint8Array.from([
    0xff, 0xd8,
    0xff, 0xc0, 0x00, 0x0b, 0x08,
    (height >>> 8) & 0xff, height & 0xff,
    (width >>> 8) & 0xff, width & 0xff,
    0x01, 0x01, 0x11, 0x00,
    0xff, 0xd9,
  ])
}

function webpVp8x(width: number, height: number): Uint8Array {
  const data = new Uint8Array(30)
  data.set([0x52, 0x49, 0x46, 0x46])
  new DataView(data.buffer).setUint32(4, 22, true)
  data.set([0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x58], 8)
  new DataView(data.buffer).setUint32(16, 10, true)
  const w = width - 1
  const h = height - 1
  data.set([w & 0xff, (w >>> 8) & 0xff, (w >>> 16) & 0xff], 24)
  data.set([h & 0xff, (h >>> 8) & 0xff, (h >>> 16) & 0xff], 27)
  return data
}

describe('strict base64', () => {
  it('estimates and decodes canonical base64 only', () => {
    expect(estimateBase64Bytes('TQ==')).toBe(1)
    expect(decodeStrictBase64('TQ==')).toEqual(Uint8Array.from([0x4d]))
    for (const invalid of ['', 'TQ=', 'TR==', 'TWF=', 'TQ==\n', 'data:image/png;base64,TQ==', 'TQ-_']) {
      expect(estimateBase64Bytes(invalid)).toBeUndefined()
      expect(decodeStrictBase64(invalid)).toBeUndefined()
    }
  })
})
describe('encoded image detection', () => {
  it('derives dimensions from PNG, JPEG, and WebP headers', () => {
    expect(detectEncodedImage(png(3, 5))).toEqual({ mediaType: 'image/png', width: 3, height: 5 })
    expect(detectEncodedImage(jpeg(7, 11))).toEqual({ mediaType: 'image/jpeg', width: 7, height: 11 })
    expect(detectEncodedImage(webpVp8x(13, 17))).toEqual({ mediaType: 'image/webp', width: 13, height: 17 })
  })

  it('rejects unsupported, truncated, and malformed inputs without throwing', () => {
    const truncatedPng = png(1, 1).subarray(0, 32)
    const overrunJpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0xff, 0xff])
    const badWebp = webpVp8x(1, 1)
    new DataView(badWebp.buffer).setUint32(4, 23, true)
    for (const data of [
      new Uint8Array(),
      Uint8Array.from([0xff, 0xff, 0xff]),
      new TextEncoder().encode('GIF89a'),
      truncatedPng,
      overrunJpeg,
      badWebp,
    ]) {
      expect(() => detectEncodedImage(data)).not.toThrow()
      expect(detectEncodedImage(data)).toBeUndefined()
    }
  })
})
