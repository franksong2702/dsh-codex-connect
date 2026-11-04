import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import LlmRuntime, { resolveRetryPolicy } from '@deepseek-ai/dsh-llm'
import type { RetryPolicyConfig } from '@deepseek-ai/dsh-llm'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as CodexConnect from '../src/index.ts'
import { createOpenAICodexAdapter } from '../src/adapter.ts'
import type { OpenAICodexCredentialStore } from '../src/store.ts'

let context: Context | undefined
let directory: string | undefined
afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (directory !== undefined) await rm(directory, { recursive: true, force: true })
  directory = undefined
  vi.unstubAllEnvs()
})

const configured: RetryPolicyConfig = {
  mode: 'normal', maxRetries: 10, retryableCodes: ['TRANSPORT', 'TIMEOUT'],
  backoff: { initialDelayMs: 1_000, maxDelayMs: 20_000, jitterRatio: 0.1 },
}

describe('startup provider retry policy', () => {
  it('keeps omission absent in configuration and retains the Host defaults', () => {
    expect(CodexConnect.Config({}).retryPolicy).toBeUndefined()
    const adapter = createOpenAICodexAdapter({} as OpenAICodexCredentialStore, () => undefined)
    expect(adapter.providerRetryPolicy('openai-codex')).toEqual(resolveRetryPolicy(undefined, 'fixture'))
  })

  it('rejects null at adapter load even when the Host optional schema passes it through', () => {
    const retryPolicy = CodexConnect.Config({ retryPolicy: null as unknown as RetryPolicyConfig }).retryPolicy
    expect(() => createOpenAICodexAdapter({} as OpenAICodexCredentialStore, () => undefined,
      undefined, undefined, undefined, undefined, undefined,
      undefined, undefined, undefined, undefined, undefined, undefined, retryPolicy)).toThrow('retryPolicy')
  })

  it.each([configured, { mode: 'normal', maxRetries: 0 }, { mode: 'always', backoff: { maxDelayMs: 20_000 } }] as RetryPolicyConfig[])
    ('registers the explicitly configured policy with the actual Host: %j', async retryPolicy => {
      directory = await mkdtemp(join(tmpdir(), 'codex-retry-policy-'))
      vi.stubEnv('DSH_HOME', directory)
      context = new Context()
      await context.plugin(LlmRuntime)
      const plugin = await context.plugin(CodexConnect, { retryPolicy })
      expect(context.llm.providerRetryPolicy('openai-codex')).toEqual(resolveRetryPolicy(retryPolicy, 'fixture'))
      await plugin.dispose()
      expect(context.llm.listProviders()).not.toContainEqual(expect.objectContaining({ id: 'openai-codex' }))
      await context.plugin(CodexConnect, {})
      expect(context.llm.providerRetryPolicy('openai-codex')).toEqual(resolveRetryPolicy(undefined, 'fixture'))
    })

  it('captures a detached immutable policy before lazy profile creation or override refresh', async () => {
    const input = structuredClone(configured)
    const expected = resolveRetryPolicy(input, 'fixture')
    let overrides: Record<string, number> | undefined
    const adapter = createOpenAICodexAdapter({} as OpenAICodexCredentialStore, () => undefined,
      undefined, undefined, undefined, undefined, () => overrides,
      undefined, undefined, undefined, undefined, undefined, undefined, input)
    input.maxRetries = 0
    input.retryableCodes!.push('SERVER')
    input.backoff!.maxDelayMs = 1
    expect(adapter.providerRetryPolicy('openai-codex')).toEqual(expected)
    overrides = { 'gpt-5.6-sol': 100_000 }
    await adapter.listModels('openai-codex')
    const policy = adapter.providerRetryPolicy('openai-codex')!
    expect(policy).toEqual(expected)
    expect(Object.isFrozen(policy)).toBe(true)
    if (policy.mode === 'normal') expect(Object.isFrozen(policy.retryableCodes)).toBe(true)
  })

  it.each([
    { mode: 'normal', misspelled: 10 },
    { mode: 'normal', maxRetries: -1 },
    { mode: 'normal', maxRetries: 1.5 },
    { mode: 'normal', maxRetries: Number.MAX_SAFE_INTEGER + 1 },
    { mode: 'normal', retryableCodes: [] },
    { mode: 'normal', retryableCodes: ['TRANSPORT', 'TRANSPORT'] },
    { mode: 'normal', retryableCodes: [''] },
    { mode: 'normal', retryableCodes: [1] },
    { mode: 'normal', backoff: { misspelled: 1 } },
    { mode: 'normal', backoff: { initialDelayMs: 0 } },
    { mode: 'normal', backoff: { initialDelayMs: -1 } },
    { mode: 'normal', backoff: { initialDelayMs: Number.NaN } },
    { mode: 'normal', backoff: { maxDelayMs: Infinity } },
    { mode: 'normal', backoff: { maxDelayMs: 2 ** 31 } },
    { mode: 'normal', backoff: { initialDelayMs: 2_000, maxDelayMs: 1_000 } },
    { mode: 'normal', backoff: { jitterRatio: -0.1 } },
    { mode: 'normal', backoff: { jitterRatio: 1.1 } },
    { mode: 'unsupported' },
  ])('rejects invalid startup policy instead of accepting an ignored option: %j', retryPolicy => {
    expect(() => CodexConnect.Config({ retryPolicy: retryPolicy as RetryPolicyConfig }))
      .toThrow(/retryPolicy|expected/iu)
  })

  it('rejects an invalid direct adapter configuration before any credential resolution', () => {
    const captureActiveAccount = vi.fn()
    const credentials = { captureActiveAccount } as unknown as OpenAICodexCredentialStore
    expect(() => createOpenAICodexAdapter(credentials, () => undefined,
      undefined, undefined, undefined, undefined, undefined,
      undefined, undefined, undefined, undefined, undefined, undefined,
      { mode: 'normal', maxRetries: -1 })).toThrow('retryPolicy.maxRetries')
    expect(captureActiveAccount).not.toHaveBeenCalled()
  })
})
