import { Context } from '@deepseek-ai/cordis'
import { createToolResultMessage } from '@deepseek-ai/dsh-llm'
import { Session, SessionId, SessionStore } from '@deepseek-ai/dsh-session'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { httpRouteTestContext, rejectedHttpAdmissions } from './http-route-test-context.ts'
import type { CapturedHttpRoute, TestHttpAdmission } from './http-route-test-context.ts'
import { OpenAICodexImageAssetStore } from '../src/image-assets.ts'
import { OPENAI_CODEX_ORIGINAL_IMAGE_PATH } from '../src/image-assets-contract.ts'
import type { OpenAICodexOriginalImageRef } from '../src/image-assets-contract.ts'
import { registerOpenAICodexOriginalImageRoute } from '../src/image-asset-routes.ts'
import type { OpenAICodexTrustedOriginsStore } from '../src/trusted-origins.ts'
import { IMAGE_RESULT_PREFIX, IMAGE_EDIT_RESULT_PREFIX, IMAGE_RECOVERY_RESULT_PREFIX } from '../src/image-presentation.ts'

const PNG_1X1 = Uint8Array.from(Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC',
  'base64',
))
let root: string | undefined
const contexts: Context[] = []

afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

function capture(
  store: OpenAICodexImageAssetStore,
  sessions?: SessionStore,
  admission: TestHttpAdmission = 'allow',
  trustedOrigins = { has: async () => false } as unknown as OpenAICodexTrustedOriginsStore,
): CapturedHttpRoute {
  const { ctx, routes } = httpRouteTestContext({ admission, ...sessions === undefined ? {} : { sessions } })
  registerOpenAICodexOriginalImageRoute(ctx, trustedOrigins, store)
  const route = routes.get(`exact:${OPENAI_CODEX_ORIGINAL_IMAGE_PATH}`)
  if (route === undefined) throw new Error('original image route was not registered')
  return route
}

async function sessionContext(): Promise<Context> {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(SessionStore)
  return ctx
}

function recordImage(session: Session, ref: OpenAICodexOriginalImageRef): void {
  session.append('tool/result', {
    turn: 0, step: 0,
    message: createToolResultMessage({ callId: 'image-call' as never, isError: false, content: [{ type: 'text', text: 'Generated image' }] }),
    meta: {
      kind: 'codex-connect-images', schemaVersion: 1, prompt: 'Generate an image',
      images: [{ original: { ...ref }, preview: { attachmentId: 'preview-1', mediaType: 'image/png', width: 1, height: 1, bytes: PNG_1X1.byteLength } }],
    },
  }, { surfaceOp: 'append' })
}

function recordRecoveredImage(session: Session, ref: OpenAICodexOriginalImageRef, mode: 'native' | 'ptc', editing: boolean, isError = false): void {
  const meta = {
    kind: 'codex-connect-images', schemaVersion: 3, prompt: 'A recovered image',
    images: [{ original: { ...ref }, previewStatus: 'unavailable' }],
    ...(editing ? { operation: 'edit', edit: { target: { attachmentId: 'selected-upload' }, references: [] } } : {}),
  }
  const content = [{ type: 'text' as const, text: IMAGE_RECOVERY_RESULT_PREFIX + JSON.stringify(meta) }]
  if (mode === 'native') {
    session.append('tool/result', { turn: 0, step: 0,
      message: createToolResultMessage({ callId: 'recovery-call' as never, isError, content }), meta,
    }, { surfaceOp: 'append' })
  } else {
    session.append('tool/ptc-dispatch', { name: 'codex_connect_image_generate', isError,
      arguments: { prompt: meta.prompt }, content,
    } as never)
  }
}

async function download(route: CapturedHttpRoute, sessionId: string, assetId: string) {
  const res = response()
  await route.handler(request('GET', `${OPENAI_CODEX_ORIGINAL_IMAGE_PATH}?${new URLSearchParams({ sessionId, assetId })}`), res)
  return res
}

function request(method: string, url: string, remoteAddress = '127.0.0.1', origin?: string): IncomingMessage {
  return { method, url, socket: { remoteAddress }, headers: {
    host: '127.0.0.1:3081',
    ...origin === undefined ? {} : { origin },
  } } as unknown as IncomingMessage
}

function response(): ServerResponse & { status?: number; headers?: Record<string, string>; body?: Uint8Array | string } {
  const observed: { status?: number; headers?: Record<string, string>; body?: Uint8Array | string } = {}
  return {
    writeHead(status: number, headers?: Record<string, string>) {
      observed.status = status
      if (headers !== undefined) observed.headers = headers
      return this
    },
    end(body?: string | Uint8Array) { if (body !== undefined) observed.body = body; return this },
    get status() { return observed.status },
    get headers() { return observed.headers },
    get body() { return observed.body },
  } as unknown as ServerResponse & { status?: number; headers?: Record<string, string>; body?: Uint8Array | string }
}

describe('OpenAI Codex original image download route', () => {
  it.each([
    { mode: 'native' as const, editing: false }, { mode: 'ptc' as const, editing: false },
    { mode: 'native' as const, editing: true }, { mode: 'ptc' as const, editing: true },
  ])('downloads only inherited successful v3 originals ($mode, editing: $editing)', async ({ mode, editing }) => {
    root = await mkdtemp(join(tmpdir(), 'codex-image-v3-fork-'))
    const ctx = await sessionContext()
    const parent = ctx.sessions.create(SessionId('recovery-parent'))
    const early = ctx.sessions.fork(parent, undefined, SessionId('before-recovery'))
    const unrelated = ctx.sessions.create(SessionId('unrelated-recovery'))
    const store = new OpenAICodexImageAssetStore(root)
    const [original] = await store.saveImages(parent.id, [{ data: PNG_1X1, mediaType: 'image/png', width: 1, height: 1, name: 'recovered.png' }])
    if (original === undefined) throw new Error('missing actual recovered original')
    recordRecoveredImage(parent, original, mode, editing)
    const child = ctx.sessions.fork(parent, undefined, SessionId('recovery-child'))
    const grandchild = ctx.sessions.fork(child, undefined, SessionId('recovery-grandchild'))
    const route = capture(store, ctx.sessions)
    for (const session of [child, grandchild]) {
      const res = await download(route, session.id, original.assetId)
      expect(res.status).toBe(200)
      expect(res.headers).toMatchObject({ 'content-type': 'image/png', 'content-length': String(PNG_1X1.byteLength) })
      expect(Buffer.from(res.body as Uint8Array)).toEqual(Buffer.from(PNG_1X1))
    }
    // Identical metadata appended outside the inherited prefix cannot extend access.
    for (const session of [early, unrelated]) {
      recordRecoveredImage(session, original, mode, editing)
      expect((await download(route, session.id, original.assetId)).status).toBe(404)
    }
    const failedParent = ctx.sessions.create(SessionId('failed-recovery-parent'))
    const [failedOriginal] = await store.saveImages(failedParent.id, [{ data: PNG_1X1, mediaType: 'image/png', width: 1, height: 1, name: 'failed.png' }])
    if (failedOriginal === undefined) throw new Error('missing failure fixture original')
    recordRecoveredImage(failedParent, failedOriginal, mode, editing, true)
    const failedChild = ctx.sessions.fork(failedParent, undefined, SessionId('failed-recovery-child'))
    expect((await download(route, failedChild.id, failedOriginal.assetId)).status).toBe(404)
  })

  it.each(rejectedHttpAdmissions)('rejects $admission before reading Origin, sessions, or original assets', async ({ admission, status, error }) => {
    const read = vi.fn()
    const get = vi.fn()
    const has = vi.fn(async () => true)
    const route = capture(
      { read } as unknown as OpenAICodexImageAssetStore,
      { get } as unknown as SessionStore,
      admission,
      { has } as unknown as OpenAICodexTrustedOriginsStore,
    )
    for (const remoteAddress of ['127.0.0.1', '192.168.1.8']) {
      const res = response()
      await route.handler(request('GET', `${OPENAI_CODEX_ORIGINAL_IMAGE_PATH}?sessionId=s&assetId=img_${'a'.repeat(32)}`, remoteAddress), res)
      expect(res.status).toBe(status)
      expect(JSON.parse(res.body as string)).toEqual({ error })
    }
    expect(has).not.toHaveBeenCalled()
    expect(get).not.toHaveBeenCalled()
    expect(read).not.toHaveBeenCalled()
  })

  it('rejects a different Origin after Host admission before resolving sessions or reading assets', async () => {
    const read = vi.fn()
    const get = vi.fn()
    const route = capture({ read } as unknown as OpenAICodexImageAssetStore, { get } as unknown as SessionStore)
    const res = response()
    await route.handler(request('GET', `${OPENAI_CODEX_ORIGINAL_IMAGE_PATH}?sessionId=s&assetId=img_${'a'.repeat(32)}`, '127.0.0.1', 'http://127.0.0.1:9999'), res)
    expect(res.status).toBe(403)
    expect(JSON.parse(res.body as string)).toEqual({ error: 'forbidden' })
    expect(get).not.toHaveBeenCalled()
    expect(read).not.toHaveBeenCalled()
  })

  it('releases the original image route without deleting an unrelated route', async () => {
    const fixture = httpRouteTestContext()
    const unrelated: CapturedHttpRoute = { kind: 'exact', path: '/unrelated', handler: () => undefined }
    fixture.webServer.register(unrelated)
    registerOpenAICodexOriginalImageRoute(fixture.ctx, { has: async () => false } as unknown as OpenAICodexTrustedOriginsStore, { read: vi.fn() } as unknown as OpenAICodexImageAssetStore)
    await fixture.ctx.fiber.dispose()
    expect([...fixture.routes.values()]).toEqual([unrelated])
    expect(fixture.disposedPaths).toEqual([OPENAI_CODEX_ORIGINAL_IMAGE_PATH])
  })

  it.each(['tool/code-dispatch', 'tool/ptc-dispatch'])('authorizes only inherited successful %s original references', async (type) => {
    root = await mkdtemp(join(tmpdir(), 'codex-image-ptc-'))
    const store = new OpenAICodexImageAssetStore(root)
    const [ref] = await store.saveImages('owner', [{ data: PNG_1X1, mediaType: 'image/png', width: 1, height: 1, name: 'original.png' }])
    if (ref === undefined) throw new Error('missing image')
    const preview = { attachmentId: 'preview-1', mediaType: 'image/png', width: 1, height: 1, bytes: PNG_1X1.byteLength }
    const data = { name: 'codex_connect_image_generate', isError: false, arguments: { prompt: 'draw' }, content: [
      { type: 'text', text: IMAGE_RESULT_PREFIX + JSON.stringify([{ original: ref, preview }]) },
      { type: 'image', attachment: preview },
    ] }
    const makeRoute = (event: unknown, boundary = 1) => capture(store, { get: () => ({ header: { parentSession: 'owner' }, inheritedEventCount: boundary, snapshotEvents: () => [event] }) } as unknown as SessionStore)
    expect((await download(makeRoute({ type, seq: 0, data }), 'child', ref.assetId)).status).toBe(200)
    expect((await download(makeRoute({ type, seq: 0, data }, 0), 'child', ref.assetId)).status).toBe(404)
    expect((await download(makeRoute({ type, seq: 0, data: { ...data, isError: true } }), 'child', ref.assetId)).status).toBe(404)
    expect((await download(makeRoute({ type, seq: 0, data: { ...data, name: 'another-tool' } }), 'child', ref.assetId)).status).toBe(404)
  })
  it.each(['tool/code-dispatch', 'tool/ptc-dispatch'])('review: downloads inherited v2 %s edits with trimmed instructions', async type => {
    root = await mkdtemp(join(tmpdir(), 'codex-edit-fork-trim-'))
    const store = new OpenAICodexImageAssetStore(root)
    const [original] = await store.saveImages('owner', [{ data: PNG_1X1, mediaType: 'image/png', width: 1, height: 1, name: 'edited.png' }])
    if (original === undefined) throw new Error('missing fixture original')
    const preview = { attachmentId: 'preview-edit', mediaType: 'image/png', width: 1, height: 1, bytes: PNG_1X1.byteLength }
    const meta = { kind: 'codex-connect-images', schemaVersion: 2, operation: 'edit', prompt: 'change background',
      images: [{ original, preview }], edit: { target: { attachmentId: 'uploaded-image' }, references: [] } }
    const event = { type, seq: 0, data: { name: 'codex_connect_image_generate', isError: false,
      arguments: { operation: 'edit', prompt: '  change background  ', target: { attachmentId: 'uploaded-image' } },
      content: [{ type: 'text', text: IMAGE_EDIT_RESULT_PREFIX + JSON.stringify(meta) }, { type: 'image', attachment: preview }] } }
    const sessions = { get: () => ({ header: { parentSession: 'owner' }, inheritedEventCount: 1, snapshotEvents: () => [event] }) } as unknown as SessionStore
    expect((await download(capture(store, sessions), 'child', original.assetId)).status).toBe(200)
  })

  it('review: a failed native result cannot authorize an inherited original', async () => {
    root = await mkdtemp(join(tmpdir(), 'codex-edit-failed-grant-'))
    const store = new OpenAICodexImageAssetStore(root)
    const [original] = await store.saveImages('owner', [{ data: PNG_1X1, mediaType: 'image/png', width: 1, height: 1, name: 'original.png' }])
    if (original === undefined) throw new Error('missing fixture original')
    const preview = { attachmentId: 'preview-denied', mediaType: 'image/png', width: 1, height: 1, bytes: PNG_1X1.byteLength }
    const event = { type: 'tool/result', seq: 0, data: {
      message: { isError: true, content: [] },
      meta: { kind: 'codex-connect-images', schemaVersion: 1, prompt: 'failed', images: [{ original, preview }] },
    } }
    const sessions = { get: () => ({ header: { parentSession: 'owner' }, inheritedEventCount: 1, snapshotEvents: () => [event] }) } as unknown as SessionStore
    expect((await download(capture(store, sessions), 'child', original.assetId)).status).toBe(404)
  })

  it.each(['tool/result', 'tool/code-dispatch', 'tool/ptc-dispatch'])('confines seeded-only %s originals to their inherited prefix', async type => {
    root = await mkdtemp(join(tmpdir(), 'codex-image-seeded-'))
    const store = new OpenAICodexImageAssetStore(root)
    const [original] = await store.saveImages('owner', [{ data: PNG_1X1, mediaType: 'image/png', width: 1, height: 1, name: 'original.png' }])
    if (original === undefined) throw new Error('missing fixture original')
    const preview = { attachmentId: 'seeded-preview', mediaType: 'image/png', width: 1, height: 1, bytes: PNG_1X1.byteLength }
    const data = type === 'tool/result' ? {
      message: { isError: false, content: [] },
      meta: { kind: 'codex-connect-images', schemaVersion: 1, prompt: 'fixture', images: [{ original, preview }] },
    } : { name: 'codex_connect_image_generate', isError: false, arguments: { prompt: 'fixture' },
      content: [{ type: 'text', text: IMAGE_RESULT_PREFIX + JSON.stringify([{ original, preview }]) }, { type: 'image', attachment: preview }] }
    for (const [isSeeded, boundary, seq, expected] of [
      [true, 1, 0, 200],
      [false, 1, 0, 404], [undefined, 1, 0, 404], ['true', 1, 0, 404],
      [true, 0, 0, 404], [true, -1, 0, 404], [true, 1.5, 0, 404],
      [true, NaN, 0, 404], [true, Infinity, 0, 404], [true, Number.MAX_SAFE_INTEGER + 1, 0, 404],
      [true, 1, 1, 404], [true, 1, 2, 404],
    ] as const) {
      const sessions = { get: () => ({ header: { isSeeded }, inheritedEventCount: boundary,
        snapshotEvents: () => [{ type, seq, data }] }) } as unknown as SessionStore
      const res = await download(capture(store, sessions), 'seeded-child', original.assetId)
      expect(res.status, `isSeeded=${String(isSeeded)} boundary=${boundary} seq=${seq}`).toBe(expected)
      if (expected === 200) expect(Buffer.from(res.body as Uint8Array)).toEqual(Buffer.from(PNG_1X1))
    }
  })

  it('downloads inherited originals through nested forks and restored sessions without loading ancestors', async () => {
    root = await mkdtemp(join(tmpdir(), 'codex-image-fork-'))
    const ctx = await sessionContext()
    const parent = ctx.sessions.create(SessionId('parent'))
    const store = new OpenAICodexImageAssetStore(root)
    const [ref] = await store.saveImages(parent.id, [{ data: PNG_1X1, mediaType: 'image/png', width: 1, height: 1, name: 'original.png' }])
    if (ref === undefined) throw new Error('missing image')
    recordImage(parent, ref)
    const child = ctx.sessions.fork(parent, undefined, SessionId('child'))
    const grandchild = ctx.sessions.fork(child, undefined, SessionId('grandchild'))
    const route = capture(store, ctx.sessions)
    for (const session of [parent, child, grandchild]) {
      const res = await download(route, session.id, ref.assetId)
      expect(res.status).toBe(200)
      expect(Buffer.from(res.body as Uint8Array)).toEqual(Buffer.from(PNG_1X1))
    }

    // rc.1 names persistence ownership; alpha names the detached seed's aliasing state.
    const restoredOptions = {
      seed: JSON.parse(JSON.stringify(grandchild.snapshotEvents())),
      meta: JSON.parse(JSON.stringify(grandchild.header)),
      inheritedEventCount: grandchild.inheritedEventCount,
      seedSource: 'persistence' as const,
      eventState: 'detached' as const,
    }
    await ctx.fiber.dispose()
    const reopened = await sessionContext()
    const restored = reopened.sessions.prepare(grandchild.id, restoredOptions)
    reopened.sessions.enter(restored)
    reopened.sessions.announce(restored)
    expect(reopened.sessions.get(parent.id)).toBeUndefined()
    expect(reopened.sessions.get(child.id)).toBeUndefined()
    const restoredRoute = capture(new OpenAICodexImageAssetStore(root), reopened.sessions)
    expect((await download(restoredRoute, restored.id, ref.assetId)).status).toBe(200)
  })

  it('rejects unrelated sessions, earlier forks and references appended after the fork boundary', async () => {
    root = await mkdtemp(join(tmpdir(), 'codex-image-fork-denied-'))
    const ctx = await sessionContext()
    const parent = ctx.sessions.create(SessionId('parent'))
    const early = ctx.sessions.fork(parent, undefined, SessionId('early'))
    const unrelated = ctx.sessions.create(SessionId('unrelated'))
    const store = new OpenAICodexImageAssetStore(root)
    const [ref] = await store.saveImages(parent.id, [{ data: PNG_1X1, mediaType: 'image/png', width: 1, height: 1, name: 'original.png' }])
    if (ref === undefined) throw new Error('missing image')
    recordImage(parent, ref)
    const route = capture(store, ctx.sessions)
    expect((await download(route, early.id, ref.assetId)).status).toBe(404)
    recordImage(early, ref)
    recordImage(unrelated, ref)
    for (const id of [early.id, unrelated.id, 'missing-session']) {
      expect((await download(route, id, ref.assetId)).status).toBe(404)
    }
    expect((await download(capture(store), early.id, ref.assetId)).status).toBe(404)
  })

  it('rejects inherited metadata that does not match the stored original', async () => {
    root = await mkdtemp(join(tmpdir(), 'codex-image-fork-mismatch-'))
    const ctx = await sessionContext()
    const parent = ctx.sessions.create(SessionId('parent'))
    const store = new OpenAICodexImageAssetStore(root)
    const [ref] = await store.saveImages(parent.id, [{ data: PNG_1X1, mediaType: 'image/png', width: 1, height: 1, name: 'original.png' }])
    if (ref === undefined) throw new Error('missing image')
    recordImage(parent, { ...ref, sha256: '0'.repeat(64) })
    const child = ctx.sessions.fork(parent, undefined, SessionId('child'))
    expect((await download(capture(store, ctx.sessions), child.id, ref.assetId)).status).toBe(404)
  })

  it('serves exact session-owned bytes with attachment headers', async () => {
    root = await mkdtemp(join(tmpdir(), 'codex-image-route-'))
    const store = new OpenAICodexImageAssetStore(root)
    const [ref] = await store.saveImages('session-owner', [{
      data: PNG_1X1, mediaType: 'image/png', width: 1, height: 1, name: 'codex-image-1.png',
    }])
    if (ref === undefined) throw new Error('missing saved image')
    const route = capture(store)
    const res = response()
    const url = `${OPENAI_CODEX_ORIGINAL_IMAGE_PATH}?sessionId=session-owner&assetId=${ref.assetId}`
    await route.handler(request('GET', url), res)
    expect(res.status).toBe(200)
    expect(res.headers).toMatchObject({
      'content-type': 'image/png',
      'content-length': String(PNG_1X1.byteLength),
      'content-disposition': 'attachment; filename="codex-image-1.png"',
    })
    expect(Buffer.from(res.body as Uint8Array)).toEqual(Buffer.from(PNG_1X1))

    const wrongSession = response()
    await route.handler(request('GET', url.replace('session-owner', 'session-other')), wrongSession)
    expect(wrongSession.status).toBe(404)
  })

  it('rejects mutation, malformed ids, and untrusted peers before reading', async () => {
    root = await mkdtemp(join(tmpdir(), 'codex-image-route-'))
    const store = new OpenAICodexImageAssetStore(root)
    const route = capture(store)
    for (const [req, status] of [
      [request('POST', OPENAI_CODEX_ORIGINAL_IMAGE_PATH), 405],
      [request('GET', `${OPENAI_CODEX_ORIGINAL_IMAGE_PATH}?sessionId=s&assetId=../secret`), 400],
      [request('GET', `${OPENAI_CODEX_ORIGINAL_IMAGE_PATH}?sessionId=s&assetId=img_${'a'.repeat(32)}`, '192.168.1.9'), 403],
    ] as const) {
      const res = response()
      await route.handler(req, res)
      expect(res.status).toBe(status)
    }
  })
})
