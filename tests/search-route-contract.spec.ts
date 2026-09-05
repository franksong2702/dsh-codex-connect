import { describe, expect, it } from 'vitest'
import {
  decodeOpenAICodexSearchRouteConfig,
  OPENAI_CODEX_SEARCH_ROUTE_PROVIDER,
} from '../src/client/search-route.ts'

describe('OpenAI Codex search route contract', () => {
  it('accepts an inherited route and a selected provider', () => {
    expect(decodeOpenAICodexSearchRouteConfig({})).toEqual({})
    expect(decodeOpenAICodexSearchRouteConfig({ searchProvider: 'deepseek' }))
      .toEqual({ searchProvider: 'deepseek' })
    expect(OPENAI_CODEX_SEARCH_ROUTE_PROVIDER).toBe('openai-codex')
  })

  it.each([
    null,
    [],
    'openai-codex',
    { searchProvider: '' },
    { searchProvider: 1 },
    { searchProvider: null },
  ])('rejects an invalid Host-owned web settings value: %j', value => {
    expect(decodeOpenAICodexSearchRouteConfig(value)).toBeUndefined()
  })
})
