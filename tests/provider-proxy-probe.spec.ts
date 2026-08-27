import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  dump: vi.fn(async () => undefined),
  request: vi.fn(),
}))

vi.mock('undici', async importOriginal => ({
  ...await importOriginal<typeof import('undici')>(),
  request: mocks.request,
}))

import {
  OPENAI_CODEX_CONNECTIVITY_TARGETS,
  OPENAI_CODEX_PROXY_TEST_URL,
  checkOpenAICodexConnectivity,
  testOpenAICodexProxy,
} from '../src/provider-proxy.ts'
import type { OpenAICodexProxyRunner } from '../src/provider-proxy.ts'

beforeEach(() => {
  mocks.dump.mockClear()
  mocks.request.mockReset()
})

describe('OpenAI Codex proxy probe response cleanup', () => {
  it('consumes the response body instead of aborting its stream', async () => {
    mocks.request.mockResolvedValue({ statusCode: 204, body: { dump: mocks.dump } })

    await expect(testOpenAICodexProxy('http://127.0.0.1:7890')).resolves.toEqual({
      ok: true,
      statusCode: 204,
    })

    expect(mocks.request).toHaveBeenCalledWith(OPENAI_CODEX_PROXY_TEST_URL, expect.objectContaining({
      method: 'HEAD',
    }))
    expect(mocks.dump).toHaveBeenCalledOnce()
  })

  it('checks every Codex domain through the injected instance runner and preserves errors', async () => {
    mocks.request
      .mockResolvedValueOnce({ statusCode: 401, body: { dump: mocks.dump } })
      .mockRejectedValueOnce(Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:7890'), { code: 'ECONNREFUSED' }))
      .mockResolvedValueOnce({ statusCode: 404, body: { dump: mocks.dump } })
    const run = vi.fn()
    const proxy: OpenAICodexProxyRunner = {
      activeUrl: 'http://127.0.0.1:7890',
      run<T>(operation: () => T): T {
        run()
        return operation()
      },
    }

    const report = await checkOpenAICodexConnectivity(proxy)

    expect(report.mode).toBe('proxy')
    expect(report.targets).toHaveLength(OPENAI_CODEX_CONNECTIVITY_TARGETS.length)
    expect(report.targets.map(target => target.hostname)).toEqual(OPENAI_CODEX_CONNECTIVITY_TARGETS.map(target => target.hostname))
    expect(report.targets[0]).toEqual(expect.objectContaining({ reachable: true, statusCode: 401 }))
    expect(report.targets[1]).toEqual(expect.objectContaining({ reachable: false, error: expect.stringContaining('ECONNREFUSED') }))
    expect(report.targets[2]).toEqual(expect.objectContaining({ reachable: true, statusCode: 404 }))
    expect(run).toHaveBeenCalledTimes(OPENAI_CODEX_CONNECTIVITY_TARGETS.length)
    expect(mocks.dump).toHaveBeenCalledTimes(2)
  })
})
