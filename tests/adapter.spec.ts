import { describe, expect, it } from 'vitest'
import { openaiCodexProvider } from '@earendil-works/pi-ai/providers/openai-codex'
import {
  createOpenAICodexProfile,
  OPENAI_CODEX_MAX_REQUEST_IMAGE_BYTES,
  OPENAI_CODEX_REQUEST_IMAGE_MAX_BYTES,
  OPENAI_CODEX_REQUEST_IMAGE_PIXEL_BUDGET,
} from '../src/adapter.ts'

describe('OpenAI Codex rc.2 adapter profile', () => {
  it('supplies all request-image defaults required by ResolvedPiAiProviderProfile', () => {
    const profile = createOpenAICodexProfile(openaiCodexProvider())

    expect(profile.maxRequestImageBytes).toBe(OPENAI_CODEX_MAX_REQUEST_IMAGE_BYTES)
    expect(profile.requestImagePixelBudget).toBe(OPENAI_CODEX_REQUEST_IMAGE_PIXEL_BUDGET)
    expect(profile.requestImageMaxBytes).toBe(OPENAI_CODEX_REQUEST_IMAGE_MAX_BYTES)
    expect(profile.maxRequestImageBytes).toBe(20 * 1024 * 1024)
    expect(profile.requestImagePixelBudget).toBe(2048 * 2048)
    expect(profile.requestImageMaxBytes).toBe(1024 * 1024)
  })
})
