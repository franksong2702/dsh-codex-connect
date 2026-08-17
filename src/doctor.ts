/** Secret-free diagnostics and duplicate-provider guidance. */

import { lstat } from 'node:fs/promises'
import { openAICodexAuthPath, OPENAI_CODEX_PROVIDER } from './store.ts'
import {
  detectCompatibility,
  type CompatibilityDetectionOptions,
  type CompatibilityReport,
} from './compatibility.ts'
export { CODEX_CONNECT_VERSION } from './version.ts'
import { CODEX_CONNECT_VERSION } from './version.ts'

/** Inputs that are safe to obtain without booting OAuth. */
export interface OpenAICodexDiagnosticOptions {
  /** Credential pathname to inspect through metadata only. */
  credentialPath?: string
  /** Provider ids already registered in the active Harness context. */
  providerIds?: readonly string[]
  /** Whether the optional standalone search provider is enabled. */
  enableSearch?: boolean
  /** Whether the optional image tool is enabled. */
  enableImageTool?: boolean
  /** Optional pure-function seam for compatibility checks in tests/diagnostic callers. */
  compatibilityOptions?: CompatibilityDetectionOptions
}

export interface OpenAICodexDiagnosticReport {
  package: 'dsh-codex-connect'
  version: string
  node: string
  credentialFile: {
    path: string
    state: 'missing' | 'owner-only' | 'permissions-too-broad' | 'not-a-regular-file' | 'unreadable-metadata'
    mode?: string
  }
  capabilities: {
    modelProvider: true
    search: boolean
    imageTool: boolean
    changesHarnessDefaultModel: false
    changesHarnessSearchRoute: false
  }
  providerConflict: boolean
  compatibility: CompatibilityReport
  hints: string[]
}

/** Actionable message for legacy/manual `openai-codex` adapter collisions. */
export function openAICodexConflictMessage(): string {
  return 'Codex Connect cannot register provider "openai-codex" because another adapter already owns it. '
    + 'Remove or disable the legacy dsh-codex bundle or manual openai-codex provider row, then restart Harness.'
}

/** Fail before the generic registry error so the collision has a migration hint. */
export function assertNoOpenAICodexProviderConflict(providerIds: readonly string[]): void {
  if (providerIds.includes(OPENAI_CODEX_PROVIDER)) throw new Error(openAICodexConflictMessage())
}

/**
 * Inspect only process and filesystem metadata. This function never opens the
 * OAuth document, refreshes a token, or starts an authorization flow.
 */
export async function diagnoseOpenAICodex(
  options: OpenAICodexDiagnosticOptions = {},
): Promise<OpenAICodexDiagnosticReport> {
  const path = options.credentialPath ?? openAICodexAuthPath()
  let state: OpenAICodexDiagnosticReport['credentialFile']['state'] = 'missing'
  let mode: string | undefined
  try {
    const info = await lstat(path)
    if (!info.isFile()) {
      state = 'not-a-regular-file'
    } else if (process.platform === 'win32') {
      state = 'owner-only'
    } else {
      mode = (info.mode & 0o777).toString(8).padStart(3, '0')
      state = (info.mode & 0o077) === 0 ? 'owner-only' : 'permissions-too-broad'
    }
  } catch (error: unknown) {
    state = (error as NodeJS.ErrnoException | null)?.code === 'ENOENT'
      ? 'missing'
      : 'unreadable-metadata'
  }

  const providerConflict = options.providerIds?.includes(OPENAI_CODEX_PROVIDER) ?? false
  const compatibility = await detectCompatibility(options.compatibilityOptions)
  const hints: string[] = []
  if (state === 'missing') hints.push('Sign in only when you are ready; installation does not start OAuth.')
  if (state === 'permissions-too-broad') hints.push(`Restrict the OAuth file to its owner before use (current mode ${mode}).`)
  if (state === 'not-a-regular-file') hints.push('Replace the OAuth path with an owner-only regular file created by Codex Connect login.')
  if (state === 'unreadable-metadata') hints.push('Harness could not inspect the OAuth file metadata; check the parent directory and file ownership.')
  if (providerConflict) hints.push(openAICodexConflictMessage())
  if (!providerConflict) hints.push('If Harness reports a duplicate openai-codex adapter, remove the legacy bundle or manual provider row.')
  if (compatibility.status === 'incompatible') {
    hints.push('Compatibility mismatch: install the declared DSH plugin API versions and pin @earendil-works/pi-ai to 0.82.1, then run doctor again; no files are changed automatically.')
  } else if (compatibility.status === 'unknown') {
    hints.push('Compatibility is unknown: verify the declared DSH plugin API and @earendil-works/pi-ai versions, then run doctor again.')
  }

  return {
    package: 'dsh-codex-connect',
    version: CODEX_CONNECT_VERSION,
    node: process.version,
    credentialFile: { path, state, ...mode === undefined ? {} : { mode } },
    capabilities: {
      modelProvider: true,
      search: options.enableSearch === true,
      imageTool: options.enableImageTool === true,
      changesHarnessDefaultModel: false,
      changesHarnessSearchRoute: false,
    },
    providerConflict,
    compatibility,
    hints,
  }
}
