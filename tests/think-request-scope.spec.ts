import { expect, it } from 'vitest'
import type { Provider } from '@earendil-works/pi-ai'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import { ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import { createReasoningUpdateMessage } from '../src/reasoning-update.ts'
import { AstraReasoningRequestScope } from '../src/reasoning-update-provider.ts'

type Stream = Provider['streamSimple']
type Options = Parameters<Stream>[2]
const model = { id: 'gpt-6-astra', provider: 'openai-codex' } as Parameters<Stream>[0]
const request = (id: string, effort: 'high' | 'medium' = 'high'): GenerateOptions => ({
  provider: 'openai-codex', model: 'gpt-6-astra', reasoningEffort: ReasoningEffortId('low'), sessionId: SessionId(id),
  messages: [createReasoningUpdateMessage({ version: 1, sessionId: id, baseEffort: 'low', previousEffort: 'low', effort })],
})
const content = (options: GenerateOptions) => options.messages.map(message => ({ role: 'user' as const,
  content: message.content.map(block => block.type === 'text' ? block.text : '').join(''), timestamp: 0 }))
const payload = (options: GenerateOptions) => ({ model: 'gpt-6-astra', reasoning: { effort: 'low' },
  input: content(options).map(message => ({ role: 'user', content: [{ type: 'input_text', text: message.content }] })) })
function history(options: GenerateOptions): Session {
  const session = Session.create(options.sessionId!)
  for (const message of options.messages) if (message.role === 'user') session.append('user/message', { ...message, role: 'user' }, { surfaceOp: 'append' })
  return session
}
async function consume(stream: AsyncIterable<StreamChunk>) { for await (const chunk of stream) void chunk }
function fixture() {
  const scope = new AstraReasoningRequestScope()
  const calls: Options[] = []
  const provider = scope.wrapProvider({ id: 'openai-codex', streamSimple: ((_model, _context, options) => {
    calls.push(options)
    return {} as ReturnType<Stream>
  }) as Stream } as Provider)
  return { scope, calls, provider }
}

it('captures the request plan before an eager delegate creates its provider stream', async () => {
  const { scope, provider, calls } = fixture()
  const options = request('eager')
  await consume(scope.stream(options, () => {
    provider.streamSimple(model, { messages: content(options) }, {})
    return { async *[Symbol.asyncIterator]() {} }
  }, history(options)))
  expect(calls[0]?.onPayload).toBeTypeOf('function')
  const result = await calls[0]?.onPayload?.(payload(options), model) as ReturnType<typeof payload>
  expect(result.input).toContainEqual({ type: 'configuration_update', reasoning: { effort: 'high' } })
})

it('does not cross concurrent plans or retain an override outside a request', async () => {
  const { scope, provider, calls } = fixture()
  const a = request('a', 'high'); const b = request('b', 'medium')
  await Promise.all([a, b].map(options => consume(scope.stream(options, () => ({
    async *[Symbol.asyncIterator]() {
      await Promise.resolve()
      provider.streamSimple(model, { messages: content(options) }, {})
    },
  }), history(options)))))
  for (const [index, options] of [a, b].entries()) {
    const result = await calls[index]?.onPayload?.(payload(options), model) as ReturnType<typeof payload>
    expect(result.input).toContainEqual({ type: 'configuration_update', reasoning: { effort: index === 0 ? 'high' : 'medium' } })
  }
  const unchanged = {}
  provider.streamSimple(model, { messages: [] }, unchanged)
  expect(calls[2]).toBe(unchanged)
})

it('preserves an existing payload hook and validates its replacement before applying updates', async () => {
  const { scope, provider, calls } = fixture()
  const options = request('hook')
  await consume(scope.stream(options, () => ({
    async *[Symbol.asyncIterator]() {
      provider.streamSimple(model, { messages: content(options) }, { onPayload(value) {
        return { ...(value as object), prompt_cache_key: 'synthetic-only' }
      } })
    },
  }), history(options)))
  const original = payload(options)
  const result = await calls[0]?.onPayload?.(original, model)
  expect(result).toMatchObject({ prompt_cache_key: 'synthetic-only' })
  expect(original.input).toHaveLength(1)
})

it('rejects a payload hook that removes the recorded notice', async () => {
  const { scope, provider, calls } = fixture()
  const options = request('replaced-hook')
  await consume(scope.stream(options, () => ({
    async *[Symbol.asyncIterator]() {
      provider.streamSimple(model, { messages: content(options) }, {
        onPayload(value) { return { ...(value as object), input: [] } },
      })
    },
  }), history(options)))
  await expect(calls[0]?.onPayload?.(payload(options), model)).rejects.toThrow(/positions/)
})

it('rejects a provider-model mismatch before calling the wrapped stream', async () => {
  const { scope, provider, calls } = fixture()
  const options = request('wrong-provider')
  const stream = scope.stream(options, () => ({
    async *[Symbol.asyncIterator]() {
      provider.streamSimple({ ...model, provider: 'unrelated-provider' }, { messages: content(options) }, {})
    },
  }), history(options))
  await expect(consume(stream)).rejects.toThrow(/another provider/)
  expect(calls).toHaveLength(0)
})

it('closes a partially consumed delegated iterator within its original request scope', async () => {
  const { scope, provider, calls } = fixture()
  const options = request('cleanup')
  let closed = 0
  const stream = scope.stream(options, () => ({
    [Symbol.asyncIterator]() {
      return {
        async next() { return { done: false as const, value: {} as StreamChunk } },
        async return() {
          closed++
          provider.streamSimple(model, { messages: content(options) }, {})
          return { done: true as const, value: undefined }
        },
      }
    },
  }), history(options))[Symbol.asyncIterator]()
  await stream.next(); await stream.return?.()
  expect(closed).toBe(1)
  expect(calls[0]?.onPayload).toBeTypeOf('function')
})
