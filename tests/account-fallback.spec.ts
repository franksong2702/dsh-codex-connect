import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createAssistantMessageEventStream,
} from '@earendil-works/pi-ai'
import type {
  AssistantMessage,
  AssistantMessageEvent,
  Context,
  Model,
  OAuthCredential,
  Provider,
  SimpleStreamOptions,
  Usage,
} from '@earendil-works/pi-ai'
import {
  isOpenAICodexAccountQuotaExhausted,
  withOpenAICodexAccountFallback,
} from '../src/account-fallback.ts'
import {
  OpenAICodexCredentialStore,
  OPENAI_CODEX_PROVIDER,
} from '../src/store.ts'

let root: string | undefined

afterEach(async () => {
  vi.useRealTimers()
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

function usage(output = 0): Usage {
  return {
    input: 1,
    output,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 1 + output,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  }
}

function credential(accountId: string): OAuthCredential {
  return {
    type: 'oauth',
    access: `access-${accountId}`,
    refresh: `refresh-${accountId}`,
    expires: Date.now() + 60_000,
    accountId,
  }
}

async function storedAccounts(): Promise<OpenAICodexCredentialStore> {
  root = await mkdtemp(join(tmpdir(), 'dsh-codex-fallback-'))
  const store = new OpenAICodexCredentialStore(join(root, 'auth.json'))
  await store.modify(OPENAI_CODEX_PROVIDER, () => Promise.resolve(credential('account-1')))
  await store.modify(OPENAI_CODEX_PROVIDER, () => Promise.resolve(credential('account-2')))
  await store.activate('account-1')
  return store
}

function model(): Model<'openai-codex-responses'> {
  return {
    provider: OPENAI_CODEX_PROVIDER,
    id: 'gpt-test',
    name: 'GPT Test',
    api: 'openai-codex-responses',
    baseUrl: 'https://chatgpt.com/backend-api/codex',
    reasoning: true,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 16_000,
    maxTokens: 1_000,
    input: ['text'],
  }
}

function message(text: string, stopReason: AssistantMessage['stopReason'], errorMessage?: string): AssistantMessage {
  return {
    role: 'assistant',
    content: text.length === 0 ? [] : [{ type: 'text', text }],
    api: 'openai-codex-responses',
    provider: OPENAI_CODEX_PROVIDER,
    model: 'gpt-test',
    usage: usage(text.length),
    stopReason,
    ...errorMessage === undefined ? {} : { errorMessage },
    timestamp: Date.now(),
  }
}

function provider(
  implementation: (context: Context, options?: SimpleStreamOptions) => ReturnType<typeof createAssistantMessageEventStream>,
): Provider {
  return {
    id: OPENAI_CODEX_PROVIDER,
    name: 'OpenAI Codex Test',
    auth: { apiKey: { name: 'test', resolve: async () => undefined } },
    getModels: () => [model()],
    stream: (_model, context, options) => implementation(context, options),
    streamSimple: (_model, context, options) => implementation(context, options),
  }
}

async function collect(stream: AsyncIterable<AssistantMessageEvent>): Promise<AssistantMessageEvent[]> {
  const events: AssistantMessageEvent[] = []
  for await (const event of stream) events.push(event)
  return events
}

async function activeAccess(store: OpenAICodexCredentialStore): Promise<string | undefined> {
  const current = await store.read(OPENAI_CODEX_PROVIDER)
  return current?.type === 'oauth' ? current.access : undefined
}

const context: Context = {
  messages: [{ role: 'user', content: 'Write Alpha Beta.', timestamp: 1 }],
}

describe('OpenAI Codex account fallback', () => {
  it.each([
    'insufficient_quota',
    'usage limit reached',
    'credits depleted',
    'GoUsageLimitError',
    'usage_limit_reached',
    'usage_not_included',
    'You have hit your ChatGPT usage limit (pro plan).',
    'Monthly usage limit reached',
    'no available balance',
  ])('recognizes terminal account exhaustion: %s', (detail) => {
    expect(isOpenAICodexAccountQuotaExhausted(detail)).toBe(true)
  })

  it.each([
    'HTTP 429 rate limit',
    'rate_limit_exceeded',
    'connection reset',
    'HTTP 401 unauthorized',
    'service unavailable',
  ])('does not rotate for a non-terminal failure: %s', (detail) => {
    expect(isOpenAICodexAccountQuotaExhausted(detail)).toBe(false)
  })

  it('hard-interrupts an exhausted account, resumes on the second credential, and strips repeated output', async () => {
    const store = await storedAccounts()
    const calls: Array<{ access: string | undefined; context: Context }> = []
    const source = provider((requestContext, options) => {
      calls.push({ access: options?.apiKey, context: requestContext })
      const stream = createAssistantMessageEventStream()
      if (options?.apiKey === 'access-account-1') {
        const partial = message('Alpha ', 'error', 'quota exhausted')
        stream.push({ type: 'start', partial: message('', 'stop') })
        stream.push({ type: 'text_start', contentIndex: 0, partial })
        stream.push({ type: 'text_delta', contentIndex: 0, delta: 'Alpha ', partial })
        setTimeout(() => {
          stream.push({ type: 'error', reason: 'error', error: partial })
          stream.end(partial)
        }, 5)
        return stream
      }
      const completed = message('Alpha Beta', 'stop')
      stream.push({ type: 'start', partial: message('', 'stop') })
      stream.push({ type: 'text_start', contentIndex: 0, partial: completed })
      stream.push({ type: 'text_delta', contentIndex: 0, delta: 'Alpha Beta', partial: completed })
      stream.push({ type: 'text_end', contentIndex: 0, content: 'Alpha Beta', partial: completed })
      stream.push({ type: 'done', reason: 'stop', message: completed })
      stream.end(completed)
      return stream
    })
    const wrapped = withOpenAICodexAccountFallback(source, store, () => activeAccess(store))

    const events = await collect(wrapped.streamSimple(model(), context, { apiKey: 'access-account-1' }))
    const deltas = events.filter(event => event.type === 'text_delta').map(event => event.delta).join('')
    const terminal = events.at(-1)

    expect(deltas).toBe('Alpha Beta')
    expect(events.filter(event => event.type === 'start')).toHaveLength(1)
    expect(events.filter(event => event.type === 'error')).toHaveLength(0)
    expect(terminal?.type).toBe('done')
    if (terminal?.type !== 'done') throw new Error('expected successful terminal event')
    expect(terminal.message.content).toEqual([
      expect.objectContaining({ type: 'text', text: 'Alpha ' }),
      expect.objectContaining({ type: 'text', text: 'Beta' }),
    ])
    expect(calls.map(call => call.access)).toEqual(['access-account-1', 'access-account-2'])
    expect(calls[1]?.context.messages.at(-2)).toMatchObject({
      role: 'assistant',
      content: [{ type: 'text', text: 'Alpha ' }],
    })
    expect(calls[1]?.context.messages.at(-1)).toMatchObject({
      role: 'user',
      content: expect.stringContaining('Continue the interrupted assistant answer'),
    })
    expect(await store.accounts()).toEqual([
      expect.objectContaining({ accountId: 'account-1', active: false }),
      expect.objectContaining({ accountId: 'account-2', active: true }),
    ])
  })

  it('stops after every saved account reports exhausted instead of looping', async () => {
    const store = await storedAccounts()
    const calls: string[] = []
    const source = provider((_requestContext, options) => {
      calls.push(options?.apiKey ?? 'missing')
      const stream = createAssistantMessageEventStream()
      const exhausted = message('', 'error', 'insufficient_quota')
      stream.push({ type: 'start', partial: message('', 'stop') })
      stream.push({ type: 'error', reason: 'error', error: exhausted })
      stream.end(exhausted)
      return stream
    })
    const wrapped = withOpenAICodexAccountFallback(source, store, () => activeAccess(store))

    const events = await collect(wrapped.streamSimple(model(), context, { apiKey: 'access-account-1' }))

    expect(calls).toEqual(['access-account-1', 'access-account-2'])
    expect(events.filter(event => event.type === 'start')).toHaveLength(1)
    expect(events.at(-1)).toMatchObject({
      type: 'error',
      error: { errorMessage: 'insufficient_quota' },
    })
  })

  it('leaves the active account and terminal error unchanged while fallback is disabled', async () => {
    const store = await storedAccounts()
    const calls = vi.fn()
    const source = provider((_requestContext, options) => {
      calls(options?.apiKey)
      const stream = createAssistantMessageEventStream()
      const exhausted = message('', 'error', 'usage_limit_reached')
      stream.push({ type: 'start', partial: message('', 'stop') })
      stream.push({ type: 'error', reason: 'error', error: exhausted })
      stream.end(exhausted)
      return stream
    })
    const wrapped = withOpenAICodexAccountFallback(
      source,
      store,
      () => activeAccess(store),
      () => false,
    )

    const events = await collect(wrapped.streamSimple(model(), context, { apiKey: 'access-account-1' }))

    expect(calls).toHaveBeenCalledOnce()
    expect(events.at(-1)).toMatchObject({ type: 'error', error: { errorMessage: 'usage_limit_reached' } })
    expect((await store.accounts()).find(account => account.active)?.accountId).toBe('account-1')
  })

  it('does not switch accounts for a transient rate limit or after a tool call starts', async () => {
    const store = await storedAccounts()
    const callCount = vi.fn()
    const transient = provider((_requestContext, options) => {
      callCount(options?.apiKey)
      const stream = createAssistantMessageEventStream()
      const failed = message('', 'error', 'HTTP 429 rate limit')
      stream.push({ type: 'start', partial: message('', 'stop') })
      stream.push({ type: 'error', reason: 'error', error: failed })
      stream.end(failed)
      return stream
    })
    const transientWrapped = withOpenAICodexAccountFallback(transient, store, () => activeAccess(store))
    await collect(transientWrapped.streamSimple(model(), context, { apiKey: 'access-account-1' }))
    expect(callCount).toHaveBeenCalledOnce()
    expect((await store.accounts()).find(account => account.active)?.accountId).toBe('account-1')

    const toolProvider = provider(() => {
      const stream = createAssistantMessageEventStream()
      const failed: AssistantMessage = {
        ...message('', 'error', 'quota exceeded'),
        content: [{ type: 'toolCall', id: 'call-1', name: 'write_file', arguments: {} }],
      }
      stream.push({ type: 'start', partial: message('', 'stop') })
      stream.push({ type: 'toolcall_start', contentIndex: 0, partial: failed })
      stream.push({ type: 'error', reason: 'error', error: failed })
      stream.end(failed)
      return stream
    })
    const toolWrapped = withOpenAICodexAccountFallback(toolProvider, store, () => activeAccess(store))
    const toolEvents = await collect(toolWrapped.streamSimple(model(), context, { apiKey: 'access-account-1' }))
    expect(toolEvents.at(-1)?.type).toBe('error')
    expect((await store.accounts()).find(account => account.active)?.accountId).toBe('account-1')
  })

  it('reports an abrupt transport interruption without changing accounts', async () => {
    const store = await storedAccounts()
    const calls = vi.fn()
    const interrupted = provider((_requestContext, options) => {
      calls(options?.apiKey)
      const stream = createAssistantMessageEventStream()
      const partial = message('partial', 'error', 'connection reset')
      stream.push({ type: 'start', partial: message('', 'stop') })
      stream.push({ type: 'text_start', contentIndex: 0, partial })
      stream.push({ type: 'text_delta', contentIndex: 0, delta: 'partial', partial })
      stream.end(partial)
      return stream
    })
    const wrapped = withOpenAICodexAccountFallback(interrupted, store, () => activeAccess(store))

    const events = await collect(wrapped.streamSimple(model(), context, { apiKey: 'access-account-1' }))

    expect(calls).toHaveBeenCalledOnce()
    expect(events.at(-1)).toMatchObject({
      type: 'error',
      error: { errorMessage: expect.stringContaining('without a terminal event') },
    })
    expect((await store.accounts()).find(account => account.active)?.accountId).toBe('account-1')
  })

  it('remains bounded across repeated persisted-account hard failovers', async () => {
    const store = await storedAccounts()
    let requests = 0
    const source = provider((_requestContext, options) => {
      requests += 1
      const stream = createAssistantMessageEventStream()
      if (options?.apiKey === 'access-account-1') {
        const failed = message('x', 'error', 'credits depleted')
        stream.push({ type: 'start', partial: message('', 'stop') })
        stream.push({ type: 'text_start', contentIndex: 0, partial: failed })
        stream.push({ type: 'text_delta', contentIndex: 0, delta: 'x', partial: failed })
        stream.push({ type: 'error', reason: 'error', error: failed })
        stream.end(failed)
      } else {
        const done = message('y', 'stop')
        stream.push({ type: 'start', partial: message('', 'stop') })
        stream.push({ type: 'text_start', contentIndex: 0, partial: done })
        stream.push({ type: 'text_delta', contentIndex: 0, delta: 'y', partial: done })
        stream.push({ type: 'text_end', contentIndex: 0, content: 'y', partial: done })
        stream.push({ type: 'done', reason: 'stop', message: done })
        stream.end(done)
      }
      return stream
    })
    const wrapped = withOpenAICodexAccountFallback(source, store, () => activeAccess(store))

    for (let iteration = 0; iteration < 20; iteration += 1) {
      await store.activate('account-1')
      const events = await collect(wrapped.streamSimple(model(), context, { apiKey: 'access-account-1' }))
      expect(events.at(-1)?.type).toBe('done')
    }
    expect(requests).toBe(40)
  })
})
