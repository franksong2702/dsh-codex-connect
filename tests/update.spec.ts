import { describe, expect, it, vi } from 'vitest'
import {
  checkForOpenAICodexUpdate,
  compareOpenAICodexVersions,
  OPENAI_CODEX_NPM_METADATA_URL,
  OPENAI_CODEX_RELEASE_API_BASE,
  OPENAI_CODEX_UPDATE_HIGHLIGHTS_URL,
  OPENAI_CODEX_VERIFIED_COMPATIBILITY_URL,
  parseOpenAICodexUpdateHighlights,
  parseOpenAICodexUpdateResult,
  parseOpenAICodexVersion,
} from '../src/update.ts'

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

const verifiedCompatibility = {
  schemaVersion: 1,
  checkedAt: '2026-08-23',
  latestDshVersion: '0.1.1-rc.2',
  pluginVersions: [
    { version: '0.1.0-alpha.4.14', verifiedDshVersions: ['0.1.1-rc.2'] },
    { version: '0.1.0-alpha.4.16', verifiedDshVersions: ['0.1.1-rc.2'] },
  ],
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
        return json({ latest: '0.1.0-alpha.4.15', alpha: '0.1.0-alpha.4.16', experimental: '9.9.9' })
      }
      if (url === OPENAI_CODEX_UPDATE_HIGHLIGHTS_URL) return json({ schemaVersion: 1, releases: [] })
      if (url === OPENAI_CODEX_VERIFIED_COMPATIBILITY_URL) return json(verifiedCompatibility)
      expect(url).toBe(`${OPENAI_CODEX_RELEASE_API_BASE}0.1.0-alpha.4.16`)
      return json({
        name: 'Alpha 4.16 — update notes',
        body: '<not-rendered-as-markdown>\n- Global update reminder',
        published_at: '2026-08-21T12:00:00Z',
        token: 'must not be returned',
      })
    })

    await expect(checkForOpenAICodexUpdate({ currentVersion: '0.1.0-alpha.4.14', currentDshVersion: '0.1.1-rc.2', fetchImpl: fetchMock })).resolves.toEqual({
      status: 'update-available',
      currentVersion: '0.1.0-alpha.4.14',
      currentDshVersion: '0.1.1-rc.2',
      latestVersion: '0.1.0-alpha.4.16',
      releaseUrl: 'https://github.com/franksong2702/dsh-codex-connect/releases/tag/v0.1.0-alpha.4.16',
      highlights: [],
      compatibility: {
        status: 'compatible',
        latestPluginVersion: '0.1.0-alpha.4.16',
        latestDshVersion: '0.1.1-rc.2',
      },
      releaseName: 'Alpha 4.16 — update notes',
      releaseNotes: '<not-rendered-as-markdown>\n- Global update reminder',
      publishedAt: '2026-08-21T12:00:00Z',
    })
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('selects user-facing highlights across every published version in the installed-to-latest range', async () => {
    const fetchMock = vi.fn(async (url: string): Promise<Response> => {
      if (url === OPENAI_CODEX_NPM_METADATA_URL) return json({ latest: '0.1.0-alpha.4.14', alpha: '0.1.0-alpha.4.14' })
      if (url === OPENAI_CODEX_UPDATE_HIGHLIGHTS_URL) {
        return json({
          schemaVersion: 1,
          releases: [
            { version: '0.1.0-alpha.4.8', highlights: ['trusted-origins', 'runtime-compatibility'] },
            { version: '0.1.0-alpha.4.9', highlights: ['quota-fast-mode'] },
            { version: '0.1.0-alpha.4.10', highlights: ['dsh-rc7'] },
            { version: '0.1.0-alpha.4.11', highlights: ['search-stability'] },
            { version: '0.1.0-alpha.4.12', highlights: ['image-generation'] },
            { version: '0.1.0-alpha.4.13', highlights: [] },
            { version: '0.1.0-alpha.4.14', highlights: ['oauth-history'] },
          ],
        })
      }
      return json({ name: 'Alpha 4.14', body: 'technical details' })
    })
    await expect(checkForOpenAICodexUpdate({ currentVersion: '0.1.0-alpha.4.8', fetchImpl: fetchMock })).resolves.toMatchObject({
      status: 'update-available',
      versionsBehind: 6,
      highlights: [
        { version: '0.1.0-alpha.4.9', kind: 'quota-fast-mode' },
        { version: '0.1.0-alpha.4.10', kind: 'dsh-rc7' },
        { version: '0.1.0-alpha.4.11', kind: 'search-stability' },
        { version: '0.1.0-alpha.4.12', kind: 'image-generation' },
        { version: '0.1.0-alpha.4.14', kind: 'oauth-history' },
      ],
    })
  })

  it('does not show older highlights to a user who is one release behind', async () => {
    const fetchMock = vi.fn(async (url: string): Promise<Response> => {
      if (url === OPENAI_CODEX_NPM_METADATA_URL) return json({ latest: '0.1.0-alpha.4.14', alpha: '0.1.0-alpha.4.14' })
      if (url === OPENAI_CODEX_UPDATE_HIGHLIGHTS_URL) return json({
        schemaVersion: 1,
        releases: [
          { version: '0.1.0-alpha.4.12', highlights: ['image-generation'] },
          { version: '0.1.0-alpha.4.14', highlights: ['oauth-history'] },
        ],
      })
      return json({ name: 'Alpha 4.14', body: 'technical details' })
    })
    await expect(checkForOpenAICodexUpdate({ currentVersion: '0.1.0-alpha.4.13', fetchImpl: fetchMock })).resolves.toMatchObject({
      status: 'update-available',
      versionsBehind: 1,
      highlights: [{ version: '0.1.0-alpha.4.14', kind: 'oauth-history' }],
    })
  })

  it('ignores malformed or unknown entries in an otherwise valid release-summary catalog', () => {
    expect(parseOpenAICodexUpdateHighlights({
      schemaVersion: 1,
      releases: [
        { version: '0.1.0-alpha.4.14', highlights: ['oauth-history', 'future-kind', 'oauth-history'] },
        { version: 'not-a-version', highlights: ['image-generation'] },
      ],
    })).toEqual({
      schemaVersion: 1,
      releases: [{ version: '0.1.0-alpha.4.14', highlights: ['oauth-history'] }],
    })
    expect(parseOpenAICodexUpdateHighlights({ schemaVersion: 2, releases: [] })).toBeUndefined()
  })

  it('reports up-to-date without contacting GitHub when tags are not newer', async () => {
    const fetchMock = vi.fn(async (url: string): Promise<Response> => url === OPENAI_CODEX_NPM_METADATA_URL
      ? json({ latest: '0.1.0-alpha.4.14', alpha: '0.1.0-alpha.4.13' })
      : json(verifiedCompatibility))
    await expect(checkForOpenAICodexUpdate({ currentVersion: '0.1.0-alpha.4.14', currentDshVersion: '0.1.1-rc.2', fetchImpl: fetchMock })).resolves.toEqual({
      status: 'up-to-date',
      currentVersion: '0.1.0-alpha.4.14',
      currentDshVersion: '0.1.1-rc.2',
      latestVersion: '0.1.0-alpha.4.14',
      compatibility: {
        status: 'compatible',
        latestPluginVersion: '0.1.0-alpha.4.14',
        latestDshVersion: '0.1.1-rc.2',
      },
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('fails closed for network errors, malformed tags, and oversized bodies', async () => {
    const rejected = vi.fn(async (): Promise<Response> => { throw new Error('network down') })
    await expect(checkForOpenAICodexUpdate({ currentVersion: '0.1.0-alpha.4.14', fetchImpl: rejected })).resolves.toMatchObject({
      status: 'unavailable',
      reason: 'registry-unavailable',
    })

    const malformed = vi.fn(async (): Promise<Response> => json({ latest: 'not-a-version', alpha: 42 }))
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
      currentDshVersion: '0.1.1-rc.2',
      latestVersion: '0.1.0-alpha.4.14',
      compatibility: {
        status: 'unverified',
        latestPluginVersion: '0.1.0-alpha.4.14',
        latestDshVersion: '0.1.1-rc.2',
      },
      credential: 'must not pass through',
    })).toEqual({
      status: 'up-to-date',
      currentVersion: '0.1.0-alpha.4.14',
      currentDshVersion: '0.1.1-rc.2',
      latestVersion: '0.1.0-alpha.4.14',
      compatibility: {
        status: 'unverified',
        latestPluginVersion: '0.1.0-alpha.4.14',
        latestDshVersion: '0.1.1-rc.2',
      },
    })
    expect(parseOpenAICodexUpdateResult({
      status: 'up-to-date',
      currentVersion: '0.1.0-alpha.4.14',
      currentDshVersion: 'not-a-version',
      latestVersion: '0.1.0-alpha.4.14',
      compatibility: { status: 'unverified', latestPluginVersion: '0.1.0-alpha.4.14' },
    })).toBeUndefined()
    expect(parseOpenAICodexUpdateResult({
      status: 'up-to-date',
      currentVersion: '0.1.0-alpha.4.14',
      latestVersion: '0.1.0-alpha.4.14',
      compatibility: {
        status: 'compatible',
        latestPluginVersion: '0.1.0-alpha.4.14',
        latestDshVersion: '0.1.1-rc.2',
      },
    })).toBeUndefined()
  })
})
