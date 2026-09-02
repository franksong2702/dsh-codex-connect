import { Context } from '@deepseek-ai/cordis'
import { createToolResultMessage } from '@deepseek-ai/dsh-llm'
import { Session, SessionId, SessionStore } from '@deepseek-ai/dsh-session'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { OpenAICodexImageAssetStore } from '../src/image-assets.ts'
import { OPENAI_CODEX_ORIGINAL_IMAGE_PATH } from '../src/image-assets-contract.ts'
import type { OpenAICodexOriginalImageRef } from '../src/image-assets-contract.ts'
import { registerOpenAICodexOriginalImageRoute } from '../src/image-asset-routes.ts'
import type { OpenAICodexTrustedOriginsStore } from '../src/trusted-origins.ts'

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

interface CapturedRoute {
  path: string
  handler(req: IncomingMessage, res: ServerResponse): Promise<void> | void
}

function capture(store: OpenAICodexImageAssetStore, sessions?: SessionStore): CapturedRoute {
  let route: CapturedRoute | undefined
  const ctx = {
    webServer: { register(value: CapturedRoute) { route = value; return () => undefined } },
    effect(factory: () => void | (() => void)) { return factory() },
    get: () => sessions,
  } as unknown as Context
  registerOpenAICodexOriginalImageRoute(
    ctx,
    { has: async () => false } as unknown as OpenAICodexTrustedOriginsStore,
    store,
  )
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

async function download(route: CapturedRoute, sessionId: string, assetId: string) {
  const res = response()
  await route.handler(request('GET', `${OPENAI_CODEX_ORIGINAL_IMAGE_PATH}?${new URLSearchParams({ sessionId, assetId })}`), res)
  return res
}

function request(method: string, url: string, remoteAddress = '127.0.0.1'): IncomingMessage {
  return { method, url, socket: { remoteAddress }, headers: { host: '127.0.0.1:3081' } } as unknown as IncomingMessage
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

    const restored = Session.fromRestore(
      grandchild.id,
      JSON.parse(JSON.stringify(grandchild.snapshotEvents())),
      JSON.parse(JSON.stringify(grandchild.header)),
      grandchild.inheritedEventCount,
    )
    await ctx.fiber.dispose()
    const reopened = await sessionContext()
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
