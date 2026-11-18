/** One-shot scheduling and revision-safe ownership of the plugin's pending reminders. */
import { constants } from 'node:fs'
import { mkdir, open } from 'node:fs/promises'
import { dirname } from 'node:path'
import { withFileLock, writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import type { SessionId } from '@deepseek-ai/dsh-session'

const MAX_ENTRIES = 256
const MAX_BYTES = 128 * 1024
const BUFFER_MS = 60_000
const CLOCK_JITTER_MS = 5_000
const TITLE = 'Codex limit recovery / Codex 限额恢复提醒'
const PROMPT = 'The reported Codex quota reset time has arrived. Check the interrupted work before continuing. / 已到 Codex 报告的预计限额重置时间。请先检查被中断的工作再继续。'

type Time = { kind: 'at'; at: string }
type OwnedTask = { id: string; updatedAt: string }
type TaskResult = { id: string; status: 'active' | 'ended'; updatedAt?: string }
  | { code: 'schedule_conflict' | 'schedule_not_found' }
  | { deleted: true }

/** Subset of the exact host service verified by the installed Host check. */
export interface LimitReminderSchedule {
  create(request: { title: string; prompt: string; timing: Time; target: { kind: 'session'; sessionId: SessionId } },
    actorSessionId: SessionId, signal: AbortSignal): Promise<TaskResult>
  edit(request: { id: string; expectedUpdatedAt: string } & ({ action: 'delete' } | { action: 'update'; patch: { timing: Time } }),
    actorSessionId: SessionId, signal?: AbortSignal): Promise<TaskResult>
  view(request: { id: string }): Promise<TaskResult>
}

interface Entry {
  session: SessionId
  at: number
  // No task means a creation with uncertain outcome or a retired window.
  task?: OwnedTask
}

function taskIdentity(value: unknown): value is OwnedTask {
  if (typeof value !== 'object' || value === null) return false
  return 'id' in value && typeof value.id === 'string' && /^schedule-[0-9a-f-]{36}$/u.test(value.id)
    && 'updatedAt' in value && typeof value.updatedAt === 'string' && Number.isFinite(Date.parse(value.updatedAt))
}

function isEntry(value: unknown): value is Entry {
  if (typeof value !== 'object' || value === null) return false
  return 'session' in value && typeof value.session === 'string' && value.session.length > 0 && value.session.length <= 256
    && 'at' in value && typeof value.at === 'number' && Number.isSafeInteger(value.at) && value.at > 0
    && (!('task' in value) || taskIdentity(value.task))
}

/** Only task IDs, revisions, times, and target session IDs are written here. */
export class LimitReminderOwnership {
  constructor(private readonly filename: string) {}

  async arm(schedule: LimitReminderSchedule, session: SessionId, resetAt: number, signal: AbortSignal): Promise<void> {
    await this.change(async (entries, write) => {
      signal.throwIfAborted()
      const now = Date.now()
      const at = resetAt + BUFFER_MS
      // A delayed storage operation must still target the future.
      if (at <= now + BUFFER_MS || session.length === 0 || session.length > 256) return
      const timing: Time = { kind: 'at', at: new Date(at).toISOString() }
      const prior = entries.get(session)
      if (prior !== undefined && prior.at > now) {
        if (prior.task === undefined || Math.abs(prior.at - at) < CLOCK_JITTER_MS) return
        const result = await schedule.edit({ id: prior.task.id, action: 'update', expectedUpdatedAt: prior.task.updatedAt, patch: { timing } }, session, signal)
        entries.set(session, taskIdentity(result)
          ? { session, at, task: { id: result.id, updatedAt: result.updatedAt } }
          : { session, at: prior.at })
        await write()
        return
      }
      if (prior?.task !== undefined && !await this.finished(schedule, prior.task)) return
      if (entries.size >= MAX_ENTRIES && prior === undefined) {
        for (const [id, entry] of entries) {
          if (entry.at <= now && (entry.task === undefined || await this.finished(schedule, entry.task))) entries.delete(id)
          if (entries.size < MAX_ENTRIES) break
        }
        if (entries.size >= MAX_ENTRIES) return
      }
      // Commit a reservation before asking the Host to create anything. An
      // interrupted create must not cause another create for the same window.
      entries.set(session, { session, at })
      await write()
      signal.throwIfAborted()
      const task = await schedule.create({ title: TITLE, prompt: PROMPT, timing, target: { kind: 'session', sessionId: session } }, session, signal)
      if (!taskIdentity(task)) throw new Error('Schedule returned no revision')
      entries.set(session, { session, at, task: { id: task.id, updatedAt: task.updatedAt } })
      try { await write() } catch (error) {
        await schedule.edit({ id: task.id, action: 'delete', expectedUpdatedAt: task.updatedAt }, session)
        throw error
      }
    }, true)
  }

  async cancel(schedule: LimitReminderSchedule, session?: SessionId): Promise<void> {
    await this.change(async (entries, write) => {
      const selected = session === undefined ? [...entries.values()] : [entries.get(session)]
      let failure: unknown
      let changed = false
      for (const entry of selected) {
        if (entry?.task === undefined) continue
        try {
          await schedule.edit({ id: entry.task.id, action: 'delete', expectedUpdatedAt: entry.task.updatedAt }, entry.session)
          if (entry.at > Date.now()) entries.set(entry.session, { session: entry.session, at: entry.at })
          else entries.delete(entry.session)
          changed = true
        } catch (error) { failure = error }
      }
      if (changed) await write()
      if (failure !== undefined) throw failure
    })
  }

  private async finished(schedule: LimitReminderSchedule, task: OwnedTask): Promise<boolean> {
    const result = await schedule.view({ id: task.id })
    return ('status' in result && result.status === 'ended') || ('code' in result && result.code === 'schedule_not_found')
  }

  private async change(
    operation: (entries: Map<SessionId, Entry>, write: () => Promise<void>) => Promise<void>,
    create = false,
  ): Promise<void> {
    if (create) await mkdir(dirname(this.filename), { recursive: true, mode: 0o700 })
    else if (await this.read() === undefined) return
    await withFileLock(this.filename, async () => {
      const entries = await this.read() ?? new Map()
      await operation(entries, () => writeFileAtomic(this.filename, JSON.stringify([...entries.values()]) + '\n', { mode: 0o600 }))
    })
  }

  private async read(): Promise<Map<SessionId, Entry> | undefined> {
    let handle
    try { handle = await open(this.filename, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0)) } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
      throw error
    }
    try {
      const info = await handle.stat()
      if (!info.isFile() || info.size > MAX_BYTES) throw new Error('Invalid reminder ownership file')
      const data: unknown = JSON.parse(await handle.readFile('utf8'))
      if (!Array.isArray(data) || data.length > MAX_ENTRIES || !data.every(isEntry)) throw new Error('Invalid reminder ownership records')
      const entries = new Map(data.map(entry => [entry.session, entry]))
      if (entries.size !== data.length) throw new Error('Duplicate reminder ownership records')
      return entries
    } finally { await handle.close() }
  }
}
