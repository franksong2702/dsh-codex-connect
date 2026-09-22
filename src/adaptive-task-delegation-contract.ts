/** Dormant Phase 2 ledger contract. IDs describe host-owned bindings, never model-granted authority. */
import { allowsTaskRoute, taskRecord, taskRoute, validTaskSessionId } from './adaptive-task-contract.ts'
import type { TaskCapability, TaskRoute } from './adaptive-task-contract.ts'
import { parseTaskDocument, taskFailure } from './adaptive-task-store.ts'
import type { TaskDocument } from './adaptive-task-store.ts'

export const MAX_TASK_CHILD_RUNS = 32
export interface DelegationGrant {
  routes: TaskRoute[]
  sourceManifest: string
  sourceIds: string[]
  maxRequests: number
  timeoutMs: number
}
export type ChildOutcome = 'succeeded' | 'failed' | 'cancelled' | 'interrupted'
export type ChildState = 'prepared' | 'running' | 'settling' | ChildOutcome
export interface TaskChildRun {
  id: string
  callId: string
  argumentDigest: string
  grantRevision: number
  revocationGeneration: number
  epoch: string
  childSessionId: string | null
  childSessionKey: string | null
  route: TaskRoute
  sourceIds: string[]
  evidenceDigest: string
  maxRequests: number
  attempts: string[]
  deadlineAt: number
  state: ChildState
  outcome: ChildOutcome | null
  cleanup: 'pending' | 'failed' | 'verified'
  resultDigest: string | null
  delivery: 'none' | 'pending' | 'recorded' | 'unknown'
}
export interface TaskLedgerDocument extends Omit<TaskDocument, 'version'> {
  version: 2
  delegation: {
    grant: DelegationGrant | null
    grantRevision: number
    revocationGeneration: number
    runs: TaskChildRun[]
  }
}
export const ledgerHash = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value)
export const ledgerId = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{16,80}$/u.test(value)
export const ledgerInteger = (value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && !Object.is(value, -0) && value >= min && value <= max
const exact = (value: unknown, keys: string): value is Record<string, unknown> =>
  taskRecord(value) && Object.keys(value).sort().join(',') === keys.split(',').sort().join(',')
const ids = (value: unknown, max: number): value is string[] => Array.isArray(value) && value.length <= max
  && value.every(ledgerId) && new Set(value).size === value.length
export const childTerminal = (run: TaskChildRun): boolean => ['succeeded', 'failed', 'cancelled', 'interrupted'].includes(run.state)
export const childUnresolved = (run: TaskChildRun): boolean => !childTerminal(run) || run.cleanup !== 'verified'
  || run.delivery === 'pending' || run.delivery === 'unknown'

export function parseDelegationGrant(value: unknown, capabilities: readonly TaskCapability[]): DelegationGrant {
  if (!exact(value, 'routes,sourceManifest,sourceIds,maxRequests,timeoutMs') || !ledgerHash(value.sourceManifest)
    || !ids(value.sourceIds, 32) || value.sourceIds.length === 0
    || !ledgerInteger(value.maxRequests, 1, 6) || !ledgerInteger(value.timeoutMs, 1000, 90000)
    || !Array.isArray(value.routes) || value.routes.length === 0 || value.routes.length > 64
    || value.routes.some(route => !taskRoute(route) || !allowsTaskRoute(capabilities, route))
    || new Set(value.routes.map(route => `${route.model}/${route.effort}`)).size !== value.routes.length) taskFailure('TASK_DELEGATION_GRANT_INVALID')
  return structuredClone(value) as unknown as DelegationGrant
}
function parseRun(value: unknown, document: TaskLedgerDocument): TaskChildRun {
  if (!exact(value, 'id,callId,argumentDigest,grantRevision,revocationGeneration,epoch,childSessionId,childSessionKey,route,sourceIds,evidenceDigest,maxRequests,attempts,deadlineAt,state,outcome,cleanup,resultDigest,delivery')
    || !ledgerId(value.id) || !ledgerId(value.callId) || !ledgerHash(value.argumentDigest) || !ledgerHash(value.epoch)
    || !ledgerHash(value.evidenceDigest) || !ledgerInteger(value.grantRevision, 1, document.delegation.grantRevision)
    || !ledgerInteger(value.revocationGeneration, 0, document.delegation.revocationGeneration)
    || !taskRoute(value.route) || !allowsTaskRoute(document.capabilities, value.route)
    || !ids(value.sourceIds, 32) || value.sourceIds.length === 0 || !ledgerInteger(value.maxRequests, 1, 6) || !ids(value.attempts, Number(value.maxRequests))
    || !ledgerInteger(value.deadlineAt, 1)
    || !['prepared', 'running', 'settling', 'succeeded', 'failed', 'cancelled', 'interrupted'].includes(String(value.state))
    || !(value.outcome === null || ['succeeded', 'failed', 'cancelled', 'interrupted'].includes(String(value.outcome)))
    || !['pending', 'failed', 'verified'].includes(String(value.cleanup))
    || !['none', 'pending', 'recorded', 'unknown'].includes(String(value.delivery))
    || !(value.resultDigest === null || ledgerHash(value.resultDigest))
    || !((value.childSessionId === null && value.childSessionKey === null)
      || (validTaskSessionId(value.childSessionId) && value.childSessionId !== document.sessionId
        && ledgerHash(value.childSessionKey) && value.childSessionKey !== document.sessionKey))) taskFailure('TASK_LEDGER_INVALID')
  const run = value as unknown as TaskChildRun
  if (run.state === 'prepared' && (run.childSessionId !== null || run.attempts.length !== 0)) taskFailure('TASK_LEDGER_INVALID')
  if ((run.state === 'running' || run.attempts.length > 0) && run.childSessionId === null) taskFailure('TASK_LEDGER_INVALID')
  if (['prepared', 'running'].includes(run.state)) {
    if (run.outcome !== null || run.resultDigest !== null || run.cleanup !== 'pending' || run.delivery !== 'none') taskFailure('TASK_LEDGER_INVALID')
  } else if (run.outcome === null) taskFailure('TASK_LEDGER_INVALID')
  if (run.state === 'settling' && (run.cleanup === 'verified' || run.delivery !== 'none')) taskFailure('TASK_LEDGER_INVALID')
  if (childTerminal(run) && (run.state !== run.outcome || (run.state !== 'interrupted' && run.cleanup !== 'verified'))) taskFailure('TASK_LEDGER_INVALID')
  if (childTerminal(run) && run.state !== 'interrupted' && run.delivery === 'none') taskFailure('TASK_LEDGER_INVALID')
  if (run.outcome === 'succeeded' ? run.resultDigest === null : run.resultDigest !== null) taskFailure('TASK_LEDGER_INVALID')
  if (run.delivery !== 'none' && (!childTerminal(run) || run.cleanup !== 'verified')) taskFailure('TASK_LEDGER_INVALID')
  if (['prepared', 'running'].includes(run.state)) {
    const { grant } = document.delegation
    if (document.mode !== 'auto' || grant === null || run.epoch !== document.runtime
      || run.grantRevision !== document.delegation.grantRevision || run.revocationGeneration !== document.delegation.revocationGeneration
      || !grant.routes.some(route => route.model === run.route.model && route.effort === run.route.effort)
      || run.sourceIds.some(id => !grant.sourceIds.includes(id)) || run.maxRequests !== grant.maxRequests) taskFailure('TASK_LEDGER_INVALID')
  }
  return run
}
/** V1 remains strict; V2 adds one root-owned extension rather than widening V1 parsing. */
export function parseTaskLedger(value: unknown, sessionId: string): TaskDocument | TaskLedgerDocument {
  if (!taskRecord(value) || value.version !== 2) return parseTaskDocument(value, sessionId)
  const { delegation, ...base } = value
  parseTaskDocument({ ...base, version: 1 }, sessionId)
  if (!exact(delegation, 'grant,grantRevision,revocationGeneration,runs') || !ledgerInteger(delegation.grantRevision)
    || !ledgerInteger(delegation.revocationGeneration) || !Array.isArray(delegation.runs)
    || delegation.runs.length > MAX_TASK_CHILD_RUNS) taskFailure('TASK_LEDGER_INVALID')
  const document = value as unknown as TaskLedgerDocument
  if (delegation.grant !== null) {
    parseDelegationGrant(delegation.grant, document.capabilities)
    if (delegation.grantRevision === 0) taskFailure('TASK_LEDGER_INVALID')
  }
  const runs = delegation.runs.map(run => parseRun(run, document))
  for (const key of ['id', 'callId', 'childSessionId', 'childSessionKey'] as const) {
    const values = runs.map(run => run[key]).filter(id => id !== null)
    if (new Set(values).size !== values.length) taskFailure('TASK_LEDGER_INVALID')
  }
  const attempts = runs.flatMap(run => run.attempts)
  if (attempts.length > document.reserved || new Set(attempts).size !== attempts.length
    || runs.filter(run => !childTerminal(run) || run.cleanup !== 'verified').length > 1) taskFailure('TASK_LEDGER_INVALID')
  return document
}
