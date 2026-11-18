import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import { Config } from '../src/index.ts'
import { LimitResumeReminder } from '../src/limit-reminder.ts'
import type { LimitReminderSchedule } from '../src/limit-reminder-schedule.ts'
import { streamWithCodexRequestDiagnostics, withCodexDiagnosticFetch } from '../src/request-diagnostics.ts'
import type { CodexLimitObservation } from '../src/request-diagnostics.ts'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

const sessionId = SessionId('session-original')
const options: GenerateOptions = { sessionId, provider: 'openai-codex', model: 'gpt-5.6-sol', messages: [] }
const failure = { code: 'RATE_LIMIT', message: 'Synthetic quota response' } as const
const endpoint = 'https://chatgpt.com/backend-api/codex/responses'
const resetAt = () => Math.ceil(Date.now() / 1000) * 1000 + 45 * 60_000
const limitBody = (time: number) => JSON.stringify({ error: {
  type: 'usage_limit_reached', resets_at: time / 1000, message: 'test-only private upstream text',
} })
const unrelated = JSON.stringify({ error: { type: 'generic_429', resets_in_seconds: 1800 } })

async function callStream(
  bodies: readonly string[], observe?: (observation: CodexLimitObservation) => void, status = 429,
): Promise<string> {
  const chunks: StreamChunk[] = []
  const stream = streamWithCodexRequestDiagnostics(async function* () {
    for (const body of bodies) {
      const fetch = withCodexDiagnosticFetch({ fetch: async () => new Response(body, { status }) })!.fetch!
      expect(await (await fetch(endpoint)).text()).toBe(body)
    }
    yield { type: 'finish', reason: { kind: 'error', failure } }
  }, options, observe)
  for await (const chunk of stream) chunks.push(chunk)
  const chunk = chunks[0]
  if (chunk?.type !== 'finish' || chunk.reason.kind !== 'error') throw new Error('Missing original failure')
  return chunk.reason.failure!.message
}

async function fixture(config: { enabled?: boolean; delegated?: boolean; available?: boolean } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'codex-limit-fixture-'))
  roots.push(root)
  const filename = join(root, 'reminders.json')
  const session = { id: sessionId, header: { id: sessionId } } as unknown as Session
  const agent = { session }
  const logger = { warn: vi.fn() }
  let listener: ((session: Session, event: SessionEvent) => void) | undefined
  let dispose: () => Promise<void> = async () => undefined
  let enabled = config.enabled ?? true
  let revision = 0
  let row: { id: string; status: 'active'; updatedAt: string } | undefined
  let waitForCreate: Promise<void> | undefined
  const schedule: LimitReminderSchedule = {
    create: vi.fn(async () => {
      await waitForCreate
      row = { id: 'schedule-' + randomUUID(), status: 'active', updatedAt: new Date(++revision).toISOString() }
      return row
    }),
    edit: vi.fn<LimitReminderSchedule['edit']>(async request => {
      if (row === undefined || request.id !== row.id) return { code: 'schedule_not_found' }
      if (row.updatedAt !== request.expectedUpdatedAt) return { code: 'schedule_conflict' }
      if (request.action === 'delete') {
        row = undefined
        return { deleted: true }
      }
      row = { ...row, updatedAt: new Date(++revision).toISOString() }
      return row
    }),
    view: vi.fn<LimitReminderSchedule['view']>(async () => row ?? { code: 'schedule_not_found' }),
  }
  const services = {
    agents: { get: () => agent }, sessions: { get: () => session },
    subagents: { rootOf: () => config.delegated ? {} : agent },
    sessionPersistence: { stat: async () => ({ header: session.header }) },
    schedule: config.available === false ? undefined : schedule,
  }
  const ctx = {
    get: (name: keyof typeof services) => services[name],
    on: (_name: string, callback: typeof listener) => { listener = callback },
    effect: (factory: () => typeof dispose) => { dispose = factory() },
    logger,
  } as unknown as Context
  let reminder = new LimitResumeReminder(ctx, filename, () => enabled, true)
  const emit = (type: string, data: unknown) => listener?.(session, { type, data } as SessionEvent)
  let turn = 0
  return {
    filename, schedule, logger,
    current: () => row,
    revise: () => { row = { ...row!, updatedAt: new Date(++revision).toISOString() } },
    boot: async () => { await dispose(); reminder = new LimitResumeReminder(ctx, filename, () => enabled, true) },
    createGate: (gate: Promise<void>) => { waitForCreate = gate },
    setEnabled: (value: boolean) => { enabled = value; reminder.settingsChanged() },
    accountChange: () => reminder.accountChanged(),
    start: (source = 'user') => {
      emit('turn/start', { turn: ++turn })
      emit('user/message', { source: { kind: source } })
    },
    observe: (request = options) => reminder.observe(request),
    end: (reason: unknown) => emit('turn/end', { turn, reason }),
  }
}

describe('terminal quota observations', () => {
  it('does not change the 429 response or its existing diagnostic error', async () => {
    const observe = vi.fn()
    const at = resetAt()
    const original = await callStream([limitBody(at)])
    expect(await callStream([limitBody(at)], observe)).toMatch(/^Synthetic quota response\n\[Codex diagnostics: /u)
    expect(original).toMatch(/^Synthetic quota response\n\[Codex diagnostics: /u)
    expect(observe).toHaveBeenCalledExactlyOnceWith({
      resetAt: at, diagnosticSuffix: expect.stringContaining('"httpStatus":429'),
    })
    expect(JSON.stringify(observe.mock.calls)).not.toContain('test-only private upstream text')
  })

  it.each([
    unrelated,
    'usage_limit_reached',
    '{"error":{"type":"usage_limit_reached","resets_in_seconds":299}}',
    '{"error":{"type":"usage_limit_reached","resets_in_seconds":21601}}',
    '{"error":{"type":"usage_limit_reached","window_seconds":604800,"resets_in_seconds":1800}}',
    JSON.stringify({ error: { type: 'usage_limit_reached', resets_in_seconds: 1800, message: 'x'.repeat(17_000) } }),
  ])('ignores generic, invalid, unsupported-window and oversized bodies', async body => {
    const observe = vi.fn()
    await callStream([body], observe)
    expect(observe).not.toHaveBeenCalled()
  })

  it('forgets an earlier 429 by the next attempt and ignores a non-429', async () => {
    const observe = vi.fn()
    await callStream([limitBody(resetAt()), unrelated], observe)
    await callStream([limitBody(resetAt())], observe, 503)
    expect(observe).not.toHaveBeenCalled()
  })
})

describe('one-shot limit reminders', () => {
  async function finishLimit(state: Awaited<ReturnType<typeof fixture>>, at = resetAt()) {
    const callback = state.observe()
    const message = await callStream([limitBody(at)], observation => callback?.(observation, 'synthetic-account-key'))
    state.end({ kind: 'error', error: { ...failure, message } })
  }

  it('schedules one buffered occurrence, restores exact ownership after restart and deletes on success', async () => {
    const state = await fixture()
    const at = resetAt()
    state.start()
    await finishLimit(state, at)
    await vi.waitFor(() => expect(state.current()).toBeDefined())
    const original = state.current()!
    expect(state.schedule.create).toHaveBeenCalledExactlyOnceWith({
      title: expect.any(String), prompt: expect.stringContaining('Check the interrupted work'),
      target: { kind: 'session', sessionId }, timing: { kind: 'at', at: new Date(at + 60_000).toISOString() },
    }, sessionId, expect.any(AbortSignal))
    await state.boot()
    state.start()
    await finishLimit(state, at + 120_000)
    await vi.waitFor(() => expect(state.current()?.updatedAt).not.toBe(original.updatedAt))
    const updated = state.current()!
    expect(updated.id).toBe(original.id)
    expect(state.schedule.create).toHaveBeenCalledOnce()
    expect(state.schedule.edit).toHaveBeenCalledWith({
      id: original.id, expectedUpdatedAt: original.updatedAt, action: 'update',
      patch: { timing: { kind: 'at', at: new Date(at + 180_000).toISOString() } },
    }, sessionId, expect.any(AbortSignal))
    await state.boot()
    expect(await readFile(state.filename, 'utf8')).not.toMatch(/synthetic-account-key|private upstream text/u)
    state.start()
    state.end({ kind: 'completed' })
    await vi.waitFor(() => expect(state.current()).toBeUndefined())
    expect(state.schedule.edit).toHaveBeenLastCalledWith({
      id: original.id, expectedUpdatedAt: updated.updatedAt, action: 'delete',
    }, sessionId)
  })

  it('preserves a user revision and suppresses a replacement in the same window', async () => {
    const state = await fixture()
    const at = resetAt()
    state.start()
    await finishLimit(state, at)
    await vi.waitFor(() => expect(state.current()).toBeDefined())
    await state.boot()
    state.revise()
    const manual = state.current()
    state.start()
    await finishLimit(state, at + 120_000)
    await vi.waitFor(() => expect(state.schedule.edit).toHaveBeenCalledOnce())
    await state.boot()
    state.start()
    await finishLimit(state, at + 60_000)
    await state.boot()
    expect(state.current()).toEqual(manual)
    expect(state.schedule.create).toHaveBeenCalledOnce()
  })

  it.each([
    { enabled: false }, { available: false }, { delegated: true },
  ])('does no work when disabled, unavailable or delegated', async config => {
    const state = await fixture(config)
    expect(Config({}).enableLimitResumeReminder.get()).toBe(false)
    state.start()
    expect(state.observe()).toBeUndefined()
    await finishLimit(state)
    await state.boot()
    expect(state.schedule.create).not.toHaveBeenCalled()
  })

  it('does not rearm from a scheduled turn, auxiliary request or invalidated observation', async () => {
    const state = await fixture()
    state.start('schedule')
    expect(state.observe()).toBeUndefined()
    await finishLimit(state)
    state.start()
    expect(state.observe({ ...options, purpose: 'session-title' })).toBeUndefined()
    const observe = state.observe()
    const diagnosticSuffix = '[fixture request identity]'
    observe?.({ resetAt: resetAt(), diagnosticSuffix }, 'fixture-account')
    state.accountChange()
    state.end({ kind: 'error', error: { ...failure, message: failure.message + diagnosticSuffix } })
    await state.boot()
    expect(state.schedule.create).not.toHaveBeenCalled()
  })

  it('cancels a late successful create after opt-out without replaying the request', async () => {
    const state = await fixture()
    const { promise, resolve } = Promise.withResolvers<void>()
    state.createGate(promise)
    state.start()
    await finishLimit(state)
    await vi.waitFor(() => expect(state.schedule.create).toHaveBeenCalledOnce())
    state.setEnabled(false)
    resolve()
    await vi.waitFor(() => expect(state.schedule.edit).toHaveBeenCalledOnce())
    await state.boot()
    expect(state.current()).toBeUndefined()
  })
})
