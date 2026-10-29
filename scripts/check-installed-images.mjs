import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ensureNativeToolExecution } from './installed-host-context.mjs'

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC', 'base64')
const PREFIX = 'codex-connect-image-result-v1:'
const EDIT_PREFIX = 'codex-connect-image-result-v2:'

/** Select the service required by the installed tools package, not its version label. */
export function imageRuntimeService(manifest, separateExecutor) {
  let dependencies = { ...manifest.dependencies, ...manifest.peerDependencies }
  if (separateExecutor !== undefined) {
    assert.ok(typeof manifest.version === 'string' && manifest.version.length > 0, 'separated tools must have an exact Host version')
    assert.equal(separateExecutor.name, '@deepseek-ai/dsh-tool-executor-ptc', 'unexpected separated executor')
    assert.equal(separateExecutor.version, manifest.version, 'executor must belong to the exact same Host')
    dependencies = { ...dependencies, ...separateExecutor.dependencies, ...separateExecutor.peerDependencies }
  }
  const services = [['@deepseek-ai/dsh-code-runtime', 'codeRuntime'], ['@deepseek-ai/dsh-ptc-runtime', 'ptcRuntime']]
    .filter(([name]) => Object.hasOwn(dependencies, name))
  assert.equal(services.length, 1, 'installed tools must declare exactly one known PTC runtime')
  return services[0][1]
}

/** Exercise the packed image tool and real PTC bridge; provider, preview store and code execution are synthetic. */
export async function checkInstalledImages(importHost, CodexConnect, toolsManifest, separateExecutor) {
  const runtimeKey = imageRuntimeService(toolsManifest, separateExecutor)
  const [{ Context }, llm, { default: Sessions, SessionId },
    { default: Projections }, { default: Prompt }, { default: Tools, defineTool },
    { default: Agents }, { default: Loop }, Connection] = await Promise.all([
    '@deepseek-ai/cordis', '@deepseek-ai/dsh-llm', '@deepseek-ai/dsh-session',
    '@deepseek-ai/dsh-session-projection', '@deepseek-ai/dsh-system-prompt',
    '@deepseek-ai/dsh-tools', '@deepseek-ai/dsh-agent', '@deepseek-ai/dsh-agent-loop',
    '@deepseek-ai/dsh-client-connection',
  ].map(importHost))
  const { default: Llm, LlmAdapter, createUserMessage, ToolCallId } = llm
  const directory = await mkdtemp(join(tmpdir(), 'codex-installed-images-'))
  const previousHome = process.env.DSH_HOME
  const previousFetch = globalThis.fetch
  const ctx = new Context()
  let generated = 0
  let edited = 0
  let editArgs
  let editProgram
  let codeRuns = 0
  let networkAttempts = 0
  process.env.DSH_HOME = directory
  globalThis.fetch = async () => { networkAttempts++; throw new Error('Unexpected image fixture network request') }
  const routes = new Map()
  try {
    ctx.provide('workingDirectory', { async ensure(_agent, signal) {
      signal?.throwIfAborted()
      return directory
    } })
    ctx.provide('webServer', { register(route) {
      assert.ok(!routes.has(route.path), 'synthetic WebServer must reject duplicate routes')
      routes.set(route.path, route)
      return () => routes.delete(route.path)
    } })
    // Real Host authentication, with credential records held only in this synthetic fixture's memory.
    const records = new Map()
    ctx.provide('credentials', { async modifyRecord(key, mutate) {
      const next = await mutate(records.get(key))
      if (next !== undefined) records.set(key, next)
      return records.get(key)
    } })
    await ctx.plugin(Connection)
    const index = { writeHead(status, headers) { this.status = status; this.headers = headers }, end() {} }
    const authenticatedUrl = new URL(ctx.connection.authenticatedUrl('http://127.0.0.1:3081'))
    assert.equal(ctx.connection.authorizeIndex({ method: 'GET', url: authenticatedUrl.pathname + authenticatedUrl.search,
      headers: { host: authenticatedUrl.host } }, index), false)
    assert.equal(index.status, 303)
    const cookie = index.headers['set-cookie'].split(';')[0]
    ctx.provide('attachments', {
      imageLimits: { maxImageBytes: 1_000_000, maxImagesPerMessage: 4, maxMessageImageBytes: 4_000_000, maxImagePixels: 1_000_000, maxImageDimension: 2048, mediaTypes: ['image/png'] },
      async validateImage(input) {
        assert.equal(input.mediaType, 'image/png')
        assert.deepEqual(Buffer.from(input.data), PNG)
      },
      async saveImages(inputs) {
        return inputs.map(input => ({ attachmentId: 'fixture-preview', mediaType: 'image/png', width: 1, height: 1, bytes: PNG.length, name: input.name }))
      },
    })
    ctx.provide(runtimeKey, {
      language: 'typescript', isolation: 'fixture',
      programFormat: 'function-body', retainsState: false,
      executionInstructions: '',
      resolve(request) {
        return { ...request, cwd: request.cwd ?? directory, timeoutMs: request.timeoutMs === undefined ? 1_000 : request.timeoutMs }
      },
      async run(request) {
        codeRuns++
        const args = editProgram !== undefined && request.program === editProgram ? editArgs : { prompt: 'fixture' }
        if (args !== editArgs) assert.equal(request.program, 'return await tools.codex_connect_image_generate({prompt: "fixture"});')
        const tools = request.bindings.find(binding => binding.global === 'tools')
        assert.ok(tools)
        return { value: await tools.functions.codex_connect_image_generate(args), logs: [] }
      },
    })
    for (const plugin of [Llm, Sessions, Projections, Prompt]) await ctx.plugin(plugin)
    // Mixed mode was retired in alpha.2; exercise native and scoped PTC separately.
    await ctx.plugin(Tools, separateExecutor === undefined ? { mode: 'native' } : {})
    await ensureNativeToolExecution(ctx, importHost)
    await ctx.plugin(Agents)
    await ctx.plugin(Loop, { agents: [] })
    await ctx.plugin(CodexConnect, { enableImageGeneration: true })
    await new Promise(resolve => setImmediate(resolve))
    ctx.openaiCodexTransport.generateImages = async () => {
      generated++
      return { apiVersion: 1, traceId: 'fixture', elapsedMs: 1, responseBytes: PNG.length, images: [{ b64Json: PNG.toString('base64') }] }
    }
    assert.equal(typeof ctx.openaiCodexTransport.editImages, 'function', 'installed bytes must expose edit transport')
    ctx.openaiCodexTransport.editImages = async input => {
      edited++
      assert.equal(input.images.length, 1)
      assert.deepEqual(Buffer.from(input.images[0].data), PNG)
      assert.ok(input.prompt.includes('Image 1 is the target to edit.'))
      return { apiVersion: 1, traceId: 'edit-fixture', elapsedMs: 1, responseBytes: PNG.length, images: [{ b64Json: PNG.toString('base64') }] }
    }
    // Current Native execution only commits root tool events from an actual
    // AgentLoop step. Do not invent log positions to satisfy asset ownership.
    let queuedCall
    const outcomes = new Map()
    if (separateExecutor !== undefined) {
      class ScriptedImages extends LlmAdapter {
        providerInfo(id) { return { id, name: 'Synthetic images' } }
        async *stream() {
          const block = queuedCall ?? { type: 'text', text: 'Synthetic step complete.' }
          queuedCall = undefined
          yield { type: 'block-start', index: 0, blockType: block.type }
          yield { type: 'block-end', index: 0, block }
          yield { type: 'finish', reason: { kind: 'stop' } }
        }
      }
      ctx.llm.registerAdapter(['synthetic-images'], new ScriptedImages())
      ctx.on('tools/result', (exec, result) => { outcomes.set(exec.callId, result) }, { global: true })
    }
    const agent = await ctx.agentLoop.create(SessionId('image-fixture'), {
      provider: separateExecutor === undefined ? 'openai-codex' : 'synthetic-images', model: 'gpt-6-astra',
    }, { cwd: directory })
    const executeStandalone = async (owner, name, args, callId) => {
      if (separateExecutor === undefined) return ctx.tools.execute({ agent: owner, name, arguments: args, callId, signal: new AbortController().signal })
      const batch = await ctx.tools.execute({ agent: owner, calls: [{ type: 'tool-call', id: callId, name, arguments: JSON.stringify(args) }], signal: new AbortController().signal })
      assert.equal(batch.results.length, 1)
      return batch.results[0].result
    }
    const execute = async (name, args, callId) => {
      if (separateExecutor === undefined) return executeStandalone(agent, name, args, callId)
      assert.equal(queuedCall, undefined)
      queuedCall = { type: 'tool-call', id: ToolCallId(callId), name, arguments: JSON.stringify(args) }
      agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Run the next synthetic image step.' }] }))
      await agent.whenIdle()
      assert.ok(outcomes.has(callId), `actual AgentLoop must execute ${callId}`)
      return outcomes.get(callId)
    }
    const direct = await execute('codex_connect_image_generate', { prompt: 'fixture' }, 'direct-image')
    assert.equal(direct.isError, false, JSON.stringify(direct))
    assert.equal(direct.meta.kind, 'codex-connect-images')
    const earlierFork = await ctx.sessions.fork(agent.session, undefined, SessionId('image-earlier-fork'))
    const restoreNative = separateExecutor === undefined ? agent.ctx.tools.presentAs('ptc')
      : await agent.ctx.plugin(await importHost('@deepseek-ai/dsh-tool-executor-ptc')).then(fiber => async () => {
        await fiber.dispose()
        await ensureNativeToolExecution(agent.ctx, importHost)
      })
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
    const download = async (sessionId, assetId, authenticated = true) => {
      const response = { writeHead(status, headers) { this.status = status; this.headers = headers }, end(body) { this.body = body } }
      await route.handler({ method: 'GET', url: `${route.path}?${new URLSearchParams({ sessionId, assetId })}`,
        headers: { host: '127.0.0.1:3081', ...(authenticated ? { cookie } : {}) }, socket: { remoteAddress: '127.0.0.1' } }, response)
      return response
    }
    const unauthenticated = await download(agent.session.id, image.original.assetId, false)
    assert.equal(unauthenticated.status, 401)
    assert.equal(JSON.parse(unauthenticated.body).error, 'DSH_BROWSER_AUTH_REQUIRED')
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
    editArgs = { operation: 'edit', prompt: '  fixture edit  ', target: { assetId: image.original.assetId } }
    editProgram = `return await tools.codex_connect_image_generate(${JSON.stringify(editArgs)});`
    const edit = await execute('run_code', { code: editProgram, description: 'Synthetic image edit' }, 'ptc-edit')
    assert.equal(edit.isError, false, JSON.stringify(edit))
    const editDispatch = agent.session.snapshotEvents().filter(event => event.type === 'tool/code-dispatch' || event.type === 'tool/ptc-dispatch')
    assert.equal(editDispatch.length, 2)
    const editEnvelope = editDispatch[1].data.content.find(block => block.type === 'text' && block.text.startsWith(EDIT_PREFIX))
    assert.ok(editEnvelope)
    const editedMeta = JSON.parse(editEnvelope.text.slice(EDIT_PREFIX.length))
    assert.equal(editedMeta.operation, 'edit')
    assert.equal(editedMeta.prompt, 'fixture edit')
    assert.deepEqual(editedMeta.edit, { target: editArgs.target, references: [] })
    const editedOriginal = editedMeta.images[0].original
    assert.notEqual(editedOriginal.assetId, image.original.assetId)
    const editFork = await ctx.sessions.fork(agent.session, undefined, SessionId('image-edited-fork'))
    const inheritedEdit = await download(editFork.id, editedOriginal.assetId)
    assert.equal(inheritedEdit.status, 200)
    assert.deepEqual(inheritedEdit.body, PNG)
    assert.equal((await download(fork.id, editedOriginal.assetId)).status, 404)
    await restoreNative()
    const next = await execute('codex_connect_image_generate', {
      operation: 'edit', prompt: 'continue fixture edit', target: { assetId: editedOriginal.assetId },
    }, 'continued-edit')
    assert.equal(next.isError, false, JSON.stringify(next))
    assert.deepEqual(next.meta.edit.target, { assetId: editedOriginal.assetId })
    const missing = await execute('codex_connect_image_generate', {
      operation: 'edit', prompt: 'must not generate', target: { assetId: `img_${'0'.repeat(32)}` },
    }, 'missing-edit')
    assert.equal(missing.isError, true)
    assert.equal(generated, 2)
    assert.equal(edited, 2)
    assert.equal(codeRuns, 2)
    assert.equal(networkAttempts, 0)

    // Exercise #302 through the installed host's real post-execute waterfall.
    // Route identities and image metadata are synthetic; no non-Codex model runs.
    const bridgeAttachment = { attachmentId: 'sha256:compatibility-bridge', mediaType: 'image/png',
      width: 1, height: 1, bytes: PNG.length, name: 'bridge.png' }
    let bridgeContent = [{ type: 'image', attachment: bridgeAttachment }]
    ctx.tools.register(defineTool({ name: 'compatibility_image_echo', description: 'Synthetic image handle fixture',
      parameters: {}, output: { schema: { type: 'object', additionalProperties: false, properties: {} },
        render: () => bridgeContent }, async execute() { return {} } }))
    const bridgeSession = ctx.sessions.create(SessionId('image-handle-fixture'))
    let bridgeIndex = 0
    const bridgeExecute = async provider => {
      const owner = separateExecutor === undefined
        ? { id: bridgeSession.id, session: bridgeSession, options: { provider, model: 'synthetic' } }
        : await ctx.agentLoop.create(SessionId(`image-handle-fixture-${bridgeIndex++}`), { provider, model: 'synthetic' })
      const value = await executeStandalone(owner,
        'compatibility_image_echo', {}, 'handle-fixture')
      assert.equal(value.isError, false, JSON.stringify(value))
      return value.content
    }
    const handles = content => content.filter(block => block.type === 'text' && block.text.startsWith('[Codex Connect image '))
    assert.equal(handles(await bridgeExecute('openai-codex')).length, 0)
    assert.equal(handles(await bridgeExecute(undefined)).length, 0)
    bridgeContent = await bridgeExecute('synthetic-non-codex')
    assert.equal(handles(bridgeContent).length, 1)
    assert.ok(handles(bridgeContent)[0].text.includes(`attachment=${JSON.stringify(bridgeAttachment)}`))
    assert.deepEqual(await bridgeExecute('synthetic-non-codex'), bridgeContent)
    assert.equal(networkAttempts, 0)
    return { syntheticOnly: true, generated, edited, codeRuns, dispatchEvent: dispatch[0].type,
      originalDownloadVerified: true, originalAuthenticationVerified: true,
      inheritedOriginalVerified: true, earlierForkDenied: true, unrelatedSessionDenied: true,
      editSourcesVerified: true, inheritedEditVerified: true, invalidEditRefused: true,
      selectionHandlesVerified: true, realProviderRequests: 0 }
  } finally {
    try { await ctx.fiber.dispose() } finally {
      globalThis.fetch = previousFetch
      if (previousHome === undefined) delete process.env.DSH_HOME
      else process.env.DSH_HOME = previousHome
      await rm(directory, { recursive: true, force: true })
    }
  }
}
