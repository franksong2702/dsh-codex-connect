/** Exact request scope, not a permission source. The host supplies every closure. */
import { AsyncLocalStorage } from 'node:async_hooks'
import type { Provider } from '@earendil-works/pi-ai'
import type { TaskRoute } from './adaptive-task-contract.ts'
import { taskFailure } from './adaptive-task-store.ts'
export interface TaskDispatchScope {
  readonly route: TaskRoute
  readonly cacheKey: string
  readonly signal: AbortSignal
  /** Only host-owned compaction may omit effort; its ordinary provider default is not a task change. */
  readonly hostDefaultEfforts?: readonly string[]
  reserve(): Promise<void>
}
const scope = new AsyncLocalStorage<TaskDispatchScope>()
export const currentAdaptiveTaskDispatch = (): TaskDispatchScope | undefined => scope.getStore()
export function inAdaptiveTaskDispatch<T>(value: TaskDispatchScope, fn: () => T): T { return scope.run(value, fn) }
/** This hook is called inside the shared governor immediately before each actual fetch. */
export async function reserveAdaptiveTaskAttempt(): Promise<void> { await scope.getStore()?.reserve() }
/** Ordinary requests are unchanged. Task requests use independent cache identity and no automatic retry. */
export function withAdaptiveTaskProvider(provider: Provider): Provider {
  return { ...provider, streamSimple(model, context, options) {
    const task = scope.getStore()
    if (task === undefined) return provider.streamSimple(model, context, options)
    task.signal.throwIfAborted()
    if (model.provider !== 'openai-codex' || model.id !== task.route.model) taskFailure('TASK_ROUTE_CHANGED')
    const before = options?.onPayload
    return provider.streamSimple(model, context, { ...options, transport: 'sse', maxRetries: 0,
      sessionId: task.cacheKey, signal: options?.signal === undefined ? task.signal : AbortSignal.any([options.signal, task.signal]),
      async onPayload(payload, payloadModel) {
        const changed = await before?.(payload, payloadModel)
        const next = changed === undefined ? payload : changed
        task.signal.throwIfAborted()
        if (next === null || typeof next !== 'object' || !('model' in next) || next.model !== task.route.model) taskFailure('TASK_ROUTE_CHANGED')
        const reasoning = 'reasoning' in next ? next.reasoning : undefined
        const effort = reasoning !== null && typeof reasoning === 'object' && 'effort' in reasoning ? reasoning.effort : undefined
        if (task.hostDefaultEfforts === undefined ? effort !== task.route.effort
          : effort !== undefined && !task.hostDefaultEfforts.includes(String(effort))) taskFailure('TASK_ROUTE_CHANGED')
        return next
      },
    })
  } }
}
