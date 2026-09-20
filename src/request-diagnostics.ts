/** Request-local diagnostics attached after Harness classifies a model failure. */
import { AsyncLocalStorage } from 'node:async_hooks'
import type { SimpleStreamOptions } from '@earendil-works/pi-ai'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import {
  OpenAICodexBackendRequestLayer,
  formatOpenAICodexBackendDiagnostic,
  type OpenAICodexBackendDiagnostic,
} from './backend-request.ts'

interface RequestScope { current?: OpenAICodexBackendDiagnostic }
const requestScope = new AsyncLocalStorage<RequestScope>()
const fallbackBackendRequests = new OpenAICodexBackendRequestLayer()

/** Inject the shared backend request policy into pi-ai while preserving its transport hooks. */
export function withCodexDiagnosticFetch(
  options?: SimpleStreamOptions,
  backendRequests: OpenAICodexBackendRequestLayer = fallbackBackendRequests,
): SimpleStreamOptions | undefined {
  const scope = requestScope.getStore()
  if (scope === undefined) return options
  return {
    ...options,
    fetch: backendRequests.wrapFetch('model', options?.fetch ?? globalThis.fetch, diagnostic => {
      scope.current = diagnostic
    }),
  }
}

/** Append diagnostics after DSH has classified the error; request ids must not affect that classification. */
export function streamWithCodexRequestDiagnostics(
  stream: (options: GenerateOptions) => AsyncIterable<StreamChunk>,
  options: GenerateOptions,
): AsyncIterable<StreamChunk> {
  return {
    async *[Symbol.asyncIterator]() {
      const scope: RequestScope = {}
      const iterator = requestScope.run(scope, () => stream(options)[Symbol.asyncIterator]())
      try {
        while (true) {
          const next = await requestScope.run(scope, () => iterator.next())
          if (next.done) return
          const chunk = next.value
          if (chunk.type === 'finish' && chunk.reason.kind === 'error' && chunk.reason.failure !== undefined && scope.current !== undefined) {
            yield {
              ...chunk,
              reason: {
                ...chunk.reason,
                failure: {
                  ...chunk.reason.failure,
                  message: chunk.reason.failure.message + '\n' + formatOpenAICodexBackendDiagnostic(scope.current),
                },
              },
            }
          } else yield chunk
        }
      } finally {
        try { await requestScope.run(scope, () => iterator.return?.()) } finally { delete scope.current }
      }
    },
  }
}
