/** Synthetic test host for real product settings, questions and request/header changes.
 * Used only by the bounded browser checker; never exported or registered by the product.
 */
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { zstdDecompressSync } from 'node:zlib'
import { Context } from '@deepseek-ai/cordis'
import { AgentRegistry, installModelSelection } from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import LlmRuntime, { createUserMessage, ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import { SessionId, SessionStore } from '@deepseek-ai/dsh-session'
import SessionProjections from '@deepseek-ai/dsh-session-projection'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import UserQuestions from '@deepseek-ai/dsh-user-questions'
import type { AskUserQuestionAnswer, AskUserQuestionItem } from '@deepseek-ai/dsh-user-questions'
import SettingsProvider from '@deepseek-ai/dsh-settings'
import type { SettingsNamespace } from '@deepseek-ai/dsh-settings'
import * as Product from '../src/index.ts'
import { openAICodexModelCatalog } from '../src/adapter.ts'
import { ASTRA_REASONING_TOOL_NAME } from '../src/reasoning-update-host.ts'
import { readReasoningUpdate } from '../src/reasoning-update.ts'
import { OpenAICodexCredentialStore, OPENAI_CODEX_PROVIDER } from '../src/store.ts'

class MemorySettings extends SettingsProvider {
  readonly writable = true
  private stored: Record<string, unknown> = {}
  protected load() { return Promise.resolve(structuredClone(this.stored)) }
  protected persist(ns: SettingsNamespace, value: Record<string, unknown>): Promise<void> {
    this.stored[ns] = structuredClone(value); return Promise.resolve()
  }
}

export async function createThinkControlsHost() {
  const dir = await mkdtemp(join(tmpdir(), 'think-controls-'))
  const priorHome = process.env.DSH_HOME
  const priorFetch = globalThis.fetch
  const wires: Record<string, unknown>[] = []
  let unexpectedFetches = 0
  process.env.DSH_HOME = dir
  globalThis.fetch = async (url, init) => {
    if (!String(url).startsWith('https://chatgpt.com/') || init?.body === undefined) {
      unexpectedFetches++; throw new Error('The synthetic Think fixture rejects unrecognized requests')
    }
    const text = new Headers(init.headers).get('content-encoding') === 'zstd'
      ? zstdDecompressSync(init.body as Uint8Array).toString('utf8') : String(init.body)
    wires.push(JSON.parse(text) as Record<string, unknown>)
    const item = { type: 'message', role: 'assistant', id: `synthetic_${wires.length}`, phase: 'final_answer', status: 'completed',
      content: [{ type: 'output_text', text: 'Synthetic task continued.', annotations: [] }] }
    const events = [{ type: 'response.output_item.added', output_index: 0, item },
      { type: 'response.output_item.done', output_index: 0, item },
      { type: 'response.completed', response: { id: `synthetic_response_${wires.length}`, status: 'completed', output: [item],
        usage: { input_tokens: 20, output_tokens: 5, total_tokens: 25 } } }]
    return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } })
  }
  const ctx = new Context()
  let disposed = false
  const dispose = async () => {
    if (disposed) return
    disposed = true
    try { await ctx.fiber.dispose() } finally {
      globalThis.fetch = priorFetch
      if (priorHome === undefined) delete process.env.DSH_HOME
      else process.env.DSH_HOME = priorHome
      await rm(dir, { recursive: true, force: true })
    }
  }
  try {
    const credentials = new OpenAICodexCredentialStore()
    const claim = Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: 'synthetic-controls' } })).toString('base64url')
    await credentials.modify(OPENAI_CODEX_PROVIDER, async () => ({ type: 'oauth', accountId: 'synthetic-controls',
      access: `e30.${claim}.fixture`, refresh: 'fixture', expires: Date.now() + 3_600_000 }))
    await ctx.plugin(LlmRuntime); await ctx.plugin(SessionStore); await ctx.plugin(SessionProjections)
    await ctx.plugin(AgentRegistry); await ctx.plugin(SystemPrompt); await ctx.plugin(ToolRuntime, { mode: 'native' })
    await ctx.plugin(UserQuestions); await ctx.plugin(MemorySettings)
    let defaultWrites = 0
    ctx.provide('agentDefaultModel', { saveSelection: () => { defaultWrites++ } })
    await ctx.plugin(Product, {})
    await ctx.plugin(AgentLoop, { agents: [] })
    const { agent } = await ctx.agents.create({ sessionId: SessionId('think-browser'), meta: { cwd: dir },
      agentOptions: { provider: OPENAI_CODEX_PROVIDER, model: 'gpt-6-astra', reasoningEffort: ReasoningEffortId('low') } })
    const original = { provider: OPENAI_CODEX_PROVIDER, model: 'gpt-6-astra', reasoningEffort: ReasoningEffortId('low') }
    ctx.effect(() => installModelSelection(agent.ctx, { get current() {
      const selected = agent.session.snapshotEvents().findLast(event => event.type === 'model/selection')?.data
      if (selected !== undefined) return { provider: selected.provider, model: selected.model,
        ...(selected.reasoningEffort === undefined ? {} : { reasoningEffort: ReasoningEffortId(selected.reasoningEffort) }) }
      return agent.session.requestHeader()?.config ?? original
    }, assembled: undefined }))
    let sequence = 0, revision = 0, question: {
      key: number; questions: readonly AskUserQuestionItem[]; resolve(value: AskUserQuestionAnswer): void; reject(reason: unknown): void
    } | undefined
    let operation: Promise<unknown> | undefined
    let phase = 'idle'
    ctx.on('user-questions/request', request => new Promise((resolve, reject) => {
      question = { key: ++sequence, questions: structuredClone(request.questions), resolve, reject }
      request.signal?.addEventListener('abort', () => { question = undefined; phase = 'canceled'; reject(request.signal?.reason) }, { once: true })
      phase = 'awaiting-answer'
    }))
    const state = () => ({
      settings: ctx.settings.describe().find(row => row.ns === Product.OPENAI_CODEX_SETTINGS_NS)!.value,
      catalog: openAICodexModelCatalog(),
      revision, phase, question: question === undefined ? null : { key: question.key, questions: question.questions },
      recorded: agent.session.requestHeader()?.config ?? original,
      requests: wires.length, updates: agent.session.deriveMessages().filter(message => readReasoningUpdate(message) !== undefined).length,
      enabled: ctx.tools.get(ASTRA_REASONING_TOOL_NAME) !== undefined, defaultWrites, unexpectedFetches,
    })
    const send = async () => {
      agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Continue the synthetic task.' }] }))
      await agent.whenIdle(); phase = 'continued'
    }
    await send()
    return { dispose, state, async command(action: string, value?: unknown) {
      if (disposed) throw new Error('Synthetic fixture was disposed')
      if (action === 'settings') {
        if (typeof value !== 'boolean') throw new TypeError('Only the Think flag is mutable in this fixture')
        await ctx.settings.update(Product.OPENAI_CODEX_SETTINGS_NS, { enableReasoningUpdates: value }); revision++
        for (let i = 0; i < 100 && (ctx.tools.get(ASTRA_REASONING_TOOL_NAME) !== undefined) !== value; i++) await new Promise(r => setTimeout(r, 5))
      } else if (action === 'propose') {
        if (question || phase === 'decision-returned') throw new Error('Continue after the previous decision before proposing another')
        const target = value === 'medium' ? 'medium' : value === 'high' ? 'high' : undefined
        if (target === undefined) throw new TypeError('Invalid synthetic target')
        phase = 'requesting'
        operation = ctx.tools.execute({ name: ASTRA_REASONING_TOOL_NAME, callId: `browser_${sequence}` as never,
          arguments: { effort: target, reason: 'Review the next bounded task.' }, agent, signal: new AbortController().signal })
          .then(result => { if (result.isError) phase = 'rejected'; else if (phase !== 'canceled') phase = 'decision-returned'; return result }, error => { phase = 'canceled'; return error })
        for (let i = 0; i < 100 && phase === 'requesting'; i++) await new Promise(r => setTimeout(r, 5))
        if (question === undefined) throw new Error('Native question was not created')
      } else if (action === 'answer') {
        if (!question) throw new Error('No native question is pending')
        if (typeof value !== 'object' || value === null || !('key' in value) || value.key !== question.key || !('answer' in value)) throw new Error('Stale native question answer')
        question.resolve(value.answer as AskUserQuestionAnswer); question = undefined
        await operation
      } else if (action === 'cancel') {
        question?.reject(new Error('Synthetic browser dismissed the native question')); question = undefined
        await operation; phase = 'canceled'
      } else if (action === 'continue') {
        if (question) throw new Error('Answer or cancel the native question before continuing')
        await send()
      } else if (action !== 'state') throw new TypeError('Unknown synthetic fixture operation')
      return state()
    } }
  } catch (error) { await dispose(); throw error }
}
