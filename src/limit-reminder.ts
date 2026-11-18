/** Bind a structured Codex model failure to the terminal event of its live root turn. */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { symbols, type Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { GenerateOptions } from '@deepseek-ai/dsh-llm'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-persistence'
import { LimitReminderOwnership } from './limit-reminder-schedule.ts'
import type { LimitReminderSchedule } from './limit-reminder-schedule.ts'
import type { CodexLimitObservation } from './request-diagnostics.ts'

const require = createRequire(import.meta.url)
const VERIFIED_HOST = '0.2.2-rc.3'

function verifiedHost(): boolean {
  // These packages are resolvable peers even when the plugin is installed in
  // its own package scope. Both optional services are resolved from Cordis.
  return ['dsh-agent', 'dsh-session', 'dsh-llm', 'dsh-llm-pi-ai'].every(packageName => {
    try {
      const manifest: unknown = JSON.parse(readFileSync(require.resolve('@deepseek-ai/' + packageName + '/package.json'), 'utf8'))
      return typeof manifest === 'object' && manifest !== null && 'version' in manifest && manifest.version === VERIFIED_HOST
    } catch { return false /* Missing metadata grants no scheduling capability. */ }
  })
}

type Observe = (observation: CodexLimitObservation, accountKey: string | undefined) => void

/** Cordis issues a fresh context-bound proxy on each service lookup. */
function scheduleIdentity(schedule: LimitReminderSchedule): unknown {
  return Reflect.get(schedule, symbols.original) ?? schedule
}
interface Turn {
  number: number
  human: boolean
  scheduled: boolean
  failure?: { observation: CodexLimitObservation; signal: AbortSignal }
}
interface SessionState {
  cancellation: AbortController
  turn?: Turn
}

/** Enabled sessions are observed through Host events; all scheduling work stays off the request path. */
export class LimitResumeReminder {
  private readonly verified: boolean
  private readonly ownership: LimitReminderOwnership
  private readonly sessions = new WeakMap<Session, SessionState>()
  private generation = new AbortController()
  private pending = Promise.resolve()
  private wasEnabled: boolean

  constructor(private readonly ctx: Context, filename: string, private readonly enabled: () => boolean, verified = verifiedHost()) {
    this.verified = verified
    this.wasEnabled = enabled()
    this.ownership = new LimitReminderOwnership(filename)
    if (!verified) return
    ctx.on('session/event', (session, event) => this.sessionEvent(session, event), { global: true })
    ctx.effect(() => async () => {
      // A plugin reload or normal shutdown preserves committed Host tasks.
      this.generation.abort()
      await this.pending
    }, 'dsh-codex-connect: limit reminder lifecycle')
  }

  private schedule(): LimitReminderSchedule | undefined {
    if (!this.verified) return undefined
    const service = (this.ctx.get as (name: string) => unknown)('schedule')
    if (typeof service !== 'object' || service === null) return undefined
    if ('create' in service && typeof service.create === 'function' && 'edit' in service && typeof service.edit === 'function'
      && 'view' in service && typeof service.view === 'function') return service as LimitReminderSchedule
    return undefined
  }

  available(): boolean { return this.schedule() !== undefined }

  /** Called at request dispatch, before any failure is known. */
  observe(options: GenerateOptions): Observe | undefined {
    if (!this.enabled() || !this.available() || options.purpose !== undefined || options.sessionId === undefined || options.signal?.aborted) return undefined
    const session = this.ctx.get('sessions')?.get(options.sessionId)
    if (session === undefined) return undefined
    const state = this.sessions.get(session)
    const turn = state?.turn
    if (state === undefined || turn === undefined || !turn.human || turn.scheduled) return undefined
    delete turn.failure
    const signal = AbortSignal.any([this.generation.signal, state.cancellation.signal])
    return (observation, accountKey) => {
      if (signal.aborted || state.turn !== turn || accountKey === undefined) return
      turn.failure = { observation, signal }
    }
  }

  settingsChanged(): void {
    const enabled = this.enabled()
    if (this.wasEnabled && !enabled) this.accountChanged()
    this.wasEnabled = enabled
  }

  /** Account selection/exit invalidates every in-flight admission and cancels owned pending work. */
  accountChanged(): void {
    this.generation.abort()
    this.generation = new AbortController()
    const schedule = this.schedule()
    if (schedule !== undefined) this.queue(() => this.ownership.cancel(schedule))
  }

  private sessionEvent(session: Session, event: SessionEvent): void {
    if (!this.enabled()) return
    const schedule = this.schedule()
    if (schedule === undefined) return
    if (event.type === 'model/selection'
      || (event.type === 'agent/inbox/spliced' && event.data.outcome === 'canceled')) {
      this.cancel(schedule, session)
      return
    }
    if (event.type === 'turn/start') {
      if (!this.savedRoot(session)) return
      const state = this.sessions.get(session) ?? { cancellation: new AbortController() }
      state.turn = { number: event.data.turn, human: false, scheduled: false }
      this.sessions.set(session, state)
      return
    }
    const state = this.sessions.get(session)
    const turn = state?.turn
    if (event.type === 'user/message' && turn !== undefined) {
      const source: string = event.data.source.kind
      turn.human ||= source === 'user'
      turn.scheduled ||= source === 'schedule'
      return
    }
    if (event.type !== 'turn/end') return
    const { reason } = event.data
    if (state !== undefined) delete state.turn
    // Schedule owns its delivery receipt. A turn it just queued cannot
    // retire that task while the Host is committing the receipt.
    if (turn?.scheduled) return
    if (reason.kind === 'completed' || (reason.kind === 'aborted' && reason.reason.kind === 'user')) {
      this.cancel(schedule, session)
      return
    }
    const failure = turn?.failure
    if (state === undefined || turn?.number !== event.data.turn || !turn.human || failure === undefined) return
    const { observation, signal } = failure
    if (signal.aborted
      || reason.kind !== 'error' || !reason.error.message.endsWith(observation.diagnosticSuffix)) return
    this.queue(async () => {
      const current = this.schedule()
      if (signal.aborted || !this.enabled() || current === undefined || scheduleIdentity(current) !== scheduleIdentity(schedule)
        || !this.savedRoot(session)) return
      const stored = await this.ctx.get('sessionPersistence')?.stat(session.id, { signal })
      if (stored?.header.id !== session.id || stored.header.parentSession !== undefined
        || stored.header.origin === 'subagent' || !this.savedRoot(session)) return
      await this.ownership.arm(current, session.id, observation.resetAt, signal)
    }, signal)
  }

  private savedRoot(session: Session): boolean {
    if (session.header.parentSession !== undefined || session.header.origin === 'subagent') return false
    const agent = this.ctx.get('agents')?.get(session.id)
    const subagents = (this.ctx.get as (name: string) => unknown)('subagents') as { rootOf?: (agent: Agent) => Agent } | undefined
    if (agent?.session !== session || this.ctx.get('sessions')?.get(session.id) !== session || typeof subagents?.rootOf !== 'function') return false
    try { return subagents.rootOf(agent) === agent } catch { return false /* No live delegation authority. */ }
  }

  private cancel(schedule: LimitReminderSchedule, session: Session): void {
    const state = this.sessions.get(session)
    if (state !== undefined) {
      state.cancellation.abort()
      this.sessions.delete(session)
    }
    this.queue(() => this.ownership.cancel(schedule, session.id))
  }

  private queue(operation: () => Promise<void>, signal?: AbortSignal): void {
    this.pending = this.pending.then(operation).catch(() => {
      if (!signal?.aborted) this.ctx.logger.warn('dsh-codex-connect: limit reminder operation did not complete')
    })
  }
}
