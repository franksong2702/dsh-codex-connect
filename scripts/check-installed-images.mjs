import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC', 'base64')
const PREFIX = 'codex-connect-image-result-v1:'

/** Select the service required by the installed tools package, not its version label. */
export function imageRuntimeService(manifest) {
  const dependencies = { ...manifest.dependencies, ...manifest.peerDependencies }
  const services = [['@deepseek-ai/dsh-code-runtime', 'codeRuntime'], ['@deepseek-ai/dsh-ptc-runtime', 'ptcRuntime']]
    .filter(([name]) => Object.hasOwn(dependencies, name))
  assert.equal(services.length, 1, 'installed tools must declare exactly one known PTC runtime')
  return services[0][1]
}

/** Exercise the packed image tool and real PTC bridge; provider, preview store and code execution are synthetic. */
export async function checkInstalledImages(importHost, CodexConnect, toolsManifest) {
  const runtimeKey = imageRuntimeService(toolsManifest)
  const [{ Context }, { default: Llm }, { default: Sessions, SessionId },
    { default: Projections }, { default: Prompt }, { default: Tools },
    { default: Agents }, { default: Loop }] = await Promise.all([
    '@deepseek-ai/cordis', '@deepseek-ai/dsh-llm', '@deepseek-ai/dsh-session',
    '@deepseek-ai/dsh-session-projection', '@deepseek-ai/dsh-system-prompt',
    '@deepseek-ai/dsh-tools', '@deepseek-ai/dsh-agent', '@deepseek-ai/dsh-agent-loop',
  ].map(importHost))
  const directory = await mkdtemp(join(tmpdir(), 'codex-installed-images-'))
  const previousHome = process.env.DSH_HOME
  const previousFetch = globalThis.fetch
  const ctx = new Context()
  let generated = 0
  let codeRuns = 0
  let networkAttempts = 0
  process.env.DSH_HOME = directory
  globalThis.fetch = async () => { networkAttempts++; throw new Error('Unexpected image fixture network request') }
  const routes = new Map()
  try {
    ctx.provide('webServer', { register(route) { routes.set(route.path, route); return () => routes.delete(route.path) } })
    ctx.provide('attachments', {
      imageLimits: { maxImageBytes: 1_000_000, maxImagesPerMessage: 4, maxMessageImageBytes: 4_000_000, maxImagePixels: 1_000_000, mediaTypes: ['image/png'] },
      async saveImages(inputs) {
        return inputs.map(input => ({ attachmentId: 'fixture-preview', mediaType: 'image/png', width: 1, height: 1, bytes: PNG.length, name: input.name }))
      },
    })
    ctx.provide(runtimeKey, {
      language: 'typescript', isolation: 'fixture',
      executionInstructions: '',
      resolve(request) {
        return { ...request, cwd: request.cwd ?? directory, timeoutMs: request.timeoutMs === undefined ? 1_000 : request.timeoutMs }
      },
      async run(request) {
        codeRuns++
        assert.equal(request.program, 'return await tools.codex_connect_image_generate({prompt: "fixture"});')
        const tools = request.bindings.find(binding => binding.global === 'tools')
        assert.ok(tools)
        return { value: await tools.functions.codex_connect_image_generate({ prompt: 'fixture' }), logs: [] }
      },
    })
    for (const plugin of [Llm, Sessions, Projections, Prompt]) await ctx.plugin(plugin)
    await ctx.plugin(Tools, { mode: 'both' })
    await ctx.plugin(Agents)
    await ctx.plugin(Loop, { agents: [] })
    await ctx.plugin(CodexConnect, { enableImageGeneration: true })
    await new Promise(resolve => setImmediate(resolve))
    ctx.openaiCodexTransport.generateImages = async () => {
      generated++
      return { apiVersion: 1, traceId: 'fixture', elapsedMs: 1, responseBytes: PNG.length, images: [{ b64Json: PNG.toString('base64') }] }
    }
    const agent = await ctx.agentLoop.create(SessionId('image-fixture'), { provider: 'openai-codex', model: 'gpt-6-astra' })
    const execute = (name, args, callId) => ctx.tools.execute({ agent, name, arguments: args, callId, signal: new AbortController().signal })
    const direct = await execute('codex_connect_image_generate', { prompt: 'fixture' }, 'direct-image')
    assert.equal(direct.isError, false, JSON.stringify(direct))
    assert.equal(direct.meta.kind, 'codex-connect-images')
    const earlierFork = await ctx.sessions.fork(agent.session, undefined, SessionId('image-earlier-fork'))
    const result = await execute('run_code', { code: 'return await tools.codex_connect_image_generate({prompt: "fixture"});', description: 'Synthetic image inspection' }, 'ptc-image')
    assert.equal(result.isError, false, JSON.stringify(result))
    const dispatch = agent.session.snapshotEvents().filter(event => event.type === 'tool/code-dispatch' || event.type === 'tool/ptc-dispatch')
    assert.equal(dispatch.length, 1)
    assert.equal(dispatch[0].data.name, 'codex_connect_image_generate')
    assert.equal(dispatch[0].data.isError, false)
    const content = dispatch[0].data.content
    const envelope = content.filter(block => block.type === 'text' && block.text.startsWith(PREFIX))
    assert.equal(envelope.length, 1)
    const [image] = JSON.parse(envelope[0].text.slice(PREFIX.length))
    assert.deepEqual(content.find(block => block.type === 'image').attachment, image.preview)
    assert.equal(image.original.bytes, PNG.length)
    const route = routes.get('/plugins/dsh-codex-connect/images/original')
    assert.ok(route, 'original image download route must be registered')
    const download = async (sessionId, assetId) => {
      const response = { writeHead(status, headers) { this.status = status; this.headers = headers }, end(body) { this.body = body } }
      await route.handler({ method: 'GET', url: `${route.path}?${new URLSearchParams({ sessionId, assetId })}`, headers: { host: '127.0.0.1:3081' }, socket: { remoteAddress: '127.0.0.1' } }, response)
      return response
    }
    const original = await download(agent.session.id, image.original.assetId)
    assert.equal(original.status, 200)
    assert.deepEqual(original.body, PNG)
    const fork = await ctx.sessions.fork(agent.session, undefined, SessionId('image-inherited-fork'))
    const inherited = await download(fork.id, image.original.assetId)
    assert.equal(inherited.status, 200)
    assert.deepEqual(inherited.body, PNG)
    assert.equal((await download(earlierFork.id, image.original.assetId)).status, 404)
    const denied = await download('unrelated-session', image.original.assetId)
    assert.equal(denied.status, 404)
    assert.equal(generated, 2)
    assert.equal(codeRuns, 1)
    assert.equal(networkAttempts, 0)
    return { syntheticOnly: true, generated, codeRuns, dispatchEvent: dispatch[0].type, originalDownloadVerified: true, inheritedOriginalVerified: true, earlierForkDenied: true, unrelatedSessionDenied: true, realProviderRequests: 0 }
  } finally {
    try { await ctx.fiber.dispose() } finally {
      globalThis.fetch = previousFetch
      if (previousHome === undefined) delete process.env.DSH_HOME
      else process.env.DSH_HOME = previousHome
      await rm(directory, { recursive: true, force: true })
    }
  }
}
