/** Owner-only storage for exact GPT Image output bytes. */

import { createHash, randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, mkdir, open, readFile, rm } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { detectEncodedImage } from './image-format.ts'
import type { CodexImageMediaType } from './image-format.ts'
import {
  decodeOpenAICodexOriginalImageRef,
  OPENAI_CODEX_IMAGE_ASSET_ID_PATTERN,
} from './image-assets-contract.ts'
import type { OpenAICodexOriginalImageRef } from './image-assets-contract.ts'

/** Versioned plugin-owned root below DSH_HOME; this is not the DSH attachment store. */
export const OPENAI_CODEX_IMAGE_ASSET_DIRECTORY = 'dsh-codex-connect/images/v1'
/** Matches the bounded Host transport ceiling and prevents unbounded direct store use. */
export const OPENAI_CODEX_ORIGINAL_IMAGE_MAX_BYTES = 48 * 1024 * 1024

const METADATA_VERSION = 1
const ORIGINAL_FILENAME = 'original'
const METADATA_FILENAME = 'metadata.json'
const SAFE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u

export interface SaveOpenAICodexOriginalImage {
  data: Uint8Array
  mediaType: CodexImageMediaType
  width: number
  height: number
  name: string
}

interface StoredImageDocument {
  version: typeof METADATA_VERSION
  sessionId: string
  image: OpenAICodexOriginalImageRef
}

export interface StoredOpenAICodexOriginalImage {
  ref: OpenAICodexOriginalImageRef
  data: Uint8Array
}

function digest(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex')
}

function positiveSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

function mediaType(value: unknown): value is CodexImageMediaType {
  return value === 'image/png' || value === 'image/jpeg' || value === 'image/webp'
}

function validSessionId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 512
}

function parseDocument(text: string): StoredImageDocument | undefined {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return undefined
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const candidate = value as Record<string, unknown>
  if (candidate.version !== METADATA_VERSION || !validSessionId(candidate.sessionId)) return undefined
  const image = decodeOpenAICodexOriginalImageRef(candidate.image)
  return image === undefined ? undefined : { version: METADATA_VERSION, sessionId: candidate.sessionId, image }
}

async function assertOwnerFile(filename: string): Promise<void> {
  const metadata = await lstat(filename)
  if (!metadata.isFile()) throw new Error('original image object is not a regular file')
  /* v8 ignore next -- native Windows does not expose POSIX permission semantics. */
  if (process.platform !== 'win32' && (metadata.mode & 0o077) !== 0) {
    throw new Error('original image object is readable beyond its owner')
  }
}

async function writeBinaryFile(filename: string, data: Uint8Array): Promise<void> {
  await mkdir(dirname(filename), { recursive: true, mode: 0o700 })
  const handle = await open(filename, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600)
  try {
    await handle.writeFile(data)
    await handle.sync()
  } finally {
    await handle.close()
  }
}

/** Exact-byte image store kept separate from DSH's deliberately normalized attachments. */
export class OpenAICodexImageAssetStore {
  readonly root: string

  constructor(dshHome?: string) {
    this.root = resolve(join(resolveDshHome(dshHome), OPENAI_CODEX_IMAGE_ASSET_DIRECTORY))
  }

  private directory(assetId: string): string {
    if (!OPENAI_CODEX_IMAGE_ASSET_ID_PATTERN.test(assetId)) throw new TypeError('invalid original image asset id')
    return join(this.root, assetId.slice(4, 6), assetId)
  }

  private async saveOne(sessionId: string, input: SaveOpenAICodexOriginalImage): Promise<OpenAICodexOriginalImageRef> {
    if (!validSessionId(sessionId)) throw new TypeError('invalid original image session id')
    if (!(input.data instanceof Uint8Array) || input.data.byteLength < 1
      || input.data.byteLength > OPENAI_CODEX_ORIGINAL_IMAGE_MAX_BYTES
      || !mediaType(input.mediaType) || !positiveSafeInteger(input.width) || !positiveSafeInteger(input.height)
      || !SAFE_NAME_PATTERN.test(input.name)) throw new TypeError('invalid original image input')
    const detected = detectEncodedImage(input.data)
    if (detected === undefined || detected.mediaType !== input.mediaType
      || detected.width !== input.width || detected.height !== input.height) {
      throw new TypeError('original image bytes do not match their declared metadata')
    }

    const assetId = `img_${randomUUID().replaceAll('-', '')}`
    const directory = this.directory(assetId)
    const ref: OpenAICodexOriginalImageRef = {
      assetId,
      mediaType: input.mediaType,
      width: input.width,
      height: input.height,
      bytes: input.data.byteLength,
      name: input.name,
      sha256: digest(input.data),
    }
    try {
      await mkdir(dirname(directory), { recursive: true, mode: 0o700 })
      await mkdir(directory, { recursive: false, mode: 0o700 })
      await writeBinaryFile(join(directory, ORIGINAL_FILENAME), input.data)
      const document: StoredImageDocument = { version: METADATA_VERSION, sessionId, image: ref }
      await writeFileAtomic(join(directory, METADATA_FILENAME), `${JSON.stringify(document, null, 2)}\n`, {
        mode: 0o600,
        dirMode: 0o700,
      })
      return ref
    } catch (error) {
      await rm(directory, { recursive: true, force: true }).catch(() => undefined)
      throw error
    }
  }

  /** Save one complete response batch and remove already-written members if a later write fails. */
  async saveImages(
    sessionId: string,
    inputs: readonly SaveOpenAICodexOriginalImage[],
  ): Promise<readonly OpenAICodexOriginalImageRef[]> {
    if (inputs.length < 1 || inputs.length > 4) throw new TypeError('original image batch must contain 1 to 4 images')
    const refs: OpenAICodexOriginalImageRef[] = []
    try {
      for (const input of inputs) refs.push(await this.saveOne(sessionId, input))
      return refs
    } catch (error) {
      await this.removeImages(refs)
      throw error
    }
  }

  /** Remove exact assets created by a failed cross-store operation. */
  async removeImages(refs: readonly Pick<OpenAICodexOriginalImageRef, 'assetId'>[]): Promise<void> {
    await Promise.all(refs.map(async ref => {
      try {
        await rm(this.directory(ref.assetId), { recursive: true, force: true })
      } catch {
        // Cleanup is best-effort; a valid published result is never removed here.
      }
    }))
  }

  /**
   * Read verified bytes for the owner or a server-authorized inherited reference.
   * @param sessionId - requesting session.
   * @param assetId - opaque original identifier.
   * @param inherited - reference resolved from the session's immutable fork prefix, never request data.
   * @returns the exact original, or undefined for denied access or invalid files.
   */
  async read(
    sessionId: string,
    assetId: string,
    inherited?: OpenAICodexOriginalImageRef,
  ): Promise<StoredOpenAICodexOriginalImage | undefined> {
    if (!validSessionId(sessionId) || !OPENAI_CODEX_IMAGE_ASSET_ID_PATTERN.test(assetId)) return undefined
    const directory = this.directory(assetId)
    const metadataPath = join(directory, METADATA_FILENAME)
    const originalPath = join(directory, ORIGINAL_FILENAME)
    try {
      await Promise.all([assertOwnerFile(metadataPath), assertOwnerFile(originalPath)])
      const document = parseDocument(await readFile(metadataPath, 'utf8'))
      if (document === undefined || document.image.assetId !== assetId) return undefined
      if (document.sessionId !== sessionId && (inherited === undefined
        || inherited.assetId !== document.image.assetId || inherited.sha256 !== document.image.sha256
        || inherited.mediaType !== document.image.mediaType || inherited.width !== document.image.width
        || inherited.height !== document.image.height || inherited.bytes !== document.image.bytes
        || inherited.name !== document.image.name)) return undefined
      const data = new Uint8Array(await readFile(originalPath))
      const detected = detectEncodedImage(data)
      if (data.byteLength !== document.image.bytes || digest(data) !== document.image.sha256
        || detected === undefined || detected.mediaType !== document.image.mediaType
        || detected.width !== document.image.width || detected.height !== document.image.height) return undefined
      return { ref: document.image, data }
    } catch {
      return undefined
    }
  }
}
