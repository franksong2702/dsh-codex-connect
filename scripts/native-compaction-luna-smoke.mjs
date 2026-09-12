/** Bounded provider-acceptance probe. Default is offline; --live permits one three-dispatch run. */
import assert from 'node:assert/strict'
import { randomUUID, createHash } from 'node:crypto'
import { open, readFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { zstdDecompressSync } from 'node:zlib'

process.env.OTEL_SDK_DISABLED = 'true'
process.env.DSH_TELEMETRY_MODE = 'DISABLED'
// Any network path other than the explicitly guarded SSE transport is forbidden.
globalThis.fetch = async () => { throw new Error('UNGUARDED_NETWORK_BLOCKED') }
globalThis.WebSocket = class { constructor() { throw new Error('WEBSOCKET_BLOCKED') } }

const MODEL = 'gpt-5.6-luna'
const ENDPOINT = 'https://chatgpt.com/backend-api/codex/responses'
const LIMIT = 8 * 1024 * 1024
const LIVE = process.argv.includes('--live')
const CODEX_LOGIN = process.argv.includes('--codex-login')
const record = value => typeof value === 'object' && value !== null && !Array.isArray(value)
const finite = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
const safeModel = value => typeof value === 'string' && /^gpt-[A-Za-z0-9._-]{1,80}$/u.test(value) ? value : null
const safeCode = value => typeof value === 'string' && /^[a-z_]{1,64}$/u.test(value) ? value : null
const sameLuna = value => value === null || value === MODEL || /^gpt-5\.6-luna-\d{4}-\d{2}-\d{2}$/u.test(value)
const stop = code => { throw new Error(code) }
const ownError = error => typeof error?.message === 'string' && /^[A-Z_]{1,80}$/u.test(error.message) ? error.message : 'PROBE_ERROR_REDACTED'

/** Interpret only an explicitly selected existing ChatGPT login; never return its refresh token. */
function codexCredential(document) {
  const tokens = document?.tokens
  if (document?.auth_mode !== 'chatgpt' || !record(tokens)
    || typeof tokens.access_token !== 'string' || tokens.access_token.length === 0
    || typeof tokens.account_id !== 'string' || tokens.account_id.length === 0) stop('CODEX_LOGIN_INVALID')
  let claims
  try {
    const parts = tokens.access_token.split('.')
    if (parts.length !== 3) stop('CODEX_LOGIN_INVALID')
    claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
  } catch { stop('CODEX_LOGIN_INVALID') }
  if (claims?.['https://api.openai.com/auth']?.chatgpt_account_id !== tokens.account_id
    || !Number.isFinite(claims?.exp) || claims.exp <= 0) stop('CODEX_LOGIN_INVALID')
  return { type: 'oauth', access: tokens.access_token, expires: claims.exp * 1000 }
}

async function readCodexLogin() {
  const path = join(process.env.CODEX_HOME?.trim() || join(homedir(), '.codex'), 'auth.json')
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const stat = await handle.stat()
    if (!stat.isFile() || (stat.mode & 0o077) !== 0
      || (process.getuid !== undefined && stat.uid !== process.getuid()) || stat.size > 512 * 1024) stop('CODEX_LOGIN_FILE_UNSAFE')
    const bytes = await handle.readFile()
    if (bytes.byteLength > 512 * 1024) stop('CODEX_LOGIN_FILE_UNSAFE')
    return codexCredential(JSON.parse(bytes.toString('utf8')))
  } finally { await handle.close() }
}

function sse(items, text) {
  const events = items.flatMap((item, output_index) => [
    { type: 'response.output_item.added', output_index, item: text === undefined ? item : { ...item, content: [] } },
    ...(text === undefined ? [] : [{ type: 'response.output_text.delta', item_id: item.id, output_index, content_index: 0, delta: text }]),
    { type: 'response.output_item.done', output_index, item },
  ])
  events.push({ type: 'response.completed', response: { id: 'resp_offline', model: MODEL, status: 'completed', output: items,
    usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15, input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 } } } })
  return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } })
}
function offlineResponse(stage, scenario) {
  if (stage === 'native' && scenario === 'reject-native') return new Response(JSON.stringify({ error: { code: 'invalid_request_error', param: 'input' } }), { status: 400 })
  if (stage === 'native' && scenario !== 'missing-native') return sse([{ type: 'compaction', id: 'cmp_offline', encrypted_content: 'synthetic-probe-opaque' }])
  const text = 'N7Q4R8T2V6X9'
  return sse([{ type: 'message', id: 'msg_offline', role: 'assistant', status: 'completed', phase: 'final_answer', content: [{ type: 'output_text', text, annotations: [] }] }], text)
}

async function main() {
  if (process.argv.slice(2).some(arg => !['--live', '--offline', '--codex-login'].includes(arg))
    || (LIVE && process.argv.includes('--offline')) || (CODEX_LOGIN && !LIVE)) stop('INVALID_MODE')
  const [{ openaiCodexProvider }, native, { createUserMessage }, { OpenAICodexCredentialStore }, undici] = await Promise.all([
    import('@earendil-works/pi-ai/providers/openai-codex'), import('../src/native-compaction.ts'),
    import('@deepseek-ai/dsh-llm'), import('../src/store.ts'), import('undici'),
  ])
  const provider = native.withOpenAICodexNativeCompaction(openaiCodexProvider())
  const model = provider.getModels().find(candidate => candidate.id === MODEL)
  const base = { schema_version: 1, mode: LIVE ? 'live' : 'offline', request_model: MODEL, node: process.version,
    source_sha256: createHash('sha256').update(await readFile(new URL('../src/native-compaction.ts', import.meta.url))).digest('hex'),
    transport: 'sse', max_retries: 0, maximum_dispatches: 3, credential_refresh: false,
    credential_source: LIVE ? (CODEX_LOGIN ? 'codex-login' : 'dsh-active') : 'synthetic',
    full_dsh_lifecycle: false, bridge_and_codec: true, persistent_session_write: false }
  if (!model) {
    console.log(JSON.stringify({ ...base, real_provider_dispatches: 0, stop_reason: 'EXACT_LUNA_MODEL_NOT_IN_CATALOG' }))
    return
  }
  let credential
  if (LIVE) {
    // Read exactly one explicitly selected source; never search, refresh, migrate or change accounts.
    try { credential = CODEX_LOGIN ? await readCodexLogin() : await new OpenAICodexCredentialStore().read('openai-codex') } catch {
      console.log(JSON.stringify({ ...base, real_provider_dispatches: 0, stop_reason: 'CREDENTIAL_READ_BLOCKED_OR_INVALID' }))
      return
    }
    if (credential?.type !== 'oauth' || typeof credential.access !== 'string') {
      console.log(JSON.stringify({ ...base, real_provider_dispatches: 0, stop_reason: 'ACTIVE_OAUTH_CREDENTIAL_MISSING' }))
      return
    }
    if (!Number.isFinite(credential.expires) || credential.expires <= Date.now() + 300_000) {
      console.log(JSON.stringify({ ...base, real_provider_dispatches: 0, stop_reason: 'CREDENTIAL_EXPIRED_OR_TOO_CLOSE_NO_REFRESH' }))
      return
    }
  } else {
    const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url')
    const expires = Math.floor(Date.now() / 1000) + 3600
    const access = `${encode({ alg: 'none' })}.${encode({ exp: expires, 'https://api.openai.com/auth': { chatgpt_account_id: 'offline-only' } })}.synthetic`
    const document = { auth_mode: 'chatgpt', tokens: { access_token: access, account_id: 'offline-only', refresh_token: 'never-return-this' } }
    credential = codexCredential(document)
    assert.deepEqual(credential, { type: 'oauth', access, expires: expires * 1000 })
    assert.equal(Object.hasOwn(credential, 'refresh'), false)
    assert.equal(Object.hasOwn(credential, 'refresh_token'), false)
    for (const invalid of [undefined, { ...document, auth_mode: 'apikey' }, { ...document, tokens: {} },
      { ...document, tokens: { ...document.tokens, account_id: 'different-account' } },
      { ...document, tokens: { ...document.tokens, access_token: 'invalid' } }]) {
      assert.throws(() => codexCredential(invalid), /CODEX_LOGIN_INVALID/u)
    }
  }
  const dispatcher = LIVE ? new undici.EnvHttpProxyAgent() : undefined
  try {
    for (const scenario of LIVE ? ['live'] : ['success', 'reject-native', 'missing-native']) {
      let dispatches = 0
      let blocked = 0
      let fallbackAttempted = false
      let stage
      let baseline
      let expectedLabel
      let output
      const metrics = []
      const usedStages = new Set()
      const sessionId = `luna-native-smoke-${randomUUID()}`
      const guardedFetch = async (url, init) => {
        let bytes = init?.body
        if (new Headers(init?.headers).get('content-encoding') === 'zstd') bytes = zstdDecompressSync(bytes)
        const body = JSON.parse(typeof bytes === 'string' ? bytes : Buffer.from(bytes).toString('utf8'))
        const input = Array.isArray(body.input) ? body.input : []
        const triggers = input.filter(item => item?.type === 'compaction_trigger').length
        const compactions = input.filter(item => item?.type === 'compaction').length
        if (stage === 'native' && triggers !== 1) fallbackAttempted = true
        const projection = JSON.stringify(input.filter(item => item?.type !== 'compaction'))
        if (String(url) !== ENDPOINT || init?.method !== 'POST' || body.model !== MODEL || body.service_tier !== undefined
          || dispatches >= 3 || usedStages.has(stage) || body.stream !== true || body.store !== false
          || (stage === 'native' ? triggers !== 1 || input.at(-1)?.type !== 'compaction_trigger' : triggers !== 0)
          || (stage === 'replay' ? compactions !== 1 || projection.includes(expectedLabel) : compactions !== 0)
          || JSON.stringify(input).includes('dsh-codex-connect-native-checkpoint:')) {
          blocked += 1
          stop('DISPATCH_GUARD_BLOCKED')
        }
        usedStages.add(stage)
        dispatches += 1
        const started = performance.now()
        const metric = { stage, dispatch: dispatches, request_model: body.model, server_model: null, http_status: null,
          reasoning_effort: body.reasoning?.effort === 'low' ? 'low' : 'other_or_absent', terminal_status: null,
          input_tokens: null, output_tokens: null, total_tokens: null, cached_tokens: null, reasoning_tokens: null,
          compaction_items: 0, latency_ms: null, error_code: null }
        metrics.push(metric)
        let response
        try {
          response = LIVE ? await undici.fetch(ENDPOINT, { ...init, dispatcher, redirect: 'manual' }) : offlineResponse(stage, scenario)
          metric.http_status = response.status
          const reader = response.body?.getReader()
          if (!reader) stop('RESPONSE_BODY_MISSING')
          const chunks = []
          let size = 0
          try {
            while (true) {
              const next = await reader.read()
              if (next.done) break
              size += next.value.byteLength
              if (size > LIMIT) stop('RESPONSE_SIZE_LIMIT')
              chunks.push(next.value)
            }
          } finally {
            await reader.cancel().catch(() => undefined)
            reader.releaseLock()
          }
          // Bytes remain only in this process; never print or persist bodies or encrypted items.
          const raw = Buffer.concat(chunks).toString('utf8')
          if (response.ok) {
            for (const frame of raw.split(/\r?\n\r?\n/u)) {
              const data = frame.split(/\r?\n/u).filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n')
              if (!data || data === '[DONE]') continue
              const event = JSON.parse(data)
              if (event.type === 'response.output_item.done' && event.item?.type === 'compaction') metric.compaction_items += 1
              if (event.type === 'error' || event.type === 'response.failed') metric.error_code = safeCode(event.error?.code ?? event.response?.error?.code)
              if (event.type === 'response.completed' || event.type === 'response.done') {
                const terminal = event.response
                metric.server_model = safeModel(terminal?.model)
                metric.terminal_status = ['completed', 'failed', 'incomplete'].includes(terminal?.status) ? terminal.status : 'other'
                const usage = terminal?.usage
                metric.input_tokens = finite(usage?.input_tokens)
                metric.output_tokens = finite(usage?.output_tokens)
                metric.total_tokens = finite(usage?.total_tokens)
                metric.cached_tokens = finite(usage?.input_tokens_details?.cached_tokens)
                metric.reasoning_tokens = finite(usage?.output_tokens_details?.reasoning_tokens)
              }
            }
          } else {
            try { metric.error_code = safeCode(JSON.parse(raw)?.error?.code) } catch { /* Never echo an error body. */ }
          }
          return new Response(raw, { status: response.status, headers: { 'content-type': response.headers.get('content-type') ?? 'text/event-stream' } })
        } finally {
          metric.latency_ms = Math.round(performance.now() - started)
        }
      }
      const user = (text, source = { kind: 'user' }) => createUserMessage({ source, content: [{ type: 'text', text }] })
      const runStage = async (name, messages, enabled = false) => {
        stage = name
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 90_000)
        let result
        try {
          const scoped = native.streamWithNativeCompactionScope(async function* (prepared) {
            const piMessages = prepared.messages.map(message => message.role === 'assistant' ? baseline : {
              role: 'user', content: message.content.map(block => ({ type: 'text', text: block.text })), timestamp: Date.now(),
            })
            result = await provider.streamSimple(model, {
              systemPrompt: 'Follow concise test instructions. Preserve the checkpoint label for later recall.', messages: piMessages,
            }, { apiKey: credential.access, transport: 'sse', maxRetries: 0, maxTokens: 256, reasoning: 'low', sessionId,
              timeoutMs: 90_000, signal: controller.signal, fetch: guardedFetch,
              onPayload: () => undefined,
            }).result()
            yield* []
          }, { provider: 'openai-codex', model: MODEL, messages, ...(name === 'native' ? { purpose: 'compaction' } : {}) }, enabled)
          for await (const unused of scoped) void unused
          if (result?.stopReason !== 'stop') stop(name === 'native' ? 'NATIVE_REQUEST_FAILED_NO_FALLBACK_DISPATCH' : 'ORDINARY_REQUEST_FAILED')
          if (!sameLuna(metrics.at(-1)?.server_model ?? null)) stop('UNEXPECTED_SERVER_MODEL_STOP')
          return result
        } finally { clearTimeout(timer) }
      }
      const result = { ...base, scenario, metrics, native_checkpoint_accepted: false, replay_accepted: false, label_recalled: false }
      try {
        const first = user('Generate a fresh random-looking label of exactly 12 uppercase ASCII letters and digits. Return ONLY that label, with no quotes or explanation. Remember it as the checkpoint label.')
        baseline = await runStage('baseline', [first])
        expectedLabel = baseline.content.filter(block => block.type === 'text').map(block => block.text).join('').trim()
        if (!/^[A-Z0-9]{12}$/u.test(expectedLabel)) stop('BASELINE_LABEL_FORMAT_INVALID_NO_RETRY')
        const instruction = user('Summarize the context, preserving the checkpoint label.', { kind: 'plugin', plugin: 'dsh-compaction-basic' })
        const compacted = await runStage('native', [first, { ...baseline, source: { kind: 'model', provider: 'openai-codex', model: MODEL } }, instruction], true)
        const text = compacted.content.filter(block => block.type === 'text').map(block => block.text).join('')
        const checkpoint = user(text, { kind: 'plugin', plugin: 'compact' })
        const items = native.decodeNativeCompactionCheckpoint(checkpoint)
        if (!items || metrics.at(-1)?.compaction_items !== 1) stop('NO_VALID_NATIVE_CHECKPOINT')
        if (JSON.stringify(items.filter(item => item.type !== 'compaction')).includes(expectedLabel)) stop('LABEL_EXPOSED_IN_RETAINED_TEXT')
        result.native_checkpoint_accepted = true
        output = await runStage('replay', [checkpoint, user('What was the checkpoint label you generated earlier? Return ONLY that same label. Do not generate a new one.')], false)
        result.replay_accepted = true
        result.label_recalled = output.content.filter(block => block.type === 'text').map(block => block.text).join('').trim() === expectedLabel
        result.stop_reason = result.label_recalled ? 'COMPLETED' : 'RECALL_MISMATCH_NO_RETRY'
      } catch (error) {
        result.stop_reason = ownError(error)
      }
      Object.assign(result, { dispatch_count: dispatches, real_provider_dispatches: LIVE ? dispatches : 0,
        blocked_dispatch_attempts: blocked, fallback_attempted: fallbackAttempted, fallback_dispatched: false })
      if (!LIVE) {
        assert.equal(dispatches, scenario === 'success' ? 3 : 2)
        assert.equal(result.label_recalled, scenario === 'success')
        assert.equal(fallbackAttempted, scenario !== 'success')
        assert.equal(blocked, scenario === 'success' ? 0 : 1)
      }
      console.log(JSON.stringify(result))
    }
  } finally {
    await dispatcher?.destroy()
    credential = undefined
  }
}
main().catch(error => { console.error(JSON.stringify({ stop_reason: ownError(error) })); process.exitCode = 1 })
