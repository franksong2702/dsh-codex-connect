/** Evidence-scoped diagnostics, separate from model routing and durable sessions. */

import { createHash } from 'node:crypto'
import { openAICodexModelCatalog, OPENAI_CODEX_TRANSPORT } from './adapter.ts'
import { evaluateCompatibility, DSH_PLUGIN_API_PACKAGES, readInstalledPackageVersion, SUPPORTED_DSH_PLUGIN_API_VERSION } from './compatibility.ts'
import { diagnoseOpenAICodex } from './doctor.ts'
import { probeCodexResponses } from './capability-probe.ts'
import type { ResponsesProbeEvidence, ResponsesProbeRequest } from './capability-probe.ts'
import { OPENAI_CODEX_PROVIDER, OpenAICodexCredentialStore } from './store.ts'
import { CODEX_CONNECT_VERSION } from './version.ts'

/** A result applies only to its named check and evidence, not all provider features. */
export type CapabilityStatus = 'supported' | 'rejected' | 'unknown'

/** Stable checks in the copyable standalone report. */
export type CapabilityId = 'runtime' | 'oauth' | 'responses' | 'transport' | 'model' | 'providerFallback' | 'contextManagement' | 'continuation' | 'nativeCompaction' | 'websocketReuse'

/** Actionable evidence with no arbitrary provider strings. */
export interface CapabilityResult {
  status: CapabilityStatus
  reason: string
  action: string
}

/** Standalone report; it does not inspect a running profile's settings or session. */
export interface CapabilityReport {
  schemaVersion: 1
  package: 'dsh-codex-connect'
  version: string
  scope: 'standalone-route-only'
  model: string | null
  network: 'direct' | 'explicit-proxy'
  versions: Record<string, string | null>
  checks: Record<CapabilityId, CapabilityResult>
  probe: { state: 'not-requested' | 'skipped' | 'fresh' | 'cached'; observedAt?: number; httpStatus?: number }
}

/** Fully resolved command policy; network work requires explicit opt-in. */
export interface CapabilityRequest {
  model: string | undefined
  probe: boolean
  proxyUrl: string | undefined
  timeoutMs: number
}

/** Local metadata and I/O operations; callers must not supply untrusted callbacks. */
export interface CapabilityDiagnosticDependencies {
  diagnose: typeof diagnoseOpenAICodex
  readVersion: typeof readInstalledPackageVersion
  catalog: typeof openAICodexModelCatalog
  credentials: Pick<OpenAICodexCredentialStore, 'read'>
  probe: (request: ResponsesProbeRequest) => Promise<ResponsesProbeEvidence>
  now: () => number
}

function result(status: CapabilityStatus, reason: string, action: string): CapabilityResult {
  return { status, reason, action }
}

function safeVersion(value: string | null | undefined): string | null {
  return value !== null && value !== undefined && /^v?\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/u.test(value) ? value : null
}

function observed(evidence: ResponsesProbeEvidence): CapabilityResult {
  switch (evidence.outcome) {
    case 'completed': return result('supported', 'completed-response-for-selected-model', 'This proves only the fixed standalone prompt; test the active Harness profile separately.')
    case 'http-rejected': {
      switch (evidence.httpStatus) {
        case 401: return result('rejected', 'http-401', 'Sign in again, then explicitly repeat the probe.')
        case 403: return result('rejected', 'http-403', 'Check account, model, and network access policy; signing in may not resolve a policy denial.')
        case 404: return result('rejected', 'http-404', 'The selected route was not found; check endpoint availability and plugin updates.')
        default: return result('rejected', 'request-rejected', 'The server rejected this diagnostic request; check the selected model and request compatibility. No optional capability was tested.')
      }
    }
    case 'transient': return result('unknown', 'transient-or-redirect-response', 'Check network, proxy, quota, or server availability before retrying; no provider fallback was attempted.')
    case 'incomplete': return result('unknown', 'no-complete-matching-response', 'HTTP success or schema recognition is insufficient; repeat the probe after checking the endpoint and selected model.')
    case 'timeout': return result('unknown', 'probe-deadline', 'The probe exceeded its deadline and may have consumed quota; check the network before retrying.')
    case 'network-error': return result('unknown', 'network-or-stream-error', 'Check the network or pass an explicit --proxy; no server rejection was confirmed.')
  }
}

/**
 * Reusable diagnostic operation with a single-entry, lazy-expiring memory cache.
 * It registers no background hooks, expiry timers, or model-visible session events.
 * The network provider owns its request deadline and connection cleanup.
 * Cache identity includes credentials, model, network policy, and installed versions.
 */
export class CodexCapabilityDiagnostics {
  private cache: { key: string; observedAt: number; evidence: ResponsesProbeEvidence } | undefined

  /**
   * @param cacheTtlMs - finite cache lifetime; zero disables reuse, maximum 60 seconds.
   * @param deps - owned metadata and probe operations; defaults perform local reads only until requested.
   */
  constructor(
    private readonly cacheTtlMs: number,
    private readonly deps: CapabilityDiagnosticDependencies = {
      diagnose: diagnoseOpenAICodex,
      readVersion: readInstalledPackageVersion,
      catalog: openAICodexModelCatalog,
      credentials: new OpenAICodexCredentialStore(),
      probe: probeCodexResponses,
      now: Date.now,
    },
  ) {
    if (!Number.isFinite(cacheTtlMs) || cacheTtlMs < 0 || cacheTtlMs > 60_000) throw new TypeError('Diagnostic cache lifetime must be between 0 and 60000 ms')
  }

  /**
   * Read metadata; optionally send one fixed request using an unexpired stored token.
   * No credential refresh/write occurs. Unsupported local versions prevent probing.
   * @param request - resolved command arguments, with explicit network consent.
   * @returns a secret-free report whose unknown entries never authorize a capability.
   */
  async inspect(request: CapabilityRequest): Promise<CapabilityReport> {
    const local = await this.deps.diagnose()
    const versions: Record<string, string | null> = { node: safeVersion(local.node) }
    for (const [name, entry] of Object.entries(local.compatibility.packages)) versions[name] = safeVersion(entry.installed)
    for (const name of DSH_PLUGIN_API_PACKAGES) versions[name] = safeVersion(await this.deps.readVersion(name))
    const compatibility = evaluateCompatibility({ nodeVersion: versions['node'] ?? null, packageVersions: versions })
    const missing = Object.values(versions).some(value => value === null)
      || !/^v?\d+\.\d+\.\d+$/u.test(versions['node'] ?? '')
    const mismatch = DSH_PLUGIN_API_PACKAGES.some(name => versions[name] !== null && versions[name] !== SUPPORTED_DSH_PLUGIN_API_VERSION)
      || compatibility.status === 'incompatible'
    const runtime = mismatch
      ? result('rejected', 'declared-version-mismatch', 'Use DSH API 0.1.2-rc.1 and pi-ai ^0.84.2 together. DSH 0.1.0-rc.7 requires Codex Connect 0.1.0-alpha.4.14.')
      : missing || compatibility.status === 'unknown'
        ? result('unknown', 'version-metadata-unavailable', 'Run this command from the plugin installation in the intended profile.')
        : result('supported', 'declared-host-versions-match', 'Host package versions satisfy the declared requirements; this is not a live profile or browser compatibility test.')
    const model = this.deps.catalog().find(item => item.id === request.model)?.id ?? null
    const unknownNetwork = result('unknown', 'not-probed', 'Run capabilities --model <catalog-id> --probe explicitly; this sends a fixed short request and may consume quota.')
    const checks: CapabilityReport['checks'] = {
      runtime,
      oauth: local.credentialFile.state === 'owner-only'
        ? result('unknown', 'credential-metadata-only', 'A private credential file does not prove authorization; use an explicit probe.')
        : result('rejected', 'credential-file-unusable', 'Sign in or repair owner-only credential-file permissions; no credential content was read.'),
      responses: { ...unknownNetwork },
      transport: result('unknown', `configured-${OPENAI_CODEX_TRANSPORT}-not-probed`, unknownNetwork.action),
      model: model === null
        ? result(request.model === undefined ? 'unknown' : 'rejected', 'model-not-selected-from-catalog', 'Select an exact model id from the installed Codex provider catalog; unknown ids are not probed.')
        : result('unknown', 'catalog-is-not-entitlement', unknownNetwork.action),
      providerFallback: result('rejected', 'no-automatic-provider-failover', 'Select another provider explicitly. SSE is already selected; WebSocket-to-SSE fallback is inactive. Authentication, request, and partial-stream errors do not authorize provider switching.'),
      contextManagement: result('unknown', 'no-successful-optional-operation', 'Schema recognition is not capability evidence; keep optional context management disabled.'),
      continuation: result('unknown', 'no-continuation-round-trip', 'A stateless probe does not verify continuation, Fork, or restart; retain Harness-owned history.'),
      nativeCompaction: result('rejected', 'no-native-compaction-integration', 'Keep Harness text-summary compaction; track the typed-operation and durable-replay prerequisites in Issue #65.'),
      websocketReuse: result('rejected', 'finite-sse-policy', 'Keep finite SSE selected; cached WebSocket lifecycle work is outside this diagnostic.'),
    }
    const report: CapabilityReport = {
      schemaVersion: 1, package: 'dsh-codex-connect', version: CODEX_CONNECT_VERSION,
      scope: 'standalone-route-only', model, network: request.proxyUrl === undefined ? 'direct' : 'explicit-proxy',
      versions, checks, probe: { state: request.probe ? 'skipped' : 'not-requested' },
    }
    if (runtime.status !== 'supported' || model === null || checks.oauth.status === 'rejected') {
      this.cache = undefined
      return report
    }
    if (!request.probe) return report
    let credential
    try {
      credential = await this.deps.credentials.read(OPENAI_CODEX_PROVIDER)
    } catch {
      // Credential parser errors may include a private pathname or untrusted field value.
      checks.oauth = result('rejected', 'credential-unreadable', 'Repair the credential file or sign in again; diagnostic output omits parser details.')
      this.cache = undefined
      return report
    }
    if (credential?.type !== 'oauth' || typeof credential.accountId !== 'string') {
      checks.oauth = result('rejected', 'credential-missing', 'Sign in before explicitly probing the route.')
      this.cache = undefined
      return report
    }
    if (credential.expires <= this.deps.now()) {
      checks.oauth = result('unknown', 'access-token-expired', 'Use the normal sign-in or refresh flow, then repeat the probe; diagnostics never refresh or write credentials.')
      this.cache = undefined
      return report
    }
    const key = createHash('sha256').update(JSON.stringify([credential.access, credential.accountId, model, request.proxyUrl, request.timeoutMs, versions])).digest('hex')
    const cached = this.cache
    const age = cached === undefined ? Infinity : this.deps.now() - cached.observedAt
    let evidence: ResponsesProbeEvidence
    if (cached?.key === key && age >= 0 && age < this.cacheTtlMs) {
      evidence = cached.evidence
      report.probe = { state: 'cached', observedAt: cached.observedAt }
    } else {
      this.cache = undefined
      evidence = await this.deps.probe({ model, access: credential.access, accountId: credential.accountId, proxyUrl: request.proxyUrl, timeoutMs: request.timeoutMs })
      const observedAt = this.deps.now()
      report.probe = { state: 'fresh', observedAt }
      if (evidence.outcome === 'completed' || evidence.outcome === 'http-rejected') this.cache = { key, observedAt, evidence }
    }
    if (evidence.httpStatus !== undefined) report.probe.httpStatus = evidence.httpStatus
    checks.responses = observed(evidence)
    checks.transport = { ...checks.responses }
    if (evidence.outcome === 'completed') {
      checks.oauth = result('supported', 'authorized-completed-response', 'Authorization succeeded for this model and fixed request at the recorded time only.')
      checks.model = { ...checks.responses }
    } else if (evidence.httpStatus === 401 || evidence.httpStatus === 403) {
      checks.oauth = { ...checks.responses }
    }
    return report
  }
}
