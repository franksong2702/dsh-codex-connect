/** Real host/loop/native consent/spawn/compaction; synthetic source, credentials and responses only. */
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
import * as Spawn from '@deepseek-ai/dsh-subagent-spawn-in-process'
import Questions from '@deepseek-ai/dsh-user-questions'
import Meter from '@deepseek-ai/dsh-token-meter'
import Compaction from '@deepseek-ai/dsh-compaction-basic'
import { afterEach, expect, it, vi } from 'vitest'
import { attachAdaptiveSplit } from '../src/adaptive-split.ts'
import { registerThinkHostIntegration, ASTRA_REASONING_TOOL_NAME } from '../src/reasoning-update-host.ts'
import type { ThinkHostIntegration } from '../src/reasoning-update-host.ts'
import { createOpenAICodexAdapter } from '../src/adapter.ts'
import { OpenAICodexBackendRequests } from '../src/backend-request.ts'
import { OpenAICodexCredentialStore } from '../src/store.ts'
import { snapshotSplitEvidence } from '../src/split-evidence.ts'
import { SPLIT_INSPECT_TOOL } from '../src/split-worker.ts'
import { SPLIT_MODEL, SPLIT_READ_TOOL, SPLIT_RESULT_TOOL } from '../src/split-dispatch.ts'
// @ts-expect-error The exact-case contract is a plain Node helper, outside the source build.
import { ADAPTIVE_SPLIT_CASES } from '../scripts/adaptive-split-cases.mjs'

const SOURCE = 'export const answer = 42\n'
const SHA = createHash('sha256').update(SOURCE).digest('hex')
const FINDINGS = { summary: 'Verified the approved source.', findings: [{ explanation: 'The answer is 42.',
  references: [{ path: 'src/example.ts', sha256: SHA, startLine: 1, endLine: 1 }] }], limitations: [] }
let ctx: Context | undefined
let root: string | undefined
let expectedCleanupFailure = false
const successfulAnswer = (request: any) => ({ answers: request.questions.map((q: any) => ({ id: q.id, selected: [q.options[0].label] })) })
function response(item: any) {
  return new Response([
    { type: 'response.output_item.added', output_index: 0, item },
    { type: 'response.output_item.done', output_index: 0, item },
    { type: 'response.completed', response: { id: 'resp_m3_synthetic', status: 'completed', output: [item],
      usage: { input_tokens: 100, output_tokens: 20, total_tokens: 120 } } },
  ].map(event => `data: ${JSON.stringify(event)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } })
}
const call = (name: string, args: unknown) => response({ type: 'function_call', id: 'fc_m3', call_id: `call_${name}`,
  name, arguments: JSON.stringify(args), status: 'completed' })
const answer = (text: string) => response({ type: 'message', id: 'msg_m3', role: 'assistant', phase: 'final_answer', status: 'completed',
  content: [{ type: 'output_text', text, annotations: [] }] })

afterEach(async () => {
  try { await ctx?.fiber.dispose() } catch (error) { if (!expectedCleanupFailure) throw error }
  finally {
    ctx = undefined; expectedCleanupFailure = false
    if (root) await rm(root, { recursive: true, force: true })
    root = undefined; vi.unstubAllEnvs(); vi.unstubAllGlobals()
  }
})

async function fixture(scenario: string) {
  root = await mkdtemp(join(tmpdir(), 'adaptive-m3-'))
  vi.stubEnv('DSH_HOME', join(root, 'synthetic-home'))
  vi.stubEnv('OTEL_SDK_DISABLED', 'true')
  await mkdir(join(root, 'src')); await writeFile(join(root, 'src/example.ts'), SOURCE)
  const evidence = await snapshotSplitEvidence(root, [{ path: 'src/example.ts', sha256: SHA }], new AbortController().signal)
  const store = new OpenAICodexCredentialStore()
  const claim = Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: 'm3-synthetic' } })).toString('base64url')
  await store.modify('openai-codex', async () => ({ type: 'oauth', accountId: 'm3-synthetic',
    access: `e30.${claim}.fixture`, refresh: 'synthetic', expires: Date.now() + 3_600_000 }))
  const wires: any[] = [], childWires: any[] = [], children: Agent[] = [], questions: any[] = [], errors: unknown[] = []
  const ids = new Set<string>()
  let parentNext: { name: string; args: unknown } | undefined
  let nativeCalls = 0, compacting = false
  let respond = async (request: any) => successfulAnswer(request)
  vi.stubGlobal('WebSocket', class { constructor() { throw new Error('M3 denies WebSocket dispatch') } })
  vi.stubGlobal('fetch', vi.fn(async (url: unknown, init?: RequestInit) => {
    expect(String(url)).toBe('https://chatgpt.com/backend-api/codex/responses')
    const headers = new Headers(init!.headers)
    const id = headers.get('x-client-request-id')!
    expect(id).toBeTruthy(); expect(ids.has(id)).toBe(false); ids.add(id)
    expect(['error', 'manual']).toContain(init!.redirect)
    const raw = headers.get('content-encoding') === 'zstd' ? zstdDecompressSync(init!.body as Uint8Array).toString('utf8') : String(init!.body)
    const wire = JSON.parse(raw); wires.push(wire)
    if (wire.model === 'gpt-6-astra') {
      if (wire.input.some((item: any) => item.type === 'compaction_trigger')) {
        nativeCalls++
        return scenario === 'fallback-composition' ? new Response(null, { status: 400 })
          : response({ type: 'compaction', id: 'cmp_m3', encrypted_content: 'm3-synthetic-opaque' })
      }
      if (compacting) return answer('Synthetic context summary. This text is not permission.')
      if (parentNext) { const next = parentNext; parentNext = undefined; return call(next.name, next.args) }
      return answer('PARENT_ONLY_SYNTHETIC. Investigation with source details and task context. '.repeat(600))
    }
    expect(wire.model).toBe(SPLIT_MODEL)
    childWires.push(wire)
    expect(JSON.stringify(wire)).not.toContain('PARENT_ONLY_SYNTHETIC')
    expect(wire.input.some((item: any) => ['configuration_update', 'compaction'].includes(item.type))).toBe(false)
    expect(wire.tools.map((tool: any) => tool.name).sort()).toEqual([SPLIT_READ_TOOL, SPLIT_RESULT_TOOL].sort())
    expect(wire.reasoning.effort).toBe('low'); expect(wire.service_tier).toBeUndefined()
    if (['revoke-running', 'timeout'].includes(scenario)) return new Promise<Response>((_resolve, reject) => {
      if (init!.signal!.aborted) { reject(init!.signal!.reason); return }
      init!.signal!.addEventListener('abort', () => reject(init!.signal!.reason), { once: true })
    })
    if (scenario === 'http-error') return new Response(null, { status: 500 })
    if (scenario === 'forbidden-tool') return call('fixture_write', {})
    if (scenario === 'recursive-tool') return call(SPLIT_INSPECT_TOOL, {})
    if (scenario === 'unread-result') return call(SPLIT_RESULT_TOOL, FINDINGS)
    if (childWires.length === 1 || scenario === 'request-budget') return call(SPLIT_READ_TOOL, { path: 'src/example.ts', startLine: 1, endLine: 1 })
    expect(JSON.stringify(wire.input)).toContain(SOURCE.trim())
    return call(SPLIT_RESULT_TOOL, scenario === 'altered-reference' ? { ...FINDINGS,
      findings: [{ explanation: 'Unobserved source', references: [{ path: 'src/other.ts', sha256: SHA, startLine: 1, endLine: 1 }] }] } : FINDINGS)
  }))
  const context = new Context(); ctx = context
  for (const module of [Llm, Sessions, Projection, Prompt, Tools, Agents, Meter]) await context.plugin(module)
  const questionsFeature = await context.plugin(Questions)
  await context.plugin(Loop, { agents: [] }); await context.plugin(Subagents)
  await context.plugin(Spawn, { providerName: 'm3-exact-spawn' })
  await context.plugin(Compaction, { auto: false, retainTokens: 0 })
  let think!: ThinkHostIntegration
  const feature = await context.plugin(function AdaptiveHost(host: Context) { think = registerThinkHostIntegration(host) })
  await think.setEnabled(scenario !== 'keep')
  const governor = new OpenAICodexBackendRequests()
  context.effect(() => () => governor.dispose())
  context.llm.registerAdapter(['openai-codex'], createOpenAICodexAdapter(store, () => undefined,
    undefined, undefined, undefined, undefined, undefined, undefined, () => true, governor, think.adapterReplay))
  context.on('agent/error', ({ error }) => { errors.push(error) })
  const stopQuestions = context.on('user-questions/request', request => { questions.push(request); return respond(request) })
  const write = vi.fn(async () => 'forbidden child effect')
  context.tools.register({ name: 'fixture_write', description: 'Synthetic only', parameters: { type: 'object', properties: {} },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: String(value) }] }, execute: write })
  const parentHandle = await context.agents.create({ sessionId: SessionId('m3-parent'), meta: { cwd: root },
    agentOptions: { provider: 'openai-codex', model: 'gpt-6-astra', reasoningEffort: ReasoningEffortId('low') } })
  const parent = parentHandle.agent
  context.on('agent/created', ({ agent }) => { if (agent !== parent) children.push(agent) })
  const send = async () => {
    const before = wires.length
    parent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Continue the synthetic task.' }] }))
    await parent.whenIdle()
    expect(wires.length, JSON.stringify(errors)).toBeGreaterThan(before)
  }
  await send()
  const provider = context.subagents.getProvider('m3-exact-spawn')!
  const task = { enabled: true, workspaceLabel: 'Synthetic reviewed workspace', brief: 'Inspect the approved source and cite what it proves.', evidence, provider,
    maximumRequests: scenario === 'request-budget' ? 1 : 3, timeoutMs: scenario.includes('timeout') ? 100 : 10_000 }
  const stage = (enabled = true) => attachAdaptiveSplit(context, parent, think, { ...task, enabled })
  const execute = (signal = new AbortController().signal, args: Record<string, unknown> = {}) => context.tools.execute({
    name: SPLIT_INSPECT_TOOL, callId: ToolCallId('m3-call'), arguments: args, agent: parent, signal })
  const change = (effort = 'high') => context.tools.execute({ name: ASTRA_REASONING_TOOL_NAME, callId: ToolCallId('m3-think'),
    arguments: { effort, reason: 'The next synthetic phase needs this effort.' }, agent: parent, signal: new AbortController().signal })
  const compact = async () => {
    compacting = true
    try { expect(await context.compaction.compactNow(parent, new AbortController().signal)).toBeTruthy() }
    finally { compacting = false }
  }
  return { context, parent, parentHandle, think, feature, task, stage, execute, change, compact, send, wires, childWires, children, questions, write,
    stopQuestions, questionsFeature, nativeCalls: () => nativeCalls, snapshot: () => think.adaptiveSnapshot(parent),
    responder(value: typeof respond) { respond = value }, next(name: string, args: unknown = {}) { parentNext = { name, args } },
    assertClean() { for (const child of children) { expect(context.agents.get(child.id)).toBeUndefined(); expect(context.sessions.get(child.id)).toBeUndefined() }; expect(write).not.toHaveBeenCalled() },
  }
}

it.each(ADAPTIVE_SPLIT_CASES as readonly string[])('Adaptive Split host: %s', async scenario => {
  const f = await fixture(scenario)
  if (scenario === 'persistent-refusal') {
    f.context.provide('sessionPersistence', {} as never)
    expect(() => f.stage()).toThrow('SPLIT_PERSISTENCE_UNSUPPORTED')
    expect(f.children).toHaveLength(0); return
  }
  if (scenario === 'disabled') {
    const handle = f.stage(false)
    expect(f.context.tools.get(SPLIT_INSPECT_TOOL, f.parent)).toBeUndefined()
    expect(f.questions).toHaveLength(0); await handle.revoke(); return
  }
  if (scenario === 'keep') {
    f.stage(); await f.send()
    expect(f.questions).toHaveLength(0); expect(f.children).toHaveLength(0)
    expect(f.snapshot()).toBeUndefined(); return
  }
  if (['think-first', 'native-composition', 'fallback-composition', 'compaction-stale'].includes(scenario)) {
    f.next(ASTRA_REASONING_TOOL_NAME, { effort: 'high', reason: 'Difficult synthetic phase.' }); await f.send()
    expect(f.parent.session.requestHeader()!.config.reasoningEffort).toBe('high')
    if (scenario.endsWith('-composition')) {
      await f.send(); await f.compact(); expect(f.nativeCalls()).toBe(1)
      expect(f.parent.session.surface.replaceGeneration).toBeGreaterThan(0)
    }
  }
  if (scenario === 'reasoning-queued') {
    expect((await f.change()).isError).not.toBe(true)
    f.stage(); expect((await f.execute()).isError).toBe(true)
    expect(f.children).toHaveLength(0); expect(f.questions).toHaveLength(1); return
  }
  if (scenario === 'think-pending') {
    let finish: ((answer: any) => void) | undefined
    f.responder(request => new Promise(resolve => { finish = resolve }))
    const thinking = f.change(); await vi.waitFor(() => expect(finish).toBeDefined())
    f.stage(); expect((await f.execute()).isError).toBe(true)
    finish!(successfulAnswer(f.questions[0])); await thinking
    expect(f.children).toHaveLength(0); expect(f.questions).toHaveLength(1); return
  }
  const questionsBefore = f.questions.length
  if (scenario === 'missing-questions') {
    f.stopQuestions()
    await f.questionsFeature.dispose()
    // No substitute answerer or Auto-review is installed.
    f.responder(async () => { throw new Error('must not be used') })
  }
  if (['reject', 'wrong-answer', 'custom-answer', 'manual-stale', 'compaction-stale'].includes(scenario)) {
    f.responder(async request => {
      const value = successfulAnswer(request)
      if (scenario === 'reject') value.answers[0].selected = [request.questions[0].options[1].label]
      if (scenario === 'wrong-answer') value.answers[0].id = 'astra-reasoning-effort'
      if (scenario === 'custom-answer') (value.answers[0] as any).custom = 'Do something broader instead'
      if (scenario === 'manual-stale') f.parent.session.append('model/selection', { provider: 'openai-codex', model: 'gpt-6-astra', reasoningEffort: ReasoningEffortId('medium') })
      if (scenario === 'compaction-stale') await f.compact()
      return value
    })
  }
  if (scenario === 'immutable-snapshot') await writeFile(join(root!, 'src/example.ts'), 'export const answer = 0\n')
  let originalRun: { dispose(): Promise<void> } | undefined
  if (scenario === 'cleanup-failure') {
    const original = f.task.provider.start
    f.task.provider.start = async request => {
      const run = await original.call(f.task.provider, request); originalRun = run
      return { ...run, async dispose() { await run.dispose(); throw new Error('Synthetic cleanup failure') } }
    }
  }
  const handle = f.stage()
  if (scenario === 'wrong-root' || scenario === 'extra-scope') {
    const result = scenario === 'extra-scope' ? await f.execute(undefined, { maximumRequests: 100, approved: true })
      : await f.context.tools.execute({ name: SPLIT_INSPECT_TOOL, callId: ToolCallId('wrong-owner'), arguments: {},
          agent: Object.create(f.parent) as Agent, signal: new AbortController().signal })
    expect(result.isError).toBe(true); expect(f.children).toHaveLength(0); expect(f.questions).toHaveLength(0)
    await handle.revoke(); return
  }
  if (scenario === 'approval-timeout') {
    f.responder(request => new Promise((_resolve, reject) => {
      request.signal.addEventListener('abort', () => reject(request.signal.reason), { once: true })
    }))
    expect((await f.execute()).isError).toBe(true)
    expect(f.children).toHaveLength(0); expect(f.questions).toHaveLength(1)
    expect(f.snapshot()!.decisions.at(-1)!.phase).not.toBe('completed')
    await handle.revoke(); return
  }
  if (['split-pending', 'runtime-dispose'].includes(scenario)) {
    let finish: ((answer: any) => void) | undefined
    f.responder(request => new Promise((resolve, reject) => {
      finish = resolve
      request.signal.addEventListener('abort', () => reject(request.signal.reason), { once: true })
    }))
    const running = f.execute(); await vi.waitFor(() => expect(finish).toBeDefined())
    if (scenario === 'split-pending') {
      expect((await f.change()).isError).toBe(true)
      expect(f.questions).toHaveLength(1)
      await handle.revoke()
    } else await f.feature.dispose()
    expect((await running).isError).toBe(true); f.assertClean(); expect(f.children).toHaveLength(0); return
  }
  if (scenario === 'revoke-running') {
    const running = f.execute(); await vi.waitFor(() => expect(f.childWires).toHaveLength(1))
    await handle.revoke(); expect((await running).isError).toBe(true)
    f.assertClean(); expect(f.snapshot()!.decisions.at(-1)!.phase).not.toBe('completed'); return
  }
  if (scenario === 'cleanup-failure') {
    expectedCleanupFailure = true
    try {
      expect((await f.execute()).isError).toBe(true)
      expect((await f.change()).isError).toBe(true)
      expect(f.snapshot()!.decisions.at(-1)!.phase).toBe('failed')
      await expect(handle.revoke()).rejects.toThrow('SPLIT_DISPOSAL_FAILED')
    } finally { await originalRun?.dispose() }
    return
  }
  const successful = ['allow', 'think-first', 'native-composition', 'fallback-composition', 'single-use', 'immutable-snapshot'].includes(scenario)
  if (successful) {
    // The parent model's normal tool call causes the child, then consumes its evidence.
    f.next(SPLIT_INSPECT_TOOL); await f.send()
    expect(f.childWires).toHaveLength(2)
    expect(JSON.stringify(f.parent.session.snapshotEvents().filter(e => e.type === 'tool/result'))).toContain(FINDINGS.summary)
    const events = f.snapshot()!.decisions.filter(event => event.kind === 'split-readonly')
    expect(events.map(event => event.phase)).toEqual(['recommended', 'awaiting-user', 'queued', 'applied', 'completed'])
    expect(f.questions.length - questionsBefore).toBe(1)
    const detail = f.questions.at(-1).questions[0].detail as string
    const review = JSON.parse(detail.slice(detail.lastIndexOf('\n') + 1))
    expect(review.requestedOutputTokensPerRequest).toBe(2048)
    expect(review.serverOutputTokenLimitVerified).toBe(false)
    expect(review.maximumOutputTokensPerRequest).toBeUndefined()
    expect(detail).toContain('NOT a verified server-side token or subscription spending cap')
    expect(f.snapshot()!.requests.filter(sample => sample.purpose === 'delegation')).toHaveLength(2)
    expect(JSON.stringify(f.snapshot())).not.toMatch(/PARENT_ONLY_SYNTHETIC|Synthetic reviewed workspace|src\/example|m3-synthetic|fixture/)
    if (scenario === 'single-use') { expect((await f.execute()).isError).toBe(true); expect(f.childWires).toHaveLength(2) }
    if (scenario === 'think-first' || scenario.endsWith('-composition')) {
      expect(f.parent.session.requestHeader()!.config.reasoningEffort).toBe('high')
      expect((await f.change('medium')).isError).not.toBe(true); await f.send()
      expect(f.parent.session.requestHeader()!.config.reasoningEffort).toBe('medium')
      expect(f.snapshot()!.decisions.filter(event => event.kind === 'reasoning' && event.phase === 'applied')).toHaveLength(2)
    }
  } else {
    const result = await f.execute()
    expect(result.isError).toBe(true)
    if (scenario === 'reject') expect(JSON.stringify(result)).toContain('SPLIT_APPROVAL_DECLINED')
    expect(f.snapshot()!.decisions.at(-1)?.phase).not.toBe('completed')
    if (['reject', 'wrong-answer', 'custom-answer', 'missing-questions', 'manual-stale', 'compaction-stale'].includes(scenario)) expect(f.children).toHaveLength(0)
    else expect(f.childWires.length).toBeLessThanOrEqual(scenario === 'altered-reference' ? 2 : 1)
  }
  f.assertClean()
  await handle.revoke()
})
