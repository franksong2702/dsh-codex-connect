/** Release-policy and actual HTTP-handler units; not full signed-cookie/host acceptance. */
import { createHash } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { Readable } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import type { AdaptiveTaskCommand, AdaptiveTaskState } from '../src/adaptive-task-contract.ts'
import { ADAPTIVE_TASK_PATH } from '../src/adaptive-task-contract.ts'
import { registerAdaptiveTaskHttp } from '../src/adaptive-task-http.ts'
import { ADAPTIVE_TASK_PUBLIC_RELEASE, ADAPTIVE_TASK_RELEASE_PAUSED, publicTaskCommandAllowed, publicTaskState } from '../src/adaptive-task-publication.ts'

const exits = ['manual', 'stop', 'delegate-disable', 'downgrade'] as const
const activations = ['start', 'resume', 'upgrade', 'delegate-enable'] as const
const state: AdaptiveTaskState = { revision: 1, mode: 'interrupted', reserved: 3, maximumRequests: 40,
  capabilities: [{ model: 'gpt-5.6-sol', efforts: ['medium'] }], canStart: false, eligibility: 'not-probed' }
function command(action: AdaptiveTaskCommand['action']): AdaptiveTaskCommand {
  const base = { sessionId: 'publication-fixture', operationId: 'publication_fixture_operation', revision: 1, action }
  if (action === 'start') return { ...base, models: ['gpt-5.6-sol'], efforts: { 'gpt-5.6-sol': ['medium'] }, maximumRequests: 40 }
  if (action === 'delegate-enable') return { ...base, disclose: true, files: ['fixture.txt'],
    routes: [{ model: 'gpt-5.6-sol', effort: 'medium' }], maxChildRequests: 1, timeoutMs: 1000 }
  return base
}
function harness(rejection?: number) {
  let handler!: (req: IncomingMessage, res: ServerResponse) => Promise<void>
  const runtime = { state: vi.fn(async () => state), command: vi.fn(async () => state) }
  const ctx = { connection: { requestRejection: vi.fn(() => rejection) },
    webServer: { register: (entry: { handler: typeof handler }) => { handler = entry.handler } } }
  registerAdaptiveTaskHttp(ctx as unknown as Parameters<typeof registerAdaptiveTaskHttp>[0], runtime)
  return { runtime, async send(value?: AdaptiveTaskCommand) {
    const body = value === undefined ? '' : JSON.stringify(value)
    const authority = 'localhost:34567'
    const cookieName = 'dsh-auth-' + createHash('sha256').update(authority).digest('base64url')
    const req = Object.assign(Readable.from([Buffer.from(body)]), {
      method: value === undefined ? 'GET' : 'POST',
      url: value === undefined ? `${ADAPTIVE_TASK_PATH}?sessionId=publication-fixture` : ADAPTIVE_TASK_PATH,
      headers: { host: authority, cookie: `${cookieName}=synthetic-fixture-only`,
        'content-type': 'application/json', 'content-length': String(Buffer.byteLength(body)) },
    })
    let status = 0, result: unknown
    const res = { writeHead: (value: number) => { status = value }, end: (body: string) => { result = JSON.parse(body) } }
    await handler(req as unknown as IncomingMessage, res as unknown as ServerResponse)
    return { status, body: result }
  } }
}

describe('public task release gate', () => {
  it('ships paused rather than adding another user opt-in switch', () => { expect(ADAPTIVE_TASK_PUBLIC_RELEASE).toBe(false) })
  it.each(activations)('rejects %s without public release approval', action => {
    expect(publicTaskCommandAllowed(action)).toBe(false)
    expect(publicTaskCommandAllowed(action, true)).toBe(true)
    expect(publicTaskCommandAllowed(action, 'true' as unknown as boolean)).toBe(false)
  })
  it.each(exits)('retains the %s safety exit', action => { expect(publicTaskCommandAllowed(action)).toBe(true) })
  it('never admits an unknown command', () => { expect(publicTaskCommandAllowed('unknown', true)).toBe(false) })
  it.each(['off', 'auto', 'manual', 'stopped', 'interrupted', 'limit'] as const)('does not falsify %s or reset accounting', mode => {
    const original = Object.freeze({ ...state, mode, canStart: true })
    expect(publicTaskState(original)).toEqual({ ...original, canStart: false, unavailable: ADAPTIVE_TASK_RELEASE_PAUSED })
    expect(original.canStart).toBe(true)
    expect(publicTaskState(original, true)).toBe(original)
  })
  it('preserves a more specific recovery condition', () => {
    expect(publicTaskState({ ...state, unavailable: 'TASK_STOPPING' }).unavailable).toBe('TASK_STOPPING')
  })
})

describe('public HTTP admission while paused', () => {
  it.each(activations)('blocks a stale-client %s before runtime mutation', async action => {
    const host = harness()
    expect(await host.send(command(action))).toEqual({ status: 409, body: { error: ADAPTIVE_TASK_RELEASE_PAUSED } })
    expect(host.runtime.command).not.toHaveBeenCalled()
  })
  it.each(exits)('forwards %s through the existing runtime authorization', async action => {
    const host = harness(), value = command(action)
    expect(await host.send(value)).toEqual({ status: 200, body: publicTaskState(state) })
    expect(host.runtime.command).toHaveBeenCalledTimes(1)
    expect(host.runtime.command).toHaveBeenCalledWith(value, expect.any(String))
  })
  it('does not advertise starting a task through GET', async () => {
    const host = harness()
    host.runtime.state.mockResolvedValueOnce({ ...state, mode: 'off', canStart: true, reserved: 0 })
    expect(await host.send()).toEqual({ status: 200,
      body: { ...state, mode: 'off', canStart: false, reserved: 0, unavailable: ADAPTIVE_TASK_RELEASE_PAUSED } })
  })
  it('keeps host authentication ahead of the release gate and safety exits', async () => {
    const host = harness(403)
    expect(await host.send(command('manual'))).toEqual({ status: 403, body: { error: 'TASK_BROWSER_AUTH_REQUIRED' } })
    expect(host.runtime.command).not.toHaveBeenCalled()
  })
})
