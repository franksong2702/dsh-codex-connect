/** Opt-in Luna-only real DSH persistence acceptance. Default: synthetic, two fresh processes. */
import assert from 'node:assert/strict'
import { createHash, randomBytes } from 'node:crypto'
import { constants } from 'node:fs'
import { open, readFile, writeFile, mkdtemp, rm, readdir, stat } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { zstdDecompressSync } from 'node:zlib'

const SELF = fileURLToPath(import.meta.url)
const MODEL = 'gpt-5.6-luna'
const PROVIDER = 'openai-codex'
const ENDPOINT = 'https://chatgpt.com/backend-api/codex/responses'
const LIVE = process.argv.includes('--live')
const CHILD = process.argv[2] === '--child'
const digest = value => createHash('sha256').update(value).digest('hex')
const fail = code => { throw new Error(code) }
const safeError = error => /^[A-Z_]{1,80}$/u.test(error?.message ?? '') ? error.message : 'ACCEPTANCE_FAILED_REDACTED'
const finite = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
const sameModel = value => value === undefined || value === MODEL || /^gpt-5\.6-luna-\d{4}-\d{2}-\d{2}$/u.test(value)
const authPath = () => join(process.env.CODEX_HOME?.trim() || join(homedir(), '.codex'), 'auth.json')
const checkpoint = session => session.deriveMessages().find(message => message.source.kind === 'plugin' && message.source.plugin === 'compact')

async function readLogin() {
  const handle = await open(authPath(), constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const info = await handle.stat()
    if (!info.isFile() || (info.mode & 0o077) !== 0 || info.uid !== process.getuid() || info.size > 512 * 1024) fail('CREDENTIAL_FILE_UNSAFE')
    const bytes = await handle.readFile()
    if (bytes.length > 512 * 1024) fail('CREDENTIAL_FILE_UNSAFE')
    const doc = JSON.parse(bytes.toString('utf8'))
    const tokens = doc?.tokens
    if (doc?.auth_mode !== 'chatgpt' || typeof tokens?.access_token !== 'string') fail('CREDENTIAL_INVALID')
    const parts = tokens.access_token.split('.')
    if (parts.length !== 3) fail('CREDENTIAL_INVALID')
    const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
    const accountId = claims?.['https://api.openai.com/auth']?.chatgpt_account_id
    if (!accountId || accountId !== tokens.account_id || !Number.isFinite(claims.exp)) fail('CREDENTIAL_INVALID')
    if (claims.exp * 1000 < Date.now() + 300000) fail('CREDENTIAL_EXPIRED_NO_REFRESH')
    return { fingerprint: digest(bytes), credential: { type: 'oauth', access: tokens.access_token, accountId, expires: claims.exp * 1000, refresh: 'refresh-disabled' } }
  } finally { await handle.close() }
}
function syntheticCredential() {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url')
  return { type: 'oauth', access: `${encode({ alg: 'none' })}.${encode({ 'https://api.openai.com/auth': { chatgpt_account_id: 'offline-durable' } })}.synthetic`, accountId: 'offline-durable', expires: Date.now() + 3600000, refresh: 'synthetic-only' }
}
function offlineResponse(stage, label, scenario) {
  if (stage === 'native' && scenario === 'reject-native') return new Response(JSON.stringify({ error: { code: 'invalid_request_error' } }), { status: 400 })
  const value = stage === 'resume' ? label : 'ACK'
  const item = stage === 'native' ? { type: 'compaction', id: 'cmp_offline_durable', encrypted_content: 'synthetic-durable-checkpoint' }
    : { type: 'message', id: 'msg_offline_durable', role: 'assistant', phase: 'final_answer', status: 'completed', content: [{ type: 'output_text', text: value, annotations: [] }] }
  return new Response([
    { type: 'response.output_item.added', output_index: 0, item: stage === 'native' ? item : { ...item, content: [] } },
    ...(stage === 'native' ? [] : [{ type: 'response.output_text.delta', output_index: 0, content_index: 0, item_id: item.id, delta: value }]),
    { type: 'response.output_item.done', output_index: 0, item },
    { type: 'response.completed', response: { id: 'resp_offline_durable', status: 'completed', model: MODEL, output: [item], usage: { input_tokens: 100, output_tokens: 20, total_tokens: 120, input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 } } } },
  ].map(event => `data: ${JSON.stringify(event)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } })
}
async function json(path) { return JSON.parse(await readFile(path, 'utf8')) }
async function save(path, value) { await writeFile(path, JSON.stringify(value), { mode: 0o600 }) }

async function child(phase, root) {
  process.env.DSH_HOME = join(root, 'isolated-home')
  process.env.DSH_TELEMETRY_MODE = 'DISABLED'
  process.env.OTEL_SDK_DISABLED = 'true'
  globalThis.WebSocket = class { constructor() { fail('WEBSOCKET_BLOCKED') } }
  const statePath = join(root, 'state.json')
  const state = await json(statePath)
  if (state.live !== LIVE || !['write', 'resume'].includes(phase)) fail('INVALID_CHILD_MODE')
  const credential = LIVE ? (await readLogin()).credential : syntheticCredential()
  const undici = await import('undici')
  const dispatcher = LIVE ? new undici.EnvHttpProxyAgent() : undefined
  const ledgerPath = join(root, 'ledger.json')
  const ledger = await json(ledgerPath)
  let stage = phase === 'write' ? 'baseline' : 'resume'
  globalThis.fetch = async (url, init) => {
    let rawBody = init?.body
    if (new Headers(init?.headers).get('content-encoding') === 'zstd') rawBody = zstdDecompressSync(rawBody)
    const body = JSON.parse(typeof rawBody === 'string' ? rawBody : Buffer.from(rawBody).toString('utf8'))
    const input = Array.isArray(body.input) ? body.input : []
    const triggers = input.filter(item => item?.type === 'compaction_trigger').length
    const compactions = input.filter(item => item?.type === 'compaction').length
    if (stage === 'native' && triggers !== 1) ledger.fallback_attempted = true
    if (String(url) !== ENDPOINT || init?.method !== 'POST' || body.model !== MODEL || body.service_tier !== undefined
      || body.stream !== true || body.store !== false || ledger.metrics.length >= 3 || ledger.metrics.some(metric => metric.stage === stage)
      || ['baseline', 'native', 'resume'][ledger.metrics.length] !== stage
      || (stage === 'native' ? triggers !== 1 || input.at(-1)?.type !== 'compaction_trigger' : triggers !== 0)
      || (stage === 'resume' ? compactions !== 1 || JSON.stringify(input.filter(item => item?.type !== 'compaction')).includes(state.label) : compactions !== 0)
      || JSON.stringify(input).includes('dsh-codex-connect-native-checkpoint:')) {
      ledger.blocked_dispatch_attempts += 1
      await save(ledgerPath, ledger)
      fail('DISPATCH_GUARD_BLOCKED')
    }
    const metric = { stage, dispatch: ledger.metrics.length + 1, request_model: MODEL, server_model: null, http_status: null, terminal_status: null, input_tokens: null, output_tokens: null, total_tokens: null, cached_tokens: null, reasoning_tokens: null, latency_ms: null, compaction_items: 0 }
    ledger.metrics.push(metric)
    await save(ledgerPath, ledger) // Reserve a dispatch before sending; failure never grants a replay.
    const started = performance.now()
    const deadline = AbortSignal.timeout(90000)
    const signal = init.signal ? AbortSignal.any([init.signal, deadline]) : deadline
    try {
      const response = LIVE ? await undici.fetch(ENDPOINT, { ...init, signal, dispatcher, redirect: 'manual' }) : offlineResponse(stage, state.label, state.scenario)
      metric.http_status = response.status
      const reader = response.body?.getReader()
      if (!reader) fail('RESPONSE_BODY_MISSING')
      const chunks = []
      let received = 0
      try {
        while (true) {
          const next = await reader.read()
          if (next.done) break
          received += next.value.byteLength
          if (received > 8 * 1024 * 1024) fail('RESPONSE_TOO_LARGE')
          chunks.push(next.value)
        }
      } finally { await reader.cancel().catch(() => undefined); reader.releaseLock() }
      const raw = Buffer.concat(chunks).toString('utf8')
      if (response.ok) for (const frame of raw.split(/\r?\n\r?\n/u)) {
        const data = frame.split(/\r?\n/u).filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n')
        if (!data || data === '[DONE]') continue
        const event = JSON.parse(data)
        if (event.type === 'response.output_item.done' && event.item?.type === 'compaction') metric.compaction_items += 1
        if (['response.completed', 'response.done'].includes(event.type)) {
          const terminal = event.response
          if (!sameModel(terminal?.model)) fail('UNEXPECTED_SERVER_MODEL')
          metric.server_model = terminal?.model ?? null
          metric.terminal_status = ['completed', 'failed', 'incomplete'].includes(terminal?.status) ? terminal.status : 'other'
          const usage = terminal?.usage
          Object.assign(metric, { input_tokens: finite(usage?.input_tokens), output_tokens: finite(usage?.output_tokens), total_tokens: finite(usage?.total_tokens), cached_tokens: finite(usage?.input_tokens_details?.cached_tokens), reasoning_tokens: finite(usage?.output_tokens_details?.reasoning_tokens) })
        }
      }
      return new Response(raw, { status: response.status, headers: { 'content-type': response.headers.get('content-type') ?? 'text/event-stream' } })
    } finally { metric.latency_ms = Math.round(performance.now() - started); await save(ledgerPath, ledger) }
  }
  let ctx
  try {
    const [{ Context }, llm, sessions, projections, system, tools, agents, loop, meter, compaction, persistence, adapterModule, native] = await Promise.all([
      import('@deepseek-ai/cordis'), import('@deepseek-ai/dsh-llm'), import('@deepseek-ai/dsh-session'),
      import('@deepseek-ai/dsh-session-projection'), import('@deepseek-ai/dsh-system-prompt'), import('@deepseek-ai/dsh-tools'),
      import('@deepseek-ai/dsh-agent'), import('@deepseek-ai/dsh-agent-loop'), import('@deepseek-ai/dsh-token-meter'),
      import('@deepseek-ai/dsh-compaction-basic'), import('@deepseek-ai/dsh-session-persistence-jsonl'),
      import('../src/adapter.ts'), import('../src/native-compaction.ts'),
    ])
    // Only the credential source is supplied in memory. The shipped adapter, AgentLoop,
    // compaction engine, SessionStore and JSONL writer/restorer execute unchanged.
    const captured = { read: async () => credential, list: async () => [{ providerId: PROVIDER, type: 'oauth' }], modify: async () => fail('CREDENTIAL_WRITE_BLOCKED'), delete: async () => fail('CREDENTIAL_WRITE_BLOCKED') }
    captured.captureActiveAccount = async () => captured
    ctx = new Context()
    for (const module of [llm, sessions, projections, system, tools, agents]) await ctx.plugin(module.default)
    await ctx.plugin(loop.default, { agents: [] })
    await ctx.plugin(meter.default)
    await ctx.plugin(persistence.default, { root: join(root, 'sessions'), compression: 'none', packChunks: true })
    await ctx.plugin(compaction.default, { auto: false, compactionRetries: 0, maxOverflowRetries: 0 })
    const adapter = adapterModule.createOpenAICodexAdapter(captured, () => undefined, undefined, () => [MODEL], undefined, undefined, undefined, undefined, () => phase === 'write')
    ctx.llm.registerAdapter([PROVIDER], adapter)
    const selection = { provider: PROVIDER, model: MODEL, reasoningEffort: llm.ReasoningEffortId('low'), maxTokens: 256 }
    const id = sessions.SessionId('native-durable-luna-acceptance')
    if (ctx.sessions.get(id) !== undefined) fail('UNEXPECTED_LIVE_SESSION')
    const handle = phase === 'write' ? await ctx.agents.create({ sessionId: id, agentOptions: selection }) : await ctx.agents.resume({ resumeSessionId: id, agentOptions: selection })
    const { agent } = handle
    const send = async value => {
      const before = agent.session.snapshotEvents().length
      agent.followup(llm.createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: value }] }))
      await agent.whenIdle()
      await ctx.sessions.flush(agent.session)
      const last = agent.session.snapshotEvents().findLast(event => event.type === 'assistant/message')
      if (!last || last.seq < before) fail('AGENT_TURN_FAILED')
      return last.data.message.content.filter(block => block.type === 'text').map(block => block.text).join('').trim()
    }
    if (phase === 'write') {
      // Whitespace padding crosses the byte-retention limit without a costly long generation.
      // The label's only original occurrence is in a user item too large to retain verbatim.
      const prompt = `Remember the checkpoint label ${state.label}. Reply ONLY ACK and do not echo the label. Ignore the padding between brackets.[${' '.repeat(65000)}] End padding. The checkpoint label must survive later summarization.`
      assert.ok(Buffer.byteLength(JSON.stringify({ role: 'user', content: [{ type: 'input_text', text: prompt }] })) > native.OPENAI_CODEX_NATIVE_COMPACTION_RETAINED_BYTES)
      if (await send(prompt) !== 'ACK') fail('BASELINE_ACK_INVALID')
      stage = 'native'
      const compacted = await ctx.compaction.compactNow(agent, new AbortController().signal)
      if (!compacted || agent.session.surface.replaceGeneration !== 1) fail('DSH_COMPACTION_NOT_COMMITTED')
      const saved = checkpoint(agent.session)
      const items = native.decodeNativeCompactionCheckpoint(saved)
      if (items?.length !== 1 || items[0].type !== 'compaction') fail('NATIVE_CHECKPOINT_NOT_EXCLUSIVE')
      if (JSON.stringify(agent.session.deriveMessages()).includes(state.label)) fail('LABEL_REMAINS_VISIBLE')
      await ctx.sessions.flush(agent.session)
      const files = (await readdir(join(root, 'sessions'), { recursive: true })).filter(path => path.endsWith('.jsonl'))
      if (files.length !== 1) fail('PERSISTED_SESSION_MISSING')
      const stored = await readFile(join(root, 'sessions', files[0]), 'utf8')
      if (!stored.includes('dsh-codex-connect-native-compaction-v1')) fail('PERSISTED_CHECKPOINT_MISSING')
      if (stored.includes(credential.access) || stored.includes(credential.accountId)) fail('CREDENTIAL_IN_SESSION')
      state.checkpoint_digest = digest(JSON.stringify(saved))
      state.writer_pid = process.pid
      await save(statePath, state)
      return { phase, pid: process.pid, real_dsh_transaction: true, native_checkpoint_committed: true, jsonl_checkpoint_verified: true, selected_user_omitted_from_retained_projection: true }
    }
    if (process.pid === state.writer_pid || digest(JSON.stringify(checkpoint(agent.session))) !== state.checkpoint_digest) fail('FRESH_RESTORE_MISMATCH')
    if (JSON.stringify(agent.session.deriveMessages()).includes(state.label)) fail('LABEL_REMAINS_VISIBLE')
    const reply = await send('What is the checkpoint label I asked you to remember? Return ONLY that label, not ACK. Do not invent a new label.')
    if (reply !== state.label) fail('RECALL_MISMATCH_NO_RETRY')
    return { phase, pid: process.pid, fresh_process_restored: true, native_creation_disabled: true, checkpoint_identical: true, replay_accepted: true, label_recalled: true }
  } finally { try { await ctx?.fiber.dispose() } finally { await dispatcher?.destroy() } }
}

async function main() {
  if (CHILD) {
    const phase = process.argv[3]
    const root = resolve(process.argv[4])
    try { console.log(JSON.stringify({ ok: true, report: await child(phase, root) })) }
    catch (error) { console.log(JSON.stringify({ ok: false, stop_reason: safeError(error), ...(!LIVE ? { diagnostic: error.stack } : {}) })); process.exitCode = 1 }
    return
  }
  if (process.argv.slice(2).some(arg => !['--live', '--codex-login', '--offline', '--reject-native'].includes(arg))
    || LIVE !== process.argv.includes('--codex-login') || (LIVE && (process.argv.includes('--offline') || process.argv.includes('--reject-native')))) fail('INVALID_MODE')
  const result = { schema_version: 1, mode: LIVE ? 'live' : 'offline', request_model: MODEL, host: '0.1.2-rc.1', node: process.version,
    source_sha256: digest(await readFile(new URL('../src/native-compaction.ts', import.meta.url))), max_retries: 0, maximum_dispatches: 3, credential_refresh: false, credential_source: LIVE ? 'codex-login' : 'synthetic', credential_file_unchanged: null,
    real_dsh_components: true, authentication_source_in_memory: true, compression: 'none', private_temporary_storage: true, prompt_padding_bytes: 65000, phases: [], metrics: [], fallback_dispatched: false }
  let root
  let fingerprint
  try {
    fingerprint = LIVE ? (await readLogin()).fingerprint : undefined
    root = await mkdtemp(join(tmpdir(), 'codex-native-durable-'))
    if (((await stat(root)).mode & 0o077) !== 0) fail('TEMP_DIRECTORY_UNSAFE')
    await save(join(root, 'state.json'), { live: LIVE, label: randomBytes(6).toString('hex').toUpperCase(), scenario: process.argv.includes('--reject-native') ? 'reject-native' : 'success' })
    await save(join(root, 'ledger.json'), { metrics: [], blocked_dispatch_attempts: 0, fallback_attempted: false })
    for (const phase of ['write', 'resume']) {
      if (LIVE && (await readLogin()).fingerprint !== fingerprint) fail('CREDENTIAL_CHANGED_STOP')
      const childResult = spawnSync(process.execPath, ['--experimental-transform-types', '--disable-warning=ExperimentalWarning', SELF, '--child', phase, root, ...(LIVE ? ['--live', '--codex-login'] : [])], {
        encoding: 'utf8', timeout: 210000, maxBuffer: 1024 * 1024, env: { ...process.env, OTEL_SDK_DISABLED: 'true', DSH_TELEMETRY_MODE: 'DISABLED' },
      })
      if (childResult.error || childResult.signal) fail('CHILD_DID_NOT_COMPLETE')
      let report
      try { report = JSON.parse(childResult.stdout.trim()) } catch { fail('CHILD_REPORT_INVALID') }
      if (childResult.status !== 0 || report.ok !== true) {
        if (!LIVE && report.diagnostic) result.offline_diagnostic = report.diagnostic
        fail(report.stop_reason ?? 'CHILD_FAILED')
      }
      result.phases.push(report.report)
    }
    result.stop_reason = 'COMPLETED'
  } catch (error) { result.stop_reason = safeError(error) }
  finally {
    if (root) {
      try { Object.assign(result, await json(join(root, 'ledger.json'))) } catch { result.ledger_read_failed = true }
      await rm(root, { recursive: true, force: true })
      result.temporary_storage_removed = true
    }
    if (LIVE && fingerprint) {
      try { result.credential_file_unchanged = (await readLogin()).fingerprint === fingerprint } catch { result.credential_file_unchanged = false }
    }
  }
  result.dispatch_count = result.metrics.length
  result.real_provider_dispatches = LIVE ? result.dispatch_count : 0
  result.fresh_processes_completed = result.phases.length
  console.log(JSON.stringify(result))
  if (result.stop_reason !== 'COMPLETED') process.exitCode = 1
}
main().catch(error => { console.error(JSON.stringify({ stop_reason: safeError(error) })); process.exitCode = 1 })
