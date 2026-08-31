/** Opt-in diagnostic for the hidden Codex approval reviewer. */

import { diagnoseOpenAICodex } from './doctor.ts'
import { normalizeOpenAICodexProxyUrl } from './settings-contract.ts'
import { OPENAI_CODEX_PROVIDER, OpenAICodexCredentialStore } from './store.ts'
import { CODEX_CONNECT_VERSION } from './version.ts'
import { CODEX_AUTO_REVIEW_MODEL, probeCodexAutoReview } from './auto-review-probe.ts'
import type { AutoReviewProbeEvidence, AutoReviewProbeRequest } from './auto-review-probe.ts'

type Status = 'supported' | 'rejected' | 'unknown'

interface Check {
  status: Status
  reason: string
  action: string
}

export interface AutoReviewProbeDependencies {
  diagnose: typeof diagnoseOpenAICodex
  credentials: Pick<OpenAICodexCredentialStore, 'read'>
  probe: (request: AutoReviewProbeRequest) => Promise<AutoReviewProbeEvidence>
  now: () => number
}

function check(status: Status, reason: string, action: string): Check {
  return { status, reason, action }
}

function observed(evidence: AutoReviewProbeEvidence): Check {
  switch (evidence.outcome) {
    case 'completed': return check('supported', 'completed-structured-review', 'The OAuth route accepted the hidden reviewer and returned its approval schema; this does not enable DSH approval integration.')
    case 'http-rejected': return check('rejected', `http-${String(evidence.httpStatus ?? 'rejected')}`, 'The supported OAuth route rejected this hidden reviewer request; keep automatic approval disabled.')
    case 'transient': return check('unknown', 'transient-or-redirect-response', 'Check network, quota, or service availability before explicitly retrying.')
    case 'incomplete': return check('unknown', 'no-complete-structured-review', 'HTTP success without one matching structured assessment is not capability evidence.')
    case 'timeout': return check('unknown', 'probe-deadline', 'The diagnostic exceeded its deadline; no approval capability was established.')
    case 'cancelled': return check('unknown', 'probe-cancelled', 'The diagnostic was cancelled; no approval capability was established.')
    case 'network-error': return check('unknown', 'network-or-stream-error', 'Check the network or pass an explicit --proxy; no server decision was confirmed.')
  }
}

/** Run the standalone reviewer probe without booting Harness or changing settings. */
export async function runAutoReviewProbeCommand(
  args: readonly string[],
  deps: AutoReviewProbeDependencies = {
    diagnose: diagnoseOpenAICodex,
    credentials: new OpenAICodexCredentialStore(),
    probe: probeCodexAutoReview,
    now: Date.now,
  },
): Promise<number> {
  let json = false
  let proxyUrl: string | undefined
  let timeoutMs = 30_000
  const seen = new Set<string>()
  const invalid = (): number => {
    process.stderr.write('Usage: dsh-codex-connect auto-review-probe [--proxy <http(s)-origin>] [--timeout-ms <1..60000>] [--json]\n')
    return 2
  }
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index]!
    if (seen.has(flag)) return invalid()
    seen.add(flag)
    if (flag === '--json') json = true
    else if (flag === '--proxy' || flag === '--timeout-ms') {
      const value = args[++index]
      if (value === undefined || value.startsWith('--')) return invalid()
      if (flag === '--proxy') {
        proxyUrl = normalizeOpenAICodexProxyUrl(value)
        if (proxyUrl === undefined) return invalid()
      } else {
        if (!/^\d+$/u.test(value) || Number(value) < 1 || Number(value) > 60_000) return invalid()
        timeoutMs = Number(value)
      }
    } else return invalid()
  }

  const local = await deps.diagnose()
  const runtime = local.compatibility.status === 'compatible'
    ? check('supported', 'declared-host-versions-match', 'Installed package versions satisfy the probe prerequisites; this is not active-profile validation.')
    : check(local.compatibility.status === 'incompatible' ? 'rejected' : 'unknown', 'runtime-compatibility-unavailable', 'Install the supported Codex Connect and DSH package set before probing.')
  let oauth = local.credentialFile.state === 'owner-only'
    ? check('unknown', 'credential-metadata-only', 'An owner-only file does not prove authorization; the explicit probe reads its unexpired stored credential.')
    : check('rejected', 'credential-file-unusable', 'Sign in or repair the owner-only credential file before probing.')
  let reviewer = check('unknown', 'not-probed', 'Run this command explicitly only when one fixed diagnostic request is acceptable.')
  let probe: { state: 'skipped' | 'fresh'; httpStatus?: number } = { state: 'skipped' }

  if (runtime.status === 'supported' && oauth.status !== 'rejected') {
    let credential
    try {
      credential = await deps.credentials.read(OPENAI_CODEX_PROVIDER)
    } catch {
      oauth = check('rejected', 'credential-unreadable', 'Repair the credential file or sign in again; diagnostic output omits parser details.')
    }
    if (credential?.type !== 'oauth' || typeof credential.accountId !== 'string') {
      if (oauth.reason !== 'credential-unreadable') oauth = check('rejected', 'credential-missing', 'Sign in before explicitly probing the hidden reviewer.')
    } else if (credential.expires <= deps.now()) {
      oauth = check('unknown', 'access-token-expired', 'Use the normal sign-in or refresh flow, then repeat the probe; diagnostics never refresh credentials.')
    } else {
      let evidence: AutoReviewProbeEvidence
      try {
        evidence = await deps.probe({ access: credential.access, accountId: credential.accountId, proxyUrl, timeoutMs })
      } catch {
        // A provider or dispatcher failure can include credentials or response text.
        evidence = { outcome: 'network-error' }
      }
      probe = { state: 'fresh', ...evidence.httpStatus === undefined ? {} : { httpStatus: evidence.httpStatus } }
      reviewer = observed(evidence)
      if (evidence.outcome === 'completed') oauth = check('supported', 'authorized-completed-review', 'Authorization succeeded for this fixed reviewer request at the recorded time only.')
      else if (evidence.httpStatus === 401) oauth = check('rejected', 'http-401', 'Sign in again, then explicitly repeat the probe.')
    }
  }

  const report = {
    schemaVersion: 1,
    package: 'dsh-codex-connect',
    version: CODEX_CONNECT_VERSION,
    scope: 'auto-review-route-only',
    model: CODEX_AUTO_REVIEW_MODEL,
    network: proxyUrl === undefined ? 'direct' : 'explicit-proxy',
    checks: { runtime, oauth, reviewer },
    probe,
  }
  process.stdout.write(json ? `${JSON.stringify(report)}\n` : [
    `Codex Connect ${report.version}: hidden approval-review capability probe`,
    'Scope: one synthetic no-op; no command is executed and no approval integration is enabled.',
    `Model: ${report.model}; network: ${report.network}; probe: ${report.probe.state}`,
    ...Object.entries(report.checks).map(([id, value]) => `${id}: ${value.status} (${value.reason})\n  ${value.action}`),
    '',
  ].join('\n'))
  const primary = [runtime, oauth, reviewer]
  return primary.some(value => value.status === 'rejected') ? 1 : primary.some(value => value.status === 'unknown') ? 2 : 0
}
