import { createAssistantMessageEventStream } from '@earendil-works/pi-ai'
import type { SimpleStreamOptions } from '@earendil-works/pi-ai'
import { openaiCodexProvider } from '@earendil-works/pi-ai/providers/openai-codex'
import { expect, it, vi } from 'vitest'
import { SPLIT_MODEL, withSplitDispatch, withSplitProviderBounds } from '../src/split-dispatch.ts'
import type { SplitDispatchScope } from '../src/split-dispatch.ts'

function setup(observer?: SimpleStreamOptions['onPayload']) {
  const base = openaiCodexProvider()
  const model = base.getModels().find(model => model.id === SPLIT_MODEL)!
  let captured: SimpleStreamOptions | undefined
  const streamSimple = vi.fn<typeof base.streamSimple>((_model, _context, options) => { captured = options; return createAssistantMessageEventStream() })
  const provider = withSplitProviderBounds({ ...base, streamSimple })
  const controller = new AbortController()
  const scope: SplitDispatchScope = { signal: controller.signal, childId: 'split-transport-fixture', maximumRequests: 1, requests: 0, closed: false }
  const options: SimpleStreamOptions = { sessionId: scope.childId!, maxRetries: 5, ...(observer ? { onPayload: observer } : {}) }
  const invoke = () => withSplitDispatch(scope, () => provider.streamSimple(model, { messages: [] }, options))
  const payload = { model: SPLIT_MODEL, stream: true, store: false, reasoning: { effort: 'low' }, tools: [] }
  return { model, provider, options, invoke, scope, controller, payload, streamSimple, captured: () => captured! }
}
it('leaves ordinary requests unchanged outside a Split operation', () => {
  const f = setup()
  f.provider.streamSimple(f.model, { messages: [] }, f.options)
  expect(f.captured()).toBe(f.options)
  expect(f.captured().maxRetries).toBe(5)
})
it('pins SSE, forbids provider retries, and reserves at most one payload per call', async () => {
  const f = setup()
  f.invoke()
  expect(f.captured()).toMatchObject({ transport: 'sse', maxRetries: 0 })
  expect(await f.captured().onPayload!(f.payload, f.model)).toBe(f.payload)
  expect(f.scope.requests).toBe(1)
  await expect(f.captured().onPayload!(f.payload, f.model)).rejects.toThrow('SPLIT_REQUEST_BUDGET')
})
it('rechecks cancellation after an asynchronous observer', async () => {
  const f = setup(async () => { await Promise.resolve(); f.controller.abort(new Error('cancelled observer')); return undefined })
  f.invoke()
  await expect(f.captured().onPayload!(f.payload, f.model)).rejects.toThrow('cancelled observer')
  expect(f.scope.requests).toBe(0)
})
it.each(['model', 'service_tier', 'tools'] as const)('rejects observer changes to %s', async key => {
  const replacements = { model: 'not-the-approved-model', service_tier: 'priority', tools: [{ type: 'web_search' }] }
  const f = setup(payload => ({ ...payload as Record<string, unknown>, [key]: replacements[key] }))
  f.invoke()
  await expect(f.captured().onPayload!(f.payload, f.model)).rejects.toThrow('SPLIT_PAYLOAD_DENIED')
  expect(f.scope.requests).toBe(0)
})
it('does not allow a closed operation or a sibling session to consume its route', () => {
  const f = setup()
  expect(() => withSplitDispatch(f.scope, () => f.provider.streamSimple(f.model, { messages: [] }, { sessionId: 'other-session' }))).toThrow('SPLIT_ROUTE_DENIED')
  f.scope.closed = true
  expect(f.invoke).toThrow('SPLIT_DISPATCH_CLOSED')
  expect(f.streamSimple).not.toHaveBeenCalled()
})
