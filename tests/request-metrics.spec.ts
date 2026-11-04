import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm, stat, writeFile, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import { RequestMetrics, MetricResponseObserver, metricSessionKey, parseMetricUsage } from '../src/request-metrics.ts'
import { buildMetricReport, readMetricJournal } from '../src/request-metrics-report.ts'
import { runRequestMetricsCommand } from '../src/request-metrics-cli.ts'
import { OpenAICodexBackendRequests } from '../src/backend-request.ts'
import { createOpenAICodexAdapter } from '../src/adapter.ts'
import type { OpenAICodexCredentialStore } from '../src/store.ts'

const dirs: string[] = []
const managers: OpenAICodexBackendRequests[] = []
const writers: RequestMetrics[] = []
afterEach(async () => {
  for (const manager of managers.splice(0)) manager.dispose()
  for (const writer of writers.splice(0)) writer.close()
  vi.unstubAllGlobals(); vi.restoreAllMocks()
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true })
})
async function setup(maxBytes?: number) {
  const dir = await mkdtemp(join(tmpdir(), 'codex-metrics-test-')); dirs.push(dir)
  const warn = vi.fn()
  const metrics = new RequestMetrics(dir, maxBytes, warn); writers.push(metrics)
  const manager = new OpenAICodexBackendRequests(undefined, undefined, undefined, undefined, metrics); managers.push(manager)
  return { dir, metrics, manager, warn }
}
const URL = 'https://chatgpt.com/backend-api/codex/responses'
const usage = { input_tokens: 1000, input_tokens_details: { cached_tokens: 900 }, output_tokens: 100, output_tokens_details: { reasoning_tokens: 60 } }
function sse(value: unknown) { return 'data: ' + JSON.stringify(value) + '\n\n' }
const completed = (tokens: unknown = usage) => ({ type: 'response.completed', response: { id: 'resp_fixture', status: 'completed', output: [], usage: tokens } })
const response = (value: unknown = completed()) => new Response(sse(value), { headers: { 'content-type': 'text/event-stream' } })
const options: GenerateOptions = { provider: 'openai-codex', model: 'gpt-6-astra', sessionId: SessionId('session-fixture'), messages: [] }
async function consume(stream: AsyncIterable<StreamChunk>) { const chunks = []; for await (const chunk of stream) chunks.push(chunk); return chunks }

describe('wire evidence, not normalized provider defaults', () => {
  it('rejects invalid collection paths and sizes before opening a journal', () => {
    expect(() => new RequestMetrics('relative')).toThrow('absolute')
    for (const limit of [0, 4095, 64 * 1024 * 1024 + 1, NaN]) expect(() => new RequestMetrics('/unused', limit)).toThrow('between')
  })
  it('preserves missing and invalid fields, and never adds reasoning to output', () => {
    expect(parseMetricUsage(usage)).toEqual({ input: 1000, cachedInput: 900, cacheWrite: null, output: 100, reasoningOutput: 60 })
    expect(parseMetricUsage({ input_tokens: 0, output_tokens: 0 })).toMatchObject({ input: 0, output: 0, cachedInput: null })
    expect(parseMetricUsage({ input_tokens: -1, output_tokens: '100' })).toMatchObject({ input: null, output: null })
    expect(parseMetricUsage({ ...usage, input_tokens: 10, output_tokens: 20 })).toMatchObject({ cachedInput: null, reasoningOutput: null })
    expect(parseMetricUsage({ ...usage, cache_write_tokens: 101 })).toMatchObject({ cacheWrite: null })
  })
  it.each(['\n', '\r\n', '\r'])('handles byte boundaries and %j SSE separators', separator => {
    const observer = new MetricResponseObserver(true)
    const bytes = new TextEncoder().encode(sse({ type: 'response.output_text.delta', delta: '私密文本' }) + sse(completed()).replaceAll('\n', separator))
    for (const b of bytes) observer.feed(Uint8Array.of(b))
    observer.finish()
    expect(observer.usage.input).toBe(1000)
    expect(observer.outcome).toBe('completed')
  })
  it('does not double-count duplicate terminal usage or read past DONE', () => {
    const observer = new MetricResponseObserver(true)
    observer.feed(new TextEncoder().encode(sse(completed()) + sse(completed({ input_tokens: 9999 }))))
    expect(observer.usage.input).toBe(1000)
    const done = new MetricResponseObserver(true)
    done.feed(new TextEncoder().encode('data: [DONE]\n\n' + sse(completed())))
    expect(done.usage.input).toBeNull()
  })
  it('skips oversized frames without retaining content and recovers for later usage', () => {
    const observer = new MetricResponseObserver(true, 400)
    observer.feed(new TextEncoder().encode(sse({ type: 'delta', text: 'x'.repeat(8000) }) + sse(completed())))
    expect(observer.usage.input).toBe(1000)
    const terminal = new MetricResponseObserver(true, 20)
    terminal.feed(new TextEncoder().encode(sse(completed())))
    expect(terminal.observation).toBe('oversized')
    expect(terminal.usage.input).toBeNull()
  })
  it('does not accept an unterminated terminal SSE frame', () => {
    const observer = new MetricResponseObserver(true)
    observer.feed(new TextEncoder().encode(sse(completed()).trimEnd())); observer.finish()
    expect(observer.usage.input).toBeNull()
  })
  it('reads JSON usage without treating arbitrary HTTP JSON as task success', () => {
    const observer = new MetricResponseObserver(false)
    observer.feed(new TextEncoder().encode(JSON.stringify({ usage }))); observer.finish()
    expect(observer.usage.input).toBe(1000)
    expect(observer.outcome).toBe('unobserved')
  })
})

describe('governed request lifecycle', () => {
  it.each([
    { hint: false, status: 200, headers: {} },
    { hint: true, status: 200, headers: { 'content-type': 'text/html' } },
    { hint: true, status: 500, headers: {} },
  ])('does not guess SSE outside a successful missing-media-type protocol hint: %j', async fixture => {
    const { manager, metrics } = await setup()
    const wrapped = manager.wrapFetch({ lane: 'model', ...(fixture.hint ? { responseFormat: 'sse' as const } : {}),
      fetch: async () => new Response(new TextEncoder().encode(sse(completed())), { status: fixture.status, headers: fixture.headers }) })
    await (await wrapped(URL)).text()
    const report = buildMetricReport([await readMetricJournal(metrics.filename)])
    expect(report.total.usage['input']?.observedTokens).toBeNull()
    expect(report.total.outcomes).toEqual({ [fixture.status === 500 ? 'http-error' : 'unobserved']: 1 })
  })
  it('counts real attempts inside one call, including failed retry; never changes bytes or headers', async () => {
    const { manager, metrics } = await setup()
    const payload = sse(completed())
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response('denied secret', { status: 500 }))
      .mockResolvedValueOnce(new Response(payload, { headers: { 'content-type': 'text/event-stream' } }))
    const wrapped = manager.wrapFetch({ lane: 'model', fetch })
    await consume(metrics.stream(async function* () {
      await (await wrapped(URL, { headers: { authorization: 'Bearer private-token' } })).text()
      expect(await (await wrapped(URL)).text()).toBe(payload)
      yield { type: 'finish', reason: { kind: 'stop' } }
    }, options))
    manager.dispose()
    const journal = await readMetricJournal(metrics.filename)
    const report = buildMetricReport([journal])
    expect(report.total).toMatchObject({ attempts: 2, observedAdapterCalls: 1, additionalAttemptsWithinCall: 1,
      outcomes: { 'http-error': 1, completed: 1 }, cacheHitRate: { ratio: 0.9, unknownAttempts: 1 } })
    expect(report.total.usage['input']).toEqual({ observedTokens: 1000, observedAttempts: 1, unknownAttempts: 1 })
    expect(report.recording.closed).toBe(1)
    expect(new Headers(fetch.mock.calls[0]?.[1]?.headers).get('authorization')).toBe('Bearer private-token')
    const text = await readFile(metrics.filename, 'utf8')
    expect(text).not.toMatch(/private-token|denied secret|session-fixture|resp_fixture/u)
    if (process.platform !== 'win32') expect((await stat(metrics.filename)).mode & 0o777).toBe(0o600)
  })
  it('records fetch errors without logging their potentially sensitive messages', async () => {
    const { manager, metrics } = await setup()
    await expect(manager.wrapFetch({ lane: 'model', fetch: async () => { throw new Error('SECRET') } })(URL)).rejects.toThrow('SECRET')
    expect(buildMetricReport([await readMetricJournal(metrics.filename)]).total.outcomes).toEqual({ 'network-error': 1 })
    expect(await readFile(metrics.filename, 'utf8')).not.toContain('SECRET')
  })
  it('records cancellation of unread responses and keeps cancellation behavior', async () => {
    const { manager, metrics } = await setup()
    const cancelled = vi.fn()
    const res = await manager.wrapFetch({ lane: 'model', fetch: async () => new Response(new ReadableStream({ cancel: cancelled })) })(URL)
    await res.body!.cancel()
    expect(cancelled).toHaveBeenCalledTimes(1)
    expect(buildMetricReport([await readMetricJournal(metrics.filename)]).total.outcomes).toEqual({ cancelled: 1 })
  })
  it('records disposal of a stalled stream once', async () => {
    const { manager, metrics } = await setup()
    const res = await manager.wrapFetch({ lane: 'model', fetch: async () => new Response(new ReadableStream()) })(URL)
    const pending = res.body!.getReader().read()
    manager.dispose()
    await expect(pending).rejects.toBeDefined()
    const report = buildMetricReport([await readMetricJournal(metrics.filename)])
    expect(report.total.attempts).toBe(1)
    expect(report.total.outcomes).toEqual({ cancelled: 1 })
  })
  it('does not record requests rejected before actual dispatch', async () => {
    const { manager, metrics } = await setup()
    const signal = AbortSignal.abort()
    await expect(manager.wrapFetch({ lane: 'model' })(URL, { signal })).rejects.toBeDefined()
    expect(buildMetricReport([await readMetricJournal(metrics.filename)]).total.attempts).toBe(0)
  })
  it('keeps concurrent session attribution isolated, including compaction', async () => {
    const { manager, metrics } = await setup()
    const work = async function* () {
      await Promise.resolve()
      await (await manager.wrapFetch({ lane: 'model', fetch: async () => response() })(URL)).text()
      yield { type: 'finish', reason: { kind: 'stop' } } as StreamChunk
    }
    await Promise.all([consume(metrics.stream(work, options)), consume(metrics.stream(work, { ...options, sessionId: SessionId('second'), purpose: 'compaction' }))])
    const report = buildMetricReport([await readMetricJournal(metrics.filename)])
    expect(Object.keys(report.bySession)).toHaveLength(2)
    expect(report.byPurpose['compaction']?.attempts).toBe(1)
    expect(report.byPurpose['conversation']?.attempts).toBe(1)
  })
  it('leaves auxiliary requests explicitly unattributed', async () => {
    const { manager, metrics } = await setup()
    await manager.run({ lane: 'search' }, async context => { await (await context.fetch(URL, {}, { fetch: async () => Response.json({ usage }) })).json() })
    const report = buildMetricReport([await readMetricJournal(metrics.filename)])
    expect(report.bySession['(unattributed)']?.attempts).toBe(1)
    expect(report.byLane['search']?.usage['input']).toMatchObject({ observedTokens: 1000 })
    expect(buildMetricReport([await readMetricJournal(metrics.filename)], [metricSessionKey('session-fixture')]).total.attempts).toBe(0)
  })
  it('caps recording and warns once while model requests keep working', async () => {
    const { manager, metrics, warn } = await setup(4096)
    for (let i = 0; i < 20; i += 1) await (await manager.wrapFetch({ lane: 'model', fetch: async () => response() })(URL)).text()
    expect(warn).toHaveBeenCalledTimes(1)
    expect((await stat(metrics.filename)).size).toBeLessThanOrEqual(4096)
    expect(buildMetricReport([await readMetricJournal(metrics.filename)]).recording.stoppedEarly).toBe(1)
  })
  it('uses exclusive journals for new processes and merges evidence without backfill', async () => {
    const { dir, manager, metrics } = await setup()
    await (await manager.wrapFetch({ lane: 'model', fetch: async () => response() })(URL)).text()
    manager.dispose()
    const next = new RequestMetrics(dir); writers.push(next)
    const second = new OpenAICodexBackendRequests(undefined, undefined, undefined, undefined, next); managers.push(second)
    await (await second.wrapFetch({ lane: 'model', fetch: async () => response() })(URL)).text()
    second.dispose()
    expect(next.filename).not.toBe(metrics.filename)
    expect(buildMetricReport([await readMetricJournal(metrics.filename), await readMetricJournal(next.filename)]).total.attempts).toBe(2)
  })
})

describe('real adapter with synthetic transport', () => {
  it.each([true, false])('preserves provider completion through cleanup with media type present: %s', async hasMediaType => {
    const { metrics, manager } = await setup()
    const token = 'header.' + Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: 'fixture' } })).toString('base64url') + '.signature'
    const credentials = { captureActiveAccount: async () => credentials,
      read: async () => ({ type: 'oauth', accountId: 'fixture', access: token, refresh: 'fake-refresh', expires: Date.now() + 3600000 }) } as unknown as OpenAICodexCredentialStore
    const cancelled = vi.fn()
    const terminal = completed()
    const message = { type: 'message', id: 'msg_fixture', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'OK', annotations: [] }] }
    vi.stubGlobal('fetch', async () => new Response(new ReadableStream({
      start(controller) { controller.enqueue(new TextEncoder().encode([
        { type: 'response.output_item.added', output_index: 0, item: { ...message, content: [] } },
        { type: 'response.output_text.delta', output_index: 0, content_index: 0, delta: 'OK' },
        { type: 'response.output_item.done', output_index: 0, item: message },
        { ...terminal, response: { ...terminal.response, output: [message] } },
      ].map(sse).join(''))) },
      cancel: cancelled,
    }), { headers: hasMediaType ? { 'content-type': 'text/event-stream' } : {} }))
    const adapter = createOpenAICodexAdapter(credentials, () => undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, manager)
    const chunks = await consume(adapter.stream(options))
    expect(chunks).toContainEqual(expect.objectContaining({ type: 'finish', reason: { kind: 'stop' } }))
    expect(cancelled).toHaveBeenCalledOnce()
    const report = buildMetricReport([await readMetricJournal(metrics.filename)])
    expect(report.total.outcomes).toEqual({ completed: 1 })
    expect(report.total.usage['input']?.observedTokens).toBe(1000)
  })
  it.each([usage, undefined])('keeps provider requests unchanged while preserving raw usage presence', async reported => {
    const { manager, metrics } = await setup()
    const token = 'header.' + Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: 'fixture' } })).toString('base64url') + '.signature'
    const credentials = { captureActiveAccount: async () => credentials,
      read: async () => ({ type: 'oauth', accountId: 'fixture', access: token, refresh: 'fake-refresh', expires: Date.now() + 3600000 }) } as unknown as OpenAICodexCredentialStore
    const fetch = vi.fn(async () => response({ type: 'response.completed', response: { id: 'resp_fixture', status: 'completed', output: [], ...(reported === undefined ? {} : { usage: reported }) } }))
    vi.stubGlobal('fetch', fetch)
    const adapter = createOpenAICodexAdapter(credentials, () => undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, manager)
    const chunks = await consume(adapter.stream(options))
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(chunks.some(chunk => chunk.type === 'finish')).toBe(true)
    const report = buildMetricReport([await readMetricJournal(metrics.filename)])
    expect(report.total.observedAdapterCalls).toBe(1)
    expect(report.byModel['gpt-6-astra']?.attempts).toBe(1)
    expect(report.total.usage['input']?.observedTokens).toBe(reported === undefined ? null : 1000)
    expect(await readFile(metrics.filename, 'utf8')).not.toContain(token)
  })
})

describe('offline report and command', () => {
  it('weights cache hits by tokens, not the average of request percentages', async () => {
    const { manager, metrics } = await setup()
    for (const u of [usage, { input_tokens: 9000, input_tokens_details: { cached_tokens: 0 }, output_tokens: 0 }]) {
      await (await manager.wrapFetch({ lane: 'model', fetch: async () => response(completed(u)) })(URL)).text()
    }
    const report = buildMetricReport([await readMetricJournal(metrics.filename)])
    expect(report.total.cacheHitRate.ratio).toBe(0.09)
    expect(report.total.usage['output']?.observedTokens).toBe(100)
    expect(report.total.usage['cacheWrite']?.observedTokens).toBeNull()
    expect(report.apiCostEstimate).toBeNull()
    expect(report.subscriptionQuotaCost).toBeNull()
  })
  it('discloses pending starts and truncated final records and rejects duplicates', async () => {
    const { metrics } = await setup()
    metrics.begin('model', '00000000-0000-0000-0000-000000000001')
    metrics.close()
    const text = await readFile(metrics.filename, 'utf8')
    await writeFile(metrics.filename, text + '{"unfinished"')
    const journal = await readMetricJournal(metrics.filename)
    const report = buildMetricReport([journal])
    expect(report.truncatedJournals).toBe(1)
    expect(report.total.outcomes).toEqual({ 'pending-or-interrupted': 1 })
    expect(report.total.usage['input']?.unknownAttempts).toBe(1)
    expect(() => buildMetricReport([journal, journal])).toThrow('Duplicate')
  })
  it('rejects corrupt records without echoing their contents, and never fetches or reads credentials', async () => {
    const { dir } = await setup()
    const file = join(dir, 'corrupt.jsonl')
    await writeFile(file, '{"secret":"do not print"}\n')
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch)
    expect(await runRequestMetricsCommand(['--file', file, '--json'])).toBe(1)
    expect(stdout).not.toHaveBeenCalled()
    expect(JSON.stringify(stderr.mock.calls)).not.toContain('do not print')
    expect(fetch).not.toHaveBeenCalled()
  })
  it('exports human and JSON reports and validates arguments', async () => {
    const { manager, metrics } = await setup()
    await (await manager.wrapFetch({ lane: 'model', fetch: async () => response() })(URL)).text()
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    expect(await runRequestMetricsCommand(['--file', metrics.filename, '--json'])).toBe(0)
    expect(JSON.parse(String(stdout.mock.calls[0]?.[0])).total.attempts).toBe(1)
    stdout.mockClear()
    expect(await runRequestMetricsCommand(['--file', metrics.filename])).toBe(0)
    expect(String(stdout.mock.calls[0]?.[0])).toContain('not a subscription bill')
    for (const args of [[], ['--probe'], ['--file'], ['--file', metrics.filename, '--file', metrics.filename]]) expect(await runRequestMetricsCommand(args)).toBe(1)
  })
  it('rejects symlink journals instead of following them', async () => {
    const { dir, metrics } = await setup()
    const link = join(dir, 'link.jsonl'); await symlink(metrics.filename, link)
    await expect(readMetricJournal(link)).rejects.toBeDefined()
  })
})
