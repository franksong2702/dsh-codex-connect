/** Release-policy and actual HTTP-handler units; not full signed-cookie/host acceptance. */
import { createHash } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { Readable } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import type { AdaptiveTaskCommand, AdaptiveTaskState } from '../src/adaptive-task-contract.ts'
import { ADAPTIVE_TASK_PATH } from '../src/adaptive-task-contract.ts'
import { registerAdaptiveTaskHttp } from '../src/adaptive-task-http.ts'
import { ADAPTIVE_TASK_RELEASE_PAUSED, publicTaskCommandAllowed, publicTaskState } from '../src/adaptive-task-publication.ts'

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
function harness(rejection?: 401 | 403) {
  let handler!: (req: IncomingMessage, res: ServerResponse) => Promise<void>
  const runtime = { state: vi.fn(async () => state), command: vi.fn(async () => state) }
  const connection = { requestRejection: vi.fn(() => rejection) }
  let currentConnection: typeof connection | undefined = connection
  const get = vi.fn((name: string) => { expect(name).toBe('connection'); return currentConnection })
  const readBody = vi.fn()
  const unregister = vi.fn()
  const ctx = { get, effect: vi.fn((setup: () => () => void) => setup()),
    webServer: { register: (entry: { handler: typeof handler }) => { handler = entry.handler; return unregister } } }
  registerAdaptiveTaskHttp(ctx as unknown as Parameters<typeof registerAdaptiveTaskHttp>[0], runtime)
  return { runtime, connection, get, readBody, unregister, effect: ctx.effect,
    setConnection(value: typeof connection | undefined) { currentConnection = value },
    async send(value?: AdaptiveTaskCommand, headers: Record<string, string> = {}) {
      const body = value === undefined ? '' : JSON.stringify(value)
      const authority = 'localhost:34567'
      const cookieName = 'dsh-auth-' + createHash('sha256').update(authority).digest('base64url')
      const req = Object.assign(Readable.from([Buffer.from(body)]), {
        method: value === undefined ? 'GET' : 'POST',
        url: value === undefined ? `${ADAPTIVE_TASK_PATH}?sessionId=publication-fixture` : ADAPTIVE_TASK_PATH,
        headers: { host: authority, cookie: `${cookieName}=synthetic-fixture-only`,
          'content-type': 'application/json', 'content-length': String(Buffer.byteLength(body)), ...headers },
      })
      const iterate = req[Symbol.asyncIterator].bind(req)
      req[Symbol.asyncIterator] = () => { readBody(); return iterate() }
      let status = 0, result: unknown
      const res = { writeHead: (value: number) => { status = value }, end: (body: string) => { result = JSON.parse(body) } }
      await handler(req as unknown as IncomingMessage, res as unknown as ServerResponse)
      return { status, body: result }
    } }
}

describe('public task release gate', () => {
  it.each(activations)('rejects %s while recovery remains explicit-only', action => {
    expect(publicTaskCommandAllowed(action)).toBe(false)
  })
  it.each(exits)('retains the %s safety exit', action => { expect(publicTaskCommandAllowed(action)).toBe(true) })
  it('never admits an unknown command', () => { expect(publicTaskCommandAllowed('unknown')).toBe(false) })
  it.each(['off', 'auto', 'manual', 'stopped', 'interrupted', 'limit'] as const)('does not falsify %s or reset accounting', mode => {
    const original = Object.freeze({ ...state, mode, canStart: true })
    expect(publicTaskState(original)).toEqual({ ...original, canStart: false, unavailable: ADAPTIVE_TASK_RELEASE_PAUSED })
    expect(original.canStart).toBe(true)
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
  it.each([401, 403] as const)('keeps host authentication %s ahead of body reads and safety exits', async status => {
    const host = harness(status)
    expect(await host.send(command('manual'))).toEqual({ status, body: { error: 'TASK_BROWSER_AUTH_REQUIRED' } })
    expect(host.readBody).not.toHaveBeenCalled()
    expect(host.runtime.state).not.toHaveBeenCalled()
    expect(host.runtime.command).not.toHaveBeenCalled()
  })
  it.each(['missing', 'lookup throws', 'verification throws'] as const)('fails closed with structured replies when Connection is %s', async failure => {
    const host = harness()
    if (failure === 'missing') host.setConnection(undefined)
    else if (failure === 'lookup throws') host.get.mockImplementation(() => { throw new Error('Synthetic service lookup failure') })
    else host.connection.requestRejection.mockImplementation(() => { throw new Error('Synthetic verifier failure') })
    for (const value of [undefined, command('manual')]) {
      expect(await host.send(value)).toEqual({ status: 503, body: { error: 'TASK_OPERATION_FAILED' } })
    }
    expect(host.readBody).not.toHaveBeenCalled()
    expect(host.runtime.state).not.toHaveBeenCalled()
    expect(host.runtime.command).not.toHaveBeenCalled()
  })
  it('consults the current Connection for every request instead of retaining a prior verifier', async () => {
    const host = harness()
    expect((await host.send()).status).toBe(200)
    const replacement = { requestRejection: vi.fn((): 401 | 403 | undefined => 401) }
    host.setConnection(replacement)
    expect(await host.send(command('manual'))).toEqual({ status: 401, body: { error: 'TASK_BROWSER_AUTH_REQUIRED' } })
    expect(replacement.requestRejection).toHaveBeenCalledTimes(1)
    host.setConnection(undefined)
    expect(await host.send(command('manual'))).toEqual({ status: 503, body: { error: 'TASK_OPERATION_FAILED' } })
    expect(host.readBody).not.toHaveBeenCalled()
    expect(host.runtime.command).not.toHaveBeenCalled()
    host.setConnection(host.connection)
    expect((await host.send(command('manual'))).status).toBe(200)
    expect(host.get).toHaveBeenCalledTimes(4)
    expect(host.connection.requestRejection).toHaveBeenCalledTimes(2)
    expect(host.readBody).toHaveBeenCalledTimes(1)
    expect(host.runtime.command).toHaveBeenCalledTimes(1)
  })
  it.each([{ cookie: '' }, { 'sec-fetch-site': 'cross-site' }] as Record<string, string>[])('does not read the body before browser identity is accepted (%j)', async headers => {
    const host = harness()
    expect(await host.send(command('manual'), headers)).toEqual({ status: 403, body: { error: 'TASK_BROWSER_AUTH_REQUIRED' } })
    expect(host.readBody).not.toHaveBeenCalled()
    expect(host.runtime.state).not.toHaveBeenCalled()
    expect(host.runtime.command).not.toHaveBeenCalled()
  })
  it('binds route cleanup within the registration helper', () => {
    const host = harness()
    expect(host.effect).toHaveBeenCalledTimes(1)
    expect(host.effect.mock.results[0]!.value).toBe(host.unregister)
    host.effect.mock.results[0]!.value()
    expect(host.unregister).toHaveBeenCalledTimes(1)
  })
})
