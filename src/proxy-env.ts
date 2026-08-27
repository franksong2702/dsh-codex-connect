/** Environment proxy discovery shared by the Host route and tests. */

import { isValidOpenAICodexProxyUrl } from './settings-contract.ts'

/** HTTPS candidates win because every first-party Codex endpoint is HTTPS. */
export const OPENAI_CODEX_PROXY_ENV_KEYS = [
  'HTTPS_PROXY',
  'https_proxy',
  'HTTP_PROXY',
  'http_proxy',
  'ALL_PROXY',
  'all_proxy',
] as const

/** Bounded localhost fallbacks retained from the upstream opt-in detector. */
export const OPENAI_CODEX_LOCAL_PROXY_CANDIDATES = [
  'http://127.0.0.1:7890',
  'http://127.0.0.1:7897',
  'http://127.0.0.1:10809',
] as const

/** Prevent environment input from turning Detect into an unbounded scan. */
export const OPENAI_CODEX_PROXY_CANDIDATE_LIMIT = 8

export type OpenAICodexProxyEnvironmentCandidate =
  | { detected: false }
  | { detected: true; source: string; valid: true; proxyUrl: string }
  | { detected: true; source: string; valid: false; reason: 'invalid-or-credentialed' }

export interface OpenAICodexProxyCandidate {
  source: string
  proxyUrl: string
}

/** Find the first non-empty standard proxy variable without activating it. */
export function detectOpenAICodexProxyEnvironment(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): OpenAICodexProxyEnvironmentCandidate {
  for (const source of OPENAI_CODEX_PROXY_ENV_KEYS) {
    const raw = environment[source]?.trim()
    if (raw === undefined || raw.length === 0) continue
    return isValidOpenAICodexProxyUrl(raw)
      ? { detected: true, source, valid: true, proxyUrl: raw }
      : { detected: true, source, valid: false, reason: 'invalid-or-credentialed' }
  }
  return { detected: false }
}

/**
 * Return a deterministic, bounded candidate set without touching settings.
 * Valid environment origins are ordered first, followed by the known local
 * ports. Duplicate origins are collapsed while retaining the first source.
 */
export function listOpenAICodexProxyCandidates(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): readonly OpenAICodexProxyCandidate[] {
  const candidates: OpenAICodexProxyCandidate[] = []
  const append = (source: string, raw: string | undefined): void => {
    const value = raw?.trim()
    if (value === undefined || value.length === 0 || !isValidOpenAICodexProxyUrl(value)) return
    const proxyUrl = new URL(value).origin
    if (candidates.some(candidate => candidate.proxyUrl === proxyUrl)) return
    candidates.push({ source, proxyUrl })
  }
  for (const source of OPENAI_CODEX_PROXY_ENV_KEYS) {
    append(source, environment[source])
    if (candidates.length >= OPENAI_CODEX_PROXY_CANDIDATE_LIMIT) return candidates
  }
  for (const proxyUrl of OPENAI_CODEX_LOCAL_PROXY_CANDIDATES) {
    append('local', proxyUrl)
    if (candidates.length >= OPENAI_CODEX_PROXY_CANDIDATE_LIMIT) break
  }
  return candidates
}
