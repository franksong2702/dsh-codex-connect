import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OpenAICodexCredentialStore, OPENAI_CODEX_PROVIDER } from '../src/store.ts'
import { OpenAICodexBackendRequests } from '../src/backend-request.ts'
import { OpenAICodexTransport, OPENAI_CODEX_IMAGE_EDIT_URL, OPENAI_CODEX_IMAGE_GENERATION_URL } from '../src/transport.ts'
import type { ImageEditRequest } from '../src/transport.ts'
import { IMAGE_EDIT_MAX_IMAGE_BYTES, snapshotImageEditRequest } from '../src/image-edit-request.ts'

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC', 'base64')
const SECOND_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')
const roots: string[] = []
const contexts: Context[] = []
const governors: OpenAICodexBackendRequests[] = []

afterEach(async () => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
  for (const governor of governors.splice(0)) governor.dispose()
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

function input(): ImageEditRequest {
  return { prompt: 'Change only the background', images: [{ data: Uint8Array.from(PNG), mediaType: 'image/png' }] }
}

function reply(status = 200): Response {
  return new Response(JSON.stringify(status === 200 ? { data: [{ b64_json: PNG.toString('base64') }] } : { private: 'DO_NOT_LEAK' }), {
    status, headers: { 'content-type': 'application/json' },
  })
}

async function setup(governed = false, hint = '') {
  const root = await mkdtemp(join(tmpdir(), 'codex-edit-transport-'))
  roots.push(root)
  const store = new OpenAICodexCredentialStore(join(root, 'synthetic-auth.json'))
  await store.modify(OPENAI_CODEX_PROVIDER, async () => ({
    type: 'oauth', access: 'synthetic-access', refresh: 'synthetic-refresh', accountId: 'synthetic-account', expires: Date.now() + 3_600_000,
  }))
  const capture = vi.spyOn(store, 'captureActiveAccount')
  const ctx = new Context()
  contexts.push(ctx)
  const requests = governed ? new OpenAICodexBackendRequests() : undefined
  if (requests !== undefined) governors.push(requests)
  let service!: OpenAICodexTransport
  await ctx.plugin(scope => { service = new OpenAICodexTransport(scope, store, undefined, undefined, () => hint, requests) })
  return { service, store, capture }
}

describe('Codex OAuth image editing transport', () => {
  it.each([false, true])('posts ordered inline images to edits, preserving identity (governed=%s)', async governed => {
    const fetch = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => reply())
    vi.stubGlobal('fetch', fetch)
    const { service } = await setup(governed)
    const request = input()
    const second = Uint8Array.from(SECOND_PNG)
    expect(second).not.toEqual(request.images[0]!.data)
    const result = await service.editImages({ ...request, images: [...request.images, { data: second, mediaType: 'image/png' }] }, {})
    expect(fetch).toHaveBeenCalledOnce()
    const [url, init] = fetch.mock.calls[0]!
    expect(url).toBe(OPENAI_CODEX_IMAGE_EDIT_URL)
    expect(init?.redirect).toBe('manual')
    expect(JSON.parse(String(init?.body))).toEqual({
      model: 'gpt-image-2', prompt: request.prompt,
      images: [request.images[0]!.data, second].map(data => ({ image_url: `data:image/png;base64,${Buffer.from(data).toString('base64')}` })),
    })
    const headers = new Headers(init?.headers)
    expect(headers.get('originator')).toBe('deepseek-harness')
    expect(headers.get('authorization')).toBe('Bearer synthetic-access')
    expect(headers.get('chatgpt-account-id')).toBe('synthetic-account')
    expect(result.images[0]?.b64Json).toBe(PNG.toString('base64'))
    expect(JSON.stringify(result)).not.toContain('synthetic-access')
  })

  it.each([
    { prompt: 'edit', images: [] },
    { prompt: 'edit' },
    { prompt: '', images: [{ data: PNG, mediaType: 'image/png' }] },
    { prompt: 'x'.repeat(32_001), images: [{ data: PNG, mediaType: 'image/png' }] },
    { prompt: 'edit', images: Array.from({ length: 6 }, () => ({ data: PNG, mediaType: 'image/png' })) },
    { prompt: 'edit', images: [{ data: new Uint8Array(), mediaType: 'image/png' }] },
    { prompt: 'edit', images: [{ data: Buffer.from('not an image'), mediaType: 'image/png' }] },
    { prompt: 'edit', images: [{ data: PNG, mediaType: 'image/jpeg' }] },
    { prompt: 'edit', images: [{ data: PNG, mediaType: 'image/png', file_id: 'not-a-dsh-id' }] },
    { prompt: 'edit', images: [{ data: new Uint8Array(IMAGE_EDIT_MAX_IMAGE_BYTES + 1), mediaType: 'image/png' }] },
    { ...input(), endpoint: 'https://example.invalid' },
  ])('rejects invalid edit input before authentication and never generates instead %#', async invalid => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const { service, capture } = await setup()
    await expect(service.editImages(invalid as ImageEditRequest, {})).rejects.toMatchObject({ code: 'OPENAI_CODEX_INVALID_REQUEST' })
    expect(capture).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('snapshots mutable image bytes, input order and prompt before awaiting credentials', async () => {
    const fetch = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => reply())
    vi.stubGlobal('fetch', fetch)
    const { service, store, capture } = await setup()
    const captured = await store.captureActiveAccount()
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    capture.mockImplementation(async () => { await gate; return captured })
    const image = { data: Uint8Array.from(PNG), mediaType: 'image/png' as const }
    const request = { prompt: 'original instruction', images: [image] }
    const pending = service.editImages(request, {})
    request.prompt = 'mutated instruction'
    image.data.fill(0)
    request.images.length = 0
    release()
    await pending
    const body = JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))
    expect(body.prompt).toBe('original instruction')
    expect(body.images).toEqual([{ image_url: `data:image/png;base64,${PNG.toString('base64')}` }])
  })

  it.each([302, 400, 401, 403, 429, 500, 503])('does not retry or switch to generation when edit returns HTTP %s', async status => {
    const fetch = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => reply(status))
    vi.stubGlobal('fetch', fetch)
    const { service } = await setup()
    const error = await service.editImages(input(), {}).catch((error: unknown) => error)
    expect(error).toBeInstanceOf(Error)
    expect(String(error)).not.toContain('DO_NOT_LEAK')
    expect(fetch).toHaveBeenCalledOnce()
    expect(fetch.mock.calls[0]?.[0]).toBe(OPENAI_CODEX_IMAGE_EDIT_URL)
  })

  it('rejects a pre-canceled edit without authentication or dispatch', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const { service, capture } = await setup()
    const controller = new AbortController()
    controller.abort()
    await expect(service.editImages(input(), { signal: controller.signal })).rejects.toMatchObject({ code: 'OPENAI_CODEX_CANCELED' })
    expect(capture).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('uses the configured image model hint without changing endpoint or auth identity', async () => {
    const fetch = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => reply())
    vi.stubGlobal('fetch', fetch)
    const { service } = await setup(false, 'gpt-image-test')
    await service.editImages(input(), {})
    expect(fetch.mock.calls[0]?.[0]).toBe(OPENAI_CODEX_IMAGE_EDIT_URL)
    expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body)).model).toBe('gpt-image-test')
  })

  it('rejects malformed edit responses instead of using a response URL or generating again', async () => {
    const fetch = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(
      JSON.stringify({ data: [{ url: 'https://private.invalid/image' }] }), { headers: { 'content-type': 'application/json' } },
    ))
    vi.stubGlobal('fetch', fetch)
    const { service } = await setup()
    const error = await service.editImages(input(), {}).catch((error: unknown) => error)
    expect(error).toMatchObject({ code: 'OPENAI_CODEX_MALFORMED_RESPONSE' })
    expect(String(error)).not.toContain('private.invalid')
    expect(fetch).toHaveBeenCalledOnce()
  })

  it('does not resubmit an edit after a transport failure with unknown completion', async () => {
    const fetch = vi.fn(async () => { throw new Error('DO_NOT_LEAK') })
    vi.stubGlobal('fetch', fetch)
    const { service } = await setup()
    const error = await service.editImages(input(), {}).catch((error: unknown) => error)
    expect(error).toMatchObject({ code: 'OPENAI_CODEX_NETWORK_ERROR' })
    expect(String(error)).not.toContain('DO_NOT_LEAK')
    expect(fetch).toHaveBeenCalledOnce()
  })

  it('retains existing prompt-only generation after adding edit capability', async () => {
    const fetch = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => reply())
    vi.stubGlobal('fetch', fetch)
    const { service } = await setup()
    await service.generateImages({ prompt: 'new image' }, {})
    expect(fetch.mock.calls[0]?.[0]).toBe(OPENAI_CODEX_IMAGE_GENERATION_URL)
    expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toEqual({ model: 'gpt-image-2', prompt: 'new image' })
  })

  it('keeps provider projections free of local attachment ids and unknown caller fields', () => {
    const snapshot = snapshotImageEditRequest(input())
    expect(Object.keys(snapshot.images[0]!)).toEqual(['image_url'])
    expect(snapshot.images[0]?.image_url.startsWith('data:image/png;base64,')).toBe(true)
  })
})
