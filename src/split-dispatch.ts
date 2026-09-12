/** Request-local transport limits. Inert unless a host-owned Split operation enters this scope. */
import { AsyncLocalStorage } from 'node:async_hooks'
import type { Provider, SimpleStreamOptions } from '@earendil-works/pi-ai'

export const SPLIT_MODEL = 'gpt-5.6-luna'
export const SPLIT_READ_TOOL = 'split_read_evidence'
export const SPLIT_RESULT_TOOL = 'structured_output'
export interface SplitDispatchScope {
  readonly signal: AbortSignal
  readonly maximumRequests: number
  childId: string | undefined
  requests: number
  closed: boolean
}
const storage = new AsyncLocalStorage<SplitDispatchScope>()
export const currentSplitDispatch = (): SplitDispatchScope | undefined => storage.getStore()
export function withSplitDispatch<T>(scope: SplitDispatchScope, operation: () => T): T { return storage.run(scope, operation) }
function record(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value) }
function assertOpen(scope: SplitDispatchScope): void {
  scope.signal.throwIfAborted()
  if (scope.closed || scope.childId === undefined) throw new Error('SPLIT_DISPATCH_CLOSED')
}

/** Force SSE and zero provider retries; reserve every payload before it can reach fetch. */
export function withSplitProviderBounds(provider: Provider): Provider {
  return {
    ...provider,
    streamSimple(model, context, options) {
      const scope = storage.getStore()
      if (scope === undefined) return provider.streamSimple(model, context, options)
      assertOpen(scope)
      if (options === undefined || model.provider !== 'openai-codex' || model.id !== SPLIT_MODEL || options.sessionId !== scope.childId) throw new Error('SPLIT_ROUTE_DENIED')
      const onPayload = options.onPayload
      let reserved = false
      const bounded: SimpleStreamOptions = {
        ...options, transport: 'sse', maxRetries: 0,
        signal: options.signal === undefined ? scope.signal : AbortSignal.any([options.signal, scope.signal]),
        async onPayload(payload, payloadModel) {
          assertOpen(scope)
          const replacement = await onPayload?.(payload, payloadModel)
          assertOpen(scope)
          const next = replacement === undefined ? payload : replacement
          if (!record(next) || next['model'] !== SPLIT_MODEL || next['service_tier'] !== undefined
            || next['stream'] !== true || next['store'] !== false
            || !record(next['reasoning']) || next['reasoning']['effort'] !== 'low'
            || !Array.isArray(next['tools']) || next['tools'].some(tool => !record(tool) || tool['type'] !== 'function'
              || ![SPLIT_READ_TOOL, SPLIT_RESULT_TOOL].includes(String(tool['name'])))
            || Buffer.byteLength(JSON.stringify(next)) > 512_000) throw new Error('SPLIT_PAYLOAD_DENIED')
          if (reserved || scope.requests >= scope.maximumRequests) throw new Error('SPLIT_REQUEST_BUDGET')
          scope.requests += 1
          reserved = true
          return next
        },
      }
      return provider.streamSimple(model, context, bounded)
    },
  }
}
