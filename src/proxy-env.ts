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

export type OpenAICodexProxyEnvironmentCandidate =
  | { detected: false }
  | { detected: true; source: string; valid: true; proxyUrl: string }
  | { detected: true; source: string; valid: false; reason: 'invalid-or-credentialed' }

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
