/** Real DSH spawn/loop/tools and Codex adapter; all credentials, source files and fetch responses are synthetic. */
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { zstdDecompressSync } from 'node:zlib'
import { Context } from '@deepseek-ai/cordis'
import Llm, { createUserMessage, ReasoningEffortId, ToolCallId } from '@deepseek-ai/dsh-llm'
import Sessions, { SessionId } from '@deepseek-ai/dsh-session'
import Projection from '@deepseek-ai/dsh-session-projection'
import Prompt from '@deepseek-ai/dsh-system-prompt'
import Tools from '@deepseek-ai/dsh-tools'
import Agents from '@deepseek-ai/dsh-agent'
import type { Agent } from '@deepseek-ai/dsh-agent'
import Loop from '@deepseek-ai/dsh-agent-loop'
import Subagents from '@deepseek-ai/dsh-subagent'
import type { SubagentRun } from '@deepseek-ai/dsh-subagent'
import * as Spawn from '@deepseek-ai/dsh-subagent-spawn-in-process'
import { afterEach, expect, it, vi } from 'vitest'
import { createOpenAICodexAdapter } from '../src/adapter.ts'
import { OpenAICodexCredentialStore } from '../src/store.ts'
import { snapshotSplitEvidence } from '../src/split-evidence.ts'
import { attachApprovedSplitWorker, SPLIT_INSPECT_TOOL } from '../src/split-worker.ts'
import { SPLIT_MODEL, SPLIT_READ_TOOL, SPLIT_RESULT_TOOL } from '../src/split-dispatch.ts'

let ctx: Context | undefined
let root: string | undefined
const content = 'export const answer = 42\n'
const sha256 = createHash('sha256').update(content).digest('hex')
const findings = { summary: 'Verified the fixture.', findings: [{ explanation: 'The answer is 42.', references: [{ path: 'src/example.ts', sha256, startLine: 1, endLine: 1 }] }], limitations: [] }
function response(item: Record<string, unknown>): Response {
  return new Response([
    { type: 'response.output_item.added', output_index: 0, item },
    { type: 'response.output_item.done', output_index: 0, item },
    { type: 'response.completed', response: { id: 'resp_split', model: SPLIT_MODEL, status: 'completed', output: [item], usage: { input_tokens: 100, output_tokens: 20, total_tokens: 120 } } },
  ].map(event => `data: ${JSON.stringify(event)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } })
}
const call = (name: string, args: unknown) => response({ type: 'function_call', id: 'fc_split', call_id: `call_${name}`, name, arguments: JSON.stringify(args), status: 'completed' })
const answer = (text: string) => response({ type: 'message', id: 'msg_split', role: 'assistant', phase: 'final_answer', status: 'completed', content: [{ type: 'output_text', text, annotations: [] }] })
type Scenario = 'success' | 'plain' | 'unobserved' | 'forbidden' | 'repeat' | 'http-error' | 'wait' | 'oversized-result' | 'recursive' | 'run-code' | 'too-many-findings' | 'empty-unread'
async function fixture(scenario: Scenario = 'success', options: { maximumRequests?: number; timeoutMs?: number; enabled?: boolean; wrapRun?: (run: SubagentRun) => SubagentRun } = {}) {
  root = await mkdtemp(join(tmpdir(), 'split-worker-test-'))
  vi.stubEnv('DSH_HOME', join(root, 'synthetic-home'))
  vi.stubEnv('OTEL_SDK_DISABLED', 'true')
  await mkdir(join(root, 'src'))
  await writeFile(join(root, 'src/example.ts'), content)
  const evidence = await snapshotSplitEvidence(root, [{ path: 'src/example.ts', sha256 }], new AbortController().signal)
  const store = new OpenAICodexCredentialStore()
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
  await store.modify('openai-codex', async () => ({ type: 'oauth', accountId: 'split-synthetic', access: `${encode({ alg: 'none' })}.${encode({ 'https://api.openai.com/auth': { chatgpt_account_id: 'split-synthetic' } })}.synthetic`, refresh: 'synthetic-only', expires: Date.now() + 3_600_000 }))
  const wires: Record<string, unknown>[] = []
  const childWires: Record<string, unknown>[] = []
  let parentCount = 0
  const fetch = vi.fn(async (url: unknown, init?: RequestInit) => {
    expect(String(url)).toBe('https://chatgpt.com/backend-api/codex/responses')
    expect(init?.method).toBe('POST')
    const raw = init!.body
    const bytes = typeof raw === 'string' ? raw : Buffer.from(new Headers(init!.headers).get('content-encoding') === 'zstd' ? zstdDecompressSync(raw as Uint8Array) : raw as Uint8Array).toString('utf8')
    const body = JSON.parse(bytes) as Record<string, unknown>
    expect(body.model).toBe(SPLIT_MODEL)
    wires.push(body)
    if ((body.tools as { name: string }[]).some(tool => tool.name === SPLIT_INSPECT_TOOL)) {
      parentCount += 1
      if (parentCount === 1) return call(SPLIT_INSPECT_TOOL, {})
      return answer('Parent consumed the worker result.')
    }
    childWires.push(body)
    expect(JSON.stringify(body)).not.toContain('PARENT_ONLY_FIXTURE')
    expect((body.tools as { name: string }[]).map(tool => tool.name).sort()).toEqual([SPLIT_READ_TOOL, SPLIT_RESULT_TOOL].sort())
    if (scenario === 'http-error') return new Response(JSON.stringify({ error: { message: 'Synthetic failure', code: 'server_error' } }), { status: 500 })
    if (scenario === 'wait') return await new Promise<Response>((_resolve, reject) => {
      const signal = init!.signal!
      if (signal.aborted) { reject(signal.reason); return }
      signal.addEventListener('abort', () => reject(signal.reason), { once: true })
    })
    if (scenario === 'plain') return answer('Plain text does not satisfy the structured contract.')
    if (scenario === 'forbidden') return call('fixture_write', {})
    if (scenario === 'recursive') return call(SPLIT_INSPECT_TOOL, {})
    if (scenario === 'run-code') return call('run_code', { code: 'fixture only' })
    if (scenario === 'unobserved') return call(SPLIT_RESULT_TOOL, findings)
    if (scenario === 'empty-unread') return call(SPLIT_RESULT_TOOL, { summary: 'No issues found without inspecting.', findings: [], limitations: [] })
    if (!JSON.stringify(body.input).includes(content.trim()) || scenario === 'repeat') return call(SPLIT_READ_TOOL, { path: 'src/example.ts', startLine: 1, endLine: 1 })
    expect(JSON.stringify(body.input)).toContain('export const answer = 42')
    if (scenario === 'oversized-result') return call(SPLIT_RESULT_TOOL, { ...findings, summary: 'x'.repeat(16_001) })
    if (scenario === 'too-many-findings') return call(SPLIT_RESULT_TOOL, { ...findings, findings: Array.from({ length: 11 }, () => findings.findings[0]) })
    return call(SPLIT_RESULT_TOOL, findings)
  })
  vi.stubGlobal('fetch', fetch)
  vi.stubGlobal('WebSocket', class { constructor() { throw new Error('WebSocket is not permitted in the offline fixture') } })
  ctx = new Context()
  for (const module of [Llm, Sessions, Projection, Prompt, Tools, Agents]) await ctx.plugin(module)
  await ctx.plugin(Loop, { agents: [] })
  await ctx.plugin(Subagents)
  await ctx.plugin(Spawn, { providerName: 'split-fixture-spawn' })
  ctx.llm.registerAdapter(['openai-codex'], createOpenAICodexAdapter(store, () => undefined))
  const write = vi.fn(async () => 'must not run in child')
  ctx.tools.register({ name: 'fixture_write', description: 'Synthetic effect', parameters: { type: 'object', properties: {} }, output: { schema: { type: 'string' }, render: (_a, value) => [{ type: 'text', text: String(value) }] }, execute: write })
  const parentHandle = await ctx.agents.create({ sessionId: SessionId('split-real-parent'), agentOptions: { provider: 'openai-codex', model: SPLIT_MODEL, reasoningEffort: ReasoningEffortId('low') } })
  const provider = ctx.subagents.getProvider('split-fixture-spawn')!
  const { wrapRun, ...workerOptions } = options
  if (wrapRun !== undefined) {
    const start = provider.start
    provider.start = async request => wrapRun(await start.call(provider, request))
  }
  const lifecycle: string[] = []
  const children: Agent[] = []
  ctx.on('subagent/start', () => { lifecycle.push('start') })
  ctx.on('subagent/end', () => { lifecycle.push('end') })
  ctx.on('agent/created', ({ agent }) => { if (agent.id !== parentHandle.agent.id) children.push(agent) })
  const grant = { enabled: options.enabled ?? true, brief: 'Inspect the approved example and cite the source.', evidence, provider, ...workerOptions }
  const handle = attachApprovedSplitWorker(ctx, parentHandle.agent, grant)
  const freshGrant = async (parent = parentHandle.agent) => attachApprovedSplitWorker(ctx!, parent, {
    ...grant, evidence: await snapshotSplitEvidence(root!, [{ path: 'src/example.ts', sha256 }], new AbortController().signal),
  })
  const execute = (signal = new AbortController().signal) => ctx!.tools.execute({ callId: ToolCallId('split-inspection'), name: SPLIT_INSPECT_TOOL, arguments: {}, agent: parentHandle.agent, signal })
  return { context: ctx, parent: parentHandle.agent, parentHandle, grant, handle, freshGrant, execute, wires, childWires, write, lifecycle, children }
}
afterEach(async () => {
  try { await ctx?.fiber.dispose() } finally {
    ctx = undefined
    if (root) await rm(root, { recursive: true, force: true })
    root = undefined
    vi.unstubAllEnvs(); vi.unstubAllGlobals()
  }
})
it('runs a real parent turn -> exact spawn -> approved read -> structured result -> parent continuation', async () => {
  const f = await fixture()
  f.parent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'PARENT_ONLY_FIXTURE: run the approved inspection.' }] }))
  await f.parent.whenIdle()
  const log = f.parent.session.snapshotEvents()
  const result = log.find(event => event.type === 'tool/result')
  expect(JSON.stringify(result)).toContain('Verified the fixture.')
  expect(JSON.stringify(result)).toContain('requestReservations')
  expect(JSON.stringify(log.at(-1))).toContain('completed')
  expect(f.wires).toHaveLength(4)
  expect(f.childWires).toHaveLength(2)
  expect(f.lifecycle).toEqual(['start', 'end'])
  expect(f.children).toHaveLength(1)
  expect(f.context.agents.get(f.children[0]!.id)).toBeUndefined()
  expect(f.context.agents.get(f.parent.id)).toBe(f.parent)
  expect(f.write).not.toHaveBeenCalled()
})
it.each(['plain', 'unobserved', 'forbidden', 'http-error', 'empty-unread'] as const)('fails closed on %s with child cleanup', async scenario => {
  const f = await fixture(scenario)
  expect((await f.execute()).isError).toBe(true)
  expect(f.childWires).toHaveLength(1)
  expect(f.context.agents.get(f.children[0]!.id)).toBeUndefined()
  expect(f.write).not.toHaveBeenCalled()
})
it('bounds repeated child requests rather than allowing an endless tool loop', async () => {
  const f = await fixture('repeat', { maximumRequests: 2 })
  expect((await f.execute()).isError).toBe(true)
  expect(f.childWires).toHaveLength(2)
  expect(f.context.agents.get(f.children[0]!.id)).toBeUndefined()
})
it('times out cooperative provider work and awaits disposal', async () => {
  const f = await fixture('wait', { timeoutMs: 100 })
  const result = await f.execute()
  expect(result.isError).toBe(true)
  expect(JSON.stringify(result)).toContain('SPLIT_TIMEOUT')
  expect(f.childWires).toHaveLength(1)
  expect(f.context.agents.get(f.children[0]!.id)).toBeUndefined()
})
it('cancels before publication without consuming a provider request', async () => {
  const f = await fixture()
  const controller = new AbortController(); controller.abort()
  expect((await f.execute(controller.signal)).isError).toBe(true)
  expect(f.children).toHaveLength(0)
  expect(f.wires).toHaveLength(0)
})
it('does not register the parent tool unless explicitly enabled', async () => {
  const f = await fixture('success', { enabled: false })
  expect(f.context.tools.get(SPLIT_INSPECT_TOOL, f.parent)).toBeUndefined()
  expect(f.wires).toHaveLength(0)
})
it.each(['oversized-result', 'too-many-findings'] as const)('enforces %s bounds before structured capture', async scenario => {
  const f = await fixture(scenario)
  const result = await f.execute()
  expect(result.isError).toBe(true)
  expect(JSON.stringify(result)).toContain('SPLIT_RESULT_INVALID')
  expect(f.childWires).toHaveLength(2)
  expect(f.context.agents.get(f.children[0]!.id)).toBeUndefined()
})
it.each(['recursive', 'run-code'] as const)('denies %s tools without granting extra capabilities', async scenario => {
  const f = await fixture(scenario)
  expect((await f.execute()).isError).toBe(true)
  expect(f.children).toHaveLength(1)
  expect(f.write).not.toHaveBeenCalled()
  expect(f.childWires).toHaveLength(1)
})
it('rejects a same-name read implementation replacement', async () => {
  const f = await fixture()
  const replacement = vi.fn(async () => 'must not run')
  f.context.on('agent/session-start', ({ agent }) => {
    if (agent.id !== f.parent.id) {
      expect(f.context.tools.get(SPLIT_READ_TOOL, agent)).toBeDefined()
      f.context.tools.get(SPLIT_READ_TOOL, agent)!.execute = replacement
    }
  })
  expect((await f.execute()).isError).toBe(true)
  expect(replacement).not.toHaveBeenCalled()
  expect(f.childWires).toHaveLength(1)
  expect(f.context.agents.get(f.children[0]!.id)).toBeUndefined()
})
it('cancels at publication without a child model request', async () => {
  const f = await fixture()
  const controller = new AbortController()
  f.context.on('agent/created', ({ agent }) => { if (agent.id !== f.parent.id) controller.abort() })
  expect((await f.execute(controller.signal)).isError).toBe(true)
  expect(f.childWires).toHaveLength(0)
  expect(f.context.agents.get(f.children[0]!.id)).toBeUndefined()
})
it('disposes the parent while a child request is active', async () => {
  const f = await fixture('wait')
  const first = f.execute()
  await vi.waitFor(() => expect(f.childWires).toHaveLength(1))
  await f.parentHandle.dispose()
  expect((await first).isError).toBe(true)
  expect(f.context.agents.get(f.children[0]!.id)).toBeUndefined()
})

it('consumes a grant only once and rejects an overlapping call', async () => {
  const f = await fixture('wait')
  const controller = new AbortController()
  const first = f.execute(controller.signal)
  await vi.waitFor(() => expect(f.childWires).toHaveLength(1))
  const overlapping = await f.execute()
  expect(overlapping.isError).toBe(true)
  expect(JSON.stringify(overlapping)).toContain('SPLIT_PARENT_BUSY')
  controller.abort()
  expect((await first).isError).toBe(true)
  expect(JSON.stringify(await f.execute())).toContain('SPLIT_APPROVAL_CONSUMED')
  expect(f.childWires).toHaveLength(1)
})

it.each(['before-removal', 'after-removal'] as const)('quarantines the parent after disposal fails %s, including fresh grants', async mode => {
  const runs: SubagentRun[] = []
  const f = await fixture('success', { wrapRun(run) {
    runs.push(run)
    return { ...run, async dispose() {
      if (mode === 'after-removal') await run.dispose()
      throw new Error('Synthetic disposal failure')
    } }
  } })
  try {
    const first = await f.execute()
    expect(first.isError).toBe(true)
    expect(JSON.stringify(first)).toContain('SPLIT_DISPOSAL_FAILED')
    expect(f.context.agents.get(f.children[0]!.id) === undefined).toBe(mode === 'after-removal')
    f.handle() // Withdraw the old tool before attaching a separately approved grant.
    const replacement = await f.freshGrant()
    try {
      expect(JSON.stringify(await f.execute())).toContain('SPLIT_PARENT_BUSY')
      expect(f.children).toHaveLength(1)
      expect(f.childWires).toHaveLength(2)
    } finally { await replacement.revoke() }
    const revoked = f.handle.revoke()
    expect(f.handle.revoke()).toBe(revoked)
    await expect(revoked).rejects.toThrow('SPLIT_DISPOSAL_FAILED')
    // Parent tools remain usable; only new Split admission is quarantined.
    expect((await f.context.tools.execute({ callId: ToolCallId('parent-still-live'), name: 'fixture_write', arguments: {}, agent: f.parent, signal: new AbortController().signal })).isError).toBe(false)
    expect(f.write).toHaveBeenCalledTimes(1)
  } finally { for (const run of runs) await run.dispose() }
})

it('keeps the slot while disposal is pending, then releases it only after confirmed cleanup', async () => {
  const entered = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  let disposals = 0
  const f = await fixture('success', { wrapRun: run => ({ ...run, async dispose() {
    await run.dispose()
    if (++disposals === 1) { entered.resolve(); await release.promise }
  } }) })
  const first = f.execute()
  let replacement: Awaited<ReturnType<typeof f.freshGrant>> | undefined
  try {
    await entered.promise
    expect(f.context.agents.get(f.children[0]!.id)).toBeUndefined()
    expect(JSON.stringify(await f.execute())).toContain('SPLIT_PARENT_BUSY')
    expect(f.children).toHaveLength(1)
    release.resolve()
    expect((await first).isError).toBe(false)
    await f.handle.revoke()
    replacement = await f.freshGrant()
    // This is a new explicit call using a separately authorized grant.
    expect((await f.execute()).isError).toBe(false)
    expect(f.children).toHaveLength(2)
    expect(f.childWires).toHaveLength(4)
  } finally { release.resolve(); await first; await replacement?.revoke() }
})
