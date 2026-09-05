/** Fixed, standalone probe for the hidden Codex approval reviewer. */

import type { Dispatcher } from 'undici'
import { OPENAI_CODEX_BASE_URL } from './search.ts'
import { Agent, ProxyAgent, fetch } from './undici-runtime.ts'

/** Hidden reviewer route selected by the first-party Codex catalog. */
export const CODEX_AUTO_REVIEW_MODEL = 'codex-auto-review'

/** Only allowlisted observations leave the network reader. */
export type AutoReviewProbeOutcome = 'completed' | 'http-rejected' | 'transient' | 'incomplete' | 'timeout' | 'cancelled' | 'network-error'

/** No model output, response id, header, or upstream error text is retained. */
export interface AutoReviewProbeEvidence {
  outcome: AutoReviewProbeOutcome
  httpStatus?: number
}

/** Fully resolved request; credentials remain private to this call. */
export interface AutoReviewProbeRequest {
  access: string
  accountId: string
  proxyUrl: string | undefined
  timeoutMs: number
  signal?: AbortSignal
}

/** A response-reading limit, not a model output-token setting. */
const MAX_PROBE_RESPONSE_BYTES = 64 * 1024

const instructions = 'This is a capability diagnostic. Do not call tools or execute any action. Return one strict JSON assessment for the supplied synthetic approval request, including risk_level, user_authorization, outcome, and rationale.'
const input = 'Synthetic approval request only; nothing will be executed. Planned action JSON: {"type":"diagnostic-no-op","sideEffects":false}'
const assessmentSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    risk_level: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
    user_authorization: { type: 'string', enum: ['unknown', 'low', 'medium', 'high'] },
    outcome: { type: 'string', enum: ['allow', 'deny'] },
    rationale: { type: 'string' },
  },
  required: ['risk_level', 'user_authorization', 'outcome', 'rationale'],
} as const

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function assessment(text: string): boolean {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return false
  }
  if (!record(value)) return false
  const keys = Object.keys(value)
  if (keys.some(key => !['risk_level', 'user_authorization', 'outcome', 'rationale'].includes(key))) return false
  if (!['low', 'medium', 'high', 'critical'].includes(String(value['risk_level']))) return false
  if (!['unknown', 'low', 'medium', 'high'].includes(String(value['user_authorization']))) return false
  if (!['allow', 'deny'].includes(String(value['outcome']))) return false
  return typeof value['rationale'] === 'string'
}

function completedResponse(value: unknown): string[] | undefined {
  if (!record(value) || value['status'] !== 'completed' || typeof value['model'] !== 'string' || !Array.isArray(value['output'])) return undefined
  return value['output'].flatMap(item => record(item) && item['type'] === 'message' && item['role'] === 'assistant' && Array.isArray(item['content'])
    ? item['content'].flatMap(part => record(part) && part['type'] === 'output_text' && typeof part['text'] === 'string' ? [part['text']] : [])
    : [])
}

/** Inspect complete SSE frames and accept exactly one matching terminal response. */
function completedStream(text: string): boolean {
  let completed = false
  let terminalTexts: string[] | undefined
  const streamedTexts: string[] = []
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
      if (!record(event) || event['type'] === 'error' || event['type'] === 'response.failed' || event['type'] === 'response.incomplete') return false
      if (event['type'] === 'response.output_text.done') {
        if (typeof event['text'] !== 'string') return false
        streamedTexts.push(event['text'])
      }
      if (event['type'] === 'response.completed' || event['type'] === 'response.done') {
        terminalTexts = completedResponse(event['response'])
        if (completed || terminalTexts === undefined) return false
        completed = true
      }
    } else if (line.startsWith('data:')) {
      data.push(line.slice(5).replace(/^ /u, ''))
    }
  }
  if (!completed || data.length !== 0) return false
  const texts = terminalTexts!.length > 0 ? terminalTexts! : streamedTexts
  return texts.length === 1 && assessment(texts[0]!)
}

/**
 * Send one secret-free synthetic approval to the hidden reviewer model.
 * The result is evidence only and never authorizes or executes an action.
 * @param request - OAuth credential, explicit network policy, deadline, and optional cancellation.
 * @param createDispatcher - owned connection factory; tests use an offline dispatcher.
 * @returns bounded evidence without model-generated or provider error text.
 */
export async function probeCodexAutoReview(
  request: AutoReviewProbeRequest,
  createDispatcher: (proxyUrl: string | undefined) => Dispatcher = proxyUrl => proxyUrl === undefined ? new Agent() : new ProxyAgent(proxyUrl),
): Promise<AutoReviewProbeEvidence> {
  const dispatcher = createDispatcher(request.proxyUrl)
  const controller = new AbortController()
  let timedOut = false
  let cancelled = request.signal?.aborted ?? false
  const cancel = (): void => {
    cancelled = true
    controller.abort()
  }
  request.signal?.addEventListener('abort', cancel, { once: true })
  if (cancelled) controller.abort()
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, request.timeoutMs)
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
        model: CODEX_AUTO_REVIEW_MODEL,
        instructions,
        input: [{ role: 'user', content: [{ type: 'input_text', text: input }] }],
        text: {
          format: {
            type: 'json_schema',
            name: 'codex_auto_review_assessment',
            strict: true,
            schema: assessmentSchema,
          },
        },
        stream: true,
        store: false,
      }),
    })
    httpStatus = response.status
    if (!response.ok) {
      await response.body?.cancel()
      return { outcome: [400, 401, 403, 404, 405, 422].includes(httpStatus) ? 'http-rejected' : 'transient', httpStatus }
    }
    const contentType = response.headers.get('content-type')
    if (httpStatus !== 200 || (contentType !== null && !contentType.toLowerCase().startsWith('text/event-stream')) || response.body === null) {
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
    return { outcome: completedStream(text) ? 'completed' : 'incomplete', httpStatus }
  } catch {
    // Network, decoding, and cancellation errors can contain credentials or response text.
    const outcome = cancelled ? 'cancelled' : timedOut ? 'timeout' : 'network-error'
    return { outcome, ...httpStatus === undefined ? {} : { httpStatus } }
  } finally {
    clearTimeout(timer)
    request.signal?.removeEventListener('abort', cancel)
    await dispatcher.destroy()
  }
}
