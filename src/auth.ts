/**
 * OpenAI Codex OAuth orchestration shared by the plugin and standalone launcher.
 * @module dsh-codex-connect/auth
 */

import { createModels } from '@earendil-works/pi-ai'
import type { AuthInteraction } from '@earendil-works/pi-ai'
import { openaiCodexProvider } from '@earendil-works/pi-ai/providers/openai-codex'
import { withOpenAICodexProxy } from './provider-proxy.ts'
import type { OpenAICodexProxyRunner } from './provider-proxy.ts'
import { OpenAICodexCredentialStore, OPENAI_CODEX_PROVIDER } from './store.ts'

/** Non-secret login state shown by the launcher. */
export interface OpenAICodexAuthStatus {
  /** Whether a stored OAuth credential exists. */
  authenticated: boolean
  /** Access-token expiry time; refresh is automatic on the next request. */
  expiresAt?: Date
}

/**
 * Complete provider-native OAuth and persist the resulting credential.
 * @param interaction - terminal or UI callbacks for the provider flow.
 * @param store - credential store, defaulting under `$DSH_HOME`.
 */
export async function loginOpenAICodex(
  interaction: AuthInteraction,
  store: OpenAICodexCredentialStore = new OpenAICodexCredentialStore(),
  proxy?: OpenAICodexProxyRunner,
): Promise<void> {
  const models = createModels({ credentials: store })
  models.setProvider(openaiCodexProvider())
  await withOpenAICodexProxy(
    proxy,
    () => models.login(OPENAI_CODEX_PROVIDER, 'oauth', interaction),
  )
}

/**
 * Remove the stored OpenAI Codex credential.
 * @param store - credential store, defaulting under `$DSH_HOME`.
 */
export async function logoutOpenAICodex(
  store: OpenAICodexCredentialStore = new OpenAICodexCredentialStore(),
): Promise<void> {
  await store.delete(OPENAI_CODEX_PROVIDER)
}

/**
 * Read non-secret OpenAI Codex login state without refreshing the token.
 * @param store - credential store, defaulting under `$DSH_HOME`.
 * @returns stored login state and expiry.
 */
export async function openAICodexAuthStatus(
  store: OpenAICodexCredentialStore = new OpenAICodexCredentialStore(),
): Promise<OpenAICodexAuthStatus> {
  const credential = await store.read(OPENAI_CODEX_PROVIDER)
  return credential?.type === 'oauth'
    ? { authenticated: true, expiresAt: new Date(credential.expires) }
    : { authenticated: false }
}
