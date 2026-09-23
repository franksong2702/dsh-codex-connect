/** Shared task-level policy. Catalog facts are not account eligibility or price claims. */
export const ADAPTIVE_TASK_PATH = '/plugins/dsh-codex-connect/task'
export const ADAPTIVE_TASK_MODELS = ['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna', 'gpt-6-astra', 'gpt-6-sol', 'gpt-6-luna'] as const
export const ADAPTIVE_TASK_START = Object.freeze({ model: 'gpt-5.6-sol', effort: 'medium' })
export const ADAPTIVE_TASK_REQUEST_LIMIT = 40
export const ADAPTIVE_TASK_MAX_REQUESTS = 200
export const ADAPTIVE_TASK_TOOL = 'codex_connect_change_work_model'
export interface TaskRoute { readonly model: string; readonly effort: string }
export interface TaskCapability { readonly model: string; readonly efforts: readonly string[] }
export type TaskMode = 'auto' | 'manual' | 'stopped' | 'interrupted' | 'limit'
export interface TaskDelegationState {
  readonly version: 1 | 2
  readonly idle: boolean
  readonly enabled: boolean
  readonly canDowngrade: boolean
  readonly files: readonly string[]
  readonly routes: readonly TaskRoute[]
  readonly maxRequests: number
  readonly timeoutMs: number
  readonly runs: readonly { id: string; state: string; cleanup: string; delivery: string; reserved: number }[]
}
export interface AdaptiveTaskState {
  readonly revision: number
  readonly mode: TaskMode | 'off'
  readonly current?: TaskRoute
  readonly requested?: TaskRoute
  readonly reserved: number
  readonly maximumRequests: number
  readonly capabilities: readonly TaskCapability[]
  readonly canStart: boolean
  readonly eligibility: 'not-probed'
  readonly unavailable?: string
  /** Absent on Phase 1-only hosts. No UI control may infer delegation availability. */
  readonly delegation?: TaskDelegationState
}
export interface AdaptiveTaskCommand {
  readonly sessionId: string
  readonly operationId: string
  readonly revision: number
  readonly action: 'start' | 'manual' | 'stop' | 'resume' | 'upgrade' | 'delegate-enable' | 'delegate-disable' | 'downgrade'
  readonly models?: readonly string[]
  /** Exact displayed effort scope; newly added catalog levels never expand an existing grant. */
  readonly efforts?: Readonly<Record<string, readonly string[]>>
  readonly maximumRequests?: number
  readonly files?: readonly string[]
  readonly routes?: readonly TaskRoute[]
  readonly maxChildRequests?: number
  readonly timeoutMs?: number
  readonly disclose?: true
}
export function validTaskSessionId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u.test(value)
}
export function taskRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
export function taskRoute(value: unknown): value is TaskRoute {
  return taskRecord(value) && Object.keys(value).sort().join(',') === 'effort,model'
    && typeof value.model === 'string' && /^[a-z0-9][a-z0-9.-]{0,127}$/u.test(value.model)
    && typeof value.effort === 'string' && /^[a-z0-9-]{1,32}$/u.test(value.effort)
}
export function allowsTaskRoute(capabilities: readonly TaskCapability[], route: TaskRoute): boolean {
  return capabilities.some(item => item.model === route.model && item.efforts.includes(route.effort))
}
export function decodeTaskCommand(value: unknown): AdaptiveTaskCommand | undefined {
  if (!taskRecord(value) || !validTaskSessionId(value.sessionId)
    || typeof value.operationId !== 'string' || !/^[A-Za-z0-9_-]{16,80}$/u.test(value.operationId)
    || !Number.isSafeInteger(value.revision) || Number(value.revision) < 0
    || !['start', 'manual', 'stop', 'resume', 'upgrade', 'delegate-enable', 'delegate-disable', 'downgrade'].includes(String(value.action))) return undefined
  const keys = Object.keys(value).sort().join(',')
  if (value.action === 'delegate-enable') {
    if (keys !== 'action,disclose,files,maxChildRequests,operationId,revision,routes,sessionId,timeoutMs'
      || value.disclose !== true || !Array.isArray(value.files) || value.files.length < 1 || value.files.length > 32
      || new Set(value.files).size !== value.files.length || value.files.some(file => typeof file !== 'string' || !file.trim() || file.length > 512)
      || !Array.isArray(value.routes) || value.routes.length < 1 || value.routes.length > 64 || value.routes.some(route => !taskRoute(route))
      || new Set(value.routes.map(route => `${route.model}/${route.effort}`)).size !== value.routes.length
      || !Number.isSafeInteger(value.maxChildRequests) || Number(value.maxChildRequests) < 1 || Number(value.maxChildRequests) > 6
      || !Number.isSafeInteger(value.timeoutMs) || Number(value.timeoutMs) < 1000 || Number(value.timeoutMs) > 90000) return undefined
  } else if (value.action !== 'start') {
    if (keys !== 'action,operationId,revision,sessionId') return undefined
  } else {
    if (keys !== 'action,efforts,maximumRequests,models,operationId,revision,sessionId'
      || !Array.isArray(value.models) || value.models.length === 0 || value.models.length > ADAPTIVE_TASK_MODELS.length
      || new Set(value.models).size !== value.models.length
      || value.models.some(model => !ADAPTIVE_TASK_MODELS.includes(model as typeof ADAPTIVE_TASK_MODELS[number]))
      || !value.models.includes(ADAPTIVE_TASK_START.model)
      || !Number.isSafeInteger(value.maximumRequests) || Number(value.maximumRequests) < 1
      || Number(value.maximumRequests) > ADAPTIVE_TASK_MAX_REQUESTS) return undefined
    if (!taskRecord(value.efforts) || Object.keys(value.efforts).sort().join(',') !== [...value.models].sort().join(',')) return undefined
    for (const model of value.models) {
      const levels = value.efforts[String(model)]
      if (!Array.isArray(levels) || levels.length === 0 || levels.length > 16 || new Set(levels).size !== levels.length
        || levels.some(effort => !taskRoute({ model, effort }))) return undefined
    }
    if (!(value.efforts[ADAPTIVE_TASK_START.model] as string[]).includes(ADAPTIVE_TASK_START.effort)) return undefined
  }
  return value as unknown as AdaptiveTaskCommand
}
/** Reject malformed server state instead of rendering a false active/available indication. */
export function decodeTaskState(value: unknown): AdaptiveTaskState | undefined {
  if (!taskRecord(value) || !Number.isSafeInteger(value.revision) || Number(value.revision) < 0
    || !['off', 'auto', 'manual', 'stopped', 'interrupted', 'limit'].includes(String(value.mode))
    || !Number.isSafeInteger(value.reserved) || Number(value.reserved) < 0
    || !Number.isSafeInteger(value.maximumRequests) || Number(value.maximumRequests) < 1
    || Number(value.maximumRequests) > ADAPTIVE_TASK_MAX_REQUESTS || Number(value.reserved) > Number(value.maximumRequests)
    || typeof value.canStart !== 'boolean' || value.eligibility !== 'not-probed'
    || (value.current !== undefined && !taskRoute(value.current))
    || (value.requested !== undefined && !taskRoute(value.requested))
    || (value.unavailable !== undefined && (typeof value.unavailable !== 'string' || value.unavailable.length > 160))
    || !Array.isArray(value.capabilities) || value.capabilities.length > 16) return undefined
  const ids = new Set<string>()
  for (const entry of value.capabilities) {
    if (!taskRecord(entry) || typeof entry.model !== 'string' || ids.has(entry.model)
      || !Array.isArray(entry.efforts) || entry.efforts.length > 16
      || entry.efforts.some(effort => !taskRoute({ model: entry.model, effort }))) return undefined
    ids.add(entry.model)
  }
  if (value.delegation !== undefined) {
    const d = value.delegation
    if (!taskRecord(d) || (d.version !== 1 && d.version !== 2) || typeof d.idle !== 'boolean'
      || typeof d.enabled !== 'boolean' || typeof d.canDowngrade !== 'boolean'
      || !Array.isArray(d.files) || d.files.length > 32 || d.files.some(file => typeof file !== 'string' || file.length > 512)
      || !Array.isArray(d.routes) || d.routes.length > 64 || d.routes.some(route => !taskRoute(route))
      || !Number.isSafeInteger(d.maxRequests) || Number(d.maxRequests) < 1 || Number(d.maxRequests) > 6
      || !Number.isSafeInteger(d.timeoutMs) || Number(d.timeoutMs) < 1000 || Number(d.timeoutMs) > 90000
      || !Array.isArray(d.runs) || d.runs.length > 32 || d.runs.some(run => !taskRecord(run)
        || typeof run.id !== 'string' || !/^[A-Za-z0-9_-]{16,80}$/u.test(run.id)
        || !['prepared', 'running', 'settling', 'succeeded', 'failed', 'cancelled', 'interrupted'].includes(String(run.state))
        || !['pending', 'failed', 'verified'].includes(String(run.cleanup))
        || !['none', 'pending', 'recorded', 'unknown'].includes(String(run.delivery))
        || !Number.isSafeInteger(run.reserved) || Number(run.reserved) < 0 || Number(run.reserved) > 6)) return undefined
  }
  return value as unknown as AdaptiveTaskState
}
