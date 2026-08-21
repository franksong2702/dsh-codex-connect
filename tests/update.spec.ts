import { describe, expect, it, vi } from 'vitest'
import {
  checkForOpenAICodexUpdate,
  compareOpenAICodexVersions,
  OPENAI_CODEX_NPM_METADATA_URL,
  OPENAI_CODEX_RELEASE_API_BASE,
  parseOpenAICodexUpdateResult,
  parseOpenAICodexVersion,
} from '../src/update.ts'

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('Codex Connect update metadata', () => {
  it('compares prerelease versions without treating alpha 10 as alpha 2', () => {
    expect(compareOpenAICodexVersions('0.1.0-alpha.10', '0.1.0-alpha.2')).toBeGreaterThan(0)
    expect(compareOpenAICodexVersions('0.1.0-alpha.4.14', '0.1.0-alpha.4.14')).toBe(0)
    expect(compareOpenAICodexVersions('0.1.0', '0.1.0-alpha.99')).toBeGreaterThan(0)
    expect(parseOpenAICodexVersion('v0.1.0-alpha.4.14')).toBeDefined()
    expect(parseOpenAICodexVersion('0.1.0-alpha.01')).toBeUndefined()
  })

  it('selects the newest public alpha/stable tag and fetches bounded release notes', async () => {
    const fetchMock = vi.fn(async (url: string): Promise<Response> => {
      if (url === OPENAI_CODEX_NPM_METADATA_URL) {
        return json({ 'dist-tags': { latest: '0.1.0-alpha.4.15', alpha: '0.1.0-alpha.4.16', experimental: '9.9.9' } })
      }
      expect(url).toBe(`${OPENAI_CODEX_RELEASE_API_BASE}0.1.0-alpha.4.16`)
      return json({
        name: 'Alpha 4.16 — update notes',
        body: '<not-rendered-as-markdown>\n- Global update reminder',
        published_at: '2026-08-21T12:00:00Z',
        token: 'must not be returned',
      })
    })

    await expect(checkForOpenAICodexUpdate({ currentVersion: '0.1.0-alpha.4.14', fetchImpl: fetchMock })).resolves.toEqual({
      status: 'update-available',
      currentVersion: '0.1.0-alpha.4.14',
      latestVersion: '0.1.0-alpha.4.16',
      releaseUrl: 'https://github.com/franksong2702/dsh-codex-connect/releases/tag/v0.1.0-alpha.4.16',
      releaseName: 'Alpha 4.16 — update notes',
      releaseNotes: '<not-rendered-as-markdown>\n- Global update reminder',
      publishedAt: '2026-08-21T12:00:00Z',
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('reports up-to-date without contacting GitHub when tags are not newer', async () => {
    const fetchMock = vi.fn(async (): Promise<Response> => json({ 'dist-tags': { latest: '0.1.0-alpha.4.14', alpha: '0.1.0-alpha.4.13' } }))
    await expect(checkForOpenAICodexUpdate({ currentVersion: '0.1.0-alpha.4.14', fetchImpl: fetchMock })).resolves.toEqual({
      status: 'up-to-date',
      currentVersion: '0.1.0-alpha.4.14',
      latestVersion: '0.1.0-alpha.4.14',
    })
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('fails closed for network errors, malformed tags, and oversized bodies', async () => {
    const rejected = vi.fn(async (): Promise<Response> => { throw new Error('network down') })
    await expect(checkForOpenAICodexUpdate({ currentVersion: '0.1.0-alpha.4.14', fetchImpl: rejected })).resolves.toMatchObject({
      status: 'unavailable',
      reason: 'registry-unavailable',
    })

    const malformed = vi.fn(async (): Promise<Response> => json({ 'dist-tags': { latest: 'not-a-version', alpha: 42 } }))
    await expect(checkForOpenAICodexUpdate({ currentVersion: '0.1.0-alpha.4.14', fetchImpl: malformed })).resolves.toMatchObject({
      status: 'unavailable',
      reason: 'invalid-registry-response',
    })

    const oversized = vi.fn(async (): Promise<Response> => new Response('x'.repeat(70_000), { status: 200 }))
    await expect(checkForOpenAICodexUpdate({ currentVersion: '0.1.0-alpha.4.14', fetchImpl: oversized })).resolves.toMatchObject({
      status: 'unavailable',
      reason: 'invalid-registry-response',
    })
  })

  it('accepts only the fixed release URL and safe public response fields in the browser parser', () => {
    expect(parseOpenAICodexUpdateResult({
      status: 'update-available',
      currentVersion: '0.1.0-alpha.4.14',
      latestVersion: '0.1.0-alpha.4.15',
      releaseUrl: 'https://example.com/steal',
    })).toBeUndefined()
    expect(parseOpenAICodexUpdateResult({
      status: 'up-to-date',
      currentVersion: '0.1.0-alpha.4.14',
      latestVersion: '0.1.0-alpha.4.14',
      credential: 'must not pass through',
    })).toEqual({
      status: 'up-to-date',
      currentVersion: '0.1.0-alpha.4.14',
      latestVersion: '0.1.0-alpha.4.14',
    })
  })
})
