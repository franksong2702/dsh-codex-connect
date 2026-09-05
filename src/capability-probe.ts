/** Bounded, standalone Responses probe; never used by conversation routing. */

import type { Dispatcher } from 'undici'
import { OPENAI_CODEX_BASE_URL } from './search.ts'
import { Agent, ProxyAgent, fetch } from './undici-runtime.ts'

/** Only allowlisted observations leave the network reader. */
export type ResponsesProbeOutcome = 'completed' | 'http-rejected' | 'transient' | 'incomplete' | 'timeout' | 'network-error'

/** No headers, server messages, response ids, or generated text are retained. */
export interface ResponsesProbeEvidence {
  outcome: ResponsesProbeOutcome
  httpStatus?: number
}

/** Fully resolved standalone request; credentials remain private to this call. */
export interface ResponsesProbeRequest {
  model: string
  access: string
  accountId: string
  proxyUrl: string | undefined
  timeoutMs: number
}

/** A security limit, not a model output-token setting. */
const MAX_PROBE_RESPONSE_BYTES = 64 * 1024

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function completedResponse(value: unknown, model: string): boolean {
  if (!record(value) || value['status'] !== 'completed' || !Array.isArray(value['output'])) return false
  if (value['model'] !== model) return false
  return value['output'].some(item => record(item) && item['type'] === 'message'
    && item['role'] === 'assistant' && Array.isArray(item['content'])
    && item['content'].some(part => record(part) && part['type'] === 'output_text'
      && typeof part['text'] === 'string' && part['text'].trim().length > 0))
}

/** Inspect complete SSE frames, not substrings inside error text or schema errors. */
function completedStream(text: string, model: string): boolean {
  let completed = false
  let data: string[] = []
  for (const line of text.split(/\r\n|\r|\n/u)) {
    if (line === '') {
      if (data.length === 0) continue
      const payload = data.join('\n')
      data = []
      if (payload === '[DONE]') continue
      let event: unknown
      try {
        event = JSON.parse(payload)
      } catch {
        return false
      }
      if (!record(event)) return false
      if (event['type'] === 'error' || event['type'] === 'response.failed' || event['type'] === 'response.incomplete') return false
      if (event['type'] === 'response.completed' || event['type'] === 'response.done') {
        if (completed || !completedResponse(event['response'], model)) return false
        completed = true
      }
    } else if (line.startsWith('data:')) {
      data.push(line.slice(5).replace(/^ /u, ''))
    }
  }
  return completed && data.length === 0
}

/**
 * Send one fixed, stateless prompt to the first-party Responses endpoint.
 * No refresh, redirects, retries, session ids, or optional capabilities are used.
 * The deadline covers headers and EOF; owned sockets are destroyed before return.
 * @param request - resolved model, OAuth credential, and network policy.
 * @param createDispatcher - owned connection factory; tests use an offline dispatcher.
 * @returns bounded evidence, never upstream body text or exception messages.
 */
export async function probeCodexResponses(
  request: ResponsesProbeRequest,
  createDispatcher: (proxyUrl: string | undefined) => Dispatcher = proxyUrl => proxyUrl === undefined ? new Agent() : new ProxyAgent(proxyUrl),
): Promise<ResponsesProbeEvidence> {
  const dispatcher = createDispatcher(request.proxyUrl)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), request.timeoutMs)
  let httpStatus: number | undefined
  try {
    const response = await fetch(`${OPENAI_CODEX_BASE_URL}/responses`, {
      dispatcher,
      method: 'POST',
      redirect: 'manual',
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${request.access}`,
        'chatgpt-account-id': request.accountId,
        'content-type': 'application/json',
        accept: 'text/event-stream',
        originator: 'deepseek-harness',
      },
      body: JSON.stringify({
        model: request.model,
        instructions: 'You are a connectivity diagnostic. Reply with only ok.',
        input: [{ role: 'user', content: [{ type: 'input_text', text: 'Reply with only ok.' }] }],
        stream: true,
        store: false,
      }),
    })
    httpStatus = response.status
    if (!response.ok) {
      await response.body?.cancel()
      return { outcome: [400, 401, 403, 404, 405, 422].includes(httpStatus) ? 'http-rejected' : 'transient', httpStatus }
    }
    if (httpStatus !== 200 || !response.headers.get('content-type')?.toLowerCase().startsWith('text/event-stream') || response.body === null) {
      await response.body?.cancel()
      return { outcome: 'incomplete', httpStatus }
    }
    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let size = 0
    try {
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        size += value.byteLength
        if (size > MAX_PROBE_RESPONSE_BYTES) {
          await reader.cancel()
          return { outcome: 'incomplete', httpStatus }
        }
        chunks.push(value)
      }
    } finally {
      reader.releaseLock()
    }
    const text = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))
    return { outcome: completedStream(text, request.model) ? 'completed' : 'incomplete', httpStatus }
  } catch {
    // Network, decoding, and cancellation errors can contain credentials or response text.
    return { outcome: controller.signal.aborted ? 'timeout' : 'network-error', ...httpStatus === undefined ? {} : { httpStatus } }
  } finally {
    clearTimeout(timer)
    await dispatcher.destroy()
  }
}
