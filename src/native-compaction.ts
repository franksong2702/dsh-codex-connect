/** Provider-native Responses V2 compaction bridged through DSH's existing compaction transaction. */

import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'
import {
  createAssistantMessageEventStream,
} from '@earendil-works/pi-ai'
import type {
  AssistantMessage,
  AssistantMessageEventStream,
  Api,
  Context as PiContext,
  Model,
  Provider,
  SimpleStreamOptions,
  Usage,
} from '@earendil-works/pi-ai'
import {
  convertResponsesMessages,
  convertResponsesTools,
} from '@earendil-works/pi-ai/api/openai-responses-shared'
import type { GenerateOptions, Message, StreamChunk } from '@deepseek-ai/dsh-llm'

export const OPENAI_CODEX_NATIVE_COMPACTION_URL = 'https://chatgpt.com/backend-api/codex/responses'
export const OPENAI_CODEX_NATIVE_COMPACTION_RETAINED_BYTES = 64_000
export const OPENAI_CODEX_NATIVE_COMPACTION_MAX_CHECKPOINT_BYTES = 2 * 1024 * 1024

const CHECKPOINT_OPEN = '<dsh-codex-connect-native-compaction-v1>'
const CHECKPOINT_CLOSE = '</dsh-codex-connect-native-compaction-v1>'
const SENTINEL_PREFIX = '<dsh-codex-connect-native-checkpoint:'
const SENTINEL_SUFFIX = '>'
const CODEX_TOOL_CALL_PROVIDERS = new Set(['openai', 'openai-codex', 'opencode'])
const MAX_NATIVE_COMPACTION_RETRIES = 2

type JsonRecord = Record<string, unknown>

interface CompactResponse {
  readonly id?: string
  readonly output: readonly unknown[]
  readonly usage?: JsonRecord
}

interface NativeCompactionScope {
  readonly useNativeCompaction: boolean
  readonly expansions: ReadonlyMap<string, readonly unknown[]>
}

const nativeCompactionScope = new AsyncLocalStorage<NativeCompactionScope>()

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isTextBlock(value: unknown): value is { type: 'text'; text: string } {
  return isRecord(value) && value['type'] === 'text' && typeof value['text'] === 'string'
}

function isCompactCheckpointSource(message: Message): boolean {
  const source = message.source as { kind?: unknown; plugin?: unknown }
  return source.kind === 'plugin' && source.plugin === 'compact'
}

function isCompactionInstructionMessage(message: Message | undefined): boolean {
  if (message === undefined || message.role !== 'user') return false
  const source = message.source as { kind?: unknown; plugin?: unknown }
  return source.kind === 'plugin'
    && source.plugin === 'dsh-compaction-basic'
    && message.content.length === 1
    && isTextBlock(message.content[0])
    && message.content[0].text.trim().length > 0
}

function validateNativeItems(value: unknown): readonly unknown[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 1024) {
    throw new Error('Codex native compaction checkpoint has an invalid item list')
  }
  let compactions = 0
  for (const item of value) {
    if (!isRecord(item)) throw new Error('Codex native compaction checkpoint contains a malformed item')
    if (item['type'] === 'compaction') {
      const encrypted = item['encrypted_content']
      if (typeof encrypted !== 'string' || encrypted.trim().length === 0
        || (item['id'] !== undefined && (typeof item['id'] !== 'string' || item['id'].length === 0))) {
        throw new Error('Codex native compaction checkpoint contains invalid encrypted content or identity')
      }
      compactions += 1
    } else if (item['role'] !== 'user' || (item['type'] !== undefined && item['type'] !== 'message')
      || !Array.isArray(item['content'])) {
      throw new Error('Codex native compaction checkpoint contains an unsupported retained item')
    }
  }
  if (compactions !== 1 || !isRecord(value.at(-1)) || value.at(-1)?.['type'] !== 'compaction') {
    throw new Error('Codex native compaction checkpoint must end with exactly one compaction item')
  }
  return value
}

/** Encode one validated native history payload into text that DSH can persist as a summary checkpoint. */
export function encodeNativeCompactionCheckpoint(items: readonly unknown[]): string {
  validateNativeItems(items)
  const payload = JSON.stringify({ version: 1, items })
  const payloadBytes = Buffer.byteLength(payload)
  if (payloadBytes > OPENAI_CODEX_NATIVE_COMPACTION_MAX_CHECKPOINT_BYTES) {
    throw new Error('Codex native compaction checkpoint exceeds the local size limit')
  }
  return `${CHECKPOINT_OPEN}${Buffer.from(payload).toString('base64url')}${CHECKPOINT_CLOSE}`
}

/** Decode only a plugin-owned DSH compaction checkpoint. User-authored marker text is never authority. */
export function decodeNativeCompactionCheckpoint(message: Message): readonly unknown[] | undefined {
  if (!isCompactCheckpointSource(message)) return undefined
  const candidates = message.content.filter(isTextBlock).map(block => block.text)
  const marked = candidates.filter(text => text.includes(CHECKPOINT_OPEN) || text.includes(CHECKPOINT_CLOSE))
  if (marked.length === 0) return undefined
  if (marked.length !== 1) throw new Error('Codex native compaction checkpoint marker is ambiguous')
  const text = marked[0]!
  if (!text.startsWith(CHECKPOINT_OPEN) || !text.endsWith(CHECKPOINT_CLOSE)) {
    throw new Error('Codex native compaction checkpoint marker is malformed')
  }
  const encoded = text.slice(CHECKPOINT_OPEN.length, text.length - CHECKPOINT_CLOSE.length)
  if (encoded.length === 0 || Buffer.byteLength(encoded) > Math.ceil(OPENAI_CODEX_NATIVE_COMPACTION_MAX_CHECKPOINT_BYTES * 4 / 3) + 32) {
    throw new Error('Codex native compaction checkpoint payload is invalid or oversized')
  }
  let decoded: unknown
  try {
    const payload = Buffer.from(encoded, 'base64url')
    if (payload.byteLength > OPENAI_CODEX_NATIVE_COMPACTION_MAX_CHECKPOINT_BYTES) {
      throw new Error('oversized')
    }
    decoded = JSON.parse(payload.toString('utf8'))
  } catch (error: unknown) {
    throw new Error('Codex native compaction checkpoint payload is unreadable', { cause: error })
  }
  if (!isRecord(decoded) || decoded['version'] !== 1) {
    throw new Error('Codex native compaction checkpoint version is unsupported')
  }
  return validateNativeItems(decoded['items'])
}

function checkpointSentinel(): string {
  return `${SENTINEL_PREFIX}${randomUUID()}${SENTINEL_SUFFIX}`
}

function prepareScopedRequest(options: GenerateOptions, enabled: boolean): { options: GenerateOptions; scope: NativeCompactionScope } {
  const expansions = new Map<string, readonly unknown[]>()
  let changed = false
  const messages = options.messages.map(message => {
    const items = decodeNativeCompactionCheckpoint(message)
    if (items === undefined) return message
    const sentinel = checkpointSentinel()
    expansions.set(sentinel, items)
    changed = true
    return {
      ...message,
      content: [{ type: 'text' as const, text: sentinel }],
    }
  })
  const instructionVerified = options.purpose === 'compaction' && isCompactionInstructionMessage(options.messages.at(-1))
  return {
    options: changed ? { ...options, messages } : options,
    scope: {
      useNativeCompaction: enabled && instructionVerified,
      expansions,
    },
  }
}

/** Keep request-local compaction intent and trusted checkpoint expansion through PiAiAdapter's lazy stream boundary. */
export async function* streamWithNativeCompactionScope(
  stream: (options: GenerateOptions) => AsyncIterable<StreamChunk>,
  options: GenerateOptions,
  enabled: boolean,
): AsyncIterable<StreamChunk> {
  const prepared = prepareScopedRequest(options, enabled)
  const iterator = nativeCompactionScope.run(prepared.scope, () => stream(prepared.options)[Symbol.asyncIterator]())
  try {
    while (true) {
      const next = await nativeCompactionScope.run(prepared.scope, () => iterator.next())
      if (next.done) return
      yield next.value
    }
  } finally {
    if (iterator.return !== undefined) {
      await nativeCompactionScope.run(prepared.scope, () => iterator.return!())
    }
  }
}

function inputText(value: unknown): string | undefined {
  if (!isRecord(value) || !Array.isArray(value['content'])) return undefined
  const content = value['content']
  if (content.length !== 1 || !isRecord(content[0]) || content[0]['type'] !== 'input_text' || typeof content[0]['text'] !== 'string') return undefined
  return content[0]['text']
}

function expandScopedInput(input: readonly unknown[], scope: NativeCompactionScope): unknown[] {
  if (scope.expansions.size === 0) return [...input]
  const consumed = new Set<string>()
  const expanded: unknown[] = []
  for (const item of input) {
    const text = inputText(item)
    const replacement = text === undefined ? undefined : scope.expansions.get(text)
    if (replacement === undefined) {
      expanded.push(item)
      continue
    }
    consumed.add(text!)
    expanded.push(...replacement)
  }
  if (consumed.size !== scope.expansions.size) {
    throw new Error('Codex native compaction checkpoint could not be projected into the provider request')
  }
  return expanded
}

function transformPayload(payload: unknown, scope: NativeCompactionScope): JsonRecord {
  if (!isRecord(payload)) throw new Error('OpenAI Codex generated a non-object Responses payload')
  if (scope.expansions.size === 0) return payload
  const input = payload['input']
  if (!Array.isArray(input)) throw new Error('OpenAI Codex generated a Responses payload without an input array')
  return { ...payload, input: expandScopedInput(input, scope) }
}

function serializedBytes(value: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(value))
  } catch {
    return Number.POSITIVE_INFINITY
  }
}

/**
 * Conservative V2 retention projection. Current Codex uses a 64k-token retained-message budget;
 * until DSH exposes the same tokenizer/metadata, keep only newest user-role provider items whose
 * serialized UTF-8 representation fits inside a stricter 64k-byte ceiling. Tool results and model
 * messages remain represented by the opaque compaction item rather than being duplicated here.
 */
export function retainedNativeCompactionInput(input: readonly unknown[]): readonly unknown[] {
  const retained: unknown[] = []
  let used = 0
  for (let index = input.length - 1; index >= 0; index -= 1) {
    const item = input[index]
    if (!isRecord(item) || item['role'] !== 'user') continue
    const size = serializedBytes(item)
    if (!Number.isFinite(size) || size <= 0 || size > OPENAI_CODEX_NATIVE_COMPACTION_RETAINED_BYTES - used) continue
    retained.push(item)
    used += size
  }
  return retained.reverse()
}

function usageNumber(record: JsonRecord | undefined, key: string): number {
  const value = record?.[key]
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0
}

function emptyUsage(): Usage {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  }
}

function compactUsage(raw: JsonRecord | undefined): Usage {
  if (raw === undefined) return emptyUsage()
  const inputDetails = isRecord(raw['input_tokens_details']) ? raw['input_tokens_details'] : undefined
  const outputDetails = isRecord(raw['output_tokens_details']) ? raw['output_tokens_details'] : undefined
  const inputTokens = usageNumber(raw, 'input_tokens')
  const cacheRead = usageNumber(inputDetails, 'cached_tokens')
  const cacheWrite = usageNumber(inputDetails, 'cache_write_tokens')
  return {
    input: Math.max(0, inputTokens - cacheRead - cacheWrite),
    output: usageNumber(raw, 'output_tokens'),
    cacheRead,
    cacheWrite,
    reasoning: usageNumber(outputDetails, 'reasoning_tokens'),
    totalTokens: usageNumber(raw, 'total_tokens'),
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  }
}

function markerStream(model: Model<Api>, response: CompactResponse): AssistantMessageEventStream {
  const stream = createAssistantMessageEventStream()
  const text = encodeNativeCompactionCheckpoint(response.output)
  const partial: AssistantMessage = {
    role: 'assistant',
    content: [],
    api: 'openai-codex-responses',
    provider: model.provider,
    model: model.id,
    ...(response.id === undefined ? {} : { responseId: response.id }),
    usage: compactUsage(response.usage),
    stopReason: 'stop',
    timestamp: Date.now(),
  }
  queueMicrotask(() => {
    stream.push({ type: 'start', partial })
    partial.content.push({ type: 'text', text: '' })
    stream.push({ type: 'text_start', contentIndex: 0, partial })
    ;(partial.content[0] as { type: 'text'; text: string }).text = text
    stream.push({ type: 'text_delta', contentIndex: 0, delta: text, partial })
    stream.push({ type: 'text_end', contentIndex: 0, content: text, partial })
    stream.push({ type: 'done', reason: 'stop', message: partial })
  })
  return stream
}

function failedStream(model: Model<Api>, error: unknown, signal?: AbortSignal): AssistantMessageEventStream {
  const stream = createAssistantMessageEventStream()
  const aborted = signal?.aborted === true
  const failure: AssistantMessage = {
    role: 'assistant',
    content: [],
    api: 'openai-codex-responses',
    provider: model.provider,
    model: model.id,
    usage: emptyUsage(),
    stopReason: aborted ? 'aborted' : 'error',
    errorMessage: error instanceof Error ? error.message : String(error),
    timestamp: Date.now(),
  }
  queueMicrotask(() => {
    stream.push({ type: 'error', reason: aborted ? 'aborted' : 'error', error: failure })
  })
  return stream
}

function responseHeaders(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {}
  headers.forEach((value, key) => { result[key] = value })
  return result
}

function requestSignal(signal: AbortSignal | undefined, timeoutMs: number | undefined): AbortSignal | undefined {
  if (timeoutMs === undefined || timeoutMs <= 0) return signal
  const timeout = AbortSignal.timeout(timeoutMs)
  return signal === undefined ? timeout : AbortSignal.any([signal, timeout])
}

function retryDelayMs(response: Response, attempt: number): number {
  const retryAfterMsHeader = response.headers.get('retry-after-ms')
  if (retryAfterMsHeader !== null) {
    const retryAfterMs = Number(retryAfterMsHeader)
    if (Number.isFinite(retryAfterMs) && retryAfterMs >= 0) return retryAfterMs
  }
  const retryAfter = response.headers.get('retry-after')
  if (retryAfter !== null) {
    const seconds = Number(retryAfter)
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000
  }
  return Math.min(4_000, 500 * 2 ** attempt)
}

function retryableStatus(status: number): boolean {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504
}

async function waitForRetry(delay: number, signal?: AbortSignal): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    if (signal === undefined) {
      setTimeout(resolve, delay)
      return
    }
    if (signal.aborted) {
      reject(signal.reason)
      return
    }
    const onAbort = (): void => {
      clearTimeout(timeout)
      reject(signal.reason)
    }
    const timeout = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, delay)
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

function accountIdFromToken(access: string): string {
  try {
    const parts = access.split('.')
    if (parts.length !== 3 || parts[1] === undefined) throw new Error('invalid JWT')
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as JsonRecord
    const auth = payload['https://api.openai.com/auth']
    if (!isRecord(auth)) throw new Error('missing auth claim')
    const accountId = auth['chatgpt_account_id']
    if (typeof accountId !== 'string' || accountId.length === 0) throw new Error('missing account id')
    return accountId
  } catch (error: unknown) {
    throw new Error('OpenAI Codex native compaction credential has no usable account id', { cause: error })
  }
}

async function compactResponse(response: Response, retained: readonly unknown[]): Promise<CompactResponse> {
  if (response.body === null) throw new Error('OpenAI Codex native compaction response had no body')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let compaction: unknown
  let compactionCount = 0
  let outputCount = 0
  let responseId: string | undefined
  let usage: JsonRecord | undefined
  let completed = false
  let receivedBytes = 0

  const consumeEvent = (raw: string): void => {
    const data = raw.split(/\r?\n/u)
      .filter(line => line.startsWith('data:'))
      .map(line => line.slice(5).trimStart())
      .join('\n')
    if (data.length === 0 || data === '[DONE]') return
    const event: unknown = JSON.parse(data)
    if (!isRecord(event)) return
    if (event['type'] === 'response.output_item.done') {
      outputCount += 1
      const item = event['item']
      if (isRecord(item) && item['type'] === 'compaction') {
        compactionCount += 1
        if (compaction === undefined) compaction = item
      }
      return
    }
    if (event['type'] === 'response.failed' || event['type'] === 'error') {
      throw new Error('OpenAI Codex native compaction stream reported failure')
    }
    if (event['type'] !== 'response.completed' && event['type'] !== 'response.done') return
    const terminal = event['response']
    if (completed || !isRecord(terminal) || terminal['status'] !== 'completed') {
      throw new Error('OpenAI Codex native compaction returned an invalid or duplicate terminal event')
    }
    const id = terminal['id']
    if (typeof id !== 'string' || id.length === 0) throw new Error('OpenAI Codex native compaction returned a malformed response id')
    responseId = id
    const rawUsage = terminal['usage']
    if (rawUsage !== undefined && !isRecord(rawUsage)) throw new Error('OpenAI Codex native compaction returned malformed usage')
    usage = rawUsage
    completed = true
  }

  try {
    while (true) {
      const { done, value } = await reader.read()
      receivedBytes += value?.byteLength ?? 0
      if (receivedBytes > OPENAI_CODEX_NATIVE_COMPACTION_MAX_CHECKPOINT_BYTES * 4) {
        throw new Error('OpenAI Codex native compaction stream exceeds the local size limit')
      }
      buffer += decoder.decode(value, { stream: !done })
      while (true) {
        const match = /\r?\n\r?\n/u.exec(buffer)
        if (match === null) break
        consumeEvent(buffer.slice(0, match.index))
        buffer = buffer.slice(match.index + match[0].length)
      }
      if (done) break
    }
    if (buffer.trim().length > 0) consumeEvent(buffer)
  } finally {
    await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
  if (!completed) throw new Error('OpenAI Codex native compaction stream ended before response.completed')
  if (compactionCount !== 1 || compaction === undefined) {
    throw new Error(`OpenAI Codex native compaction expected exactly one compaction item, received ${compactionCount} of ${outputCount} output items`)
  }
  return {
    ...(responseId === undefined ? {} : { id: responseId }),
    output: [...retained, compaction],
    ...(usage === undefined ? {} : { usage }),
  }
}

async function requestNativeCompaction(
  model: Model<Api>,
  context: PiContext,
  options: SimpleStreamOptions | undefined,
  scope: NativeCompactionScope,
): Promise<CompactResponse> {
  const access = options?.apiKey
  if (access === undefined || access.length === 0) throw new Error('OpenAI Codex native compaction request has no OAuth token')
  if (context.messages.length === 0) throw new Error('OpenAI Codex native compaction request has no summarization instruction to remove')
  const messages = context.messages.slice(0, -1)
  const converted = convertResponsesMessages(
    model,
    { ...context, messages },
    CODEX_TOOL_CALL_PROVIDERS,
    { includeSystemPrompt: false },
  )
  const input = expandScopedInput(converted, scope)
  const retained = retainedNativeCompactionInput(input)
  const compat = model.compat as { supportsStrictMode?: boolean; supportsOpenAIGrammarTools?: boolean } | undefined
  const tools = context.tools === undefined || context.tools.length === 0
    ? undefined
    : convertResponsesTools(context.tools, {
        strict: null,
        supportsStrictMode: compat?.supportsStrictMode ?? true,
        supportsOpenAIGrammarTools: compat?.supportsOpenAIGrammarTools ?? false,
      })
  const mappedEffort = options?.reasoning === undefined
    ? undefined
    : model.thinkingLevelMap?.[options.reasoning] ?? options.reasoning
  let body: unknown = {
    model: model.id,
    store: false,
    stream: true,
    input: [...input, { type: 'compaction_trigger' }],
    instructions: context.systemPrompt ?? '',
    ...(tools === undefined ? {} : { tools }),
    tool_choice: 'auto',
    parallel_tool_calls: true,
    include: ['reasoning.encrypted_content'],
    ...(mappedEffort === undefined || mappedEffort === null ? {} : { reasoning: { effort: mappedEffort, summary: 'auto' } }),
    ...(options?.sessionId === undefined ? {} : { prompt_cache_key: options.sessionId }),
    text: { verbosity: 'low' },
  }
  if (options?.onPayload !== undefined) body = await options.onPayload(body, model) ?? body
  if (!isRecord(body)) throw new Error('OpenAI Codex generated a non-object native compaction payload')

  const headers = new Headers(model.headers)
  for (const [key, value] of Object.entries(options?.headers ?? {})) {
    if (value === null) headers.delete(key)
    else headers.set(key, value)
  }
  headers.set('authorization', `Bearer ${access}`)
  headers.set('chatgpt-account-id', accountIdFromToken(access))
  headers.set('originator', 'deepseek-harness')
  headers.set('accept', 'text/event-stream')
  headers.set('content-type', 'application/json')
  headers.set('openai-beta', 'responses=experimental')
  if (options?.sessionId !== undefined) {
    headers.set('session-id', options.sessionId)
    headers.set('thread-id', options.sessionId)
    headers.set('x-client-request-id', options.sessionId)
  }
  headers.set('x-codex-routing-hint', `model=${model.id}`)

  const maxRetries = Math.min(MAX_NATIVE_COMPACTION_RETRIES, Math.max(0, options?.maxRetries ?? MAX_NATIVE_COMPACTION_RETRIES))
  let lastError: unknown
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    let response: Response
    try {
      const signal = requestSignal(options?.signal, options?.timeoutMs)
      response = await (options?.fetch ?? globalThis.fetch)(OPENAI_CODEX_NATIVE_COMPACTION_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        ...(signal === undefined ? {} : { signal }),
      })
    } catch (error: unknown) {
      if (options?.signal?.aborted === true || attempt === maxRetries) throw error
      lastError = error
      await waitForRetry(Math.min(4_000, 500 * 2 ** attempt), options?.signal)
      continue
    }
    await options?.onResponse?.({ status: response.status, headers: responseHeaders(response.headers) }, model)
    if (response.ok) return compactResponse(response, retained)
    const error = new Error(`OpenAI Codex native compaction request failed with HTTP ${response.status}`)
    await response.body?.cancel()
    if (!retryableStatus(response.status) || attempt === maxRetries) throw error
    lastError = error
    await waitForRetry(retryDelayMs(response, attempt), options?.signal)
  }
  throw lastError instanceof Error ? lastError : new Error('OpenAI Codex native compaction request failed')
}

function standardStream(
  provider: Provider,
  model: Model<Api>,
  context: PiContext,
  options: SimpleStreamOptions | undefined,
  scope: NativeCompactionScope | undefined,
): AssistantMessageEventStream {
  if (scope === undefined || scope.expansions.size === 0) return provider.streamSimple(model, context, options)
  return provider.streamSimple(model, context, {
    ...options,
    onPayload: async (payload, payloadModel) => {
      const transformed = transformPayload(payload, scope)
      return options?.onPayload === undefined ? transformed : await options.onPayload(transformed, payloadModel)
    },
  })
}

function nativeCompactionStream(
  provider: Provider,
  model: Model<Api>,
  context: PiContext,
  options: SimpleStreamOptions | undefined,
  scope: NativeCompactionScope,
): AssistantMessageEventStream {
  const target = createAssistantMessageEventStream()
  void (async () => {
    let source: AssistantMessageEventStream
    try {
      const response = await requestNativeCompaction(model, context, options, scope)
      options?.signal?.throwIfAborted()
      // Encoding/validation can fail too; keep it inside the pre-emission fallback boundary.
      source = markerStream(model, response)
    } catch (error: unknown) {
      source = options?.signal?.aborted === true
        ? failedStream(model, error, options.signal)
        : standardStream(provider, model, context, options, scope)
    }
    for await (const event of source) target.push(event)
  })().catch(async (error: unknown) => {
    // A synchronous fallback setup failure or iterator error must terminate the stream.
    for await (const event of failedStream(model, error, options?.signal)) target.push(event)
  })
  return target
}

/** Add native-compaction behavior while keeping ordinary provider requests unchanged. */
export function withOpenAICodexNativeCompaction(provider: Provider): Provider {
  return {
    ...provider,
    streamSimple(model, context, options) {
      const scope = nativeCompactionScope.getStore()
      if (scope?.useNativeCompaction === true) {
        return nativeCompactionStream(provider, model, context, options, scope)
      }
      return standardStream(provider, model, context, options, scope)
    },
  }
}
