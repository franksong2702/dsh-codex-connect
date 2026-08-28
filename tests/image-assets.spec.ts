import { lstat, mkdtemp, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  OpenAICodexImageAssetStore,
  type SaveOpenAICodexOriginalImage,
} from '../src/image-assets.ts'

const PNG_1X1 = Uint8Array.from(Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC',
  'base64',
))
const roots: string[] = []

afterEach(async () => {
  const { rm } = await import('node:fs/promises')
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function setup(): Promise<{ root: string; store: OpenAICodexImageAssetStore }> {
  const root = await mkdtemp(join(tmpdir(), 'codex-image-assets-'))
  roots.push(root)
  return { root, store: new OpenAICodexImageAssetStore(root) }
}

function image(data: Uint8Array = PNG_1X1): SaveOpenAICodexOriginalImage {
  return { data, mediaType: 'image/png', width: 1, height: 1, name: 'codex-image-1.png' }
}

describe('OpenAI Codex exact original image store', () => {
  it('round-trips exact bytes only for the owning session with owner-only files', async () => {
    const { store } = await setup()
    const [ref] = await store.saveImages('session-owner', [image()])
    if (ref === undefined) throw new Error('missing saved image')

    await expect(store.read('session-other', ref.assetId)).resolves.toBeUndefined()
    const stored = await store.read('session-owner', ref.assetId)
    expect(stored?.ref).toEqual(ref)
    expect(stored?.data).toEqual(PNG_1X1)
    if (process.platform !== 'win32') {
      const directory = join(store.root, ref.assetId.slice(4, 6), ref.assetId)
      expect((await lstat(directory)).mode & 0o077).toBe(0)
      expect((await lstat(join(directory, 'original'))).mode & 0o077).toBe(0)
      expect((await lstat(join(directory, 'metadata.json'))).mode & 0o077).toBe(0)
    }
  })

  it('rejects corrupted exact bytes instead of serving them as an original', async () => {
    const { store } = await setup()
    const [ref] = await store.saveImages('session-owner', [image()])
    if (ref === undefined) throw new Error('missing saved image')
    const path = join(store.root, ref.assetId.slice(4, 6), ref.assetId, 'original')
    await writeFile(path, Buffer.from('corrupt'))
    await expect(store.read('session-owner', ref.assetId)).resolves.toBeUndefined()
  })

  it('rolls back earlier batch members when a later original is invalid', async () => {
    const { store } = await setup()
    await expect(store.saveImages('session-owner', [
      image(),
      { ...image(), data: Uint8Array.of(1, 2, 3) },
    ])).rejects.toThrow('original image bytes')
    const entries = await readdir(store.root, { recursive: true }).catch(() => [])
    expect(entries.filter(entry => /^img_/u.test(entry))).toEqual([])
  })
})
